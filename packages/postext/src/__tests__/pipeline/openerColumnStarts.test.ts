import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { columnClipRect } from '../../columnClip';
import type { PostextConfig } from '../../types';
import type { VDTBlock, VDTDocument } from '../../vdt';

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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const mm = (value: number) => ({ value, unit: 'mm' as const });

const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the column so the flow advances steadily down the page.`;
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, i) => para(from + i)).join('\n\n');

const LEAD = 14;

/** 210 × 280 mm at 72 dpi (1 pt = 1 px), two columns, a 14 pt body line;
 *  an H1 opener across the page whose design reserves `minHeight`. */
function config(minHeight: number, h2: { marginTop?: number; marginBottom?: number } = {}): PostextConfig {
  return {
    page: { sizePreset: 'custom', width: mm(210), height: mm(280), dpi: 72, margins: { top: mm(24), bottom: mm(20), left: mm(20), right: mm(20) } },
    layout: { layoutType: 'double', gutterWidth: mm(8) },
    bodyText: { lineHeight: pt(LEAD) },
    headings: {
      balancing: { enabled: false },
      levels: [
        {
          level: 1, span: 'page', breakBefore: { enabled: false, parity: 'any' }, marginBottom: pt(9),
          advancedDesign: { enabled: true, minHeight: pt(minHeight), slot: { elements: [{ kind: 'text', id: 't', content: '{titleText}', fontSize: pt(12), overflow: 'wrap', placement: { anchor: { to: 'container', edge: 'top-left' } } }] } },
        },
        { level: 2, lineHeight: pt(2 * LEAD), marginTop: pt(h2.marginTop ?? 0), marginBottom: pt(h2.marginBottom ?? 0) },
      ],
    },
  };
}

const page0 = (doc: VDTDocument) => doc.pages[0]!;
const col = (doc: VDTDocument, i: number) => page0(doc).columns[i]!;
const firstAfterOpener = (doc: VDTDocument): VDTBlock => col(doc, 0).blocks[1]!;
/** Distance of `y` from the nearest grid line of the page, in px. */
const offGrid = (doc: VDTDocument, y: number): number => {
  const r = ((y - page0(doc).contentArea.y) % LEAD + LEAD) % LEAD;
  return Math.min(r, LEAD - r);
};

/** The document with `## B` under the opener and as many paragraphs as it
 *  takes for the second column to open on `open` ('text': a paragraph
 *  running on; 'heading': `## C`). */
function layout(minHeight: number, open: 'text' | 'heading', h2 = {}): VDTDocument {
  for (let n = 4; n < 40; n++) {
    const doc = buildDocument({ markdown: `# A\n\n## B\n\n${filler(n)}\n\n## C\n\n${filler(6, 50)}` }, config(minHeight, h2));
    const first = col(doc, 1).blocks[0];
    if (!first) continue;
    if (open === 'heading' ? first.type === 'heading' : first.type === 'paragraph') return doc;
  }
  throw new Error('no layout opens the second column that way');
}

describe('the columns under a page-span opener start alike (EF-139)', () => {
  it('starts the text of the second column on the page grid when the band ends between lines', () => {
    // 10.12 lines of opener: its foot is off the grid.
    const doc = layout(141.73, 'text');
    const foot = col(doc, 0).blocks[0]!.bbox.y + col(doc, 0).blocks[0]!.bbox.height;
    expect(offGrid(doc, foot)).toBeGreaterThan(1);
    const second = col(doc, 1);
    // Line boxes are in page coordinates.
    for (const b of second.blocks) {
      for (const l of b.lines) expect(offGrid(doc, l.bbox.y)).toBeLessThan(0.01);
    }
    // Where a paragraph right under the opener would start: the band's foot
    // plus the opener's 9 pt, taken to the next grid line.
    expect(second.blocks[0]!.bbox.y).toBeCloseTo(page0(doc).contentArea.y + 11 * LEAD, 6);
  });

  it('starts the second column’s text a margin under a band that ends on the grid when a heading follows the opener', () => {
    // A band of exactly 10 lines, then `## B`: the opener does not snap, so
    // its 9 pt margin is left under it. Text right under the same opener
    // (no `## B`) starts on the 11th line; so does the text that opens the
    // second column. Up to 1.4 that text sat on the 10th line, touching the
    // band, above the section heading of the first column.
    const doc = layout(140, 'text');
    const opener = col(doc, 0).blocks[0]!;
    expect(opener.bbox.y + opener.bbox.height).toBeCloseTo(page0(doc).contentArea.y + 10 * LEAD, 6);
    const c = col(doc, 1).blocks[0]!;
    expect(c.type).toBe('paragraph');
    expect(c.bbox.y).toBeCloseTo(page0(doc).contentArea.y + 11 * LEAD, 6);
    const plain = buildDocument({ markdown: `# A\n\n${filler(30)}` }, config(140));
    expect(firstAfterOpener(plain).type).toBe('paragraph');
    expect(c.bbox.y).toBeCloseTo(firstAfterOpener(plain).bbox.y, 6);
  });

  it('does not line a heading up with a hidden heading under the opener', () => {
    // `## Ghost` is hidden: nothing prints there. The heading that opens the
    // second column is set level with the text the first column shows.
    const base = config(141.73, { marginTop: 6.4 });
    const cfg: PostextConfig = { ...base, headingStyles: [{ id: 'ghost', hidden: true }] };
    let doc: VDTDocument | undefined;
    for (let n = 4; n < 40 && !doc; n++) {
      const d = buildDocument({ markdown: `# A\n\n## Ghost {style="ghost"}\n\n${filler(n)}\n\n## C\n\n${filler(6, 50)}` }, cfg);
      if (col(d, 1).blocks[0]?.type === 'heading') doc = d;
    }
    expect(doc).toBeDefined();
    const blocks = col(doc!, 0).blocks;
    expect(blocks[1]!.hidden).toBe(true);
    const text = blocks.slice(1).find((b) => !b.hidden)!;
    expect(text.type).toBe('paragraph');
    const c = col(doc!, 1).blocks[0]!;
    expect(c.bbox.y).toBeCloseTo(text.bbox.y, 6);
    expect(c.bbox.y).toBeGreaterThanOrEqual(col(doc!, 1).bbox.y - 0.01);
  });

  it('sets a heading at the head of the second column level with the one under the opener, its foot on the grid', () => {
    const doc = layout(141.73, 'heading', { marginTop: 6.4 });
    const b = firstAfterOpener(doc);
    const c = col(doc, 1).blocks[0]!;
    expect(b.type).toBe('heading');
    expect(c.type).toBe('heading');
    expect(c.bbox.y).toBeCloseTo(b.bbox.y, 6);
    // Both snap their feet to the same grid line.
    expect(c.bbox.y + c.bbox.height).toBeCloseTo(b.bbox.y + b.bbox.height, 6);
    expect(offGrid(doc, c.bbox.y + c.bbox.height)).toBeLessThan(0.01);
    // The column itself starts on the grid, under the band; the heading
    // rises above its top, and the renderers' clip takes it in.
    const second = col(doc, 1);
    expect(offGrid(doc, second.bbox.y)).toBeLessThan(0.01);
    expect(c.bbox.y).toBeLessThan(second.bbox.y);
    expect(columnClipRect(second, 72).y).toBeLessThanOrEqual(c.bbox.y);
  });

  it('keeps level headings level when the band ends on a grid line', () => {
    // A band of exactly 10 lines.
    const doc = layout(140, 'heading', { marginTop: 6.4 });
    const b = firstAfterOpener(doc);
    const c = col(doc, 1).blocks[0]!;
    expect(c.bbox.y).toBeCloseTo(b.bbox.y, 6);
  });

  it('keeps the second column’s lines level with the first’s when the opener does not snap', () => {
    // No snap: the text under the opener starts at its foot plus 9 pt, off
    // the grid; the second column's text keeps the same baselines.
    const base = config(141.73);
    const levels = base.headings!.levels!;
    const noSnap: PostextConfig = { ...base, headings: { ...base.headings, levels: [{ ...levels[0]!, snapToGrid: false }, levels[1]!] } };
    const doc = buildDocument({ markdown: `# A\n\n${filler(30)}` }, noSnap);
    const first = firstAfterOpener(doc);
    const second = col(doc, 1);
    const c = second.blocks[0]!;
    expect(first.type).toBe('paragraph');
    expect(c.type).toBe('paragraph');
    expect(c.bbox.y).toBeCloseTo(first.bbox.y, 6);
    for (const l of c.lines) expect(((l.bbox.y - first.lines[0]!.bbox.y) % LEAD + LEAD) % LEAD).toBeCloseTo(0, 6);
    expect(columnClipRect(second, 72).y).toBeLessThanOrEqual(c.bbox.y);
  });

  it('keeps the second column on the grid when the first opens with a styled paragraph of its own margin', () => {
    // A lead in its own style, with a top margin, under a snapped opener:
    // the second column's text stays on the grid line at the band's foot.
    const base = config(140);
    const styled: PostextConfig = {
      ...base,
      paragraphStyles: [{ id: 'lead', fontSize: pt(13), lineHeight: pt(2 * LEAD), marginTop: pt(9) }],
    };
    const doc = buildDocument({ markdown: `# A\n\n:::paragraphs{style="lead"}\nA lead set apart.\n:::\n\n${filler(30)}` }, styled);
    const opener = col(doc, 0).blocks[0]!;
    const foot = opener.bbox.y + opener.bbox.height;
    expect(firstAfterOpener(doc).bbox.y).toBeGreaterThan(foot + 1);
    const c = col(doc, 1).blocks[0]!;
    expect(c.type).toBe('paragraph');
    expect(c.bbox.y).toBeCloseTo(foot, 6);
    expect(offGrid(doc, c.bbox.y)).toBeLessThan(0.01);
  });

  it('leaves a snapped opener’s columns as they were', () => {
    // The opener followed by text snaps its foot to the grid; the second
    // column starts right there, a heading at its head included.
    const markdown = (n: number) => `# A\n\n${filler(n)}\n\n## C\n\n${filler(6, 50)}`;
    let doc: VDTDocument | undefined;
    for (let n = 4; n < 40 && !doc; n++) {
      const d = buildDocument({ markdown: markdown(n) }, config(141.73, { marginTop: 6.4 }));
      if (col(d, 1).blocks[0]?.type === 'heading') doc = d;
    }
    const opener = col(doc!, 0).blocks[0]!;
    const foot = opener.bbox.y + opener.bbox.height;
    expect(offGrid(doc!, foot)).toBeLessThan(0.01);
    expect(col(doc!, 1).bbox.y).toBeCloseTo(foot, 6);
    expect(col(doc!, 1).blocks[0]!.bbox.y).toBeCloseTo(foot, 6);
  });
});
