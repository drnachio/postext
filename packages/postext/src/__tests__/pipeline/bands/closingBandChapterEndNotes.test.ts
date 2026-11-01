import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { columnClipRect } from '../../../paint/columnClip.js';
import type { PostextConfig, VDTDocument, VDTPage } from '../../../index.js';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const mm = (value: number) => ({ value, unit: 'mm' as const });
const SENT = 'The lantern of the lighthouse must stay lit all night to guide the ships that cross the bay. ';
const filler = (n: number): string => SENT.repeat(n).trim();

const config = (align: 'foot' | 'text'): PostextConfig => ({
  page: { width: mm(160), height: mm(120), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
  links: { print: 'notes' },
  footnotes: { placement: 'chapterEnd', chapterEndAlign: align },
});

/** A chapter whose closing page holds some text and a keep-together box of
 *  two links, the links' notes set after the chapter, the next chapter
 *  opening on a page of its own. */
const md = (before: number): string => [
  '# One', '', filler(52), '', filler(before), '',
  ':::callout', '- [Alpha](https://example.org/a)', '- [Beta](https://example.org/b)', ':::', '',
  '# Two {span=page}', '', filler(3),
].join('\n');

const build = (before: number, align: 'foot' | 'text'): VDTDocument =>
  buildDocument({ markdown: md(before) }, config(align), createMeasurementCache());

const closingPage = (doc: VDTDocument): VDTPage =>
  doc.pages.find((p) => p.columns.some((c) => c.blocks.some((b) => b.footnoteNote !== undefined)))!;

const textFoot = (page: VDTPage, col: number): number => {
  const blocks = page.columns[col]!.blocks.filter((b) => b.footnoteNote === undefined && !b.hidden);
  const last = blocks[blocks.length - 1];
  return last ? last.bbox.y + last.bbox.height : -1;
};

describe('a closing band with chapter-end notes at the column foot (#1363)', () => {
  it('is cut level as with the notes under the text, the notes at the foot', () => {
    for (const before of [12, 14, 16]) {
      const footDoc = build(before, 'foot');
      const foot = closingPage(footDoc);
      const text = closingPage(build(before, 'text'));
      // The text and the box split across both columns, as they do with the
      // notes set under the text: the second column is not left empty.
      expect(foot.columns[1]!.blocks.some((b) => b.type === 'callout'), `before=${before}`).toBe(true);
      expect(textFoot(foot, 0), `before=${before}`).toBe(textFoot(text, 0));
      expect(textFoot(foot, 1), `before=${before}`).toBe(textFoot(text, 1));
      // The notes stand at the true foot of the column, and the column's
      // box (what the renderers clip it to) still holds them.
      const col = foot.columns.find((c) => c.blocks.some((b) => b.footnoteNote !== undefined))!;
      const note = col.blocks[col.blocks.length - 1]!;
      const line = note.lines[note.lines.length - 1]!;
      const pageFoot = foot.contentArea.y + foot.contentArea.height;
      expect(Math.abs(line.bbox.y + line.bbox.height - pageFoot)).toBeLessThan(footDoc.baselineGrid);
      const clip = columnClipRect(col, 300);
      for (const b of col.blocks) {
        for (const l of b.lines) expect(l.bbox.y + l.bbox.height).toBeLessThanOrEqual(clip.y + clip.height + 0.5);
      }
    }
  }, 60_000);
});
