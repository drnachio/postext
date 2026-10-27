// Inlining font files into an SVG as @font-face rules: format sniffing,
// base64, planning and the async / sync entry points.
import { type SvgFontScan, scanSvgFonts, ALL_FORMATS } from './scan.js';
import { type SvgFontFormat, type SvgFontStyle, type InlineSvgFontsOptions, type SvgFontInlining, DEFAULT_SVG_FONT_MAX_BYTES, type SvgFontFaceReport, type SvgFontProvider, type SvgFontSyncProvider } from './types.js';

// ------------------------------------------------------------ files

/** The format of a font file from its first bytes; null for one an
 *  `@font-face` cannot carry (a collection, an unknown file). */
export function sniffFontFormat(bytes: Uint8Array): SvgFontFormat | null {
  if (bytes.length < 4) return null;
  const tag = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (tag === 'wOF2') return 'woff2';
  if (tag === 'wOFF') return 'woff';
  if (tag === 'OTTO') return 'otf';
  if (tag === 'true' || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) return 'ttf';
  return null;
}

const MIME: Record<SvgFontFormat, string> = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' };
const CSS_FORMAT: Record<SvgFontFormat, string> = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };

const base64Cache = new WeakMap<Uint8Array, string>();

function toBase64(bytes: Uint8Array): string {
  const cached = base64Cache.get(bytes);
  if (cached !== undefined) return cached;
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  const out = btoa(binary);
  base64Cache.set(bytes, out);
  return out;
}

/** One `@font-face` rule with the file as a data URI. */
export function fontFaceRule(family: string, weight: number | string, style: SvgFontStyle, bytes: Uint8Array, format: SvgFontFormat = sniffFontFormat(bytes) ?? 'ttf'): string {
  const name = family.replace(/["\\]/g, '');
  return `@font-face{font-family:"${name}";font-weight:${weight};font-style:${style};`
    + `src:url(data:${MIME[format]};base64,${toBase64(bytes)}) format("${CSS_FORMAT[format]}")}`;
}

/** Insert `css` as a `<style>` right after the root `<svg …>` start tag.
 *  Pure; the markup is returned unchanged when there is no root tag (or
 *  an empty self-closing one, which has no text). */
export function injectSvgStyle(svgText: string, css: string): string {
  if (!css) return svgText;
  const m = /<(?:[a-zA-Z_][\w.-]*:)?svg\b(?:[^>"']|"[^"]*"|'[^']*')*?(\/?)>/.exec(svgText);
  if (!m || m[1] === '/') return svgText;
  const at = m.index + m[0].length;
  const cdata = `<![CDATA[${css.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
  return `${svgText.slice(0, at)}<style type="text/css">${cdata}</style>${svgText.slice(at)}`;
}

// ------------------------------------------------------------ inlining

/** A face to look up: its key, and the characters every request that may
 *  set text in it asks for. */
interface FaceJob {
  family: string;
  weight: number;
  style: SvgFontStyle;
  codePoints: Set<number>;
}

const faceKey = (family: string, weight: number, style: SvgFontStyle): string => `${family.toLowerCase()}|${weight}|${style}`;

/** The plan of an inlining: the faces to look up, then (given their
 *  files) the CSS and the report. Shared by the async and sync paths. */
function planInlining(svgText: string): { scan: SvgFontScan; jobs: Map<string, FaceJob> } {
  const scan = scanSvgFonts(svgText);
  const jobs = new Map<string, FaceJob>();
  for (const req of scan.requests) {
    if (req.families.some((f) => scan.declared.has(f.toLowerCase()))) continue;
    for (const family of req.families) {
      const key = faceKey(family, req.weight, req.style);
      let job = jobs.get(key);
      if (!job) {
        job = { family, weight: req.weight, style: req.style, codePoints: new Set() };
        jobs.set(key, job);
      }
      for (const cp of req.codePoints) job.codePoints.add(cp);
    }
  }
  return { scan, jobs };
}

function asFiles(answer: Uint8Array | Uint8Array[] | null | undefined, formats: readonly SvgFontFormat[]): { bytes: Uint8Array; format: SvgFontFormat }[] {
  const list = Array.isArray(answer) ? answer : answer ? [answer] : [];
  const out: { bytes: Uint8Array; format: SvgFontFormat }[] = [];
  for (const bytes of list) {
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) continue;
    const format = sniffFontFormat(bytes);
    if (format && formats.includes(format)) out.push({ bytes, format });
  }
  return out;
}

function finishInlining(
  svgText: string,
  plan: { scan: SvgFontScan; jobs: Map<string, FaceJob> },
  files: Map<string, { bytes: Uint8Array; format: SvgFontFormat }[]>,
  withheldFamilies: Set<string>,
  options: InlineSvgFontsOptions | undefined,
  standIns: ReadonlyMap<string, string> = new Map(),
): SvgFontInlining {
  const maxBytes = options?.maxBytes ?? DEFAULT_SVG_FONT_MAX_BYTES;
  const faces: SvgFontFaceReport[] = [];
  const reported = new Set<string>();
  const report = (r: SvgFontFaceReport): void => {
    const key = faceKey(r.family, r.weight, r.style);
    if (reported.has(key)) return;
    reported.add(key);
    faces.push(r);
  };
  /** Faces chosen to embed, in order. */
  const chosen: { family: string; weight: number; style: SvgFontStyle; files: { bytes: Uint8Array; format: SvgFontFormat }[] }[] = [];
  const chosenKeys = new Set<string>();
  const unavailable: SvgFontFaceReport[] = [];
  for (const req of plan.scan.requests) {
    const declared = req.families.find((f) => plan.scan.declared.has(f.toLowerCase()));
    if (declared) {
      report({ family: declared, weight: req.weight, style: req.style, status: 'declared' });
      continue;
    }
    let resolved = false;
    for (const family of req.families) {
      if (withheldFamilies.has(family.toLowerCase())) {
        report({ family, weight: req.weight, style: req.style, status: 'withheld' });
        continue;
      }
      const key = faceKey(family, req.weight, req.style);
      const found = files.get(key);
      if (!found || found.length === 0) continue;
      if (!chosenKeys.has(key)) {
        chosenKeys.add(key);
        chosen.push({ family, weight: req.weight, style: req.style, files: found });
        const stands = standIns.get(family.toLowerCase());
        report({ family, weight: req.weight, style: req.style, status: 'inlined', ...(stands ? { standIn: stands } : {}) });
      }
      resolved = true;
      break;
    }
    if (!resolved && !req.families.some((f) => withheldFamilies.has(f.toLowerCase()))) {
      const first = req.families[0]!;
      const key = faceKey(first, req.weight, req.style);
      if (!reported.has(key)) unavailable.push({ family: first, weight: req.weight, style: req.style, status: 'unavailable' });
      report({ family: first, weight: req.weight, style: req.style, status: 'unavailable' });
    }
  }

  // One rule per distinct file of a family: a file the provider answered
  // for several weights (the nearest it has) is embedded once, declared
  // for the range of weights it stands for.
  const rules: { family: string; weights: number[]; style: SvgFontStyle; bytes: Uint8Array; format: SvgFontFormat }[] = [];
  for (const face of chosen) {
    for (const file of face.files) {
      const same = rules.find((r) => r.bytes === file.bytes && r.style === face.style && r.family.toLowerCase() === face.family.toLowerCase());
      if (same) {
        if (!same.weights.includes(face.weight)) same.weights.push(face.weight);
      } else {
        rules.push({ family: face.family, weights: [face.weight], style: face.style, bytes: file.bytes, format: file.format });
      }
    }
  }
  const total = rules.reduce((sum, r) => sum + r.bytes.length, 0);
  const sizeOf = (face: { family: string; weight: number; style: SvgFontStyle; files: { bytes: Uint8Array }[] }) => ({
    bytes: face.files.reduce((s, f) => s + f.bytes.length, 0),
    files: face.files.length,
  });
  for (const w of unavailable) options?.onWarning?.({ kind: 'svgFontUnavailable', family: w.family, weight: w.weight, style: w.style });
  const tooLarge = total > maxBytes;
  for (const face of chosen) {
    const r = faces.find((f) => f.status === 'inlined' && faceKey(f.family, f.weight, f.style) === faceKey(face.family, face.weight, face.style));
    if (r) Object.assign(r, { status: tooLarge ? 'tooLarge' as const : 'inlined' as const, ...sizeOf(face) });
  }
  if (tooLarge) {
    options?.onWarning?.({ kind: 'svgFontsTooLarge', bytes: total, maxBytes });
    return { svg: svgText, faces, bytes: 0 };
  }
  if (rules.length === 0) return { svg: svgText, faces, bytes: 0 };
  const css = rules.map((r) => {
    const lo = Math.min(...r.weights);
    const hi = Math.max(...r.weights);
    return fontFaceRule(r.family, lo === hi ? lo : `${lo} ${hi}`, r.style, r.bytes, r.format);
  }).join('');
  return { svg: injectSvgStyle(svgText, css), faces, bytes: total };
}

/** The families `withhold` names that have no stand-in (told to
 *  `onWithheld`), and those that have one, by lower-case name, with the
 *  family that stands in for them (#993). */
function withheldOf(jobs: Map<string, FaceJob>, options: InlineSvgFontsOptions | undefined): { withheld: Set<string>; standIns: Map<string, string> } {
  const withheld = new Set<string>();
  const standIns = new Map<string, string>();
  if (!options?.withhold) return { withheld, standIns };
  for (const job of jobs.values()) {
    const lower = job.family.toLowerCase();
    if (withheld.has(lower) || standIns.has(lower) || !options.withhold(job.family)) continue;
    const stands = options.standIn?.(job.family)?.trim();
    if (stands && stands.toLowerCase() !== lower) {
      standIns.set(lower, stands);
      continue;
    }
    withheld.add(lower);
    options.onWithheld?.(job.family);
  }
  return { withheld, standIns };
}

/** The name a face is looked up under: its stand-in's for a family left to
 *  one. */
function askedFamily(job: FaceJob, standIns: ReadonlyMap<string, string>): string {
  return standIns.get(job.family.toLowerCase()) ?? job.family;
}

/** A family whose stand-in the provider has no face of, for some of the
 *  faces the SVG asks, is left out whole (as if it had none): a picture
 *  set half in the open face and half in the reader's is worse than either.
 *  Told to `onWithheld` like any family left out. */
function settleStandIns(
  jobs: Map<string, FaceJob>,
  files: Map<string, { bytes: Uint8Array; format: SvgFontFormat }[]>,
  standIns: Map<string, string>,
  withheld: Set<string>,
  options: InlineSvgFontsOptions | undefined,
): void {
  for (const lower of [...standIns.keys()]) {
    const mine = [...jobs].filter(([, job]) => job.family.toLowerCase() === lower);
    if (mine.every(([key]) => (files.get(key)?.length ?? 0) > 0)) continue;
    for (const [key] of mine) files.delete(key);
    standIns.delete(lower);
    withheld.add(lower);
    options?.onWithheld?.(mine[0]![1].family);
  }
}

/**
 * Embed the faces an SVG's text asks for (see the module comment), with
 * a report of each face. The provider is asked once per face, with the
 * characters the SVG sets in it; a face it rejects falls through the
 * run's `font-family` list, and a run none of whose families has a face
 * is reported as `svgFontUnavailable`.
 */
export async function inlineSvgFontsDetailed(
  svgText: string,
  provider: SvgFontProvider,
  options?: InlineSvgFontsOptions,
): Promise<SvgFontInlining> {
  const plan = planInlining(svgText);
  if (plan.scan.requests.length === 0) return { svg: svgText, faces: [], bytes: 0 };
  const { withheld, standIns } = withheldOf(plan.jobs, options);
  const formats = options?.formats ?? ALL_FORMATS;
  const files = new Map<string, { bytes: Uint8Array; format: SvgFontFormat }[]>();
  await Promise.all([...plan.jobs].map(async ([key, job]) => {
    if (withheld.has(job.family.toLowerCase())) return;
    const answer = await provider(askedFamily(job, standIns), job.weight, job.style, { codePoints: job.codePoints }).catch(() => null);
    files.set(key, asFiles(answer, formats));
  }));
  settleStandIns(plan.jobs, files, standIns, withheld, options);
  return finishInlining(svgText, plan, files, withheld, options, standIns);
}

/** {@link inlineSvgFontsDetailed} from a provider that answers from
 *  memory, for hosts that build their URLs synchronously
 *  (`bundleImageUrl`, `renderToHtml`). */
export function inlineSvgFontsDetailedSync(
  svgText: string,
  provider: SvgFontSyncProvider,
  options?: InlineSvgFontsOptions,
): SvgFontInlining {
  const plan = planInlining(svgText);
  if (plan.scan.requests.length === 0) return { svg: svgText, faces: [], bytes: 0 };
  const { withheld, standIns } = withheldOf(plan.jobs, options);
  const formats = options?.formats ?? ALL_FORMATS;
  const files = new Map<string, { bytes: Uint8Array; format: SvgFontFormat }[]>();
  for (const [key, job] of plan.jobs) {
    if (withheld.has(job.family.toLowerCase())) continue;
    let answer: Uint8Array | Uint8Array[] | null | undefined = null;
    try {
      answer = provider(askedFamily(job, standIns), job.weight, job.style, { codePoints: job.codePoints });
    } catch {
      answer = null;
    }
    files.set(key, asFiles(answer, formats));
  }
  settleStandIns(plan.jobs, files, standIns, withheld, options);
  return finishInlining(svgText, plan, files, withheld, options, standIns);
}

/** Embed the faces an SVG's text asks for as `@font-face` data URIs and
 *  return the markup (see {@link inlineSvgFontsDetailed}). */
export async function inlineSvgFonts(svgText: string, provider: SvgFontProvider, options?: InlineSvgFontsOptions): Promise<string> {
  return (await inlineSvgFontsDetailed(svgText, provider, options)).svg;
}

/** {@link inlineSvgFonts} from a provider that answers from memory. */
export function inlineSvgFontsSync(svgText: string, provider: SvgFontSyncProvider, options?: InlineSvgFontsOptions): string {
  return inlineSvgFontsDetailedSync(svgText, provider, options).svg;
}

/** Providers tried in order: the first that answers wins. */
export function chainSvgFontProviders(...providers: (SvgFontProvider | null | undefined)[]): SvgFontProvider {
  const list = providers.filter((p): p is SvgFontProvider => !!p);
  return async (family, weight, style, request) => {
    let last: unknown = new Error(`No face for "${family}"`);
    for (const p of list) {
      try {
        const answer = await p(family, weight, style, request);
        if (Array.isArray(answer) ? answer.length > 0 : answer && answer.length > 0) return answer;
      } catch (err) {
        last = err;
      }
    }
    throw last;
  };
}
