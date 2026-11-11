// Where the first line of a text frame stands.
//
// InDesign places the first baseline of a frame from the frame's top
// inset by a rule of the frame (`FirstBaselineOffset`): the font's
// ascent, its cap height or x-height, the line's leading, or a fixed
// distance, and never less than `MinimumFirstBaselineOffset`. Postext
// has one rule: the baseline of a line is 0.8 of its leading under the
// top of its line box, and the first line box starts at the frame's top
// padding. The difference between the two is added to the frame's top
// padding, or, when it is negative, the frame is moved up by it, so the
// first baseline lands where the document has it and every line under
// it follows by its leading as in InDesign.
//
// The insets, the baseline rule and the vertical justification of a
// frame are its own or its object style's: both are read here.

import type { IdmlPageItem, IdmlParagraph } from '../../model/document.js';
import { listNumbers } from '../../read/props.js';
import { styleChain } from '../../resolve/styles.js';
import { num, property, type XmlElement } from '../../xml/read.js';
import type { Context } from '../context.js';
import { ownText } from '../looks.js';

export interface FrameSetup {
  /** Top, left, bottom, right. */
  inset: [number, number, number, number];
  firstBaseline: string;
  minFirstBaseline: number;
  verticalJustification: string;
}

const setups = new WeakMap<IdmlPageItem, FrameSetup>();

function lay(out: FrameSetup, pref: XmlElement | undefined, general: boolean, baseline: boolean): void {
  if (!pref) return;
  if (general) {
    const list = listNumbers(property(pref, 'InsetSpacing'));
    const one = num(pref, 'InsetSpacing');
    if (list?.length === 4) out.inset = [list[0]!, list[1]!, list[2]!, list[3]!];
    else if (list?.length === 1) out.inset = [list[0]!, list[0]!, list[0]!, list[0]!];
    else if (one !== undefined) out.inset = [one, one, one, one];
    if (pref.attrs.VerticalJustification) out.verticalJustification = pref.attrs.VerticalJustification;
  }
  if (baseline) {
    if (pref.attrs.FirstBaselineOffset) out.firstBaseline = pref.attrs.FirstBaselineOffset;
    const min = num(pref, 'MinimumFirstBaselineOffset');
    if (min !== undefined) out.minFirstBaseline = min;
  }
}

/** The text frame options of an item: InDesign's defaults, under what its
 *  object style and the styles that one is based on set (each only for
 *  the categories it has switched on), under what the frame sets itself. */
export function frameSetup(ctx: Context, item: IdmlPageItem): FrameSetup {
  const hit = setups.get(item);
  if (hit) return hit;
  const out: FrameSetup = { inset: [0, 0, 0, 0], firstBaseline: 'AscentOffset', minFirstBaseline: 0, verticalJustification: 'TopAlign' };
  for (const style of styleChain(ctx.doc, 'object', item.objectStyle)) {
    lay(out, style.properties.TextFramePreference, style.attrs.EnableTextFrameGeneralOptions !== 'false', style.attrs.EnableTextFrameBaselineOptions !== 'false');
  }
  lay(out, item.properties.TextFramePreference, true, true);
  if (!out.inset.every((n) => Number.isFinite(n) && n >= 0)) out.inset = [0, 0, 0, 0];
  if (!Number.isFinite(out.minFirstBaseline) || out.minFirstBaseline < 0) out.minFirstBaseline = 0;
  setups.set(item, out);
  return out;
}

export interface LineType {
  size: number;
  leading: number;
}

const holdsSomething = (p: IdmlParagraph): boolean => ownText(p).trim() !== '' || p.runs.some((r) => r.content.some((i) => i.kind === 'table' || i.kind === 'item' || i.kind === 'footnote' || i.kind === 'endnote'));

const typeOf = (ctx: Context, p: IdmlParagraph): LineType => {
  const cf = ctx.looks.of(p).cf;
  return { size: cf.pointSize, leading: cf.leading };
};

/** The lines a story opens with: the empty paragraphs before its text
 *  (lines the designer typed, which the Markdown does not carry at the
 *  head of a frame) and the first paragraph that holds something. */
export function openingLines(ctx: Context, paragraphs: readonly IdmlParagraph[]): LineType[] {
  const out: LineType[] = [];
  for (const p of paragraphs) {
    out.push(typeOf(ctx, p));
    if (holdsSomething(p) || out.length > 40) break;
  }
  return out;
}

/** The type most of a story is set in: what a frame further down its
 *  thread most likely opens with. */
export function runningLines(ctx: Context, paragraphs: readonly IdmlParagraph[]): LineType[] {
  const tally = new Map<object, { n: number; p: IdmlParagraph }>();
  let best: { n: number; p: IdmlParagraph } | undefined;
  for (const p of paragraphs) {
    const look = ctx.looks.of(p);
    let t = tally.get(look);
    if (!t) tally.set(look, (t = { n: 0, p }));
    t.n += ownText(p).length;
    if (!best || t.n > best.n) best = t;
  }
  return best ? [typeOf(ctx, best.p)] : [];
}

// Typical proportions of a text face, in em: the importer has no font
// files to measure.
const ASCENT = 0.72;
const CAP_HEIGHT = 0.68;
const X_HEIGHT = 0.47;
const EM_BOX = 0.88;
/** Postext: a line's baseline under the top of its line box, in leadings. */
const POSTEXT_BASELINE = 0.8;

/** How far under the frame's top inset InDesign sets the first baseline
 *  of a line of this type. `estimated` when the rule reads the font. */
export function firstBaselineOffset(setup: FrameSetup, line: LineType): { offset: number; estimated: boolean } {
  let offset: number;
  let estimated = false;
  switch (setup.firstBaseline) {
    case 'FixedHeight':
      offset = setup.minFirstBaseline;
      break;
    case 'LeadingOffset':
      offset = line.leading;
      break;
    case 'CapHeight':
      offset = line.size * CAP_HEIGHT;
      estimated = true;
      break;
    case 'XHeight':
      offset = line.size * X_HEIGHT;
      estimated = true;
      break;
    case 'EmBoxHeight':
      offset = line.size * EM_BOX;
      estimated = true;
      break;
    default:
      offset = line.size * ASCENT;
      estimated = true;
  }
  if (setup.minFirstBaseline > offset) {
    offset = setup.minFirstBaseline;
    estimated = false;
  }
  return { offset, estimated };
}

/** What to add to a frame's top padding (negative: move the frame up) so
 *  that the first baseline of its text stands where InDesign has it. */
export function firstLineShift(ctx: Context, setup: FrameSetup, lines: readonly LineType[], where: string): number {
  const first = lines[0];
  const text = lines[lines.length - 1];
  if (!first || !text || !(text.leading > 0)) return 0;
  const { offset, estimated } = firstBaselineOffset(setup, first);
  let baseline = offset;
  for (let n = 1; n < lines.length; n++) baseline += lines[n]!.leading;
  if (estimated) ctx.rep.add('firstBaselineEstimated', 'info', `The first line of a frame placed by the font's ascent, cap height or x-height stands where a typical text face puts it (${ASCENT}, ${CAP_HEIGHT} and ${X_HEIGHT} em): the importer has no font files to measure, so it may stand a point higher or lower than in InDesign`, `${setup.firstBaseline.replace(/Offset$/, '')} (${where})`);
  const shift = baseline - text.leading * POSTEXT_BASELINE;
  return Number.isFinite(shift) ? Math.round(shift * 10) / 10 : 0;
}

/** Whether the first baseline of a frame is the one to match: text set
 *  from the top (or spread over the height). A frame set from the middle
 *  or the foot hangs its text from there in both. */
export const fromTop = (setup: FrameSetup): boolean => setup.verticalJustification === 'TopAlign' || setup.verticalJustification === 'JustifyAlign';
