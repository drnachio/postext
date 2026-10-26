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
//   5. Google Fonts, or Fontsource for a family Google Fonts does not have,
//      saved to the cache (not with --offline).
//
// A weight a family does not ship is set in the face CSS font matching
// settles on for it (the engine's `cssWeightOrder`: the 700 for a 550 of a
// family with a 400 and a 700, as a browser, the Sandbox and the PDF writer
// choose, #757), and a slant it does not ship in its upright, each as it
// is (the regular of a one-weight display face for its bold): the files
// the Sandbox declares as stand-ins and the PDF embeds. A family found
// nowhere is measured and drawn with the fallback face under its own name,
// so the layout and the PDF agree, and a warning says so.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type FontVariantUse, fontFallbackOf, configFeatureFamilies, featureFamilyParts, exportStandInOf, type VDTDocument, documentFontFaces } from 'postext';
import { FALLBACK_FAMILY, EMBEDDED_FACES, readEmbedded } from './assets';
import type { Book } from './input';
import type { Reporter, Warning } from './log';
import { fontBytes, scanFontDir } from './fonts/fontFiles';
import { defaultCacheDir, wantedVariants, type FamilyMeta, slug, familyMeta, matchedVariants, variantFile, download } from './fonts/fontsource';
import { matchedFace, register, registerStandIns, registerFeatureFamily } from './fonts/skia';

export { matchedFace, skiaFontShorthand, fileStyleFlags, restyleFace } from './fonts/skia';
export { readFontMeta, fontBytes, scanFontDir } from './fonts/fontFiles';
export { defaultCacheDir, fontsourceFiles, matchedVariants, wantedVariants } from './fonts/fontsource';
export type { FamilyMeta, FontsourceRecord } from './fonts/fontsource';

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
   *  in (the rest is the PDF writer's fallback); `shipped`: by family in
   *  lower case, the weights and slants the family is known to ship (the
   *  download cache's record of it), whether or not the set holds them. */
  constructor(
    readonly faces: Face[],
    readonly families: ReadonlySet<string>,
    readonly shipped: ReadonlyMap<string, readonly FontVariantUse[]> = new Map(),
    /** The faces a file that leaves the book is set in for a family the
     *  book may not hand on (#993); see {@link FontSet.exportStandIn}. */
    private readonly standIns: (family: string) => Promise<Face[]> = async () => [],
  ) {}

  /** The open faces that take the place of a family the book may not hand
   *  on (`redistributable: false`) in an EPUB or an HTML file: the book's
   *  `fallback` for it, in every weight and slant the pages ask, named for
   *  the family and marked `standsInFor`. Empty for any other family, and
   *  for one whose fallback is nowhere. The family's own files, if the
   *  book carries them, stay out of the file. */
  exportStandIn(family: string): Promise<Face[]> {
    return this.standIns(family);
  }

  /** The faces of the families the book sets text in. */
  usedFaces(): Face[] {
    const used = new Set([...this.families].map((f) => f.toLowerCase()));
    return this.faces.filter((f) => used.has(f.family.toLowerCase()));
  }

  familyFaces(family: string): Face[] {
    const key = family.toLowerCase();
    return this.faces.filter((f) => f.family.toLowerCase() === key);
  }

  /** The face of `family` that answers the weight and style asked for (the
   *  browser's matching: same style first, then the weight CSS font
   *  matching settles on, {@link matchedFace}). */
  pick(family: string, weight: number, style: 'normal' | 'italic'): Face | undefined {
    return matchedFace(this.familyFaces(family), weight, style);
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
  // What each family ships, where the cache has its record (#741): a face
  // the pages ask for that the family has and the set does not is reported
  // after the layout (`fontFallbackWarnings`). Read from disk only: a
  // family the book or a font folder supplies is never asked about online.
  const shipped = new Map<string, FontVariantUse[]>();
  const ships = (family: string, meta: FamilyMeta | undefined) => {
    if (!meta?.available) return;
    const styles = meta.styles.length > 0 ? meta.styles : ['normal' as const];
    shipped.set(family.toLowerCase(), meta.weights.flatMap((weight) => styles.map((style) => ({ weight, style }))));
  };
  // The faces of one family the book does not carry: --font-dir, the
  // embedded faces, the cache and Google Fonts or Fontsource, variant by
  // variant. Empty when the family is nowhere.
  const lookup = async (family: string, variants: readonly FontVariantUse[]): Promise<Face[]> => {
    const key = family.toLowerCase();
    // 2. --font-dir.
    const fromDir = dirFaces.filter((f) => f.family.toLowerCase() === key);
    if (fromDir.length > 0) return fromDir.map((f) => ({ ...f, family }));
    // 3–5. Embedded faces, the cache and Google Fonts, variant by variant.
    const found: Face[] = embedded().filter((f) => f.family.toLowerCase() === key).map((f) => ({ ...f, family }));
    const missing = variants.filter((v) => !found.some((f) => f.weight === v.weight && f.style === v.style));
    if (missing.length > 0) {
      const dir = join(cacheRoot, slug(family));
      const meta = await familyMeta(family, dir, options.offline);
      ships(family, meta);
      if (meta?.available) {
        const targets = matchedVariants(missing, meta)
          .filter((v) => !found.some((f) => f.weight === v.weight && f.style === v.style));
        const absent = targets.filter((v) => !existsSync(join(dir, variantFile(v))));
        if (absent.length > 0 && !options.offline) {
          reporter.info(`downloading ${family} (${absent.map((v) => `${v.weight}${v.style === 'italic' ? ' italic' : ''}`).join(', ')}) from ${meta.files ? 'Fontsource' : 'Google Fonts'}`);
          try {
            await download(family, absent, dir, meta.files);
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
    return found;
  };
  for (const [family, variants] of wanted) {
    const named = fontFallbackOf(book.config.customFonts, family);
    // The open family a bundle names for the faces it leaves out (#978):
    // its cut of the same weight and slant stands in under this family's
    // name, so the lines break near where the real face breaks them.
    const standIn = async (have: readonly Face[]): Promise<Face[]> => {
      if (!named) return [];
      // All the faces of a family with no file; the slant it has none of
      // otherwise (an italic), its own files answering the weights.
      const lacking = variants.filter((v) => !have.some((f) => f.style === v.style));
      if (lacking.length === 0) return [];
      const stand = (await lookup(named, lacking)).map((f) => ({ ...f, family, standsInFor: named }));
      if (stand.length > 0) reporter.info(`font family "${family}": ${have.length > 0 ? 'faces' : 'all faces'} not in the book, set in ${named} (the fallback the book names)`);
      return stand;
    };
    if (has(family) || dirFaces.some((f) => f.family.toLowerCase() === family.toLowerCase())) {
      ships(family, await familyMeta(family, join(cacheRoot, slug(family)), true));
    }
    if (has(family)) {
      faces.push(...await standIn(faces.filter((f) => f.family.toLowerCase() === family.toLowerCase())));
      continue;
    }
    // A family the book declares with a fallback is the book's own typeface:
    // no catalogue has it, so only --font-dir is asked before the fallback.
    let found = named
      ? dirFaces.filter((f) => f.family.toLowerCase() === family.toLowerCase()).map((f) => ({ ...f, family }))
      : await lookup(family, variants);
    if (found.length === 0) found = await standIn([]);
    if (found.length > 0) {
      faces.push(...found);
      continue;
    }
    // Nowhere: the fallback face stands in under the family's name.
    reporter.warn({
      kind: 'missingFont',
      severity: 'warning',
      message: `font family "${family}" is not in the book${options.offline ? ' (offline)' : ' nor on Google Fonts or Fontsource'}; set in ${FALLBACK_FAMILY} instead (add it with --font-dir)`,
    });
    faces.push(...embedded().filter((f) => f.family === FALLBACK_FAMILY).map((f) => ({ ...f, family, source: 'fallback' as const, standsInFor: FALLBACK_FAMILY })));
  }
  // The fallback family is always there for the PDF writer.
  if (!has(FALLBACK_FAMILY)) faces.push(...embedded().filter((f) => f.family === FALLBACK_FAMILY));
  for (const face of faces) register(face);
  // A bold or an italic a family does not ship is drawn from the face
  // of its own that answers for it, as the PDF embeds it (#688). A family the book carries
  // is left as its author made it.
  const carried = new Set(book.fonts.map((f) => f.family.toLowerCase()));
  for (const [family, variants] of wanted) {
    if (carried.has(family.toLowerCase())) continue;
    registerStandIns(family, faces.filter((f) => f.family.toLowerCase() === family.toLowerCase()), variants);
  }
  // The figures a style sets (#1237): its feature family, from the base
  // family's faces (and their stand-ins).
  for (const family of configFeatureFamilies(book.config)) {
    const base = featureFamilyParts(family).family;
    const copies = registerFeatureFamily(family, faces);
    if (!carried.has(base.toLowerCase())) {
      const variants = [...wanted].find(([name]) => name.toLowerCase() === base.toLowerCase())?.[1] ?? [];
      registerStandIns(family, copies, variants);
    }
  }
  // What a file that leaves the book is set in for a family it may not hand
  // on (#993), looked up when a writer asks.
  const stands = new Map<string, Promise<Face[]>>();
  const standIns = (family: string): Promise<Face[]> => {
    const key = family.toLowerCase();
    const named = exportStandInOf(book.config.customFonts, family);
    if (!named) return Promise.resolve([]);
    let found = stands.get(key);
    if (!found) {
      const variants = [...wanted].find(([name]) => name.toLowerCase() === key)?.[1] ?? [];
      // The book's own files of the fallback first (an open face it carries
      // under that name), else wherever a family is looked for.
      const carried = faces.filter((f) => f.family.toLowerCase() === named.toLowerCase() && f.source === 'book');
      const own = carried.length > 0
        ? [...new Set(variants.flatMap((v) => matchedFace(carried, v.weight, v.style) ?? []))]
        : [];
      found = (own.length > 0 ? Promise.resolve(own) : lookup(named, variants)).then((list) => list.map((f) => ({ ...f, family, standsInFor: named })));
      stands.set(key, found);
    }
    return found;
  };
  return new FontSet(faces, new Set([...wanted.keys(), ...book.fonts.map((f) => f.family)]), shipped, standIns);
}

/**
 * The faces the pages were set in that the set does not hold although
 * their family ships them (#741): offline with no cached file, a download
 * that failed, a font folder without the file. The canvas measured the
 * text with another face of the family, so lines and pages may differ
 * from a host that has the face. A weight or a slant the family does not
 * ship stays silent: the face that answers for it stands in on purpose
 * (#688).
 */
export function fontFallbackWarnings(docs: readonly VDTDocument[], fonts: FontSet): Warning[] {
  const out: Warning[] = [];
  const seen = new Set<string>();
  for (const doc of docs) {
    for (const face of documentFontFaces(doc)) {
      const key = `${face.family.toLowerCase()}|${face.weight}|${face.style}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ships = fonts.shipped.get(face.family.toLowerCase());
      if (!ships?.some((v) => v.weight === face.weight && v.style === face.style)) continue;
      const used = fonts.pick(face.family, face.weight, face.style);
      if (!used || (used.weight === face.weight && used.style === face.style)) continue;
      const name = (weight: number, style: string) => `${weight}${style === 'italic' ? ' italic' : ''}`;
      out.push({
        kind: 'fontFallback',
        severity: 'warning',
        message: `${face.family} ${name(face.weight, face.style)}: the family ships this face but it is not loaded (offline with no cached file, a failed download or a font folder without it); the text is set in its ${name(used.weight, used.style)} instead, and lines may break otherwise than where the face is there`,
      });
    }
  }
  return out;
}
