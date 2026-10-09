// The faces a book is measured, painted and embedded with. In the browser
// the Sandbox loads them into the page (the book's own files, or Google
// Fonts); here they are registered with Skia and handed to the PDF and
// EPUB writers. Each family the configuration names is looked up, in
// order:
//
//   1. the book's own font files (a family the book carries is never mixed
//      with faces from anywhere else);
//   2. the folders given with --font-dir;
//   3. the faces compiled into the executable (EB Garamond, Open Sans);
//   4. the download cache;
//   5. Google Fonts, saved to the cache (not with --offline).
//
// A family found nowhere is measured and drawn with the fallback face under
// its own name, so the layout and the PDF agree, and a warning says so.

import { GlobalFonts } from '@napi-rs/canvas';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join } from 'node:path';
import { collectFontUsage, configFontFamilies, STANDARD_FONT_VARIANTS, type FontVariantUse } from 'postext';
import { decompressWoff2 } from 'postext-pdf';
import { EMBEDDED_FACES, FALLBACK_FAMILY, readEmbedded } from './assets';
import type { Book } from './input';
import type { Reporter } from './log';

export type FaceSource = 'book' | 'font-dir' | 'embedded' | 'cache' | 'download' | 'fallback';

export interface Face {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  /** TrueType or OpenType bytes (WOFF2 is decoded on load). */
  bytes: Uint8Array;
  format: 'ttf' | 'otf';
  source: FaceSource;
  /** The family this face really is, when it stands in for another. */
  standsInFor?: string;
}

export interface FontOptions {
  fontDirs: string[];
  offline: boolean;
  cacheDir?: string;
}

export class FontSet {
  /** `faces`: every face registered; `families`: those the book sets text
   *  in (the rest is the PDF writer's fallback). */
  constructor(readonly faces: Face[], readonly families: ReadonlySet<string>) {}

  /** The faces of the families the book sets text in. */
  usedFaces(): Face[] {
    const used = new Set([...this.families].map((f) => f.toLowerCase()));
    return this.faces.filter((f) => used.has(f.family.toLowerCase()));
  }

  familyFaces(family: string): Face[] {
    const key = family.toLowerCase();
    return this.faces.filter((f) => f.family.toLowerCase() === key);
  }

  /** The face of `family` closest to the weight and style asked for (the
   *  browser's matching: same style first, then nearest weight). */
  pick(family: string, weight: number, style: 'normal' | 'italic'): Face | undefined {
    const faces = this.familyFaces(family);
    if (faces.length === 0) return undefined;
    const sameStyle = faces.filter((f) => f.style === style);
    const pool = sameStyle.length > 0 ? sameStyle : faces;
    return pool.reduce((best, f) => (Math.abs(f.weight - weight) < Math.abs(best.weight - weight) ? f : best), pool[0]!);
  }

  /** `postext-pdf`'s font provider. */
  provider(): (family: string, weight: number, style: 'normal' | 'italic') => Promise<Uint8Array> {
    return async (family, weight, style) => {
      const face = this.pick(family, weight, style) ?? this.pick(FALLBACK_FAMILY, weight, style);
      if (!face) throw new Error(`No face for font family "${family}"`);
      return face.bytes;
    };
  }
}

// ---------------------------------------------------------------------------
// Registering with Skia
// ---------------------------------------------------------------------------

const registered = new Set<string>();

function register(face: Face): void {
  const key = `${face.family}|${face.weight}|${face.style}|${face.source}|${face.bytes.byteLength}`;
  if (registered.has(key)) return;
  registered.add(key);
  // Skia reads the weight and the slant from the file itself, as the
  // browser does from @font-face; the alias is the family the book names.
  GlobalFonts.register(Buffer.from(face.bytes.buffer, face.bytes.byteOffset, face.bytes.byteLength), face.family);
}

// ---------------------------------------------------------------------------
// Reading font files
// ---------------------------------------------------------------------------

interface FontMeta {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
}

let fontkitModule: typeof import('@pdf-lib/fontkit') | undefined;

/** Family, weight and style of a TrueType / OpenType file, from its tables. */
export async function readFontMeta(bytes: Uint8Array): Promise<FontMeta | undefined> {
  fontkitModule ??= await import('@pdf-lib/fontkit');
  const fontkit = (fontkitModule as unknown as { default?: typeof import('@pdf-lib/fontkit') }).default ?? fontkitModule;
  try {
    const font = fontkit.create(bytes) as unknown as {
      getName(key: string): string | null;
      familyName: string;
      italicAngle: number;
      'OS/2'?: { usWeightClass?: number; fsSelection?: { italic?: boolean } };
    };
    const family = font.getName('preferredFamily') ?? font.familyName;
    if (!family) return undefined;
    const os2 = font['OS/2'];
    const italic = os2?.fsSelection?.italic === true || (font.italicAngle ?? 0) !== 0;
    return { family, weight: os2?.usWeightClass ?? 400, style: italic ? 'italic' : 'normal' };
  } catch {
    return undefined;
  }
}

const FONT_EXT = new Set(['.ttf', '.otf', '.woff2']);

/** TrueType / OpenType bytes of a font file (WOFF2 decoded). */
export async function fontBytes(file: string, bytes: Uint8Array): Promise<{ bytes: Uint8Array; format: 'ttf' | 'otf' }> {
  if (extname(file).toLowerCase() === '.woff2') return { bytes: await decompressWoff2(bytes), format: 'ttf' };
  return { bytes, format: extname(file).toLowerCase() === '.otf' ? 'otf' : 'ttf' };
}

/** Every font in `dir`, with the family, weight and style its tables give. */
export async function scanFontDir(dir: string): Promise<Face[]> {
  const out: Face[] = [];
  const walk = async (d: string) => {
    for (const name of readdirSync(d)) {
      if (name.startsWith('.')) continue;
      const path = join(d, name);
      if (statSync(path).isDirectory()) {
        await walk(path);
        continue;
      }
      if (!FONT_EXT.has(extname(name).toLowerCase())) continue;
      const decoded = await fontBytes(name, new Uint8Array(readFileSync(path))).catch(() => undefined);
      if (!decoded) continue;
      const meta = await readFontMeta(decoded.bytes);
      if (meta) out.push({ ...meta, ...decoded, source: 'font-dir' });
    }
  };
  if (existsSync(dir)) await walk(dir);
  return out;
}

// ---------------------------------------------------------------------------
// Download cache (Google Fonts)
// ---------------------------------------------------------------------------

export function defaultCacheDir(): string {
  if (process.env.POSTEXT_CACHE_DIR) return process.env.POSTEXT_CACHE_DIR;
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'postext', 'cache');
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'postext');
}

const slug = (family: string) => family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const variantFile = (v: FontVariantUse) => `${v.weight}-${v.style}.ttf`;

interface FamilyMeta {
  /** False when Google Fonts does not have the family. */
  available: boolean;
  weights: number[];
  styles: ('normal' | 'italic')[];
  checkedAt: number;
}

/** How long "Google Fonts does not have it" is believed before asking again. */
const UNAVAILABLE_TTL_MS = 7 * 24 * 3600 * 1000;

async function familyMeta(family: string, dir: string, offline: boolean): Promise<FamilyMeta | undefined> {
  const file = join(dir, 'meta.json');
  if (existsSync(file)) {
    try {
      const meta = JSON.parse(readFileSync(file, 'utf8')) as FamilyMeta;
      if (meta.available || offline || Date.now() - meta.checkedAt < UNAVAILABLE_TTL_MS) return meta;
    } catch {
      // A broken file is fetched again.
    }
  }
  if (offline) return undefined;
  let meta: FamilyMeta;
  try {
    const res = await fetch(`https://api.fontsource.org/v1/fonts/${slug(family)}`);
    if (res.status === 404) meta = { available: false, weights: [], styles: [], checkedAt: Date.now() };
    else if (!res.ok) return undefined;
    else {
      const data = (await res.json()) as { weights?: number[]; styles?: string[]; category?: string; type?: string };
      // Fontsource also lists families that are not on Google Fonts.
      meta = data.type !== undefined && data.type !== 'google'
        ? { available: false, weights: [], styles: [], checkedAt: Date.now() }
        : {
            available: true,
            weights: (data.weights ?? []).filter((w) => typeof w === 'number'),
            styles: (data.styles ?? ['normal']).filter((s): s is 'normal' | 'italic' => s === 'normal' || s === 'italic'),
            checkedAt: Date.now(),
          };
    }
  } catch {
    return undefined;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(meta));
  return meta;
}

function nearestAvailable(v: FontVariantUse, meta: FamilyMeta): FontVariantUse {
  const style = meta.styles.includes(v.style) ? v.style : 'normal';
  const weights = meta.weights.length > 0 ? meta.weights : [400];
  const weight = weights.reduce((best, w) => (Math.abs(w - v.weight) < Math.abs(best - v.weight) ? w : best), weights[0]!);
  return { weight, style };
}

/** Download the variants of a Google family into `dir` (static TrueType
 *  files: the Google Fonts CSS API answers a client that is not a browser
 *  with whole `.ttf` instances, one per weight and style). */
async function download(family: string, variants: FontVariantUse[], dir: string): Promise<void> {
  const tuples = [...new Set(variants.map((v) => `${v.style === 'italic' ? 1 : 0},${v.weight}`))].sort((a, b) => {
    const [ia, wa] = a.split(',').map(Number);
    const [ib, wb] = b.split(',').map(Number);
    return ia! - ib! || wa! - wb!;
  });
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:ital,wght@${tuples.join(';')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Fonts answered ${res.status} for "${family}"`);
  const css = await res.text();
  mkdirSync(dir, { recursive: true });
  const faces = [...css.matchAll(/font-style:\s*(\w+);\s*font-weight:\s*(\d+);[^}]*?url\(([^)]+)\)/g)];
  await Promise.all(faces.map(async ([, style, weight, src]) => {
    const file = join(dir, variantFile({ weight: Number(weight), style: style === 'italic' ? 'italic' : 'normal' }));
    if (existsSync(file)) return;
    const font = await fetch(src!);
    if (!font.ok) throw new Error(`Could not download ${src}: ${font.status}`);
    writeFileSync(file, new Uint8Array(await font.arrayBuffer()));
  }));
}

// ---------------------------------------------------------------------------
// Resolving a book's fonts
// ---------------------------------------------------------------------------

/** What each family of the book needs: regular, bold and their italics
 *  (what the Sandbox loads for every family: settings inherit weights the
 *  config does not spell out, such as the headings' bold), and any other
 *  weight its settings name. */
function wantedVariants(book: Book): Map<string, FontVariantUse[]> {
  const families = configFontFamilies(book.config, book.chapters.map((c) => c.markdown));
  const usage = collectFontUsage(book.config);
  const out = new Map<string, FontVariantUse[]>();
  for (const family of families) {
    const list = [...STANDARD_FONT_VARIANTS, ...(usage.get(family) ?? [])];
    const seen = new Set<string>();
    out.set(family, list.filter((v) => {
      const k = `${v.weight}|${v.style}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }));
  }
  return out;
}

const fontDirCache = new Map<string, Promise<Face[]>>();
const embeddedFaces: Face[] = [];

function embedded(): Face[] {
  if (embeddedFaces.length === 0) {
    for (const f of EMBEDDED_FACES) {
      embeddedFaces.push({ family: f.family, weight: f.weight, style: f.style, bytes: readEmbedded(f.path), format: 'ttf', source: 'embedded' });
    }
  }
  return embeddedFaces;
}

export async function resolveFonts(book: Book, options: FontOptions, reporter: Reporter): Promise<FontSet> {
  const faces: Face[] = [];
  // 1. The book's own files.
  for (const f of book.fonts) {
    try {
      const decoded = await fontBytes(f.file, new Uint8Array(f.bytes));
      faces.push({ family: f.family, weight: f.weight, style: f.style, ...decoded, source: 'book' });
    } catch (err) {
      reporter.warn({ kind: 'fontUnreadable', severity: 'warning', message: `${f.file}: ${(err as Error).message}` });
    }
  }
  const dirFaces = (await Promise.all(options.fontDirs.map((d) => {
    let p = fontDirCache.get(d);
    if (!p) fontDirCache.set(d, (p = scanFontDir(d)));
    return p;
  }))).flat();
  const cacheRoot = join(options.cacheDir ?? defaultCacheDir(), 'fonts');
  const has = (family: string) => faces.some((f) => f.family.toLowerCase() === family.toLowerCase());

  const wanted = wantedVariants(book);
  for (const [family, variants] of wanted) {
    if (has(family)) continue;
    const key = family.toLowerCase();
    // 2. --font-dir.
    const fromDir = dirFaces.filter((f) => f.family.toLowerCase() === key);
    if (fromDir.length > 0) {
      faces.push(...fromDir.map((f) => ({ ...f, family })));
      continue;
    }
    // 3–5. Embedded faces, the cache and Google Fonts, variant by variant.
    const found: Face[] = embedded().filter((f) => f.family.toLowerCase() === key).map((f) => ({ ...f, family }));
    const missing = variants.filter((v) => !found.some((f) => f.weight === v.weight && f.style === v.style));
    if (missing.length > 0) {
      const dir = join(cacheRoot, slug(family));
      const meta = await familyMeta(family, dir, options.offline);
      if (meta?.available) {
        const targets = missing.map((v) => nearestAvailable(v, meta))
          .filter((v) => !found.some((f) => f.weight === v.weight && f.style === v.style));
        const absent = targets.filter((v) => !existsSync(join(dir, variantFile(v))));
        if (absent.length > 0 && !options.offline) {
          reporter.info(`downloading ${family} (${absent.map((v) => `${v.weight}${v.style === 'italic' ? ' italic' : ''}`).join(', ')}) from Google Fonts`);
          try {
            await download(family, absent, dir);
          } catch (err) {
            reporter.warn({ kind: 'fontDownload', severity: 'warning', message: `${family}: ${(err as Error).message}` });
          }
        }
        for (const v of targets) {
          const file = join(dir, variantFile(v));
          if (!existsSync(file)) continue;
          const source: FaceSource = absent.some((a) => a.weight === v.weight && a.style === v.style) ? 'download' : 'cache';
          found.push({ family, weight: v.weight, style: v.style, bytes: new Uint8Array(readFileSync(file)), format: 'ttf', source });
        }
      }
    }
    if (found.length > 0) {
      faces.push(...found);
      continue;
    }
    // Nowhere: the fallback face stands in under the family's name.
    reporter.warn({
      kind: 'missingFont',
      severity: 'warning',
      message: `font family "${family}" is not in the book${options.offline ? ' (offline)' : ' nor on Google Fonts'}; set in ${FALLBACK_FAMILY} instead (add it with --font-dir)`,
    });
    faces.push(...embedded().filter((f) => f.family === FALLBACK_FAMILY).map((f) => ({ ...f, family, source: 'fallback' as const, standsInFor: FALLBACK_FAMILY })));
  }
  // The fallback family is always there for the PDF writer.
  if (!has(FALLBACK_FAMILY)) faces.push(...embedded().filter((f) => f.family === FALLBACK_FAMILY));
  for (const face of faces) register(face);
  return new FontSet(faces, new Set([...wanted.keys(), ...book.fonts.map((f) => f.family)]));
}
