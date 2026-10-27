/**
 * Text shaped with HarfBuzz, painted through glyph ids (issue #380).
 *
 * pdf-lib's own text path asks fontkit for the glyphs (`encodeText`). For
 * a run HarfBuzz shapes (`complexShaping.ts`) the glyphs are registered
 * with the font's subset here instead, as the vertical twins register
 * theirs (`verticalFonts.ts`): the subset keeps every glyph a run shows and
 * its `W` width, and the hex codes are the subset's ids (or the face's own,
 * for a font embedded whole).
 *
 * Positions: a run is one `TJ` per stretch of glyphs at one height. Its
 * numbers move the pen to each glyph's origin (`pen + xOffset`) and, after
 * the last, to where HarfBuzz's advances end, so a run is exactly as wide
 * as the layout measured it. A mark HarfBuzz raises or lowers (`yOffset`:
 * a fatha on a shadda, a kasra under a dotted letter) is shown with the
 * text rise (`Ts`) set to it, which moves no pen. Glyphs are shown left to
 * right, a right-to-left run in visual order, as every right-to-left PDF
 * shows them: readers put the line back in logical order from their
 * positions.
 *
 * Reading the text back (`/ToUnicode`): clusters are graphemes, a letter
 * with its marks. Each glyph newly added to the font is given the
 * characters of its cluster it stands for ({@link clusterCodePoints}), and
 * the font's map is written from them. That map is global to the font, so
 * a glyph keeps the characters it was first given: a mirrored bracket
 * shares its glyph with the other bracket, a contextual form can stand for
 * other text elsewhere. A cluster whose glyphs do not read back as its own
 * characters, a vocalised letter (readers set a raised or lowered mark on
 * a line of its own, or after the next letter) and a cluster holding
 * kashidas justification inserted are shown under an `/ActualText` span
 * with the cluster's text as written, in logical order (PDF 1.7 §14.9.4).
 * pdf.js 5 ignores the span and reads the glyphs; Poppler reads it, but
 * turns a span of several characters around in a right-to-left line.
 * The text fontkit sets in the same font is checked against the same map
 * (`glyphReads` in `primitives.ts`, #755): the bracket a right-to-left run
 * was first to show reads as written in the Latin text after it. Inside a
 * span that already reads its text (the line's, `ctx.readSpans`) no
 * cluster takes one: Poppler, meeting a span in a span, drops the outer.
 */
import { type PDFFont, PDFOperator, PDFOperatorNames, setTextRise, type Color, setCharacterSpacing, setFillingColor, setCharacterSqueeze, moveText, PDFHexString, PDFName } from 'pdf-lib';
import { lineRuns, resolveParagraph } from 'postext';
import { complexShaperReady, needsComplexShaping, joinsLetters } from '../../complexShaping.js';
import { fileRuns } from '../../faceFiles.js';
import { withinRightToLeftText, shapesAsCanvas, withBesideLetter } from '../../shapingLanguage.js';
import { canvasWords } from '../../canvasWords.js';
import { type TextOutline, type TextShow, textShows, textAdvancePx, type PageCtx, pushTextObject, registerComplexPainter } from '../primitives.js';
import { type ShapedShow, tjNumber, languageOf, shapedShow, tatweelsToHide, shapingOf } from './shapedText/shaping.js';

/** How {@link drawShapedTextPx} sets a text. */
export interface ShapedTextOptions {
  /** The text is one bidi run in this direction (a VDT segment flagged
   *  `rtl`, or one without it on a line that carries directions). Absent:
   *  the text is cut into runs first, by the engine's UAX #9
   *  (`resolveParagraph`, `lineRuns`). */
  direction?: 'ltr' | 'rtl';
  /** With no {@link direction}: the paragraph direction the runs are
   *  ordered in; by default the text's first strong letter's. */
  base?: 'ltr' | 'rtl';
  /** BCP 47 language of the text, for the font's `locl` forms. */
  language?: string;
  /** Shape each run as one string, also in a document shaped in its own
   *  language, whose text is otherwise shaped word by word (#770): the
   *  text of a drawing. */
  whole?: boolean;
  /** What copying and text extraction read for the glyphs: by default
   *  each glyph's characters, with the clusters that cannot be read so (see
   *  the module comment) under spans of their own; the whole text under one
   *  span when given (the line's repeated hyphen left out); null for no
   *  span at all. */
  actualText?: string | null;
  /** Leave tatweels (U+0640) out of the text read: justification inserted
   *  them. `true`: every one; a number: that many, the ones kashida
   *  justification inserted into a word (`VDTLineSegment.kashida`), so a
   *  tatweel the author typed stays in the text read. */
  hideTatweel?: boolean | number;
  outline?: TextOutline;
}

/** A run of one direction, `[start, end)` in the text. */
interface DirectedRun {
  start: number;
  end: number;
  rtl: boolean;
}

/** The runs of `text` HarfBuzz shapes, in visual order: one in the given
 *  direction, else the text's bidi runs of one level each (UAX #9 with
 *  rules L1 and L2, the engine's `bidi.ts`, as the layout resolves a
 *  paragraph). */
function runsOf(text: string, options: Pick<ShapedTextOptions, 'direction' | 'base'>): DirectedRun[] {
  if (options.direction) return [{ start: 0, end: text.length, rtl: options.direction === 'rtl' }];
  return lineRuns(resolveParagraph(text, options.base ?? 'auto')).map((r) => ({ start: r.start, end: r.end, rtl: (r.level & 1) === 1 }));
}

/** Text shown by {@link layoutShapedText}: the shows of one text object
 *  and how far they move the pen, thousandths of the em, with the number
 *  of glyphs shown (each also takes the character spacing). */
interface ShapedLayout {
  shows: TextShow[];
  advance: number;
  glyphs: number;
}

/** Appends the pieces of `shown` to `shows`, each at its rise (text space
 *  units are thousandths of the em times `fontSize`) and, with `spanOp`,
 *  inside the span its cluster reads through. `state` carries the rise set
 *  and the span open from one call to the next. */
function appendShown(
  shows: TextShow[],
  file: PDFFont,
  shown: ShapedShow,
  fontSize: number,
  state: { rise: number },
  spanOp: ((text: string) => PDFOperator) | undefined,
): void {
  let span: number | undefined;
  let open = false;
  for (const piece of shown.pieces) {
    if (spanOp && piece.span !== span) {
      if (open) shows.push({ font: file, op: PDFOperator.of(PDFOperatorNames.EndMarkedContent) });
      open = false;
      if (piece.span !== undefined) {
        shows.push({ font: file, op: spanOp(shown.spans[piece.span]!) });
        open = true;
      }
      span = piece.span;
    }
    if (piece.rise !== state.rise) {
      shows.push({ font: file, op: setTextRise(tjNumber((piece.rise / 1000) * fontSize)) });
      state.rise = piece.rise;
    }
    shows.push({ font: file, op: piece.op });
  }
  if (open) shows.push({ font: file, op: PDFOperator.of(PDFOperatorNames.EndMarkedContent) });
}

/**
 * `text` shaped by HarfBuzz as the show operators of one text object: each
 * bidi run in its direction, the runs left to right, each run cut by the
 * file of the face that has its characters. `fontSize` is the font size in
 * the text space the shows are painted in (for the rise of marks).
 * `spanOp` opens the `/ActualText` span of a cluster; without it no span
 * is written. Null when HarfBuzz is not loaded.
 */
function layoutShapedText(
  font: PDFFont,
  text: string,
  fontSize: number,
  options: ShapedTextOptions,
  spanOp: ((text: string) => PDFOperator) | undefined,
): ShapedLayout | null {
  if (!complexShaperReady()) return null;
  // A piece with no letter of a string with right-to-left letters has no
  // script, unless a letter stands beside it in its word (#764).
  return withinRightToLeftText(needsComplexShaping(text), () => layoutRuns(font, text, fontSize, options, spanOp));
}

/** {@link layoutShapedText}, once HarfBuzz is known to be loaded. */
function layoutRuns(
  font: PDFFont,
  text: string,
  fontSize: number,
  options: ShapedTextOptions,
  spanOp: ((text: string) => PDFOperator) | undefined,
): ShapedLayout {
  const shows: TextShow[] = [];
  const state = { rise: 0 };
  const language = languageOf(options.language);
  let advance = 0;
  let glyphs = 0;
  for (const run of runsOf(text, options)) {
    // Word by word, as the canvas shapes a run (`canvasWords.ts`, #770): a
    // space is a word of its own, with no script (Aref Ruqaa sets it wider
    // than inside Arabic text). The words of a right-to-left run follow
    // each other leftwards, and so do the files of each.
    const runText = text.slice(run.start, run.end);
    const words = options.whole || !shapesAsCanvas() ? [runText] : canvasWords(runText);
    if (run.rtl) words.reverse();
    const files = words.length === 1 ? fileRuns(font, runText, run.rtl) : words.flatMap((word) => {
      const parts = fileRuns(font, word, run.rtl);
      return run.rtl ? parts.reverse() : parts;
    });
    if (run.rtl && words.length === 1) files.reverse();
    for (const { font: file, text: part, beside } of files) {
      // A part with no letter (the stop and the guillemet of `خالة.»`, in
      // another file than the letters) is shaped in the word's script.
      const shown = withBesideLetter(beside, () => shapedShow(file, part, run.rtl ? 'rtl' : 'ltr', language, tatweelsToHide(options.hideTatweel)));
      if (!shown) {
        // A file HarfBuzz cannot read (a standard font): fontkit's glyphs.
        if (state.rise !== 0) shows.push({ font: file, op: setTextRise(0) });
        state.rise = 0;
        shows.push(...textShows(file, part, spanOp !== undefined));
        const plain = textAdvancePx(file, part, 1000);
        advance += plain.advance;
        glyphs += plain.glyphs;
        continue;
      }
      appendShown(shows, file, shown, fontSize, state, spanOp);
      advance += shown.advance;
      glyphs += shown.glyphs;
    }
  }
  return { shows, advance, glyphs };
}

/**
 * Paint `text` shaped by HarfBuzz from `xPx` on the baseline, in one text
 * object: each bidi run in its direction, the runs left to right, each run
 * cut by the file of the face that has its characters. Character spacing
 * is turned off for a text with joining letters, whose joins it would
 * break. On a mirrored page the text object is turned back about the box
 * HarfBuzz's own advances give the text (`pushTextObject`'s `advancePx`),
 * so it lands exactly where it was measured. Returns false, painting
 * nothing, when HarfBuzz is not loaded: the caller paints the text the
 * fontkit way.
 */
export function drawShapedTextPx(
  ctx: PageCtx,
  text: string,
  xPx: number,
  baselinePx: number,
  font: PDFFont,
  sizePx: number,
  color: Color,
  options: ShapedTextOptions = {},
): boolean {
  if (!text) return true;
  if (!(sizePx > 0)) return false;
  const sizePt = sizePx * ctx.scale;
  // Cluster spans, unless the caller reads the text some other way: a
  // span of its own, or the line's, open around it (`ctx.readSpans`).
  const layout = layoutShapedText(font, text, sizePt, options, options.actualText === undefined && !ctx.readSpans ? (t) => spanOperator(ctx, t) : undefined);
  if (!layout) return false;
  const shows = layout.shows;
  // Joining letters are never spaced apart (the canvas ignores
  // `letterSpacing` on them too); the graphics state the text object is
  // wrapped in restores the line's spacing after it.
  const untracked = (ctx.trackingPx ?? 0) !== 0 && joinsLetters(text);
  if (untracked) shows.unshift({ font: shows[0]?.font ?? font, op: setCharacterSpacing(0) });
  const advancePx = (layout.advance / 1000) * sizePx + layout.glyphs * (untracked ? 0 : ctx.trackingPx ?? 0);
  pushTextObject(ctx, shows, xPx, baselinePx, font, sizePx, color, options.outline, options.actualText ?? undefined, advancePx);
  return true;
}

/**
 * Text of an SVG drawing (`svgVector.ts`) shaped by HarfBuzz: the show
 * operators of one text object in `font`'s face at `size` (the drawing's
 * units), and its advance in those units. No `/ActualText` spans: the
 * drawing is a figure, read through its alternate text. Null when
 * HarfBuzz is not loaded.
 */
export function shapedSvgText(font: PDFFont, text: string, size: number, base?: 'ltr' | 'rtl'): { shows: TextShow[]; advance: number } | null {
  const layout = layoutShapedText(font, text, size, { base, whole: true }, undefined);
  return layout ? { shows: layout.shows, advance: (layout.advance / 1000) * size } : null;
}

/** A styled run of a word painted by {@link drawStyledWordPx}: `[start,
 *  end)` in the word's text, and the face and colour it is set in. */
export interface StyledWordPart {
  start: number;
  end: number;
  font: PDFFont;
  color: Color;
}

/** The one file of `font`'s face that sets all of `text`, if there is one. */
function singleFile(font: PDFFont, text: string, rtl = false): PDFFont | undefined {
  const files = fileRuns(font, text, rtl);
  return files.length === 1 ? files[0]!.font : undefined;
}

/**
 * Paint a word set in several styles (`VDTLineSegment.runs`, `كتا**ب**`)
 * as one shaped run, so its letters keep the forms they take in the whole
 * word, each glyph in the style of the run its character belongs to.
 *
 * The word is shaped once in its own face (`font`, the style it was
 * measured in): that shaping gives every glyph's place and the word's
 * width. Walking its glyphs left to right, each stretch of glyphs of one
 * run is shown in that run's colour:
 * - in the same face, the stretch's own glyphs, where they are;
 * - in another face (a bold letter in a regular word), the word is shaped
 *   whole in that face too, so the letters at the cut take the joining
 *   forms of the whole word, and the glyphs of the stretch's characters are
 *   shown over the box the stretch has in the word's own shaping,
 *   horizontally scaled (`Tz`) to its width: the joins at both ends meet
 *   their neighbours, and the word keeps the width it was measured with.
 *   A stretch of vowel signs alone (no advance) keeps the word's face and
 *   takes only the colour, since a mark's place depends on its letter's
 *   glyph.
 * A vowel sign in a run of its own (a red fatha) is a glyph of its own,
 * so it is coloured apart from its letter. All the stretches are one text
 * object, glyphs left to right (each stretch placed with `Td`), so the
 * word reads back as one, as an unstyled word does.
 *
 * Returns false, painting nothing, when HarfBuzz is not loaded or a face
 * sets the word from several files: the caller then paints the word in
 * one style.
 */
export function drawStyledWordPx(
  ctx: PageCtx,
  text: string,
  xPx: number,
  baselinePx: number,
  font: PDFFont,
  sizePx: number,
  color: Color,
  parts: readonly StyledWordPart[],
  options: Pick<ShapedTextOptions, 'direction' | 'language' | 'hideTatweel' | 'actualText'> = {},
): boolean {
  if (!text) return true;
  if (!complexShaperReady() || !(sizePx > 0)) return false;
  const direction = options.direction ?? 'ltr';
  const file = singleFile(font, text, direction === 'rtl');
  if (!file) return false;
  const language = languageOf(options.language);
  const base = shapingOf(file, text, direction, language);
  if (!base) return false;
  const hide = tatweelsToHide(options.hideTatweel);
  const sizePt = sizePx * ctx.scale;
  const n = base.run.glyphs.length;
  const partOf = base.owner.map((offset) => parts.findIndex((p) => offset >= p.start && offset < p.end));
  const spanOp = options.actualText === undefined && !ctx.readSpans ? (t: string) => spanOperator(ctx, t) : undefined;
  const shows: TextShow[] = [];
  const state = { rise: 0 };
  let fill = color;
  let squeeze = 100;
  // Where the last `Td` put the line, thousandths of the em.
  let lineAt = 0;
  for (let a = 0; a < n;) {
    let b = a + 1;
    while (b < n && partOf[b] === partOf[a]) b++;
    const part = parts[partOf[a]!];
    let showFile = file;
    let shown: ShapedShow | null = null;
    let scale = 1;
    const other = part && part.font !== font ? singleFile(part.font, text, direction === 'rtl') : undefined;
    const width = base.pen[b]! - base.pen[a]!;
    if (other && other !== file && width > 0) {
      // The other face's glyphs of the same characters, in its own shaping
      // of the whole word.
      const shaping = shapingOf(other, text, direction, language);
      const owners = new Set(base.owner.slice(a, b));
      let from = -1;
      let to = -1;
      shaping?.owner.forEach((o, i) => {
        if (!owners.has(o)) return;
        if (from < 0) from = i;
        to = i + 1;
      });
      if (shaping && from >= 0) {
        const otherWidth = shaping.pen[to]! - shaping.pen[from]!;
        shown = otherWidth > 0 ? shapedShow(other, text, direction, language, hide, from, to) : null;
        if (shown) {
          scale = width / otherWidth;
          showFile = other;
        }
      }
    }
    shown ??= shapedShow(file, text, direction, language, hide, a, b);
    if (!shown) return false;
    const partColor = part?.color ?? color;
    if (partColor !== fill) {
      shows.push({ font: showFile, op: setFillingColor(partColor) });
      fill = partColor;
    }
    const percent = tjNumber(scale * 100);
    if (percent !== squeeze) {
      shows.push({ font: showFile, op: setCharacterSqueeze(percent) });
      squeeze = percent;
    }
    // `Td` moves the line start, in unscaled text space (points).
    const move = tjNumber(((base.pen[a]! - lineAt) / 1000) * sizePt);
    if (move !== 0) {
      shows.push({ font: showFile, op: moveText(move, 0) });
      lineAt = base.pen[a]!;
    }
    appendShown(shows, showFile, shown, sizePt, state, spanOp);
    a = b;
  }
  if ((ctx.trackingPx ?? 0) !== 0 && joinsLetters(text)) shows.unshift({ font: shows[0]?.font ?? file, op: setCharacterSpacing(0) });
  pushTextObject(ctx, shows, xPx, baselinePx, file, sizePx, color, undefined, options.actualText ?? undefined, (base.pen[n]! / 1000) * sizePx);
  return true;
}

type OperatorArg = Parameters<typeof PDFOperator.of>[1] extends (infer A)[] | undefined ? A : never;

/** `BDC` of a `/Span` whose `/ActualText` is `text`. */
function spanOperator(ctx: PageCtx, text: string): PDFOperator {
  const props = ctx.page.doc.context.obj({ ActualText: PDFHexString.fromText(text) }) as unknown as OperatorArg;
  return PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of('Span'), props]);
}

// `drawTextPx` hands complex text over (it cannot import this module back).
registerComplexPainter((ctx, text, xPx, baselinePx, font, sizePx, color, outline, actualText, direction) =>
  needsComplexShaping(text) && drawShapedTextPx(ctx, text, xPx, baselinePx, font, sizePx, color, { outline, actualText, ...(direction ? { direction } : {}) }));
