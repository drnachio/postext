import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { formatWarning } from '../../../pipeline/contentWarnings.js';
import { anchorOn, frameOrder, gridCellRect, placeBox, framePlaceable, type FrameGeometryContext } from '../../../composed/geometry.js';
import { normalizeFrame, resolvePageTemplate } from '../../../composed/templates.js';
import { composedPaintOrder, frameBounds } from '../../../composed/paint.js';
import { wrapComposedPages, FRAME_ATTR } from '../../../composed/wrap.js';
import { parseMarkdownWithIssues } from '../../../parse/index.js';
import type { FrameConfig, PageTemplate } from '../../../composed/types.js';
import type { PostextConfig, VDTBlock, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';
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
const DPI = 300;
const px = (v: number): number => (v / 25.4) * DPI;

const PAGE: PostextConfig = {
  page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
};

const build = (md: string, templates: PageTemplate[], extra: PostextConfig = {}): VDTDocument =>
  buildDocument({ markdown: md }, { ...PAGE, ...extra, pageTemplates: templates }, createMeasurementCache());
const composedPage = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const frame = (doc: VDTDocument, name: string): VDTFrame => composedPage(doc).composed!.frames.find((f) => f.name === name)!;
const blocksOf = (doc: VDTDocument, f: VDTFrame): VDTBlock[] => f.blockIds.map((id) => composedPage(doc).floats!.find((b) => b.id === id)!);
const textOf = (blocks: readonly VDTBlock[]): string => blocks.flatMap((b) => b.lines.map((l) => l.text)).join(' ');
const words = (n: number, w = 'word'): string => Array.from({ length: n }, (_, i) => `${w}${i}`).join(' ');

const AREA = { x: 100, y: 200, width: 1000, height: 1500 };
const GEO: FrameGeometryContext = { areas: { area: AREA, page: { x: 0, y: 0, width: 1200, height: 1800 }, bleed: { x: -30, y: -30, width: 1260, height: 1860 } }, dpi: DPI, emPx: 40 };
const resolved = (f: FrameConfig, template: Partial<PageTemplate> = {}) =>
  resolvePageTemplate({ pageTemplates: [{ id: 't', ...template, frames: [f, ...(template.frames ?? [])] }] }, 't')!.frames.find((x) => x.name === f.name)!;

describe('frame geometry (#855)', () => {
  it('a frame with no placement takes the area’s top-left and width; its height follows its content', () => {
    const f = framePlaceable(normalizeFrame({ name: 'a' }));
    expect(placeBox(f, {}, GEO, () => undefined, () => 123)).toEqual({ x: 100, y: 200, width: 1000, height: 123 });
    // Never past the area's foot.
    expect(placeBox(f, {}, GEO, () => undefined, () => 9999).height).toBe(1500);
    const filled = framePlaceable(normalizeFrame({ name: 'a', height: 'fill' }));
    expect(placeBox(filled, {}, GEO, () => undefined, () => 1).height).toBe(1500);
  });

  it('anchors on the nine-point grid of the area, the trim and the bleed, with offsets', () => {
    const f = framePlaceable(normalizeFrame({ name: 'a', width: mm(50), height: mm(20), placement: { anchor: { to: 'container', edge: 'bottom-right' }, offset: { x: mm(-5), y: mm(-5) } } }));
    const r = placeBox(f, {}, GEO, () => undefined, () => 0);
    expect(r.x + r.width).toBeCloseTo(1100 - px(5), 6);
    expect(r.y + r.height).toBeCloseTo(1700 - px(5), 6);
    const onTrim = framePlaceable(normalizeFrame({ name: 'b', width: 'fill', height: mm(10), placement: { anchor: { to: 'page', edge: 'top' } } }));
    expect(placeBox(onTrim, {}, GEO, () => undefined, () => 0)).toMatchObject({ x: 0, y: 0, width: 1200 });
    const onBleed = framePlaceable(normalizeFrame({ name: 'c', width: 'fill', height: 'fill', placement: { anchor: { to: 'bleed', edge: 'top-left' } } }));
    expect(placeBox(onBleed, {}, GEO, () => undefined, () => 0)).toEqual({ x: -30, y: -30, width: 1260, height: 1860 });
  });

  it('sizes in percent of the area, and min/max (min wins)', () => {
    const f = framePlaceable(normalizeFrame({ name: 'a', width: { percent: 50 }, height: { percent: 10 }, maxWidth: mm(10), minWidth: mm(20), placement: { anchor: { to: 'container', edge: 'top-left' } } }));
    const r = placeBox(f, {}, GEO, () => undefined, () => 0);
    expect(r.width).toBeCloseTo(px(20), 6);
    expect(r.height).toBe(150);
  });

  it('hangs a frame off another with element edges, and a nine-point edge on a frame reads that point of its box', () => {
    const ref = { x: 300, y: 400, width: 200, height: 100 };
    expect(anchorOn('below', ref, true)).toEqual({ x: 300, y: 500, pinX: 'start', pinY: 'start' });
    expect(anchorOn('right-of', ref, true)).toEqual({ x: 500, y: 400, pinX: 'start', pinY: 'start' });
    expect(anchorOn('top-right', ref, true)).toEqual({ x: 500, y: 400, pinX: 'end', pinY: 'start' });
    const f = framePlaceable(normalizeFrame({ name: 'b', width: mm(10), height: mm(10), placement: { anchor: { to: '#a', edge: 'below' }, offset: { y: mm(2) } } }));
    const r = placeBox(f, {}, GEO, (n) => (n === 'a' ? ref : undefined), () => 0);
    expect(r.x).toBe(300);
    expect(r.y).toBeCloseTo(500 + px(2), 6);
  });

  it('places a frame in a grid cell, its own height or the cell’s', () => {
    const template = resolvePageTemplate({ pageTemplates: [{ id: 't', grid: { columns: 2, rows: 3, columnGap: mm(0), rowGap: mm(0) }, frames: [{ name: 'a', grid: { col: 2, row: 2 } }, { name: 'b', grid: { col: 1, row: 1, cols: 2 }, height: 'auto' }] }] }, 't')!;
    const cell = gridCellRect(template, template.frames[0]!.grid!, AREA, GEO);
    expect(cell).toEqual({ x: 600, y: 700, width: 500, height: 500 });
    expect(placeBox(framePlaceable(template.frames[0]!), template, GEO, () => undefined, () => 7)).toEqual(cell);
    expect(placeBox(framePlaceable(template.frames[1]!), template, GEO, () => undefined, () => 7)).toEqual({ x: 100, y: 200, width: 1000, height: 7 });
  });

  it('orders frames after what they anchor to, the frame their chain comes from, pushing frames first', () => {
    const template = resolvePageTemplate({ pageTemplates: [{ id: 't', frames: [
      { name: 'caption', placement: { anchor: { to: '#photo', edge: 'below' } } },
      { name: 'text', next: 'more' },
      { name: 'more', placement: { anchor: { to: 'container', edge: 'bottom-left' } } },
      { name: 'photo', exclude: 'push', placement: { anchor: { to: '#text', edge: 'right-of' } } },
    ] }] }, 't')!;
    const order = frameOrder(template).map((f) => f.name);
    expect(order.indexOf('text')).toBeLessThan(order.indexOf('photo'));
    expect(order.indexOf('photo')).toBeLessThan(order.indexOf('caption'));
    expect(order.indexOf('text')).toBeLessThan(order.indexOf('more'));
    // The pushing frame goes as early as its anchors allow.
    expect(order.indexOf('photo')).toBeLessThan(order.indexOf('more'));
  });

  it('reads `heightSet` from what the template wrote', () => {
    expect(framePlaceable(resolved({ name: 'a', height: 'auto' })).heightSet).toBe(true);
    expect(framePlaceable(resolved({ name: 'a' })).heightSet).toBe(false);
  });
});

describe('regrouping a composed page into stories (#855)', () => {
  const templates: PageTemplate[] = [{ id: 't', frames: [{ name: 'title', takes: 'h1' }, { name: 'text', flow: true }, { name: 'box', next: 'box2' }, { name: 'box2' }] }];
  const md = '::::page{template="t"}\n# Title\n\nIntro.\n\n:::frame{slot="box2" label="Two"}\nSecond.\n:::\n\n:::frame{slot="box" label="One"}\nFirst.\n:::\n\nOutro.\n::::';

  it('one story per chain, its frames’ pieces in chain order; stories in the order they first appear', () => {
    const { blocks, wrapped } = wrapComposedPages(parseMarkdownWithIssues(md).blocks, { pageTemplates: templates });
    expect(wrapped).toBe(true);
    const heads = blocks.filter((b) => b.type === 'containerStart' && b.containerAttrs?.[FRAME_ATTR]).map((b) => b.containerAttrs![FRAME_ATTR]);
    expect(heads).toEqual(['title', 'text', 'box']);
    const box = blocks.findIndex((b) => b.containerAttrs?.[FRAME_ATTR] === 'box');
    expect(blocks[box]!.containerAttrs!.label).toBe('One');
    const inBox = blocks.slice(box + 1, blocks.findIndex((b, i) => i > box && b.type === 'containerEnd' && b.containerId === blocks[box]!.containerId)).map((b) => b.text);
    expect(inBox).toEqual(['First.', 'Second.']);
  });

  it('leaves a page of unknown template as it is', () => {
    const parsed = parseMarkdownWithIssues('::::page{template="nope"}\nText.\n::::').blocks;
    expect(wrapComposedPages(parsed, { pageTemplates: templates }).wrapped).toBe(false);
  });
});

describe('composed pages laid out (#855)', () => {
  const TWO: PageTemplate = {
    id: 'two',
    frames: [
      { name: 'title', takes: 'h1', placement: { anchor: { to: 'container', edge: 'top-left' } } },
      { name: 'text', flow: true, placement: { anchor: { to: '#title', edge: 'below' }, offset: { y: mm(3) } } },
    ],
  };

  it('owns a page of role composed; what follows starts on the next page; nothing flows on it', () => {
    const doc = build('Before.\n\n::::page{template="two"}\n# Title\n\nBody text.\n::::\n\nAfter.', [TWO]);
    expect(doc.pages).toHaveLength(3);
    const page = doc.pages[1]!;
    expect(page.role).toBe('composed');
    expect(page.columns).toHaveLength(1);
    expect(page.columns[0]!.blocks).toHaveLength(0);
    expect(textOf(doc.pages[2]!.columns.flatMap((c) => c.blocks))).toBe('After.');
  });

  it('records the frames with stable ids, config paths and the blocks they hold', () => {
    const doc = build('::::page{template="two"}\n# Title\n\nBody text.\n::::', [TWO]);
    const composed = composedPage(doc).composed!;
    expect(composed.template).toBe('two');
    expect(composed.configPath).toBe('/pageTemplates/0');
    expect(composed.frames.map((f) => [f.id, f.configPath])).toEqual([['cp0:title', '/pageTemplates/0/frames/0'], ['cp0:text', '/pageTemplates/0/frames/1']]);
    const title = frame(doc, 'title');
    const blocks = blocksOf(doc, title);
    expect(blocks[0]!.type).toBe('callout');
    expect(blocks[0]!.id).toBe('cp0:title');
    expect(textOf(blocks)).toBe('Title');
    // Frame blocks are in `doc.blocks` with their sources (caret mapping).
    for (const b of blocks) expect(doc.blocks).toContain(b);
    const heading = blocks.find((b) => b.type === 'heading')!;
    expect(heading.sourceStart).toBeGreaterThan(0);
    expect(title.sourceStart).toBeDefined();
    expect(heading.containerId).toBe(blocks[0]!.containerId);
  });

  it('an auto height is the content’s height; the text frame hangs below the title', () => {
    const doc = build('::::page{template="two"}\n# Title\n\nBody text.\n::::', [TWO]);
    const title = frame(doc, 'title');
    const text = frame(doc, 'text');
    const [box, heading] = blocksOf(doc, title);
    expect(title.rect.height).toBeCloseTo(box!.bbox.height, 6);
    expect(heading!.bbox.y + heading!.bbox.height).toBeLessThanOrEqual(title.rect.y + title.rect.height + 0.01);
    expect(text.rect.y).toBeCloseTo(title.rect.y + title.rect.height + px(3), 6);
  });

  it('places content of a taller fixed frame as verticalAlign says', () => {
    const at = (verticalAlign: 'top' | 'middle' | 'bottom') => {
      const doc = build('::::page{template="v"}\nOne line.\n::::', [{ id: 'v', frames: [{ name: 'f', flow: true, height: mm(50), verticalAlign, placement: { anchor: { to: 'container', edge: 'top-left' } } }] }]);
      const f = frame(doc, 'f');
      const para = blocksOf(doc, f).find((b) => b.type === 'paragraph')!;
      return { top: para.bbox.y - f.rect.y, bottom: f.rect.y + f.rect.height - (para.bbox.y + para.bbox.height), box: blocksOf(doc, f)[0]! };
    };
    const top = at('top');
    const middle = at('middle');
    const bottom = at('bottom');
    expect(top.top).toBeCloseTo(0, 3);
    expect(middle.top).toBeCloseTo(middle.bottom, 3);
    expect(bottom.bottom).toBeCloseTo(0, 3);
    // The box is drawn as tall as the frame.
    expect(top.box.bbox.height).toBeCloseTo(px(50), 3);
  });

  it('chains a story from one frame to the next (`next`): nothing lost, nothing doubled', () => {
    const story = words(120);
    const tpl: PageTemplate = { id: 'chain', frames: [
      { name: 'a', flow: true, next: 'b', width: mm(70), height: mm(30), placement: { anchor: { to: 'container', edge: 'top-left' } } },
      { name: 'b', width: mm(50), height: mm(150), placement: { anchor: { to: 'container', edge: 'top-right' } } },
    ] };
    const doc = build(`::::page{template="chain"}\n${story}\n::::`, [tpl]);
    const a = frame(doc, 'a');
    const b = frame(doc, 'b');
    expect(a.continuesTo).toBe(b.id);
    expect(b.continuedFrom).toBe(a.id);
    expect(a.overflowPx).toBe(0);
    const aText = textOf(blocksOf(doc, a));
    const bText = textOf(blocksOf(doc, b));
    expect(aText.length).toBeGreaterThan(0);
    expect(bText.length).toBeGreaterThan(0);
    expect(`${aText} ${bText}`.replace(/-\s/g, '').split(/\s+/).join(' ')).toBe(story);
    // Each piece is set at its own frame's measure.
    const aLines = blocksOf(doc, a).find((x) => x.type === 'paragraph')!.lines;
    const bLines = blocksOf(doc, b).find((x) => x.type === 'paragraph')!.lines;
    expect(Math.max(...aLines.map((l) => l.bbox.width))).toBeGreaterThan(Math.max(...bLines.map((l) => l.bbox.width)));
    // The second piece's box joins the first (tagging) and carries no tab.
    expect(blocksOf(doc, b)[0]!.id).toBe('cp0:a-cont-1');
  });

  it('reads overflow.continueIn: "#frame" as next', () => {
    const tpl: PageTemplate = { id: 'ci', frames: [
      { name: 'a', flow: true, overflow: { continueIn: '#b' }, width: mm(70), height: mm(20), placement: { anchor: { to: 'container', edge: 'top-left' } } },
      { name: 'b', width: mm(70), height: mm(150), placement: { anchor: { to: 'container', edge: 'top-right' } } },
    ] };
    const doc = build(`::::page{template="ci"}\n${words(100)}\n::::`, [tpl]);
    expect(frame(doc, 'a').continuesTo).toBe('cp0:b');
    expect(frame(doc, 'a').overflowPx).toBe(0);
    expect(textOf(blocksOf(doc, frame(doc, 'b'))).length).toBeGreaterThan(0);
  });

  it('clips what no frame can hold and says so (frameOverflow), keeping it in the document', () => {
    const story = words(200);
    const tpl: PageTemplate = { id: 'small', frames: [{ name: 'a', flow: true, width: mm(60), height: mm(20), placement: { anchor: { to: 'container', edge: 'top-left' } } }] };
    const doc = build(`::::page{template="small"}\n${story}\n::::`, [tpl]);
    const a = frame(doc, 'a');
    expect(a.overflowPx).toBeGreaterThan(0);
    expect(textOf(blocksOf(doc, a)).replace(/-\s/g, '').split(/\s+/).join(' ')).toBe(story);
    const w = doc.contentWarnings!.find((x) => x.kind === 'frameOverflow')!;
    expect(w).toMatchObject({ kind: 'frameOverflow', template: 'small', frame: 'a', fenceIndex: 0, configPath: '/pageTemplates/0/frames/0', pageIndex: 0 });
    expect(w.kind === 'frameOverflow' && w.overflowMm).toBeCloseTo((a.overflowPx / DPI) * 25.4, 0);
    // The reflow ladder (#858) shrank its text to fit.minScale first.
    expect(composedPage(doc).composed!.log).toEqual([{ frame: 'a', kind: 'textScaled', scale: 0.9 }, { frame: 'a', kind: 'overflow', toMm: (w as { overflowMm: number }).overflowMm }]);
    expect(formatWarning(w)).toContain('Frame "a" of template "small"');
  });

  it('wraps a frame’s text round a frame that pushes it (exclude: push)', () => {
    const story = words(150);
    const tpl = (exclude: 'push' | 'none'): PageTemplate => ({ id: 'push', frames: [
      { name: 'text', flow: true, width: mm(120), placement: { anchor: { to: 'container', edge: 'top-left' } } },
      { name: 'photo', exclude, layer: 2, width: mm(40), height: mm(30), placement: { anchor: { to: '#text', edge: 'top-right' } } },
    ] });
    const lines = (doc: VDTDocument) => blocksOf(doc, frame(doc, 'text')).filter((b) => b.type === 'paragraph').flatMap((b) => b.lines);
    const pushed = build(`::::page{template="push"}\n${story}\n::::`, [tpl('push')]);
    const plain = build(`::::page{template="push"}\n${story}\n::::`, [tpl('none')]);
    const photo = frame(pushed, 'photo');
    const beside = lines(pushed).filter((l) => l.bbox.y < photo.rect.y + photo.rect.height);
    expect(beside.length).toBeGreaterThan(0);
    for (const l of beside) expect(l.bbox.x + l.bbox.width).toBeLessThanOrEqual(photo.rect.x + 0.5);
    expect(lines(pushed).length).toBeGreaterThan(lines(plain).length);
    expect(photo.push).toBe(true);
  });

  it('a styled frame draws its callout style, with the tab from the frame fence', () => {
    const tpl: PageTemplate = { id: 's', frames: [{ name: 'box', style: 'caja', placement: { anchor: { to: 'container', edge: 'top-left' } }, width: mm(100) }] };
    const doc = build('::::page{template="s"}\n:::frame{slot="box" label="Money"}\nInside the box.\n:::\n::::', [tpl], {
      calloutStyles: [{ id: 'caja', backgroundEnabled: true, background: { hex: '#d8ecf9' }, label: { position: 'top-left', offset: mm(5), height: mm(5) } } as never],
    });
    const box = blocksOf(doc, frame(doc, 'box'))[0]!;
    expect(box.callout!.styleId).toBe('caja');
    const labelText = box.designOverlay!.blocks.flatMap((b) => (b.kind === 'text' ? b.lines.map((l) => l.text) : []));
    expect(labelText).toContain('Money');
    expect(box.bbox.width).toBeCloseTo(px(100), 3);
    expect(frame(doc, 'box').styleId).toBe('caja');
  });

  it('padding of the frame overrides its style’s, side by side', () => {
    const tpl = (padding?: FrameConfig['padding']): PageTemplate => ({ id: 'p', frames: [{ name: 'box', style: 'caja', ...(padding ? { padding } : {}), width: mm(150), placement: { anchor: { to: 'container', edge: 'top-left' } } }] });
    const md = '::::page{template="p"}\n:::frame{slot="box"}\nText.\n:::\n::::';
    const cfg = { calloutStyles: [{ id: 'caja', padding: { top: mm(2), right: mm(2), bottom: mm(2), left: mm(2) } } as never] };
    const plain = build(md, [tpl()], cfg);
    const padded = build(md, [tpl({ left: mm(60) })], cfg);
    const xOf = (doc: VDTDocument) => blocksOf(doc, frame(doc, 'box')).find((b) => b.type === 'paragraph')!.bbox.x;
    expect(xOf(padded) - xOf(plain)).toBeCloseTo(px(58), 3);
  });

  it('sets a frame in columns with the :::columns machinery', () => {
    const doc = build(`::::page{template="c"}\n${words(40, 'a')}\n\n${words(40, 'b')}\n::::`, [{ id: 'c', frames: [{ name: 'f', flow: true, columns: 2, columnGap: mm(5), width: mm(150), placement: { anchor: { to: 'container', edge: 'top-left' } } }] }]);
    const xs = new Set(blocksOf(doc, frame(doc, 'f')).filter((b) => b.type === 'paragraph').map((b) => Math.round(b.bbox.x)));
    expect(xs.size).toBe(2);
  });

  it('never ends a column of a frame with a heading: it goes on with what follows it', () => {
    const tpl: PageTemplate = { id: 'c', frames: [{ name: 'f', flow: true, columns: 2, columnGap: mm(5), width: mm(150), placement: { anchor: { to: 'container', edge: 'top-left' } } }] };
    let columnsSeen = 0;
    for (let before = 30; before <= 180; before += 30) {
      for (let after = 30; after <= 270; after += 30) {
        const doc = build(`::::page{template="c"}\n${words(before, 'a')}\n\n## Looking after the river\n\n${words(after, 'b')}\n::::`, [tpl]);
        const blocks = blocksOf(doc, frame(doc, 'f'));
        const xs = [...new Set(blocks.map((b) => Math.round(b.bbox.x)))].sort((a, b) => a - b);
        if (xs.length > 1) columnsSeen++;
        for (const x of xs.slice(0, -1)) {
          const column = blocks.filter((b) => Math.round(b.bbox.x) === x).sort((a, b) => a.bbox.y - b.bbox.y);
          expect(column[column.length - 1]!.type, `${before} + ${after} words`).not.toBe('heading');
        }
      }
    }
    expect(columnsSeen).toBeGreaterThan(0);
  });

  it('records layer and turn; paints frames in layer order around the decoration', () => {
    const tpl: PageTemplate = { id: 'l', decoration: { elements: [{ kind: 'box', id: 'bg', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: mm(10), height: mm(10) } }, style: { backgroundColor: { hex: '#ff0000' } } } as never] }, frames: [
      { name: 'over', layer: 3, rotate: 12, placement: { anchor: { to: 'container', edge: 'top-left' } } },
      { name: 'under', layer: -1, placement: { anchor: { to: 'container', edge: 'bottom-left' } } },
      { name: 'mid', flow: true, placement: { anchor: { to: 'container', edge: 'center' } }, width: mm(50) },
    ] };
    const doc = build('::::page{template="l"}\n:::frame{slot="over"}\nOver.\n:::\n:::frame{slot="under"}\nUnder.\n:::\nMid.\n::::', [tpl]);
    const page = composedPage(doc);
    expect(frame(doc, 'over')).toMatchObject({ layer: 3, rotate: 12 });
    const order = composedPaintOrder(page).map((i) => (i.kind === 'frame' ? i.frame.name : 'decoration'));
    expect(order).toEqual(['under', 'decoration', 'mid', 'over']);
    expect(page.composed!.decoration).toBeDefined();
    const b = frameBounds(frame(doc, 'over'));
    expect(b.height).toBeGreaterThan(frame(doc, 'over').rect.height);
  });

  it('lays the decoration with the frames’ boxes and the page fence’s attributes', () => {
    const tpl: PageTemplate = { id: 'd', decoration: { elements: [
      { kind: 'text', id: 'tema', content: '{attr.tema}', placement: { anchor: { to: '#box', edge: 'below' } } },
      { kind: 'image', id: 'bg', resourceId: '{attr.fondo}', decorative: true, placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill', height: 'fill' } } },
    ] } as never, frames: [{ name: 'box', flow: true, width: mm(80), placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: mm(10) } } }] };
    const md = '---\ntitle: T\n---\n::::page{template="d" tema="Savings" fondo="green"}\nText.\n::::';
    const doc = buildDocument({ markdown: md, resources: [{ id: 'green', typeId: 'figure', kind: 'bitmap', caption: '', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'g', format: 'png', width: 10, height: 10 } } as never] }, { ...PAGE, pageTemplates: [tpl] }, createMeasurementCache());
    const page = composedPage(doc);
    const deco = page.composed!.decoration!.blocks;
    const text = deco.find((b) => b.kind === 'text')!;
    const box = frame(doc, 'box');
    expect(text.kind === 'text' && text.lines[0]!.text).toBe('Savings');
    expect(text.bbox.y).toBeCloseTo(box.rect.y + box.rect.height, 3);
    expect(text.bbox.x).toBeCloseTo(box.rect.x, 3);
    // The text maps back to the attribute's value in the chapter file.
    expect(md.slice(text.kind === 'text' ? text.sourceStart! : 0, text.kind === 'text' ? text.sourceEnd! : 0)).toBe('Savings');
    expect(page.composed!.attrSources.tema && md.slice(page.composed!.attrSources.tema.sourceStart, page.composed!.attrSources.tema.sourceEnd)).toBe('Savings');
    expect(deco.some((b) => b.kind === 'image' && b.fileId === 'g')).toBe(true);
  });

  it('hides, replaces or inherits the running heads per template', () => {
    const slot = (content: string) => ({ elements: [{ kind: 'text', id: 'x', content, placement: { anchor: { to: 'container', edge: 'top-left' } } }] }) as never;
    const texts = (s: VDTPage['header']) => s?.blocks.flatMap((b) => (b.kind === 'text' ? b.lines.map((l) => l.text) : [])) ?? [];
    const run = (header: PageTemplate['header'], footer?: PageTemplate['footer']) => {
      const doc = build('Before.\n\n::::page{template="h"}\nText.\n::::', [{ id: 'h', ...(header !== undefined ? { header } : {}), ...(footer !== undefined ? { footer } : {}), frames: [{ name: 'f', flow: true }] }], { header: slot('HEAD {attr.tema}'), footer: slot('FOOT {pageNumber}') });
      return composedPage(doc);
    };
    expect(run(false).header).toBeUndefined();
    expect(texts(run(false).footer)).toEqual(['FOOT 2']);
    expect(texts(run(slot('OWN'), false).header)).toEqual(['OWN']);
    expect(run(slot('OWN'), false).footer).toBeUndefined();
    expect(texts(run(undefined).header)).toEqual(['HEAD ']);
  });

  it('reads `{attr.x}` of the page fence in the running heads of its page', () => {
    const doc = build('::::page{template="h" tema="Savings"}\nText.\n::::', [{ id: 'h', frames: [{ name: 'f', flow: true }] }], { header: { elements: [{ kind: 'text', id: 'x', content: '{attr.tema}', placement: { anchor: { to: 'container', edge: 'top-left' } } }] } as never });
    const header = composedPage(doc).header!;
    expect(header.blocks.flatMap((b) => (b.kind === 'text' ? b.lines.map((l) => l.text) : []))).toEqual(['Savings']);
  });

  it('sets content no frame takes in the flow after the page, never losing it', () => {
    const tpl: PageTemplate = { id: 'n', frames: [{ name: 'box' }] };
    const doc = build('::::page{template="n"}\n:::frame{slot="box"}\nIn the box.\n:::\n\nLoose text.\n::::\n\nAfter.', [tpl]);
    expect(textOf(blocksOf(doc, frame(doc, 'box')))).toBe('In the box.');
    const later = doc.pages.slice(1).flatMap((p) => p.columns.flatMap((c) => c.blocks));
    expect(textOf(later)).toBe('Loose text. After.');
    expect(later[0]!.pageIndex).toBe(1);
  });

  it('a picture sent to a frame is set in it, not floated', () => {
    const resources = [{ id: 'pic', typeId: 'figure', kind: 'bitmap', caption: 'A picture', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'p', format: 'png', width: 400, height: 300 } }] as never;
    const doc = buildDocument({ markdown: '::::page{template="r"}\nText.\n\n::resource{id="pic" slot="photo"}\n::::', resources }, { ...PAGE, pageTemplates: [{ id: 'r', frames: [{ name: 'text', flow: true, width: mm(80) }, { name: 'photo', width: mm(50), placement: { anchor: { to: 'container', edge: 'top-right' } } }] }] }, createMeasurementCache());
    const photo = frame(doc, 'photo');
    const pic = blocksOf(doc, photo).find((b) => b.type === 'resource')!;
    expect(pic.resourceBlock).toBeDefined();
    expect(pic.bbox.x).toBeGreaterThanOrEqual(photo.rect.x - 0.01);
    expect(doc.pages.every((p) => p === composedPage(doc) || (p.floats ?? []).length === 0)).toBe(true);
  });

  it('a page of unknown template is set in the flow on pages of its own', () => {
    const doc = build('A.\n\n::::page{template="nope"}\nInside.\n::::\n\nB.', [TWO]);
    expect(doc.pages.some((p) => p.composed)).toBe(false);
    expect(doc.pages.map((p) => textOf(p.columns.flatMap((c) => c.blocks)))).toEqual(['A.', 'Inside.', 'B.']);
  });

  it('the parity of the page picks the template’s variant', () => {
    const tpl: PageTemplate = { id: 'var', frames: [{ name: 'f', flow: true, width: mm(100) }], variants: { verso: { frames: [{ name: 'f', width: mm(60) }] } } };
    const doc = build('::::page{template="var"}\nOne.\n::::\n\n::::page{template="var"}\nTwo.\n::::', [tpl]);
    const pages = doc.pages.filter((p) => p.composed);
    expect(pages.map((p) => p.composed!.variant)).toEqual([undefined, 'verso']);
    expect(pages[0]!.composed!.frames[0]!.rect.width).toBeCloseTo(px(100), 3);
    expect(pages[1]!.composed!.frames[0]!.rect.width).toBeCloseTo(px(60), 3);
    expect(pages[1]!.composed!.frames[0]!.id).toBe('cp1:f');
  });
});

describe('the page-8 stand-in (#855)', () => {
  for (const locale of ['es', 'en'] as const) {
    it(`sets every word of the ${locale} page in its frames, on one page, none in the config`, () => {
      const { markdown, config, resources } = page8Fixture(locale);
      const doc = buildDocument({ markdown, resources }, config, createMeasurementCache());
      expect(doc.pages).toHaveLength(1);
      const page = doc.pages[0]!;
      expect(page.role).toBe('composed');
      const names = page.composed!.frames.map((f) => f.name);
      expect(names).toEqual(['titulo', 'texto', 'dinero', 'dinero-fotos', 'gasto', 'gasto-fotos', 'ahorro', 'ahorro-fotos']);
      for (const name of ['dinero', 'gasto', 'ahorro']) {
        const f = page.composed!.frames.find((x) => x.name === name)!;
        expect(f.overflowPx).toBe(0);
        expect(blocksOf(doc, f)[0]!.designOverlay!.blocks.some((b) => b.kind === 'text')).toBe(true);
      }
      for (const name of ['dinero-fotos', 'gasto-fotos', 'ahorro-fotos']) {
        const f = page.composed!.frames.find((x) => x.name === name)!;
        expect(blocksOf(doc, f).some((b) => b.type === 'resource')).toBe(true);
      }
      // The boxes stack down the page, each below the one before.
      const ys = ['titulo', 'texto', 'dinero', 'gasto', 'ahorro'].map((n) => page.composed!.frames.find((f) => f.name === n)!.rect.y);
      expect([...ys].sort((a, b) => a - b)).toEqual(ys);
      // The configuration holds no sentence of the page.
      const text = JSON.stringify(config);
      for (const b of page.floats!) for (const l of b.lines) if (l.text.length > 20) expect(text).not.toContain(l.text);
      expect((doc.contentWarnings ?? []).filter((w) => w.kind === 'frameOverflow')).toEqual([]);
      expect(page.composed!.decoration!.blocks.some((b) => b.kind === 'image')).toBe(true);
    });
  }
});
