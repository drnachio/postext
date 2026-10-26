import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { collectConfigWarnings } from '../../../checks/configWarnings.js';
import { validatePageTemplates } from '../../../composed/validate.js';
import { composedReflowLog } from '../../../composed/reflowLog.js';
import { sourceAt } from '../../../composed/sourceMap.js';
import { renderToHtmlIndexed } from '../../../html-backend/html-backend.js';
import { flowRectToPage, type VDTDesignPathBlock, type VDTPathCommand } from '../../../vdt.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { DesignConnectorElement, PostextConfig, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';
import { CONNECTOR_CONFIG, mm, orgPage, timelinePage, treePage, TREE_TEMPLATE, type FixtureLocale } from '../fixtures/connectors.js';
import { CAPTIONS, GRID_CONFIG, GRID_RESOURCES, photoPage, PHOTO_TEMPLATE } from '../fixtures/grid.js';

// #1056 (DESIGN §12.3): connectors in a template's decoration, laid between
// the frames' final boxes.

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

const MM = 300 / 25.4;
const build = (markdown: string, config: Partial<PostextConfig> = {}): VDTDocument =>
  buildDocument({ markdown }, { ...CONNECTOR_CONFIG, ...config }, createMeasurementCache());
const composedPage = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const frameOf = (page: VDTPage, name: string): VDTFrame => page.composed!.frames.find((f) => f.name === name)!;
/** A frame's box on the sheet. */
const box = (page: VDTPage, name: string) => flowRectToPage(page, frameOf(page, name).rect);
const pathOf = (page: VDTPage, id: string): VDTDesignPathBlock => {
  const b = page.composed!.decoration!.blocks.find((x) => x.elementId === id);
  expect(b?.kind).toBe('path');
  return b as VDTDesignPathBlock;
};
/** Every point of a path (ends of segments, not control points). */
const points = (b: VDTDesignPathBlock): { x: number; y: number }[] =>
  b.subpaths.flat().filter((c): c is Extract<VDTPathCommand, { x: number }> => c.op !== 'Z').map((c) => ({ x: c.x, y: c.y }));
const subpathEnds = (b: VDTDesignPathBlock) => b.subpaths.map((sp) => {
  const pts = sp.filter((c): c is Extract<VDTPathCommand, { x: number }> => c.op !== 'Z');
  return { first: { x: pts[0]!.x, y: pts[0]!.y }, last: { x: pts[pts.length - 1]!.x, y: pts[pts.length - 1]!.y } };
});
const cx = (r: { x: number; width: number }) => r.x + r.width / 2;
const cy = (r: { y: number; height: number }) => r.y + r.height / 2;
/** Whether some point of `b` lies at `(x, y)`, within `tol` px. */
const touches = (b: VDTDesignPathBlock, x: number, y: number, tol = 0.5) => points(b).some((p) => Math.abs(p.x - x) < tol && Math.abs(p.y - y) < tol);

/** A tree joins its parent's foot to each child's head. */
function expectJoined(page: VDTPage, id: string, parent: string, children: readonly string[], arrowInset = 0): void {
  const tree = pathOf(page, id);
  const p = box(page, parent);
  expect(touches(tree, cx(p), p.y + p.height)).toBe(true);
  for (const c of children) {
    const r = box(page, c);
    // The drop reaches the child's head at its middle (or stops inside an
    // arrowhead just above it).
    expect(points(tree).some((q) => Math.abs(q.x - cx(r)) < 0.5 && q.y <= r.y + 0.5 && q.y >= r.y - arrowInset - 0.5)).toBe(true);
  }
}

describe('a three-level tree (#1056)', () => {
  it('joins the root to its children and each child to its two grandchildren', () => {
    const page = composedPage(build(treePage('en')));
    expectJoined(page, 'ramas', 'raiz', ['a', 'b']);
    expectJoined(page, 'ramasA', 'a', ['a1', 'a2'], 4 * MM);
    expectJoined(page, 'ramasB', 'b', ['b1', 'b2'], 4 * MM);
    const tree = pathOf(page, 'ramas');
    // The bar runs halfway between the root's foot and the children's heads.
    const root = box(page, 'raiz');
    const a = box(page, 'a');
    const barY = (root.y + root.height + a.y) / 2;
    expect(points(tree).filter((q) => Math.abs(q.y - barY) < 0.5).length).toBeGreaterThanOrEqual(2);
    // Rounded bends: the outer drops meet the bar with curves.
    expect(tree.subpaths.flat().some((c) => c.op === 'C')).toBe(true);
    // Palette-linked colour, the width in px, painted as decoration.
    expect(tree.stroke).toMatchObject({ color: '#2a6f97' });
    expect(tree.stroke!.widthPx).toBeCloseTo((1.25 / 72) * 300, 3);
    expect(tree.configPath).toBe('/pageTemplates/0/decoration/elements/0');
    // Arrowheads at the grandchildren, pointing down.
    const arrows = pathOf(page, 'ramasA').markers!;
    expect(arrows).toHaveLength(2);
    for (const m of arrows) {
      expect(m.kind).toBe('arrow');
      expect(m.angle).toBeCloseTo(Math.PI / 2, 5);
    }
  });

  it('stays joined in Spanish and Catalan, where a node wraps to two lines', () => {
    const en = composedPage(build(treePage('en')));
    for (const locale of ['es', 'ca'] as FixtureLocale[]) {
      const page = composedPage(build(treePage(locale)));
      // A grandchild of the second branch is two lines tall in this edition.
      expect(box(page, 'b2').height).toBeGreaterThan(box(en, 'b2').height + 2 * MM);
      expectJoined(page, 'ramas', 'raiz', ['a', 'b']);
      expectJoined(page, 'ramasA', 'a', ['a1', 'a2'], 4 * MM);
      expectJoined(page, 'ramasB', 'b', ['b1', 'b2'], 4 * MM);
    }
  });

  it('follows a node that grows: the root\'s words push its children and the lines with them', () => {
    const long = treePage('en').replace('The heron', 'The grey heron, which stands still in the shallow water for hours before it strikes at a fish, a frog or a beetle that comes too close to its long legs');
    const page = composedPage(build(long));
    const short = composedPage(build(treePage('en')));
    expect(box(page, 'a').y).toBeGreaterThan(box(short, 'a').y + 2 * MM);
    expectJoined(page, 'ramas', 'raiz', ['a', 'b']);
  });

  it('recolours with a part palette', () => {
    const md = `:::part{palette="tinta=#aa3355"}\n# Part\n:::\n\n${treePage('en')}`;
    const page = composedPage(build(md));
    expect(pathOf(page, 'ramas').stroke!.color.toLowerCase()).toBe('#aa3355');
  });
});

describe('an org chart with two trees (#1056)', () => {
  it('draws the head over two departments and one department over three teachers, dots at the ends', () => {
    for (const locale of ['en', 'es', 'ca'] as FixtureLocale[]) {
      const page = composedPage(build(orgPage(locale)));
      expectJoined(page, 'mando', 'jefe', ['dptoA', 'dptoB']);
      expectJoined(page, 'claustro', 'dptoB', ['p1', 'p2', 'p3'], 4 * MM);
      const mando = pathOf(page, 'mando');
      // A dot on the head's foot and on each department's head.
      expect(mando.markers!.map((m) => m.kind)).toEqual(['dot', 'dot', 'dot']);
      // The second tree: the parent stands right of its first child, so the
      // bar runs from the first teacher to the last; the middle one drops.
      const claustro = pathOf(page, 'claustro');
      expect(claustro.subpaths.length).toBe(3);
    }
  });
});

describe('a timeline bar with drops (#1056)', () => {
  it('drops straight from the bar\'s foot to each pill, a dot at each head, dashed', () => {
    const page = composedPage(build(timelinePage('en')));
    const bar = box(page, 'barra');
    const hitos = pathOf(page, 'hitos');
    expect(hitos.subpaths).toHaveLength(4);
    for (const [k, end] of subpathEnds(hitos).entries()) {
      const pill = box(page, `e${k + 1}`);
      expect(end.first.y).toBeCloseTo(bar.y + bar.height, 3);
      expect(end.first.x).toBeCloseTo(cx(pill), 3);
      expect(end.last.y).toBeCloseTo(pill.y, 3);
      expect(end.last.x).toBeCloseTo(cx(pill), 3);
    }
    expect(hitos.markers!.map((m) => m.kind)).toEqual(['dot', 'dot', 'dot', 'dot']);
    expect(hitos.stroke!.dash!.length).toBe(2);
  });
});

describe('connector routings and ends (#1056)', () => {
  const two: PageTemplate = {
    id: 'dos',
    header: false,
    frames: [
      { name: 'izq', width: mm(40), height: mm(20), placement: { anchor: { to: 'container', edge: 'top-left' } } },
      { name: 'der', width: mm(40), height: mm(20), placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(100), y: mm(60) } } },
      { name: 'opcional', optional: true, width: mm(40), height: mm(20), placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(100), y: mm(120) } } },
    ],
  };
  const md = '::::page{template="dos"}\n:::frame{slot="izq"}\nLeft\n:::\n:::frame{slot="der"}\nRight\n:::\n::::\n';
  const withConnector = (c: Partial<DesignConnectorElement>, extra: Partial<PostextConfig> = {}): VDTPage => {
    const t: PageTemplate = { ...two, decoration: { elements: [{ kind: 'connector', id: 'c', from: { to: '#izq' }, to: { to: '#der' }, ...c } as DesignConnectorElement] } };
    return composedPage(build(md, { pageTemplates: [t], ...extra }));
  };

  it('elbow (default): right side to left side, the middle run halfway', () => {
    const page = withConnector({});
    const a = box(page, 'izq');
    const b = box(page, 'der');
    const pts = points(pathOf(page, 'c'));
    const midX = (a.x + a.width + b.x) / 2;
    expect(pts).toHaveLength(4);
    expect(pts[0]).toEqual({ x: a.x + a.width, y: cy(a) });
    expect(pts[1]!.x).toBeCloseTo(midX, 3);
    expect(pts[2]!.x).toBeCloseTo(midX, 3);
    expect(pts[3]).toEqual({ x: b.x, y: cy(b) });
  });

  it('straight, with a gap at both ends and an arrow at the end', () => {
    const page = withConnector({ routing: 'straight', from: { to: '#izq', gap: mm(2) }, to: { to: '#der', gap: mm(2) }, endCap: 'arrow' });
    const a = box(page, 'izq');
    const b = box(page, 'der');
    const path = pathOf(page, 'c');
    const pts = points(path);
    expect(pts).toHaveLength(2);
    expect(pts[0]!.x).toBeCloseTo(a.x + a.width + 2 * MM, 3);
    const arrow = path.markers![0]!;
    expect(arrow.x).toBeCloseTo(b.x - 2 * MM, 3);
    // The line stops inside the head.
    expect(pts[1]!.x).toBeLessThan(arrow.x);
    // capSize defaults to three line widths.
    expect(arrow.sizePx).toBeCloseTo(3 * (0.75 / 72) * 300, 3);
  });

  it('an L between a foot and a side, a point along the side, rounded', () => {
    const page = withConnector({ from: { to: '#izq', side: 'bottom', at: 0.25 }, to: { to: '#der', side: 'left' }, radius: mm(3) });
    const a = box(page, 'izq');
    const b = box(page, 'der');
    const path = pathOf(page, 'c');
    const ends = subpathEnds(path)[0]!;
    expect(ends.first).toEqual({ x: a.x + 0.25 * a.width, y: a.y + a.height });
    expect(ends.last).toEqual({ x: b.x, y: cy(b) });
    expect(path.subpaths[0]!.filter((c) => c.op === 'C')).toHaveLength(1);
    expect(path.stroke!.join).toBe('round');
  });

  it('drops an end on an empty optional frame and says so in the reflow log', () => {
    const page = withConnector({ to: [{ to: '#der' }, { to: '#opcional' }] });
    const path = pathOf(page, 'c');
    expect(path.subpaths).toHaveLength(1);
    const events = page.composed!.log.filter((e) => e.kind === 'connectorDropped');
    expect(events).toEqual([{ frame: 'opcional', kind: 'connectorDropped', cause: 'c' }]);
    const doc = build(md, { pageTemplates: [{ ...two, decoration: { elements: [{ kind: 'connector', id: 'c', from: { to: '#izq' }, to: [{ to: '#der' }, { to: '#opcional' }] } as DesignConnectorElement] } }] });
    expect(composedReflowLog(doc)[0]!.lines).toContain('connector c left out opcional (not on the page)');
  });

  it('draws nothing when its only other end is dropped', () => {
    const page = withConnector({ to: { to: '#opcional' } });
    expect(page.composed!.decoration?.blocks.some((b) => b.elementId === 'c') ?? false).toBe(false);
    expect(page.composed!.log.filter((e) => e.kind === 'connectorDropped')).toHaveLength(1);
  });

  it('pin reads the frames as the template declares them', () => {
    const grow: PageTemplate = {
      id: 'g',
      header: false,
      frames: [
        { name: 'top', width: mm(60), minHeight: mm(20) },
        { name: 'low', width: mm(60), minHeight: mm(20) },
      ],
      groups: [{ name: 'pila', gap: mm(10), frames: ['top', 'low'] }],
      decoration: {
        elements: [
          { kind: 'connector', id: 'live', routing: 'straight', from: { to: '#top' }, to: { to: '#low' } },
          { kind: 'connector', id: 'pinned', pin: true, routing: 'straight', from: { to: '#top' }, to: { to: '#low' } },
        ],
      },
    };
    const words = Array.from({ length: 120 }, (_, i) => `w${i}`).join(' ');
    const page = composedPage(build(`::::page{template="g"}\n:::frame{slot="top"}\n${words}\n:::\n:::frame{slot="low"}\nLow\n:::\n::::\n`, { pageTemplates: [grow] }));
    const live = subpathEnds(pathOf(page, 'live'))[0]!;
    const pinned = subpathEnds(pathOf(page, 'pinned'))[0]!;
    expect(live.last.y).toBeCloseTo(box(page, 'low').y, 3);
    const declared = frameOf(page, 'low').declaredRect!;
    expect(pinned.last.y).toBeCloseTo(declared.y, 3);
    expect(pinned.last.y).toBeLessThan(live.last.y - 10);
  });

  it('on a right-to-left page reads start and end as the flow does and follows the mirrored frames', () => {
    const page = withConnector({ routing: 'straight', from: { to: '#izq', side: 'end' }, to: { to: '#der', side: 'start' } }, { direction: 'rtl' } as Partial<PostextConfig>);
    const a = box(page, 'izq');
    const b = box(page, 'der');
    // The frames are mirrored: `izq` stands at the flow's start, the right.
    expect(a.x).toBeGreaterThan(b.x);
    const ends = subpathEnds(pathOf(page, 'c'))[0]!;
    // `end` of a right-to-left page is its left side; `start` its right.
    expect(ends.first).toEqual({ x: a.x, y: cy(a) });
    expect(ends.last).toEqual({ x: b.x + b.width, y: cy(b) });
    // Defaults face the other end: the same line.
    const auto = subpathEnds(pathOf(withConnector({ routing: 'straight' }, { direction: 'rtl' } as Partial<PostextConfig>), 'c'))[0]!;
    expect(auto).toEqual(ends);
  });

  it('answers the source map on its ink with its config path, never over a frame', () => {
    const doc = build(md, { pageTemplates: [{ ...two, decoration: { elements: [{ kind: 'connector', id: 'c', from: { to: '#izq' }, to: { to: '#der' } } as DesignConnectorElement] } }] });
    const page = composedPage(doc);
    const pts = points(pathOf(page, 'c'));
    // On the middle run, off every frame.
    const p = { x: pts[1]!.x, y: (pts[1]!.y + pts[2]!.y) / 2 };
    const chain = sourceAt(doc, page.index, p.x, p.y);
    expect(chain.some((e) => (e.source as { path?: string } | undefined)?.path === '/pageTemplates/0/decoration/elements/0')).toBe(true);
    // Beside the line, in the empty corner of the elbow: not the connector.
    const off = sourceAt(doc, page.index, p.x - 5 * MM, p.y);
    expect(off.some((e) => (e.source as { path?: string } | undefined)?.path === '/pageTemplates/0/decoration/elements/0')).toBe(false);
    // Over a frame, the frame answers.
    const a = box(page, 'izq');
    const over = sourceAt(doc, page.index, a.x + a.width - 1, cy(a));
    expect(over.some((e) => (e.source as { path?: string } | undefined)?.path === '/pageTemplates/0/decoration/elements/0')).toBe(false);
  });

  it('paints in HTML as an inline SVG of the decoration', () => {
    const doc = build(md, { pageTemplates: [{ ...two, decoration: { elements: [{ kind: 'connector', id: 'c', from: { to: '#izq' }, to: { to: '#der' } } as DesignConnectorElement] } }] });
    const html = renderToHtmlIndexed(doc);
    expect(JSON.stringify(html)).toContain('<svg');
  });
});

describe('a tree to every card of a grid (#1056)', () => {
  it('expands #foto[*] to the instances the page has, in item order', () => {
    const t: PageTemplate = {
      ...PHOTO_TEMPLATE,
      decoration: { elements: [{ kind: 'connector', id: 'a-todas', routing: 'tree', from: { to: '#titulo' }, to: [{ to: '#foto[*]' }, { to: '#foto[9]' }] } as DesignConnectorElement] },
    };
    const doc = buildDocument({ markdown: photoPage('River animals', CAPTIONS.en.slice(0, 3)), resources: GRID_RESOURCES }, { ...GRID_CONFIG, pageTemplates: [t] }, createMeasurementCache());
    const page = composedPage(doc);
    const tree = pathOf(page, 'a-todas');
    for (const k of [1, 2, 3]) {
      const r = box(page, `foto[${k}]`);
      expect(touches(tree, cx(r), r.y)).toBe(true);
    }
    // `#foto[9]`: no ninth card on this page.
    expect(page.composed!.log.filter((e) => e.kind === 'connectorDropped').map((e) => e.frame)).toEqual(['foto[9]']);
  });
});

describe('a connector across the spine of a spread (#1056)', () => {
  it('is laid on the sheet and cut for each page', () => {
    const t: PageTemplate = {
      id: 'pliego',
      spread: true,
      gutter: mm(10),
      header: false,
      frames: [
        { name: 'izq', width: mm(40), height: mm(20), placement: { anchor: { to: 'container', edge: 'top-left' } } },
        { name: 'der', width: mm(40), height: mm(20), placement: { anchor: { to: 'container', edge: 'top-right' }, offset: { y: mm(40) } } },
      ],
      decoration: { elements: [{ kind: 'connector', id: 'puente', from: { to: '#izq' }, to: { to: '#der' }, endCap: 'arrow' } as DesignConnectorElement] },
    };
    const md = '::::page{template="pliego" spread}\n:::frame{slot="izq"}\nLeft\n:::\n:::frame{slot="der"}\nRight\n:::\n::::\n\nAfter.';
    const doc = build(md, { pageTemplates: [t] });
    const [verso, recto] = doc.pages.filter((p) => p.composed?.spread) as [VDTPage, VDTPage];
    const left = pathOf(verso, 'puente');
    const right = pathOf(recto, 'puente');
    const W = verso.width;
    // The same line on both pages, the recto's moved back by a page width.
    expect(right.subpaths[0]![0]).toMatchObject({ x: (left.subpaths[0]![0] as { x: number }).x - W });
    const a = box(verso, 'izq');
    const b = box(recto, 'der');
    expect(subpathEnds(left)[0]!.first).toEqual({ x: a.x + a.width, y: cy(a) });
    // The arrow on the recto, at the right frame's left side.
    expect(right.markers![0]!.x).toBeCloseTo(b.x, 3);
    // The middle run crosses the spine.
    const mid = points(left)[1]!.x;
    expect(mid).toBeGreaterThan(W - 30 * MM);
    expect(mid).toBeLessThan(W + 30 * MM);
  });
});

describe('connector validation (#1056)', () => {
  it('frameAnchorUnknown for an end on nothing, the rest drawn', () => {
    const t: PageTemplate = {
      ...TREE_TEMPLATE,
      decoration: { elements: [{ kind: 'connector', id: 'x', routing: 'tree', from: { to: '#raiz' }, to: [{ to: '#a' }, { to: '#nadie' }] } as DesignConnectorElement] },
    };
    const warnings = validatePageTemplates({ ...CONNECTOR_CONFIG, pageTemplates: [t] } as PostextConfig);
    expect(warnings.filter((w) => w.kind === 'frameAnchorUnknown').map((w) => w.path)).toEqual(['/pageTemplates/0/decoration/elements/0/to/1/to']);
    const page = composedPage(build(treePage('en'), { pageTemplates: [t] }));
    expectJoined(page, 'x', 'raiz', ['a']);
    const bad: PageTemplate = { ...TREE_TEMPLATE, decoration: { elements: [{ kind: 'connector', id: 'y', from: { to: '#nadie' }, to: { to: '#a' } } as DesignConnectorElement] } };
    expect(validatePageTemplates({ ...CONNECTOR_CONFIG, pageTemplates: [bad] } as PostextConfig).filter((w) => w.kind === 'frameAnchorUnknown').map((w) => w.path)).toEqual(['/pageTemplates/0/decoration/elements/0/from/to']);
    expect(composedPage(build(treePage('en'), { pageTemplates: [bad] })).composed!.decoration?.blocks.some((b) => b.elementId === 'y') ?? false).toBe(false);
  });

  it('unknownConfigValue for routing, caps, side and at, and for a connector outside a decoration', () => {
    const t: PageTemplate = {
      ...TREE_TEMPLATE,
      decoration: { elements: [{ kind: 'connector', id: 'x', routing: 'curvy', startCap: 'star', endCap: 'arow', from: { to: '#raiz', side: 'middle', at: 1.5 }, to: [{ to: '#a', at: 'centre' }] } as unknown as DesignConnectorElement] },
    };
    const warnings = collectConfigWarnings({ ...CONNECTOR_CONFIG, pageTemplates: [t], header: { elements: [{ kind: 'connector', id: 'h', from: { to: '#a' }, to: { to: '#b' } }] } } as PostextConfig)
      .filter((w) => w.kind === 'unknownConfigValue');
    const byPath = Object.fromEntries(warnings.map((w) => [w.path, w]));
    expect(byPath['pageTemplates[0].decoration.elements[0].routing']).toMatchObject({ value: 'curvy', used: 'elbow' });
    expect(byPath['pageTemplates[0].decoration.elements[0].startCap']).toMatchObject({ value: 'star', used: 'none' });
    expect(byPath['pageTemplates[0].decoration.elements[0].endCap']).toMatchObject({ value: 'arow', suggestion: 'arrow' });
    expect(byPath['pageTemplates[0].decoration.elements[0].from.side']).toMatchObject({ value: 'middle' });
    expect(byPath['pageTemplates[0].decoration.elements[0].from.at']).toMatchObject({ value: '1.5', used: '1' });
    expect(byPath['pageTemplates[0].decoration.elements[0].to[0].at']).toMatchObject({ value: 'centre', suggestion: 'center' });
    expect(byPath['header.elements[0].kind']).toMatchObject({ value: 'connector', used: '' });
  });
});
