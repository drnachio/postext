// Families fetched from Fontsource into the cache folder: their
// metadata, variants and downloads (#1276: split out of fonts.ts).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { type FontVariantUse, cssWeightOrder, configFontFamilies, collectFontUsage, baseFontFamily, STANDARD_FONT_VARIANTS } from 'postext';
import type { Book } from '../input';
import { ensureDir } from '../io';

// ---------------------------------------------------------------------------
// Download cache (Google Fonts)
// ---------------------------------------------------------------------------

export function defaultCacheDir(): string {
  if (process.env.POSTEXT_CACHE_DIR) return process.env.POSTEXT_CACHE_DIR;
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'postext', 'cache');
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'postext');
}

export const slug = (family: string) => family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const variantFile = (v: FontVariantUse) => `${v.weight}-${v.style}.ttf`;

export interface FamilyMeta {
  /** False when neither Google Fonts nor Fontsource has the family. */
  available: boolean;
  weights: number[];
  styles: ('normal' | 'italic')[];
  checkedAt: number;
  /** The family's TrueType files by variant (`400-normal`), for a family
   *  Fontsource carries that Google Fonts does not (Commit Mono, FiraGO):
   *  downloaded from there (#689). */
  files?: Record<string, string>;
  /** The shape of this record: one written before Fontsource's own
   *  families were read (no `v`) is asked again when it says unavailable. */
  v?: number;
}

const META_VERSION = 2;

/** What the Fontsource API says of a family, as far as it is read. */
export interface FontsourceRecord {
  weights?: number[];
  styles?: string[];
  type?: string;
  defSubset?: string;
  variants?: Record<string, Record<string, Record<string, { url?: { ttf?: string } }>>>;
}

/** The TrueType file of each weight and style of a Fontsource record, in
 *  its default subset, by variant key (`400-normal`). */
export function fontsourceFiles(data: FontsourceRecord): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [weight, styles] of Object.entries(data.variants ?? {})) {
    for (const [style, subsets] of Object.entries(styles ?? {})) {
      const subset = subsets?.[data.defSubset ?? 'latin'] ?? Object.values(subsets ?? {})[0];
      const url = subset?.url?.ttf;
      if (url && (style === 'normal' || style === 'italic')) out[`${weight}-${style}`] = url;
    }
  }
  return out;
}

/** How long "Google Fonts does not have it" is believed before asking again. */
const UNAVAILABLE_TTL_MS = 7 * 24 * 3600 * 1000;

export async function familyMeta(family: string, dir: string, offline: boolean): Promise<FamilyMeta | undefined> {
  const file = join(dir, 'meta.json');
  if (existsSync(file)) {
    try {
      const meta = JSON.parse(readFileSync(file, 'utf8')) as FamilyMeta;
      if (meta.available || offline || (meta.v === META_VERSION && Date.now() - meta.checkedAt < UNAVAILABLE_TTL_MS)) return meta;
    } catch {
      // A broken file is fetched again.
    }
  }
  if (offline) return undefined;
  let meta: FamilyMeta;
  try {
    const res = await fetch(`https://api.fontsource.org/v1/fonts/${slug(family)}`);
    if (res.status === 404) meta = { available: false, weights: [], styles: [], checkedAt: Date.now(), v: META_VERSION };
    else if (!res.ok) return undefined;
    else {
      const data = (await res.json()) as FontsourceRecord;
      // Fontsource also lists families that are not on Google Fonts:
      // their files are its own.
      const files = data.type !== undefined && data.type !== 'google' ? fontsourceFiles(data) : undefined;
      meta = files && Object.keys(files).length === 0
        ? { available: false, weights: [], styles: [], checkedAt: Date.now(), v: META_VERSION }
        : {
            available: true,
            weights: (data.weights ?? []).filter((w) => typeof w === 'number'),
            styles: (data.styles ?? ['normal']).filter((s): s is 'normal' | 'italic' => s === 'normal' || s === 'italic'),
            checkedAt: Date.now(),
            ...(files ? { files } : {}),
            v: META_VERSION,
          };
    }
  } catch {
    return undefined;
  }
  ensureDir(dir);
  writeFileSync(file, JSON.stringify(meta));
  return meta;
}

function matchedAvailable(v: FontVariantUse, meta: FamilyMeta): FontVariantUse {
  const style = meta.styles.includes(v.style) ? v.style : 'normal';
  const weights = meta.weights.length > 0 ? meta.weights : [400];
  return { weight: cssWeightOrder(v.weight, weights)[0]!, style };
}

/** The files that answer `variants` in a family: for each, the weight CSS
 *  font matching settles on among those it ships (`cssWeightOrder`), in
 *  the style asked or its upright, each file once (a one-weight family
 *  answers its regular, its bold and their italics with one file). */
export function matchedVariants(variants: readonly FontVariantUse[], meta: FamilyMeta): FontVariantUse[] {
  const out = new Map<string, FontVariantUse>();
  for (const v of variants) {
    const matched = matchedAvailable(v, meta);
    const key = `${matched.weight}|${matched.style}`;
    if (!out.has(key)) out.set(key, matched);
  }
  return [...out.values()];
}

/** Download the variants of a Google family into `dir` (static TrueType
 *  files: the Google Fonts CSS API answers a client that is not a browser
 *  with whole `.ttf` instances, one per weight and style). */
export async function download(family: string, variants: FontVariantUse[], dir: string, files?: Record<string, string>): Promise<void> {
  // A family Google Fonts does not have: Fontsource's own files.
  if (files) {
    ensureDir(dir);
    await Promise.all(variants.map(async (v) => {
      const src = files[`${v.weight}-${v.style}`];
      const file = join(dir, variantFile(v));
      if (!src || existsSync(file)) return;
      const font = await fetch(src);
      if (!font.ok) throw new Error(`Could not download ${src}: ${font.status}`);
      writeFileSync(file, new Uint8Array(await font.arrayBuffer()));
    }));
    return;
  }
  const tuples = [...new Set(variants.map((v) => `${v.style === 'italic' ? 1 : 0},${v.weight}`))].sort((a, b) => {
    const [ia, wa] = a.split(',').map(Number);
    const [ib, wb] = b.split(',').map(Number);
    return ia! - ib! || wa! - wb!;
  });
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:ital,wght@${tuples.join(';')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Fonts answered ${res.status} for "${family}"`);
  const css = await res.text();
  ensureDir(dir);
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
 *  weight its settings name, the bold's included (`boldFontWeight`, #741). */
export function wantedVariants(book: Pick<Book, 'config' | 'chapters'>): Map<string, FontVariantUse[]> {
  const markdown = book.chapters.map((c) => c.markdown);
  const families = configFontFamilies(book.config, markdown);
  const usage = collectFontUsage(book.config, { markdown });
  const out = new Map<string, FontVariantUse[]>();
  for (const name of families) {
    // A feature family (#1237) is set from its base family's files: the
    // base family is looked for with the faces both are asked for.
    const family = baseFontFamily(name);
    const list = [...(out.get(family) ?? []), ...STANDARD_FONT_VARIANTS, ...(usage.get(name) ?? [])];
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
