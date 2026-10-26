/**
 * Headings keep their design inside boxes and composed-page frames (#906):
 * a heading whose level or heading style has an `advancedDesign` (a tab, a
 * band, `{titleText}` set in the design) is drawn by its design in a
 * callout or a frame as in a page column, the box keeping the room the
 * design takes, and the design follows the frame's scale and turn.
 */
import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { frameMatrix } from '../../../composed/paint.js';
import { sourceAt } from '../../../composed/sourceMap.js';
import { framesInFrame } from '../../../pipeline/pages/headerFooter.js';
import type { FrameConfig, PageTemplate } from '../../../composed/types.js';
import type { PostextConfig, VDTBlock, VDTDesignTextBlock, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';
import { page8Fixture } from '../fixtures/page8.js';

// Deterministic text measurement stub (no DOM in the node test env): seven
// px per character, whatever the face.
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
const pt = (value: number) => ({ value, unit: 'pt' as const });
const DPI = 300;
const px = (v: number): number => (v / 25.4) * DPI;

/** A heading style drawn as a white tab with the title in it, the tab
 *  reaching above and left of the heading, 14 mm reserved. */
const TAB = {
  id: 'pestana',
  name: 'Pestaña',
  advancedDesign: {
    enabled: true,
    minHeight: mm(14),
    slot: {
      elements: [
        { kind: 'box', id: 'tab', placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(-3), y: mm(-4) }, size: { width: mm(60), height: mm(12) } }, style: { backgroundColor: { hex: '#ffffff', model: 'hex' }, borderRadius: mm(3) } },
        { kind: 'text', id: 'title', content: '{titleText}', fontSize: pt(20), placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(2), y: mm(-3) }, size: { width: mm(55) } } },
      ],
    },
  },
};
/** The same design with an element anchored to the page: a mark 10 mm in
 *  from the trim's top-left corner. */
const PAGE_MARK = {
  ...TAB,
  id: 'marca',
  advancedDesign: {
    ...TAB.advancedDesign,
    slot: { elements: [...TAB.advancedDesign.slot.elements, { kind: 'box', id: 'mark', reserve: false, placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(10), y: mm(10) }, size: { width: mm(5), height: mm(5) } }, style: { backgroundColor: { hex: '#ff0000', model: 'hex' } } }] },
  },
};

const PAGE: PostextConfig = {
  page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }, { level: 2 }] } as never,
  headingStyles: [TAB as never, PAGE_MARK as never],
  calloutStyles: [{ id: 'caja', backgroundEnabled: true, background: { hex: '#d8ecf9' }, padding: { top: mm(8), right: mm(4), bottom: mm(4), left: mm(4) } } as never],
};

const build = (md: string, templates: PageTemplate[] = [], extra: PostextConfig = {}): VDTDocument =>
  buildDocument({ markdown: md }, { ...PAGE, ...extra, pageTemplates: templates }, createMeasurementCache());
const composedPage = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const frame = (doc: VDTDocument, name: string, page = composedPage(doc)): VDTFrame => page.composed!.frames.find((f) => f.name === name)!;
const blocksOf = (page: VDTPage, f: VDTFrame): VDTBlock[] => f.blockIds.map((id) => page.floats!.find((b) => b.id === id)!);
const headingOf = (blocks: readonly VDTBlock[]): VDTBlock => blocks.find((b) => b.type === 'heading')!;
const titleOf = (h: VDTBlock): VDTDesignTextBlock => h.designOverlay!.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;
/** The overlay's boxes relative to the heading's top-left. */
const relative = (h: VDTBlock) => h.designOverlay!.blocks.map((b) => [b.kind, b.bbox.x - h.bbox.x, b.bbox.y - h.bbox.y, b.bbox.width, b.bbox.height].map((v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)));
const words = (n: number, w = 'word'): string => Array.from({ length: n }, (_, i) => `${w}${i}`).join(' ');
const flowTemplate = (width = 160, extra: Partial<FrameConfig> = {}): PageTemplate =>
  ({ id: 't', frames: [{ name: 'text', flow: true, width: mm(width), placement: { anchor: { to: 'container', edge: 'top-left' } }, ...extra }] }) as PageTemplate;

describe('heading designs inside frames and callouts (#906)', () => {
  it('a frame draws a heading’s design as the page column does, with the same room', () => {
    const md = `## Situarse en el territorio {style="pestana"}\n\n${words(30)}`;
    const column = build(md);
    const inColumn = headingOf(column.pages[0]!.columns[0]!.blocks);
    // A frame as wide as the page's column.
    const doc = build(`::::page{template="t"}\n${md}\n::::`, [flowTemplate((inColumn.bbox.width / DPI) * 25.4)]);
    const page = composedPage(doc);
    const inFrame = headingOf(blocksOf(page, frame(doc, 'text')));
    expect(inColumn.designOverlay).toBeDefined();
    expect(inFrame.designOverlay).toBeDefined();
    // The same width, the same design, the room the design takes (the
    // column snaps it up to its baseline grid; a box has none).
    expect(inFrame.bbox.width).toBeCloseTo(inColumn.bbox.width, 3);
    expect(inFrame.bbox.height).toBeCloseTo(px(14), 3);
    expect(inColumn.bbox.height).toBeGreaterThanOrEqual(px(14) - 0.01);
    expect(relative(inFrame)).toEqual(relative(inColumn));
    expect(titleOf(inFrame).lines.map((l) => l.text).join(' ')).toBe('Situarse en el territorio');
    // The text under the heading starts below the room the design takes.
    const para = blocksOf(page, frame(doc, 'text')).find((b) => b.type === 'paragraph')!;
    expect(para.bbox.y).toBeGreaterThanOrEqual(inFrame.bbox.y + px(14) - 0.5);
    // The style is read for the design only: the heading opens no section.
    expect(inFrame.headingStyleId).toBeUndefined();
    expect(inFrame.boxDesign).toEqual({ styleId: 'pestana', attrs: { style: 'pestana' }, attrSources: expect.any(Object) });
  });

  it('a callout in the flow keeps the design of a tabbed heading, and its box grows for it', () => {
    const md = (style: string) => `Before.\n\n:::callout{type="caja"}\n## In the box${style}\n\nBody of the box.\n:::\n\nAfter.`;
    const plain = build(md(''));
    const designed = build(md(' {style="pestana"}'));
    const boxOf = (doc: VDTDocument) => doc.pages[0]!.columns[0]!.blocks.find((b) => b.type === 'callout')!;
    const hOf = (doc: VDTDocument) => doc.pages[0]!.columns[0]!.blocks.find((b) => b.type === 'heading')!;
    expect(hOf(plain).designOverlay).toBeUndefined();
    expect(hOf(designed).designOverlay).toBeDefined();
    expect(hOf(designed).bbox.height).toBeCloseTo(px(14), 3);
    expect(boxOf(designed).bbox.height - boxOf(plain).bbox.height).toBeCloseTo(px(14) - hOf(plain).bbox.height, 3);
    // The tab reaches above the heading, into the box's top padding.
    const tab = hOf(designed).designOverlay!.blocks.find((b) => b.kind === 'box')!;
    expect(tab.bbox.y).toBeCloseTo(hOf(designed).bbox.y - px(4), 3);
  });

  it('a fixed callout (set out of the columns) draws its heading’s design too', () => {
    const doc = build(`Text.\n\n:::callout{type="caja" placement="fixed" anchor="bottom-left"}\n## Fixed {style="pestana"}\n\nInside.\n:::\n`);
    const h = (doc.pages[0]!.floats ?? []).find((b) => b.type === 'heading')!;
    expect(h).toBeDefined();
    expect(h.designOverlay).toBeDefined();
    expect(titleOf(h).lines[0]!.text).toBe('Fixed');
  });

  it('a heading with no design in a box is unchanged: no overlay, its lines’ height', () => {
    const doc = build(`::::page{template="t"}\n## Plain title\n\n${words(10)}\n::::`, [flowTemplate()]);
    const page = composedPage(doc);
    const h = headingOf(blocksOf(page, frame(doc, 'text')));
    expect(h.designOverlay).toBeUndefined();
    expect(h.boxDesign).toBeUndefined();
    expect(h.bbox.height).toBeCloseTo(h.lines.length * (h.lines[1] ? h.lines[1].baseline - h.lines[0]!.baseline : h.lines[0]!.bbox.height), 0);
  });

  it('a page-span heading inside a frame is laid out at the frame’s width, as in a column', () => {
    const opener = { ...TAB, id: 'abre', span: 'page', breakBefore: { enabled: false } };
    const doc = build(`::::page{template="t"}\n# Tema {style="abre"}\n\n${words(10)}\n::::`, [flowTemplate(100)], { headingStyles: [opener as never] });
    const page = composedPage(doc);
    const h = headingOf(blocksOf(page, frame(doc, 'text')));
    expect(h.hidden).toBeFalsy();
    expect(page.openerBand).toBeUndefined();
    expect(h.designOverlay).toBeDefined();
    expect(h.bbox.width).toBeCloseTo(px(100), 3);
    expect(titleOf(h).bbox.x).toBeCloseTo(h.bbox.x + px(2), 3);
  });

  it('a scaled frame lays the design in its own coordinates: the frame’s matrix paints it at the scale', () => {
    const tpl = flowTemplate(80, { height: mm(60) });
    const doc = build(`::::page{template="t"}\n## Escala {style="marca"}\n\n${words(250)}\n::::`, [tpl]);
    const page = composedPage(doc);
    const f = frame(doc, 'text');
    expect(f.scale).toBeLessThan(1);
    const h = headingOf(blocksOf(page, f));
    // Laid out at 1 / scale, as the frame's other blocks: the same design as
    // an unscaled frame of the laid-out width.
    const wide = build(`::::page{template="t"}\n## Escala {style="marca"}\n\n${words(5)}\n::::`, [flowTemplate(80 / f.scale)]);
    const ref = headingOf(blocksOf(composedPage(wide), frame(wide, 'text')));
    expect(h.bbox.width).toBeCloseTo(ref.bbox.width, 1);
    expect(h.bbox.height).toBeCloseTo(px(14), 3);
    expect(relative(h).slice(0, 2)).toEqual(relative(ref).slice(0, 2));
    // The page-anchored mark is anchored to the trim's corner once painted;
    // its offset, like every length of the frame's content, is at the scale.
    const mark = h.designOverlay!.blocks.find((b) => b.kind === 'box' && b.bbox.width < px(6))!;
    const m = frameMatrix(f)!;
    const x = m[0] * mark.bbox.x + m[2] * mark.bbox.y + m[4];
    const y = m[1] * mark.bbox.x + m[3] * mark.bbox.y + m[5];
    expect(x).toBeCloseTo(px(10 * f.scale), 1);
    expect(y).toBeCloseTo(px(10 * f.scale), 1);
  });

  it('framesInFrame maps the page frames into a scaled frame and leaves an unscaled one alone', () => {
    const frames = { page: { x: 0, y: 0, width: 1000, height: 1200 }, bleed: { x: -10, y: -10, width: 1020, height: 1220 } };
    expect(framesInFrame(frames, { rect: { x: 100, y: 100, width: 200, height: 200 }, scale: 1 })).toBe(frames);
    const inside = framesInFrame(frames, { rect: { x: 100, y: 100, width: 200, height: 200 }, scale: 0.5 })!;
    expect(inside.page).toEqual({ x: -100, y: -100, width: 2000, height: 2400 });
  });

  it('a turned frame carries its heading’s design in the frame’s coordinates (the frame’s turn paints both)', () => {
    const upright = build(`::::page{template="t"}\n## Girado {style="pestana"}\n\n${words(12)}\n::::`, [flowTemplate(90)]);
    const turned = build(`::::page{template="t"}\n## Girado {style="pestana"}\n\n${words(12)}\n::::`, [flowTemplate(90, { rotate: 8 })]);
    const hu = headingOf(blocksOf(composedPage(upright), frame(upright, 'text')));
    const ht = headingOf(blocksOf(composedPage(turned), frame(turned, 'text')));
    expect(frame(turned, 'text').rotate).toBe(8);
    expect(ht.designOverlay).toBeDefined();
    expect(relative(ht)).toEqual(relative(hu));
  });

  it('a heading the text carries on to the next frame of a chain draws its design there', () => {
    const tpl: PageTemplate = { id: 'chain', frames: [
      { name: 'a', flow: true, next: 'b', width: mm(70), height: mm(40), fit: { shrinkText: false }, placement: { anchor: { to: 'container', edge: 'top-left' } } },
      { name: 'b', width: mm(70), height: mm(120), placement: { anchor: { to: 'container', edge: 'top-right' } } },
    ] } as PageTemplate;
    const doc = build(`::::page{template="chain"}\n${words(120)}\n\n## Una pestaña con un título largo que ocupa varias líneas en la caja {style="pestana"}\n\n${words(20)}\n::::`, [tpl]);
    const page = composedPage(doc);
    const headings = [...blocksOf(page, frame(doc, 'a')), ...blocksOf(page, frame(doc, 'b'))].filter((b) => b.type === 'heading');
    expect(headings).toHaveLength(1);
    expect(headings[0]!.designOverlay).toBeDefined();
    expect(frame(doc, 'b').blockIds).toContain(headings[0]!.id);
  });

  it('a heading carried on to a page added by continuation draws its design there', () => {
    const tpl: PageTemplate = { id: 'c', overflowTemplate: 'c', frames: [
      { name: 'a', flow: true, width: mm(90), height: mm(50), fit: { shrinkText: false }, overflow: { continueIn: 'next-page' }, placement: { anchor: { to: 'container', edge: 'top-left' } } },
    ] } as PageTemplate;
    const doc = build(`::::page{template="c"}\n${words(160)}\n\n## Sigue {style="pestana"}\n\n${words(20)}\n::::\n\nAfter.`, [tpl]);
    const pages = doc.pages.filter((p) => p.composed);
    expect(pages.length).toBeGreaterThan(1);
    const found = pages.flatMap((p) => p.composed!.frames.flatMap((f) => blocksOf(p, f).map((b) => ({ p, b })))).filter(({ b }) => b.type === 'heading');
    expect(found).toHaveLength(1);
    expect(found[0]!.p).not.toBe(pages[0]);
    expect(found[0]!.b.designOverlay).toBeDefined();
    expect(titleOf(found[0]!.b).lines[0]!.text).toBe('Sigue');
  });

  it('a spread frame across the spine draws the design on both pages, the half a moved copy', () => {
    const tpl: PageTemplate = { id: 'tl', spread: true, gutter: mm(10), grid: { columns: 4, rows: 4, columnGap: mm(12) }, frames: [{ name: 'band', crossGutter: true, grid: { col: 1, row: 1, cols: 4 } }] } as PageTemplate;
    const doc = build('::::page{template="tl" spread}\n:::frame{slot="band"}\n## Across {style="pestana"}\n\nBand across the spine\n:::\n::::\n\nAfter.', [tpl]);
    const [verso, recto] = doc.pages.filter((p) => p.composed?.spread) as [VDTPage, VDTPage];
    const own = frame(doc, 'band', verso);
    const half = frame(doc, 'band', recto);
    const h = headingOf(blocksOf(verso, own));
    const copy = headingOf(half.facingBlocks!);
    expect(h.designOverlay).toBeDefined();
    expect(copy.designOverlay).toBeDefined();
    const dx = copy.bbox.x - h.bbox.x;
    expect(dx).toBeCloseTo(-px(200), 3);
    expect(relative(copy)).toEqual(relative(h));
  });

  it('sourceAt reads the title the design prints back to the heading’s Markdown, in a scaled frame too', () => {
    for (const tpl of [flowTemplate(), flowTemplate(80, { height: mm(60) })]) {
      const md = `::::page{template="t"}\n## Situarse {style="pestana"}\n\n${words(tpl.frames![0]!.height ? 250 : 10)}\n::::`;
      const doc = build(md, [tpl]);
      const page = composedPage(doc);
      const f = frame(doc, 'text');
      const h = headingOf(blocksOf(page, f));
      const title = titleOf(h);
      // A point inside the title (above the heading's own box: the tab
      // reaches up), put on the sheet with the frame's matrix.
      const lx = title.bbox.x + 3;
      const ly = title.bbox.y + title.bbox.height / 2;
      const m = frameMatrix(f) ?? [1, 0, 0, 1, 0, 0];
      const chain = sourceAt(doc, page.index, m[0] * lx + m[2] * ly + m[4], m[1] * lx + m[3] * ly + m[5]);
      const text = chain[0]!;
      expect(text.level).toBe('text');
      expect(text.source.kind).toBe('markdown');
      const at = (text.source as { start: number }).start;
      expect(md.slice(at, at + 1)).toBe('S');
      expect(chain.map((e) => e.level)).toEqual(expect.arrayContaining(['block', 'frame', 'template']));
      expect(chain.find((e) => e.level === 'block')!.id).toBe(h.id);
    }
  });

  it('sourceAt reads a tabbed heading of a flow callout back to its Markdown', () => {
    const md = `Before.\n\n:::callout{type="caja"}\n## Pestaña {style="pestana"}\n\nBody.\n:::\n`;
    const doc = build(md);
    const h = doc.pages[0]!.columns[0]!.blocks.find((b) => b.type === 'heading')!;
    const title = titleOf(h);
    const chain = sourceAt(doc, 0, title.bbox.x + 2, title.bbox.y + title.bbox.height / 2);
    expect(chain[0]!.level).toBe('text');
    const at = (chain[0]!.source as { start: number }).start;
    expect(md.slice(at, at + 1)).toBe('P');
    expect(chain.map((e) => e.level)).toContain('box');
  });

  it('the stand-in’s flow frame keeps a tabbed `##` heading (P4’s page 8)', () => {
    for (const locale of ['es', 'en'] as const) {
      const fx = page8Fixture(locale);
      const markdown = fx.markdown.replace(/^## (.+)$/m, '## $1 {style="pestana"}');
      const doc = buildDocument({ markdown, resources: fx.resources }, { ...fx.config, headingStyles: [TAB as never] }, createMeasurementCache());
      const page = composedPage(doc);
      const h = headingOf(blocksOf(page, frame(doc, 'texto', page)));
      expect(h.designOverlay).toBeDefined();
      expect(titleOf(h).lines.map((l) => l.text).join(' ')).toBe(locale === 'es' ? 'Lo que compramos y vendemos' : 'What we buy and sell');
    }
  });
});
