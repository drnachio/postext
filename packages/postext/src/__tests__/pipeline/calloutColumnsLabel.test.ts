import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { PostextConfig, Resource, VDTDocument, VDTBlock, VDTDesignTextBlock } from '../../index';

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

const PAGE: PostextConfig = {
  page: { width: pt(500), height: pt(700), margins: { top: pt(20), bottom: pt(20), left: pt(30), right: pt(20), mirror: true } },
  layout: { layoutType: 'single' },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
};

const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the column so the flow advances steadily.`;
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, i) => para(from + i)).join('\n\n');
const build = (markdown: string, config: PostextConfig, resources: Resource[] = []): VDTDocument =>
  buildDocument({ markdown, resources }, config);
const frameOf = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'callout')!;
const childrenOf = (doc: VDTDocument, frame: VDTBlock): VDTBlock[] =>
  frame.callout!.childIds.map((id) => doc.blocks.find((b) => b.id === id)!);

describe(':::columns groups inside a callout', () => {
  const config: PostextConfig = { ...PAGE, calloutStyles: [{ id: 'box', name: 'Box', columnGap: pt(10) }] };

  it('lays the group out in two columns of equal width, cut where the columns level best', () => {
    const md = `:::callout{type="box"}\n:::columns{count=2}\n${filler(6)}\n:::\n:::`;
    const doc = build(md, config);
    const frame = frameOf(doc);
    const kids = childrenOf(doc, frame);
    expect(kids.length).toBeGreaterThanOrEqual(6);
    const xs = [...new Set(kids.map((b) => Math.round(b.bbox.x)))].sort((a, b) => a - b);
    expect(xs.length).toBe(2);
    const colW = kids[0]!.bbox.width;
    expect(xs[1]! - xs[0]!).toBeCloseTo(colW + 10 * (doc.config.page.dpi / 72), 0);
    const left = kids.filter((b) => Math.round(b.bbox.x) === xs[0]);
    const right = kids.filter((b) => Math.round(b.bbox.x) === xs[1]);
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
    // Both columns start at the group's top; the frame is as tall as the taller one.
    expect(Math.min(...right.map((b) => b.bbox.y))).toBeCloseTo(Math.min(...left.map((b) => b.bbox.y)), 3);
    const bottom = Math.max(...kids.map((b) => b.bbox.y + b.bbox.height));
    expect(frame.bbox.y + frame.bbox.height).toBeGreaterThanOrEqual(bottom - 1e-6);
    const leftH = Math.max(...left.map((b) => b.bbox.y + b.bbox.height)) - Math.min(...left.map((b) => b.bbox.y));
    const rightH = Math.max(...right.map((b) => b.bbox.y + b.bbox.height)) - Math.min(...right.map((b) => b.bbox.y));
    // Levelled to within a paragraph.
    expect(Math.abs(leftH - rightH)).toBeLessThan(kids[0]!.bbox.height + 1);
  });

  it('`breaks` fixes the column starts at whole blocks instead of balancing', () => {
    const md = `:::callout{type="box"}\n:::columns{count=2 breaks="5"}\n${filler(6)}\n:::\n:::`;
    const doc = build(md, config);
    const frame = frameOf(doc);
    const kids = childrenOf(doc, frame);
    expect(kids.length).toBe(6);
    const xs = [...new Set(kids.map((b) => Math.round(b.bbox.x)))].sort((a, b) => a - b);
    expect(xs.length).toBe(2);
    const left = kids.filter((b) => Math.round(b.bbox.x) === xs[0]);
    const right = kids.filter((b) => Math.round(b.bbox.x) === xs[1]);
    expect(left.length).toBe(4);
    expect(right.length).toBe(2);
    expect(Math.min(...right.map((b) => b.bbox.y))).toBeCloseTo(Math.min(...left.map((b) => b.bbox.y)), 3);
  });

  it('a cut inside a paragraph leaves its head in one column and its tail (bullet-less) in the next', () => {
    const long = Array.from({ length: 12 }, () => para(1)).join(' ');
    const md = `:::callout{type="box"}\n:::columns{count=2}\n- ${long}\n:::\n:::`;
    const doc = build(md, config);
    const kids = childrenOf(doc, frameOf(doc));
    expect(kids.length).toBe(2);
    expect(kids[0]!.bulletText).toBeDefined();
    expect(kids[1]!.bulletText).toBeUndefined();
    expect(kids[1]!.bbox.x).toBeGreaterThan(kids[0]!.bbox.x);
    expect(kids[0]!.lines.length + kids[1]!.lines.length).toBeGreaterThan(2);
  });

  it('children after the group return to the full width below it', () => {
    const md = `:::callout{type="box"}\n:::columns{count=2}\n${filler(4)}\n:::\n\nAfter the group.\n:::`;
    const doc = build(md, config);
    const kids = childrenOf(doc, frameOf(doc));
    const last = kids[kids.length - 1]!;
    expect(last.lines[0]!.text).toContain('After');
    expect(last.bbox.width).toBeGreaterThan(kids[0]!.bbox.width * 1.5);
    expect(last.bbox.y).toBeGreaterThanOrEqual(Math.max(...kids.slice(0, -1).map((b) => b.bbox.y + b.bbox.height)) - 1e-6);
  });
});

describe('callout label tab, title tracking and corner icon side', () => {
  const styles: PostextConfig['calloutStyles'] = [{
    id: 'num', name: 'Numbered', title: 'Title',
    label: { fontSize: pt(8), height: pt(12), paddingX: pt(6), offset: pt(6), position: 'top-right', rule: { enabled: true } },
    titleStyle: { letterSpacing: pt(1), indent: pt(20) },
    icon: { kind: 'glyph', glyph: 'X', position: 'corner', cornerSide: 'outer' },
  }];
  const config: PostextConfig = { ...PAGE, calloutStyles: styles };

  it('prints the fence label on a tab at the top-right corner, rising above the box, with a rule to it', () => {
    const doc = build(`:::callout{type="num" label="BOX 1-1"}\n${para(1)}\n:::`, config);
    const frame = frameOf(doc);
    const blocks = frame.designOverlay!.blocks;
    const tab = blocks.find((b) => b.kind === 'text' && b.lines[0]?.text === 'BOX 1-1') as VDTDesignTextBlock;
    expect(tab).toBeDefined();
    // The tab opens the block; the box starts under it (the rise is part of the block).
    expect(tab.bbox.y).toBeCloseTo(frame.bbox.y, 3);
    const box = blocks.find((b) => b.kind === 'box' && b.bbox.width > tab.bbox.width * 2);
    expect(box).toBeDefined();
    expect(box!.bbox.y).toBeGreaterThan(tab.bbox.y + 1);
    expect(tab.bbox.x + tab.bbox.width).toBeCloseTo(frame.bbox.x + frame.bbox.width, 3);
    const rule = blocks.find((b) => b.kind === 'rule');
    expect(rule).toBeDefined();
    expect(rule!.bbox.x + rule!.bbox.width).toBeLessThanOrEqual(tab.bbox.x + 1e-6);
  });

  it('tracks the title and indents it; the outer corner icon hangs left on a mirrored verso', () => {
    const doc = build(`${filler(60)}\n\n:::callout{type="num"}\n${para(1)}\n:::`, config);
    const frame = frameOf(doc);
    const blocks = frame.designOverlay!.blocks;
    const title = blocks.find((b) => b.kind === 'text' && b.lines[0]?.text === 'Title') as VDTDesignTextBlock;
    expect(title.letterSpacingPx).toBeGreaterThan(0);
    expect(title.bbox.x).toBeGreaterThan(frame.bbox.x + 20 * (doc.config.page.dpi / 72) - 1e-6);
    const icon = blocks.find((b) => b.kind === 'text' && b.lines[0]?.text === 'X')!;
    const page = doc.pages[frame.pageIndex!]!;
    const verso = (page.index + 1) % 2 === 0;
    if (verso) expect(icon.bbox.x).toBeLessThan(frame.bbox.x);
    else expect(icon.bbox.x + icon.bbox.width).toBeGreaterThan(frame.bbox.x + frame.bbox.width);
  });

  it('a corner icon on the left pushes the title past it; on the right the title starts at the inner edge', () => {
    const side = (cornerSide: 'left' | 'right'): PostextConfig => ({
      ...PAGE,
      calloutStyles: [{
        id: 'c', name: 'C', title: 'Title', padding: { left: pt(4) },
        icon: { kind: 'glyph', glyph: 'X', position: 'corner', cornerSide, size: pt(20) },
        titleStyle: { indent: pt(0), gap: pt(6) },
      }],
    });
    const md = `:::callout{type="c"}\n${para(1)}\n:::`;
    const titleOf = (doc: VDTDocument) => {
      const frame = frameOf(doc);
      const title = frame.designOverlay!.blocks.find((b) => b.kind === 'text' && b.lines[0]?.text === 'Title') as VDTDesignTextBlock;
      return { frame, title };
    };
    const k = 300 / 72;
    const r = titleOf(build(md, side('right')));
    expect(r.title.bbox.x).toBeCloseTo(r.frame.bbox.x + 4 * k, 3);
    const l = titleOf(build(md, side('left')));
    // Half the icon (10 pt) plus the 6 pt gap from the box edge.
    expect(l.title.bbox.x).toBeCloseTo(l.frame.bbox.x + 16 * k, 3);
  });
});

describe('float width fraction and side captions', () => {
  const figure = (id: string, placement: Resource['placement']): Resource => ({
    id, typeId: 'figure', kind: 'bitmap', caption: `Figure ${id} with a caption long enough to wrap onto lines.`, createdAt: 0, updatedAt: 0,
    bitmap: { fileId: `${id}.png`, format: 'png', width: 400, height: 200 }, placement,
  });

  it('a narrower float sits in its column per align', () => {
    const doc = build(`Cites :ref{id="f"} here.\n\n${filler(8)}`, PAGE, [figure('f', { span: 'column', width: 0.5, align: 'center' })]);
    const fl = doc.pages.flatMap((p) => p.floats ?? [])[0]!;
    const col = doc.pages[fl.pageIndex!]!.columns[fl.columnIndex!]!;
    expect(fl.bbox.width).toBeCloseTo(col.bbox.width / 2, 3);
    expect(fl.bbox.x).toBeCloseTo(col.bbox.x + col.bbox.width / 4, 3);
  });

  it('captionSide sets the caption in the side column of a floats layout, level with the figure', () => {
    const config: PostextConfig = {
      ...PAGE,
      layout: { layoutType: 'oneAndHalf', gutterWidth: pt(10), sideColumnPercent: 30, sideColumnRole: 'floats', sideColumnSide: 'outer' },
    };
    const doc = build(`Cites :ref{id="f"} here.\n\n${filler(8)}`, config, [figure('f', { span: 'column', captionSide: true })]);
    const fl = doc.pages.flatMap((p) => p.floats ?? [])[0]!;
    const page = doc.pages[fl.pageIndex!]!;
    const side = page.columns.find((c) => c.kind === 'side')!;
    const rb = fl.resourceBlock!;
    // The block is the body's height alone; the caption lines sit in the side column.
    expect(fl.bbox.height).toBeCloseTo(rb.bodyRect.height, 3);
    const cap = rb.captionLines[0]!;
    expect(cap.bbox.x).toBeGreaterThanOrEqual(side.bbox.x - 1e-6);
    expect(cap.bbox.x + cap.bbox.width).toBeLessThanOrEqual(side.bbox.x + side.bbox.width + 1e-6);
    expect(cap.bbox.y).toBeGreaterThanOrEqual(fl.bbox.y - 1e-6);
    // The side column gave up the caption's band: either consumed from its
    // head (a top float) or cut off its foot (a bottom float).
    const capBottom = Math.max(...rb.captionLines.map((l) => l.bbox.y + l.bbox.height));
    const used = side.bbox.y + (side.bbox.height - side.availableHeight);
    const foot = side.bbox.y + side.bbox.height;
    expect(used >= capBottom - 1e-6 || foot <= cap.bbox.y + 1e-6).toBe(true);
  });
});
