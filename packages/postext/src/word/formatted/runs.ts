// Runs of the formatted Word export (#1392): one `w:r` per display run
// with the exact face, size, colour, tracking and shift as direct
// formatting. Every run is spaced out (w:spacing, after each character,
// not scaled by w:w) to the width the engine set it at, measured against
// the embedded face's advances and floored to twips, so no line is wider
// in Word or LibreOffice than the engine's and none wraps early (#1406).
// Neither application shrinks a space on its own. A space takes the face
// of the word beside it (the display list gives it the block's). Without
// the face's advances, spaces of a justified line get −0.1 pt and
// justification stretches them back. Embedded content (maths, music,
// swatches, tabs) keeps its width as no-break spaces spaced out to the
// run's width (LibreOffice drops the spacing of a zero-width character,
// the U+2060 older files hold); the picture itself is anchored over that
// spot. Ruby bases, tate-chu-yoko cells and warichu notes write their own
// East Asian runs (eastAsian.ts, #1394).

import { parseFontString } from '../../measure/fontString.js';
import type { DisplayLine, DisplayRun } from '../../paint/displayList/types.js';
import { escapeAttr } from '../xml.js';
import { wordFontFor } from '../fonts/plan.js';
import { fontSizePx, naturalEms } from './metrics.js';
import { faceStyleId } from './styles.js';
import { eastAsianLayout, kuntenOf, rubyXml, textRun, verticalPieces, type Annotation } from './eastAsian.js';
import { halfPoints, textColorHex, twips } from './units.js';
import type { WriterContext } from './types.js';

/** Spacing (twips) on every space of a justified line whose face's
 *  advances are unknown. */
export const SPACE_SPACING = -2;
/** Character that stands for embedded content: one with an advance of its
 *  own, which every renderer spaces out. */
export const HOLDER = '\u00a0';
/** The holder files written before #1406 hold (zero width). */
export const LEGACY_HOLDER = '\u2060';
/** Advance of a holder or space whose face is not embedded, em. */
const FALLBACK_SPACE_EM = 0.25;
/** Word's character spacing range, twips (±1584 pt). */
const MAX_SPACING = 31680;
/** Twips each letter of a justified line is set narrower than the engine's
 *  width: LibreOffice rounds every glyph's advance to whole twips, which
 *  over a line can add a point and break it early; justification stretches
 *  the spaces back to the measure. */
const JUSTIFY_ROOM_TW = 1;
/** Characters shaped out of their cmap advances (joining scripts, Indic,
 *  marks): their runs are not measured. */
const COMPLEX = /[\u0600-\u08ff\ufb50-\ufdff\ufe70-\ufeff\u0900-\u0dff\u0f00-\u0fff\u1000-\u109f\u1780-\u17ff\u1800-\u18af\p{M}\u200c\u200d]/u;
const BLANK = /^[ \u00a0\u2000-\u200a\u202f\u205f\u3000]+$/;
/** Pairs a face may set as one ligature: a run boundary between them
 *  makes LibreOffice draw the ligature and the second letter again. */
const LIGATURE = /^(?:f\p{L}|Th)$/u;
/** Word's font size range, half-points (1 pt to 1638 pt). */
export const MIN_SZ = 2;
export const MAX_SZ = 3276;

/** Text as Word can hold it, one UTF-16 unit for one: characters XML 1.0
 *  forbids (C0 controls, U+FFFE/U+FFFF) and unpaired surrogates become
 *  U+FFFD, line ends and tabs spaces. `escapeXml` would drop the first
 *  ones, and a '\n' in the text would read as an engine break, so the
 *  fragment text would no longer match what the bookmark holds. */
export function wordText(text: string): string {
  return text.replace(/[\t\n\r]|[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, (c) => (c === '\t' || c === '\n' || c === '\r' ? ' ' : '\ufffd'));
}

export interface ResolvedFont {
  family: string;
  bold: boolean;
  italic: boolean;
  /** Half-points, rounded. */
  sz: number;
  /** Character scale (`w:w`, percent) that brings the rounded size back to
   *  the engine's widths (floored: never wider); undefined at 100. */
  scale?: number;
  /** Figure features of a feature family (`Lora@onum`, #1237). */
  features?: readonly string[];
}

/** Something to draw over a run (inline picture or swatch), in the
 *  item's unturned frame. */
export interface InlineDrawing {
  kind: 'math' | 'score' | 'swatch' | 'chip';
  svg?: string;
  color?: string;
  rect: { x: number; y: number; width: number; height: number };
}

/** Part of a run with properties of its own (the spacing of its first
 *  characters is a twip wider, or the last one carries a gap). */
export interface RunPiece {
  rPr: string;
  text: string;
}

export interface EmittedRun {
  /** `w:rPr` (runs with equal properties are merged by the caller). */
  rPr: string;
  /** What the run puts in the document (same length as `run.text`). */
  text: string;
  /** The run in pieces, when it is more than one (`text` is their join). */
  pieces?: RunPiece[];
  drawing?: InlineDrawing;
  /** The run's own XML, never merged (a ruby, tate-chu-yoko cells, a
   *  warichu note): it holds `text` as the importer reads it. */
  xml?: string;
  /** Marks drawn beside the run (kanbun), in the item's unturned frame. */
  annotations?: Annotation[];
  rules?: ReturnType<typeof kuntenOf>['rules'];
}

const fontCache = new WeakMap<WriterContext, Map<string, ResolvedFont>>();

/** The Word face and size of a font string. */
export function resolveFont(ctx: WriterContext, fontString: string): ResolvedFont {
  let cache = fontCache.get(ctx);
  if (!cache) fontCache.set(ctx, (cache = new Map()));
  let f = cache.get(fontString);
  if (f) return f;
  const px = fontSizePx(fontString);
  const exact = halfPoints(px, ctx.dpi);
  const sz = Math.min(MAX_SZ, Math.max(MIN_SZ, Math.round(exact)));
  // Word sizes go by half points: a size between them is set at the
  // nearest and scaled across (w:w) to the engine's widths, so every line
  // still fills the measure it was broken for (8.8 pt: 9 pt at 97%, floored).
  const pct = exact > 0 ? Math.min(600, Math.max(1, Math.floor((exact / sz) * 100 + 1e-9))) : 100;
  const scale = pct !== 100 ? pct : undefined;
  if (exact > 0 && (sz === MAX_SZ || sz === MIN_SZ) && Math.abs(sz - exact) / exact > 0.01) {
    ctx.warn('font-size-rounded', `${fontString}: ${(exact / 2).toFixed(2)} pt is set at ${sz / 2} pt (Word sizes run from 1 pt to 1638 pt)`);
  }
  if (ctx.plan) {
    const ref = wordFontFor(ctx.plan, fontString);
    f = { family: ref.family, bold: ref.bold, italic: ref.italic, sz, ...(scale ? { scale } : {}), ...(ref.features?.length ? { features: ref.features } : {}) };
  } else {
    const req = parseFontString(fontString);
    f = { family: req?.family ?? 'Times New Roman', bold: (req?.weight ?? 400) >= 600, italic: req?.style === 'italic', sz, ...(scale ? { scale } : {}) };
  }
  cache.set(fontString, f);
  return f;
}

const propsCache = new WeakMap<WriterContext, Map<string, string>>();

export interface RunPropsOptions {
  spacing?: number;
  rtl?: boolean;
  ea?: string;
  /** `w:w` in place of the font's own (a squeezed space). */
  scale?: number;
  /** An atom's holder: marked w:noProof, which the importer reads to tell
   *  it from a typed no-break space (both are U+00A0). */
  holder?: boolean;
}

/** `w:rPr` of a run (CT_RPr child order), cached per distinct style. */
export function runProps(ctx: WriterContext, run: DisplayRun, opts: RunPropsOptions): string {
  // An East Asian layout carries an id of its own: never cached.
  if (opts.ea) return buildRunProps(ctx, run, opts);
  let cache = propsCache.get(ctx);
  if (!cache) propsCache.set(ctx, (cache = new Map()));
  // The font string carries a feature family's features (numForm).
  const key = `${run.fontString}|${run.bold ? 1 : 0}${run.italic ? 1 : 0}|${run.color}|${opts.spacing ?? 0}|${opts.scale ?? ''}|${opts.rtl ? 1 : 0}${opts.holder ? 1 : 0}|${run.smallCaps ? 1 : 0}|${run.baselineShift ?? 0}|${run.script ?? ''}|${ctx.lang ?? ''}`;
  let props = cache.get(key);
  if (props === undefined) {
    props = buildRunProps(ctx, run, opts);
    cache.set(key, props);
  }
  return props;
}

function buildRunProps(ctx: WriterContext, run: DisplayRun, opts: RunPropsOptions): string {
  const f = resolveFont(ctx, run.fontString);
  const fam = escapeAttr(f.family);
  // Bold or italic that is the face's (a heading, a header cell, an italic
  // quote) and not emphasis in the source goes through a character style:
  // the importer reads direct w:b / w:i as emphasis the user added. So
  // does a script raised by hand, which has no w:vertAlign to read.
  const faceB = f.bold && !run.bold;
  const faceI = f.italic && !run.italic;
  const face = faceStyleId(faceB, faceI, run.baselineShift ? run.script : undefined);
  const p: string[] = face ? [`<w:rStyle w:val="${face}"/>`] : [];
  p.push(`<w:rFonts w:ascii="${fam}" w:hAnsi="${fam}" w:eastAsia="${fam}" w:cs="${fam}"/>`);
  if (f.bold && !faceB) p.push('<w:b/><w:bCs/>');
  if (f.italic && !faceI) p.push('<w:i/><w:iCs/>');
  if (run.smallCaps) p.push('<w:smallCaps/>');
  if (opts.holder) p.push('<w:noProof/>');
  p.push(`<w:color w:val="${textColorHex(run.color)}"/>`);
  if (opts.spacing) p.push(`<w:spacing w:val="${opts.spacing}"/>`);
  const scale = opts.scale ?? f.scale;
  if (scale && scale !== 100) p.push(`<w:w w:val="${scale}"/>`);
  p.push('<w:kern w:val="1"/>');
  // A shifted run carries its own (already reduced) size: raise it by the
  // shift; a bare script asks Word for its super/subscript.
  const shift = run.baselineShift ? Math.round(halfPoints(run.baselineShift, ctx.dpi)) : 0;
  if (shift) p.push(`<w:position w:val="${shift}"/>`);
  p.push(`<w:sz w:val="${f.sz}"/><w:szCs w:val="${f.sz}"/>`);
  if (run.script && !run.baselineShift) p.push(`<w:vertAlign w:val="${run.script === 'sup' ? 'superscript' : 'subscript'}"/>`);
  if (opts.rtl) p.push('<w:rtl/>');
  if (ctx.lang) {
    const lang = escapeAttr(ctx.lang);
    p.push(opts.rtl ? `<w:lang w:val="${lang}" w:bidi="${lang}"/>` : `<w:lang w:val="${lang}"/>`);
  }
  if (opts.ea) p.push(opts.ea);
  p.push('<w14:ligatures w14:val="standardContextual"/>');
  const feats = f.features ?? [];
  const form = feats.includes('onum') ? 'oldStyle' : feats.includes('lnum') ? 'lining' : undefined;
  const spacing = feats.includes('tnum') ? 'tabular' : feats.includes('pnum') ? 'proportional' : undefined;
  if (form) p.push(`<w14:numForm w14:val="${form}"/>`);
  if (spacing) p.push(`<w14:numSpacing w14:val="${spacing}"/>`);
  return `<w:rPr>${p.join('')}</w:rPr>`;
}

/** Twips per character that set `count` characters of natural advance
 *  `naturalTw` (all of them) at `widthPx`: `each` for every character,
 *  one more for the first `extra`, so the total is the engine width
 *  floored to twips. */
export interface FitSpacing {
  each: number;
  extra: number;
}

export function fitSpacing(ctx: WriterContext, widthPx: number, naturalTw: number, count: number): FitSpacing {
  const total = Math.floor((widthPx * 1440) / ctx.dpi - naturalTw + 1e-6);
  const each = Math.floor(total / count);
  return { each, extra: total - each * count };
}

/** Natural advance (twips) of `text` in the Word face and size of
 *  `fontString`; undefined when the face's advances are unknown. */
export function naturalTwips(ctx: WriterContext, fontString: string, text: string): number | undefined {
  const face = ctx.metrics.faceAdvances(fontString);
  const ems = face && naturalEms(face, text);
  if (ems === undefined) return undefined;
  const f = resolveFont(ctx, fontString);
  return ems * f.sz * 10 * ((f.scale ?? 100) / 100);
}

/** Natural advance of one holder (twips): the face's no-break space,
 *  else its space, else a quarter em. */
export function holderTwips(ctx: WriterContext, fontString: string): number {
  const nat = naturalTwips(ctx, fontString, HOLDER) ?? naturalTwips(ctx, fontString, ' ');
  if (nat !== undefined) return nat;
  const f = resolveFont(ctx, fontString);
  return FALLBACK_SPACE_EM * f.sz * 10 * ((f.scale ?? 100) / 100);
}

/** The font string a run is written in: a blank run's is the word's
 *  beside it on the line (before, else after), else its own. */
export function writtenFace(run: DisplayRun, line: DisplayLine): string {
  return BLANK.test(run.text) ? blankFace(run, line) : run.fontString;
}

function blankFace(run: DisplayRun, line: DisplayLine): string {
  const i = line.runs.indexOf(run);
  const word = (r: DisplayRun | undefined): boolean => r !== undefined && !r.inline && r.text.length > 0 && !/^\s+$/.test(r.text);
  for (let k = i - 1; k >= 0; k--) if (word(line.runs[k])) return line.runs[k]!.fontString;
  for (let k = i + 1; k < line.runs.length; k++) if (word(line.runs[k])) return line.runs[k]!.fontString;
  return run.fontString;
}

const clampSpacing = (tw: number): number => Math.max(-MAX_SPACING, Math.min(MAX_SPACING, tw));

/** Pieces of `text` spaced by `fit`, the last character `gapTw` wider. */
function spacedPieces(ctx: WriterContext, run: DisplayRun, text: string, fit: FitSpacing, gapTw: number, rtl: boolean, more: Pick<RunPropsOptions, 'scale' | 'holder'> = {}): RunPiece[] {
  const chars = Array.from(text);
  const out: RunPiece[] = [];
  const push = (from: number, to: number, spacing: number): void => {
    if (to <= from) return;
    out.push({ rPr: runProps(ctx, run, { spacing: clampSpacing(spacing), rtl, ...more }), text: chars.slice(from, to).join('') });
  };
  const n = chars.length;
  const last = gapTw ? n - 1 : n;
  const extra = Math.min(fit.extra, last);
  // The wider characters are a block placed where neither of its ends
  // splits a ligature (at the start when nowhere does).
  const clean = (k: number): boolean => k <= 0 || k >= n || !LIGATURE.test(chars[k - 1]! + chars[k]!);
  let s = 0;
  if (extra > 0 && extra < last) {
    for (let k = 0; k + extra <= last; k++) {
      if (clean(k) && clean(k + extra)) {
        s = k;
        break;
      }
    }
  }
  push(0, s, fit.each);
  push(s, s + extra, fit.each + 1);
  push(s + extra, last, fit.each);
  if (gapTw) push(n - 1, n, fit.each + gapTw);
  return out;
}

const STYLE_KEYS = ['fontString', 'color', 'bold', 'italic', 'smallCaps', 'tracking', 'script', 'baselineShift', 'href', 'footnoteId', 'pageLink', 'rtl', 'orientation', 'tcy'] as const;

/** A run that may join its neighbour: plain text, no blank or tab. */
const joinable = (r: DisplayRun): boolean => r.text.length > 0 && !r.padStart && !r.padEnd && !r.inline && !r.ruby && !r.warichu && !r.kunten && !r.space && !/^\s+$/.test(r.text);

/** Letters of the alphabetic scripts a word of which hyphenation splits
 *  into runs (CJK runs stay apart: compressed punctuation is its own). */
const ALPHA = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u;

/** The line's runs with abutting runs of one style joined where letters
 *  meet (the pieces of a word hyphenation split): each is spaced out as a
 *  whole, so no run boundary falls inside a word, nor inside a ligature.
 *  `gaps` are per run of the line; the joined run keeps its last run's. */
export function joinWordRuns(line: DisplayLine, gaps: readonly number[]): { run: DisplayRun; gap: number }[] {
  const out: { run: DisplayRun; gap: number }[] = [];
  line.runs.forEach((r, i) => {
    const prev = out[out.length - 1];
    const p = prev?.run;
    if (p && !prev.gap && joinable(p) && joinable(r) && STYLE_KEYS.every((k) => p[k] === r[k]) && p.refTarget?.id === r.refTarget?.id) {
      const abut = r.rtl ? Math.abs(p.x - (r.x + r.width)) : Math.abs(r.x - (p.x + p.width));
      if (abut < 0.5 && ALPHA.test(Array.from(p.text).pop()!) && ALPHA.test(Array.from(r.text)[0]!)) {
        prev.run = { ...p, text: p.text + r.text, x: Math.min(p.x, r.x), width: p.width + r.width };
        prev.gap = gaps[i] ?? 0;
        return;
      }
    }
    out.push({ run: r, gap: gaps[i] ?? 0 });
  });
  return out;
}

function piecesOut(pieces: RunPiece[]): Pick<EmittedRun, 'rPr' | 'text' | 'pieces'> {
  const text = pieces.map((p) => p.text).join('');
  return pieces.length === 1 ? { rPr: pieces[0]!.rPr, text } : { rPr: pieces[0]!.rPr, text, pieces };
}

/** Px of a chip's padding that run `i` of `line` keeps out of its words:
 *  `before` is carried by the run before it, `after` by its own last
 *  character (left to right only; a chip that starts the line keeps it). */
export function padsOf(line: DisplayLine, i: number): { before: number; after: number } {
  const run = line.runs[i];
  if (!run || line.vertical || line.rtl || run.rtl) return { before: 0, after: 0 };
  const prev = line.runs.slice(0, i).some((r) => r.text.length > 0);
  return { before: prev ? (run.padStart ?? 0) : 0, after: run.padEnd ?? 0 };
}

/** The line with each chip run's padding taken out of its width and added
 *  to the gap after the run that carries it (`gaps` per run). */
export function unpadded(line: DisplayLine, gaps: readonly number[]): { line: DisplayLine; gaps: number[] } {
  const out = [...gaps];
  const runs = line.runs.map((r, i) => {
    const { before, after } = padsOf(line, i);
    if (!before && !after) return r;
    out[i] = (out[i] ?? 0) + after;
    if (before) for (let k = i - 1; k >= 0; k--) if (line.runs[k]!.text.length > 0) { out[k] = (out[k] ?? 0) + before; break; }
    return { ...r, x: r.x + before, width: Math.max(0, r.width - before - after) };
  });
  return { line: { ...line, runs }, gaps: out };
}

/** A run's properties, what it writes and anything to draw over it.
 *  `gapPx` is room after the run before the next one starts (a number set
 *  flush right): the last character carries it. */
export function emitRun(ctx: WriterContext, run: DisplayRun, line: DisplayLine, gapPx = 0): EmittedRun {
  const justified = line.align === 'justify';
  const rtl = run.rtl === true;
  const n = run.text.length;
  if (n === 0) return { rPr: '', text: '' };
  const gapTw = gapPx > 0 ? Math.floor((gapPx * 1440) / ctx.dpi) : 0;
  // Content with a width of its own: no-break spaces spaced out.
  const fixed = run.inline !== undefined && run.inline.kind !== 'chip' ? true : /^\t+$/.test(run.text);
  if (fixed) {
    const text = HOLDER.repeat(n);
    const out: EmittedRun = { ...piecesOut(spacedPieces(ctx, run, text, fitSpacing(ctx, run.width, holderTwips(ctx, run.fontString) * n, n), gapTw, rtl, { holder: run.inline !== undefined })) };
    const inl = run.inline;
    if (inl && (inl.svg || inl.kind === 'swatch')) {
      const ascent = inl.ascentPx ?? inl.heightPx * 0.8;
      out.drawing = {
        kind: inl.kind,
        ...(inl.svg ? { svg: inl.svg } : {}),
        ...(inl.kind === 'swatch' ? { color: inl.swatch?.color ?? run.color } : {}),
        rect: { x: run.x, y: line.baseline - (run.baselineShift ?? 0) - ascent, width: inl.widthPx, height: inl.heightPx },
      };
    }
    return out;
  }
  const blank = BLANK.test(run.text);
  // A blank run sets in its neighbour's face (its own emphasis flags stay).
  const r: DisplayRun = blank ? { ...run, fontString: blankFace(run, line) } : run;
  const text = wordText(run.text);
  let fit = measurable(ctx, r, line, blank) ? fitOf(ctx, r, text, justified && !blank ? JUSTIFY_ROOM_TW : 0) : undefined;
  // A space squeezed below its natural advance narrows by w:w: LibreOffice
  // drops the spacing of blanks on a justified line, and neither renderer
  // shrinks a space on its own. So does compressed punctuation in vertical
  // text, where LibreOffice drops negative spacing.
  let scale: number | undefined;
  if (fit && (blank || line.vertical) && fit.each < 0) {
    const nat = naturalTwips(ctx, r.fontString, text)!;
    const own = resolveFont(ctx, r.fontString).scale ?? 100;
    const runTw = (run.width * 1440) / ctx.dpi;
    scale = Math.max(1, Math.min(600, Math.floor((own * runTw) / nat)));
    fit = fitSpacing(ctx, run.width, (nat * scale) / own, Array.from(text).length);
  }
  const tracking = run.tracking ? twips(run.tracking, ctx.dpi) : 0;
  const isSpace = run.space === true || blank;
  // Unknown advances: tracking as given, justified spaces a hair tighter.
  const flat = tracking + (justified && isSpace ? SPACE_SPACING : 0);
  const spacing = fit ? fit.each : flat;
  const rPr = runProps(ctx, r, { spacing, rtl, ...(scale ? { scale } : {}) });
  const out: EmittedRun = { rPr, text };
  if (run.kunten) {
    const k = kuntenOf(run, line);
    if (k.annotations.length) out.annotations = k.annotations;
    if (k.rules.length) out.rules = k.rules;
  }
  if (run.ruby) {
    const rt: DisplayRun = { text: run.ruby.text, x: run.x, width: 0, fontString: run.ruby.fontString, color: run.ruby.color ?? run.color, textStart: 0 };
    const sizes = { base: resolveFont(ctx, run.fontString).sz, rt: resolveFont(ctx, run.ruby.fontString).sz };
    out.xml = rubyXml(ctx, run, text, rPr, runProps(ctx, rt, {}), sizes, line);
  } else if (run.warichu) {
    // Word's two lines in one puts the first half of the text on top.
    const { upper, lower } = run.warichu;
    if (upper.length !== Math.ceil((upper.length + lower.length) / 2)) {
      ctx.warn('warichu-split', `a warichu note's rows (${upper.length} and ${lower.length} characters) are split in half by Word's two lines in one`);
    }
    out.xml = textRun(runProps(ctx, run, { spacing: flat, rtl, ea: eastAsianLayout(ctx, 'combine') }), text);
  } else if (line.vertical && verticalPieces(ctx, run, text).some((piece) => piece.tcy)) {
    // Tate-chu-yoko cells: Word sets them across the line, unmeasured.
    const flatPr = runProps(ctx, r, { spacing: flat, rtl });
    out.xml = verticalPieces(ctx, run, text).map((piece) => textRun(piece.tcy ? runProps(ctx, run, { spacing: flat, rtl, ea: eastAsianLayout(ctx, 'vert') }) : flatPr, piece.text)).join('');
  } else if (fit && (fit.extra > 0 || gapTw)) {
    Object.assign(out, piecesOut(spacedPieces(ctx, r, text, fit, gapTw, rtl, scale ? { scale } : {})));
  } else if (gapTw) {
    Object.assign(out, piecesOut(spacedPieces(ctx, r, text, { each: flat, extra: 0 }, gapTw, rtl)));
  }
  return out;
}

/** Whether a run's natural width can be told from its face's advances. */
function measurable(ctx: WriterContext, run: DisplayRun, line: DisplayLine, blank: boolean): boolean {
  if (!ctx.plan || run.warichu) return false;
  // Word sizes small capitals and bare scripts down on its own.
  if (run.smallCaps || (run.script && !run.baselineShift)) return false;
  if (line.vertical && run.orientation === 'upright') return false;
  return blank || !COMPLEX.test(run.text);
}

function fitOf(ctx: WriterContext, run: DisplayRun, text: string, roomTw = 0): FitSpacing | undefined {
  const nat = naturalTwips(ctx, run.fontString, text);
  if (nat === undefined) return undefined;
  const count = Array.from(text).length;
  return fitSpacing(ctx, run.width, nat + roomTw * count, count);
}

/** The `MapFormat` flags of a run (b, i, c, p, s). A code block's lines are
 *  code by their paragraph style, not by inline backticks: no `k`, which
 *  would read back as removed. */
export function formatFlags(run: DisplayRun): string {
  let f = '';
  if (run.bold) f += 'b';
  if (run.italic) f += 'i';
  if (run.smallCaps) f += 'c';
  if (run.script === 'sup') f += 'p';
  if (run.script === 'sub') f += 's';
  return f;
}

/** An external link target Word can open (not an in-book anchor). */
export function linkTarget(href: string | undefined): string | undefined {
  if (!href) return undefined;
  return /^[a-z][a-z0-9+.-]*:/i.test(href) ? href : undefined;
}
