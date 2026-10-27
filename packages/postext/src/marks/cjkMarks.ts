/**
 * The Chinese and Japanese interlinear marks of a laid-out document (#193,
 * #421): emphasis dots (着重号, 傍点), the proper-name line (专名号), the
 * wavy book-title line (书名号甲式) and side lines (傍線), as
 * `VDTLine.marks` — primitives the renderers draw as they are — and the
 * leading checks of marks, ruby (#194) and kanbun marks (#430).
 *
 * The measurer flags the segments (`VDTLineSegment.cjkMarks`); the marks are
 * placed once the document is laid out, where the renderers paint each
 * segment ({@link segmentPositions}: alignment and the justified word
 * spaces of a line included), in the flow frame of the line. Dots are
 * centred on each character, spacing after it left out, and skip
 * punctuation and spaces; a line spans its run's characters, and where two
 * runs meet each end gives up an eighth of an em (clreq §5.6.1). A side
 * line runs on across every character of its run, punctuation and spaces
 * included. Marks sit against the characters' em box, centred on the
 * font's central axis, on the side they were given (`over`: above
 * horizontal text, right of vertical text): when dots and a line mark the
 * same text on one side, the line is nearer the text, and dots on the side
 * of a ruby reading go outside it (as CSS Text Decoration 3 sets them).
 */

import type { VDTDocument, ContentWarning, VDTBlock, VDTLine } from '../vdt.js';
import type { ResolvedCjkConfig } from '../types.js';
import { CENTRAL } from '../measure/cjk/cjkAnnotate.js';
import { fontEm } from '../measure/vertical.js';
import { lineMarks } from './cjkMarks/lineMarks.js';
import { type LineReach, lineReach, marksNeed, rubyNeed, kuntenNeed } from './cjkMarks/reach.js';
import { type TextGroup, resourceBlocksOf, resourceTextGroups } from './cjkMarks/resources.js';

export { segmentPositions, segmentFont } from './cjkMarks/geometry.js';
export { lineMarks } from './cjkMarks/lineMarks.js';

/**
 * Set `VDTLine.marks` on every line of the document that holds Chinese
 * marks, and report the paragraphs whose line gap is narrower than their
 * marks, readings or kanbun marks need (`cjkMarksExceedLeading`,
 * `rubyExceedsLeading`, `kuntenExceedsLeading`), once per paragraph. `cjk`
 * is the resolved configuration (its `annotationColor`).
 *
 * The gap between two lines of a column is shared: what the upper line
 * sets under it and the lower one over it (dots under one line and the
 * readings over the next, in one paragraph or across two) must fit in it
 * together. Where they do not, the lower line's paragraph is reported
 * (`rubyExceedsLeading` when readings take part, `kuntenExceedsLeading`
 * when kanbun marks do, else `cjkMarksExceedLeading`).
 *
 * The cells, captions and notes of resource blocks (#429) are texts of
 * their own: their marks are set and their leading checked the same way,
 * each text's lines sharing their gaps only with one another (a table's
 * cells sit apart, a caption under its figure). A resource's text is set
 * horizontally on every page, a vertical one turning the whole block.
 */
export function annotateDocument(doc: VDTDocument, cjk: ResolvedCjkConfig | undefined): ContentWarning[] {
  const warnings: ContentWarning[] = [];
  const color = cjk?.annotationColor?.hex;
  const reported = new Set<string>();
  const atOf = (block: VDTBlock) => ({
    ...(block.sourceStart !== undefined ? { sourceStart: block.sourceStart } : block.lines[0]?.sourceStart !== undefined ? { sourceStart: block.lines[0].sourceStart } : {}),
    ...(block.sourceEnd !== undefined ? { sourceEnd: block.sourceEnd } : {}),
    ...(block.pageIndex >= 0 ? { pageIndex: block.pageIndex } : {}),
  });
  const groups: TextGroup[] = [];
  for (const block of doc.blocks) {
    if (block.type === 'resource' || block.designOverlay) continue;
    groups.push({
      lines: block.lines,
      like: block,
      pageIndex: block.pageIndex,
      columnKey: `${block.pageIndex}:${block.columnIndex}`,
      where: `${block.sourceStart ?? block.lines[0]?.sourceStart ?? block.id}`,
      at: atOf(block),
    });
  }
  for (const block of resourceBlocksOf(doc)) groups.push(...resourceTextGroups(block, atOf(block)));

  /** The lines of each column's annotated paragraphs (of each resource
   *  text), in order, with their reach. */
  const columns = new Map<string, { line: VDTLine; group: TextGroup; em: number; reach: LineReach }[]>();
  for (const group of groups) {
    let marked = false;
    let ruby = false;
    let kunten = false;
    for (const line of group.lines) {
      const segs = line.segments;
      if (!segs) continue;
      if (segs.some((s) => s.cjkMarks)) {
        marked = true;
        const flow = group.columnKey !== undefined && group.pageIndex >= 0 ? doc.pages[group.pageIndex]?.flow : undefined;
        const vertical = flow?.writingMode === 'vertical-rl' ? { region: cjk?.region ?? 'mainland', uprightDigits: cjk?.uprightDigits ?? 2 } : undefined;
        const marks = lineMarks(line, group.like, color, vertical);
        if (marks.length > 0) line.marks = marks;
      }
      // Only the CJK composer sets ruby (#194). A footnote marker in the
      // line gap is checked as a reading is, in any line.
      if (line.cjkComposed && segs.some((s) => s.ruby && s.ruby.position !== 'right')) ruby = true;
      if (segs.some((s) => s.sideMarker)) ruby = true;
      if (line.cjkComposed && segs.some((s) => s.kunten)) kunten = true;
    }
    if (!marked && !ruby && !kunten) continue;
    const em = fontEm(group.like.fontString);
    const first = group.lines[0];
    if (!first || em <= 0) continue;
    if (group.pageIndex >= 0) {
      // Lines of plain paragraphs between two annotated ones are left
      // out: the gap is then measured across them, and is wide.
      const key = group.columnKey ?? group.where;
      let column = columns.get(key);
      if (!column) columns.set(key, (column = []));
      for (const line of group.lines) column.push({ line, group, em, reach: lineReach(line, em) });
    }
    const gapEm = (first.bbox.height - em) / em;
    const { at, where } = group;
    if (marked) {
      const need = Math.max(...group.lines.map(marksNeed));
      if (need > 0 && gapEm < need - 1e-6 && !reported.has(`m${where}`)) {
        reported.add(`m${where}`);
        warnings.push({ kind: 'cjkMarksExceedLeading', text: first.text, gapEm: round(gapEm), neededEm: need, ...at });
      }
    }
    if (ruby) {
      const need = Math.max(...group.lines.map((l) => rubyNeed(l, em)));
      if (need > 0 && gapEm < need - 1e-6 && !reported.has(`r${where}`)) {
        reported.add(`r${where}`);
        warnings.push({ kind: 'rubyExceedsLeading', text: first.text, gapEm: round(gapEm), neededEm: round(need), ...at });
      }
    }
    if (kunten) {
      const need = Math.max(...group.lines.map((l) => kuntenNeed(l, em)));
      if (need > 0 && gapEm < need - 1e-6 && !reported.has(`k${where}`)) {
        reported.add(`k${where}`);
        warnings.push({ kind: 'kuntenExceedsLeading', text: first.text, gapEm: round(gapEm), neededEm: round(need), ...at });
      }
    }
  }
  // The gaps two lines of a column share.
  for (const column of columns.values()) {
    for (let i = 1; i < column.length; i++) {
      const a = column[i - 1]!;
      const b = column[i]!;
      const need = a.reach.foot + b.reach.head;
      if (need <= 0) continue;
      const gap = (b.line.baseline - (CENTRAL + 0.5) * b.em) - (a.line.baseline + (0.5 - CENTRAL) * a.em);
      if (need <= gap + 1e-6) continue;
      const ruby = a.reach.footRuby || b.reach.headRuby;
      const kanbun = !ruby && (a.reach.footKunten === true || b.reach.headKunten === true);
      const key = `${ruby ? 'r' : kanbun ? 'k' : 'm'}${b.group.where}`;
      if (reported.has(key)) continue;
      reported.add(key);
      warnings.push({
        kind: ruby ? 'rubyExceedsLeading' : kanbun ? 'kuntenExceedsLeading' : 'cjkMarksExceedLeading',
        text: b.line.text,
        gapEm: round(gap / b.em),
        neededEm: round(need / b.em),
        ...b.group.at,
      });
    }
  }
  return warnings;
}

const round = (v: number): number => Math.round(v * 1000) / 1000;
