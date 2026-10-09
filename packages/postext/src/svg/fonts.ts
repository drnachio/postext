// The document's fonts inside SVG pictures (#630).
//
// An SVG is shown through an image (`<img>`, a canvas `drawImage`, an EPUB
// picture), and an image document cannot see the page's web fonts, so
// `<text font-family="IBM Plex Sans">` falls back to a system face. Before
// an SVG is decoded or handed out as a URL, the faces its text runs ask for
// are embedded in it: one `@font-face` per font file, its bytes as a data
// URI, in a `<style>` right after the root start tag.
//
//   svgFontRequests(svg)                    the (families, weight, style)
//                                           each run asks for, with its
//                                           characters
//   inlineSvgFonts(svg, provider, opts)     embed the faces a provider
//                                           answers (async)
//   inlineSvgFontsSync(svg, provider, opts) the same from bytes in memory
//
// The provider has the contract of postext-pdf's `PdfFontProvider`, so one
// provider serves both: it is told the characters each face sets and may
// answer with only the unicode-range slices that hold them (Fontsource and
// Google Fonts serve a family as several such files). A family the SVG
// declares itself with `@font-face` is left alone. Inlining happens at
// decode or export time only, never into the stored resource bytes, and a
// family `withhold` names (not redistributable) stays out of anything that
// leaves the app.
//
// Single ink recolours the markup first (applySingleInkToSvg), then the
// faces are inlined: recolour → inline.

/** `'normal'` or `'italic'` (CSS `oblique` is set as italic). */
export type SvgFontStyle = 'normal' | 'italic';

/** The font file formats an `@font-face` in an SVG image can carry. */
export type SvgFontFormat = 'woff2' | 'woff' | 'ttf' | 'otf';

/** What a run of an SVG's text asks for: the named families of its
 *  `font-family` list in order (generic families such as `sans-serif` left
 *  out), its weight and style, and the characters it sets. Runs with the
 *  same list, weight and style are one request. */
export interface SvgFontRequest {
  families: string[];
  weight: number;
  style: SvgFontStyle;
  /** Unicode code points of the run's text (a space always included). */
  codePoints: Set<number>;
}

/** What a provider is told about a face: the characters the SVG sets in
 *  it (postext-pdf's `PdfFontRequest`). */
export interface SvgFontProviderRequest {
  codePoints: ReadonlySet<number>;
}

/** The bytes of a face: one file, or the several files (unicode-range
 *  slices) that hold the characters asked for. Reject for a face the
 *  provider cannot supply. Same contract as postext-pdf's
 *  `PdfFontProvider`, which can be passed as it is. */
export type SvgFontProvider = (
  family: string,
  weight: number,
  style: SvgFontStyle,
  request?: SvgFontProviderRequest,
) => Promise<Uint8Array | Uint8Array[]>;

/** A provider that answers from bytes in memory: nothing (`null` /
 *  `undefined`) for a face it does not hold. */
export type SvgFontSyncProvider = (
  family: string,
  weight: number,
  style: SvgFontStyle,
  request?: SvgFontProviderRequest,
) => Uint8Array | Uint8Array[] | null | undefined;

/** Why a face was or was not embedded in an SVG. */
export type SvgFontStatus =
  /** Embedded as `@font-face` data URIs. */
  | 'inlined'
  /** The SVG declares the family itself (its own `@font-face`). */
  | 'declared'
  /** The provider had no face for it: the image falls back. */
  | 'unavailable'
  /** Left out on purpose (`withhold`: not redistributable). */
  | 'withheld'
  /** Found, but the faces together exceed `maxBytes`: nothing embedded. */
  | 'tooLarge';

/** One face an SVG asks for and what became of it. */
export interface SvgFontFaceReport {
  family: string;
  weight: number;
  style: SvgFontStyle;
  status: SvgFontStatus;
  /** Bytes of the files found for it (inlined or too large). */
  bytes?: number;
  /** Number of files (slices) found for it. */
  files?: number;
}

/** A problem inlining fonts into one SVG, as hosts report it: a family
 *  its text names with no face to embed (`svgFontUnavailable`), or faces
 *  over the size cap (`svgFontsTooLarge`, nothing embedded). Hosts add the
 *  picture's `fileId` / `resourceId`. */
export type SvgFontWarning =
  | { kind: 'svgFontUnavailable'; family: string; weight: number; style: SvgFontStyle }
  | { kind: 'svgFontsTooLarge'; bytes: number; maxBytes: number };

export interface InlineSvgFontsOptions {
  /** Most font bytes embedded in one SVG (before base64, which adds a
   *  third). Faces that together exceed it are not embedded at all, and
   *  `svgFontsTooLarge` is reported. Default {@link DEFAULT_SVG_FONT_MAX_BYTES}. */
  maxBytes?: number;
  /** Formats to embed; files of other formats are skipped. Default all
   *  four (WOFF2, WOFF, TrueType, OpenType). */
  formats?: readonly SvgFontFormat[];
  /** Families to leave out, such as those marked not redistributable in a
   *  file that leaves the app: their reference stays and the reader falls
   *  back, as for the book's own font files. */
  withhold?: (family: string) => boolean;
  /** Told of each family left out by `withhold` (once per SVG). */
  onWithheld?: (family: string) => void;
  /** Told of a family with no face and of a size cap hit. */
  onWarning?: (warning: SvgFontWarning) => void;
}

/** The result of inlining fonts into one SVG. */
export interface SvgFontInlining {
  /** The markup with the faces embedded (the input itself when nothing
   *  was). */
  svg: string;
  /** Every face the text asks for, in first-seen order. */
  faces: SvgFontFaceReport[];
  /** Font bytes embedded (0 when none or over the cap). */
  bytes: number;
}

/** Default {@link InlineSvgFontsOptions.maxBytes}: 2 MiB of font files. */
export const DEFAULT_SVG_FONT_MAX_BYTES = 2 * 1024 * 1024;

const ALL_FORMATS: readonly SvgFontFormat[] = ['woff2', 'woff', 'ttf', 'otf'];

/** Generic CSS families, which never name a loadable face. */
const GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
  'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset', 'revert', 'default',
]);

/** Elements whose character data is never drawn as text. */
const NON_TEXT = new Set(['title', 'desc', 'metadata', 'script', 'style']);

// ------------------------------------------------------------ parsing

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };

function charOf(cp: number): string {
  return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
}

function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body[0] === '#') return charOf(body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10));
    return ENTITIES[body] ?? m;
  });
}

function localName(name: string): string {
  const i = name.indexOf(':');
  return (i < 0 ? name : name.slice(i + 1)).toLowerCase();
}

/** A `font-family` list as names, quotes stripped, generic families and
 *  CSS-wide keywords left out. */
export function parseFontFamilyList(value: string): string[] {
  const out: string[] = [];
  for (const raw of value.split(',')) {
    const name = raw.trim().replace(/^(['"])(.*)\1$/, '$2').trim();
    if (name && !GENERIC_FAMILIES.has(name.toLowerCase()) && !out.includes(name)) out.push(name);
  }
  return out;
}

function parseWeight(value: string, inherited: number): number | null {
  const v = value.trim().toLowerCase();
  if (v === 'normal') return 400;
  if (v === 'bold') return 700;
  if (v === 'bolder') return inherited < 400 ? 400 : inherited < 600 ? 700 : 900;
  if (v === 'lighter') return inherited < 600 ? 100 : inherited < 800 ? 400 : 700;
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 1000 ? n : null;
}

function parseStyle(value: string): SvgFontStyle | null {
  const v = value.trim().toLowerCase();
  if (v === 'normal') return 'normal';
  if (v.startsWith('italic') || v.startsWith('oblique')) return 'italic';
  return null;
}

/** Font properties in force on an element. */
interface FontContext {
  families: string[];
  weight: number;
  style: SvgFontStyle;
}

/** CSS declarations of a `style` attribute or rule body, lower-cased names. */
function declarations(css: string): [string, string][] {
  const out: [string, string][] = [];
  for (const decl of css.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const name = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).replace(/!important\s*$/i, '').trim();
    if (name) out.push([name, value]);
  }
  return out;
}

/** The `font` shorthand: `[style] [variant] [weight] size[/line-height]
 *  family-list`. */
function parseFontShorthand(value: string, ctx: FontContext): Partial<FontContext> | null {
  const m = /^(.*?)(?:^|\s)(?:[\d.]+(?:px|pt|em|rem|%|ex|ch|mm|cm|in|pc|q|vh|vw)|0|xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)(?:\s*\/\s*\S+)?\s+(.+)$/i.exec(value.trim());
  if (!m) return null;
  const out: Partial<FontContext> = { families: parseFontFamilyList(m[2]!), weight: 400, style: 'normal' };
  for (const word of m[1]!.trim().split(/\s+/)) {
    if (!word) continue;
    const style = parseStyle(word);
    if (style && word.toLowerCase() !== 'normal') out.style = style;
    const weight = parseWeight(word, ctx.weight);
    if (weight !== null && word.toLowerCase() !== 'normal') out.weight = weight;
  }
  return out;
}

/** Apply font properties (attributes, then `style`, which wins) to an
 *  inherited context. */
function applyFontProps(ctx: FontContext, props: Iterable<[string, string]>): FontContext {
  let next = ctx;
  for (const [name, value] of props) {
    if (name === 'font-family') {
      next = { ...next, families: parseFontFamilyList(value) };
    } else if (name === 'font-weight') {
      const w = parseWeight(value, next.weight);
      if (w !== null) next = { ...next, weight: w };
    } else if (name === 'font-style') {
      const s = parseStyle(value);
      if (s) next = { ...next, style: s };
    } else if (name === 'font') {
      const f = parseFontShorthand(value, next);
      if (f) next = { ...next, ...f };
    }
  }
  return next;
}

/** A start tag's attributes. */
function parseAttributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const re = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  for (const m of tag.matchAll(re)) attrs.set(m[1]!.toLowerCase(), decodeEntities(m[3] ?? m[4] ?? ''));
  return attrs;
}

/** What one pass over the markup finds. */
interface SvgFontScan {
  requests: SvgFontRequest[];
  /** Families the SVG declares in its own `@font-face` rules (lower case). */
  declared: Set<string>;
}

/** Strip CSS comments. */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The rules of a style sheet, `@font-face` ones apart: top-level
 *  `prelude { body }` pairs (an at-rule block such as `@media` is opened
 *  and its rules read in turn). */
function cssRules(css: string): { prelude: string; body: string }[] {
  const out: { prelude: string; body: string }[] = [];
  const text = stripCssComments(css);
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const prelude = text.slice(i, open).trim();
    // The matching brace, counting nested blocks.
    let depth = 1;
    let j = open + 1;
    for (; j < text.length && depth > 0; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') depth--;
    }
    const body = text.slice(open + 1, j - 1);
    if (/^@(media|supports|layer|container)\b/i.test(prelude)) out.push(...cssRules(body));
    else out.push({ prelude, body });
    i = j;
  }
  return out;
}

/** Whether a style sheet holds nothing but `@font-face` rules (comments
 *  and whitespace aside): the faces an author embedded, which change no
 *  geometry. */
export function isFontFaceOnlyStyleSheet(css: string): boolean {
  const text = stripCssComments(css.replace(/<!\[CDATA\[|\]\]>/g, ''));
  if (text.trim() === '') return true;
  const rules = cssRules(text);
  if (rules.length === 0) return false;
  // Whatever lies outside the rule blocks must be blank.
  const outside = text.replace(/\{[^{}]*\}/g, '').replace(/@font-face/gi, '');
  return outside.trim() === '' && rules.every((r) => /^@font-face$/i.test(r.prelude));
}

function scanSvgFonts(svgText: string): SvgFontScan {
  const byKey = new Map<string, SvgFontRequest>();
  const order: SvgFontRequest[] = [];
  const declared = new Set<string>();
  const sheets: string[] = [];
  const allCodePoints = new Set<number>([0x20]);

  const note = (ctx: FontContext, text: string): void => {
    if (ctx.families.length === 0) return;
    const key = `${ctx.families.join('\u0000')}|${ctx.weight}|${ctx.style}`;
    let req = byKey.get(key);
    if (!req) {
      req = { families: [...ctx.families], weight: ctx.weight, style: ctx.style, codePoints: new Set([0x20]) };
      byKey.set(key, req);
      order.push(req);
    }
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (cp > 0x20) req.codePoints.add(cp);
    }
  };

  const root: FontContext = { families: [], weight: 400, style: 'normal' };
  const stack: { name: string; ctx: FontContext; inText: boolean; nonText: boolean }[] = [];
  const top = () => stack[stack.length - 1];
  const onText = (raw: string, isCdata: boolean): void => {
    const t = top();
    if (!t) return;
    const text = isCdata ? raw : decodeEntities(raw);
    if (t.name === 'style') {
      sheets.push(text);
      return;
    }
    if (t.nonText || !t.inText) return;
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (cp > 0x20) allCodePoints.add(cp);
    }
    note(t.ctx, text);
  };

  const n = svgText.length;
  let i = 0;
  while (i < n) {
    const lt = svgText.indexOf('<', i);
    if (lt < 0) {
      onText(svgText.slice(i), false);
      break;
    }
    if (lt > i) onText(svgText.slice(i, lt), false);
    i = lt;
    if (svgText.startsWith('<!--', i)) {
      const end = svgText.indexOf('-->', i + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (svgText.startsWith('<![CDATA[', i)) {
      const end = svgText.indexOf(']]>', i + 9);
      onText(svgText.slice(i + 9, end < 0 ? n : end), true);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (svgText.startsWith('<?', i)) {
      const end = svgText.indexOf('?>', i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (svgText.startsWith('<!', i)) {
      let depth = 0;
      let j = i + 2;
      for (; j < n; j++) {
        const ch = svgText[j];
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
        else if (ch === '>' && depth === 0) break;
      }
      i = j + 1;
      continue;
    }
    if (svgText.startsWith('</', i)) {
      const end = svgText.indexOf('>', i + 2);
      const name = localName(svgText.slice(i + 2, end < 0 ? n : end).trim());
      // Pop to the matching element (tolerates sloppy markup).
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k]!.name === name) {
          stack.length = k;
          break;
        }
      }
      i = end < 0 ? n : end + 1;
      continue;
    }
    // A start tag: find its end outside quoted attribute values.
    let j = i + 1;
    let quote: string | null = null;
    for (; j < n; j++) {
      const ch = svgText[j]!;
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
    }
    const tag = svgText.slice(i + 1, j);
    i = j + 1;
    const selfClosing = tag.endsWith('/');
    const nameMatch = /^([^\s/>]+)/.exec(tag);
    if (!nameMatch) continue;
    const name = localName(nameMatch[1]!);
    const parent = top();
    const attrs = parseAttributes(tag);
    const props: [string, string][] = [];
    for (const key of ['font-family', 'font-weight', 'font-style']) {
      const v = attrs.get(key);
      if (v !== undefined) props.push([key, v]);
    }
    const style = attrs.get('style');
    if (style) props.push(...declarations(style));
    const ctx = applyFontProps(parent?.ctx ?? root, props);
    const entry = {
      name,
      ctx,
      inText: (parent?.inText ?? false) || name === 'text',
      nonText: (parent?.nonText ?? false) || NON_TEXT.has(name),
    };
    if (!selfClosing) stack.push(entry);
  }

  // Style sheets: `@font-face` rules declare families; a rule that names a
  // family is taken to style the SVG's text (its selector is not matched).
  for (const sheet of sheets) {
    for (const rule of cssRules(sheet)) {
      const decls = declarations(rule.body);
      if (/^@font-face$/i.test(rule.prelude)) {
        for (const [name, value] of decls) {
          if (name === 'font-family') for (const f of parseFontFamilyList(value)) declared.add(f.toLowerCase());
        }
        continue;
      }
      if (rule.prelude.startsWith('@')) continue;
      const ctx = applyFontProps(root, decls);
      if (ctx.families.length > 0 && decls.some(([k]) => k === 'font-family' || k === 'font')) {
        note(ctx, String.fromCodePoint(...allCodePoints));
      }
    }
  }
  return { requests: order, declared };
}

/** Every `(families, weight, style)` the SVG's text runs ask for, with
 *  the characters each sets, from `font-family`, `font-weight`,
 *  `font-style` and `font` in attributes, `style` attributes and inherited
 *  from enclosing elements. A `<style>` rule that names a family counts
 *  too (with all the SVG's characters: its selector is not matched).
 *  Generic families are ignored, and so is text in `<title>`, `<desc>`
 *  and the like. Pure. */
export function svgFontRequests(svgText: string): SvgFontRequest[] {
  return scanSvgFonts(svgText).requests;
}

/** Families the SVG declares in its own `@font-face` rules, as written. */
export function svgDeclaredFontFamilies(svgText: string): string[] {
  return [...scanSvgFonts(svgText).declared];
}

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
        report({ family, weight: req.weight, style: req.style, status: 'inlined' });
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

function withheldOf(jobs: Map<string, FaceJob>, options: InlineSvgFontsOptions | undefined): Set<string> {
  const out = new Set<string>();
  if (!options?.withhold) return out;
  for (const job of jobs.values()) {
    const lower = job.family.toLowerCase();
    if (out.has(lower) || !options.withhold(job.family)) continue;
    out.add(lower);
    options.onWithheld?.(job.family);
  }
  return out;
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
  const withheld = withheldOf(plan.jobs, options);
  const formats = options?.formats ?? ALL_FORMATS;
  const files = new Map<string, { bytes: Uint8Array; format: SvgFontFormat }[]>();
  await Promise.all([...plan.jobs].map(async ([key, job]) => {
    if (withheld.has(job.family.toLowerCase())) return;
    const answer = await provider(job.family, job.weight, job.style, { codePoints: job.codePoints }).catch(() => null);
    files.set(key, asFiles(answer, formats));
  }));
  return finishInlining(svgText, plan, files, withheld, options);
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
  const withheld = withheldOf(plan.jobs, options);
  const formats = options?.formats ?? ALL_FORMATS;
  const files = new Map<string, { bytes: Uint8Array; format: SvgFontFormat }[]>();
  for (const [key, job] of plan.jobs) {
    if (withheld.has(job.family.toLowerCase())) continue;
    let answer: Uint8Array | Uint8Array[] | null | undefined = null;
    try {
      answer = provider(job.family, job.weight, job.style, { codePoints: job.codePoints });
    } catch {
      answer = null;
    }
    files.set(key, asFiles(answer, formats));
  }
  return finishInlining(svgText, plan, files, withheld, options);
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
