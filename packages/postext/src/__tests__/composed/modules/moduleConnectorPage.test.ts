import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { validatePageTemplates } from '../../../composed/validate.js';
import { flowRectToPage, type VDTDesignPathBlock, type VDTPathCommand } from '../../../vdt.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { DesignConnectorElement, PostextConfig, VDTDocument, VDTPage } from '../../../index.js';
import { CONNECTOR_CONFIG, mm } from '../fixtures/connectors.js';

// #1069: a module's connector may end on a frame of the page that stacks
// the module, an org chart's head joined to each department the page
// stacks under it. The module does not know the page, so validation keeps
// the end and the layout draws it when the page has that frame.

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

const chart: PageTemplate = {
  id: 'organigrama',
  header: false,
  frames: [{ name: 'jefe', style: 'nodo', width: mm(60), placement: { anchor: { to: 'container', edge: 'top-left' } } }],
  groups: [{ name: 'areas', modules: true, gap: mm(8), placement: { anchor: { to: '#jefe', edge: 'below' }, offset: { x: mm(12), y: mm(10) }, size: { width: 'fill', height: 'fill' } } }],
};
const branch: PageTemplate = {
  id: 'rama',
  role: 'module',
  frames: [{ name: 'area', style: 'hoja', width: mm(50), placement: { anchor: { to: 'container', edge: 'top-left' } } }],
  decoration: { elements: [{ kind: 'connector', id: 'linea', routing: 'elbow', from: { to: '#jefe', side: 'bottom', at: 0.1 }, to: { to: '#area', side: 'left' } } as DesignConnectorElement] },
};
const config: PostextConfig = { ...CONNECTOR_CONFIG, pageTemplates: [chart, branch] };
const md = (heads: boolean) => [
  `::::page{template="${heads ? 'organigrama' : 'sinjefe'}"}`,
  ...(heads ? [':::frame{slot="jefe"}', 'Head teacher', ':::'] : []),
  ':::module{template="rama"}', ':::frame{slot="area"}', 'Office', ':::', ':::',
  ':::module{template="rama"}', ':::frame{slot="area"}', 'Teachers', ':::', ':::',
  '::::', '',
].join('\n');
const build = (markdown: string, cfg: PostextConfig = config): VDTDocument => buildDocument({ markdown }, cfg, createMeasurementCache());
const pageOf = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const paths = (page: VDTPage): VDTDesignPathBlock[] => (page.composed!.decoration?.blocks ?? []).filter((b): b is VDTDesignPathBlock => b.kind === 'path');
const ends = (b: VDTDesignPathBlock) => {
  const pts = b.subpaths.flat().filter((c): c is Extract<VDTPathCommand, { x: number }> => c.op !== 'Z');
  return { first: pts[0]!, last: pts[pts.length - 1]! };
};

describe('a module connector that ends on a frame of the page (#1069)', () => {
  it('validates: an end outside the module is not frameAnchorUnknown', () => {
    expect(validatePageTemplates(config).filter((w) => w.kind === 'frameAnchorUnknown')).toEqual([]);
  });

  it('joins the page frame to each module: one line per use, from the head down to each area', () => {
    const page = pageOf(build(md(true)));
    const lines = paths(page);
    expect(lines.map((b) => b.elementId)).toEqual(['rama[1].linea', 'rama[2].linea']);
    const head = flowRectToPage(page, page.composed!.frames.find((f) => f.name === 'jefe')!.rect);
    lines.forEach((b, k) => {
      const area = flowRectToPage(page, page.composed!.frames.find((f) => f.name === `rama[${k + 1}].area`)!.rect);
      const { first, last } = ends(b);
      // From a tenth of the way along the head's foot…
      expect(first.x).toBeCloseTo(head.x + head.width * 0.1, 0);
      expect(first.y).toBeCloseTo(head.y + head.height, 0);
      // …to the middle of the area's left side.
      expect(last.x).toBeCloseTo(area.x, 0);
      expect(last.y).toBeCloseTo(area.y + area.height / 2, 0);
    });
  });

  it('drops the end on a page that has no such frame, and logs it', () => {
    const bare: PageTemplate = { ...chart, id: 'sinjefe', frames: [], groups: [{ ...chart.groups![0]!, placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill', height: 'fill' } } }] };
    const page = pageOf(build(md(false), { ...config, pageTemplates: [bare, branch] }));
    expect(paths(page)).toEqual([]);
    expect(page.composed!.log.filter((e) => e.kind === 'connectorDropped').map((e) => e.frame)).toEqual(['jefe', 'jefe']);
  });
});
