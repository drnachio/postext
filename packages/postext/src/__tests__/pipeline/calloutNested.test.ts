import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { VDTBlock, VDTDesignBoxBlock, VDTDocument } from '../../vdt';
import type { CalloutStyleConfig, PostextConfig } from '../../types';

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

// Default 300 dpi: 1pt = 300/72 px.
const PT = 300 / 72;
const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });

const SENTENCE = 'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos. ';
const filler = (n: number): string => SENTENCE.repeat(n).trim();

const CARD: CalloutStyleConfig = {
  id: 'card',
  title: 'Ejercicio',
  background: { hex: '#e8f0f8', model: 'hex' as const },
  padding: { top: pt(8), right: pt(8), bottom: pt(8), left: pt(8) },
  icon: { kind: 'glyph', glyph: '★' },
};
const ANSWER: CalloutStyleConfig = {
  id: 'answer',
  background: { hex: '#ffffff', model: 'hex' as const },
  border: { enabled: true, color: { hex: '#333333', model: 'hex' as const }, width: pt(0.5) },
  borderRadius: pt(4),
  padding: { top: pt(10), right: pt(10), bottom: pt(10), left: pt(10) },
  marginTop: pt(6),
  marginBottom: pt(6),
};

const config = (styles: CalloutStyleConfig[], page: 'a5' | 'small' = 'a5'): PostextConfig => ({
  headings: { balancing: { enabled: false } },
  page: page === 'a5'
    ? { width: mm(148), height: mm(210), margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } }
    : { width: mm(120), height: mm(80), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
  calloutStyles: styles,
});

const build = (md: string, cfg: PostextConfig): VDTDocument =>
  buildDocument({ markdown: md }, cfg, createMeasurementCache());
const frames = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'callout');
const topFrames = (doc: VDTDocument): VDTBlock[] => frames(doc).filter((b) => !b.calloutPath);
const nestedFrames = (doc: VDTDocument): VDTBlock[] => frames(doc).filter((b) => !!b.calloutPath);
const boxOf = (frame: VDTBlock): VDTDesignBoxBlock =>
  frame.designOverlay!.blocks.find((b): b is VDTDesignBoxBlock => b.kind === 'box')!;
const inside = (inner: VDTBlock['bbox'], outer: VDTBlock['bbox']): boolean =>
  inner.x >= outer.x - 0.01 && inner.y >= outer.y - 0.01
  && inner.x + inner.width <= outer.x + outer.width + 0.01
  && inner.y + inner.height <= outer.y + outer.height + 0.01;
const textOf = (b: VDTBlock): string => b.lines.map((l) => l.text).join(' ');
const hasTitle = (frame: VDTBlock, title: string): boolean =>
  (frame.designOverlay?.blocks ?? []).some((b) => b.kind === 'text' && b.lines.some((l) => l.text.includes(title)));

const ISSUE_MD = [
  ':::callout{type="card"}',
  'Outer card: the statement of an exercise.',
  '',
  ':::callout{type="answer"}',
  'Inner white box with its own border, radius and 10pt padding.',
  ':::',
  '',
  ':::callout{type="answer"}',
  'Second inner box (an option row).',
  ':::',
  ':::',
  '',
  'After the card.',
].join('\n');

describe('nested callouts', () => {
  it('lays out each nested fence as a box of its own inside the parent', () => {
    const doc = build(ISSUE_MD, config([CARD, ANSWER]));
    const [outer] = topFrames(doc);
    const inner = nestedFrames(doc);
    expect(topFrames(doc)).toHaveLength(1);
    expect(inner).toHaveLength(2);
    const innerRect = outer!.callout!.innerRect;
    const content = {
      x: outer!.bbox.x + innerRect.x,
      y: outer!.bbox.y + innerRect.y,
      width: innerRect.width,
      height: innerRect.height,
    };
    for (const f of inner) {
      // Same unit as the parent for placement; the nesting on calloutPath.
      expect(f.containerId).toBe(outer!.containerId);
      expect(f.calloutPath).toHaveLength(1);
      expect(f.callout!.styleId).toBe('answer');
      // Parent's full inner width, inside its content rect.
      expect(f.bbox.width).toBeCloseTo(innerRect.width, 5);
      expect(inside(f.bbox, content)).toBe(true);
      // Its own decoration: white rounded box with a border.
      const box = boxOf(f);
      expect(box.box.backgroundColor).toBe('#ffffff');
      expect(box.box.borderRadiusPx).toBeCloseTo(4 * PT, 5);
      expect(box.box.borderWidthPx).toBeCloseTo(0.5 * PT, 5);
      expect(box.bbox.x).toBeCloseTo(f.bbox.x, 5);
      expect(box.bbox.y).toBeCloseTo(f.bbox.y, 5);
      // Its text sits at its own padding, not at the parent's inner x.
      const kids = doc.blocks.filter((b) => b.calloutPath?.[0] === f.calloutPath![0] && b.type !== 'callout');
      expect(kids).toHaveLength(1);
      expect(kids[0]!.bbox.x).toBeCloseTo(f.bbox.x + 10 * PT, 5);
      expect(kids[0]!.bbox.y).toBeCloseTo(f.bbox.y + 10 * PT, 5);
      expect(kids[0]!.containerId).toBe(outer!.containerId);
      expect(f.callout!.childIds).toEqual(kids.map((k) => k.id));
    }
    // Stacked in order, their margins collapsing (6pt apart).
    expect(inner[1]!.bbox.y - (inner[0]!.bbox.y + inner[0]!.bbox.height)).toBeCloseTo(6 * PT, 5);
    // The parent's childIds list its whole content, nested frames included.
    expect(outer!.callout!.childIds).toContain(inner[0]!.id);
    // Frame first, then its blocks, in the column (paint order).
    const col = doc.pages[0]!.columns[0]!;
    const at = (b: VDTBlock) => col.blocks.indexOf(b);
    expect(at(outer!)).toBeLessThan(at(inner[0]!));
    const firstInnerChild = col.blocks.find((b) => b.calloutPath && b.type !== 'callout')!;
    expect(at(inner[0]!)).toBeLessThan(at(firstInnerChild));
    // The content indices point at the fences, the source ranges cover them.
    expect(inner[0]!.contentIndex).toBeGreaterThan(outer!.contentIndex!);
    expect(inner[0]!.sourceStart).toBeGreaterThan(outer!.sourceStart!);
    expect(inner[0]!.sourceEnd).toBeLessThan(outer!.sourceEnd!);
    // The flow continues after the parent.
    const after = doc.blocks.find((b) => textOf(b).startsWith('After'))!;
    expect(after.bbox.y).toBeGreaterThanOrEqual(outer!.bbox.y + outer!.bbox.height);
  });

  it('ignores span and placement on a nested fence', () => {
    const md = ISSUE_MD.replace(':::callout{type="answer"}', ':::callout{type="answer" span="page" placement="top"}');
    const doc = build(md, config([CARD, ANSWER]));
    const [outer] = topFrames(doc);
    const [first] = nestedFrames(doc);
    expect(first!.callout).toMatchObject({ span: 'column', placement: 'here' });
    expect(inside(first!.bbox, outer!.bbox)).toBe(true);
    expect(doc.pages[0]!.floats ?? []).toHaveLength(0);
  });

  it('nests to any depth', () => {
    const md = [
      ':::callout{type="card"}', 'Level one.', '',
      ':::callout{type="answer"}', 'Level two.', '',
      ':::callout{type="answer"}', 'Level three.', ':::',
      ':::', ':::',
    ].join('\n');
    const doc = build(md, config([CARD, ANSWER]));
    const [l2, l3] = nestedFrames(doc);
    expect(l2!.calloutPath).toHaveLength(1);
    expect(l3!.calloutPath).toHaveLength(2);
    expect(l3!.calloutPath![0]).toBe(l2!.calloutPath![0]);
    expect(inside(l3!.bbox, l2!.bbox)).toBe(true);
    const three = doc.blocks.find((b) => textOf(b) === 'Level three.')!;
    expect(three.calloutPath).toEqual(l3!.calloutPath);
    expect(three.bbox.x).toBeCloseTo(l3!.bbox.x + 10 * PT, 5);
  });

  it('keeps nested boxes whole inside a :::columns group', () => {
    const md = [
      ':::callout{type="card"}', 'Pick one:', '',
      ':::columns{count=2}',
      ':::callout{type="answer"}', 'Option A.', ':::', '',
      ':::callout{type="answer"}', 'Option B.', ':::',
      ':::', ':::',
    ].join('\n');
    const doc = build(md, config([CARD, ANSWER]));
    const [a, b] = nestedFrames(doc);
    expect(a!.bbox.y).toBeCloseTo(b!.bbox.y, 5);
    expect(b!.bbox.x).toBeGreaterThan(a!.bbox.x + a!.bbox.width);
    const optB = doc.blocks.find((x) => textOf(x) === 'Option B.')!;
    expect(inside(optB.bbox, b!.bbox)).toBe(true);
  });

  const card = (n: number, splitCard: boolean, answer: string[]): string[] => [
    `:::callout{type="${splitCard ? 'cardSplit' : 'card'}"}`,
    'Statement of the exercise.',
    '',
    ...Array.from({ length: n }, (_, i) => [':::callout{type="answer"}', ...answer.map((a) => `${a} ${i + 1}`), ':::', ''].join('\n')),
    ':::',
  ];

  it('a tall parent splits between its nested boxes; every fragment redraws its frames', () => {
    const md = [filler(2), '', ...card(9, true, ['Answer box']), '', 'After.'].join('\n');
    const doc = build(md, config([{ ...CARD, id: 'cardSplit', keepTogether: false }, ANSWER], 'small'));
    const parts = topFrames(doc);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    parts.forEach((p, i) => {
      expect(p.callout!.part).toBe(i);
      expect(hasTitle(p, 'Ejercicio')).toBe(i === 0);
    });
    const inner = nestedFrames(doc);
    expect(inner).toHaveLength(9);
    // Every nested box lies whole inside the fragment of its page, and the
    // answers appear once, in order.
    for (const f of inner) {
      const parent = parts.find((p) => p.pageIndex === f.pageIndex)!;
      expect(inside(f.bbox, parent.bbox)).toBe(true);
      const page = doc.pages[f.pageIndex]!;
      expect(f.bbox.y + f.bbox.height).toBeLessThanOrEqual(page.contentArea.y + page.contentArea.height + 0.01);
    }
    const answers = doc.blocks.filter((b) => textOf(b).startsWith('Answer box')).map(textOf);
    expect(answers).toEqual(Array.from({ length: 9 }, (_, i) => `Answer box ${i + 1}`));
  }, 30_000);

  it('a keep-together parent moves whole instead', () => {
    const md = [filler(2), '', ...card(3, false, ['Answer box']), '', 'After.'].join('\n');
    const doc = build(md, config([CARD, ANSWER], 'small'));
    expect(topFrames(doc)).toHaveLength(1);
    expect(nestedFrames(doc)).toHaveLength(3);
  }, 30_000);

  it('a splittable nested box splits inside itself: both fragments redraw it, the continuation without its title', () => {
    const LONG: CalloutStyleConfig = { ...ANSWER, id: 'long', title: 'Respuesta', keepTogether: false };
    const items = Array.from({ length: 14 }, (_, i) => `- Line of the answer number ${i + 1}.`);
    const md = [
      filler(2), '',
      ':::callout{type="cardSplit"}', 'Statement.', '',
      ':::callout{type="long"}', ...items, ':::',
      '', 'Closing remark of the card.', ':::',
    ].join('\n');
    const doc = build(md, config([{ ...CARD, id: 'cardSplit', keepTogether: false }, ANSWER, LONG], 'small'));
    const parts = topFrames(doc);
    const inner = nestedFrames(doc);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(inner.length).toBe(parts.length);
    inner.forEach((f, i) => {
      const parent = parts[i]!;
      expect(f.pageIndex).toBe(parent.pageIndex);
      expect(inside(f.bbox, parent.bbox)).toBe(true);
      expect(hasTitle(f, 'Respuesta')).toBe(i === 0);
      // Same nested fence on every fragment.
      expect(f.calloutPath).toEqual(inner[0]!.calloutPath);
      expect(f.contentIndex).toBe(inner[0]!.contentIndex);
    });
    // Every item once, in order, each inside the nested frame of its page.
    const lis = doc.blocks.filter((b) => b.type === 'listItem');
    expect(lis.map(textOf)).toEqual(items.map((s) => s.slice(2)));
    for (const li of lis) {
      const f = inner.find((x) => x.pageIndex === li.pageIndex)!;
      expect(inside(li.bbox, f.bbox)).toBe(true);
    }
    // No fragment leaves a lone item on either side (splitMinLines 2).
    for (const f of inner) {
      expect(lis.filter((li) => li.pageIndex === f.pageIndex).length).toBeGreaterThanOrEqual(2);
    }
  }, 30_000);

  it('a keep-together nested box is never cut: it moves to the next fragment whole', () => {
    const TALLER: CalloutStyleConfig = { ...ANSWER, id: 'whole' };
    const items = Array.from({ length: 6 }, (_, i) => `- Item ${i + 1} of a kept box.`);
    let moved = 0;
    for (let n = 1; n <= 8; n++) {
      const md = [
        filler(n), '',
        ':::callout{type="cardSplit"}', filler(2), '',
        ':::callout{type="whole"}', ...items, ':::', '',
        'Closing remark of the card.', ':::',
      ].join('\n');
      const doc = build(md, config([{ ...CARD, id: 'cardSplit', keepTogether: false }, TALLER], 'small'));
      const inner = nestedFrames(doc);
      expect(inner).toHaveLength(1);
      const lis = doc.blocks.filter((b) => b.type === 'listItem');
      expect(new Set(lis.map((li) => li.pageIndex)).size).toBe(1);
      if (topFrames(doc).length > 1 && inner[0]!.pageIndex > topFrames(doc)[0]!.pageIndex) moved++;
    }
    expect(moved).toBeGreaterThan(0);
  }, 30_000);

  it('leaves boxes without nested fences unchanged (no calloutPath)', () => {
    const md = [':::callout{type="card"}', 'Plain box.', ':::'].join('\n');
    const doc = build(md, config([CARD, ANSWER]));
    expect(doc.blocks.some((b) => b.calloutPath !== undefined)).toBe(false);
  });
});
