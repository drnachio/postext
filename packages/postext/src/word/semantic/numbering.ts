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

/** The face of the ballot boxes of a task list (#1444): a symbol face
 *  Word has on every system and Word for the web serves; Word's own check
 *  boxes use MS Gothic, kept for the East Asian slot. Other renderers that
 *  have neither find the glyph in a fallback face, when they have one. */
const BOX_FONT = 'Segoe UI Symbol';

/** The East Asian slot of the ballot boxes: Word's own check box face. */
const BOX_FONT_EA = 'MS Gothic';

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

  /** Whether the first level's number of an ordered list (in a box: the
   *  box's lists) is set larger than the text of its item (#1444): a
   *  display number, which would open the leading of its item's first
   *  line in Word and LibreOffice. */
  numberOutgrows(box?: ResolvedCalloutStyleConfig): boolean {
    const r = box ? deriveCalloutResolvedConfig(this.resolved, box) : this.resolved;
    const u = this.units;
    const bodyPx = px(u, r.bodyText.fontSize);
    const ol = r.orderedLists;
    const size = ol.levels.find((l) => l.level === 1)?.fontSize ?? ol.numberFontSize;
    return px(u, size, bodyPx) > bodyPx * 1.05;
  }

  private abstractXml(id: number, kinds: ListLevelKind[], r: ResolvedConfig): string {
    const u = this.units;
    const bodyPx = px(u, r.bodyText.fontSize);
    const ul = r.unorderedLists;
    const ol = r.orderedLists;
    const tw = (pxValue: number): number => Math.round((pxValue * 1440) / u.dpi);
    let levels = '';
    // A number no larger than the item's leading (#1444): Word sets a line
    // as tall as its tallest character, so a display number twice the
    // text's size would double the leading of every item it opens; at the
    // leading's size it opens it by a fifth at most.
    const numberCap = Math.max(2, Math.round(twips(u, r.bodyText.lineHeight, bodyPx) / 10));
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
        run = { ...this.fontOf(level?.fontFamily ?? ol.fontFamily, level?.fontWeight ?? ol.fontWeight, level?.italic ?? ol.italic), color: hex(level?.color ?? ol.color), sz: Math.min(halfPoints(u, size, bodyPx), numberCap) };
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

  /** List instance `numId` with every level's number or bullet in ink
   *  `color` (a part's chapter list on its coloured band, #1444): Word
   *  gives a number its level's colour over the paragraph mark's, so the
   *  ink needs a definition of its own. Counts restart as `numId`'s do. */
  inked(numId: number, color: string): number {
    const num = this.nums[numId - 1];
    const absId = num ? /<w:abstractNumId w:val="(\d+)"\/>/.exec(num)?.[1] : undefined;
    const src = absId === undefined ? undefined : [...this.abstracts.values()].find((a) => a.id === Number(absId));
    if (!num || !src) return numId;
    const signature = `ink:${src.id}:${color}`;
    let abs = this.abstracts.get(signature);
    if (!abs) {
      const id = this.abstracts.size;
      const own = `<w:color w:val="${color}"/>`;
      const xml = src.xml
        .replace(/w:abstractNumId="\d+"/, `w:abstractNumId="${id}"`)
        .replace(/<w:rPr>((?:(?!<\/w:rPr>)[\s\S])*)<\/w:rPr>/g, (_m, inner: string) => {
          if (/<w:color [^>]*\/>/.test(inner)) return `<w:rPr>${inner.replace(/<w:color [^>]*\/>/, own)}</w:rPr>`;
          const at = inner.search(/<w:sz[ />]/);
          return `<w:rPr>${at < 0 ? inner + own : inner.slice(0, at) + own + inner.slice(at)}</w:rPr>`;
        });
      abs = { id, xml };
      this.abstracts.set(signature, abs);
    }
    const id = this.nums.length + 1;
    this.nums.push(num.replace(/w:numId="\d+"/, `w:numId="${id}"`).replace(/<w:abstractNumId w:val="\d+"\/>/, `<w:abstractNumId w:val="${abs.id}"/>`));
    return id;
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
    const ea = p.font === BOX_FONT ? BOX_FONT_EA : f;
    x += `<w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:eastAsia="${ea}" w:cs="${f}"/>`;
  }
  // Explicit on and off: the number does not take the bold or italic of
  // the item's first word.
  x += p.b ? '<w:b/><w:bCs/>' : '<w:b w:val="0"/><w:bCs w:val="0"/>';
  x += p.i ? '<w:i/><w:iCs/>' : '<w:i w:val="0"/><w:iCs w:val="0"/>';
  if (p.color) x += `<w:color w:val="${p.color}"/>`;
  if (p.sz) x += `<w:sz w:val="${p.sz}"/><w:szCs w:val="${p.sz}"/>`;
  return `<w:rPr>${x}</w:rPr>`;
}
