import { describe, it, expect } from 'vitest';
import type { VDTDieCut, VDTDocument, VDTPage, VDTPathCommand } from '../vdt.js';
import { drawsThrough, inertCopy, throughLayerHtml } from './through.js';
import { buildDocument } from '../pipeline/index.js';
import { renderToHtmlIndexed } from './render.js';
import type { PageTemplate } from '../composed/types.js';
import type { PostextConfig } from '../types.js';

// The pages beneath a die-cut page in the HTML viewer (#1567): a layer over
// the page, clipped to its holes, with an inert copy of each page seen.

const rect = (x: number, y: number, w: number, h: number): VDTPathCommand[] => [
  { op: 'M', x, y }, { op: 'L', x: x + w, y }, { op: 'L', x: x + w, y: y + h }, { op: 'L', x, y: y + h }, { op: 'Z' },
];
const cut = (...holes: VDTPathCommand[][]): VDTDieCut => ({ holes, sources: holes.map(() => 'd'), wrapGapPx: holes.map(() => 0) });
const docOf = (pages: { cut?: VDTDieCut; composed?: boolean }[]) => ({
  pageIndexOffset: 0,
  pages: pages.map((p, index) => ({ index, width: 400, height: 600, ...(p.cut ? { dieCut: p.cut } : {}), ...(p.composed !== false ? { composed: { frames: [] } } : {}) }) as unknown as VDTPage),
}) as unknown as VDTDocument;
const source = { inner: (j: number) => `<div class="pt-block" data-block-id="b${j}" id="x${j}">page ${j}</div>`, paper: () => '#fffdf8' };

describe('drawsThrough', () => {
  it('draws on a print-leaf page with holes over print-leaf pages', () => {
    const doc = docOf([{ cut: cut(rect(10, 10, 50, 50)) }, {}, {}]);
    expect(drawsThrough(doc, 0)).toBe(true);
    expect(drawsThrough(doc, 1)).toBe(false);
  });
  it('not on a flowing page (a screen relayout), nor over one', () => {
    expect(drawsThrough(docOf([{ cut: cut(rect(10, 10, 50, 50)), composed: false }, {}, {}]), 0)).toBe(false);
    expect(drawsThrough(docOf([{ cut: cut(rect(10, 10, 50, 50)) }, {}, { composed: false }]), 0)).toBe(false);
  });
});

describe('inertCopy', () => {
  it('drops data attributes and suffixes ids and the references to them', () => {
    const html = '<div class="pt-block" data-block-id="a" id="p1"><svg><filter id="f"/><g filter="url(#f)"/></svg><a href="#p1">x</a></div>';
    const out = inertCopy(html, '-s');
    expect(out).not.toContain('data-block-id');
    expect(out).toContain('id="p1-s"');
    expect(out).toContain('id="f-s"');
    expect(out).toContain('url(#f-s)');
    expect(out).toContain('href="#p1-s"');
  });
});

describe('throughLayerHtml', () => {
  it('copies the page beneath into the hole, inert, with the cut edge', () => {
    const doc = docOf([{ cut: cut(rect(10, 10, 50, 50)) }, {}, {}]);
    const html = throughLayerHtml(doc, 0, source, 'pt-p-0');
    expect(html).toMatch(/^<div class="pt-through" aria-hidden="true" inert /);
    expect(html).toContain("clip-path:path(nonzero,'M10 10L60 10L60 60L10 60Z')");
    expect(html).toContain('page 2');
    expect(html).not.toContain('page 1');
    expect(html).not.toContain('data-block-id');
    expect(html).toContain('id="x2-pt-p-0-t0"');
    expect(html).toContain('background:#fffdf8');
    expect(html).toContain('<filter id="pt-p-0-cut-shade"');
  });
  it('goes as deep as the holes line up, the deepest first, the board at the end', () => {
    // A tunnel: pages 0, 2 and 4 cut alike, a book of five pages.
    const hole = rect(100, 100, 200, 200);
    const doc = docOf([{ cut: cut(hole) }, {}, { cut: cut(hole) }, {}, { cut: cut(hole) }]);
    const html = throughLayerHtml(doc, 0, source, 'p');
    expect(html.indexOf('background:#3b3833')).toBeGreaterThan(-1);
    // The board, under page 4, under page 2.
    expect(html.indexOf('#3b3833')).toBeLessThan(html.indexOf('page 4'));
    expect(html.indexOf('page 4')).toBeLessThan(html.indexOf('page 2'));
    // Each page beneath is cut by its own hole (an even-odd clip).
    expect(html.match(/clip-path:path\(evenodd/g)).toHaveLength(2);
  });
  it('is empty for a page that draws nothing through', () => {
    expect(throughLayerHtml(docOf([{}, {}]), 0, source, 'p')).toBe('');
  });
});

describe('renderToHtmlIndexed on a composed page with a hole', () => {
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
  const t = {
    id: 'cut',
    frames: [{ name: 'body', grid: { col: 1, row: 1 } }],
    decoration: {
      elements: [{
        kind: 'cut', id: 'window', die: 'win',
        placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: pt(60), y: pt(60) }, size: { width: pt(80), height: pt(40) } },
      }],
    },
  } as unknown as PageTemplate;
  const config = {
    page: { width: pt(360), height: pt(480), dpi: 72, margins: { top: pt(36), bottom: pt(36), left: pt(36), right: pt(36) } },
    layout: { layoutType: 'single' },
    pageTemplates: [t],
    dieCuts: { shapes: [{ id: 'win', shape: 'rect', x: pt(0), y: pt(0), width: pt(1), height: pt(1), leaves: 1 }] },
  } as unknown as PostextConfig;
  const pages = ['One', 'Two', 'Three', 'Four'].map((w) => `::::page{template="cut"}\n:::frame{slot="body"}\n${w}\n:::\n::::`).join('\n\n');
  const doc = buildDocument({ markdown: pages }, config);

  it('draws the page beneath in the hole, and the page keeps its holes in its clip', () => {
    // Every page has the window and its leaf mate's, mirrored.
    expect(doc.pages.every((p) => p.composed && p.dieCut?.holes.length === 2)).toBe(true);
    expect(drawsThrough(doc, 0)).toBe(true);
    const out = renderToHtmlIndexed(doc);
    const page = out.pages[0]!;
    expect(page.innerHtml).toContain('class="pt-through"');
    expect(page.decorationHtml).toContain('class="pt-through"');
    const layer = page.innerHtml.slice(page.innerHtml.indexOf('class="pt-through"'));
    // Page 0, a recto, shows page 2 (Three), never its own verso.
    expect(layer).toContain('Three');
    expect(layer).not.toContain('Two');
    expect(layer).not.toContain('data-block-id');
    // The page is not cut where the layer covers it (no outline: no clip).
    const first = out.html.slice(out.html.indexOf('class="pt-page"'), out.html.indexOf('>', out.html.indexOf('class="pt-page"')));
    expect(first).not.toContain('clip-path');
  });
});
