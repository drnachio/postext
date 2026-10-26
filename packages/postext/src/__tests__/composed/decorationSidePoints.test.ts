import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import { layoutDesignSlot } from '../../design/layout.js';
import { resolveDesignSlot } from '../../defaults/structure/headerFooter.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import type { DesignPlaceholderContext } from '../../design/placeholders.js';
import type { PageTemplate } from '../../composed/types.js';
import type { DesignElement, ElementAnchor, PostextConfig, VDTDesignBlock, VDTDocument, VDTFrame, VDTPage } from '../../index.js';

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
const pt = (value: number) => ({ value, unit: 'pt' as const });
const DPI = 300;

const PAGE: PostextConfig = {
  page: { width: mm(200), height: mm(260), dpi: DPI, margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
};
const build = (md: string, templates: PageTemplate[]): VDTDocument =>
  buildDocument({ markdown: md }, { ...PAGE, pageTemplates: templates }, createMeasurementCache());
const composedPage = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const frame = (doc: VDTDocument, name: string): VDTFrame => composedPage(doc).composed!.frames.find((f) => f.name === name)!;
const deco = (doc: VDTDocument, id: string): VDTDesignBlock => composedPage(doc).composed!.decoration!.blocks.find((b) => b.elementId === id)!;
const words = (n: number, w = 'word'): string => Array.from({ length: n }, (_, i) => `${w}${i}`).join(' ');

const THICK = pt(0.75);
const ink = { hex: '#1a1a1a', model: 'hex' as const };

/** A parent frame over two children side by side and a frame under the
 *  left child, in one stack: the parent's text grows and pushes the others
 *  down (the right child is anchored to the left one and follows it). */
const family: PageTemplate = {
  id: 'family',
  frames: [
    { name: 'parent', width: mm(70), placement: { anchor: { to: 'container', edge: 'top' } } },
    { name: 'left', width: mm(50), height: mm(20), placement: { anchor: { to: 'container', edge: 'top-left' } } },
    { name: 'right', width: mm(50), height: mm(20), placement: { anchor: { to: '#left', edge: 'align-top' }, offset: { x: mm(110) } } },
    { name: 'under', width: mm(30), height: mm(20), placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(10) } } },
  ],
  groups: [{ name: 'g', kind: 'stack', gap: mm(15), frames: ['parent', 'left', 'under'] }],
};
const page = (n: number): string => `::::page{template="family"}\n\n:::frame{slot="parent"}\n\n${words(n)}\n\n:::\n\n::::`;
const rule = (id: string, direction: 'vertical' | 'horizontal', placement: { anchor: ElementAnchor; size?: unknown; offset?: unknown }) =>
  ({ kind: 'rule', id, direction, thickness: THICK, color: ink, placement }) as DesignElement;
const withDecoration = (...elements: DesignElement[]): PageTemplate => ({ ...family, decoration: { elements } });
const cx = (r: { x: number; width: number }) => r.x + r.width / 2;
const cy = (r: { y: number; height: number }) => r.y + r.height / 2;

describe('decoration at a point of a frame’s side (#1055)', () => {
  it('a vertical rule runs from the centre of one frame’s foot to the centre of another’s head, following both', () => {
    const t = withDecoration(rule('link', 'vertical', { anchor: { to: '#left', edge: 'below', at: 'center' }, size: { height: { to: '#under', edge: 'top' } } }));
    const tops: number[] = [];
    for (const n of [20, 300]) {
      const doc = build(page(n), [t]);
      const left = frame(doc, 'left').rect;
      const under = frame(doc, 'under').rect;
      const link = deco(doc, 'link').bbox;
      // Both frames are centred on x = 25 mm of the area: the rule's
      // thickness straddles the middle of the left child's foot and runs
      // down to the head of the frame under it, at its middle.
      expect(cx(link)).toBeCloseTo(cx(left), 3);
      expect(cx(link)).toBeCloseTo(cx(under), 3);
      expect(link.y).toBeCloseTo(left.y + left.height, 3);
      expect(link.y + link.height).toBeCloseTo(under.y, 3);
      tops.push(link.y);
    }
    // The parent's text grew: the group moved both frames, the rule with them.
    expect(tops[1]!).toBeGreaterThan(tops[0]! + 100);
  });

  it('a tree of three rules joins a parent to two children by their centres, before and after the parent grows', () => {
    const t = withDecoration(
      // The trunk from the middle of the parent's foot down to the
      // children's vertical middle; an arm from the middle of each child's
      // facing side to the trunk.
      rule('trunk', 'vertical', { anchor: { to: '#parent', edge: 'below', at: 'center' }, size: { height: { to: '#left', edge: 'center' } } }),
      rule('leftArm', 'horizontal', { anchor: { to: '#left', edge: 'right-of', at: 'center' }, size: { width: { to: '#trunk', edge: 'right' } } }),
      rule('rightArm', 'horizontal', { anchor: { to: '#right', edge: 'left-of', at: 0.5 }, size: { width: { to: '#trunk', edge: 'left' } } }),
    );
    const feet: number[] = [];
    for (const n of [20, 300]) {
      const doc = build(page(n), [t]);
      const parent = frame(doc, 'parent').rect;
      const left = frame(doc, 'left').rect;
      const right = frame(doc, 'right').rect;
      const trunk = deco(doc, 'trunk').bbox;
      const leftArm = deco(doc, 'leftArm').bbox;
      const rightArm = deco(doc, 'rightArm').bbox;
      expect(cx(trunk)).toBeCloseTo(cx(parent), 3);
      expect(trunk.y).toBeCloseTo(parent.y + parent.height, 3);
      expect(trunk.y + trunk.height).toBeCloseTo(cy(left), 3);
      // Each arm on its child's side middle, reaching the trunk's far side.
      expect(leftArm.x).toBeCloseTo(left.x + left.width, 3);
      expect(cy(leftArm)).toBeCloseTo(cy(left), 3);
      expect(leftArm.x + leftArm.width).toBeCloseTo(trunk.x + trunk.width, 3);
      expect(rightArm.x + rightArm.width).toBeCloseTo(right.x, 3);
      expect(cy(rightArm)).toBeCloseTo(cy(right), 3);
      expect(rightArm.x).toBeCloseTo(trunk.x, 3);
      feet.push(trunk.y);
    }
    expect(feet[1]!).toBeGreaterThan(feet[0]! + 100);
  });

  it('a size runs to the middle of a box on either axis', () => {
    const t = withDecoration(
      rule('toMiddle', 'horizontal', { anchor: { to: 'container', edge: 'top-left' }, size: { width: { to: '#parent', edge: 'center' } } }),
      rule('down', 'vertical', { anchor: { to: 'container', edge: 'top-left' }, size: { height: { to: '#parent', edge: 'center' } } }),
    );
    const doc = build(page(20), [t]);
    const area = composedPage(doc).contentArea;
    const parent = frame(doc, 'parent').rect;
    expect(deco(doc, 'toMiddle').bbox.width).toBeCloseTo(cx(parent) - area.x, 3);
    expect(deco(doc, 'down').bbox.height).toBeCloseTo(cy(parent) - area.y, 3);
  });
});

describe('the point along a side, laid out (#1055)', () => {
  const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
  const placeholders: DesignPlaceholderContext = { kind: 'header', page: stubPage, allPages: [stubPage], metadata: {}, chapterTitleByPageIndex: [] };
  const card = { x: 100, y: 50, width: 200, height: 80 };
  const sheet = { x: 0, y: 0, width: 400, height: 200 };
  /** Where a 10 × 4 px box anchored to `#card` (a frame) at `anchor`
   *  stands. */
  const at = (anchor: Omit<ElementAnchor, 'to'> & { to?: ElementAnchor['to'] }, startRight = false) => {
    const prim = layoutDesignSlot(
      resolveDesignSlot({ elements: [{ kind: 'box', id: 'b', style: {}, placement: { anchor: { to: '#card', ...anchor }, size: { width: { value: 10, unit: 'px' }, height: { value: 4, unit: 'px' } } } } as DesignElement] }),
      { container: sheet, dpi: 96, placeholders, frames: { page: sheet, bleed: sheet, named: { card } }, startRight },
      0,
    ).primitives[0]!;
    return { x: prim.x, y: prim.y };
  };

  it('moves the point along the side, centring the element on it and keeping the pin across it', () => {
    // `below`: hangs under the foot.
    expect(at({ edge: 'below', at: 'start' })).toEqual({ x: 95, y: 130 });
    expect(at({ edge: 'below', at: 0.25 })).toEqual({ x: 145, y: 130 });
    expect(at({ edge: 'below', at: 'end' })).toEqual({ x: 295, y: 130 });
    // `bottom` (and its corners, read as the side) stands inside, on the foot.
    expect(at({ edge: 'bottom-left', at: 'center' })).toEqual({ x: 195, y: 126 });
    // A vertical side runs from its top.
    expect(at({ edge: 'right-of', at: 'center' })).toEqual({ x: 300, y: 88 });
    expect(at({ edge: 'left', at: 1 })).toEqual({ x: 100, y: 128 });
  });

  it('starts a horizontal side on the right of a page that starts there', () => {
    expect(at({ edge: 'top', at: 'start' }, true)).toEqual({ x: 295, y: 50 });
    expect(at({ edge: 'top-start', at: 0.25 }, true)).toEqual({ x: 245, y: 50 });
    // A vertical side still runs from its top.
    expect(at({ edge: 'end', at: 'start' }, true)).toEqual({ x: 100, y: 48 });
  });

  it('leaves the edge’s own point without `at`, on `center`, and on the container or the page', () => {
    expect(at({ edge: 'below' })).toEqual({ x: 100, y: 130 });
    expect(at({ edge: 'center', at: 'start' })).toEqual(at({ edge: 'center' }));
    expect(at({ to: 'page', edge: 'bottom', at: 'start' })).toEqual({ x: 195, y: 196 });
    expect(at({ to: 'container', edge: 'top', at: 'end' })).toEqual({ x: 195, y: 0 });
    // A word that is no side position is ignored; a number is held in 0…1.
    expect(at({ edge: 'below', at: 'middle' as never })).toEqual({ x: 100, y: 130 });
    expect(at({ edge: 'below', at: 2 })).toEqual({ x: 295, y: 130 });
  });
});

describe('side positions in the config warnings (#1055)', () => {
  it('reports an `at` outside its choices or outside 0…1, and a size edge that names no edge', () => {
    const warnings = collectConfigWarnings({
      header: { elements: [
        rule('a', 'horizontal', { anchor: { to: '#b', edge: 'below', at: 'middle' as never } }),
        rule('b', 'horizontal', { anchor: { to: '#a', edge: 'below', at: 1.5 }, size: { width: { to: '#a', edge: 'middle' } } }),
        rule('c', 'horizontal', { anchor: { to: '#a', edge: 'below', at: 0.3 }, size: { width: { to: '#a', edge: 'center' } } }),
      ] },
    }).filter((w) => w.kind === 'unknownConfigValue');
    expect(warnings.map((w) => [w.path, w.value, w.used])).toEqual([
      ['header.elements[0].placement.anchor.at', 'middle', ''],
      ['header.elements[1].placement.anchor.at', '1.5', '1'],
      ['header.elements[1].placement.size.width.edge', 'middle', 'fill'],
    ]);
  });
});
