// numbering.xml of the semantic .docx (#1390): real Word lists (`w:numPr`)
// for the book's bulleted, numbered and task lists. Each run of list items
// gets its own `w:num` (so numbering restarts per list, at the source's
// first number); levels take their kind from the first item at that depth.

import type { ResolvedConfig } from '../../vdt.js';
import { escapeAttr } from '../xml.js';
import { firstFamily, hex, px, twips, type Units } from './wml.js';

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
  ) {}

  get empty(): boolean {
    return this.nums.length === 0;
  }

  /** A new list instance whose levels have these kinds (index = depth −
   *  1); `start` restarts the first level at the source's number. */
  list(kinds: readonly ListLevelKind[], start?: number): number {
    const signature = Array.from({ length: 9 }, (_, i) => kinds[i] ?? kinds[kinds.length - 1] ?? 'bullet').join(',');
    let abs = this.abstracts.get(signature);
    if (!abs) {
      const id = this.abstracts.size;
      abs = { id, xml: this.abstractXml(id, signature.split(',') as ListLevelKind[]) };
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

  private abstractXml(id: number, kinds: ListLevelKind[]): string {
    const r = this.resolved;
    const u = this.units;
    const bodyPx = px(u, r.bodyText.fontSize);
    const ul = r.unorderedLists;
    const ol = r.orderedLists;
    const step = Math.max(240, twips(u, ul.indent, bodyPx) + twips(u, ul.gap, bodyPx) + 120);
    let levels = '';
    kinds.forEach((kind, lvl) => {
      const hanging = Math.max(240, twips(u, kind === 'ordered' ? ol.gap : ul.gap, bodyPx) + 200);
      const left = step * lvl + Math.max(hanging, twips(u, ul.indent, bodyPx) + hanging);
      let fmt: string;
      let text: string;
      let font: string | undefined;
      let color: string | undefined;
      if (kind === 'ordered') {
        const level = ol.levels.find((l) => l.level === lvl + 1);
        fmt = NUM_FMT[level?.numberFormat ?? ol.numberFormat] ?? 'decimal';
        text = `${(level?.prefix ?? ol.prefix).replace(/%/g, '')}%${lvl + 1}${(level?.separator ?? ol.separator).replace(/%/g, '')}`;
        font = firstFamily(level?.fontFamily ?? ol.fontFamily);
        color = hex(level?.color ?? ol.color);
      } else {
        const level = ul.levels.find((l) => l.level === lvl + 1);
        fmt = 'bullet';
        text = kind === 'task' ? ul.taskCheckboxChar || '\u2610' : kind === 'checked' ? ul.taskCheckedChar || '\u2611' : level?.bulletChar || ul.bulletChar || '\u2022';
        font = firstFamily(level?.fontFamily ?? ul.fontFamily);
        color = hex(level?.color ?? ul.color);
      }
      const fontXml = font ? `<w:rFonts w:ascii="${escapeAttr(font)}" w:hAnsi="${escapeAttr(font)}" w:cs="${escapeAttr(font)}"/>` : '';
      const colorXml = color ? `<w:color w:val="${color}"/>` : '';
      levels +=
        `<w:lvl w:ilvl="${lvl}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${escapeAttr(text)}"/><w:lvlJc w:val="left"/>` +
        `<w:pPr><w:ind w:left="${left}" w:hanging="${hanging}"/></w:pPr>` +
        (fontXml || colorXml ? `<w:rPr>${fontXml}${colorXml}</w:rPr>` : '') +
        '</w:lvl>';
    });
    return `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${levels}</w:abstractNum>`;
  }

  /** Inner XML of `w:numbering`: abstract definitions, then instances. */
  xml(): string {
    return [...this.abstracts.values()].map((a) => a.xml).join('') + this.nums.join('');
  }
}
