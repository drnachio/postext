// The glyphs of a run: fontkit's reading of the text, cmap ids, runs a
// face is missing glyphs for and their fallbacks, and a text's advance
// (#1276: split out of primitives.ts).
import { type PDFFont, PDFHexString, PDFOperator, PDFArray, PDFNumber, PDFOperatorNames, showText, PDFName } from 'pdf-lib';
import { graphemesOf } from 'postext';
import { type FallbackFace, isDefaultIgnorable, isSpaceCharacter, type TextPiece, fallbackPieces } from '../text/fallbackSpaces.js';
import { noteMissingGlyphs, wordRuns, inRun } from '../../faceFiles.js';
import { needsComplexShaping } from '../../complexShaping.js';
import { shapingKey, shapesAsCanvas } from '../../shapingLanguage.js';
import type { OperatorArg } from './actualText.js';
import { type ShapingFace, type LaidGlyph, type ShowPart, tjNumber, type TextShow, ENCODE_CACHE_SLOTS } from './textShows.js';

function shapingFace(font: PDFFont): { face: ShapingFace & FallbackFace; features: unknown } | undefined {
  const embedder = (font as unknown as { embedder?: { font?: ShapingFace & FallbackFace; fontFeatures?: unknown } }).embedder;
  const face = embedder?.font;
  if (!face || typeof face.layout !== 'function' || !face.unitsPerEm) return undefined;
  return { face, features: embedder!.fontFeatures };
}

/**
 * What the glyphs fontkit laid `text` out with are read as, where the
 * font's `/ToUnicode` map reads them as other text (#755); undefined when
 * the map reads every one as written, which is nearly always.
 *
 * The map is one per font, and a glyph keeps the characters it was first
 * given (fontkit makes a glyph once, with the characters of the text that
 * first showed it; `shapedText.ts` does the same for the glyphs HarfBuzz
 * shows). A glyph two characters share therefore reads as the first of
 * them the document set: the bracket a right-to-left run mirrors is the
 * glyph of the other bracket, so after `(١)` in an Arabic note the glyph
 * of `)` stands for `(`, and a later `(Brill, 2017)` in the same font read
 * back `(Brill, 2017(`. A form the shaper puts in a character's place
 * takes the characters of that character's own glyph, the wrong ones
 * with them. The same goes for any two characters the face's cmap draws
 * with one glyph: the hyphen-minus and the hyphen, the space and the
 * no-break space. Such a glyph is shown in a span whose `/ActualText` is
 * its character here, as `shapedText.ts` does for a cluster HarfBuzz
 * shaped: the first use of a glyph costs nothing, each use for another
 * character one span.
 *
 * The glyphs are walked against the text. A glyph whose own characters
 * are the next ones of the text reads right; one with no characters (the
 * second glyph of a decomposed letter) reads as nothing; one that holds
 * one character, and not the next of the text, is read as that next
 * character. Three glyphs are left as they read: `.notdef`, which stands
 * for every character the face lacks; the space glyph fontkit hides an
 * invisible character behind; and the space glyph, read as a space, under
 * a no-break space or any other space the face draws with it (a space the
 * face lacks reads as a space too, see `fallbackSpaces.ts`). The reads
 * hold only when the walk ends where the text does (every glyph accounted
 * for, one way or another); when it does not — a glyph for several
 * characters that holds others, a variation selector — the run is left as
 * it reads.
 */
function glyphReads(face: ShapingFace, glyphs: readonly LaidGlyph[], text: string): Array<string | undefined> | undefined {
  // fontkit hands a right-to-left run's glyphs over in visual order: such
  // text is HarfBuzz's whenever it is loaded, and is not walked here.
  if (needsComplexShaping(text)) return undefined;
  let reads: Array<string | undefined> | undefined;
  let space: number | undefined;
  // UTF-16 offset in `text` of the next character to read.
  let at = 0;
  for (let i = 0; i < glyphs.length; i++) {
    const glyph = glyphs[i]!;
    const own = glyph.codePoints;
    if (glyph.id !== 0 && (!own || own.length === 0)) continue;
    let end = at;
    for (const cp of own ?? []) {
      if (text.codePointAt(end) !== cp) {
        end = -1;
        break;
      }
      end += cp > 0xffff ? 2 : 1;
    }
    if (end > at) {
      at = end;
      continue;
    }
    const cp = text.codePointAt(at);
    if (cp === undefined) return undefined;
    at += cp > 0xffff ? 2 : 1;
    if (glyph.id === 0) continue;
    if (isDefaultIgnorable(cp) && glyph.id === (space ??= cmapGlyphId(face, 0x20))) continue;
    if (own.length !== 1) return undefined;
    if (own[0] === 0x20 && isSpaceCharacter(cp)) continue;
    reads ??= new Array<string | undefined>(glyphs.length);
    reads[i] = String.fromCodePoint(cp);
  }
  return at === text.length ? reads : undefined;
}

/** The id of the glyph the face's cmap gives `cp` (0: none), read from the
 *  cmap itself: `glyphForCodePoint` would make the glyph, with `cp` as the
 *  characters it then keeps in the font's map. */
function cmapGlyphId(face: ShapingFace, cp: number): number {
  const cmap = (face as unknown as { _cmapProcessor?: { lookup?(codePoint: number): number } })._cmapProcessor;
  return typeof cmap?.lookup === 'function' ? cmap.lookup(cp) || 0 : 0;
}

/** The `TJ` array (hex glyph runs and adjustments) of a shaped run, with
 *  the sum of the glyphs' own widths (their `W` entries), in thousandths
 *  of the font size; undefined when the shaper's positions cannot be
 *  matched to its glyphs. A glyph the font's map reads as other text is a
 *  part of its own ({@link glyphReads}). */
function shapedRun(font: PDFFont, text: string, encoded: PDFHexString): { parts: ShowPart[]; widths: number; joined: Array<[number, number]> } | undefined {
  const shaping = shapingFace(font);
  if (!shaping) return undefined;
  const { face } = shaping;
  const run = face.layout(text, shaping.features);
  const hex = encoded.asString();
  const count = run.glyphs.length;
  if (count === 0 || hex.length !== count * 4 || run.positions.length !== count) return undefined;
  const reads = glyphReads(face, run.glyphs, text);
  // TJ numbers are thousandths of text space, subtracted from the pen: a
  // glyph drawn at `pen + xOffset` then advancing by `xAdvance` (not its
  // W width `advanceWidth`) is `-xOffset, glyph, -(xAdvance - w - xOffset)`.
  const toText = 1000 / face.unitsPerEm;
  const subsetFont = isSubsetFont(font);
  const parts: ShowPart[] = [];
  let pendingHex = '';
  let pendingAdjust = 0;
  const flushHex = () => {
    if (pendingHex) parts.push(pendingHex);
    pendingHex = '';
  };
  let widths = 0;
  // The glyphs that stand for several letters (a ligature), by index,
  // with the letters each joins beyond its first.
  const joined: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    const own = run.glyphs[i]!.codePoints;
    if (own && own.length > 1) {
      const letters = graphemesOf(String.fromCodePoint(...own)).length;
      if (letters > 1) joined.push([i, letters - 1]);
    }
    const pos = run.positions[i]!;
    const lead = tjNumber(pendingAdjust - pos.xOffset * toText);
    if (lead !== 0) {
      flushHex();
      parts.push(lead);
    }
    const cid = hex.slice(i * 4, i * 4 + 4);
    const read = reads?.[i];
    if (read !== undefined) {
      flushHex();
      parts.push({ hex: cid, text: read });
    } else pendingHex += cid;
    pendingAdjust = -(pos.xAdvance - run.glyphs[i]!.advanceWidth - pos.xOffset) * toText;
    widths += cid === '0000' && subsetFont ? MISSING_WIDTH : run.glyphs[i]!.advanceWidth * toText;
  }
  flushHex();
  return { parts, widths, joined };
}

/** The width a viewer gives a glyph with no `W` entry (no `DW` is written). */
const MISSING_WIDTH = 1000;

/** Whether pdf-lib embeds `font` as a subset, whose `W` array never lists
 *  the notdef glyph (CID 0): a viewer advances it by {@link MISSING_WIDTH}. */
function isSubsetFont(font: PDFFont): boolean {
  return !!(font as unknown as { embedder?: { subset?: unknown } }).embedder?.subset;
}

function adjustedOperator(font: PDFFont, parts: Array<string | number>): PDFOperator {
  const array = PDFArray.withContext(font.doc.context);
  for (const part of parts) {
    array.push(typeof part === 'number' ? PDFNumber.of(part) : PDFHexString.of(part));
  }
  return PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [array]);
}

/** A plain `Tj` for a single glyph run (or none), else a `TJ`. */
export function partsOperator(font: PDFFont, parts: Array<string | number>): PDFOperator {
  if (parts.length === 0) return showText(PDFHexString.of(''));
  return parts.length === 1 && typeof parts[0] === 'string' ? showText(PDFHexString.of(parts[0])) : adjustedOperator(font, parts);
}

/** Append a part to a `TJ` array, merging it into a neighbouring glyph run
 *  or number; a zero adjustment is dropped. A glyph read through a span
 *  stays a part of its own. */
export function pushPart(parts: ShowPart[], part: ShowPart): void {
  const last = parts[parts.length - 1];
  if (typeof part === 'object') parts.push(part);
  else if (typeof part === 'number') {
    if (part === 0) return;
    if (typeof last === 'number') parts[parts.length - 1] = tjNumber(last + part);
    else parts.push(part);
  } else if (typeof last === 'string') parts[parts.length - 1] = last + part;
  else parts.push(part);
}

/** A text set for a show-text array: its glyph runs and adjustments, where
 *  they leave the pen (thousandths of the font size: the glyphs' `W`
 *  widths less the adjustments, before any character spacing) and how
 *  many glyphs they show. */
export interface ShownRun {
  parts: ShowPart[];
  advance: number;
  glyphs: number;
  /** A glyph of it is read through a span ({@link ReadGlyph}). */
  reads: boolean;
  /** Its glyphs that stand for several letters (a ligature): the glyph's
   *  index among the run's and the letters it joins beyond its first, in
   *  order. A tracked text owes each of those a tracking (#770). */
  joined: ReadonlyArray<readonly [number, number]>;
  /** The letters of {@link joined} together. */
  letters: number;
}

/** Glyphs and pen advance of a run of parts whose glyph widths sum to
 *  `widths` (thousandths of the font size). */
function shownRunOf(parts: ShowPart[], widths: number, joined: ReadonlyArray<readonly [number, number]> = []): ShownRun {
  let advance = widths;
  let glyphs = 0;
  let reads = false;
  for (const part of parts) {
    if (typeof part === 'number') advance -= part;
    else if (typeof part === 'string') glyphs += part.length / 4;
    else {
      glyphs += part.hex.length / 4;
      reads = true;
    }
  }
  let letters = 0;
  for (const [, more] of joined) letters += more;
  return { parts, advance, glyphs, reads, joined, letters };
}

/** `parts` with every glyph read through the font's map: one show-text
 *  array, as before any glyph took a span. */
export function plainParts(parts: readonly ShowPart[]): Array<string | number> {
  const out: Array<string | number> = [];
  for (const part of parts) pushPart(out, typeof part === 'object' ? part.hex : part);
  return out;
}

/**
 * The show-text operators of `parts` in `font`: one, or, around each glyph
 * read through a span ({@link ReadGlyph}), the span's `BDC`, the glyph and
 * its `EMC`. The glyphs and the pen adjustments are the same ones in the
 * same order, cut into several arrays: nothing moves on the page.
 */
export function partsShows(font: PDFFont, parts: readonly ShowPart[]): TextShow[] {
  const shows: TextShow[] = [];
  let plain: Array<string | number> = [];
  const flush = () => {
    if (plain.length > 0) shows.push({ font, op: partsOperator(font, plain) });
    plain = [];
  };
  for (const part of parts) {
    if (typeof part !== 'object') {
      pushPart(plain, part);
      continue;
    }
    flush();
    const props = font.doc.context.obj({ ActualText: PDFHexString.fromText(part.text) }) as unknown as OperatorArg;
    shows.push(
      { font, op: PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of('Span'), props]) },
      { font, op: showText(PDFHexString.of(part.hex)) },
      { font, op: PDFOperator.of(PDFOperatorNames.EndMarkedContent) },
    );
  }
  flush();
  if (shows.length === 0) shows.push({ font, op: partsOperator(font, []) });
  return shows;
}

/**
 * The parts of a text holding a space the face has no glyph for (a narrow
 * no-break space, a figure space…) or an invisible character (a word
 * joiner): painted as the canvas measured it, not as `.notdef` boxes (see
 * `fallbackSpaces.ts`). A missing space is the face's space glyph — text
 * extraction still finds a space there — moved to the browser's advance
 * for it; an invisible character is not drawn.
 */
function fallbackRun(font: PDFFont, face: FallbackFace, pieces: TextPiece[]): ShownRun {
  const toText = 1000 / face.unitsPerEm;
  const spaceGlyph = face.hasGlyphForCodePoint(0x20) ? face.glyphForCodePoint(0x20) : undefined;
  const parts: ShowPart[] = [];
  let widths = 0;
  // The ligatures of the pieces, by their glyphs' index in the whole run.
  const joined: Array<[number, number]> = [];
  let glyphs = 0;
  const glyphsOf = (shown: readonly ShowPart[]): number => shown.reduce<number>((n, part) => n + (typeof part === 'number' ? 0 : (typeof part === 'string' ? part : part.hex).length / 4), 0);
  for (const piece of pieces) {
    if ('space' in piece) {
      if (spaceGlyph) {
        // The face's space glyph, read as a space whatever the font's map
        // gives it (a no-break space set before any space, #755).
        const space = font.encodeText(' ');
        const shown = shapedRun(font, ' ', space)?.parts ?? [space.asString()];
        for (const part of shown) pushPart(parts, part);
        glyphs += glyphsOf(shown);
        pushPart(parts, tjNumber((spaceGlyph.advanceWidth - piece.space) * toText));
        widths += spaceGlyph.advanceWidth * toText;
      } else {
        pushPart(parts, tjNumber(-piece.space * toText));
      }
      continue;
    }
    const encoded = font.encodeText(piece.text);
    const shaped = shapedRun(font, piece.text, encoded);
    const shown = shaped?.parts ?? [encoded.asString()];
    for (const part of shown) pushPart(parts, part);
    for (const [at, more] of shaped?.joined ?? []) joined.push([glyphs + at, more]);
    glyphs += glyphsOf(shown);
    widths += shaped?.widths ?? font.widthOfTextAtSize(piece.text, 1000);
  }
  return shownRunOf(parts, widths, joined);
}

const runsByFont = new WeakMap<PDFFont, Map<string, ShownRun>>();

/** `text` as {@link showTextShaped} paints it, with the advance and glyph
 *  count it leaves (cached per font). Undefined when the font carries no
 *  shaper to measure it with. */
export function shownRun(font: PDFFont, text: string): ShownRun | undefined {
  let cache = runsByFont.get(font);
  if (!cache) {
    cache = new Map();
    runsByFont.set(font, cache);
  }
  const key = shapingKey(text);
  const hit = cache.get(key);
  if (hit) return hit;
  const shaping = shapingFace(font);
  if (!shaping) return undefined;
  noteMissingGlyphs(font, text);
  const pieces = fallbackPieces(shaping.face, text);
  let run: ShownRun;
  if (pieces) {
    run = fallbackRun(font, shaping.face, pieces);
  } else {
    const encoded = font.encodeText(text);
    const hex = encoded.asString();
    const shaped = shapedRun(font, text, encoded);
    run = shownRunOf(shaped?.parts ?? (hex ? [hex] : []), shaped?.widths ?? font.widthOfTextAtSize(text, 1000), shaped?.joined);
  }
  if (cache.size >= ENCODE_CACHE_SLOTS) cache.clear();
  cache.set(key, run);
  return run;
}

/** How far `text` moves the pen in `font`'s face at `sizePx`, px, with
 *  `trackingPx` after every glyph (as {@link showTextShaped} paints it,
 *  each run in the file of the face that has it), and after every letter
 *  a ligature joins in a document shaped in its own language
 *  ({@link letterTrackingTj}); and how many glyphs it shows. */
export function textAdvancePx(font: PDFFont, text: string, sizePx: number, trackingPx = 0): { advance: number; glyphs: number } {
  let advance = 0;
  let glyphs = 0;
  // Letters of ligatures beyond each one's first.
  let letters = 0;
  const perLetter = trackingPx !== 0 && shapesAsCanvas();
  for (const word of wordRuns(font, text)) {
    const { font: file, text: part } = word;
    const run = inRun(word, () => shownRun(file, part));
    if (!run) {
      advance += file.widthOfTextAtSize(part, sizePx);
      glyphs += [...part].length;
      continue;
    }
    advance += (run.advance / 1000) * sizePx;
    glyphs += run.glyphs;
    if (perLetter) letters += run.letters;
  }
  return { advance: advance + (glyphs + letters) * trackingPx, glyphs };
}
