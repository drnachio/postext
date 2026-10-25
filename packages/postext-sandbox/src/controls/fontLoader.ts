import type { CustomFontFamily, CustomFontVariant, PostextConfig, VerticalAlternatesFace } from 'postext';
import type { FontPayload } from 'postext/worker';
import {
  markdownHasComics,
  isJapaneseLanguage,
  chineseScriptOf,
  loadVerticalAlternates,
  localeScript,
  unregisterVerticalAlternates,
  prepareFonts,
  comicFontFamilies,
  configFontFaces,
  fontSampleText,
  primaryFontFamily,
  cssWeightOrderOf,
  fontFallbackOf,
  hasOwnStyle,
  resolveBodyTextConfig,
  resolveHeaderFooterConfig,
  resolveHeadingsConfig,
  resolveOrderedListsConfig,
  resolveUnorderedListsConfig,
  addFeatureFaces,
  baseFontFamily,
  featureFamilyParts,
  fontFeatureSettings,
  setFigureStyleFamilies,
} from 'postext';
import type { PostextContent } from 'postext';
import { getFontFile } from '../storage/fontStorage.js';
import { fontsourceCssUrl, fontsourceId, parseFontsourceCss, parseUnicodeRange, fontsourceUrlAt, fontsourceVersionOf } from '../viewport/fontsourceSlices.js';
import { isGenericFontFamily, isSystemFontFamily, takesFigureFeatures } from './systemFonts.js';

const FONT_LOAD_TIMEOUT_MS = 3000;

/** The requests for a family's record, its style sheets and its files are
 *  given up when none of them has received anything for this long (#757):
 *  `fetch` has no bound of its own, and a connection that stalls would
 *  hold the layout that waits for the file. The clock is the loader's, not
 *  a request's: a book of some hundred files on a slow line has most of
 *  them waiting their turn while the others arrive, and each is alive as
 *  long as bytes come in for any, a face the page loads for itself
 *  included. A request given up counts as one that failed, asked again
 *  after a while. */
export const FONT_STALL_MS = 15_000;

/** The requests the network did not answer (an error, the bound above),
 *  by URL: not the ones a server answered with a status, which a later
 *  request would get again. */
const unanswered = new Set<string>();

/** The font requests the network has not answered since the page loaded
 *  and that no later request made good. */
export function unansweredFontRequests(): string[] {
  return [...unanswered];
}

/**
 * True when the network did not answer for a file of `urls`, or for what
 * says which files `family` has (its record, its package's style sheet,
 * Google's): the family may have files a later request brings.
 */
export function fontRequestsUnanswered(family: string, urls: readonly string[]): boolean {
  if (unanswered.size === 0) return false;
  if (urls.some((url) => unanswered.has(url))) return true;
  const id = fontsourceId(family);
  const google = `family=${encodeURIComponent(family)}`;
  for (const url of unanswered) {
    if (url.endsWith('.woff2')) continue;
    if (url.endsWith(`/v1/fonts/${id}`) || url.includes(`/@fontsource/${id}@`) || url.includes(`${google}:`) || url.endsWith(google)) return true;
  }
  return false;
}

/** What the loader is waiting for, for a check that asks a page why its
 *  layout does not come (#757). */
export function fontLoaderState(): {
  requestsOut: number; sinceProgressMs: number | null; stallClockArmed: boolean;
  unanswered: string[]; recordsInFlight: string[]; pageLoadsInFlight: string[];
} {
  return {
    requestsOut: requestsOut.size,
    sinceProgressMs: lastFontProgress ? Date.now() - lastFontProgress : null,
    stallClockArmed: stallTimer !== null,
    unanswered: [...unanswered],
    recordsInFlight: [...metadataInFlight.keys()],
    pageLoadsInFlight: [...loadingPromises.keys()],
  };
}

/** The requests out, and when one of them last received something. */
const requestsOut = new Set<AbortController>();
let lastFontProgress = 0;
let stallTimer: ReturnType<typeof setTimeout> | null = null;

function fontProgress(): void {
  lastFontProgress = Date.now();
}

/** Give the requests out up once `FONT_STALL_MS` pass without a byte. */
function watchForStall(): void {
  if (stallTimer !== null || requestsOut.size === 0) return;
  stallTimer = setTimeout(() => {
    stallTimer = null;
    if (requestsOut.size === 0) return;
    if (Date.now() - lastFontProgress >= FONT_STALL_MS) {
      for (const controller of [...requestsOut]) controller.abort();
      return;
    }
    watchForStall();
  }, Math.max(0, lastFontProgress + FONT_STALL_MS - Date.now()));
}

/** The response with its body read, each chunk counted as progress. A
 *  response without a stream (a test's) is returned as it is. */
async function received(res: Response): Promise<Response> {
  const reader = typeof Response === 'undefined' ? undefined : res.body?.getReader?.();
  if (!reader) return res;
  const chunks: BlobPart[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    fontProgress();
  }
  return new Response(new Blob(chunks), { status: res.status, statusText: res.statusText, headers: res.headers });
}

/** `fetch` and the reading of its body, given up when the loader's
 *  requests stall (`FONT_STALL_MS`). Rejects as `fetch` does. */
async function fetchWithin<T>(url: string, read: (res: Response) => Promise<T>, init?: RequestInit): Promise<T> {
  if (typeof AbortController === 'undefined') return read(await fetch(url, init));
  const controller = new AbortController();
  // A request sent has the bound to itself at least: the clock starts
  // again, whatever the requests already out have waited.
  fontProgress();
  requestsOut.add(controller);
  watchForStall();
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    fontProgress();
    const value = await read(await received(res));
    fontProgress();
    unanswered.delete(url);
    return value;
  } catch (err) {
    unanswered.add(url);
    throw err;
  } finally {
    requestsOut.delete(controller);
    if (requestsOut.size === 0 && stallTimer !== null) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
  }
}

// What a configuration asks of its faces lives in the engine, shared with
// the CLI; re-exported here for the Sandbox's own callers.
import {
  collectFontUsage,
  hasLatinEmphasis,
  configFontFamilies,
  configFeatureFamilies,
  STANDARD_FONT_VARIANTS,
  type FontContentText,
  type FontUsageDocument,
  type FontVariantUse,
} from 'postext';
export { collectFontUsage, hasLatinEmphasis, STANDARD_FONT_VARIANTS };

// A style's figures (#1237) leave a face only the system has as it is: no
// file declares it again with the features. The layout worker says the
// same (`worker/layout.worker.ts`).
setFigureStyleFamilies((family) => takesFigureFeatures(family, typeof document !== 'undefined' ? document.fonts : undefined));

/**
 * Every family a configuration sets text in whose files the Sandbox loads:
 * the engine's `configFontFamilies`, a feature family (a style's figures,
 * #1237, `Lora@onum`) as its base family. The feature families are kept in
 * `configFontUses`, whose faces are declared from the base family's files
 * ({@link loadFont}).
 */
export function getConfigFontFamilies(config: PostextConfig, markdown?: FontContentText): string[] {
  return [...new Set(configFontFamilies(config, markdown).map(baseFontFamily))];
}
export type { FontContentText, FontUsageDocument, FontVariantUse };

const loadedFonts = new Set<string>();
const loadingPromises = new Map<string, Promise<void>>();

/** A face of a family as it is served: one file, with the weight, the slant
 *  and the characters (`unicode-range`) it answers for. */
export interface FamilyFace {
  family: string;
  /** `'400'`, or a range (`'100 900'`). */
  weight: string;
  style: string;
  unicodeRange?: string;
  url: string;
}

interface FontMetadata {
  variable: boolean;
  weights: number[];
  hasItalic: boolean;
  /** Whether the family has an upright style (every family but a few that
   *  are italics alone). */
  hasUpright: boolean;
  /** Whether the family is on Google Fonts (Fontsource's `type`). */
  google: boolean;
  /** Whether Fontsource serves it as a Chinese, Japanese or Korean family
   *  (its subsets name the script): its numbered files are slices of the
   *  script, where another family's are its emoji. */
  cjk: boolean;
  /** The subsets each weight and style has a file for, by `weight|style`,
   *  where the record says. */
  subsets?: Map<string, Set<string>>;
  /** The family's files as the Fontsource API lists them, for a family
   *  Google Fonts does not serve (Fontsource's `type` is not `google`:
   *  Commit Mono, FiraGO, DejaVu Sans…): asked of Google, its style sheet
   *  is a 400 with no CORS headers (#689). */
  fontsource?: FamilyFace[];
}

/** What the Fontsource API says of a family, as far as the loader reads it. */
interface FontsourceRecord {
  variable?: boolean;
  weights?: number[];
  styles?: string[];
  subsets?: string[];
  type?: string;
  unicodeRange?: Record<string, string>;
  variants?: Record<string, Record<string, Record<string, { url?: { woff2?: string } }>>>;
}

/** Whether a record's subsets name Chinese, Japanese or Korean. */
function isCjkRecord(data: FontsourceRecord): boolean {
  return (data.subsets ?? []).some((subset) => /^(chinese|japanese|korean)/.test(subset));
}

/** The subsets a pen declares for a family that is not Chinese, Japanese or
 *  Korean, in the order it declares them (`cookbook/_kit`: `fonts.js`, then
 *  `arabic.js`). */
const KIT_SUBSETS = ['latin', 'latin-ext', 'greek', 'arabic'];

/**
 * The files of a cut in the order they are declared (#757), from the order
 * the family's style sheet lists them in (`latin` last): the order the kit
 * declares them in, since the file declared last answers for a character
 * two files hold (CSS Fonts 4 §4.5) and a book must be set from the same
 * file in a pen and in the Sandbox.
 *
 * - A Chinese, Japanese or Korean family: the reverse of the sheet, as
 *   `cjk.js` adds its files: `latin`, `latin-ext`, then the numbered slices,
 *   which answer for the ASCII letters and digits they repeat.
 * - Any other family: `latin`, `latin-ext`, `greek`, then `arabic`, which
 *   answers for the joiners and hyphens it holds beside `latin`. The files
 *   a pen does not load (Cyrillic, Vietnamese, maths, the numbered emoji
 *   slices, which repeat the digits) come before them, in the sheet's
 *   order: they answer for the characters no other file holds.
 */
function declarationOrder<T extends { name: string }>(sheet: readonly T[], cjk: boolean): T[] {
  if (cjk) return [...sheet].reverse();
  const kit = KIT_SUBSETS.flatMap((name) => sheet.filter((subset) => subset.name === name));
  return [...sheet.filter((subset) => !KIT_SUBSETS.includes(subset.name)), ...kit];
}

/** The WOFF2 files of a Fontsource record, one face per weight, style and
 *  subset, the subsets of each in the order they are declared
 *  (`declarationOrder`). A record with ranges also lists a script's whole
 *  file under its name (`chinese-simplified`, `japanese`) with no range:
 *  declared last, it would answer for every character, so it is left out. */
function fontsourceFaces(family: string, data: FontsourceRecord): FamilyFace[] {
  const out: FamilyFace[] = [];
  const ranges = data.unicodeRange ?? {};
  const ranged = Object.keys(ranges).length > 0;
  const cjk = isCjkRecord(data);
  for (const [weight, styles] of Object.entries(data.variants ?? {})) {
    for (const [style, subsets] of Object.entries(styles ?? {})) {
      const cut: { name: string; face: FamilyFace }[] = [];
      for (const [subset, file] of Object.entries(subsets ?? {})) {
        const url = file?.url?.woff2;
        if (!url) continue;
        const unicodeRange = ranges[subset] ?? ranges[`[${subset}]`];
        if (ranged && !unicodeRange) continue;
        cut.push({ name: subset, face: { family, weight, style: style === 'italic' ? 'italic' : 'normal', ...(unicodeRange ? { unicodeRange } : {}), url } });
      }
      out.push(...declarationOrder(cut, cjk).map((entry) => entry.face));
    }
  }
  return out;
}

/** The subsets a record gives a file for, by weight and style. */
function recordSubsets(data: FontsourceRecord): Map<string, Set<string>> | undefined {
  const out = new Map<string, Set<string>>();
  for (const [weight, styles] of Object.entries(data.variants ?? {})) {
    for (const [style, subsets] of Object.entries(styles ?? {})) {
      const names = Object.keys(subsets ?? {});
      if (names.length > 0) out.set(`${weight}|${style === 'italic' ? 'italic' : 'normal'}`, new Set(names));
    }
  }
  return out.size > 0 ? out : undefined;
}

const metadataCache = new Map<string, FontMetadata | null>();
const metadataInFlight = new Map<string, Promise<FontMetadata | null>>();
/** The families Fontsource answered it does not have (a 404), apart from
 *  the ones whose lookup failed (the service down, the network gone), whose
 *  files may still be there. */
const uncatalogued = new Set<string>();

const toFontsourceId = fontsourceId;

async function fetchFontMetadata(family: string): Promise<FontMetadata | null> {
  // A face of the reader's machine is not in the catalogue (#753).
  if (isSystemFontFamily(family)) return null;
  if (metadataCache.has(family)) return metadataCache.get(family)!;
  const existing = metadataInFlight.get(family);
  if (existing) return existing;

  const promise = (async (): Promise<FontMetadata | null> => {
    try {
      const data = await fetchWithin(`https://api.fontsource.org/v1/fonts/${toFontsourceId(family)}`, async (res) => {
        if (res.status === 404) uncatalogued.add(family);
        return res.ok ? await res.json() as FontsourceRecord : null;
      });
      if (!data) return null;
      const weights = (data.weights ?? []).filter((w) => typeof w === 'number');
      if (weights.length === 0) return null;
      // Fontsource also lists families that are not on Google Fonts.
      const google = data.type === undefined || data.type === 'google';
      const own = google ? [] : fontsourceFaces(family, data);
      const cjk = isCjkRecord(data);
      const styles = data.styles ?? [];
      const subsets = recordSubsets(data);
      return {
        variable: data.variable === true,
        weights,
        hasItalic: styles.includes('italic'),
        hasUpright: styles.length === 0 || styles.includes('normal'),
        google,
        cjk,
        ...(subsets ? { subsets } : {}),
        ...(own.length > 0 ? { fontsource: own } : {}),
      };
    } catch {
      return null;
    }
  })();

  metadataInFlight.set(family, promise);
  const meta = await promise;
  metadataCache.set(family, meta);
  metadataInFlight.delete(family);
  for (const cb of fontSourceListeners) cb(family);
  return meta;
}

/** The weights Fontsource lists for a family, or null when it has no record
 *  of it. The lookup `loadFont` makes, answered from its cache. */
export async function fontFamilyWeights(family: string): Promise<number[] | null> {
  return (await fetchFontMetadata(family))?.weights ?? null;
}

/**
 * Whether Fontsource has no files for `family` (#753): a generic keyword
 * or a face of an operating system (`isSystemFontFamily`), which it is
 * never asked for, or a family it answered it does not have. Its faces are
 * not worth a request per weight and style. False for a custom family, and
 * while the lookup has not answered or has failed.
 */
export function isUncataloguedFontFamily(family: string): boolean {
  if (isCustomFontFamily(family)) return false;
  return isSystemFontFamily(family) || uncatalogued.has(family);
}

/** Where the loader takes a family from. */
export type FontFamilySource = 'custom' | 'google' | 'fontsource' | 'missing';

const fontSourceListeners = new Set<(family: string) => void>();

/** Calls `cb` each time the loader learns where a family comes from (its
 *  record arrived, or the answer that no service has it). */
export function onFontSourceResolved(cb: (family: string) => void): () => void {
  fontSourceListeners.add(cb);
  return () => { fontSourceListeners.delete(cb); };
}

/**
 * Where a family comes from, as the loader resolved it (#739): `custom`
 * for a family uploaded as files; `fontsource` for one Google Fonts does
 * not have and Fontsource does (#689); `google` for any other family the
 * services know; `missing` for one neither has (a misspelt name, a system
 * font) and for a custom family whose files were removed. It names the
 * catalogue the family belongs to: the files of both are Fontsource's
 * static cuts wherever it has them (#757). Undefined while no answer has
 * come: the request is in flight or was never made. A system font is
 * `missing` from the start, no request made for it (#753).
 */
export function fontFamilySource(family: string): FontFamilySource | undefined {
  if (isCustomFontFamily(family)) return 'custom';
  if (isRemovedCustomFontFamily(family)) return 'missing';
  // Known without asking (#753).
  if (isSystemFontFamily(family)) return 'missing';
  if (!metadataCache.has(family)) return undefined;
  const meta = metadataCache.get(family);
  if (!meta) return 'missing';
  return meta.fontsource ? 'fontsource' : 'google';
}

/**
 * The Google Fonts CSS2 URL of a family the loader has no static files for
 * (#757): the whole weight axis of a variable font, as it was asked for
 * every family before, so canvas text interpolates across intermediate
 * weights.
 *
 * - Variable fonts: use `wght@{min}..{max}`, which makes Google Fonts emit a
 *   single `@font-face` with `font-weight: {min} {max}` pointing to the VF.
 *   This is the only shape the browser will interpolate across on canvas.
 * - Static fonts: request each supported weight explicitly.
 * - Unknown fonts (metadata fetch failed): fall back to the historical
 *   regular/bold pair so the font still renders.
 */
function buildFontUrl(family: string, meta: FontMetadata | null): string {
  const name = encodeURIComponent(family);
  if (!meta) {
    return `https://fonts.googleapis.com/css2?family=${name}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
  }
  const min = Math.min(...meta.weights);
  const max = Math.max(...meta.weights);
  if (meta.variable && min < max) {
    if (meta.hasItalic) {
      return `https://fonts.googleapis.com/css2?family=${name}:ital,wght@0,${min}..${max};1,${min}..${max}&display=swap`;
    }
    return `https://fonts.googleapis.com/css2?family=${name}:wght@${min}..${max}&display=swap`;
  }
  const sorted = [...new Set(meta.weights)].sort((a, b) => a - b);
  if (meta.hasItalic) {
    const parts = sorted.flatMap((w) => [`0,${w}`, `1,${w}`]).join(';');
    return `https://fonts.googleapis.com/css2?family=${name}:ital,wght@${parts}&display=swap`;
  }
  const parts = sorted.join(';');
  return `https://fonts.googleapis.com/css2?family=${name}:wght@${parts}&display=swap`;
}

// ---------------------------------------------------------------------------
// The files of a family: Fontsource's static cuts (#757)
// ---------------------------------------------------------------------------
//
// A book is measured with the same files wherever it is laid out. A
// Cookbook pen loads Fontsource's static cuts (`cookbook/_kit/fonts.js`),
// the command line Google's static instances, and the PDF embeds a static
// cut per weight; Google's style sheet for a browser gives the variable
// file instead, whose advances between two masters are not rounded to the
// font's units, so the same book broke a few lines at another word in the
// Sandbox. The loader therefore declares, for every family Fontsource has
// as files, one face per weight, style and subset from the family's
// package, on the page and for the layout worker, and the PDF provider
// embeds from the same list.
//
// The subsets and their `unicode-range` are read from the package's own
// style sheet (one request per family: every weight and style of a family
// is cut the same way), so they always describe the files of that package;
// the weights and styles come from the Fontsource record. A family whose
// package cannot be read keeps what the loader did before: Google's style
// sheet, or the record's own files for a family Google does not serve.
//
// The files of a cut are declared as the kit declares them
// (`declarationOrder`): `latin` first, then `latin-ext`, and the script's
// own files last, the `arabic` file or the numbered slices of a Chinese or
// Japanese family. That is not the style sheet's order, which ends in
// `latin`, and it decides the few characters two files hold, which the
// file declared last answers for (CSS Fonts 4 §4.5): the ASCII letters and
// digits the numbered slices repeat, the joiners and hyphens the `arabic`
// file holds beside `latin`. Declared in the style sheet's order, a line
// that mixes scripts came out a fraction of a pixel away from the pen's
// (`bulaq-framed-page`, `gojuon-index`) and `japanese-technical-manual`
// broke a note at another character. The PDF provider and the layout
// worker take the same order from here.
//
// A cut goes to the layout worker whole, before the first build that is
// set in it (`worker/LayoutService.ts`), so its files stand there in the
// order they are declared and a chapter is laid out once. A face that
// arrives after a build is measured with all the same: the engine's worker
// makes its canvas resolve those fonts again (#760).

/** The regular face: what a specimen is set in. */
const REGULAR_USE: readonly FontVariantUse[] = [{ weight: 400, style: 'normal' }];

/** The files a family is served as. */
interface FamilyFiles {
  /** Every face of the family, in the order it is declared. */
  faces: FamilyFace[];
  /** For a family served as static cuts, the faces of each, by
   *  `weight|style`, in the order they are declared. Unset for a family
   *  taken from Google's style sheet. */
  cuts?: Map<string, FamilyFace[]>;
  meta: FontMetadata | null;
}

function cutKey(weight: number | string, style: string): string {
  return `${weight}|${isSlanted(style) ? 'italic' : 'normal'}`;
}

function isSlanted(style: string): boolean {
  return /italic|oblique/i.test(style);
}

/** The faces of `faces` by cut. */
function facesByCut(faces: readonly FamilyFace[]): Map<string, FamilyFace[]> {
  const out = new Map<string, FamilyFace[]>();
  for (const face of faces) {
    const key = cutKey(face.weight, face.style);
    const list = out.get(key);
    if (list) list.push(face);
    else out.set(key, [face]);
  }
  return out;
}

/**
 * Every static file of a family, from its Fontsource package: the subsets
 * of one weight's style sheet with its ranges, in the order they are
 * declared (`declarationOrder`), under each weight and style the record
 * lists (a subset the record gives no file for in a weight is left out
 * there). Null when the package's style sheet cannot be had or is not laid
 * out as expected.
 */
/** The version each family's package was answered from, by Fontsource id. */
const packageVersions = new Map<string, string>();

/** The exact version of `family`'s package its files are taken from, once
 *  its style sheet has been read; null before, and when jsDelivr did not
 *  say (#766). */
export function fontsourcePackageVersion(family: string): string | null {
  return packageVersions.get(fontsourceId(family)) ?? null;
}

async function packageFaces(family: string, meta: FontMetadata): Promise<FamilyFace[] | null> {
  const weights = [...new Set(meta.weights)].sort((a, b) => a - b);
  const styles: ('normal' | 'italic')[] = [...(meta.hasUpright ? ['normal' as const] : []), ...(meta.hasItalic ? ['italic' as const] : [])];
  if (weights.length === 0 || styles.length === 0) return null;
  const probeWeight = weights.includes(400) ? 400 : weights[0]!;
  const probeStyle = styles[0]!;
  const cssUrl = fontsourceCssUrl(family, probeWeight, probeStyle);
  let css: string | null;
  // The version of the package this style sheet came from (#766): every
  // file of the family is asked of it, not of the range.
  let version: string | null = null;
  try {
    css = await fetchWithin(cssUrl, async (res) => {
      if (!res.ok) return null;
      version = fontsourceVersionOf(res);
      return await res.text();
    }, { credentials: 'omit' });
  } catch {
    return null;
  }
  if (css === null) return null;
  if (version) packageVersions.set(fontsourceId(family), version);
  const prefix = `${fontsourceId(family)}-`;
  const suffix = `-${probeWeight}-${probeStyle}.woff2`;
  const subsets: { name: string; base: string; unicodeRange?: string }[] = [];
  for (const slice of parseFontsourceCss(css, cssUrl)) {
    const cut = slice.url.lastIndexOf('/') + 1;
    const file = slice.url.slice(cut);
    if (!file.startsWith(prefix) || !file.endsWith(suffix)) return null;
    subsets.push({
      name: file.slice(prefix.length, file.length - suffix.length),
      base: fontsourceUrlAt(slice.url.slice(0, slice.url.length - suffix.length), version),
      ...(slice.unicodeRange ? { unicodeRange: slice.unicodeRange } : {}),
    });
  }
  if (subsets.length === 0) return null;
  const ordered = declarationOrder(subsets, meta.cjk);
  const out: FamilyFace[] = [];
  for (const weight of weights) {
    for (const style of styles) {
      const listed = meta.subsets?.get(`${weight}|${style}`);
      for (const subset of ordered) {
        if (listed && !listed.has(subset.name)) continue;
        out.push({
          family,
          weight: String(weight),
          style,
          ...(subset.unicodeRange ? { unicodeRange: subset.unicodeRange } : {}),
          url: `${subset.base}-${weight}-${style}.woff2`,
        });
      }
    }
  }
  return out.length > 0 ? out : null;
}

const familyFilesCache = new Map<string, Promise<FamilyFiles>>();
/** When a family's faces could not be had, by family. */
const familyFacesFailedAt = new Map<string, number>();
/** How long a family that gave no faces is left alone: every build asks
 *  for its families, and a family that is nowhere would otherwise cost a
 *  failed request per keystroke. */
const FAMILY_FACES_RETRY_MS = 30_000;
/** How long after a family's files could not be had they are asked for
 *  again. */
export const FONT_RETRY_MS = FAMILY_FACES_RETRY_MS;

/**
 * The files of a family that is not a custom one: Fontsource's static
 * cuts where its package can be read; else the record's own files, for a
 * family Google Fonts does not serve (#689); else what Google's style
 * sheet declares. No faces when they cannot be had (the request fails, the
 * family is nowhere), and asked again after a while. Never rejects: a
 * failed style sheet is one family without faces, not a build without
 * fonts (#689).
 */
function familyFiles(family: string): Promise<FamilyFiles> {
  const cached = familyFilesCache.get(family);
  const failedAt = familyFacesFailedAt.get(family);
  if (cached && (failedAt === undefined || Date.now() - failedAt < FAMILY_FACES_RETRY_MS)) return cached;
  familyFacesFailedAt.delete(family);
  const promise = (async (): Promise<FamilyFiles> => {
    if (isGenericFontFamily(family)) return { faces: [], meta: null };
    let meta: FontMetadata | null = null;
    try {
      meta = await fetchFontMetadata(family);
      if (meta) {
        const cuts = (await packageFaces(family, meta)) ?? meta.fontsource;
        if (cuts && cuts.length > 0) return { faces: cuts, cuts: facesByCut(cuts), meta };
        // Not on Google Fonts and no file to be had: nothing to ask Google.
        if (!meta.google) return { faces: [], meta };
      }
      // Google Fonts returns woff2 only if the UA is browser-like. Normal
      // fetch from the main thread inherits the browser UA, so this is
      // fine. From a worker it would return ttf; that's why we do this on
      // the main thread. A family Google does not have answers 400 with no
      // CORS headers, which rejects.
      const sheet = await fetchWithin(buildFontUrl(family, meta), async (res) => (res.ok ? await res.text() : null), { credentials: 'omit' });
      return { faces: sheet === null ? [] : parseFontFaceCss(sheet), meta };
    } catch {
      return { faces: [], meta };
    }
  })();
  familyFilesCache.set(family, promise);
  void promise.then((files) => {
    if (files.faces.length === 0 && familyFilesCache.get(family) === promise) familyFacesFailedAt.set(family, Date.now());
  });
  return promise;
}

/**
 * Every face a family that is not a custom one is served as, in the order
 * it is declared: all its static cuts (each weight and style, in each
 * subset), or the faces of Google's style sheet for a family the loader
 * has no static files for. Empty when they cannot be had.
 */
export function fetchFamilyFaces(family: string): Promise<FamilyFace[]> {
  return familyFiles(family).then((files) => files.faces);
}

/** A weight of a variable Google family between two of its cuts (a 450),
 *  as Google's style sheet serves it: the variable file, declared at that
 *  weight alone. No static cut holds it, so it stays interpolated, as
 *  every weight was before (#757). Empty when it cannot be had. */
const instanceCache = new Map<string, Promise<FamilyFace[]>>();

function instanceFaces(family: string, weight: number, style: 'normal' | 'italic'): Promise<FamilyFace[]> {
  const key = `${family}|${weight}|${style}`;
  const cached = instanceCache.get(key);
  if (cached) return cached;
  const axis = style === 'italic' ? `ital,wght@1,${weight}` : `wght@${weight}`;
  const promise = (async (): Promise<FamilyFace[]> => {
    try {
      const sheet = await fetchWithin(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:${axis}&display=swap`, async (res) => (res.ok ? await res.text() : null), { credentials: 'omit' });
      if (sheet === null) return [];
      return parseFontFaceCss(sheet)
        .filter((face) => isSlanted(face.style) === (style === 'italic'))
        .map((face) => ({ ...face, family, weight: String(weight), style }));
    } catch {
      return [];
    }
  })();
  instanceCache.set(key, promise);
  void promise.then((faces) => {
    if (faces.length === 0 && instanceCache.get(key) === promise) instanceCache.delete(key);
  });
  return promise;
}

/** The style of a family's cuts that answers `style`: its italic for an
 *  italic when it has one, else its upright (which a stand-in declares as
 *  the italic, #688). */
function cutStyle(meta: FontMetadata, style: string): 'normal' | 'italic' {
  if (isSlanted(style)) return meta.hasItalic ? 'italic' : 'normal';
  return meta.hasUpright ? 'normal' : 'italic';
}

/** Whether `weight` falls between two cuts of a variable family. */
function isBetweenCuts(meta: FontMetadata, weight: number): boolean {
  return meta.google && meta.variable && !meta.weights.includes(weight)
    && weight > Math.min(...meta.weights) && weight < Math.max(...meta.weights);
}

/** The weight of `weights` nearest to `target`, the lighter of two as near. */
function nearestWeight(weights: readonly number[], target: number): number {
  const sorted = [...weights].sort((a, b) => a - b);
  return sorted.reduce((best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best), sorted[0]!);
}

/**
 * The faces that answer a weight and slant of a family served as static
 * cuts, in the order they are declared:
 *
 * - the cut of that weight and style, when the family has it;
 * - for a weight between two cuts of a variable family, Google's variable
 *   file at that weight (`instanceFaces`);
 * - else the cut CSS font matching settles on among the family's weights
 *   (a 600 of a family with a 400 and a 700 is its 700), the one a browser
 *   that holds every cut would draw.
 */
async function facesForUse(family: string, files: FamilyFiles, use: FontVariantUse): Promise<FamilyFace[]> {
  const { meta, cuts } = files;
  if (!cuts || !meta) return files.faces;
  const style = cutStyle(meta, use.style);
  const exact = cuts.get(cutKey(use.weight, style));
  if (exact) return exact;
  if (isBetweenCuts(meta, use.weight)) {
    const instance = await instanceFaces(family, use.weight, style);
    if (instance.length > 0) return instance;
  }
  const weight = matchWeight(meta.weights.map(String), use.weight);
  return (weight !== undefined ? cuts.get(cutKey(weight, style)) : undefined) ?? [];
}

/**
 * The static files a PDF embeds for a face of `family` (#757): the cut the
 * previews measure that weight and slant with, its files in the order
 * they are declared. A weight between two cuts of a variable
 * family, which the previews interpolate and no file holds, is answered
 * with the nearest cut (the lighter of two as near). Null for a family the
 * loader has no static files for.
 */
export async function staticFaceFiles(family: string, weight: number, style: 'normal' | 'italic'): Promise<FamilyFace[] | null> {
  if (getCustomFontFamily(family) || isGenericFontFamily(family)) return null;
  // A family the catalogue does not have is not asked of Google for a
  // PDF: its lookup answers once, for every weight and style (#753).
  if (!(await fetchFontMetadata(family))) return null;
  const { meta, cuts } = await familyFiles(family);
  if (!cuts || !meta) return null;
  const s = cutStyle(meta, style);
  const w = meta.weights.includes(weight)
    ? weight
    : isBetweenCuts(meta, weight) ? nearestWeight(meta.weights, weight) : Number(matchWeight(meta.weights.map(String), weight));
  const faces = cuts.get(cutKey(w, s));
  return faces && faces.length > 0 ? faces : null;
}

/**
 * The files a PDF or an SVG picture embeds for a face of a family the
 * previews took from Google's style sheet because it has no static cuts
 * (#993): the sheet's faces of the cut CSS font matching settles on for the
 * weight (an exact one, a range that holds it, else the nearest), in the
 * slant asked, else the upright, in the order they are declared. Null for a
 * custom or generic family, one served as static cuts (`staticFaceFiles`)
 * and one whose sheet could not be had.
 */
export async function sheetFaceFiles(family: string, weight: number, style: 'normal' | 'italic'): Promise<FamilyFace[] | null> {
  if (getCustomFontFamily(family) || isGenericFontFamily(family)) return null;
  const { faces, cuts } = await familyFiles(family);
  if (cuts || faces.length === 0) return null;
  const ofSlant = (italic: boolean) => faces.filter((f) => isSlanted(f.style) === italic);
  const pool = ofSlant(style === 'italic').length > 0 ? ofSlant(style === 'italic') : ofSlant(style !== 'italic');
  if (pool.length === 0) return null;
  const spans = pool.map((f) => f.weight);
  const held = pool.filter((f) => {
    const [lo, hi] = weightSpan(f.weight);
    return weight >= lo && weight <= hi;
  });
  if (held.length > 0) return held;
  const matched = matchWeight(spans, weight);
  const picked = matched === undefined ? [] : pool.filter((f) => f.weight === matched);
  return picked.length > 0 ? picked : null;
}

/** Each unicode-range seen, as ranges from low to high that do not overlap. */
const parsedRanges = new Map<string, Array<[number, number]>>();

function faceHolds(face: FamilyFace, cp: number): boolean {
  if (!face.unicodeRange) return true;
  let ranges = parsedRanges.get(face.unicodeRange);
  if (!ranges) {
    ranges = [];
    for (const [lo, hi] of parseUnicodeRange(face.unicodeRange).sort((a, b) => a[0] - b[0])) {
      const last = ranges[ranges.length - 1];
      if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi);
      else ranges.push([lo, hi]);
    }
    parsedRanges.set(face.unicodeRange, ranges);
  }
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const range = ranges[mid]!;
    if (cp < range[0]) hi = mid - 1;
    else if (cp > range[1]) lo = mid + 1;
    else return true;
  }
  return false;
}

/** For the faces of one cut, which of them answers each code point asked
 *  so far. */
const winnerMemo = new WeakMap<readonly FamilyFace[], Map<number, number>>();

/**
 * The files of one cut (`faces`, in the order they are declared) that a
 * browser draws `codePoints` from: for each, the last face declared whose
 * range holds it (CSS Fonts 4 §4.5). In the order of `faces`. With no
 * character any file holds (a face asked for before its text is known),
 * the file that holds the Latin letters, or the first one declared.
 */
export function facesForCodePoints<T extends FamilyFace>(faces: readonly T[], codePoints?: Iterable<number>): T[] {
  if (faces.length <= 1) return [...faces];
  let memo = winnerMemo.get(faces);
  if (!memo) winnerMemo.set(faces, (memo = new Map()));
  const winner = (cp: number): number => {
    let index = memo.get(cp);
    if (index === undefined) {
      index = -1;
      for (let i = faces.length - 1; i >= 0; i--) {
        if (faceHolds(faces[i]!, cp)) {
          index = i;
          break;
        }
      }
      memo.set(cp, index);
    }
    return index;
  };
  const picked = new Set<number>();
  for (const cp of codePoints ?? []) {
    if (cp < 0x20) continue;
    const index = winner(cp);
    if (index >= 0) picked.add(index);
  }
  if (picked.size === 0) return [faces[Math.max(0, winner(0x61))]!];
  return faces.filter((_, i) => picked.has(i));
}

/** A cut of more files than this is a family cut by slices (a Chinese or
 *  Japanese one: about a hundred files per weight), not by script. */
const SLICED_CUT_FILES = 16;

/**
 * The files of `family` that answer the weights and slants of `uses`, in
 * the order they are declared: every file of each cut, whatever characters
 * a text holds (#757). With `standard`, the regular, the bold and their
 * italics too, which a text asks of a family without its configuration
 * saying so (an emphasis inside a heading, a bold in a caption), unless
 * the family is cut by slices, where a cut is some hundred files. Every
 * face of a family taken from Google's style sheet. None for a custom
 * family, whose files are its own.
 */
export async function familyCutFaces(family: string, uses: readonly FontVariantUse[], options: { standard?: boolean } = {}): Promise<FamilyFace[]> {
  if (getCustomFontFamily(family) || isGenericFontFamily(family)) return [];
  const files = await familyFiles(family);
  if (!files.cuts) return files.faces;
  let asked = uses.length > 0 ? uses : REGULAR_USE;
  if (options.standard) {
    let largest = 0;
    for (const cut of files.cuts.values()) largest = Math.max(largest, cut.length);
    if (largest <= SLICED_CUT_FILES) asked = [...asked, ...STANDARD_FONT_VARIANTS];
  }
  const out: FamilyFace[] = [];
  const seen = new Set<string>();
  for (const use of sortedUses(asked)) {
    for (const face of await facesForUse(family, files, use)) {
      const key = faceCacheKey(face);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(face);
    }
  }
  return out;
}

/** `uses` once each, from light to heavy, upright before italic. */
function sortedUses(uses: readonly FontVariantUse[]): FontVariantUse[] {
  const seen = new Set<string>();
  return uses
    .filter((u) => {
      const key = `${u.weight}|${u.style}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.weight - b.weight || (a.style === b.style ? 0 : a.style === 'normal' ? -1 : 1));
}

/**
 * The faces the built-in designs are set in where a configuration leaves
 * them as they are: the headings and their levels, the lists, the running
 * heads and folios (Open Sans at 600 when no `header` or `footer` is
 * given). The engine's `collectFontUsage` resolves the headings (#1047)
 * but reads the rest of the configuration as written, so it does not see
 * the others; a face a build is set in must be with the layout worker
 * before it starts (#757).
 */
function defaultFontUses(config: PostextConfig): Map<string, FontVariantUse[]> {
  try {
    const body = resolveBodyTextConfig(config.bodyText, config.locale);
    const resolved = {
      headings: resolveHeadingsConfig(config.headings),
      unorderedLists: resolveUnorderedListsConfig(config.unorderedLists, body),
      orderedLists: resolveOrderedListsConfig(config.orderedLists, body, config.locale),
      header: resolveHeaderFooterConfig(config.header, 'header'),
      footer: resolveHeaderFooterConfig(config.footer, 'footer'),
    };
    // The same reading of a node that names a family, on the resolved parts.
    return collectFontUsage(resolved as unknown as PostextConfig);
  } catch {
    return new Map();
  }
}

/** The weights and slants a configuration and its text ask of each family:
 *  the engine's `configFontFaces`, the faces of the built-in designs it
 *  leaves as they are (`defaultFontUses`), and the regular, the bold and
 *  their italics of the faces comic pages are lettered in. A family it
 *  names with no use is asked for its regular face. */
export function configFontUses(config: PostextConfig, markdown?: FontContentText): Map<string, FontVariantUse[]> {
  const out = new Map<string, FontVariantUse[]>();
  for (const family of getConfigFontFamilies(config, markdown)) out.set(family, []);
  const add = (family: string, use: FontVariantUse): void => {
    const list = out.get(family);
    if (list) list.push({ weight: use.weight, style: use.style });
    else out.set(family, [{ weight: use.weight, style: use.style }]);
  };
  for (const face of configFontFaces(config, markdown)) add(face.family, face);
  for (const [family, uses] of defaultFontUses(config)) {
    const name = primaryFontFamily(family);
    // Only the families the configuration sets text in.
    if (out.has(name)) for (const use of uses) add(name, use);
  }
  // The faces comic pages are lettered in: a shout is set in bold, an
  // inner voice in italics, a line's emphasis in either, whatever the
  // styles say. A face with no bold (the default sound-effect faces) is
  // only asked; the engine sets it at 400 (#1047).
  for (const family of comicFontFamilies(config, markdown)) {
    for (const use of STANDARD_FONT_VARIANTS) add(family, use);
  }
  for (const [family, uses] of out) out.set(family, uses.length === 0 ? [...REGULAR_USE] : sortedUses(uses));
  return out;
}

/** Families whose Google style sheet is in the page, by family. */
const sheetLoads = new Map<string, Promise<void>>();

/** Google's style sheet of a family the loader has no static files for,
 *  added to the page once, and its faces loaded. */
function loadStyleSheet(font: string, meta: FontMetadata | null): Promise<void> {
  const existing = sheetLoads.get(font);
  if (existing) return existing;
  const promise = (async () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = buildFontUrl(font, meta);
    const linkLoaded = new Promise<void>((resolve) => {
      link.onload = () => resolve();
      link.onerror = () => resolve();
    });
    document.head.appendChild(link);

    // The stylesheet must be parsed before document.fonts sees the faces;
    // waiting on document.fonts.ready alone can resolve prematurely.
    await Promise.race([
      linkLoaded,
      new Promise<void>((resolve) => setTimeout(resolve, FONT_LOAD_TIMEOUT_MS)),
    ]);

    // Explicitly request each variant so document.fonts tracks them as pending
    const weights = meta?.weights?.length ? meta.weights : [400, 700];
    const quoted = `"${font}"`;
    const specs = meta?.hasItalic
      ? weights.flatMap((w) => [`${w} 16px ${quoted}`, `italic ${w} 16px ${quoted}`])
      : weights.map((w) => `${w} 16px ${quoted}`);
    await Promise.race([
      Promise.all(specs.map((spec) => document.fonts.load(spec).catch(() => []))),
      new Promise<void>((resolve) => setTimeout(resolve, FONT_LOAD_TIMEOUT_MS)),
    ]);

    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => setTimeout(resolve, FONT_LOAD_TIMEOUT_MS)),
    ]);
  })();
  sheetLoads.set(font, promise);
  return promise;
}

/** A weight and slant of a family, declared on the page and loaded. */
function loadUse(font: string, use: FontVariantUse): Promise<void> {
  const key = `${font}|${use.weight}|${use.style}`;
  if (loadedFonts.has(key)) return Promise.resolve();
  const existing = loadingPromises.get(key);
  if (existing) return existing;
  const promise = (async () => {
    const files = await familyFiles(font);
    // Another book's custom family of this name came in meanwhile.
    if (getCustomFontFamily(font)) return;
    if (files.cuts) {
      // The static cut of the face (#757): its files are declared, and
      // the one that holds a space and the Latin letters loaded, as a
      // style sheet's were. The previews load the rest for their text.
      const faces = await facesForUse(font, files, use);
      declareFaces(faces);
      const first = faces[0];
      if (first) await loadFontSpecs([`${isSlanted(first.style) ? 'italic ' : ''}${weightSpan(first.weight)[0]} 16px "${font}"`], ' ');
    } else {
      // No static files (#757): Google's style sheet, as before.
      await loadStyleSheet(font, files.meta);
    }
    loadedFonts.add(key);
  })().finally(() => {
    loadingPromises.delete(key);
  });
  loadingPromises.set(key, promise);
  return promise;
}

/** The feature families (#1237) declared on the page, by the family and
 *  the faces asked of it, and the faces declared for each. */
const featureLoads = new Map<string, Promise<void>>();
const featureFaces = new Map<string, FontFace[]>();

/**
 * Declare on the page the faces of a feature family (a style's figures,
 * #1237, `Lora@onum`) and load the ones that hold a space: its base
 * family's files of the cuts `uses` asks for and their stand-ins (those
 * of a custom family whole), declared again under its name with the
 * features' `featureSettings`, the descriptor the canvas sets the figures
 * with. The base family is loaded first, as any family is; each file is
 * declared once (the engine's `addFeatureFaces`).
 */
function loadFeatureFamily(font: string, base: string, uses: readonly FontVariantUse[]): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts || isGenericFontFamily(base)) return Promise.resolve();
  const asked = uses.length > 0 ? sortedUses(uses) : REGULAR_USE;
  const key = `${font}|${asked.map((u) => `${u.weight}${u.style}`).join(',')}`;
  const known = featureLoads.get(key);
  if (known) return known;
  const promise = (async () => {
    await loadFont(base, asked);
    const files = await verticalFacesOf(base, asked);
    const added = addFeatureFaces(document.fonts, font, files.map((f) => ({
      source: typeof f.source === 'string' ? `url(${JSON.stringify(f.source)})` : f.source,
      descriptors: {
        ...(f.weight ? { weight: f.weight } : {}),
        ...(f.style ? { style: f.style } : {}),
        ...(f.unicodeRange ? { unicodeRange: f.unicodeRange } : {}),
      },
    })));
    const own = featureFaces.get(font);
    if (own) own.push(...(added as FontFace[]));
    else featureFaces.set(font, [...(added as FontFace[])]);
    await loadFontSpecs(asked.map((use) => `${use.style === 'italic' ? 'italic ' : ''}${use.weight} 16px "${font}"`), ' ');
  })().catch(() => {
    featureLoads.delete(key);
  });
  featureLoads.set(key, promise);
  return promise;
}

/** Take off the page the feature families of `families` (their faces were
 *  made from files that changed), so the next load declares them anew. */
function forgetFeatureFamilies(families: readonly string[]): void {
  const bases = new Set(families.map((f) => f.toLowerCase()));
  for (const [font, faces] of [...featureFaces]) {
    if (!bases.has(baseFontFamily(font).toLowerCase())) continue;
    if (typeof document !== 'undefined' && document.fonts) {
      for (const ff of faces) {
        try { document.fonts.delete(ff); } catch { /* ignore */ }
      }
    }
    featureFaces.delete(font);
    facePayloadCache.delete(font);
    for (const key of [...featureLoads.keys()]) if (key.startsWith(`${font}|`)) featureLoads.delete(key);
  }
}

/**
 * Declare a family's faces on the page and load them: the files of a
 * custom family, else Fontsource's static cuts of the weights and slants
 * asked (`uses`; the regular face when none is given, what a specimen is
 * set in), else Google's style sheet for a family the loader has no static
 * files for. Each face is declared once; the promise resolves when the
 * faces asked have loaded or failed.
 */
export function loadFont(font: string, uses: readonly FontVariantUse[] = REGULAR_USE): Promise<void> {
  const parts = featureFamilyParts(font);
  if (parts.features.length > 0) return loadFeatureFamily(font, parts.family, uses);
  const custom = getCustomFontFamily(font);
  if (custom) {
    // The faces it has no file of come from its fallback family (#978);
    // asked on every call, as a later call may name a weight not declared.
    const stand = (): Promise<void> => (custom.fallback ? declareFallbackFaces(custom, uses) : Promise.resolve());
    if (loadedFonts.has(font)) return stand();
    const existing = loadingPromises.get(font);
    if (existing) return existing.then(stand);
    const promise = loadCustomFontFamily(custom).then(() => {
      loadedFonts.add(font);
      loadingPromises.delete(font);
    });
    loadingPromises.set(font, promise);
    return promise.then(stand);
  }

  // A generic keyword names no face: no style sheet to add, nothing to
  // wait for (#753).
  if (isGenericFontFamily(font)) return Promise.resolve();
  if (typeof document === 'undefined') return Promise.resolve();

  return Promise.all((uses.length > 0 ? uses : REGULAR_USE).map((use) => loadUse(font, use))).then(() => {});
}

/**
 * Declare on the page the faces the pages of a laid-out document name
 * (`uses`, by family) and load them for the characters the document sets
 * (`text`), as the wait before a build does for the faces its
 * configuration asks for (#770). `loadFont` loads the file of a cut that
 * holds a space, the Latin one; a cut the pages alone name had its other
 * files (Arabic, Greek, Cyrillic, Latin Extended) fetched by the first
 * paint, which set that text in a fallback face meanwhile: the summaries
 * of the Arabic guide's contents, in Amiri italic at 39.58 px, were painted
 * in the system's Arabic face, «والصفحة» 121.44 px wide in the 111.02 px
 * the layout gave it. A family cut by slices (some hundred files per cut)
 * is left to the page, which fetches the slices its text needs as it
 * paints. Resolves when the faces have loaded, failed or outlasted the
 * timeout.
 */
export async function loadFacesForText(uses: Iterable<readonly [string, readonly FontVariantUse[]]>, text: string): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all([...uses].map(async ([family, list]) => {
    // A feature family (#1237) is its base family's files.
    const base = baseFontFamily(family);
    if (list.length === 0 || isGenericFontFamily(base)) return;
    if (getCustomFontFamily(base)) {
      if (base !== family) await loadFont(family, list);
      return;
    }
    await loadFont(family, list);
    const { cuts } = await familyFiles(base);
    if (cuts) {
      let largest = 0;
      for (const cut of cuts.values()) largest = Math.max(largest, cut.length);
      if (largest > SLICED_CUT_FILES) return;
    }
    await loadFontSpecs(sortedUses(list).map((use) => `${use.style === 'italic' ? 'italic ' : ''}${use.weight} 16px "${family}"`), text);
  }));
}

/** Declare and load the faces a configuration asks of each of its
 *  families (`configFontUses`). */
export function preloadConfigFonts(config: PostextConfig, markdown?: FontContentText): Promise<void> {
  const promises = [...configFontUses(config, markdown)].map(([family, uses]) => loadFont(family, uses));
  return Promise.all(promises).then(() => {});
}

/**
 * Font-spec strings (for `document.fonts.check/load`) covering every
 * family × weight × style combination a build might hit. Size is fixed at
 * 16px because the check is per-face — the actual render size doesn't
 * affect whether a matching face is loaded.
 */
export function getConfigFontSpecs(config: PostextConfig, markdown?: FontContentText): string[] {
  const specs = new Set<string>();
  const push = (family: string) => {
    const q = `"${family}"`;
    specs.add(`400 16px ${q}`);
    specs.add(`700 16px ${q}`);
    specs.add(`italic 400 16px ${q}`);
    specs.add(`italic 700 16px ${q}`);
  };
  for (const f of getConfigFontFamilies(config, markdown)) push(f);
  return [...specs];
}

/**
 * The characters a face must have loaded before a build measures with it,
 * for `document.fonts.check/load`. A Google family comes as one file per
 * script (`latin`, `arabic`… each with its `unicode-range`), and the
 * browser fetches a file only when text needs it: checked with a space
 * alone, an Arabic book would pass with only the Latin file in, measure its
 * first build with a fallback face, and lay out again when the Arabic file
 * lands. A document in a language written in the Arabic script asks for an
 * Arabic letter and digit too. (Chinese faces come in about a hundred
 * slices, fetched as the text needs them; the `loadingdone` rebuild covers
 * those.)
 */
export function configFontSampleText(config: PostextConfig): string {
  const tag = config.locale ?? config.bodyText?.hyphenation?.locale;
  return tag !== undefined && localeScript(tag) === 'Arab' ? ' \u0628\u0661' : ' ';
}

/** The specs of `getConfigFontSpecs` not loaded yet for the document's
 *  text (`configFontSampleText`). */
export function missingConfigFontSpecs(config: PostextConfig, markdown?: FontContentText): string[] {
  if (typeof document === 'undefined' || !document.fonts) return [];
  const text = configFontSampleText(config);
  return getConfigFontSpecs(config, markdown).filter((s) => !document.fonts.check(s, text));
}

/** `document.fonts.load` for each spec, given up after the timeout; a
 *  face that fails to load counts as tried. */
async function loadFontSpecs(specs: readonly string[], text: string): Promise<void> {
  if (specs.length === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.all(specs.map((s) => document.fonts.load(s, text).catch(() => []))),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, FONT_LOAD_TIMEOUT_MS);
    }),
  ]);
  if (timer !== undefined) clearTimeout(timer);
}

/**
 * Ensure every face the given config will render is actually available to
 * `CanvasRenderingContext2D.measureText`. Resolves once all faces pass
 * `document.fonts.check`, or after the timeout. Safe to call repeatedly.
 */
export function ensureConfigFontsLoaded(config: PostextConfig, markdown?: FontContentText): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  // The stand-ins first (#688): once declared they are faces the check
  // below names and the loads that follow bring in.
  if (!standInsSettled(config, markdown)) {
    // Given up after the timeout, like a face that does not load: the
    // previews declare what is left when they look again.
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      declareStandIns(config, markdown).catch(() => false),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, FONT_LOAD_TIMEOUT_MS);
      }),
    ]).then(() => {
      if (timer !== undefined) clearTimeout(timer);
      return loadMissingConfigFonts(config, markdown);
    });
  }
  return loadMissingConfigFonts(config, markdown);
}

function loadMissingConfigFonts(config: PostextConfig, markdown?: FontContentText): Promise<void> {
  const missing = missingConfigFontSpecs(config, markdown);
  if (missing.length === 0) return Promise.resolve();
  // The engine's preparation (#629): every face the configuration asks
  // for, loaded for the characters the text sets (so the Arabic, Greek or
  // CJK slices of a family come in before the first build), the
  // measurements of the families that changed dropped. A face not
  // declared yet gets its static cut, or the family its style sheet
  // (`loadFont`), and is loaded from it.
  return prepareFonts(markdown, config, {
    timeoutMs: FONT_LOAD_TIMEOUT_MS,
    resolve: async (family, weight, style) => {
      await loadFont(family, [{ weight, style }]);
      return null;
    },
  }).then(() => {
    // The preparation loads the faces the configuration sets; the callers
    // hold their build for `missingConfigFontSpecs`, which asks more of
    // each family (a heading face never set in italic is still checked in
    // italic, and answered by the cut matching settles on). For a family
    // taken from Google's style sheet `loadFont` loads all of them, once
    // per family, and Chrome makes the faces of every style sheet anew,
    // unloaded, when another font style sheet lands: a family loaded
    // before the last sheet of the book landed is back to unloaded, and
    // nothing asked for the faces only the check names again, so the
    // previews waited for them without end (#659). What the check still
    // misses is loaded here.
    return loadFontSpecs(missingConfigFontSpecs(config, markdown), configFontSampleText(config));
  });
}

/**
 * A preview's hold on its build until the faces it paints with are loaded
 * (#659). `pending` lists what to wait for, `wait` waits for it, and the
 * preview looks again when the wait ends. A face is waited for once: what
 * a wait ends without (a file that fails or outlasts the timeout) is given
 * up on, and the build goes ahead with the fallback the engine reports; a
 * face that lands later lays the pages out again through `watchFonts`.
 * Looking again can therefore not hold the build twice for the same
 * missing face, whatever the font set answers.
 */
export interface FontGate {
  /** The specs of `missingConfigFontSpecs` to wait for before building:
   *  empty, build. */
  pending(config: PostextConfig, markdown?: FontContentText): string[];
  /** Load them (`ensureConfigFontsLoaded`); the ones still missing when it
   *  settles are not waited for again while they stay missing. */
  wait(config: PostextConfig, markdown?: FontContentText): Promise<void>;
}

/** One per preview. */
export function createFontGate(): FontGate {
  // Sample text and spec of the faces a wait ended without.
  const givenUp = new Set<string>();
  const keyOf = (config: PostextConfig): ((spec: string) => string) => {
    const text = configFontSampleText(config);
    return (spec) => `${text}\n${spec}`;
  };
  return {
    pending(config, markdown) {
      const missing = missingConfigFontSpecs(config, markdown);
      if (givenUp.size === 0) return missing;
      const key = keyOf(config);
      // A face that loaded after all is waited for again if it goes
      // missing once more (its style sheet's faces made anew).
      const still = new Set(missing.map(key));
      for (const k of givenUp) if (!still.has(k)) givenUp.delete(k);
      return missing.filter((s) => !givenUp.has(key(s)));
    },
    async wait(config, markdown) {
      // A preparation that throws ends the wait as one that loaded nothing:
      // the preview is told either way, or it would never look again.
      await ensureConfigFontsLoaded(config, markdown).catch((err: unknown) => {
        console.warn('[postext-sandbox] font preparation failed', err);
      });
      const key = keyOf(config);
      for (const s of missingConfigFontSpecs(config, markdown)) givenUp.add(key(s));
    },
  };
}

// ---------------------------------------------------------------------------
// Worker font payload collection
// ---------------------------------------------------------------------------

const FACE_RE = /@font-face\s*\{([^}]+)\}/g;
const DECL_RES = {
  family: /font-family:\s*['"]?([^;'"]+)['"]?\s*;/i,
  style: /font-style:\s*([^;]+);/i,
  weight: /font-weight:\s*([^;]+);/i,
  unicodeRange: /unicode-range:\s*([^;]+);/i,
  src: /src:\s*url\(([^)]+)\)\s*format\(['"]?woff2['"]?\)/i,
};

function parseFontFaceCss(css: string): FamilyFace[] {
  const out: FamilyFace[] = [];
  for (const match of css.matchAll(FACE_RE)) {
    const body = match[1]!;
    const srcMatch = DECL_RES.src.exec(body);
    const familyMatch = DECL_RES.family.exec(body);
    if (!srcMatch || !familyMatch) continue;
    const weight = DECL_RES.weight.exec(body)?.[1]?.trim() ?? '400';
    const style = DECL_RES.style.exec(body)?.[1]?.trim() ?? 'normal';
    const unicodeRange = DECL_RES.unicodeRange.exec(body)?.[1]?.trim();
    const url = srcMatch[1]!.trim().replace(/^['"]|['"]$/g, '');
    out.push({
      family: familyMatch[1]!.trim(),
      weight,
      style,
      unicodeRange,
      url,
    });
  }
  return out;
}

const facePayloadCache = new Map<string, Promise<FontPayload[]>>();

function faceCacheKey(p: { family: string; weight: string; style: string; unicodeRange?: string }): string {
  return `${p.family}|${p.weight}|${p.style}|${p.unicodeRange ?? ''}`;
}

/** The bytes of each font file fetched, by URL, and when a fetch failed. */
const fileBytes = new Map<string, Promise<ArrayBuffer | null>>();
const fileFailedAt = new Map<string, number>();
/** The files the server answered it has not (a 404): Fontsource's record
 *  lists cuts its package does not hold (Libertinus Sans has no bold
 *  italic, #168). Not asked for again (#757). */
const filesGone = new Set<string>();

/** A font file's bytes, fetched once per URL; null when it cannot be had,
 *  and asked again after a while. */
function fetchFileBytes(url: string): Promise<ArrayBuffer | null> {
  const cached = fileBytes.get(url);
  const failedAt = fileFailedAt.get(url);
  if (cached && (failedAt === undefined || Date.now() - failedAt < FAMILY_FACES_RETRY_MS)) return cached;
  fileFailedAt.delete(url);
  const promise = (async (): Promise<ArrayBuffer | null> => {
    try {
      return await fetchWithin(url, async (r) => {
        if (r.status === 404) filesGone.add(url);
        return r.ok ? await r.arrayBuffer() : null;
      }, { credentials: 'omit' });
    } catch {
      return null; // ignore individual face failures
    }
  })();
  fileBytes.set(url, promise);
  void promise.then((bytes) => {
    if (bytes === null && !filesGone.has(url) && fileBytes.get(url) === promise) fileFailedAt.set(url, Date.now());
  });
  return promise;
}

/** The files of `faces` as worker payloads, in the order of `faces` (a
 *  family's slices overlap at a few code points, where the order they are
 *  added in decides, #629). Each payload holds bytes of its own (the
 *  worker takes them over). A file that fails is left out. */
export async function fetchFacePayloads(faces: readonly FamilyFace[]): Promise<FontPayload[]> {
  const payloads = await Promise.all(faces.map(async (face): Promise<FontPayload | null> => {
    const bytes = await fetchFileBytes(face.url);
    if (!bytes) return null;
    return {
      family: face.family,
      weight: face.weight,
      style: face.style,
      unicodeRange: face.unicodeRange,
      buffer: bytes.slice(0),
    };
  }));
  return payloads.filter((p): p is FontPayload => p !== null);
}

/** The faces a family named alone is sent with: its regular, its bold and
 *  their italics. */
async function fetchFamilyPayloads(name: string): Promise<FontPayload[]> {
  // A feature family (#1237): its base family's files, with its features.
  const family = baseFontFamily(name);
  const custom = getCustomFontFamily(family);
  if (custom) return asFeaturePayloads(name, await fetchCustomFamilyPayloads(custom));
  return asFeaturePayloads(name, await fetchFacePayloads(await familyCutFaces(family, STANDARD_FONT_VARIANTS)));
}

/**
 * Collect `FontPayload` objects (woff2 ArrayBuffers + descriptors) for
 * every face a config and its text ask for, so they can be shipped to a
 * layout worker: every file of each weight and slant of each family (#757),
 * and of a custom family.
 *
 * The buffers are fresh each call (so the caller can transfer them into
 * the worker without detaching a shared copy). The face list and the
 * files' bytes are cached.
 */
export async function collectFontPayloadsForConfig(
  config: PostextConfig,
  markdown?: FontContentText,
): Promise<FontPayload[]> {
  const faces = [...configFontUses(config, markdown)].flatMap(([family, uses]) => uses.map((use) => ({ family, ...use })));
  return collectFontPayloadsForFaces(faces);
}

/**
 * The payloads of `faces` (family, weight, slant): for each family, the
 * files of those cuts, in the order they are declared, and every file of a
 * custom family. With `codePoints`, only the files a browser draws those
 * characters from (what a file that embeds its fonts needs: an EPUB). A
 * family that cannot be fetched gives no payload; the others are collected
 * all the same (#689).
 */
export async function collectFontPayloadsForFaces(
  faces: readonly { family: string; weight: number; style: 'normal' | 'italic' }[],
  codePoints?: Iterable<number>,
): Promise<FontPayload[]> {
  const uses = new Map<string, FontVariantUse[]>();
  for (const face of faces) {
    const list = uses.get(face.family);
    if (list) list.push({ weight: face.weight, style: face.style });
    else uses.set(face.family, [{ weight: face.weight, style: face.style }]);
  }
  const cps = codePoints === undefined ? undefined : [...codePoints];
  // A feature family (#1237): its base family's files, under its name
  // with its features.
  const byFamily = await Promise.all([...uses].map(async ([family, list]) => asFeaturePayloads(family, await familyPayloads(baseFontFamily(family), list, cps))));
  return dedupePayloads(byFamily);
}

/** The payloads of a family's files for the cuts `list` asks for (every
 *  file of a custom family); with `cps`, only the files that hold them.
 *  None when the family cannot be fetched. */
async function familyPayloads(family: string, list: readonly FontVariantUse[], cps: number[] | undefined): Promise<FontPayload[]> {
  try {
    const custom = getCustomFontFamily(family);
    if (custom) return await fetchCustomFamilyPayloads(custom, list);
    const files = await familyFiles(family);
    if (!cps || !files.cuts) return await fetchFacePayloads(await familyCutFaces(family, list));
    // Cut by cut: each has files of its own for the same characters.
    const wanted: FamilyFace[] = [];
    const seen = new Set<string>();
    for (const use of sortedUses(list)) {
      for (const face of facesForCodePoints(await facesForUse(family, files, use), cps)) {
        const key = faceCacheKey(face);
        if (seen.has(key)) continue;
        seen.add(key);
        wanted.push(face);
      }
    }
    return await fetchFacePayloads(wanted);
  } catch {
    return [];
  }
}

/**
 * The payloads of a base family's files as the faces of `family` when it
 * is a feature family (a style's figures, #1237, `Lora@onum`): under its
 * name, with the `featureSettings` of its features, which the worker
 * declares them with. Any other family's payloads as they are.
 */
export function asFeaturePayloads(family: string, payloads: FontPayload[]): FontPayload[] {
  const parts = featureFamilyParts(family);
  if (parts.features.length === 0) return payloads;
  const featureSettings = fontFeatureSettings(parts.features);
  return payloads.map((p) => ({ ...p, family, featureSettings }));
}

function dedupePayloads(groups: readonly FontPayload[][]): FontPayload[] {
  const seen = new Set<string>();
  const flat: FontPayload[] = [];
  for (const group of groups) {
    for (const p of group) {
      const key = faceCacheKey(p);
      if (seen.has(key)) continue;
      seen.add(key);
      flat.push(p);
    }
  }
  return flat;
}

/**
 * Variant of `collectFontPayloadsForConfig` for families named alone: the
 * files of a custom family, and for any other those of its regular, its
 * bold and their italics (every face of a family taken from Google's style
 * sheet). The layout service asks for the cuts a build is set in instead
 * (`familyCutFaces`).
 */
export async function collectFontPayloadsForFamilies(
  families: string[],
): Promise<FontPayload[]> {
  if (families.length === 0) return [];
  const byFamily = await Promise.all(families.map(async (family) => {
    const cached = facePayloadCache.get(family);
    if (cached) {
      // The cached promise resolves with FontPayload[] whose buffers may
      // already have been transferred. Re-fetch to produce fresh buffers,
      // but dedupe concurrent re-fetches.
      return cached.then(async (payloads) => {
        // If any buffer has been neutered (byteLength === 0), re-fetch.
        if (payloads.some((p) => p.buffer.byteLength === 0)) {
          const fresh = fetchFamilyPayloads(family).catch((): FontPayload[] => []);
          facePayloadCache.set(family, fresh);
          return fresh;
        }
        // Clone buffers so transferring to the worker doesn't neuter the cache.
        return payloads.map((p) => ({ ...p, buffer: p.buffer.slice(0) }));
      });
    }
    // A family that cannot be fetched gives no payload; the others of
    // the build are registered all the same (#689).
    const promise = fetchFamilyPayloads(family).catch((): FontPayload[] => []).then((payloads) => {
      // An empty face list means the family could not be fetched (or was
      // looked up before its custom definition landed): don't cache it, so
      // the next build retries instead of measuring with a fallback forever.
      if (payloads.length === 0 && facePayloadCache.get(family) === promise) facePayloadCache.delete(family);
      return payloads;
    });
    facePayloadCache.set(family, promise);
    return promise;
  }));
  // Deduplicate across families (cheap — same family appears at most once).
  return dedupePayloads(byFamily);
}

// ---------------------------------------------------------------------------
// Stand-in faces: a bold or an italic the family has no file for
// ---------------------------------------------------------------------------
//
// A browser asked for the 700 of a family with one 400 file draws the 400
// heavier, and slants an upright for an italic the family lacks: letters no
// file holds, while the PDF embeds the file there is (the provider snaps to
// the nearest weight, and to the upright). The comic faces are the common
// case: a shout and a sound effect are lettered in bold, an inner voice in
// italics, in families that ship one weight (Bangers, Patrick Hand, Zen
// Antique, Dela Gothic One). The Sandbox declares the file the browser
// would have drawn from as the face asked, so the previews set the letters
// the PDF embeds, as the Cookbook kit's comics block and the command line
// do (#688). A weight another real face answers as it is (a 600 set from
// the 700) is left to the browser, and reported by the engine (#650).

/** The weights the heaviest cut of a family with no bold stands in for:
 *  the ones a browser makes bold from a face of 500 or less. */
const BOLD_STAND_IN = '600 900';

/** A weight descriptor (`'400'`, `'bold'`, `'100 900'`) as a range. */
function weightSpan(weight: string): [number, number] {
  const parts = weight.trim().split(/\s+/).map((w) => (w === 'bold' ? 700 : w === 'normal' ? 400 : Number(w)));
  const lo = Number.isFinite(parts[0]) ? parts[0]! : 400;
  const hi = Number.isFinite(parts[1]) ? parts[1]! : lo;
  return [Math.min(lo, hi), Math.max(lo, hi)];
}

/** The weight descriptor CSS font matching settles on for `target` among
 *  `weights` (the engine's `cssWeightOrderOf`: CSS Fonts 4, §5.2). */
function matchWeight(weights: readonly string[], target: number): string | undefined {
  return cssWeightOrderOf(target, [...new Set(weights)], weightSpan)[0];
}

/**
 * The faces to declare beside a family's own (`own`: every file of the
 * family, with its weight, slant and range), each the copy of one of them
 * under another weight or slant:
 *
 * - in each slant, the heaviest cut for 600 to 900 when that cut is 500 or
 *   lighter (the weights a browser would make bold from it);
 * - for a family with no italic, the upright cut each weight of `italics`
 *   (the italics a build asks of the family) is matched to, as an italic.
 *
 * A family with a bold and an italic of its own gets none.
 */
export function standInFaces<T extends { weight: string; style: string }>(own: readonly T[], italics: readonly number[] = []): T[] {
  const upright = own.filter((f) => !isSlanted(f.style));
  const slanted = own.filter((f) => isSlanted(f.style));
  const bold = (pool: readonly T[]): T[] => {
    if (pool.length === 0) return [];
    const top = Math.max(...pool.map((f) => weightSpan(f.weight)[1]));
    if (top > 500) return [];
    return pool.filter((f) => weightSpan(f.weight)[1] === top).map((f) => ({ ...f, weight: BOLD_STAND_IN }));
  };
  const uprightBold = bold(upright);
  const out = [...uprightBold, ...bold(slanted)];
  if (slanted.length === 0 && italics.length > 0) {
    const pool = [...upright, ...uprightBold];
    const weights = pool.map((f) => f.weight);
    const cuts = new Set<string>();
    for (const weight of italics) {
      const cut = matchWeight(weights, weight);
      if (cut !== undefined) cuts.add(cut);
    }
    for (const f of pool) if (cuts.has(f.weight)) out.push({ ...f, style: 'italic' });
  }
  return out;
}

/**
 * The italics a build may ask of each family, by weight: the ones the
 * configuration sets (the engine's `configFontFaces`: the body's emphasis,
 * a style set in italics, code), and the regular and bold italics of the
 * faces comic pages are lettered in (an inner voice is set in italics,
 * emphasis in bold italics). A bold needs no asking: its stand-in follows
 * from the family's faces alone.
 */
export function askedItalics(config: PostextConfig, markdown?: FontContentText): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const add = (family: string, weight: number): void => {
    const list = out.get(family);
    if (!list) out.set(family, [weight]);
    else if (!list.includes(weight)) list.push(weight);
  };
  for (const f of configFontFaces(config, markdown)) if (f.style === 'italic') add(f.family, f.weight);
  for (const family of comicFontFamilies(config, markdown)) {
    for (const v of STANDARD_FONT_VARIANTS) if (v.style === 'italic') add(family, v.weight);
  }
  return out;
}

/** The stand-in faces of a family that is not a custom one, for the
 *  italics asked of it; none when its faces cannot be had. A custom
 *  family keeps what its author uploaded (and its own check, *Missing
 *  font variant*). */
async function familyStandIns(family: string, italics: readonly number[] | undefined): Promise<FamilyFace[]> {
  if (getCustomFontFamily(family)) return [];
  return standInFaces(await fetchFamilyFaces(family), italics);
}

/** `FontFace`s the Sandbox declared itself (the faces of a Fontsource
 *  family, the stand-ins), by face key. */
const declaredFaces = new Set<string>();

/** Declare `faces` in `document.fonts`, each once; they load when a text
 *  or a `load` asks for them. Returns the ones added. */
function declareFaces(faces: readonly FamilyFace[]): FamilyFace[] {
  const FontFaceCtor = (globalThis as { FontFace?: typeof FontFace }).FontFace;
  if (typeof document === 'undefined' || !document.fonts || !FontFaceCtor) return [];
  const added: FamilyFace[] = [];
  for (const face of faces) {
    const key = faceCacheKey(face);
    if (declaredFaces.has(key)) continue;
    declaredFaces.add(key);
    try {
      const declared = new FontFaceCtor(face.family, `url(${JSON.stringify(face.url)}) format('woff2')`, {
        weight: face.weight,
        style: face.style,
        ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
      });
      document.fonts.add(declared);
      // A face of the page that loads is a font file that arrived (#757):
      // the page takes its files over the same line as the loader's
      // requests, which are alive while it does.
      void (declared as { loaded?: Promise<unknown> }).loaded?.then(fontProgress, () => {});
      added.push(face);
    } catch (err) {
      console.warn('[postext-sandbox] failed to declare font face', face.family, face.weight, face.style, err);
    }
  }
  return added;
}

/** Family and the italics asked of it: what a family's stand-ins were
 *  declared for. */
function standInKey(family: string, italics: readonly number[] | undefined): string {
  return `${family}|${[...(italics ?? [])].sort((a, b) => a - b).join(',')}`;
}

/** The keys whose stand-ins are declared on the page (or were tried). */
const settledStandIns = new Set<string>();
const standInDeclarations = new Map<string, Promise<boolean>>();

function standInKeys(config: PostextConfig, markdown?: FontContentText): { family: string; italics: number[] | undefined; key: string }[] {
  const italics = askedItalics(config, markdown);
  return getConfigFontFamilies(config, markdown)
    .filter((family) => !getCustomFontFamily(family))
    .map((family) => ({ family, italics: italics.get(family), key: standInKey(family, italics.get(family)) }));
}

/** Whether the stand-ins of every family of a config are declared on the
 *  page: nothing left for `declareStandIns` to do. */
export function standInsSettled(config: PostextConfig, markdown?: FontContentText): boolean {
  if (typeof document === 'undefined' || !document.fonts || typeof (globalThis as { FontFace?: unknown }).FontFace === 'undefined') return true;
  return standInKeys(config, markdown).every(({ key }) => settledStandIns.has(key));
}

/**
 * Declare on the page the stand-in faces of every family a config sets
 * text in, and load them for the characters of the document, so the canvas
 * paints a bold or an italic the family lacks with the family's own
 * letters. Once per family and set of italics asked. Resolves to whether
 * any face was added (the previews paint again then).
 */
export async function declareStandIns(config: PostextConfig, markdown?: FontContentText): Promise<boolean> {
  if (standInsSettled(config, markdown)) return false;
  const sample = fontSampleText(markdown, config);
  const results = await Promise.all(standInKeys(config, markdown).map(({ family, italics, key }) => {
    if (settledStandIns.has(key)) return false;
    let declaration = standInDeclarations.get(key);
    if (!declaration) {
      declaration = (async (): Promise<boolean> => {
        const added = declareFaces(await familyStandIns(family, italics).catch((): FamilyFace[] => []));
        // One load per weight and slant brings in the files that hold
        // the document's characters.
        const specs = [...new Set(added.map((f) => `${isSlanted(f.style) ? 'italic ' : ''}${weightSpan(f.weight)[0]} 16px "${family}"`))];
        await loadFontSpecs(specs, sample);
        return added.length > 0;
      })().finally(() => {
        settledStandIns.add(key);
        standInDeclarations.delete(key);
      });
      standInDeclarations.set(key, declaration);
    }
    return declaration;
  }));
  return results.some(Boolean);
}

/** A unicode-range holds one of `codePoints`. */
function rangeHolds(unicodeRange: string | undefined, codePoints: ReadonlySet<number>): boolean {
  if (!unicodeRange) return true;
  const ranges = parseUnicodeRange(unicodeRange);
  for (const cp of codePoints) for (const [lo, hi] of ranges) if (cp >= lo && cp <= hi) return true;
  return false;
}

/**
 * The stand-in faces of a build as worker payloads: for every family the
 * config sets text in, the files of its stand-ins that hold a character
 * of the document (a Japanese display face comes as some 120 slices, and a
 * page uses a handful), leaving out the faces of `sent` (face keys, as
 * {@link fontPayloadKey} gives them). The worker registers them after the
 * family's own faces.
 */
export async function collectStandInPayloads(
  config: PostextConfig,
  content: PostextContent | FontContentText,
  sent?: ReadonlySet<string>,
): Promise<FontPayload[]> {
  const markdown = content !== undefined && typeof content === 'object' && !Array.isArray(content) ? (content as PostextContent).markdown : content as FontContentText;
  const italics = askedItalics(config, markdown);
  let codePoints: Set<number> | undefined;
  // A feature family (a style's figures, #1237) takes its base family's
  // stand-ins, under its name with its features.
  const features = configFeatureFamilies(config);
  const out: FontPayload[] = [];
  for (const family of getConfigFontFamilies(config, markdown)) {
    const all = await familyStandIns(family, italics.get(family)).catch((): FamilyFace[] => []);
    if (all.length === 0) continue;
    if (!codePoints) {
      codePoints = new Set<number>();
      for (const ch of fontSampleText(content, config)) codePoints.add(ch.codePointAt(0)!);
    }
    const held = all.filter((face) => rangeHolds(face.unicodeRange, codePoints!));
    const own = held.filter((face) => !sent?.has(faceCacheKey(face)));
    if (own.length > 0) out.push(...await fetchFacePayloads(own));
    for (const feature of features) {
      if (baseFontFamily(feature).toLowerCase() !== family.toLowerCase()) continue;
      const twins = held.filter((face) => !sent?.has(faceCacheKey({ ...face, family: feature })));
      if (twins.length > 0) out.push(...asFeaturePayloads(feature, await fetchFacePayloads(twins)));
    }
  }
  return out;
}

/** The key of a payload's face: family, weight, style and range. */
export function fontPayloadKey(payload: Pick<FontPayload, 'family' | 'weight' | 'style' | 'unicodeRange'>): string {
  return faceCacheKey(payload);
}

// ---------------------------------------------------------------------------
// Custom (user-uploaded) font registry
// ---------------------------------------------------------------------------

const customFontRegistry = new Map<string, CustomFontFamily>();
/** Families declared by an edition laid out behind the reader that the book
 *  on screen does not have (see {@link declareEditionFonts}). */
const editionFamilies = new Map<string, CustomFontFamily>();
/** Names of families registered as a custom font since the book on screen
 *  was opened. Seeded by every `setCustomFonts` call so
 *  `isRemovedCustomFontFamily` can tell "deleted a custom family I had
 *  declared" from "never seen this name". Emptied when another book comes
 *  in (`newBook`): a family the last book bundled may be a Google Font the
 *  next one asks for by name (紅樓夢 bundles Noto Serif SC; the guide's
 *  Chinese edition loads it from Google Fonts). */
const everSeenCustomFamilies = new Set<string>();
/** Listeners notified when the set of known custom families changes. The
 *  payload is the list of family names whose definition changed, was added,
 *  or was removed. Consumers (the worker bundle) use it to drop stale
 *  registrations so the next build reloads the fresh bytes. */
const customFontListeners = new Set<(changedFamilies: string[]) => void>();
/** Document-level FontFace instances we registered, keyed by family — so
 *  `setCustomFonts` can remove them when a family is updated or deleted. */
const registeredCustomFaces = new Map<string, FontFace[]>();
/** The `FontFace`s a family with a `fallback` has from that family (#978),
 *  by family and face key, so they can be removed with it. */
const fallbackFaces = new Map<string, Map<string, FontFace>>();

function variantKey(v: CustomFontVariant): string {
  return `${v.weight}|${v.style}|${v.fileId}`;
}

function familySignature(f: CustomFontFamily): string {
  const vs = [...f.variants].map(variantKey).sort();
  return `${f.name}::${vs.join(';')}${f.fallback ? `::>${f.fallback}` : ''}`;
}

/** Replace the sandbox's known custom fonts. Invalidates every cached
 *  loader state for families that changed, added, or were removed.
 *  `newBook`: the list is another book's (a preset, a project, a draft
 *  opened), not an edit of this one's, so the families left out were not
 *  deleted by the author. */
export function setCustomFonts(list: CustomFontFamily[] | undefined, options: { newBook?: boolean } = {}): void {
  const next = new Map<string, CustomFontFamily>();
  for (const f of list ?? []) next.set(f.name, f);

  const changed: string[] = [];
  for (const [name, fam] of next) {
    const prev = customFontRegistry.get(name);
    if (!prev || familySignature(prev) !== familySignature(fam)) changed.push(name);
  }
  for (const name of customFontRegistry.keys()) {
    if (!next.has(name)) changed.push(name);
  }
  // The families only a background edition declared (#968) give way to the
  // book on screen's: its definition of the name wins, and another book's
  // editions are not this one's.
  for (const name of [...editionFamilies.keys()]) {
    if (options.newBook || next.has(name)) {
      editionFamilies.delete(name);
      if (!changed.includes(name)) changed.push(name);
    }
  }
  // A family set in another custom family's faces (#978) follows it.
  for (const [name, fam] of next) {
    if (fam.fallback && changed.includes(fam.fallback) && !changed.includes(name)) changed.push(name);
  }

  customFontRegistry.clear();
  if (options.newBook) everSeenCustomFamilies.clear();
  for (const [name, fam] of next) {
    customFontRegistry.set(name, fam);
    everSeenCustomFamilies.add(name);
  }

  forgetCustomFamilies(changed);

  // Kick off FontFace registration on document.fonts for every currently
  // declared custom family. Without this, the HTML viewport (which only
  // applies the family via CSS) falls back to a system font because no
  // FontFace matches the name.
  if (typeof document !== 'undefined' && document.fonts) {
    for (const name of customFontRegistry.keys()) {
      loadFont(name).catch(() => { /* individual variant failures are logged below */ });
    }
  }
}

/** Drop what the loader holds of `families` (their loaded state, payloads,
 *  declared faces) and tell the listeners. */
function forgetCustomFamilies(changed: readonly string[]): void {
  forgetFeatureFamilies(changed);
  for (const family of changed) {
    loadedFonts.delete(family);
    loadingPromises.delete(family);
    facePayloadCache.delete(family);
    familyFilesCache.delete(family);
    familyFacesFailedAt.delete(family);
    const faces = registeredCustomFaces.get(family);
    if (faces && typeof document !== 'undefined' && document.fonts) {
      for (const ff of faces) {
        try { document.fonts.delete(ff); } catch { /* ignore */ }
      }
    }
    registeredCustomFaces.delete(family);
    const stood = fallbackFaces.get(family);
    if (stood && typeof document !== 'undefined' && document.fonts) {
      for (const ff of stood.values()) {
        try { document.fonts.delete(ff); } catch { /* ignore */ }
      }
    }
    fallbackFaces.delete(family);
  }

  if (changed.length > 0) {
    for (const cb of customFontListeners) cb([...changed]);
  }
}

/**
 * The custom families an edition laid out behind the reader declares (#968):
 * the book on screen holds one edition's list (`setCustomFonts`), and an
 * edition read from its draft or the bundle may name a family that list
 * lacks. Laid out on the layout worker and painted in the side-by-side view
 * with the book's families only, its text was measured in a fallback face.
 * The families the book on screen does not declare are declared here, for
 * the loader to serve as it serves its own (`getCustomFontFamily`); the
 * book's definition of a name always wins, and another book (`newBook`)
 * drops them.
 */
export function declareEditionFonts(list: readonly CustomFontFamily[] | undefined): void {
  const changed: string[] = [];
  for (const family of list ?? []) {
    if (customFontRegistry.has(family.name)) continue;
    const prev = editionFamilies.get(family.name);
    if (prev && familySignature(prev) === familySignature(family)) continue;
    editionFamilies.set(family.name, family);
    changed.push(family.name);
  }
  if (changed.length === 0) return;
  forgetCustomFamilies(changed);
  if (typeof document !== 'undefined' && document.fonts) {
    for (const name of changed) loadFont(name).catch(() => { /* logged by the loader */ });
  }
}

/** Signature of a custom-font list — of the registry's current contents
 *  when `list` is omitted. Callers compare the two to detect a registry that
 *  drifted from the config it should mirror, including a dev-server hot
 *  reload, which re-evaluates this module (emptying the registry) while
 *  React keeps the config it was seeded from. */
export function customFontsSignature(list?: CustomFontFamily[]): string {
  const source = list ?? Array.from(customFontRegistry.values());
  return source.map(familySignature).sort().join('|');
}

export function getCustomFontFamily(name: string): CustomFontFamily | undefined {
  return customFontRegistry.get(name) ?? editionFamilies.get(name);
}

export function listCustomFontFamilies(): CustomFontFamily[] {
  return Array.from(customFontRegistry.values());
}

export function isCustomFontFamily(name: string): boolean {
  return customFontRegistry.has(name) || editionFamilies.has(name);
}

/** True when `name` was registered as a custom family since the book on
 *  screen was opened but is no longer present — i.e. the user has deleted
 *  it while some `fontFamily` field still references it. */
export function isRemovedCustomFontFamily(name: string): boolean {
  return everSeenCustomFamilies.has(name) && !customFontRegistry.has(name);
}

/** Subscribe to custom-font registry changes. The callback receives the
 *  family names whose definition changed (added, removed, or variant set
 *  altered). Returns an unsubscribe function. */
export function onCustomFontsChanged(cb: (families: string[]) => void): () => void {
  customFontListeners.add(cb);
  return () => { customFontListeners.delete(cb); };
}

async function loadVariantBuffer(variant: CustomFontVariant): Promise<ArrayBuffer | null> {
  const file = await getFontFile(variant.fileId).catch(() => null);
  return file ? file.buffer : null;
}

async function loadCustomFontFamily(family: CustomFontFamily): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const existing = registeredCustomFaces.get(family.name) ?? [];
  // Skip variants that already have a matching FontFace loaded.
  const haveKeys = new Set(
    existing.map((ff) => `${ff.weight}|${ff.style}`),
  );
  const faces: FontFace[] = [...existing];
  await Promise.all(
    family.variants.map(async (variant) => {
      const key = `${variant.weight}|${variant.style}`;
      if (haveKeys.has(key)) return;
      const buffer = await loadVariantBuffer(variant);
      if (!buffer) return;
      try {
        const ff = new FontFace(family.name, buffer, {
          weight: String(variant.weight),
          style: variant.style,
        });
        await ff.load();
        document.fonts.add(ff);
        faces.push(ff);
      } catch (err) {
        console.warn('[postext-sandbox] failed to load custom font variant', family.name, variant, err);
      }
    }),
  );
  registeredCustomFaces.set(family.name, faces);
}

/** The faces `family` has no file of, as another family's (#978): its
 *  `fallback`'s cuts of the weights and slants asked, in the slants the
 *  family has no file of, named for the family. A fallback that is a custom
 *  family gives its own files. */
async function fallbackFacesOf(family: CustomFontFamily, uses: readonly FontVariantUse[]): Promise<FamilyFace[]> {
  const stands = fontFallbackOf([family], family.name);
  if (!stands || getCustomFontFamily(stands)) return [];
  const wanted = [...STANDARD_FONT_VARIANTS, ...uses].filter((use) => !hasOwnStyle(family.variants, use.style));
  if (wanted.length === 0) return [];
  const faces = await familyCutFaces(stands, wanted);
  return faces.filter((face) => !hasOwnStyle(family.variants, isSlanted(face.style) ? 'italic' : 'normal')).map((face) => ({ ...face, family: family.name }));
}

/** The files of another custom family a family stands in for (#978). */
function fallbackCustomVariants(family: CustomFontFamily): CustomFontVariant[] {
  const stands = fontFallbackOf([family], family.name);
  const source = stands ? getCustomFontFamily(stands) : undefined;
  return source ? source.variants.filter((v) => !hasOwnStyle(family.variants, v.style)) : [];
}

/** Declare on the page the faces `family` has from its fallback (#978),
 *  under its own name, and load the one that holds the Latin letters. */
async function declareFallbackFaces(family: CustomFontFamily, uses: readonly FontVariantUse[]): Promise<void> {
  const FontFaceCtor = (globalThis as { FontFace?: typeof FontFace }).FontFace;
  if (typeof document === 'undefined' || !document.fonts || !FontFaceCtor) return;
  let held = fallbackFaces.get(family.name);
  if (!held) fallbackFaces.set(family.name, (held = new Map()));
  const first: FontFace[] = [];
  const add = (key: string, make: () => FontFace, latin: boolean): void => {
    if (held!.has(key)) return;
    try {
      const face = make();
      held!.set(key, face);
      document.fonts.add(face);
      if (latin) first.push(face);
    } catch (err) {
      console.warn('[postext-sandbox] failed to declare fallback font face', family.name, err);
    }
  };
  for (const face of await fallbackFacesOf(family, uses)) {
    add(faceCacheKey(face), () => new FontFaceCtor(family.name, `url(${JSON.stringify(face.url)}) format('woff2')`, {
      weight: face.weight,
      style: face.style,
      ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
    }), faceHolds(face, 0x61));
  }
  for (const variant of fallbackCustomVariants(family)) {
    const key = `${variant.weight}|${variant.style}|${variant.fileId}`;
    if (held.has(key)) continue;
    const buffer = await loadVariantBuffer(variant);
    if (!buffer) continue;
    add(key, () => new FontFaceCtor(family.name, buffer, { weight: String(variant.weight), style: variant.style }), true);
  }
  await Promise.all(first.map((face) => face.load().catch(() => undefined)));
}

async function fetchCustomFamilyPayloads(family: CustomFontFamily, uses: readonly FontVariantUse[] = []): Promise<FontPayload[]> {
  const payloads: FontPayload[] = [];
  if (family.fallback) {
    // Its fallback's faces, named for it (#978).
    const stood = await fetchFacePayloads(await fallbackFacesOf(family, uses));
    payloads.push(...stood);
    await Promise.all(fallbackCustomVariants(family).map(async (variant) => {
      const buffer = await loadVariantBuffer(variant);
      if (buffer) payloads.push({ family: family.name, weight: String(variant.weight), style: variant.style, buffer: buffer.slice(0) });
    }));
  }
  await Promise.all(
    family.variants.map(async (variant) => {
      const buffer = await loadVariantBuffer(variant);
      if (!buffer) return;
      payloads.push({
        family: family.name,
        weight: String(variant.weight),
        style: variant.style,
        buffer: buffer.slice(0),
      });
    }),
  );
  return payloads;
}

/** Resolve which of the standard specs (400/700 × normal/italic) are not
 *  covered by this family's variants. Returns an empty array if every spec
 *  has a matching variant (exact weight + style). */
/** Returns true only when we've conclusively tried and failed to fetch
 *  metadata for `family` from Fontsource (so we know it's not a Google
 *  Font). Returns false while the lookup is pending or not yet started.
 *  A system font is known not to be one without a lookup (#753). */
export function isKnownUnavailableGoogleFont(family: string): boolean {
  if (isSystemFontFamily(family)) return true;
  return metadataCache.has(family) && metadataCache.get(family) === null;
}

export function missingStandardVariants(
  family: CustomFontFamily,
): Array<{ weight: number; style: 'normal' | 'italic' }> {
  return missingVariants(family, STANDARD_FONT_VARIANTS);
}

function missingVariants(family: CustomFontFamily, wanted: readonly FontVariantUse[]): FontVariantUse[] {
  const have = new Set(family.variants.map((v) => `${v.weight}|${v.style}`));
  const seen = new Set<string>();
  const out: FontVariantUse[] = [];
  const stands = fontFallbackOf([family], family.name) !== undefined;
  for (const w of wanted) {
    const key = `${w.weight}|${w.style}`;
    // A slant the fallback sets (#978) is not missing.
    if (stands && !hasOwnStyle(family.variants, w.style)) continue;
    if (have.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

/** The variants `config` (and the text `doc` describes) asks of a
 *  declared custom family that it has no file for — bold or italic set in
 *  a family that only carries a regular face, a weight no face covers. */
export function missingUsedVariants(family: CustomFontFamily, config: PostextConfig, doc?: FontUsageDocument): FontVariantUse[] {
  const wanted = collectFontUsage(config, doc).get(family.name) ?? [];
  return missingVariants(family, wanted);
}

// ---------------------------------------------------------------------------
// Vertical forms for vertical text (canvas)
// ---------------------------------------------------------------------------

/** Whether a config sets any text vertically (`layout.writingMode`, or a
 *  heading style's own layout). */
export function configIsVertical(config: PostextConfig, markdown?: FontContentText): boolean {
  if (config.layout?.writingMode === 'vertical-rl') return true;
  if ((config.headingStyles ?? []).some((s) => s.layout?.writingMode === 'vertical-rl')) return true;
  // Comic balloons of Japanese and Traditional Chinese are lettered in
  // columns (`comics.lettering.writingMode: 'auto'`).
  if (!config.comics && !markdownHasComics(markdown)) return false;
  const mode = config.comics?.lettering?.writingMode;
  if (mode === 'vertical') return true;
  if (mode === 'horizontal') return false;
  const tag = config.locale ?? config.bodyText?.hyphenation?.locale;
  return isJapaneseLanguage(tag) || chineseScriptOf(tag) === 'Hant';
}

/** The twin load of each family, keyed by where its faces come from
 *  ({@link twinSourceKey}): a family whose sources change is loaded again. */
const verticalTwins = new Map<string, { key: string; promise: Promise<boolean> }>();
/** Per family, the source key whose twin load has settled. */
const verticalTwinsDone = new Map<string, string>();

const CATALOGUE_TWIN = 'google:';

/** Where a family's faces come from: the files of a custom family (a file
 *  uploaded again under the same name is another source), else the
 *  catalogue, with the weights and slants asked of it (each is a file of
 *  its own, #757). */
function twinSourceKey(family: string, uses: readonly FontVariantUse[] | undefined): string {
  const custom = getCustomFontFamily(family);
  if (custom) return `custom:${familySignature(custom)}`;
  return `${CATALOGUE_TWIN}${sortedUses(uses ?? REGULAR_USE).map((u) => `${u.weight}${u.style === 'italic' ? 'i' : ''}`).join(',')}`;
}

async function verticalFacesOf(family: string, uses: readonly FontVariantUse[] | undefined, italics?: readonly number[]): Promise<VerticalAlternatesFace[]> {
  const custom = getCustomFontFamily(family);
  if (custom) {
    const faces: VerticalAlternatesFace[] = [];
    await Promise.all(custom.variants.map(async (variant) => {
      const buffer = await loadVariantBuffer(variant);
      if (buffer) faces.push({ source: buffer, weight: String(variant.weight), style: variant.style });
    }));
    return faces;
  }
  // The cuts the book is set in, and the stand-ins too (#688): a shout
  // lettered in columns is set in the bold the family's own file answers
  // for.
  const own = await familyCutFaces(family, uses ?? REGULAR_USE);
  const standIns = standInFaces(await fetchFamilyFaces(family), italics);
  return [...own, ...standIns].map((face) => ({
    source: face.url,
    weight: face.weight,
    style: face.style,
    ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
  }));
}

/**
 * For a config that sets text vertically: load, for every family it uses, a
 * twin with the font's vertical forms (OpenType `vert`) that the canvas
 * paints brackets and punctuation with (see `loadVerticalAlternates` in
 * postext). Once per family and set of faces asked of it; resolves when
 * every family is settled, to whether any family has its twin (the preview
 * repaints then).
 */
export async function loadVerticalTwins(config: PostextConfig, markdown?: FontContentText): Promise<boolean> {
  if (typeof document === 'undefined' || !configIsVertical(config, markdown)) return false;
  const italics = askedItalics(config, markdown);
  const uses = configFontUses(config, markdown);
  const results = await Promise.all(getConfigFontFamilies(config, markdown).map((family) => {
    const key = twinSourceKey(family, uses.get(family));
    const entry = verticalTwins.get(family);
    if (entry && entry.key === key) return entry.promise;
    // A catalogue family asked for another weight or slant: its files
    // join the twin there is.
    const joins = entry !== undefined && entry.key.startsWith(CATALOGUE_TWIN) && key.startsWith(CATALOGUE_TWIN);
    // New sources for a family (a custom font uploaded again, or a book
    // whose font of that name is another file): the old twin's faces go,
    // and the twin is loaded from the new ones.
    if (entry && !joins) {
      unregisterVerticalAlternates(family);
      verticalTwinsDone.delete(family);
    }
    const before = joins ? entry.promise.catch(() => false) : Promise.resolve(false);
    const promise = before
      .then(() => verticalFacesOf(family, uses.get(family), italics.get(family)))
      .then((faces) => loadVerticalAlternates(family, faces))
      .catch(() => false)
      .then((ok) => {
        if (verticalTwins.get(family)?.key === key) verticalTwinsDone.set(family, key);
        return ok;
      });
    verticalTwins.set(family, { key, promise });
    return promise;
  }));
  return results.some(Boolean);
}

/** Whether every family of a vertical config has had its twin tried, from
 *  the family's current sources. */
export function verticalTwinsSettled(config: PostextConfig, markdown?: FontContentText): boolean {
  if (!configIsVertical(config, markdown)) return true;
  const uses = configFontUses(config, markdown);
  return getConfigFontFamilies(config, markdown).every((f) => verticalTwinsDone.get(f) === twinSourceKey(f, uses.get(f)));
}
