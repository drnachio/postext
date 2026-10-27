import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { validatePageTemplates } from '../../../composed/validate.js';
import { resolvePageTemplate } from '../../../composed/templates.js';
import { elementsForSource, findElement } from '../../../composed/sourceMap.js';
import { flowRectToPage } from '../../../vdt.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { ContentWarning, PostextConfig, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';
import { MODULE_RESOURCES, mm } from '../fixtures/modules.js';
import { CARD_MODULE, cardModule, NOTICE_MODULE, noticeModule, ROWS_CONFIG, ROWS_TEMPLATE, ROWS_WORDS, rowsPage } from '../fixtures/moduleRows.js';

// #1088 (DESIGN §12.6, §12.7): modules side by side, in a row or a grid of
// their own or inside the page's modules stack.

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
  buildDocument({ markdown, resources: MODULE_RESOURCES }, { ...ROWS_CONFIG, ...config }, createMeasurementCache());
const composedPagesOf = (doc: VDTDocument): VDTPage[] => doc.pages.filter((p) => p.composed);
const frame = (page: VDTPage, name: string): VDTFrame => page.composed!.frames.find((f) => f.name === name)!;
const moduleBox = (page: VDTPage, name: string) => page.composed!.modules!.find((m) => m.name === name)!.rect!;
const warningsOf = <K extends ContentWarning['kind']>(doc: VDTDocument, kind: K) => (doc.contentWarnings ?? []).filter((w): w is Extract<ContentWarning, { kind: K }> => w.kind === kind);
const textOf = (page: VDTPage, f: VDTFrame): string => f.blockIds.map((id) => (page.floats ?? []).find((b) => b.id === id)).flatMap((b) => b?.lines.map((l) => l.text) ?? []).join(' ').trim();
const bottom = (r: { y: number; height: number }): number => r.y + r.height;
const withTemplates = (...templates: PageTemplate[]): Partial<PostextConfig> => ({ pageTemplates: templates });

/** A page template whose one modules group is `group`. */
const shellWith = (group: PageTemplate['groups'] extends (infer G)[] | undefined ? Partial<G> : never): PageTemplate => ({
  ...ROWS_TEMPLATE,
  id: 'solo',
  groups: [{ ...ROWS_TEMPLATE.groups![0]!, ...group, name: 'cuerpo', modules: true }],
});
const soloPage = (modules: readonly string[]): string => `::::page{template="solo"}\n# T\n\n${modules.join('\n')}::::\n`;

describe('two boxes side by side over a 2 × 2 of cards, written with modules alone (#1088)', () => {
  const pages = { en: composedPagesOf(build(rowsPage('en'), { locale: 'en' }))[0]!, es: composedPagesOf(build(rowsPage('es'), { locale: 'es' }))[0]! };

  it('lays the boxes in a row and the cards in a grid, inside the stack', () => {
    const page = pages.en;
    expect(page.composed!.modules!.map((m) => m.name)).toEqual(['aviso[1]', 'aviso[2]', 'tarjeta[1]', 'tarjeta[2]', 'tarjeta[3]', 'tarjeta[4]']);
    const area = page.contentArea;
    const [a1, a2] = [moduleBox(page, 'aviso[1]'), moduleBox(page, 'aviso[2]')];
    // Two equal shares of the group's width, 6 mm between them, one top.
    const half = (area.width - 6 * MM) / 2;
    expect(a1.x).toBeCloseTo(area.x, 3);
    expect(a1.width).toBeCloseTo(half, 3);
    expect(a2.x).toBeCloseTo(area.x + half + 6 * MM, 3);
    expect(a2.width).toBeCloseTo(half, 3);
    expect(a2.y).toBeCloseTo(a1.y, 3);
    expect(a1.y).toBeCloseTo(bottom(frame(page, 'titulo').rect) + 6 * MM, 3);
    // Each box's frame in its module's box.
    expect(frame(page, 'aviso[2].texto').rect.x).toBeCloseTo(a2.x, 3);
    expect(frame(page, 'aviso[2].texto').rect.width).toBeCloseTo(half, 3);
    expect(textOf(page, frame(page, 'aviso[2].texto'))).toBe(ROWS_WORDS.en.boxes[1]);
    // Stretched to the row: both module boxes as tall as the taller.
    expect(a1.height).toBeCloseTo(a2.height, 3);
    // The cards: 2 × 2 under the row, the stack's 8 mm after it, 6 mm
    // between rows and columns.
    const cards = [1, 2, 3, 4].map((k) => moduleBox(page, `tarjeta[${k}]`));
    const rowBottom = Math.max(bottom(a1), bottom(a2));
    expect(cards[0]!.y).toBeCloseTo(rowBottom + 8 * MM, 3);
    expect(cards[1]!.y).toBeCloseTo(cards[0]!.y, 3);
    expect(cards[1]!.x).toBeCloseTo(area.x + half + 6 * MM, 3);
    expect(cards[2]!.x).toBeCloseTo(area.x, 3);
    expect(cards[2]!.y).toBeCloseTo(Math.max(bottom(cards[0]!), bottom(cards[1]!)) + 6 * MM, 3);
    for (const c of cards) expect(c.width).toBeCloseTo(half, 3);
    expect(textOf(page, frame(page, 'tarjeta[4].pie'))).toBe(ROWS_WORDS.en.captions[3]);
    // The groups inside the stack are the boxes of their modules.
    expect(doc0Warnings()).toEqual([]);
  });

  it('grows the row with its longer box in the other language, and moves the cards down by as much', () => {
    const tallest = (p: VDTPage) => Math.max(bottom(moduleBox(p, 'aviso[1]')), bottom(moduleBox(p, 'aviso[2]')));
    const grew = tallest(pages.es) - tallest(pages.en);
    expect(grew).toBeGreaterThan(2 * MM);
    // The Spanish first box is the tall one; the second keeps its text's
    // height and its top.
    expect(frame(pages.es, 'aviso[2].texto').rect.y).toBeCloseTo(frame(pages.en, 'aviso[2].texto').rect.y, 3);
    for (const k of [1, 2, 3, 4]) expect(moduleBox(pages.es, `tarjeta[${k}]`).y - moduleBox(pages.en, `tarjeta[${k}]`).y).toBeCloseTo(grew, 3);
    expect(pages.es.composed!.frames.map((f) => f.id)).toEqual(pages.en.composed!.frames.map((f) => f.id));
  });

  it('maps a frame of a module in a row to its Markdown and its config', () => {
    const md = rowsPage('en');
    const doc = build(md);
    const el = findElement(doc, 'cp0:aviso[2].texto')?.element;
    expect(el?.source).toEqual({ kind: 'config', path: '/pageTemplates/1/frames/0' });
    const word = ROWS_WORDS.en.boxes[1]!;
    const at = md.indexOf(word);
    const hits = elementsForSource(doc, at, at + word.length).map((h) => h.element.id);
    expect(hits.some((id) => id.startsWith('cp0:aviso[2].texto'))).toBe(true);
    expect(hits.some((id) => id.startsWith('cp0:aviso[1].texto'))).toBe(false);
  });

  it('mirrors the row and the grid on a right-to-left page', () => {
    const rtl = composedPagesOf(build(rowsPage('en'), { direction: 'rtl', locale: 'ar' } as PostextConfig))[0]!;
    const x = (n: string) => flowRectToPage(rtl, moduleBox(rtl, n)).x;
    // The first box on the right (the start side), the second to its left.
    expect(x('aviso[1]')).toBeGreaterThan(x('aviso[2]'));
    expect(x('tarjeta[1]')).toBeGreaterThan(x('tarjeta[2]'));
    expect(x('tarjeta[3]')).toBeCloseTo(x('tarjeta[1]'), 3);
    expect(flowRectToPage(rtl, frame(rtl, 'aviso[1].texto').rect).x).toBeCloseTo(x('aviso[1]'), 3);
  });

  function doc0Warnings(): string[] {
    return (build(rowsPage('en')).contentWarnings ?? []).map((w) => w.kind);
  }
});

describe('modules groups of their own kind (#1088)', () => {
  it('lays a row of modules at their templates\' widths, the rest sharing what is left', () => {
    const narrow: PageTemplate = { ...NOTICE_MODULE, width: { percent: 30 } };
    const fixed: PageTemplate = { ...CARD_MODULE, width: mm(50) };
    const doc = build(soloPage([noticeModule('en', 0), cardModule('en', 0), noticeModule('en', 1)]), withTemplates(shellWith({ kind: 'row', gap: mm(5) }), narrow, fixed));
    const page = composedPagesOf(doc)[0]!;
    const area = page.contentArea;
    const [a, t, b] = ['aviso[1]', 'tarjeta[1]', 'aviso[2]'].map((n) => moduleBox(page, n));
    expect(a!.width).toBeCloseTo(area.width * 0.3, 3);
    expect(t!.width).toBeCloseTo(50 * MM, 3);
    expect(b!.width).toBeCloseTo(area.width * 0.3, 3);
    expect(t!.x).toBeCloseTo(a!.x + a!.width + 5 * MM, 3);
    // 'fill' (and no width) share what is left.
    const filling = composedPagesOf(build(soloPage([noticeModule('en', 0), cardModule('en', 0), noticeModule('en', 1)]), withTemplates(shellWith({ kind: 'row', gap: mm(5) }), NOTICE_MODULE, fixed)))[0]!;
    const share = (area.width - 50 * MM - 10 * MM) / 2;
    expect(moduleBox(filling, 'aviso[1]').width).toBeCloseTo(share, 3);
    expect(moduleBox(filling, 'aviso[2]').x).toBeCloseTo(area.x + share + 50 * MM + 10 * MM, 3);
  });

  it('places a shorter module of a row by rowAlign', () => {
    const md = soloPage([noticeModule('es', 0), noticeModule('es', 1)]);
    const at = (rowAlign: 'start' | 'center' | 'end') => composedPagesOf(build(md, withTemplates(shellWith({ kind: 'row', rowAlign }), NOTICE_MODULE)))[0]!;
    const [start, center, end] = [at('start'), at('center'), at('end')];
    const spare = moduleBox(start, 'aviso[1]').height - moduleBox(start, 'aviso[2]').height;
    expect(spare).toBeGreaterThan(2 * MM);
    expect(moduleBox(center, 'aviso[2]').y - moduleBox(start, 'aviso[2]').y).toBeCloseTo(spare / 2, 3);
    expect(moduleBox(end, 'aviso[2]').y - moduleBox(start, 'aviso[2]').y).toBeCloseTo(spare, 3);
  });

  it('lays four modules in a grid of two columns', () => {
    const doc = build(soloPage([0, 1, 2, 3].map((k) => cardModule('es', k))), withTemplates(shellWith({ kind: 'grid', columns: 2, columnGap: mm(4), rowGap: mm(5) }), CARD_MODULE));
    const page = composedPagesOf(doc)[0]!;
    const area = page.contentArea;
    const colW = (area.width - 4 * MM) / 2;
    const cards = [1, 2, 3, 4].map((k) => moduleBox(page, `tarjeta[${k}]`));
    expect(cards.map((c) => c.x)).toEqual([area.x, area.x + colW + 4 * MM, area.x, area.x + colW + 4 * MM].map((v) => expect.closeTo(v, 3)));
    expect(cards[2]!.y).toBeCloseTo(Math.max(bottom(cards[0]!), bottom(cards[1]!)) + 5 * MM, 3);
    expect(frame(page, 'tarjeta[3].foto').rect.width).toBeCloseTo(colW, 3);
    expect(doc.contentWarnings ?? []).toEqual([]);
  });

  it('sends whole rows of a modules grid on to a next page', () => {
    const md = soloPage(Array.from({ length: 9 }, (_, k) => cardModule('en', k % 4)));
    const shell = shellWith({ kind: 'grid', columns: 2, gap: mm(6), overflow: { continueIn: 'next-page' } });
    const doc = build(md, withTemplates(shell, CARD_MODULE));
    const [first, second] = composedPagesOf(doc);
    expect(second).toBeDefined();
    const laidOn = (p: VDTPage) => p.composed!.modules!.filter((m) => m.rect).map((m) => m.name);
    const here = laidOn(first!);
    const there = laidOn(second!);
    // Whole rows here: an even count, and every module once.
    expect(here.length % 2).toBe(0);
    expect(here.length).toBeGreaterThan(1);
    expect([...here, ...there]).toEqual(Array.from({ length: 9 }, (_, k) => `tarjeta[${k + 1}]`));
    const area = first!.contentArea;
    for (const f of first!.composed!.frames) expect(bottom(f.rect)).toBeLessThanOrEqual(area.y + area.height + 0.5);
    expect(warningsOf(doc, 'frameOverflow')).toEqual([]);
    // On the next page the row starts at the group's start side again.
    const k = here.length + 1;
    expect(moduleBox(second!, `tarjeta[${k}]`).x).toBeCloseTo(second!.contentArea.x, 3);
    expect(frame(second!, `tarjeta[${k}].foto`).id).toBe(`cp0:tarjeta[${k}].foto~1`);
  });

  it('sends a whole row inside the stack on, and what follows it', () => {
    const md = rowsPage('en', [...Array.from({ length: 8 }, (_, k) => cardModule('en', k % 4)), noticeModule('en', 0), noticeModule('en', 1)]);
    const shell: PageTemplate = { ...ROWS_TEMPLATE, groups: [{ ...ROWS_TEMPLATE.groups![0]!, overflow: { continueIn: 'next-page' } }, ...ROWS_TEMPLATE.groups!.slice(1)] };
    const doc = build(md, withTemplates(shell, NOTICE_MODULE, CARD_MODULE));
    const [first, second] = composedPagesOf(doc);
    expect(second).toBeDefined();
    const laidOn = (p: VDTPage) => p.composed!.modules!.filter((m) => m.rect).map((m) => m.name);
    expect([...laidOn(first!), ...laidOn(second!)]).toEqual([...Array.from({ length: 8 }, (_, k) => `tarjeta[${k + 1}]`), 'aviso[1]', 'aviso[2]']);
    expect(laidOn(first!).filter((n) => n.startsWith('tarjeta')).length % 2).toBe(0);
    // The two boxes stay together in their row.
    expect(laidOn(second!)).toContain('aviso[1]');
    expect(moduleBox(second!, 'aviso[2]').y).toBeCloseTo(moduleBox(second!, 'aviso[1]').y, 3);
  });

  it('lays a stack of modules at their widths, from the start side', () => {
    const narrow: PageTemplate = { ...NOTICE_MODULE, width: { percent: 50 } };
    const page = composedPagesOf(build(soloPage([noticeModule('en', 0)]), withTemplates(shellWith({}), narrow)))[0]!;
    expect(moduleBox(page, 'aviso[1]').width).toBeCloseTo(page.contentArea.width / 2, 3);
    expect(moduleBox(page, 'aviso[1]').x).toBeCloseTo(page.contentArea.x, 3);
  });
});

describe('modules groups configuration (#1088)', () => {
  it('resolves a row, a grid and groups inside a stack, and routes each module', () => {
    const t = resolvePageTemplate({ pageTemplates: [ROWS_TEMPLATE, NOTICE_MODULE, CARD_MODULE] }, 'doble', { modules: [{ name: 'aviso[1]', template: 'aviso' }, { name: 'tarjeta[1]', template: 'tarjeta' }] })!;
    expect(t.groups.find((g) => g.name === 'par')).toMatchObject({ kind: 'row', modules: true, within: 'cuerpo', templates: ['aviso'], rowAlign: 'stretch' });
    expect(t.groups.find((g) => g.name === 'tarjetas')).toMatchObject({ kind: 'grid', columns: 2, within: 'cuerpo', rowAlign: 'start' });
    expect(t.modules!.map((m) => [m.name, m.group, m.nested])).toEqual([['aviso[1]', 'cuerpo', 'par'], ['tarjeta[1]', 'cuerpo', 'tarjetas']]);
    expect(resolvePageTemplate({ pageTemplates: [{ ...NOTICE_MODULE, width: { percent: 40 } }] }, 'aviso')!.width).toEqual({ percent: 40 });
    expect(validatePageTemplates({ ...ROWS_CONFIG })).toEqual([]);
  });

  it('checks within, templates and a module width', () => {
    const shell: PageTemplate = {
      id: 'shell',
      frames: [{ name: 'a' }],
      width: mm(20),
      groups: [
        { name: 'g', modules: true, kind: 'row' },
        { name: 'h', modules: true, within: 'g' },
        { name: 'i', modules: true, templates: ['aviso'] },
        { name: 'j', frames: ['a'], within: 'g' },
        { name: 'k', modules: true, within: 'g', overflow: { continueIn: 'next-page' } },
        // #1095: a loop of groups inside each other leads to no group.
        { name: 'l', modules: true, within: 'm' },
        { name: 'm', modules: true, within: 'l' },
      ],
    };
    const bad: PageTemplate = { ...NOTICE_MODULE, width: 'half' as never };
    const ws = validatePageTemplates({ ...ROWS_CONFIG, pageTemplates: [shell, bad] }).map((w) => [w.kind, w.path]);
    expect(ws).toContainEqual(['unknownConfigValue', '/pageTemplates/0/width']);
    // Inside a row (#1095): as inside a stack.
    expect(ws).not.toContainEqual(['unknownConfigValue', '/pageTemplates/0/groups/1/within']);
    expect(ws).toContainEqual(['unknownConfigValue', '/pageTemplates/0/groups/5/within']);
    expect(ws).toContainEqual(['unknownConfigValue', '/pageTemplates/0/groups/6/within']);
    expect(ws).toContainEqual(['unknownConfigValue', '/pageTemplates/0/groups/2/templates']);
    expect(ws).toContainEqual(['unknownConfigValue', '/pageTemplates/0/groups/3/within']);
    expect(ws).toContainEqual(['unknownConfigValue', '/pageTemplates/0/groups/4/overflow/continueIn']);
    expect(ws).toContainEqual(['unknownConfigValue', '/pageTemplates/1/width']);
    const resolved = resolvePageTemplate({ pageTemplates: [shell, bad] }, 'shell')!;
    expect(resolved.groups.find((g) => g.name === 'h')!.within).toBe('g');
    expect(resolved.groups.find((g) => g.name === 'l')!.within).toBeUndefined();
    expect(resolvePageTemplate({ pageTemplates: [shell, bad] }, 'aviso')!.width).toBeUndefined();
  });

  it('lays a stack without groups inside it as before', () => {
    const doc = build(rowsPage('en', [noticeModule('en', 0), noticeModule('en', 1)]), withTemplates({ ...ROWS_TEMPLATE, groups: [ROWS_TEMPLATE.groups![0]!] }, NOTICE_MODULE));
    const page = composedPagesOf(doc)[0]!;
    const [a1, a2] = [moduleBox(page, 'aviso[1]'), moduleBox(page, 'aviso[2]')];
    expect(a1.width).toBeCloseTo(page.contentArea.width, 3);
    expect(a2.y).toBeCloseTo(bottom(a1) + 8 * MM, 3);
  });
});
