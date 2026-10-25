import { cssWeightOrder, featureFamilyParts } from 'postext';
import { padTrueTypeGlyphs } from './trueTypePadding.js';
import { PDFDict, PDFName, PDFRef, PDFStream, type PDFDocument, type PDFFont } from 'pdf-lib';
import { fontKey, parseFontString } from './fontString.js';
import { missingGlyphsOf, registerFaceFiles, wantsGlyph, type FaceFiles, type FileDeclaration } from './faceFiles.js';
import { registerFontFamily } from './fontFamilies.js';
import { verticalTwinRefOf } from './verticalFonts.js';
import { shapeInCurrentLanguage } from './shapingLanguage.js';

/** True when `bytes` starts with the `OTTO` magic identifying a CFF-flavored
 *  OpenType font — the ones pdf-lib cannot subset reliably, so they embed
 *  whole (see `preloadFontStrings`). */
function isCffOpenType(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x4f && // O
    bytes[1] === 0x54 && // T
    bytes[2] === 0x54 && // T
    bytes[3] === 0x4f    // O
  );
}

/** The fontkit face behind a pdf-lib custom font — the subset of its API
 *  the width fix below needs. */
interface FontkitFace {
  numGlyphs: number;
  unitsPerEm: number;
  getGlyph(id: number): { advanceWidth: number };
}

/** pdf-lib builds a CID font's `W` (advance widths) array from the glyphs
 *  reachable through the cmap, so a face embedded whole leaves every
 *  GSUB-only glyph — the fi/fl ligatures, contextual alternates — at the
 *  default 1000-unit advance, and viewers draw "refl eja" with a gap after
 *  the ligature (or the next glyph overlapping it). Replace the width
 *  computation with one that covers every glyph in the face. */
export function coverAllGlyphWidths(font: PDFFont): void {
  const embedder = (font as unknown as {
    embedder: { font: FontkitFace; computeWidths: () => unknown[] };
  }).embedder;
  const face = embedder.font;
  const toPdfUnits = 1000 / face.unitsPerEm;
  embedder.computeWidths = () => {
    const widths: number[] = [];
    for (let gid = 0; gid < face.numGlyphs; gid++) {
      widths.push(face.getGlyph(gid).advanceWidth * toPdfUnits);
    }
    return [0, widths];
  };
}

/** UTF-16BE hex of a code point sequence, for a CMap `bfchar` destination. */
function utf16Hex(codePoints: number[]): string {
  let out = '';
  for (const cp of codePoints) {
    if (cp > 0xffff) {
      const v = cp - 0x10000;
      out += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0');
    } else {
      out += cp.toString(16).padStart(4, '0');
    }
  }
  return out;
}

/** A ToUnicode CMap (Identity-H codes = glyph ids) for the given glyphs. */
export function toUnicodeCmap(glyphs: Array<{ id: number; codePoints: number[] }>): string {
  const entries = glyphs
    .filter((g) => g.codePoints.length > 0)
    .sort((a, b) => a.id - b.id)
    .map((g) => `<${g.id.toString(16).padStart(4, '0')}> <${utf16Hex(g.codePoints)}>`);
  let blocks = '';
  for (let i = 0; i < entries.length; i += 100) {
    const chunk = entries.slice(i, i + 100);
    blocks += `${chunk.length} beginbfchar\n${chunk.join('\n')}\nendbfchar\n`;
  }
  return (
    '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n' +
    '/CIDSystemInfo <<\n  /Registry (Adobe)\n  /Ordering (UCS)\n  /Supplement 0\n>> def\n' +
    '/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n' +
    '1 begincodespacerange\n<0000><ffff>\nendcodespacerange\n' +
    blocks +
    'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n'
  );
}

/**
 * A fully embedded face gets a ToUnicode map covering only the glyphs its
 * cmap reaches, so a ligature the shaper substitutes (`fi`, `fl`, `ffi`)
 * has no Unicode value: text extraction drops the letters and PDF/UA
 * validators reject the font (ISO 14289-1 §7.21.7). Record every glyph the
 * layout engine produces for the text actually set — its `codePoints` are
 * the characters it stands for, ligatures included — and write the map
 * from the cmap glyphs plus those.
 */
export function coverAllGlyphUnicode(font: PDFFont): void {
  interface Glyph { id: number; codePoints: number[] }
  const embedder = (font as unknown as {
    embedder: {
      font: FontkitFace & { layout: (text: string, features?: unknown, ...rest: unknown[]) => { glyphs: Glyph[] } };
      glyphCache: { access: () => Glyph[] };
      embedUnicodeCmap: (context: { flateStream: (s: string) => unknown; register: (o: unknown) => unknown }) => unknown;
    };
  }).embedder;
  const face = embedder.font;
  const shaped = new Map<number, number[]>();
  const layout = face.layout.bind(face);
  face.layout = (text, features, ...rest) => {
    const run = layout(text, features, ...rest);
    for (const g of run.glyphs) {
      if (g.codePoints.length > 0 && !shaped.has(g.id)) shaped.set(g.id, g.codePoints);
    }
    return run;
  };
  embedder.embedUnicodeCmap = (context) => {
    const glyphs: Glyph[] = [...embedder.glyphCache.access()];
    const known = new Set(glyphs.map((g) => g.id));
    for (const [id, codePoints] of shaped) if (!known.has(id)) glyphs.push({ id, codePoints });
    return context.register(context.flateStream(toUnicodeCmap(glyphs)));
  };
}

/**
 * Make the face's space glyph for the space (#755). fontkit makes a glyph
 * once, with the characters of the text that first shows it, and the
 * font's `/ToUnicode` map is written from them: in a face that draws the
 * no-break space with the space glyph, a title set before any space
 * (`Nº 12`) would have every space of the document read as a no-break
 * space, or take a span each to read right (`glyphReads` in
 * `pdf-backend/primitives.ts`).
 */
export function spaceGlyphForSpace(font: PDFFont): void {
  const face = (font as unknown as {
    embedder?: { font?: { hasGlyphForCodePoint?(codePoint: number): boolean; glyphForCodePoint?(codePoint: number): unknown } };
  }).embedder?.font;
  if (face?.hasGlyphForCodePoint?.(0x20)) face.glyphForCodePoint?.(0x20);
}

/** What the pages set in a face, handed to the {@link PdfFontProvider}. */
export interface PdfFontRequest {
  /** The characters (Unicode code points) the document sets in the face,
   *  collected from its pages before any is drawn. A provider serving a
   *  family as several files (Fontsource's unicode-range slices) returns
   *  the files that hold them; one serving a single file may ignore it.
   *  May be empty when the render cannot tell (a face asked for with no
   *  text yet). When the same face is asked for again, it lists only the
   *  characters the files already given lack. */
  codePoints: ReadonlySet<number>;
}

/**
 * One file of a face, which may say what its `@font-face` rule says of it:
 * the bytes themselves, carrying two properties, for a provider that
 * knows how the page that measured the layout declared the face (postext
 * #770). A plain `Uint8Array` is a file that says nothing.
 *
 * A browser sets a character in the file declared last among those whose
 * `unicode-range` holds it, and the files of a family overlap: Fontsource
 * repeats the ASCII letters of a Japanese family in its `latin` file and
 * in its numbered slices, the space in every file, the brackets in the
 * `arabic` file of an Arabic one. Two characters set in two files do not
 * kern, so the file decides the width the layout measured. A provider
 * that hands every file of a face this way has each character drawn from
 * the file the browser took it from.
 *
 * The properties ride on the bytes, so a described file is still the
 * `Uint8Array` every reader of a provider expects (the engine's SVG
 * inliner and `bundleFontProvider`, a postext-pdf released before this),
 * and what does not look at them reads the file as before. A copy of the
 * bytes does not carry them: {@link declaredFontFile} puts them on.
 */
export type PdfFontFile = Uint8Array & {
  /** The `unicode-range` of the file's rule, as CSS writes it
   *  (`U+0000-00FF,U+0131,U+4E??`). A file with none answers for every
   *  character, as a rule without the descriptor does. */
  unicodeRange?: string;
  /** Where the file is declared among the files of the face (one weight
   *  and style of the family): any number that grows with the order of
   *  the `@font-face` rules in the page, or of the calls to
   *  `document.fonts.add`; the file with the greatest is the one declared
   *  last. The same file keeps its number in every answer for the face.
   *  Files with none are read in the order given, the first being the
   *  one declared last. */
  order?: number;
};

/** What a {@link PdfFontFile} says of itself. */
export type PdfFontFileDeclaration = FileDeclaration;

/**
 * `bytes` as a file that says how the page declared it: a view of the
 * same bytes (nothing is copied, and `bytes` itself is left as it is)
 * carrying `unicodeRange` and `order` ({@link PdfFontFile}). A plain
 * `Object.assign(bytes, { unicodeRange, order })` does as well where the
 * bytes are the provider's own to mark.
 */
export function declaredFontFile(bytes: Uint8Array, declaration: PdfFontFileDeclaration): PdfFontFile {
  const file: PdfFontFile = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (declaration.unicodeRange !== undefined) file.unicodeRange = declaration.unicodeRange;
  if (declaration.order !== undefined) file.order = declaration.order;
  return file;
}

/** What `file` says of itself, when it says anything a browser would
 *  read: a range that is text, a place that is a number. */
export function declarationOf(file: PdfFontFile): PdfFontFileDeclaration | undefined {
  const unicodeRange = typeof file.unicodeRange === 'string' ? file.unicodeRange : undefined;
  const order = typeof file.order === 'number' && Number.isFinite(file.order) ? file.order : undefined;
  if (unicodeRange === undefined && order === undefined) return undefined;
  return { ...(unicodeRange !== undefined ? { unicodeRange } : {}), ...(order !== undefined ? { order } : {}) };
}

/**
 * The bytes of a face (TrueType, or CFF-flavoured OpenType): one file, or
 * several that together make the face — each holding part of its
 * characters, like the numbered unicode-range slices Fontsource ships for
 * Chinese, Japanese and Korean families. Each file is embedded as its own
 * subset font.
 *
 * A character is drawn from the first file, in the order given, that has
 * a glyph for it. When a file of the face comes with its range
 * ({@link PdfFontFile}), a character is drawn from the file a browser
 * takes it from: the one declared last among those whose range holds it
 * and that have a glyph for it; a character no range holds is drawn from
 * the first file with a glyph. So it is in a document shaped in its own
 * language (`bodyText.shapingLanguage: 'document'`); one that keeps the
 * host's language reads the files in the order given whatever they say,
 * and prints as it did. A provider that describes its files therefore
 * still lists them with the one declared last first.
 *
 * Reject (throw) for a face the provider cannot supply: another cut of
 * the family is set in its place (`fontFallback`).
 */
export type PdfFontProvider = (
  family: string,
  weight: number,
  style: 'normal' | 'italic',
  request?: PdfFontRequest,
) => Promise<PdfFontAnswer>;

/** What a {@link PdfFontProvider} answers a face with. */
export type PdfFontAnswer = PdfFontFile | PdfFontFile[];

/** The files of an answer. */
export function fontFilesOf(answer: PdfFontAnswer): PdfFontFile[] {
  return Array.isArray(answer) ? answer : [answer];
}

/**
 * `provider` answering with files that say nothing: what each says of
 * itself is left off. For a render with no document shaped in its own
 * language, which reads every face as it did before a file could say
 * more (the first file with a glyph), and asks for the same characters.
 */
export function withBareFiles(provider: PdfFontProvider): PdfFontProvider {
  const bare = (file: PdfFontFile): Uint8Array => (declarationOf(file) ? new Uint8Array(file.buffer, file.byteOffset, file.byteLength) : file);
  return async (family, weight, style, request) => {
    const answer = await provider(family, weight, style, request);
    return Array.isArray(answer) ? answer.map(bare) : bare(answer);
  };
}

/** The files of an answer from the one declared first to the one declared
 *  last, as a style sheet lists its rules (`PdfFontFile.order`; a file
 *  with no number takes its place in the answer, the first being the one
 *  declared last). */
export function inDeclarationOrder(files: readonly PdfFontFile[]): PdfFontFile[] {
  return files
    .map((file, at) => ({ file, at, order: declarationOf(file)?.order ?? -at }))
    .sort((a, b) => a.order - b.order || b.at - a.at)
    .map((entry) => entry.file);
}

/** A face some characters of which no file of it has a glyph for; the PDF
 *  draws them as the font's `.notdef` glyph. */
export interface FontMissingGlyphs {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  /** The characters, in the order the pages first set them. */
  characters: string[];
}

/** A problem with a face's file the render works around: a variable font
 *  asked for at a weight other than its default instance (pdf-lib embeds
 *  that instance, so the text prints at the default weight), or a CFF
 *  face larger than the limit embedded whole (pdf-lib cannot subset CFF
 *  outlines reliably). */
export type FontFileIssue =
  | { kind: 'variableFontDefaultInstance'; family: string; weight: number; style: 'normal' | 'italic'; defaultWeight: number }
  | { kind: 'cffEmbeddedWhole'; family: string; weight: number; style: 'normal' | 'italic'; bytes: number };

/** Size from which a CFF face embedded whole is reported: 2 MB, about ten
 *  times a Latin text face, and a fraction of a CJK one (Source Han Serif
 *  is 8 to 25 MB a weight). */
export const CFF_WHOLE_WARN_BYTES = 2 * 1024 * 1024;

/** A face the document asked for, and the face of the same family set in
 *  its place because the provider rejected it (see
 *  {@link FontCache.preloadFontStrings}). */
export interface FontFallback {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  fallback: { weight: number; style: 'normal' | 'italic' };
  /** The provider's error message for the requested face. */
  reason: string;
}

interface FaceSpec {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
}

/** The nine standard weights: the cuts a font provider may have. */
const STANDARD_WEIGHTS: readonly number[] = [100, 200, 300, 400, 500, 600, 700, 800, 900];

// The order CSS font matching tries a family's weights in (CSS Fonts 4
// §5.2) is the engine's: the browser picks the same face, so the PDF
// matches the preview, and the Sandbox and the command line choose by the
// same function.
export { cssWeightOrder };

/** Faces of the same family to try, in order, when the provider rejects
 *  `spec`: every standard weight in the requested style, in CSS matching
 *  order ({@link cssWeightOrder}), then every weight in the other style
 *  the same way — italic falls back to upright, and upright to italic. A
 *  family with no italics (a display face) sets its italic runs upright; a
 *  family shipping only 400 and 700 takes a 600 as 700; one shipping a
 *  single cut sets everything in it. */
export function fallbackFaces(spec: FaceSpec): FaceSpec[] {
  const weights = cssWeightOrder(spec.weight, [...STANDARD_WEIGHTS, spec.weight]);
  const styles: Array<'normal' | 'italic'> = spec.style === 'italic' ? ['italic', 'normal'] : ['normal', 'italic'];
  const out: FaceSpec[] = [];
  for (const style of styles) {
    for (const weight of weights) {
      if (style === spec.style && weight === spec.weight) continue;
      out.push({ family: spec.family, weight, style });
    }
  }
  return out;
}

/** A face as loaded: its files (the first one is the font the renderers
 *  are handed) and the characters it was asked for. */
interface LoadedFace {
  spec: FaceSpec;
  primary: PDFFont;
  files: FaceFiles;
  /** The provider answered with a list: a face that grows when later text
   *  needs characters its files lack. A single file is the whole face. */
  sliced: boolean;
  /** Every character the face was asked for so far. */
  asked: Set<number>;
  /** The growth in progress, one at a time. */
  growing: Promise<void>;
}

export interface FontCacheOptions {
  /** A face the provider rejected and the face set in its place. */
  onFallback?: (fallback: FontFallback) => void;
  /** A variable font asked for at another weight, or a large CFF face
   *  embedded whole (see {@link FontFileIssue}). */
  onFileIssue?: (issue: FontFileIssue) => void;
  /** Size from which a CFF face embedded whole is reported
   *  ({@link CFF_WHOLE_WARN_BYTES} by default). */
  cffWarnBytes?: number;
}

/**
 * Per-document mapping from `family|weight|style` to an embedded pdf-lib
 * font. Entries are populated up-front by `preload()` so that block-level
 * rendering (`get()`) is a sync lookup. A face the provider rejects falls
 * back to another face of its family ({@link fallbackFaces}), reported
 * through `onFallback`; a fontString that fails to parse, or whose family
 * the provider cannot supply at all (no standard weight in either style),
 * is mapped to `null` and reported back via `missing()`. Faces the
 * provider answers with the same file share one embedded font, and
 * `dropUnusedFonts()` keeps the fonts no page draws with out of the file.
 *
 * A face the provider answers with several files (see
 * {@link PdfFontProvider}) embeds each file as a subset of its own; `get()`
 * hands out the first, and the text primitives draw each character from
 * the file that has it, or from the file a browser takes it from when the
 * provider says how the files are declared (`faceFiles.ts`). Asked again
 * for characters its files lack, such a face asks the provider for those
 * only.
 */
export class FontCache {
  private map = new Map<string, PDFFont | null>();
  private failed = new Set<string>();
  /** One load per actual face, shared by every key that falls back to it. */
  private loads = new Map<string, Promise<LoadedFace | null>>();
  /** Provider answers asked for ahead of their turn to embed. */
  private prefetched = new Map<string, Promise<PdfFontAnswer>>();
  /** The faces loaded, in the order they loaded. */
  private faces: LoadedFace[] = [];
  private errors = new Map<string, string>();
  /** Loaded faces by lower-cased family, for lookups nothing preloaded. */
  private byFamily = new Map<string, Array<FaceSpec & { font: PDFFont }>>();
  /** Embeds by the byte length of their file: a provider that answers
   *  several faces with one file (a stand-in for a cut the family lacks)
   *  gets it embedded once, whatever the faces. */
  private byLength = new Map<number, Array<{ bytes: Uint8Array; features: string; font: Promise<PDFFont> }>>();
  /** Every font this cache embedded. */
  private embedded = new Set<PDFFont>();
  private onFallback?: (fallback: FontFallback) => void;
  private onFileIssue?: (issue: FontFileIssue) => void;
  private cffWarnBytes: number;

  constructor(
    private pdfDoc: PDFDocument,
    private provider: PdfFontProvider,
    options?: FontCacheOptions | ((fallback: FontFallback) => void),
  ) {
    const opts = typeof options === 'function' ? { onFallback: options } : options ?? {};
    this.onFallback = opts.onFallback;
    this.onFileIssue = opts.onFileIssue;
    this.cffWarnBytes = opts.cffWarnBytes ?? CFF_WHOLE_WARN_BYTES;
  }

  /** Embed a font file, once per distinct content and features. `spec` is
   *  the face it was first given for (named in a CFF size report); a
   *  feature family's (#1237) file is embedded with its features, which
   *  fontkit and HarfBuzz apply to every run set in it, as the browser
   *  measured it. */
  private embedBytes(bytes: Uint8Array, spec?: FaceSpec): Promise<PDFFont> {
    const features = spec ? featureFamilyParts(spec.family).features : [];
    const featureKey = features.join('+');
    const same = this.byLength.get(bytes.length) ?? [];
    const known = same.find((entry) => entry.features === featureKey && sameBytes(entry.bytes, bytes));
    if (known) return known.font;
    const font = (async (): Promise<PDFFont> => {
      // pdf-lib's CFF subsetter emits a font stream some viewers cannot
      // parse (macOS Preview draws the text in a fallback face), so CFF
      // OpenType (.otf, signature `OTTO`) embeds whole — larger PDF, but
      // every viewer reads it. TrueType fonts subset normally.
      const subset = !isCffOpenType(bytes);
      // fontkit's TrueType subsetter mis-writes the offsets of fonts whose
      // glyph records are not 4-byte aligned (instanced variable fonts,
      // typically): pad them first so every glyph survives the subset.
      const embeddable = subset ? padTrueTypeGlyphs(bytes) : bytes;
      // Given as a list: fontkit records the features it applied in the
      // object it is handed, which pdf-lib hands it again for every run.
      const embedded = await this.pdfDoc.embedFont(embeddable, { subset, ...(features.length > 0 ? { features: [...features] as unknown as Record<string, boolean> } : {}) });
      if (!subset) {
        coverAllGlyphWidths(embedded);
        coverAllGlyphUnicode(embedded);
        if (spec && bytes.length > this.cffWarnBytes) {
          this.onFileIssue?.({ kind: 'cffEmbeddedWhole', ...spec, bytes: bytes.length });
        }
      }
      // Text is shaped in the language in force: the document's, a
      // segment's own (#764).
      shapeInCurrentLanguage(embedded);
      spaceGlyphForSpace(embedded);
      this.embedded.add(embedded);
      return embedded;
    })();
    same.push({ bytes, features: featureKey, font });
    this.byLength.set(bytes.length, same);
    return font;
  }

  /** Embed every file of a provider answer, in order, dropping repeats:
   *  the fonts, and what the provider says of each (the first time it
   *  gives a file). */
  private async embedAnswer(answer: PdfFontAnswer, spec: FaceSpec): Promise<{ fonts: PDFFont[]; declarations: Map<PDFFont, FileDeclaration> }> {
    const fonts: PDFFont[] = [];
    const declarations = new Map<PDFFont, FileDeclaration>();
    for (const file of fontFilesOf(answer)) {
      const font = await this.embedBytes(file, spec);
      if (fonts.includes(font)) continue;
      fonts.push(font);
      const declaration = declarationOf(file);
      if (declaration) declarations.set(font, declaration);
    }
    return { fonts, declarations };
  }

  /** Fetch and embed one face, once; later calls with characters it was
   *  not asked for grow a sliced face (see {@link growFace}). Null when
   *  the provider rejects it or its bytes do not embed. */
  private loadFace(spec: FaceSpec, codePoints: ReadonlySet<number>): Promise<LoadedFace | null> {
    const key = fontKey(spec.family, spec.weight, spec.style);
    const pending = this.loads.get(key);
    if (pending) {
      return pending.then(async (face) => {
        if (face) await this.growFace(face, codePoints);
        return face;
      });
    }
    const load = (async (): Promise<LoadedFace | null> => {
      try {
        const prefetched = this.prefetched.get(key);
        this.prefetched.delete(key);
        const answer = await (prefetched ?? this.provider(fileFamily(spec.family), spec.weight, spec.style, { codePoints }));
        const { fonts, declarations } = await this.embedAnswer(answer, spec);
        if (fonts.length === 0) throw new Error('the font provider returned no file');
        for (const font of fonts) registerFontFamily(font, spec.family);
        const primary = fonts[0]!;
        const face: LoadedFace = {
          spec,
          primary,
          files: registerFaceFiles(primary, fonts.slice(1), declarations),
          sliced: Array.isArray(answer),
          asked: new Set(codePoints),
          growing: Promise.resolve(),
        };
        this.faces.push(face);
        this.checkVariableWeight(face);
        const family = spec.family.toLowerCase();
        const faces = this.byFamily.get(family) ?? [];
        faces.push({ ...spec, font: primary });
        this.byFamily.set(family, faces);
        return face;
      } catch (err) {
        this.errors.set(key, err instanceof Error ? err.message : String(err));
        return null;
      }
    })();
    this.loads.set(key, load);
    return load;
  }

  /** Ask a sliced face's provider for the characters none of its files
   *  has that it was not asked for yet (every character it was not asked
   *  for, when its files came with their ranges), and add the files it
   *  answers. A rejection leaves the face as it is (the characters are
   *  reported as missing when drawn). */
  private growFace(face: LoadedFace, codePoints: ReadonlySet<number>): Promise<void> {
    if (!face.sliced) return Promise.resolve();
    const wanted = new Set<number>();
    for (const cp of codePoints) {
      if (face.asked.has(cp)) continue;
      face.asked.add(cp);
      // A face given with its ranges asks for every character it was not
      // asked for: the file a browser sets it in may be one declared
      // later than the files given so far, though one of those has a
      // glyph for it and a range that holds it.
      if (wantsGlyph(cp) && (face.files.ranged || !face.files.fileFor(cp))) wanted.add(cp);
    }
    if (wanted.size === 0) return face.growing;
    const { family, weight, style } = face.spec;
    face.growing = face.growing.then(async () => {
      try {
        const answer = await this.provider(fileFamily(family), weight, style, { codePoints: wanted });
        const { fonts, declarations } = await this.embedAnswer(answer, face.spec);
        for (const font of fonts) {
          registerFontFamily(font, face.spec.family);
          face.files.add(font, declarations.get(font));
        }
      } catch {
        // The characters stay missing; the render goes on.
      }
    });
    return face.growing;
  }

  /** Report a variable font asked for at a weight other than its default
   *  instance, the one pdf-lib embeds. */
  private checkVariableWeight(face: LoadedFace): void {
    const axes = (face.primary as unknown as { embedder?: { font?: { variationAxes?: Record<string, { default: number }> } } })
      .embedder?.font?.variationAxes;
    const wght = axes?.wght;
    if (!wght || wght.default === face.spec.weight) return;
    this.onFileIssue?.({ kind: 'variableFontDefaultInstance', ...face.spec, defaultWeight: wght.default });
  }

  /**
   * Load the faces of the given font strings: a list, or a map from each
   * font string to the characters the pages set in it (handed to the
   * provider, see {@link PdfFontRequest}). A face already loaded is not
   * asked again, except a sliced one for characters its files lack.
   */
  async preloadFontStrings(fontStrings: Iterable<string | undefined> | ReadonlyMap<string, ReadonlySet<number>>): Promise<void> {
    const jobs = new Map<string, { spec: FaceSpec; codePoints: Set<number> }>();
    const entries: Iterable<[string | undefined, ReadonlySet<number> | undefined]> = fontStrings instanceof Map
      ? (fontStrings as ReadonlyMap<string, ReadonlySet<number>>).entries()
      : Array.from(fontStrings as Iterable<string | undefined>, (fs): [string | undefined, undefined] => [fs, undefined]);
    for (const [fs, codePoints] of entries) {
      if (!fs) continue;
      const parsed = parseFontString(fs);
      if (!parsed) continue;
      const key = fontKey(parsed.family, parsed.weight, parsed.style);
      let job = jobs.get(key);
      if (!job) {
        job = { spec: { family: parsed.family, weight: parsed.weight, style: parsed.style }, codePoints: new Set() };
        jobs.set(key, job);
      }
      for (const cp of codePoints ?? []) job.codePoints.add(cp);
    }

    // Every face is asked of the provider at once, but embedded one after
    // another in the order the pages ask for it: pdf-lib numbers a font's
    // objects when it is embedded, so embedding the faces as their files
    // arrive would write the same document with other bytes on the next
    // run (#1217).
    for (const [key, { spec, codePoints }] of jobs) {
      if (this.map.has(key) || this.loads.has(key) || this.prefetched.has(key)) continue;
      const answer = (async () => this.provider(fileFamily(spec.family), spec.weight, spec.style, { codePoints }))();
      // A rejection is met when the face takes its turn.
      answer.catch(() => {});
      this.prefetched.set(key, answer);
    }
    for (const [key, { spec, codePoints }] of jobs) {
      await (async () => {
        if (this.map.has(key)) {
          // Loaded before (another chapter, a picture's text): a sliced
          // face fetches the files for the characters it lacks.
          const font = this.map.get(key);
          const face = font ? this.faces.find((f) => f.primary === font) : undefined;
          if (face) await this.growFace(face, codePoints);
          return;
        }
        const face = await this.loadFace(spec, codePoints);
        if (face) {
          this.map.set(key, face.primary);
          return;
        }
        // One candidate at a time, so no face is fetched (and embedded)
        // that nothing is set in; a face asked once is never asked again.
        for (const alt of fallbackFaces(spec)) {
          const altFace = await this.loadFace(alt, codePoints);
          if (!altFace) continue;
          this.map.set(key, altFace.primary);
          this.onFallback?.({
            ...spec,
            fallback: { weight: alt.weight, style: alt.style },
            reason: this.errors.get(key) ?? 'rejected by the font provider',
          });
          return;
        }
        this.failed.add(`${spec.family} ${spec.weight}${spec.style === 'italic' ? ' italic' : ''}`);
        this.map.set(key, null);
      })();
    }
  }

  /** Every face some characters drawn in which none of its files has a
   *  glyph for, with those characters — call it once the pages are drawn.
   *  A file shared by several faces is reported with the first. */
  missingGlyphs(): FontMissingGlyphs[] {
    const out: FontMissingGlyphs[] = [];
    const seen = new Set<PDFFont>();
    for (const face of this.faces) {
      // Code point → when it was first met, over every file of the face.
      const firstMet = new Map<number, number>();
      for (const file of face.files.files) {
        if (seen.has(file)) continue;
        seen.add(file);
        for (const [cp, order] of missingGlyphsOf(file) ?? []) {
          // A character another file of the face has was drawn from it.
          if (face.files.fileFor(cp)) continue;
          const known = firstMet.get(cp);
          if (known === undefined || order < known) firstMet.set(cp, order);
        }
      }
      if (firstMet.size === 0) continue;
      const characters = [...firstMet].sort((a, b) => a[1] - b[1]).map(([cp]) => String.fromCodePoint(cp));
      out.push({ ...face.spec, characters });
    }
    return out;
  }

  get(fontString: string): PDFFont | null {
    const parsed = parseFontString(fontString);
    if (!parsed) return null;
    const key = fontKey(parsed.family, parsed.weight, parsed.style);
    const hit = this.map.get(key);
    if (hit !== undefined) return hit;
    // Never preloaded: the nearest loaded face of the family (same style
    // first), so a face the plan missed still paints its text.
    const faces = this.byFamily.get(parsed.family.toLowerCase());
    if (!faces || faces.length === 0) return null;
    const sameStyle = faces.filter((f) => f.style === parsed.style);
    const pool = sameStyle.length > 0 ? sameStyle : faces;
    const weight = cssWeightOrder(parsed.weight, pool.map((f) => f.weight))[0];
    return pool.find((f) => f.weight === weight)!.font;
  }

  missing(): string[] {
    return [...this.failed];
  }

  /** Leave out of the file every font this cache embedded that no page
   *  draws with: a face asked for but never set (the text of a figure
   *  later drawn as a picture, say) would otherwise be written anyway,
   *  since pdf-lib writes every font it embedded. Call it once all pages
   *  are drawn, right before `save()`. */
  dropUnusedFonts(): void {
    // pdf-lib keeps its embedded fonts in a private list and writes each
    // one on save; a font taken out of it is never written.
    const fonts = (this.pdfDoc as unknown as { fonts?: PDFFont[] }).fonts;
    if (!Array.isArray(fonts)) return;
    const used = fontRefsInUse(this.pdfDoc);
    for (let i = fonts.length - 1; i >= 0; i--) {
      const font = fonts[i]!;
      // A font drawn only through its vertical twin is used: the twin's
      // dictionary is written with it.
      const twin = verticalTwinRefOf(font);
      if (this.embedded.has(font) && !used.has(font.ref.toString()) && !(twin !== undefined && used.has(twin))) fonts.splice(i, 1);
    }
  }
}

/** The family whose files a face is set from: a feature family's (#1237)
 *  base family, whose files it embeds with its features. */
function fileFamily(family: string): string {
  return featureFamilyParts(family).family;
}

/** Whether two files hold the same bytes. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** The fonts the pages name in their resources, and in those of the form
 *  XObjects they draw, as reference strings. */
function fontRefsInUse(pdfDoc: PDFDocument): Set<string> {
  const used = new Set<string>();
  const seen = new Set<PDFDict>();
  const visit = (resources: PDFDict | undefined): void => {
    if (!resources || seen.has(resources)) return;
    seen.add(resources);
    const fonts = resources.lookupMaybe(PDFName.of('Font'), PDFDict);
    for (const [, value] of fonts?.entries() ?? []) used.add(value.toString());
    const xobjects = resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
    for (const [, value] of xobjects?.entries() ?? []) {
      // Images and embedded pages are written on save, so a reference
      // may not resolve yet; only a form drawn here can name a font.
      const xobject = value instanceof PDFRef ? pdfDoc.context.lookup(value) : value;
      if (xobject instanceof PDFStream) visit(xobject.dict.lookupMaybe(PDFName.of('Resources'), PDFDict));
    }
  };
  for (const page of pdfDoc.getPages()) visit(page.node.Resources());
  return used;
}
