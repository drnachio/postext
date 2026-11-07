// numbering.xml of the semantic .docx (#1390): real Word lists (`w:numPr`)
// for the book's bulleted, numbered and task lists. Each run of list items
// gets its own `w:num` (so numbering restarts per list, at the source's
// first number); levels take their kind from the first item at that depth.
// A level's geometry follows the engine's (#1444): the marker at the
// level's indent, the text after the marker and the gap; a number set
// against the text (`numberAlign: 'end'`) is right-aligned; a level whose
// bullet is empty has no marker at all.

import type { ResolvedConfig } from '../../vdt.js';
import type { ResolvedCalloutStyleConfig } from '../../types.js';
import { deriveCalloutResolvedConfig } from '../../pipeline/callouts/calloutLayout/plan.js';
import { escapeAttr } from '../xml.js';
import { firstFamily, halfPoints, hex, px, twips, type RunProps, type Units } from './wml.js';

/** The face of a font stack at a weight and style, as the styles name it
 *  (through the export's font plan). */
export type FontOf = (stack: string | undefined, weight?: number, italic?: boolean) => RunProps;

/** Word's own face for the ballot boxes of its check boxes: Word has it
 *  everywhere, and the other renderers find the glyph in a fallback. */
const BOX_FONT = 'MS Gothic';

/** Rough advance of a number's characters, in ems (two digits, a roman
 *  numeral of three letters, one letter), for the width of the number
 *  column; and of a bullet. */
const NUMBER_EM: Record<string, number> = { decimal: 1.1, lowerRoman: 1.3, upperRoman: 1.6, lowerLetter: 0.6, upperLetter: 0.7 };
const BULLET_EM = 0.6;

export type ListLevelKind = 'bullet' | 'ordered' | 'task' | 'checked';

const NUM_FMT: Record<string, string> = {
  arabic: 'decimal',
  'lower-alpha': 'lowerLetter',
  'upper-alpha': 'upperLetter',
  'lower-roman': 'lowerRoman',
  'upper-roman': 'upperRoman',
};

export class Numbering {
  private readonly abstracts = new Map<string, { id: number; xml: string }>();
  private readonly nums: string[] = [];

  constructor(
    private readonly resolved: ResolvedConfig,
    private readonly units: Units,
    private readonly fontOf: FontOf = (stack) => ({ font: firstFamily(stack) }),
  ) {}

  get empty(): boolean {
    return this.nums.length === 0;
  }

  /** A new list instance whose levels have these kinds (index = depth −
   *  1); `start` restarts the first level at the source's number. A list
   *  in a box takes the bullets, colour, indent and gap of the box style's
   *  `lists`, as the engine sets it. */
  list(kinds: readonly ListLevelKind[], start?: number, box?: ResolvedCalloutStyleConfig): number {
    const levelKinds = Array.from({ length: 9 }, (_, i) => kinds[i] ?? kinds[kinds.length - 1] ?? 'bullet');
    const signature = `${box ? `${box.id}:` : ''}${levelKinds.join(',')}`;
    let abs = this.abstracts.get(signature);
    if (!abs) {
      const id = this.abstracts.size;
      abs = { id, xml: this.abstractXml(id, levelKinds, box ? deriveCalloutResolvedConfig(this.resolved, box) : this.resolved) };
      this.abstracts.set(signature, abs);
    }
    const numId = this.nums.length + 1;
    // Word continues the count across `w:num`s sharing an abstract
    // definition unless each restarts: every ordered level gets a start
    // override (the first at the source's number).
    let override = '';
    for (let i = 0; i < 9; i++) {
      if ((kinds[i] ?? kinds[kinds.length - 1]) !== 'ordered') continue;
      override += `<w:lvlOverride w:ilvl="${i}"><w:startOverride w:val="${i === 0 ? Math.max(0, start ?? 1) : 1}"/></w:lvlOverride>`;
    }
    this.nums.push(`<w:num w:numId="${numId}"><w:abstractNumId w:val="${abs.id}"/>${override}</w:num>`);
    return numId;
  }

  private abstractXml(id: number, kinds: ListLevelKind[], r: ResolvedConfig): string {
    const u = this.units;
    const bodyPx = px(u, r.bodyText.fontSize);
    const ul = r.unorderedLists;
    const ol = r.orderedLists;
    const tw = (pxValue: number): number => Math.round((pxValue * 1440) / u.dpi);
    let levels = '';
    // Where the previous level's text starts: a deeper level's marker
    // stands there unless the level sets its own indent.
    let prevText: number | undefined;
    kinds.forEach((kind, lvl) => {
      let fmt: string;
      let text: string;
      let run: RunProps;
      let jc: 'left' | 'right' = 'left';
      let indent: number;
      let marker: number;
      let gap: number;
      if (kind === 'ordered') {
        const level = ol.levels.find((l) => l.level === lvl + 1);
        fmt = NUM_FMT[level?.numberFormat ?? ol.numberFormat] ?? 'decimal';
        text = `${(level?.prefix ?? ol.prefix).replace(/%/g, '')}%${lvl + 1}${(level?.separator ?? ol.separator).replace(/%/g, '')}`;
        const size = level?.fontSize ?? ol.numberFontSize;
        const sizePx = px(u, size, bodyPx) || bodyPx;
        run = { ...this.fontOf(level?.fontFamily ?? ol.fontFamily, level?.fontWeight ?? ol.fontWeight, level?.italic ?? ol.italic), color: hex(level?.color ?? ol.color), sz: halfPoints(u, size, bodyPx) };
        indent = level?.indent ? twips(u, level.indent, bodyPx) : lvl === 0 || prevText === undefined ? twips(u, ol.indent, bodyPx) : prevText;
        marker = tw(sizePx * ((NUMBER_EM[fmt] ?? 1.1) + 0.3));
        gap = twips(u, ol.gap, bodyPx);
        if (ol.numberAlign !== 'start') jc = 'right';
      } else {
        const level = ul.levels.find((l) => l.level === lvl + 1);
        fmt = 'bullet';
        const task = kind === 'task' || kind === 'checked';
        text = kind === 'task' ? ul.taskCheckboxChar || '\u2610' : kind === 'checked' ? ul.taskCheckedChar || '\u2611' : (level ? level.bulletChar : ul.bulletChar);
        const size = level?.fontSize ?? ul.bulletFontSize;
        const sizePx = px(u, size, bodyPx) || bodyPx;
        run = { ...(task ? { font: BOX_FONT } : this.fontOf(level?.fontFamily ?? ul.fontFamily, level?.fontWeight ?? ul.fontWeight, level?.italic ?? ul.italic)), color: hex(level?.color ?? ul.color), sz: halfPoints(u, size, bodyPx) };
        indent = level?.indent ? twips(u, level.indent, bodyPx) : lvl === 0 || prevText === undefined ? twips(u, ul.indent, bodyPx) : prevText;
        marker = text ? tw(sizePx * BULLET_EM * Math.max(1, [...text].length)) : 0;
        gap = twips(u, ul.gap, bodyPx);
        if (!text) fmt = 'none';
      }
      const textStart = indent + marker + gap;
      prevText = textStart;
      // The number or bullet starts at the indent (or, set against the
      // text, ends one gap before it); a tab then takes the text to its
      // start. With no marker, or no gap to tab across, nothing follows it.
      const hanging = jc === 'right' ? gap : textStart - indent;
      const suff = fmt === 'none' || gap < 20 ? '<w:suff w:val="nothing"/>' : '';
      const ind = `<w:ind w:left="${textStart}" w:hanging="${Math.max(0, hanging)}"/>`;
      levels +=
        `<w:lvl w:ilvl="${lvl}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/>${suff}<w:lvlText w:val="${escapeAttr(text)}"/><w:lvlJc w:val="${jc}"/>` +
        `<w:pPr>${ind}</w:pPr>` +
        levelRPr(run) +
        '</w:lvl>';
    });
    return `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${levels}</w:abstractNum>`;
  }

  /** Inner XML of `w:numbering`: abstract definitions, then instances. */
  xml(): string {
    return [...this.abstracts.values()].map((a) => a.xml).join('') + this.nums.join('');
  }
}

/** The run properties of a level's number or bullet (CT_RPr order). */
function levelRPr(p: RunProps): string {
  let x = '';
  if (p.font) {
    const f = escapeAttr(p.font);
    x += `<w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:eastAsia="${f}" w:cs="${f}"/>`;
  }
  // Explicit on and off: the number does not take the bold or italic of
  // the item's first word.
  x += p.b ? '<w:b/><w:bCs/>' : '<w:b w:val="0"/><w:bCs w:val="0"/>';
  x += p.i ? '<w:i/><w:iCs/>' : '<w:i w:val="0"/><w:iCs w:val="0"/>';
  if (p.color) x += `<w:color w:val="${p.color}"/>`;
  if (p.sz) x += `<w:sz w:val="${p.sz}"/><w:szCs w:val="${p.sz}"/>`;
  return `<w:rPr>${x}</w:rPr>`;
}
