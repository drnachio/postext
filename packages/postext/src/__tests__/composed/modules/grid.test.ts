import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { formatWarning } from '../../../pipeline/contentWarnings.js';
import { validatePageTemplates } from '../../../composed/validate.js';
import { resolvePageTemplate } from '../../../composed/templates.js';
import { expandRepeats, pageRepeats } from '../../../composed/repeat.js';
import { composedPages } from '../../../composed/document.js';
import { elementsForSource, findElement } from '../../../composed/sourceMap.js';
import { clearComposedPageMemo, composedPageMemoStats, setComposedPageMemo } from '../../../composed/pageMemo.js';
import { parseMarkdown } from '../../../parse/index.js';
import { flowRectToPage } from '../../../vdt.js';
import type { FrameGroupConfig, PageTemplate } from '../../../composed/types.js';
import type { ContentWarning, PostextConfig, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';
import { CAPTIONS, GRID_CONFIG, GRID_RESOURCES, mm, PANEL_TEMPLATE, panelPage, PHOTO_TEMPLATE, photoItem, photoPage } from '../fixtures/grid.js';

// #1061 (DESIGN §12.6): a grid group that repeats a frame set lays one
// instance of the set per content item, `<frame>[n]`, cell after cell.

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
  buildDocument({ markdown, resources: GRID_RESOURCES }, { ...GRID_CONFIG, ...config }, createMeasurementCache());
const composedPagesOf = (doc: VDTDocument): VDTPage[] => doc.pages.filter((p) => p.composed);
const frame = (page: VDTPage, name: string): VDTFrame => page.composed!.frames.find((f) => f.name === name)!;
const warningsOf = (doc: VDTDocument, kind: ContentWarning['kind']) => (doc.contentWarnings ?? []).filter((w) => w.kind === kind);
const withTemplate = (t: PageTemplate, more: PageTemplate[] = []): Partial<PostextConfig> => ({ pageTemplates: [t, ...more] });
const withGrid = (t: PageTemplate, patch: Partial<FrameGroupConfig>): PageTemplate => ({ ...t, groups: [{ ...t.groups![0]!, ...patch }] });

describe('a grid that repeats a frame set (#1061)', () => {
  it('lays a 3 × 3 grid of photo cards, each caption pill on its photo\'s foot', () => {
    const doc = build(photoPage('Animals of the river', CAPTIONS.en));
    const [page] = composedPagesOf(doc);
    expect(page).toBeDefined();
    const names = page!.composed!.frames.map((f) => f.name);
    expect(names).toEqual(['titulo', ...Array.from({ length: 9 }, (_, k) => [`foto[${k + 1}]`, `pie[${k + 1}]`]).flat()]);
    const fotos = Array.from({ length: 9 }, (_, k) => frame(page!, `foto[${k + 1}]`));
    // Ids, items and the template's entry.
    expect(fotos[1]!.id).toBe('cp0:foto[2]');
    expect(fotos[1]!.repeat).toEqual({ frame: 'foto', item: 2 });
    expect(fotos[1]!.configPath).toBe('/pageTemplates/0/frames/1');
    expect(frame(page!, 'pie[2]').configPath).toBe('/pageTemplates/0/frames/2');
    // Three columns of one width, rows from the start side.
    const area = page!.contentArea;
    const colW = (area.width - 2 * 6 * MM) / 3;
    for (let k = 0; k < 9; k++) {
      const f = fotos[k]!;
      expect(f.rect.width).toBeCloseTo(colW, 3);
      expect(f.rect.x).toBeCloseTo(area.x + (k % 3) * (colW + 6 * MM), 3);
      if (k % 3 > 0) expect(f.rect.y).toBeCloseTo(fotos[k - (k % 3)]!.rect.y, 6);
    }
    // A row is as tall as its tallest cell (stretch): the photos of a row
    // are as tall as each other.
    expect(fotos[0]!.rect.height).toBeCloseTo(fotos[1]!.rect.height, 6);
    // Each pill hangs centred from its own photo's foot, 4 mm below it, and
    // the next row starts past the pills (rowGap 10 mm).
    for (let k = 0; k < 9; k++) {
      const f = fotos[k]!;
      const pie = frame(page!, `pie[${k + 1}]`);
      expect(pie.rect.x + pie.rect.width / 2).toBeCloseTo(f.rect.x + f.rect.width / 2, 3);
      expect(pie.rect.y + pie.rect.height).toBeCloseTo(f.rect.y + f.rect.height + 4 * MM, 3);
      expect(pie.blockIds.length).toBeGreaterThan(0);
    }
    const pie1 = frame(page!, 'pie[1]');
    expect(fotos[3]!.rect.y).toBeCloseTo(pie1.rect.y + pie1.rect.height + 10 * MM, 3);
    // Each instance holds its own item: the n-th caption.
    const text = (f: VDTFrame) => f.blockIds.map((id) => doc.blocks.find((b) => b.id === id)).flatMap((b) => b?.lines.map((l) => l.text) ?? []).join(' ').trim();
    expect(text(frame(page!, 'pie[5]'))).toBe(CAPTIONS.en[4]);
    expect(fotos[4]!.blockIds.some((id) => doc.blocks.find((b) => b.id === id)?.type === 'resource')).toBe(true);
    expect(warningsOf(doc, 'frameOverflow')).toEqual([]);
    expect(warningsOf(doc, 'slotEmpty')).toEqual([]);
    expect(warningsOf(doc, 'slotUnknown')).toEqual([]);
  });

  it('adds a row for a tenth item', () => {
    const doc = build(photoPage('Animals of the river', [...CAPTIONS.en, 'The salmon']));
    const [page] = composedPagesOf(doc);
    const f10 = frame(page!, 'foto[10]');
    const f7 = frame(page!, 'foto[7]');
    expect(f10.rect.x).toBeCloseTo(frame(page!, 'foto[1]').rect.x, 6);
    expect(f10.rect.y).toBeGreaterThan(f7.rect.y + f7.rect.height);
  });

  it('makes as many cards as each language has: 3 × 2 panels over photos, top-aligned', () => {
    const es = ['Vive en la orilla y caza peces al acecho.', 'Anida en los taludes del río.', 'Nada de noche.', 'Canta en primavera junto al agua.', 'Pone sus huevos en el agua quieta.', 'Busca comida entre las piedras del fondo.'];
    const en = ['It lives on the bank and waits for fish.', 'It nests in the river\'s banks.', 'It swims at night.', 'It sings by the water in spring.', 'It lays its eggs in still water.'];
    const docEs = build(panelPage('El río', es), { locale: 'es' });
    const docEn = build(panelPage('The river', en), { locale: 'en' });
    const pageEs = composedPagesOf(docEs)[0]!;
    const pageEn = composedPagesOf(docEn)[0]!;
    expect(pageEs.composed!.frames.filter((f) => f.repeat?.frame === 'panel')).toHaveLength(6);
    expect(pageEn.composed!.frames.filter((f) => f.repeat?.frame === 'panel')).toHaveLength(5);
    // Same ids in both languages for the items they share.
    expect(frame(pageEs, 'imagen[3]').id).toBe(frame(pageEn, 'imagen[3]').id);
    for (const page of [pageEs, pageEn]) {
      const panels = page.composed!.frames.filter((f) => f.repeat?.frame === 'panel');
      for (const p of panels) {
        const img = frame(page, `imagen[${p.repeat!.item}]`);
        // The photo under its own panel, 2 mm below it.
        expect(img.rect.y).toBeCloseTo(p.rect.y + p.rect.height + 2 * MM, 3);
        expect(img.rect.x).toBeCloseTo(p.rect.x, 3);
        // As wide as its cell: a `'fill'` width runs to the cell's edge.
        expect(img.rect.width).toBeCloseTo(p.rect.width, 3);
        expect(img.blockIds.some((id) => (page.floats ?? []).find((b) => b.id === id)?.type === 'resource')).toBe(true);
      }
      // `rowAlign: 'start'`: the panels of a row start at one height.
      expect(panels[1]!.rect.y).toBeCloseTo(panels[0]!.rect.y, 6);
    }
    expect([...warningsOf(docEs, 'frameOverflow'), ...warningsOf(docEn, 'frameOverflow')]).toEqual([]);
  });

  it('sends the items past `max` to the flow, with repeatOverflow', () => {
    const t = withGrid(PHOTO_TEMPLATE, { repeat: { frames: ['foto', 'pie'], max: 4 } });
    const md = photoPage('Animals of the river', CAPTIONS.en.slice(0, 6));
    const doc = build(md, withTemplate(t));
    const page = composedPagesOf(doc)[0]!;
    expect(page.composed!.frames.filter((f) => f.repeat?.frame === 'foto').map((f) => f.repeat!.item)).toEqual([1, 2, 3, 4]);
    const over = warningsOf(doc, 'repeatOverflow');
    expect(over.map((w) => (w as Extract<ContentWarning, { kind: 'repeatOverflow' }>).item)).toEqual([5, 6]);
    const w = over[0]! as Extract<ContentWarning, { kind: 'repeatOverflow' }>;
    expect(w).toMatchObject({ template: 'fotos', group: 'fotos', frame: 'foto', max: 4, fenceIndex: 0 });
    // It points at the item's `slot="foto"`.
    const at = md.indexOf('slot="foto"', md.indexOf(CAPTIONS.en[3]!));
    expect(md.slice(w.sourceStart, w.sourceEnd)).toBe('foto');
    expect(w.sourceStart).toBe(at + 'slot="'.length);
    expect(formatWarning(w)).toContain('holds 4 items');
    // Never lost: with no flow frame, the rest is set after the page.
    const after = doc.pages.filter((p) => !p.composed).flatMap((p) => p.columns.flatMap((c) => c.blocks));
    expect(after.some((b) => b.lines.some((l) => l.text.includes(CAPTIONS.en[4]!)))).toBe(true);
  });

  it('goes on by whole rows on a next page', () => {
    const t = withGrid({ ...PHOTO_TEMPLATE, frames: PHOTO_TEMPLATE.frames!.map((f) => (f.name === 'foto' ? { ...f, overflow: { continueIn: 'next-page' } } : f)) }, {
      placement: { anchor: { to: '#titulo', edge: 'below' }, offset: { y: mm(6) }, size: { height: mm(120) } },
    });
    const doc = build(photoPage('Animals of the river', CAPTIONS.en), withTemplate(t));
    const pages = composedPagesOf(doc);
    expect(pages).toHaveLength(2);
    const first = pages[0]!.composed!.frames.filter((f) => f.repeat?.frame === 'foto').map((f) => f.repeat!.item);
    const second = pages[1]!.composed!.frames.filter((f) => f.repeat?.frame === 'foto' && !f.collapsed).map((f) => f.repeat!.item);
    // Two rows fit 120 mm; the third goes on whole.
    expect(first).toEqual([1, 2, 3, 4, 5, 6]);
    expect(second).toEqual([7, 8, 9]);
    expect(pages[1]!.composed!.continuationOf).toBe(pages[0]!.index);
    expect(frame(pages[1]!, 'foto[7]').id).toBe('cp0:foto[7]~1');
    expect(frame(pages[1]!, 'pie[7]').id).toBe('cp0:pie[7]~1');
    // The receiving page lays the grid alone: the title it anchors under
    // takes no room there.
    expect(frame(pages[1]!, 'titulo').collapsed).toBe(true);
    expect(frame(pages[1]!, 'foto[7]').rect.y).toBeCloseTo(frame(pages[0]!, 'foto[1]').rect.y - frame(pages[0]!, 'titulo').rect.height, 3);
    // Each item is whole on one page: its caption too.
    const text = (p: VDTPage, f: VDTFrame) => f.blockIds.map((id) => (p.floats ?? []).find((b) => b.id === id)).flatMap((b) => b?.lines.map((l) => l.text) ?? []).join(' ').trim();
    expect(text(pages[1]!, frame(pages[1]!, 'pie[8]'))).toBe(CAPTIONS.en[7]);
    expect(pages[0]!.composed!.log.filter((e) => e.kind === 'continued').map((e) => e.frame)).toEqual(['foto[7]', 'pie[7]', 'foto[8]', 'pie[8]', 'foto[9]', 'pie[9]']);
    expect(warningsOf(doc, 'frameOverflow')).toEqual([]);
  });

  it('takes the empty frames of an item that goes on with it', () => {
    const t = withGrid({ ...PHOTO_TEMPLATE, frames: PHOTO_TEMPLATE.frames!.map((f) => (f.name === 'foto' ? { ...f, overflow: { continueIn: 'next-page' } } : f)) }, {
      placement: { anchor: { to: '#titulo', edge: 'below' }, offset: { y: mm(6) }, size: { height: mm(120) } },
    });
    const items = CAPTIONS.en.map((c, k) => (k === 7 ? ':::frame{slot="foto"}\n::resource{id="foto-gasto"}\n:::\n' : photoItem(k, c)));
    const doc = build(`::::page{template="fotos"}\n# Animals of the river\n\n${items.join('\n')}::::\n`, withTemplate(t));
    const pages = composedPagesOf(doc);
    expect(pages).toHaveLength(2);
    // Item 8 has no caption: its pill goes on with its photo, empty, and
    // keeps its place under it.
    const pie8 = frame(pages[1]!, 'pie[8]');
    const foto8 = frame(pages[1]!, 'foto[8]');
    expect(pie8.collapsed).toBeUndefined();
    expect(pie8.rect.y + pie8.rect.height).toBeCloseTo(foto8.rect.y + foto8.rect.height + 4 * MM, 3);
    expect(warningsOf(doc, 'slotEmpty')).toEqual([]);
  });

  it('clips the rows that do not fit when the grid cannot go on, and warns once', () => {
    const t = withGrid(PHOTO_TEMPLATE, { placement: { anchor: { to: '#titulo', edge: 'below' }, offset: { y: mm(6) }, size: { height: mm(120) } } });
    const doc = build(photoPage('Animals of the river', CAPTIONS.en), withTemplate(t));
    expect(composedPagesOf(doc)).toHaveLength(1);
    const page = composedPagesOf(doc)[0]!;
    // Nothing runs past the grid's foot.
    const titulo = frame(page, 'titulo');
    const foot = titulo.rect.y + titulo.rect.height + 126 * MM;
    for (const f of page.composed!.frames) if (f.repeat) expect(f.rect.y + f.rect.height).toBeLessThanOrEqual(foot + 0.01);
    // The rows that fit are whole; the third is cut.
    expect(frame(page, 'foto[6]').overflowPx).toBe(0);
    expect(frame(page, 'foto[7]').overflowPx).toBeGreaterThan(0);
    // One warning, on the last instance cut.
    const over = warningsOf(doc, 'frameOverflow') as Extract<ContentWarning, { kind: 'frameOverflow' }>[];
    expect(over.map((w) => w.frame)).toEqual(['pie[9]']);
  });

  it('anchors decoration to an instance: #foto[2]', () => {
    const t: PageTemplate = {
      ...PHOTO_TEMPLATE,
      decoration: { elements: [{ kind: 'rule', id: 'raya', direction: 'horizontal', color: { hex: '#2a6f97', model: 'hex' }, thickness: mm(0.8), placement: { anchor: { to: '#foto[2]', edge: 'above' }, offset: { y: mm(-1) }, size: { width: mm(20) } } } as never] },
    };
    const config = { ...GRID_CONFIG, ...withTemplate(t) };
    expect(validatePageTemplates(config).filter((w) => w.kind === 'frameAnchorUnknown')).toEqual([]);
    const doc = build(photoPage('Animals of the river', CAPTIONS.en), withTemplate(t));
    const page = composedPagesOf(doc)[0]!;
    const rule = page.composed!.decoration!.blocks.find((b) => b.elementId === 'raya')!;
    expect(rule).toBeDefined();
    const f2 = flowRectToPage(page, frame(page, 'foto[2]').rect);
    expect(rule.bbox.x).toBeCloseTo(f2.x, 3);
    expect(rule.bbox.y + rule.bbox.height).toBeLessThanOrEqual(f2.y + 0.01);
    expect(rule.bbox.y + rule.bbox.height).toBeGreaterThan(f2.y - 2 * MM);
  });

  it('leaves out decoration anchored to an instance the page does not have', () => {
    const t: PageTemplate = {
      ...PHOTO_TEMPLATE,
      decoration: { elements: [{ kind: 'rule', id: 'raya', direction: 'horizontal', color: { hex: '#2a6f97', model: 'hex' }, thickness: mm(0.8), placement: { anchor: { to: '#foto[5]', edge: 'above' }, size: { width: mm(20) } } } as never] },
    };
    const doc = build(photoPage('Animals of the river', CAPTIONS.en.slice(0, 3)), withTemplate(t));
    const page = composedPagesOf(doc)[0]!;
    expect(page.composed!.decoration?.blocks.find((b) => b.elementId === 'raya')).toBeUndefined();
  });

  it('keeps a page with a grid in the page memo, the same as laid afresh', () => {
    const md = photoPage('Animals of the river', CAPTIONS.en.slice(0, 5));
    setComposedPageMemo(true);
    clearComposedPageMemo();
    try {
      const fresh = build(md);
      const before = composedPageMemoStats();
      const again = build(md);
      expect(composedPageMemoStats().hits).toBeGreaterThan(before.hits);
      const ids = (d: VDTDocument) => composedPagesOf(d)[0]!.composed!.frames.map((f) => `${f.id} ${f.rect.x.toFixed(3)} ${f.rect.y.toFixed(3)} ${f.blockIds.join(',')}`);
      expect(ids(again)).toEqual(ids(fresh));
      // The same as laid afresh, the memo off.
      setComposedPageMemo(false);
      expect(ids(build(md))).toEqual(ids(again));
    } finally {
      clearComposedPageMemo();
      setComposedPageMemo(true);
    }
  });

  it('fills the cells from the start side of a right-to-left page', () => {
    const doc = build(photoPage('حيوانات النهر', CAPTIONS.en.slice(0, 3)), { direction: 'rtl', locale: 'ar' } as PostextConfig);
    const page = composedPagesOf(doc)[0]!;
    const x = (n: string) => flowRectToPage(page, frame(page, n).rect).x;
    expect(x('foto[1]')).toBeGreaterThan(x('foto[2]'));
    expect(x('foto[2]')).toBeGreaterThan(x('foto[3]'));
  });

  it('maps each instance to its own Markdown and back', () => {
    const md = photoPage('Animals of the river', CAPTIONS.en.slice(0, 4));
    const doc = build(md);
    const page = composedPagesOf(doc)[0]!;
    const el = findElement(doc, 'cp0:pie[3]')?.element;
    expect(el?.level).toBe('frame');
    expect(el?.source).toEqual({ kind: 'config', path: '/pageTemplates/0/frames/2' });
    const at = md.indexOf(CAPTIONS.en[2]!);
    const hits = elementsForSource(doc, at, at + CAPTIONS.en[2]!.length).map((h) => h.element.id);
    expect(hits.some((id) => id.startsWith('cp0:pie[3]'))).toBe(true);
    expect(hits.some((id) => id.startsWith('cp0:pie[2]'))).toBe(false);
    // Its group is the grid.
    const chain = findElement(doc, frame(page, 'pie[3]').blockIds[1]!);
    expect(chain).toBeDefined();
    expect(frame(page, 'pie[3]').sourceStart).toBeLessThanOrEqual(at);
    expect(frame(page, 'pie[3]').sourceEnd).toBeGreaterThanOrEqual(at + CAPTIONS.en[2]!.length);
  });

  it('lays the frames a grid lists as its cells when it repeats none', () => {
    const t: PageTemplate = {
      id: 'cuatro',
      header: false,
      frames: ['a', 'b', 'c', 'd'].map((name) => ({ name, style: 'panel' })),
      groups: [{ name: 'g', kind: 'grid', columns: 2, columnGap: mm(4), rowGap: mm(4), frames: ['a', 'b', 'c', 'd'] }],
    };
    const md = '::::page{template="cuatro"}\n' + ['a', 'b', 'c', 'd'].map((n) => `:::frame{slot="${n}"}\nBox ${n}.\n:::\n`).join('\n') + '::::\n';
    const doc = build(md, withTemplate(t));
    const page = composedPagesOf(doc)[0]!;
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((n) => frame(page, n));
    expect(b!.rect.y).toBeCloseTo(a!.rect.y, 6);
    expect(b!.rect.x).toBeCloseTo(a!.rect.x + a!.rect.width + 4 * MM, 3);
    expect(c!.rect.x).toBeCloseTo(a!.rect.x, 6);
    expect(c!.rect.y).toBeCloseTo(a!.rect.y + a!.rect.height + 4 * MM, 3);
    expect(d!.rect.y).toBeCloseTo(c!.rect.y, 6);
    expect(page.composed!.frames.every((f) => f.repeat === undefined && !f.id.includes('['))).toBe(true);
  });

  it('threads an item\'s text through the frames of its own set', () => {
    const t: PageTemplate = {
      id: 'fichas',
      header: false,
      frames: [
        { name: 'ficha', style: 'panel', height: mm(14), next: 'mas' },
        { name: 'mas', style: 'panel', optional: true, height: mm(30), placement: { anchor: { to: '#ficha', edge: 'below' }, offset: { y: mm(1) } } },
      ],
      groups: [{ name: 'g', kind: 'grid', columns: 2, columnGap: mm(4), rowGap: mm(4), repeat: { frames: ['ficha', 'mas'] } }],
    };
    const long = 'It lives on the bank and waits for fish to come by. '.repeat(4).trim();
    const md = '::::page{template="fichas"}\n' + [long, 'Short.'].map((x) => `:::frame{slot="ficha"}\n${x}\n:::\n`).join('\n') + '::::\n';
    const doc = build(md, withTemplate(t));
    const page = composedPagesOf(doc)[0]!;
    // Item 1 goes on in its own `mas`, item 2 fits its `ficha`.
    expect(frame(page, 'mas[1]').continuedFrom).toBe('cp0:ficha[1]');
    expect(frame(page, 'mas[1]').blockIds.length).toBeGreaterThan(0);
    expect(warningsOf(doc, 'frameOverflow')).toEqual([]);
    // Each item's text stays in its own story.
    const text = (f: VDTFrame) => f.blockIds.map((id) => doc.blocks.find((x) => x.id === id)).flatMap((x) => x?.lines.map((l) => l.text) ?? []).join(' ').trim();
    expect(text(frame(page, 'mas[2]'))).toBe('');
    expect(text(frame(page, 'mas[1]'))).not.toContain('Short');
    expect(text(frame(page, 'ficha[2]'))).toContain('Short');
  });

  it('lays a template without grids as before', () => {
    const t: PageTemplate = { ...PHOTO_TEMPLATE, groups: [] };
    const doc = build(`::::page{template="fotos"}\n# A\n\n${photoItem(0, 'One')}::::\n`, withTemplate(t));
    const page = composedPagesOf(doc)[0]!;
    expect(page.composed!.frames.map((f) => f.id)).toEqual(['cp0:titulo', 'cp0:foto', 'cp0:pie']);
    expect(page.composed!.frames.every((f) => f.repeat === undefined)).toBe(true);
  });
});

describe('grid configuration (#1061)', () => {
  const base = (groups: unknown[], frames = PHOTO_TEMPLATE.frames): PostextConfig => ({ ...GRID_CONFIG, pageTemplates: [{ ...PHOTO_TEMPLATE, frames, groups } as PageTemplate] });

  it('resolves a grid with its defaults', () => {
    const t = resolvePageTemplate(base([{ name: 'g', kind: 'grid', gap: mm(3), repeat: { frames: ['foto', 'pie'] } }]), 'fotos')!;
    expect(t.groups[0]).toMatchObject({ kind: 'grid', columns: 1, columnGap: mm(3), rowGap: mm(3), rowAlign: 'stretch', frames: ['foto', 'pie'], repeat: { frames: ['foto', 'pie'] } });
    // Other groups resolve as they did.
    const s = resolvePageTemplate(base([{ name: 's', kind: 'stack', frames: ['foto'] }]), 'fotos')!;
    expect(Object.keys(s.groups[0]!).sort()).toEqual(['align', 'configPath', 'fieldPaths', 'frames', 'gap', 'kind', 'name']);
  });

  it('warns about unknown repeated frames, a repeated frame in another group, and no columns', () => {
    const config = base([
      { name: 'otra', kind: 'stack', frames: ['titulo', 'foto'] },
      { name: 'g', kind: 'grid', columns: 0, rowAlign: 'middle', repeat: { frames: ['foto', 'nada'], max: 0 } },
    ]);
    const ws = validatePageTemplates(config);
    expect(ws).toContainEqual(expect.objectContaining({ kind: 'groupFrameUnknown', path: '/pageTemplates/0/groups/1/repeat/frames/1', value: 'nada' }));
    expect(ws).toContainEqual(expect.objectContaining({ kind: 'groupFrameTwice', path: '/pageTemplates/0/groups/0/frames/1', value: 'foto' }));
    expect(ws).toContainEqual(expect.objectContaining({ kind: 'unknownConfigValue', path: '/pageTemplates/0/groups/1/columns', value: '0' }));
    expect(ws).toContainEqual(expect.objectContaining({ kind: 'unknownConfigValue', path: '/pageTemplates/0/groups/1/rowAlign', value: 'middle' }));
    expect(ws).toContainEqual(expect.objectContaining({ kind: 'unknownConfigValue', path: '/pageTemplates/0/groups/1/repeat/max', value: '0' }));
    // The repeat keeps its frame; the other group loses it.
    const t = resolvePageTemplate(config, 'fotos')!;
    expect(t.groups.find((g) => g.name === 'g')!.repeat).toEqual({ frames: ['foto'] });
    expect(t.groups.find((g) => g.name === 'otra')!.frames).toEqual(['titulo']);
    expect(t.groups.find((g) => g.name === 'g')!.columns).toBe(1);
  });

  it('expands the set per item, anchors among the set rewritten to the instance', () => {
    const t = resolvePageTemplate(GRID_CONFIG, 'fotos')!;
    const md = photoPage('T', ['a', 'b']);
    const blocks = parseMarkdown(md);
    const page = composedPages(blocks)[0]!;
    const reps = pageRepeats(page, t);
    expect(reps.items.map((i) => i.item)).toEqual([1, 2]);
    expect([...reps.items[0]!.frames.keys()].sort()).toEqual(['foto', 'pie']);
    const x = expandRepeats(t, new Map([['fotos', [1, 2]]]));
    expect(x.frames.map((f) => f.name)).toEqual(['titulo', 'foto[1]', 'pie[1]', 'foto[2]', 'pie[2]']);
    expect(x.frames.find((f) => f.name === 'pie[2]')!.placement!.anchor.to).toBe('#foto[2]');
    // The main frame keeps the template's drawing (to a frame outside the set).
    expect(x.frames.find((f) => f.name === 'foto[2]')!.placement!.anchor.to).toBe('#titulo');
    expect(x.groups[0]!.items).toEqual([{ item: 1, frames: ['foto[1]', 'pie[1]'] }, { item: 2, frames: ['foto[2]', 'pie[2]'] }]);
    // No grid: the same template.
    const plain = resolvePageTemplate({ ...GRID_CONFIG, pageTemplates: [PANEL_TEMPLATE] }, 'paneles')!;
    const none = { ...plain, groups: [] };
    expect(expandRepeats(none, new Map())).toBe(none);
  });
});
