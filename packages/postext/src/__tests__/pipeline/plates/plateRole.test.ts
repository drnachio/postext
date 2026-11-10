import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { pageMatchesRole } from '../../../design/layout.js';
import { preflightDocument } from '../../../checks/preflight.js';
import { resolvePrintConfig } from '../../../defaults/output/print.js';
import { renderToHtmlIndexed } from '../../../html-backend/render.js';
import type { PostextConfig, Resource, VDTDocument } from '../../../index.js';
import { config, mm, para, bitmap, floatOf } from './fixture.js';

// The page a plate covers to the trim or the bleed (#1461): its own page
// role, the design elements that name it, and the print preflight.

const MD = `${para(6)} See :ref{id="a"}. ${para(40)}`;
const build = (r: Resource, cfg: PostextConfig = config): VDTDocument =>
  buildDocument({ markdown: MD, resources: [r] }, cfg, createMeasurementCache());

const element = (id: string, pages?: string) => ({
  kind: 'text', id, content: id,
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'auto' } },
  ...(pages ? { pages } : {}),
});
const withHead = (...elements: ReturnType<typeof element>[]): PostextConfig => ({ ...config, header: { elements } as never });
const headIds = (doc: VDTDocument, index: number): string[] =>
  (doc.pages[index]!.header?.blocks ?? []).flatMap((b) => (b.elementId ? [b.elementId] : []));

describe('the plate page role', () => {
  it('admits on a plate page only the elements that name it', () => {
    expect(pageMatchesRole('plate', 'plate')).toBe(true);
    expect(pageMatchesRole('all', 'plate')).toBe(false);
    expect(pageMatchesRole(undefined, 'plate')).toBe(false);
    expect(pageMatchesRole('body', 'plate')).toBe(false);
    expect(pageMatchesRole('plate', 'body')).toBe(false);
  });

  it('marks the page of a plate to the trim or the bleed, not one in the content area', () => {
    for (const area of ['trim', 'bleed'] as const) {
      const a = floatOf(build(bitmap('a', 400, 200, { plate: area })), 'a')!;
      expect(a.page.role).toBe('plate');
    }
    const inside = floatOf(build(bitmap('a', 400, 200, { plate: true })), 'a')!;
    expect(inside.page.role).not.toBe('plate');
  });

  it('draws on a plate page the running head that names it, and only that one', () => {
    const cfg = withHead(element('Always'), element('OnPlate', 'plate'), element('OnBody', 'body'));
    const doc = build(bitmap('a', 400, 200, { plate: 'trim' }), cfg);
    const a = floatOf(doc, 'a')!;
    expect(headIds(doc, a.page.index)).toEqual(['OnPlate']);
    const before = headIds(doc, a.page.index - 1);
    expect(before).toContain('Always');
    expect(before).not.toContain('OnPlate');
  });
});

describe('a plate to the edge in the print preflight', () => {
  const print = () => {
    const base = resolvePrintConfig();
    return { ...base, preflight: { ...base.preflight, enabled: true } };
  };
  const nearTrim = (doc: VDTDocument) => preflightDocument(doc, { print: print() }).filter((i) => i.kind === 'nearTrim');
  const cut: PostextConfig = { ...config, page: { ...config.page, cutLines: { enabled: true, bleed: mm(3) } } };

  it('reports no picture stopping short of the trim, with cut lines or without', () => {
    expect(nearTrim(build(bitmap('a', 1600, 2400, { plate: 'trim' }), cut))).toEqual([]);
    expect(nearTrim(build(bitmap('a', 1600, 2400, { plate: 'bleed' }), cut))).toEqual([]);
    expect(nearTrim(build(bitmap('a', 1600, 2400, { plate: 'trim' })))).toEqual([]);
  });
});

describe('a plate to the edge in the HTML viewer', () => {
  it('draws the picture over the page, cropped about its centre', () => {
    const doc = build(bitmap('a', 1600, 800, { plate: 'trim' }));
    const a = floatOf(doc, 'a')!;
    const html = renderToHtmlIndexed(doc, { resourceImageUrl: (id) => `/media/${id}` }).pages[a.page.index]!.innerHtml;
    const img = /<img[^>]*src="\/media\/a\.png"[^>]*>/.exec(html)![0];
    expect(img).toMatch(/left:0(\.0+)?px;top:0(\.0+)?px;/);
    // A wide picture on a tall page: its sides cut off evenly.
    expect(img).toContain('object-fit:cover;object-position:50% ');
  });
});
