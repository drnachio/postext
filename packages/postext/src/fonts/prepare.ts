// Font preparation (#629): load every face a configuration and its text
// ask for before the first build, from the font set's declared faces or a
// host resolver, and lay out again with any face the pages used that the
// configuration did not name. Loading stays the host's: the resolver
// answers with files (the shape of the PDF font provider), the engine adds
// them to the font set and to the font registry SVG pictures read (#630).

import type { PostextConfig, PostextContent } from '../types';
import type { VDTDocument } from '../vdt';
import { evictFontFamilies } from '../measure/font';
import { collectFontUsage, configFontFamilies, type FontContentText } from './usage';
import {
  defaultFontSet,
  documentFontFaces,
  faceRequestKey,
  fontFallbacks,
  isGenericFamily,
  type FontFaceLike,
  type FontFaceRequest,
  type FontFaceSetLike,
  type FontFallbackOptions,
} from './faces';
import { isFontSetTracked, syncFontSet, watchFonts } from './fontSet';
import { registerFontBytes, registerFontUrl } from '../svg/fontRegistry';

/** A font file: its bytes, or the URL to fetch it from (a CSS `src`
 *  value — `url(…)`, `local(…)` — is taken as written). */
export type FontFileSource = ArrayBuffer | ArrayBufferView | string;

/** A font file with the descriptors of its face, when they are not the
 *  ones asked for: the slice a file covers (`unicodeRange`), a variable
 *  weight range (`'100 900'`), an upright file given for an italic. */
export interface FontFile {
  source: FontFileSource;
  unicodeRange?: string;
  weight?: number | string;
  style?: 'normal' | 'italic' | string;
}

/** What a resolver answers: one file, several (the slices of a face, in
 *  the order they are added to the font set), or nothing (it has no such
 *  face). Throwing counts as nothing. */
export type FontResolverAnswer = FontFileSource | FontFile | readonly (FontFileSource | FontFile)[] | null | undefined;

export interface FontResolveRequest {
  /** The characters the document sets (a space included), for a resolver
   *  serving a family as slices: only the files holding them. */
  text: string;
  codePoints: Set<number>;
}

/**
 * A host's font files, asked for each face no `FontFace` of the font set
 * declares: `(family, weight, style, { text, codePoints })`. The shape of
 * postext-pdf's `PdfFontProvider`, so one function serves the screen and
 * the PDF. A resolver may also declare the face itself (add a style sheet,
 * a `FontFace`) and answer null: the engine then loads what it declared.
 */
export type FontResolver = (
  family: string,
  weight: number,
  style: 'normal' | 'italic',
  request: FontResolveRequest,
) => FontResolverAnswer | Promise<FontResolverAnswer>;

type FontFaceConstructor = new (family: string, source: string | ArrayBuffer | ArrayBufferView, descriptors?: FontFaceDescriptors) => FontFaceLike;

export interface PrepareFontsOptions {
  /** The font set to load into: by default `document.fonts`, or
   *  `self.fonts` in a worker. */
  fontSet?: FontFaceSetLike | null;
  /** Files for the faces nothing declares. */
  resolve?: FontResolver;
  /** Give up waiting after this many ms (default 10 000): a face still
   *  loading then is reported missing. */
  timeoutMs?: number;
  /** Watch the font set afterwards ({@link watchFonts}). Default true. */
  watch?: boolean;
  /** Register the resolved files with the font registry, for SVG
   *  pictures and layout workers. Default true. */
  register?: boolean;
  /** Faces to load beyond the configuration's. */
  faces?: readonly FontFaceRequest[];
  /** The `FontFace` constructor (default the global one). */
  FontFace?: FontFaceConstructor;
  /** The probe that tells an installed family from a missing one. */
  measureWidth?: FontFallbackOptions['measureWidth'];
}

/** What a preparation found. */
export interface FontReport {
  /** Faces a loaded face answers for (or an installed family). */
  loaded: FontFaceRequest[];
  /** Faces no face of the family answers for: their text is measured
   *  with a fallback face. */
  missing: FontFaceRequest[];
  /** Faces the browser draws from another weight or slant of the family
   *  (bold made heavier, italic slanted). */
  synthesized: FontFaceRequest[];
  /** `FontFace`s added from the resolver's files. */
  added: number;
}

/** The texts of a build's content: the Markdown, the metadata and the
 *  resources' captions, notes and cells. */
export function contentTexts(content: PostextContent | FontContentText): string[] {
  if (content === undefined) return [];
  if (typeof content === 'string') return [content];
  if (Array.isArray(content)) return [...(content as readonly string[])];
  const c = content as PostextContent;
  const out = [c.markdown];
  const strings: string[] = [];
  const walk = (node: unknown, depth: number): void => {
    if (depth > 10 || !node) return;
    if (typeof node === 'string') {
      strings.push(node);
      return;
    }
    if (typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (/file|url|src|markup|data|id$/i.test(key)) continue;
      walk(value, depth + 1);
    }
  };
  walk(c.metadata, 0);
  walk(c.resources, 0);
  if (strings.length > 0) out.push(strings.join(' '));
  return out;
}

/** Text the configuration itself sets: design texts, running heads,
 *  labels, contents titles. */
function configTexts(config: PostextConfig | undefined): string {
  const strings: string[] = [];
  const walk = (node: unknown, key: string, depth: number): void => {
    if (depth > 12 || !node) return;
    if (typeof node === 'string') {
      if (!/color|colour|family|id$|url|src|file/i.test(key)) strings.push(node);
      return;
    }
    if (typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, key, depth + 1);
      return;
    }
    for (const [k, value] of Object.entries(node as Record<string, unknown>)) walk(value, k, depth + 1);
  };
  walk(config, '', 0);
  return strings.join(' ');
}

/**
 * The characters a document sets — its text, its resources' and
 * metadata's, the configuration's own texts, the ASCII digits and letters
 * of folios and labels — once each: the sample a face is loaded for, so a
 * family served as slices (`unicode-range`: Latin Extended, Greek, Arabic,
 * the CJK slices) brings the files the document needs.
 */
export function fontSampleText(content: PostextContent | FontContentText, config?: PostextConfig): string {
  const seen = new Set<string>([' ']);
  for (let c = 0x21; c < 0x7f; c++) seen.add(String.fromCharCode(c));
  for (const text of [...contentTexts(content), configTexts(config)]) {
    for (const ch of text) if (ch > ' ' && ch !== '­') seen.add(ch);
  }
  return [...seen].join('');
}

/** The faces a configuration and its text ask for, in a fixed order:
 *  families as `configFontFamilies` lists them, then the weights from light
 *  to heavy, upright before italic. */
export function configFontFaces(config: PostextConfig | undefined, text?: FontContentText): FontFaceRequest[] {
  const cfg = config ?? {};
  const usage = collectFontUsage(cfg, { markdown: text });
  const families = [...new Set([...configFontFamilies(cfg, text), ...usage.keys()])];
  const out: FontFaceRequest[] = [];
  for (const family of families) {
    if (isGenericFamily(family)) continue;
    const uses = usage.get(family) ?? [{ weight: 400, style: 'normal' as const }];
    const seen = new Set<string>();
    const faces = uses
      .filter((u) => {
        const key = `${u.weight}|${u.style}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.weight - b.weight || (a.style === b.style ? 0 : a.style === 'normal' ? -1 : 1));
    for (const u of faces) out.push({ family, weight: u.weight, style: u.style });
  }
  return out;
}

function fontSpec(f: FontFaceRequest): string {
  return `${f.style === 'italic' ? 'italic ' : ''}${f.weight} 16px ${JSON.stringify(f.family)}`;
}

function normalizeAnswer(answer: FontResolverAnswer): FontFile[] {
  if (answer === null || answer === undefined) return [];
  const list = Array.isArray(answer) ? answer : [answer];
  const out: FontFile[] = [];
  for (const item of list as (FontFileSource | FontFile)[]) {
    if (item === null || item === undefined) continue;
    if (typeof item === 'string' || item instanceof ArrayBuffer || ArrayBuffer.isView(item)) out.push({ source: item as FontFileSource });
    else if (typeof item === 'object' && 'source' in item) out.push(item);
  }
  return out.filter((f) => (typeof f.source === 'string' ? f.source.length > 0 : (f.source as ArrayBuffer).byteLength > 0));
}

function cssSource(url: string): string {
  return /^\s*(url|local)\(/i.test(url) ? url : `url(${JSON.stringify(url)})`;
}

function bytesOf(source: ArrayBuffer | ArrayBufferView): Uint8Array {
  return source instanceof ArrayBuffer ? new Uint8Array(source) : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
}

/** `promise`, or `fallback` once `deadline` (ms, `Date.now()` scale) passes. */
function until<T>(promise: Promise<T>, deadline: number, fallback: T): Promise<T> {
  const left = deadline - Date.now();
  if (left <= 0) return Promise.resolve(fallback);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), left);
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function hasExactFace(declared: readonly FontFaceLike[], f: FontFaceRequest): boolean {
  return declared.some((d) => {
    const style = /italic|oblique/i.test(d.style ?? '') ? 'italic' : 'normal';
    if (style !== f.style) return false;
    const parts = (d.weight ?? '400').trim().split(/\s+/).map((w) => (w === 'bold' ? 700 : w === 'normal' ? 400 : Number(w)));
    const lo = Number.isFinite(parts[0]) ? parts[0]! : 400;
    const hi = Number.isFinite(parts[1]) ? parts[1]! : lo;
    return f.weight >= Math.min(lo, hi) && f.weight <= Math.max(lo, hi);
  });
}

function declaredFaces(fontSet: Iterable<FontFaceLike>, family: string): FontFaceLike[] {
  const lower = family.toLowerCase();
  const out: FontFaceLike[] = [];
  for (const face of fontSet) {
    const f = face.family.trim().replace(/^(["'])(.*)\1$/, '$2').toLowerCase();
    if (f === lower) out.push(face);
  }
  return out;
}

/** Load `faces` into `fontSet`: what it declares through `fontSet.load`,
 *  the rest through the resolver. Faces from the resolver are added once
 *  all have loaded, in the order of `faces` and of each answer (latin
 *  before latin-ext before greek when the resolver answers so), so the
 *  set is the same whatever order the files arrive in. */
async function loadFaces(
  faces: readonly FontFaceRequest[],
  fontSet: FontFaceSetLike,
  sample: string,
  options: PrepareFontsOptions,
): Promise<{ added: number; touched: Set<string> }> {
  const deadline = Date.now() + (options.timeoutMs ?? 10_000);
  const FontFaceCtor = options.FontFace ?? (globalThis as { FontFace?: FontFaceConstructor }).FontFace;
  const codePoints = new Set<number>();
  for (const ch of sample) codePoints.add(ch.codePointAt(0)!);
  const request: FontResolveRequest = { text: sample, codePoints };
  const touched = new Set<string>();
  const toAdd: FontFaceLike[][] = faces.map(() => []);
  await Promise.all(faces.map(async (f, i) => {
    let declared = declaredFaces(fontSet, f.family);
    if (!hasExactFace(declared, f) && options.resolve) {
      let files: FontFile[] = [];
      try {
        files = normalizeAnswer(await until(Promise.resolve(options.resolve(f.family, f.weight, f.style, request)), deadline, null));
      } catch {
        files = [];
      }
      if (files.length > 0 && FontFaceCtor) {
        const made = files.map((file) => {
          const descriptors: FontFaceDescriptors = {
            weight: String(file.weight ?? f.weight),
            style: file.style ?? f.style,
            ...(file.unicodeRange ? { unicodeRange: file.unicodeRange } : {}),
          };
          const source = typeof file.source === 'string' ? cssSource(file.source) : file.source;
          return { file, face: new FontFaceCtor(f.family, source, descriptors), descriptors };
        });
        const loaded = await Promise.all(made.map(async ({ face }) => (face.load ? until(face.load().then(() => true), deadline, false) : true)));
        made.forEach(({ file, face, descriptors }, k) => {
          if (!loaded[k]) return;
          toAdd[i]!.push(face);
          if (options.register !== false) {
            const style = String(descriptors.style);
            if (typeof file.source === 'string') {
              if (!/^\s*local\(/i.test(file.source)) registerFontUrl(f.family, String(descriptors.weight), style, file.source.replace(/^\s*url\(\s*["']?|["']?\s*\)\s*$/g, ''), { unicodeRange: file.unicodeRange });
            } else {
              registerFontBytes(f.family, String(descriptors.weight), style, bytesOf(file.source), { unicodeRange: file.unicodeRange });
            }
          }
        });
        if (toAdd[i]!.length > 0) {
          touched.add(f.family);
          return;
        }
      }
      // The resolver may have declared the face itself.
      declared = declaredFaces(fontSet, f.family);
    }
    if (declared.length > 0) {
      const before = declared.filter((d) => d.status === 'loaded').length;
      await until(fontSet.load(fontSpec(f), sample), deadline, []);
      const after = declaredFaces(fontSet, f.family).filter((d) => d.status === 'loaded').length;
      if (after !== before) touched.add(f.family);
    }
  }));
  let added = 0;
  for (const list of toAdd) {
    for (const face of list) {
      fontSet.add(face);
      added++;
    }
  }
  return { added, touched };
}

/** Whether `fontSet` has a loaded face, or an installed family, for each
 *  face; split into the report's lists. */
function classify(faces: readonly FontFaceRequest[], fontSet: FontFaceSetLike, options: PrepareFontsOptions, added: number): FontReport {
  const fallbacks = new Map(fontFallbacks(faces, fontSet, { measureWidth: options.measureWidth }).map((f) => [faceRequestKey(f), f]));
  const report: FontReport = { loaded: [], missing: [], synthesized: [], added };
  for (const f of faces) {
    const fb = fallbacks.get(faceRequestKey(f));
    if (!fb) report.loaded.push(f);
    else if (fb.reason === 'missing') report.missing.push(f);
    else report.synthesized.push(f);
  }
  return report;
}

/**
 * Load every face `config` and its text ask for (body, headings, lists,
 * callout titles and bodies, tables, design texts, running heads,
 * contents, code, comic lettering, in each weight and slant the
 * configuration sets) into the font set, for the characters the document
 * sets, before the first build. A face the set declares is loaded through
 * it (`fontSet.load`); one it does not is asked of `options.resolve`, and
 * the files it gives are added as `FontFace`s (and registered for SVG
 * pictures). The measurements of the families that changed are dropped.
 * Resolves with which faces are there, which are missing and which the
 * browser would synthesize. Where there is no font set (Node), every face
 * is reported loaded and nothing is done.
 */
export async function prepareFonts(
  content: PostextContent | FontContentText,
  config?: PostextConfig,
  options: PrepareFontsOptions = {},
): Promise<FontReport> {
  const texts = contentTexts(content);
  const wanted = configFontFaces(config, texts);
  for (const f of options.faces ?? []) if (!wanted.some((w) => faceRequestKey(w) === faceRequestKey(f))) wanted.push(f);
  const fontSet = options.fontSet === undefined ? defaultFontSet() : options.fontSet;
  if (!fontSet) return { loaded: wanted, missing: [], synthesized: [], added: 0 };
  return prepareFaces(wanted, fontSet, fontSampleText(content, config), options);
}

async function prepareFaces(wanted: readonly FontFaceRequest[], fontSet: FontFaceSetLike, sample: string, options: PrepareFontsOptions): Promise<FontReport> {
  if (!isFontSetTracked(fontSet)) syncFontSet(fontSet);
  const { added, touched } = await loadFaces(wanted, fontSet, sample, options);
  // Drop what was measured in the families whose faces changed: those
  // the set's record shows, and every family this call loaded faces for.
  // The set is read whatever it reports (#649): `fontSet.load` resolves a
  // task before the set's `loadingdone`, and a declared face that loads
  // leaves the size as it was, so a set known from an earlier build would
  // pass for unchanged and the builds that follow would keep the widths
  // of the fallback face. Recording it here also leaves that
  // `loadingdone` nothing to drop a second time.
  const changed = new Set(syncFontSet(fontSet, { evict: false, force: true }));
  for (const family of touched) changed.add(family.toLowerCase());
  if (changed.size > 0) evictFontFamilies(changed);
  if (options.watch !== false) watchFonts(fontSet);
  return classify(wanted, fontSet, options, added);
}

/** A document, or several (the chapters of a book). */
export type BuiltDocuments = VDTDocument | readonly VDTDocument[];

export interface LoadedFontsOptions extends PrepareFontsOptions {
  /** The text the documents set, for the sample faces are loaded for.
   *  Default: the text of the documents' lines. */
  text?: FontContentText;
  /** Extra builds at most (default 2). */
  maxRounds?: number;
  /** Told what the last round found. */
  onFonts?: (report: FontReport) => void;
}

function documentsOf(result: BuiltDocuments): VDTDocument[] {
  return Array.isArray(result) ? [...(result as readonly VDTDocument[])] : [result as VDTDocument];
}

/** The text of a document's lines (for the sample). */
function documentText(docs: readonly VDTDocument[]): string {
  const parts: string[] = [];
  for (const doc of docs) for (const block of doc.blocks) for (const line of block.lines) for (const seg of line.segments ?? []) parts.push(seg.text);
  return parts.join('');
}

/**
 * Run `build`, then load the faces its pages set text in that the font set
 * could not give (a weight the configuration did not name, a face
 * resolved only now), drop their measurements and build again — at most
 * `maxRounds` extra builds (2). `build` returns a document or several.
 * Faces that stay missing are reported (`onFonts`) and listed by each
 * document's `fontFallback` warnings.
 */
export async function withLoadedFonts<T extends BuiltDocuments>(build: () => T | Promise<T>, options: LoadedFontsOptions = {}): Promise<T> {
  const fontSet = options.fontSet === undefined ? defaultFontSet() : options.fontSet;
  let result = await build();
  if (!fontSet) return result;
  const tried = new Set<string>();
  const rounds = options.maxRounds ?? 2;
  let report: FontReport | undefined;
  for (let round = 0; ; round++) {
    const docs = documentsOf(result);
    const faces = new Map<string, FontFaceRequest>();
    for (const doc of docs) for (const f of documentFontFaces(doc)) faces.set(faceRequestKey(f), f);
    const all = [...faces.values()];
    const fresh = fontFallbacks(all, fontSet, { measureWidth: options.measureWidth })
      .filter((f) => !tried.has(faceRequestKey(f)))
      .map(({ family, weight, style }) => ({ family, weight, style }));
    if (fresh.length === 0 || round >= rounds) {
      report = classify(all, fontSet, options, report?.added ?? 0);
      break;
    }
    for (const f of fresh) tried.add(faceRequestKey(f));
    const sample = fontSampleText(options.text ?? documentText(docs));
    const before = new Set(fontFallbacks(fresh, fontSet, { measureWidth: options.measureWidth }).map(faceRequestKey));
    const step = await prepareFaces(fresh, fontSet, sample, { ...options, watch: false });
    const stillMissing = new Set([...step.missing, ...step.synthesized].map(faceRequestKey));
    const gained = [...before].some((k) => !stillMissing.has(k));
    if (step.added === 0 && !gained) {
      report = classify(all, fontSet, options, 0);
      break;
    }
    result = await build();
  }
  if (options.watch !== false) watchFonts(fontSet);
  options.onFonts?.(report!);
  return result;
}
