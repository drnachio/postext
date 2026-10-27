import type { PdfFontFile, PdfFontProvider } from 'postext-pdf';
import type { CustomFontFamily, CustomFontVariant } from 'postext';
import { fontFallbackOf, hasOwnStyle } from 'postext';
import { decompressWoff2 } from 'postext-pdf';
import { facesForCodePoints, fontFamilyWeights, fontsourcePackageVersion, getCustomFontFamily, isUncataloguedFontFamily, sheetFaceFiles, staticFaceFiles } from '../../controls/fonts/fontLoader.js';
import { getFontFile } from '../../storage/fontStorage.js';
import { fontsourceCssUrl, fontsourceFileUrl, fontsourceUrlAt, fontsourceVersionOf, parseFontsourceCss, pickSlices, type FontSlice } from './fontsourceSlices.js';

const bytesCache = new Map<string, Promise<Uint8Array>>();
const slicesCache = new Map<string, Promise<FontSlice[] | null>>();

/** Files fetched at once for one face: a Chinese chapter touches 50 to 90
 *  slices of about 50 KB each. */
const FETCH_CONCURRENCY = 6;
/** Times a file that failed is fetched again before it is left out. */
const FETCH_RETRIES = 1;

function noFiles(family: string): Error {
  return new Error(`Fontsource has no files for the family "${family}"`);
}

function nearestWeight(target: number, available: number[]): number {
  return available.reduce((best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best), available[0]!);
}

function fontsourceWoff2Url(
  family: string,
  weight: number,
  style: 'normal' | 'italic',
): string {
  return fontsourceUrlAt(fontsourceFileUrl(family, 'latin', weight, style), fontsourcePackageVersion(family));
}

/** A WOFF2 file as TrueType bytes, fetched once per URL (a failed fetch is
 *  tried again next time); as fetched with `raw` (an SVG picture's
 *  `@font-face` takes WOFF2 as it is, #630). */
function fetchAndDecompress(url: string, raw = false): Promise<Uint8Array> {
  const key = raw ? `raw:${url}` : url;
  const cached = bytesCache.get(key);
  if (cached) return cached;
  const promise = (async () => {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`font fetch failed: ${res.status} ${url}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    return raw ? buf : decompressWoff2(buf);
  })();
  bytesCache.set(key, promise);
  promise.catch(() => bytesCache.delete(key));
  return promise;
}

/** The files of a Fontsource face, or null when its stylesheet cannot be
 *  had. A stylesheet the CDN does not have (the italic of a family with no
 *  italics, a weight it lacks) is remembered as null; a failed fetch
 *  (offline, a dropped connection) is tried again next time. */
function fetchSlices(family: string, weight: number, style: 'normal' | 'italic'): Promise<FontSlice[] | null> {
  const url = fontsourceCssUrl(family, weight, style);
  const cached = slicesCache.get(url);
  if (cached) return cached;
  const promise = (async (): Promise<FontSlice[] | null> => {
    let res: Response;
    try {
      res = await fetch(url, { mode: 'cors' });
    } catch {
      slicesCache.delete(url);
      return null;
    }
    if (!res.ok) return null;
    // Every file from the version of the package the style sheet came
    // from (#766): the one the previews took, when they read the family.
    const version = fontsourcePackageVersion(family) ?? fontsourceVersionOf(res);
    const slices = parseFontsourceCss(await res.text(), url).map((slice) => ({ ...slice, url: fontsourceUrlAt(slice.url, version) }));
    return slices.length > 0 ? slices : null;
  })();
  slicesCache.set(url, promise);
  return promise;
}

/** A file of a face to fetch: where it is, the characters its rule
 *  answers for, and its place among the rules of the face as the previews
 *  declare them (the greater number is declared later). */
interface DeclaredFile {
  url: string;
  unicodeRange?: string;
  order: number;
}

/** `files`, the files of a face in the order they are declared, each with
 *  its place in `declared`, the whole list of the face. */
function declaredFiles<T extends { url: string; unicodeRange?: string }>(files: readonly T[], declared: readonly T[]): DeclaredFile[] {
  return files.map((file) => ({ url: file.url, ...(file.unicodeRange ? { unicodeRange: file.unicodeRange } : {}), order: declared.indexOf(file) }));
}

/** Each file of a face, fetched with one retry; a file that still fails is
 *  left out, so a CDN hiccup costs the characters of that file (reported as
 *  missing glyphs), not the face. Rejects only when every file failed.
 *  A PDF gets each file saying its range and its place in the declaration
 *  (`PdfFontFile`, #770: two properties on a view of the bytes, the
 *  fetched ones being kept for the next answer), so it sets a character
 *  two files hold in the file the previews took it from; an SVG picture
 *  (`raw`) gets the bytes as they are. */
async function fetchFaceFiles(slices: readonly DeclaredFile[], raw = false): Promise<PdfFontFile[]> {
  const files = await mapLimit(slices, FETCH_CONCURRENCY, async (slice): Promise<PdfFontFile | null> => {
    for (let attempt = 0; ; attempt++) {
      try {
        const bytes = await fetchAndDecompress(slice.url, raw);
        if (raw) return bytes;
        return Object.assign(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
          ...(slice.unicodeRange ? { unicodeRange: slice.unicodeRange } : {}),
          order: slice.order,
        });
      } catch (err) {
        if (attempt >= FETCH_RETRIES) {
          console.warn(`[pdfFontProvider] left out ${slice.url}: ${err instanceof Error ? err.message : String(err)}`);
          return null;
        }
      }
    }
  });
  const got = files.filter((file): file is PdfFontFile => file !== null);
  if (got.length === 0) throw new Error(`font fetch failed: none of the ${slices.length} file(s) of the face could be had`);
  return got;
}

/** `jobs` run at most `limit` at a time, results in order. */
async function mapLimit<T, R>(items: readonly T[], limit: number, job: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await job(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Pick the best uploaded variant for a requested (weight, style):
 *  prefer an exact style match by nearest weight; if no same-style variant
 *  exists, fall back to the nearest-weight variant of the other style. */
function pickCustomVariant(
  family: CustomFontFamily,
  weight: number,
  style: 'normal' | 'italic',
): CustomFontVariant | null {
  if (family.variants.length === 0) return null;
  const sameStyle = family.variants.filter((v) => v.style === style);
  const pool = sameStyle.length > 0 ? sameStyle : family.variants;
  return pool.reduce((best, v) =>
    Math.abs(v.weight - weight) < Math.abs(best.weight - weight) ? v : best,
  pool[0]!);
}

/** One view per stored font file, so an SVG that inlines it again finds
 *  its base64 cached (#630). */
const customViews = new Map<string, Uint8Array>();

async function loadCustomFontBytes(
  family: CustomFontFamily,
  weight: number,
  style: 'normal' | 'italic',
  raw = false,
): Promise<Uint8Array> {
  const variant = pickCustomVariant(family, weight, style);
  if (!variant) {
    throw new Error(`custom font "${family.name}" has no uploaded variants`);
  }
  if (raw && customViews.has(variant.fileId)) return customViews.get(variant.fileId)!;
  const file = await getFontFile(variant.fileId);
  if (!file) {
    throw new Error(`custom font "${family.name}" is missing its uploaded file`);
  }
  const bytes = new Uint8Array(file.buffer);
  // An SVG picture takes every format as uploaded.
  if (raw) {
    customViews.set(variant.fileId, bytes);
    return bytes;
  }
  switch (variant.format) {
    case 'woff2':
      return decompressWoff2(bytes);
    case 'ttf':
    case 'otf':
      return bytes;
    case 'woff':
      throw new Error(
        `.woff is not supported for PDF rendering; re-upload "${variant.fileName ?? family.name}" as .woff2, .ttf, or .otf`,
      );
  }
}

/**
 * Factory for a `PdfFontProvider` backed by Fontsource's jsdelivr CDN: the
 * static files, one per weight and style, the previews are measured with
 * (#757). A variable file would not do: pdf-lib embeds only its default
 * instance, so bold text would render at regular weight.
 *
 * A face is answered from the list the font loader declares for it
 * (`staticFaceFiles`), with the files that hold the characters the
 * document sets in it (issue #196): `latin` alone for English, `latin` and
 * `latin-ext` for Czech, and for a Chinese family the numbered
 * unicode-range slices the text touches — the `latin` file of Noto Serif
 * SC has no Han at all. The weight and the slant are the loader's too: a
 * weight the family has no file for is set in the cut the page draws it
 * from, an italic of a family without italics in its upright.
 *
 * A face of several files is answered with each file saying its
 * `unicode-range` and its place among the files the previews declare
 * (#770): the page sets a character two files hold in the one declared
 * last, and the PDF of a document shaped in its own language follows it. The numbered slices of a Japanese family repeat the ASCII
 * letters of its `latin` file and are declared after it, the `arabic`
 * file of an Arabic one has a space and brackets its range does not
 * claim; without the ranges the PDF took such a character from the first
 * file with a glyph, which kerns it against other neighbours than the
 * layout measured.
 *
 * With `raw`, files come as stored or fetched (WOFF2 and WOFF included),
 * for the `@font-face` rules of SVG pictures (#630), and say nothing of
 * themselves.
 */
export function createPdfFontProvider(options: { raw?: boolean } = {}): PdfFontProvider {
  const raw = options.raw === true;
  const provider: PdfFontProvider = async (family, weight, style, request) => {
    // Custom families bypass the Google/Fontsource path entirely: resolve
    // bytes from IndexedDB and only decompress when the uploaded file was
    // .woff2. Skip the shared `bytesCache` because the user can re-upload
    // or delete variants at any time, and the fileId captures identity.
    const custom = getCustomFontFamily(family);
    if (custom) {
      // A slant the family has no file of is the fallback's it names (#978).
      const stands = fontFallbackOf([custom], custom.name);
      if (stands && !hasOwnStyle(custom.variants, style)) return await provider(stands, weight, style, request);
      return await loadCustomFontBytes(custom, weight, style, raw);
    }

    // A system font named in a `font-family` list, or a name the catalogue
    // answered it does not have: its style sheets and files are not there
    // to ask for, weight by weight and style by style (#753). Known before
    // the family is looked up for the first, once its lookup answers for
    // the second.
    if (isUncataloguedFontFamily(family)) throw noFiles(family);
    // The cut the previews measure this face with, in the order its files
    // are declared; the browser looks a character up from the last one
    // declared, and so does the PDF, which is told each file's place.
    const cut = await staticFaceFiles(family, weight, style);
    if (isUncataloguedFontFamily(family)) throw noFiles(family);
    if (cut) return fetchFaceFiles(declaredFiles(facesForCodePoints(cut, request?.codePoints), cut).reverse(), raw);

    // A family the loader has no static files for (it took Google's style
    // sheet): Fontsource's files of the nearest weight, where it has any.
    const available = await fontFamilyWeights(family);
    const targetWeight = available ? nearestWeight(weight, available) : weight;

    // The files that hold the text; a family with no italic sets its
    // italic runs upright.
    const slices = (await fetchSlices(family, targetWeight, style))
      ?? (style === 'italic' ? await fetchSlices(family, targetWeight, 'normal') : null);
    if (slices) {
      // `pickSlices` answers the last rule of the sheet first.
      return fetchFaceFiles(declaredFiles(pickSlices(slices, request?.codePoints), slices), raw);
    }

    // Nothing at Fontsource: the faces of Google's style sheet the previews
    // declare for it (#993), the files of a fallback that only Google serves.
    const sheet = await sheetFaceFiles(family, weight, style);
    if (sheet) return fetchFaceFiles(declaredFiles(facesForCodePoints(sheet, request?.codePoints), sheet).reverse(), raw);

    try {
      return await fetchAndDecompress(fontsourceWoff2Url(family, targetWeight, style), raw);
    } catch (err) {
      if (style === 'italic') {
        return await fetchAndDecompress(fontsourceWoff2Url(family, targetWeight, 'normal'), raw);
      }
      throw err;
    }
  };
  return provider;
}
