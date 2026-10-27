import { cssWeightOrder, featureFamilyParts } from 'postext';
import { padTrueTypeGlyphs } from './trueTypePadding.js';
import { type PDFFont, type PDFDocument, PDFDict, PDFName, PDFRef, PDFStream } from 'pdf-lib';
import { fontKey, parseFontString } from './fontString.js';
import { type FileDeclaration, registerFaceFiles, wantsGlyph, missingGlyphsOf } from './faceFiles.js';
import { registerFontFamily } from './fontFamilies.js';
import { verticalTwinRefOf } from './verticalFonts.js';
import { shapeInCurrentLanguage } from './shapingLanguage.js';
import { type FontFallback, type FontFileIssue, type LoadedFace, type PdfFontAnswer, type FaceSpec, type PdfFontProvider, CFF_WHOLE_WARN_BYTES, fontFilesOf, declarationOf, fallbackFaces, type FontMissingGlyphs } from './fontCache/fontFiles.js';
import { isCffOpenType, coverAllGlyphWidths, coverAllGlyphUnicode, spaceGlyphForSpace } from './fontCache/glyphTables.js';

export { coverAllGlyphWidths, toUnicodeCmap, coverAllGlyphUnicode, spaceGlyphForSpace } from './fontCache/glyphTables.js';
export { declaredFontFile, declarationOf, fontFilesOf, withBareFiles, inDeclarationOrder, CFF_WHOLE_WARN_BYTES, fallbackFaces } from './fontCache/fontFiles.js';
export type { PdfFontRequest, PdfFontFile, PdfFontFileDeclaration, PdfFontProvider, PdfFontAnswer, FontMissingGlyphs, FontFileIssue, FontFallback } from './fontCache/fontFiles.js';

// The order CSS font matching tries a family's weights in (CSS Fonts 4
// §5.2) is the engine's: the browser picks the same face, so the PDF
// matches the preview, and the Sandbox and the command line choose by the
// same function.
export { cssWeightOrder };

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
