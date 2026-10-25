/**
 * The synthetic styles an exercise is set with (#1227): chip styles for its
 * number, blanks, boxes and rings; paragraph styles for its instruction,
 * options and items; frameless boxes. All ids start `__postext-ex`, so no
 * fence picks them by accident and the fallbacks skip them.
 */

import type { CalloutStyleConfig, ChipStyleConfig, Dimension, ParagraphStyleConfig, TabStop } from '../types.js';
import type { ResolvedExerciseStyle } from '../defaults/exercises.js';
import { CHIP_ASCENT_RATIO, CHIP_DESCENT_RATIO } from '../measure/rich.js';

export const EX_PREFIX = '__postext-ex';

const EM = (value: number): Dimension => ({ value, unit: 'em' });
const PT = (value: number): Dimension => ({ value, unit: 'pt' });

/** The ids of an exercise style's synthetic styles. */
export function exerciseStyleIds(style: Pick<ResolvedExerciseStyle, 'id'>) {
  const p = `${EX_PREFIX}-${style.id}`;
  return {
    frame: `${p}-frame`,
    solutionBox: `${p}-solution`,
    bankBox: `${p}-bank`,
    instruction: `${p}-instruction`,
    option: `${p}-option`,
    optionUnder: `${p}-option-under`,
    solutionList: `${p}-solution-list`,
    row: `${p}-row`,
    item: `${p}-item`,
    statement: `${p}-statement`,
    pairs: `${p}-pairs`,
    key: `${p}-key`,
    text: `${p}-text`,
    number: `${p}-number`,
    level: `${p}-level`,
    icon: `${p}-icon`,
    blank: `${p}-blank`,
    blankAnswer: `${p}-blank-answer`,
    choice: `${p}-choice`,
    choiceRing: `${p}-choice-ring`,
    tick: `${p}-tick`,
    tickOn: `${p}-tick-on`,
    rank: `${p}-rank`,
    rankAnswer: `${p}-rank-answer`,
    word: `${p}-word`,
    answer: `${p}-answer`,
    mark: `${p}-mark`,
    markOn: `${p}-mark-on`,
    markPlain: `${p}-mark-plain`,
  };
}

export type ExerciseStyleIds = ReturnType<typeof exerciseStyleIds>;

/** Room a label (`a)`, `ア`, `(أ)`) takes before an option's text. */
export function labelRoomEm(style: ResolvedExerciseStyle): number {
  if (style.options.labels === 'none') return style.options.marker === 'none' ? 0 : 1.6;
  const affix = (style.options.prefix + style.options.suffix).length * 0.4;
  return Math.max(1.5, 1.1 + affix) + (style.options.marker === 'none' ? 0 : 1.6);
}

/** A shaped number's padding over and under its digits, in ems of the
 *  number. */
const NUMBER_PAD_TOP = 0.16;
const NUMBER_PAD_BOTTOM = 0.08;

/** The band a shaped number's box takes on its line, in ems of the text
 *  around it (`fontEm`: the number's size in those ems): how tall it is and
 *  how far it reaches below the baseline (#1248). The activity icons beside
 *  it share it. */
export function shapedNumberBand(fontEm: number): { height: number; drop: number } {
  const above = fontEm * (CHIP_ASCENT_RATIO + NUMBER_PAD_TOP);
  const drop = fontEm * (CHIP_DESCENT_RATIO + NUMBER_PAD_BOTTOM);
  return { height: above + drop, drop };
}

/** The chip styles of an exercise style. */
export function exerciseChipStyles(style: ResolvedExerciseStyle): ChipStyleConfig[] {
  const ids = exerciseStyleIds(style);
  const n = style.number;
  const shaped = n.shape !== 'none';
  const numberColor = n.color ?? (shaped ? { hex: '#ffffff', model: 'hex' as const } : n.background);
  const answer = style.answers.color;
  const ink = style.blank.color;
  const blankLook = style.blank.look;
  // A box (or ring) to tick: set at 0.8 of the text, as wide as it is
  // tall (the chip's band is 1.05 em tall).
  const tick: ChipStyleConfig = {
    id: ids.tick, backgroundEnabled: false, borderWidth: EM(0.07), borderRadius: EM(style.options.marker === 'circle' ? 1 : 0.12),
    ...(ink ? { borderColor: ink } : {}), fontSize: EM(0.8), paddingX: EM(0), paddingY: EM(0), minWidth: EM(1.05), gap: EM(0.4),
  };
  return [
    {
      id: ids.number,
      backgroundEnabled: shaped,
      background: n.background,
      borderWidth: PT(0),
      borderRadius: EM(n.shape === 'disc' ? 1 : n.shape === 'rounded' ? 0.25 : 0),
      paddingX: EM(shaped ? 0.3 : 0),
      paddingTop: EM(shaped ? NUMBER_PAD_TOP : 0),
      paddingBottom: EM(shaped ? NUMBER_PAD_BOTTOM : 0),
      ...(shaped ? { minWidth: EM(1.25) } : {}),
      ...(n.fontFamily ? { fontFamily: n.fontFamily } : {}),
      fontSize: n.fontSize,
      color: numberColor,
      bold: n.fontWeight >= 600,
      gap: EM(0.45),
    },
    { id: ids.level, backgroundEnabled: false, borderWidth: PT(0), paddingX: EM(0), paddingY: EM(0), color: style.level.color, fontSize: EM(0.7), gap: EM(0.35) },
    { id: ids.icon, backgroundEnabled: false, borderWidth: PT(0), paddingX: EM(0), paddingY: EM(0), gap: EM(0.35) },
    // A blank: as wide as its answer (or the longest), the answer itself
    // not painted in the pupil's edition.
    {
      id: ids.blank,
      backgroundEnabled: false,
      ...(ink ? { borderColor: ink } : { borderColor: { hex: '#000000', model: 'hex' } }),
      borderWidth: blankLook === 'none' ? PT(0) : style.blank.weight,
      borderRadius: EM(blankLook === 'box' ? 0.12 : 0),
      ...(blankLook === 'line' ? { underline: 'solid' as const } : blankLook === 'dots' ? { underline: 'dotted' as const } : {}),
      paddingX: EM(0.2),
      paddingTop: EM(blankLook === 'box' ? 0.12 : 0),
      paddingBottom: EM(blankLook === 'box' ? 0.08 : 0.05),
      minWidth: typeof style.blank.width === 'object' ? style.blank.width : style.blank.minWidth,
      gap: EM(0.2),
    },
    {
      id: ids.blankAnswer,
      backgroundEnabled: false,
      ...(ink ? { borderColor: ink } : { borderColor: { hex: '#000000', model: 'hex' } }),
      borderWidth: blankLook === 'none' ? PT(0) : style.blank.weight,
      borderRadius: EM(blankLook === 'box' ? 0.12 : 0),
      ...(blankLook === 'line' ? { underline: 'solid' as const } : blankLook === 'dots' ? { underline: 'dotted' as const } : {}),
      paddingX: EM(0.2),
      paddingTop: EM(blankLook === 'box' ? 0.12 : 0),
      paddingBottom: EM(blankLook === 'box' ? 0.08 : 0.05),
      minWidth: typeof style.blank.width === 'object' ? style.blank.width : style.blank.minWidth,
      gap: EM(0.2),
      color: answer,
      ...(style.answers.fontFamily ? { fontFamily: style.answers.fontFamily } : {}),
      italic: style.answers.italic ?? false,
    },
    // The options of an inline choice: the right one ringed where answers
    // show; both keep one geometry so the line does not move, and take
    // little room beside the words around them (a ring hugs its word).
    { id: ids.choice, backgroundEnabled: false, borderWidth: EM(0), borderRadius: EM(0.6), paddingX: EM(0.08), paddingY: EM(0.1), gap: EM(0) },
    { id: ids.choiceRing, backgroundEnabled: false, borderColor: answer, borderWidth: EM(0.06), borderRadius: EM(0.6), paddingX: EM(0.02), paddingY: EM(0.04), gap: EM(0) },
    tick,
    // The box an item's number is written in (order).
    { ...tick, id: ids.rank, fontSize: EM(1), borderWidth: PT(0.8), borderRadius: EM(0.12), minWidth: EM(1.3), paddingTop: EM(0.1), paddingBottom: EM(0.04) },
    { ...tick, id: ids.rankAnswer, fontSize: EM(1), borderWidth: PT(0.8), borderRadius: EM(0.12), minWidth: EM(1.3), paddingTop: EM(0.1), paddingBottom: EM(0.04), color: answer },
    { ...tick, id: ids.tickOn, backgroundEnabled: true, background: answer, borderColor: answer, color: { hex: '#ffffff', model: 'hex' } },
    // A word of a bank or a scrambled sentence.
    { id: ids.word, backgroundEnabled: false, borderWidth: PT(0.6), ...(ink ? { borderColor: ink } : {}), borderRadius: EM(0.3), paddingX: EM(0.35), paddingY: EM(0.06), gap: EM(0.5) },
    // An answer written in a teacher's edition (an order's rank…).
    { id: ids.answer, backgroundEnabled: false, borderWidth: PT(0), paddingX: EM(0), paddingY: EM(0), color: answer, ...(style.answers.fontFamily ? { fontFamily: style.answers.fontFamily } : {}), gap: EM(0.25) },
    // A word to mark: plain in the pupil's edition, ringed in the answers.
    { id: ids.mark, backgroundEnabled: false, borderWidth: EM(0), borderRadius: EM(0.6), paddingX: EM(0.08), paddingY: EM(0.08), gap: EM(0) },
    // A word of the text not to mark: a slot on screen, set as plain text.
    { id: ids.markPlain, backgroundEnabled: false, borderWidth: EM(0), paddingX: EM(0), paddingY: EM(0), gap: EM(0) },
    { id: ids.markOn, backgroundEnabled: false, borderColor: answer, borderWidth: EM(0.06), borderRadius: EM(0.6), paddingX: EM(0.02), paddingY: EM(0.02), gap: EM(0) },
    // The other ways a marked word shows (`mark=box|underline|highlight`).
    { id: `${ids.markOn}-box`, backgroundEnabled: false, borderColor: answer, borderWidth: EM(0.06), borderRadius: EM(0.08), paddingX: EM(0.02), paddingY: EM(0.02), gap: EM(0) },
    { id: `${ids.markOn}-underline`, backgroundEnabled: false, borderColor: answer, borderWidth: EM(0.08), underline: 'solid', paddingX: EM(0), paddingY: EM(0), gap: EM(0) },
    { id: `${ids.markOn}-highlight`, backgroundEnabled: true, background: { hex: '#ffe58a', model: 'hex' }, borderWidth: EM(0), borderRadius: EM(0.15), paddingX: EM(0.08), paddingY: EM(0.08), gap: EM(0) },
  ];
}

/** The paragraph styles of an exercise style. */
export function exerciseParagraphStyles(style: ResolvedExerciseStyle): ParagraphStyleConfig[] {
  const ids = exerciseStyleIds(style);
  const ins = style.instruction;
  const room = labelRoomEm(style);
  const indent = style.options.indent;
  const columns = style.options.columns;
  const rowStops: TabStop[] = [];
  if (columns && columns > 1) for (let k = 1; k < columns; k++) rowStops.push({ position: `${Math.round((k * 1000) / columns) / 10}%` });
  const item = style.itemSpacing;
  return [
    {
      id: ids.instruction,
      ...(ins.fontFamily ? { fontFamily: ins.fontFamily } : {}),
      ...(ins.fontSize ? { fontSize: ins.fontSize } : {}),
      ...(ins.color ? { color: ins.color, boldColor: ins.color } : {}),
      ...(ins.italic ? { italic: true } : {}),
      firstLineIndent: EM(0),
      spaceBetween: item,
      marginBottom: EM(0.4),
    },
    { id: ids.option, indent, firstLineIndent: EM(0), hangingIndent: EM(room), tabStops: room > 0 ? [{ position: EM(room) }] : [], spaceBetween: item, marginTop: item, marginBottom: item },
    // The options of a question with a stem, under the stem's text.
    { id: ids.optionUnder, indent: EM(1.8), firstLineIndent: EM(0), hangingIndent: EM(room), tabStops: room > 0 ? [{ position: EM(room) }] : [], spaceBetween: item, marginTop: item, marginBottom: EM(0.5) },
    { id: ids.row, indent, firstLineIndent: EM(0), tabStops: rowStops, tabInterval: EM(8), spaceBetween: item, marginTop: item, marginBottom: item },
    // Options side by side, n to a row (`columns=n`): a stop at each n-th.
    ...[1, 2, 3, 4, 5, 6].map((n): ParagraphStyleConfig => ({
      id: `${ids.row}-${n}`, indent, firstLineIndent: EM(0),
      tabStops: Array.from({ length: n - 1 }, (_, k) => ({ position: `${Math.round(((k + 1) * 1000) / n) / 10}%` as const })),
      spaceBetween: item, marginTop: item, marginBottom: item,
    })),
    { id: ids.item, firstLineIndent: EM(0), hangingIndent: EM(1.8), tabStops: [{ position: EM(1.8) }], spaceBetween: item, marginTop: item, marginBottom: item },
    // A true/false statement: its boxes flush with the end of the line.
    { id: ids.statement, firstLineIndent: EM(0), hangingIndent: EM(1.8), tabStops: [{ position: EM(1.8) }, { position: 'end', align: 'end' }], spaceBetween: item, marginTop: item, marginBottom: item },
    // A pair of a match exercise lettered: its letter bracket at the end.
    { id: ids.pairs, firstLineIndent: EM(0), tabStops: [{ position: '50%' }], spaceBetween: item, marginTop: item, marginBottom: item },
    // A key's number, then its answers at the first stop past it (`一、`
    // and `12.` are wider than 1.8 em).
    { id: ids.key, firstLineIndent: EM(0), hangingIndent: EM(1.8), tabStops: [{ position: EM(1.8) }, { position: EM(2.6) }, { position: EM(3.4) }], spaceBetween: EM(0.15) },
    // The exercise's own paragraphs (its text, its bank), never indented.
    { id: ids.text, firstLineIndent: EM(0), spaceBetween: item, marginTop: item, marginBottom: item },
  ];
}

/** The frameless box an exercise is set in when its style names none, and
 *  the boxes of its solutions and word bank. */
export function exerciseBoxStyles(style: ResolvedExerciseStyle, solutionBox: string | undefined, bodySizePt: number): CalloutStyleConfig[] {
  const ids = exerciseStyleIds(style);
  const out: CalloutStyleConfig[] = [];
  if (!style.box) {
    out.push({
      id: ids.frame, name: 'Exercise', title: '', backgroundEnabled: false, border: { enabled: false }, padding: { top: PT(0), right: PT(0), bottom: PT(0), left: PT(0) },
      stripe: { enabled: false }, icon: { kind: 'none' }, marker: { kind: 'none' }, marginTop: style.marginTop, marginBottom: style.marginBottom,
      snapToGrid: false, keepTogether: true,
    });
  }
  if (!solutionBox) {
    out.push({
      id: ids.solutionBox, name: 'Solution', title: '', backgroundEnabled: false, border: { enabled: false }, padding: { top: PT(0), right: PT(0), bottom: PT(0), left: PT(0) },
      stripe: { enabled: false }, icon: { kind: 'none' }, marker: { kind: 'none' }, marginTop: EM(0.5), marginBottom: EM(0.8), snapToGrid: false, keepTogether: true,
      body: { fontSize: PT(Math.round(bodySizePt * 0.85 * 100) / 100) },
    });
  }
  if (!solutionBox) {
    // The solutions of a chapter, listed at its end: split across pages.
    out.push({
      id: ids.solutionList, name: 'Solutions', title: '', backgroundEnabled: false, border: { enabled: false }, padding: { top: PT(0), right: PT(0), bottom: PT(0), left: PT(0) },
      stripe: { enabled: false }, icon: { kind: 'none' }, marker: { kind: 'none' }, marginTop: EM(1), marginBottom: EM(0.8), snapToGrid: false, keepTogether: false,
      titleStyle: { fontSize: PT(Math.round(bodySizePt * 1.15 * 100) / 100), fontWeight: 700 },
      body: { fontSize: PT(Math.round(bodySizePt * 0.9 * 100) / 100) },
    });
  }
  if (!style.bank.box) {
    out.push({
      id: ids.bankBox, name: 'Word bank', title: '', backgroundEnabled: false, border: { enabled: true, color: style.match.color, width: PT(0.8) }, borderRadius: EM(0.4),
      padding: { top: EM(0.35), right: EM(0.6), bottom: EM(0.35), left: EM(0.6) }, stripe: { enabled: false }, icon: { kind: 'none' }, marker: { kind: 'none' },
      marginTop: EM(0.4), marginBottom: EM(0.6), snapToGrid: false, keepTogether: true,
    });
  }
  return out;
}
