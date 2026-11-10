// East Asian setting of the formatted Word export (#1394): ruby as
// `w:ruby`, tate-chu-yoko (`:tcy`, short numbers `cjk.uprightDigits`
// sets upright, Japanese mark pairs, `:upright` Latin) as
// `w:eastAsianLayout w:vert`, a warichu note as Word's "two lines in one"
// (`w:combine`), and the kanbun marks as small positioned text boxes.
// Vertical text boxes are `eaVert`: Word sets CJK upright and Latin
// sideways down the line itself, as the engine does.

import type { DisplayAnnotation, DisplayLine, DisplayRect, DisplayRun } from '../../paint/displayList/types.js';
import { graphemesOf } from '../../measure/graphemes.js';
import { verticalOrientation, verticalRuns } from '../../writing/writingMode.js';
import { escapeAttr, escapeXml } from '../xml.js';
import { textBoxRun } from './drawing.js';
import { fontSizePx } from './metrics.js';
import { halfPoints, twips } from './units.js';
import type { WriterContext } from './types.js';

/** A run's text cut into the pieces a vertical line sets: `tcy` pieces
 *  stand in one upright cell. */
export interface VerticalPiece {
  text: string;
  tcy: boolean;
}

/** The pieces of a run on a vertical line: the whole run when it is a
 *  tate-chu-yoko cell, else the cells the measurer found (`verticalRuns`:
 *  short numbers, Japanese ！？ pairs), each Latin character of an
 *  `:upright[…]` run a cell of its own. */
export function verticalPieces(ctx: WriterContext, run: DisplayRun, text: string): VerticalPiece[] {
  if (run.tcy) return [{ text, tcy: true }];
  const region = ctx.cjk?.region ?? 'japan';
  const graphemes = graphemesOf(text);
  const out: VerticalPiece[] = [];
  const push = (t: string, tcy: boolean): void => {
    const last = out[out.length - 1];
    if (last && !last.tcy && !tcy) last.text += t;
    else out.push({ text: t, tcy });
  };
  if (run.orientation === 'upright') {
    for (const g of graphemes) push(g, verticalOrientation(g, region).orient === 'sideways' && !/^\s+$/.test(g));
    return out;
  }
  if (run.orientation === 'sideways') return [{ text, tcy: false }];
  for (const r of verticalRuns(graphemes, region, ctx.cjk?.uprightDigits ?? 0)) push(r.text, r.glyph.orient === 'tcy');
  return out;
}

/** `w:eastAsianLayout` of a tate-chu-yoko cell or a two-lines-in-one
 *  note, with an id of its own (Word joins adjacent runs that share one). */
export function eastAsianLayout(ctx: WriterContext, kind: 'vert' | 'combine'): string {
  const id = (ctx.eaId = (ctx.eaId ?? 0) + 1);
  return kind === 'vert'
    ? `<w:eastAsianLayout w:id="${id}" w:vert="1" w:vertCompress="1"/>`
    : `<w:eastAsianLayout w:id="${id}" w:combine="1"/>`;
}

/** A `w:r` of plain text. */
export function textRun(rPr: string, text: string): string {
  return text ? `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>` : '';
}

/** Characters set one em wide: CJK ideographs and symbols, kana,
 *  hangul, bopomofo, full-width forms. */
const WIDE = /^[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua960-\ua97f\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]|^[\u{20000}-\u{3fffd}]/u;

/** A reading's advance in ems, as Word sets it: wide characters one em,
 *  the rest about half an em (no face is measured here). */
export function readingEms(text: string): number {
  let ems = 0;
  for (const g of graphemesOf(text)) ems += /^\s+$/.test(g) ? 0.25 : WIDE.test(g) ? 1 : 0.5;
  return ems;
}

/** The size (half-points) and `rtPr` that set a reading of `ems` in
 *  `widthPx` along the line, when at `szHalfPoints` it would run longer:
 *  Word has no overhang and widens the base to its reading, lengthening
 *  the line the engine set (#1406). The size goes down: LibreOffice
 *  ignores a reading's character scale and spacing. */
export function condensedReading(ctx: WriterContext, rtPr: string, ems: number, szHalfPoints: number, widthPx: number): { rtPr: string; sz: number } | undefined {
  const scale = Number(/<w:w w:val="(\d+)"\/>/.exec(rtPr)?.[1] ?? 100) / 100;
  const advance = ems * ((szHalfPoints * ctx.dpi) / 144) * scale;
  if (!(widthPx > 0) || advance <= widthPx + 0.01) return undefined;
  const sz = Math.max(2, Math.floor((szHalfPoints * widthPx) / advance));
  return { rtPr: rtPr.replace(/<w:sz w:val="\d+"\/>/, `<w:sz w:val="${sz}"/>`).replace(/<w:szCs w:val="\d+"\/>/, `<w:szCs w:val="${sz}"/>`), sz };
}

/** The reading size (half-points) of a ruby that runs over its base, the
 *  smallest any run of its word takes: a jukugo word (runs of the line
 *  sharing the ruby's id) keeps one reading size, each reading within its
 *  own base, since Word widens a base to its reading. */
function rubyFit(ctx: WriterContext, run: DisplayRun, rtPr: string, rt: number, line: DisplayLine | undefined): { rtPr: string; sz: number } | undefined {
  const id = run.ruby!.id;
  const word = id !== undefined && line ? line.runs.filter((r) => r.ruby?.id === id) : [run];
  let fit: { rtPr: string; sz: number } | undefined;
  for (const r of word.length ? word : [run]) {
    const c = condensedReading(ctx, rtPr, readingEms(r.ruby!.text), rt, r.width);
    if (c && (!fit || c.sz < fit.sz)) fit = c;
  }
  return fit;
}

/** A ruby base and its reading as one `w:ruby`. `rPr` is the base's
 *  properties, `rtPr` the reading's; the sizes are half-points. A reading
 *  longer than the base is set smaller, to the base's width (`line`: the
 *  whole jukugo word at one size). */
export function rubyXml(ctx: WriterContext, run: DisplayRun, text: string, rPr: string, rtPr: string, sizes: { base: number; rt: number }, line?: DisplayLine): string {
  const ruby = run.ruby!;
  if (ruby.position === 'under') ctx.warn('ruby-under', 'a ruby set under its base is set over it in Word (Word has no ruby under the text)');
  if (ruby.position === 'right') ctx.warn('ruby-right', 'zhuyin set beside the characters is set over them in Word');
  const raise = ruby.raise !== undefined ? Math.max(0, Math.round(halfPoints(Math.abs(ruby.raise), ctx.dpi))) : sizes.base;
  const align = ruby.group ? 'distributeSpace' : 'center';
  const lid = escapeAttr(ctx.lang ?? 'ja-JP');
  const condensed = rubyFit(ctx, run, rtPr, sizes.rt, line);
  if (condensed) ctx.warn('ruby-overhang', `the reading "${ruby.text}" (or another of its word) runs over its base, which Word does not allow: it is set smaller to fit the base`);
  return (
    `<w:r>${rPr}<w:ruby>` +
    `<w:rubyPr><w:rubyAlign w:val="${align}"/><w:hps w:val="${condensed?.sz ?? sizes.rt}"/><w:hpsRaise w:val="${raise}"/><w:hpsBaseText w:val="${sizes.base}"/><w:lid w:val="${lid}"/></w:rubyPr>` +
    `<w:rt>${textRun(condensed?.rtPr ?? rtPr, ruby.text)}</w:rt>` +
    `<w:rubyBase>${textRun(rPr, text)}</w:rubyBase>` +
    '</w:ruby></w:r>'
  );
}

/** Text drawn beside a run (a kanbun mark), in the item's unturned
 *  frame: `x` where it starts along the line, `baseline` its baseline. */
export interface Annotation {
  text: string;
  fontString: string;
  color: string;
  x: number;
  baseline: number;
  vertical: boolean;
}

/** The kanbun marks of a run as annotations, and its 竪点 as a rule
 *  (from, to along the line, at `y`, `thickness` across). */
export function kuntenOf(run: DisplayRun, line: DisplayLine): { annotations: Annotation[]; rules: { x1: number; x2: number; y: number; thickness: number; color: string }[] } {
  const k = run.kunten;
  if (!k) return { annotations: [], rules: [] };
  const color = k.color ?? run.color;
  const ann = (a: DisplayAnnotation): Annotation => ({ text: a.text, fontString: a.fontString, color: a.color ?? color, x: run.x + a.dx, baseline: line.baseline + a.dy, vertical: line.vertical === true });
  const rules = k.tate ? [{ x1: run.x + k.tate.dx, x2: run.x + k.tate.dx + k.tate.length, y: line.baseline + k.tate.dy, thickness: k.tate.thickness, color }] : [];
  return { annotations: k.runs.filter((r) => r.text.length > 0).map(ann), rules };
}

/** The reading of a ruby on a vertical line as annotations where the
 *  engine painted it (undefined when the run has no placed reading).
 *  LibreOffice sets a `w:ruby` of vertical text with its base moved off
 *  the column by about the reading's size, toward the next column
 *  (差支, 丈 jogged 3 to 5 pt), and ignores `w:hpsRaise`; Google Docs has
 *  no ruby. The base stays in the line as plain text and the reading is
 *  drawn beside it as the kanbun marks are. The importer reads a ruby's
 *  reading from its source, so nothing is lost on the way back. */
export function rubyAnnotations(run: DisplayRun, line: DisplayLine): Annotation[] | undefined {
  const ruby = run.ruby;
  if (!ruby?.runs?.length || !line.vertical) return undefined;
  const color = ruby.color ?? run.color;
  return ruby.runs.filter((a) => a.text.length > 0).map((a) => ({ text: a.text, fontString: a.fontString, color: a.color ?? color, x: run.x + a.dx, baseline: line.baseline + a.dy, vertical: true }));
}

/** The box of an annotation in the item's unturned frame: one em a
 *  character along the line, across it from the ascent (horizontal) or
 *  centred on the baseline (vertical: a central baseline). */
export function annotationRect(a: Annotation): DisplayRect {
  const size = fontSizePx(a.fontString) || 8;
  const length = size * Math.max(1, graphemesOf(a.text).length);
  return a.vertical
    ? { x: a.x, y: a.baseline - size * 0.6, width: length, height: size * 1.2 }
    : { x: a.x, y: a.baseline - size * 0.88, width: length, height: size * 1.2 };
}

/** One small text box holding `xml` (a paragraph's runs) at `rect` on the
 *  sheet, line pitch the font's 1.2 em. */
export function smallTextBox(ctx: WriterContext, rect: DisplayRect, runsXml: string, sizePx: number, rotate: number | undefined, vert: 'horz' | 'eaVert'): string {
  const pitch = Math.max(20, twips(sizePx * 1.2, ctx.dpi));
  const p =
    '<w:p><w:pPr><w:pStyle w:val="PostextLabel"/><w:suppressAutoHyphens/><w:kinsoku w:val="0"/><w:autoSpaceDE w:val="0"/><w:autoSpaceDN w:val="0"/><w:snapToGrid w:val="0"/>' +
    `<w:spacing w:before="0" w:after="0" w:line="${pitch}" w:lineRule="exact"/><w:ind w:left="0" w:right="0" w:firstLine="0"/><w:jc w:val="left"/></w:pPr>${runsXml}</w:p>`;
  return textBoxRun(ctx, { rect, name: 'ptx mark', ...(rotate ? { rotate } : {}) }, p, vert);
}
