import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { validatePageTemplates } from '../../../composed/validate.js';
import { resolvePageTemplate } from '../../../composed/templates.js';
import { composedOrder } from '../../../composed/groups.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { ContentWarning, PostextConfig, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';
import { MODULE_RESOURCES, mm } from '../fixtures/modules.js';
import { CARD_MODULE, NOTICE_MODULE, ROWS_TEMPLATE, cardModule, noticeModule } from '../fixtures/moduleRows.js';
import { NARROW_MODULE, NESTED_CONFIG, NESTED_TEMPLATE, WIDE_MODULE, boxOf, nestedPage } from '../fixtures/moduleNesting.js';

// #1095 (DESIGN §13): modules nested more than one level, `grow` and
// `shrink` among the modules of a row, the ordering dependency of a page
// frame anchored to a nested group, `rowAlign: 'stretch'` on a module's
// 'auto' boxes, and the frame of an unknown look marked in the VDT.

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
  buildDocument({ markdown, resources: MODULE_RESOURCES }, { ...NESTED_CONFIG, ...config }, createMeasurementCache());
const pageOf = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const frame = (page: VDTPage, name: string): VDTFrame => page.composed!.frames.find((f) => f.name === name)!;
const moduleBox = (page: VDTPage, name: string) => page.composed!.modules!.find((m) => m.name === name)!.rect!;
const bottom = (r: { y: number; height: number }): number => r.y + r.height;
const kinds = (doc: VDTDocument): ContentWarning['kind'][] => (doc.contentWarnings ?? []).map((w) => w.kind);
const withTemplates = (...templates: PageTemplate[]): Partial<PostextConfig> => ({ pageTemplates: templates });

describe('a column of cards inside a row inside the page\'s stack (#1095)', () => {
  const page = pageOf(build(nestedPage('en'), { locale: 'en' }));

  it('routes each module to its innermost group', () => {
    const t = resolvePageTemplate(NESTED_CONFIG, 'anidada', { modules: [{ name: 'aviso[1]', template: 'aviso' }, { name: 'tarjeta[1]', template: 'tarjeta' }, { name: 'ancho[1]', template: 'ancho' }] })!;
    expect(t.modules!.map((m) => [m.name, m.nested])).toEqual([['aviso[1]', 'banda'], ['tarjeta[1]', 'columna'], ['ancho[1]', 'reparto']]);
    expect(validatePageTemplates(NESTED_CONFIG)).toEqual([]);
  });

  it('lays the box in the row\'s first cell and the cards one under another in its second', () => {
    const area = page.contentArea;
    const half = (area.width - 6 * MM) / 2;
    const box = moduleBox(page, 'aviso[1]');
    const [c1, c2] = [moduleBox(page, 'tarjeta[1]'), moduleBox(page, 'tarjeta[2]')];
    expect(box.x).toBeCloseTo(area.x, 3);
    expect(box.width).toBeCloseTo(half, 3);
    for (const c of [c1, c2]) {
      expect(c.x).toBeCloseTo(area.x + half + 6 * MM, 3);
      expect(c.width).toBeCloseTo(half, 3);
    }
    expect(c1.y).toBeCloseTo(box.y, 3);
    // The column's own gap between its cards.
    expect(c2.y).toBeCloseTo(bottom(c1) + 4 * MM, 3);
    // The row is as tall as the column: the next row starts under it.
    expect(moduleBox(page, 'ancho[1]').y).toBeCloseTo(bottom(c2) + 14 * MM, 3);
    expect(frame(page, 'tarjeta[2].foto').rect.x).toBeCloseTo(c2.x, 3);
    expect(kinds(build(nestedPage('en')))).toEqual([]);
  });

  it('gives each group inside the stack the box of its modules, at every depth', () => {
    // The note hangs under the row it names: the row's box takes the
    // column inside it.
    const note = frame(page, 'nota');
    expect(note.rect.y).toBeCloseTo(bottom(moduleBox(page, 'tarjeta[2]')) + 3 * MM, 3);
  });

  it('places a page frame anchored to a nested group after the modules group', () => {
    const t = resolvePageTemplate(NESTED_CONFIG, 'anidada', { modules: [{ name: 'aviso[1]', template: 'aviso' }] })!;
    const order = composedOrder(t).map((s) => (s.kind === 'frame' ? s.frame.name : `#${s.group.name}`));
    expect(order.indexOf('nota')).toBeGreaterThan(order.indexOf('#cuerpo'));
  });

  it('keeps the frame ids in the other language, and moves what follows by the row\'s growth', () => {
    const es = pageOf(build(nestedPage('es'), { locale: 'es' }));
    expect(es.composed!.frames.map((f) => f.id)).toEqual(page.composed!.frames.map((f) => f.id));
    const rowFoot = (p: VDTPage) => Math.max(bottom(moduleBox(p, 'aviso[1]')), bottom(moduleBox(p, 'tarjeta[2]')));
    expect(moduleBox(es, 'ancho[1]').y - moduleBox(page, 'ancho[1]').y).toBeCloseTo(rowFoot(es) - rowFoot(page), 3);
  });

  it('lays a group inside a grid of modules as one cell', () => {
    const shell: PageTemplate = {
      ...ROWS_TEMPLATE,
      id: 'rejilla',
      groups: [
        { name: 'cuerpo', modules: true, kind: 'grid', columns: 2, columnGap: mm(5), rowGap: mm(5), placement: ROWS_TEMPLATE.groups![0]!.placement },
        { name: 'pila', modules: true, within: 'cuerpo', templates: ['tarjeta'], gap: mm(3) },
      ],
    };
    const md = `::::page{template="rejilla"}\n# T\n\n${[noticeModule('en', 0), cardModule('en', 0), cardModule('en', 1), noticeModule('en', 1)].join('\n')}::::\n`;
    const p = pageOf(build(md, withTemplates(shell, NOTICE_MODULE, CARD_MODULE)));
    const colW = (p.contentArea.width - 5 * MM) / 2;
    // Cells: the box, the two cards (one cell), the second box.
    expect(moduleBox(p, 'tarjeta[1]').x).toBeCloseTo(p.contentArea.x + colW + 5 * MM, 3);
    expect(moduleBox(p, 'tarjeta[2]').x).toBeCloseTo(moduleBox(p, 'tarjeta[1]').x, 3);
    expect(moduleBox(p, 'tarjeta[2]').y).toBeCloseTo(bottom(moduleBox(p, 'tarjeta[1]')) + 3 * MM, 3);
    expect(moduleBox(p, 'aviso[2]').x).toBeCloseTo(p.contentArea.x, 3);
    expect(moduleBox(p, 'aviso[2]').y).toBeCloseTo(bottom(moduleBox(p, 'tarjeta[2]')) + 5 * MM, 3);
  });
});

describe('modules of a row share its room by grow and shrink (#1095)', () => {
  it('gives the room past the widths by grow', () => {
    const page = pageOf(build(nestedPage('en')));
    const area = page.contentArea;
    const spare = area.width - 60 * MM - 30 * MM - 5 * MM;
    const [wide, narrow] = [moduleBox(page, 'ancho[1]'), moduleBox(page, 'estrecho[1]')];
    expect(wide.width).toBeCloseTo(60 * MM + (spare * 2) / 3, 3);
    expect(narrow.width).toBeCloseTo(30 * MM + spare / 3, 3);
    expect(narrow.x).toBeCloseTo(wide.x + wide.width + 5 * MM, 3);
    expect(narrow.x + narrow.width).toBeCloseTo(area.x + area.width, 3);
  });

  it('shares with a \'fill\' module, which takes one share at least', () => {
    const shell: PageTemplate = { ...NESTED_TEMPLATE, groups: [NESTED_TEMPLATE.groups![0]!, { name: 'reparto', modules: true, kind: 'row', within: 'cuerpo', gap: mm(5) }] };
    const md = `::::page{template="anidada"}\n# T\n\n${[boxOf('ancho', 'en', 0), noticeModule('en', 1)].join('\n')}::::\n`;
    const page = pageOf(build(md, withTemplates(shell, NOTICE_MODULE, WIDE_MODULE)));
    const spare = page.contentArea.width - 60 * MM - 5 * MM;
    expect(moduleBox(page, 'ancho[1]').width).toBeCloseTo(60 * MM + (spare * 2) / 3, 3);
    expect(moduleBox(page, 'aviso[1]').width).toBeCloseTo(spare / 3, 3);
  });

  it('gives width back by shrink, in proportion to each width, when the widths run past the end', () => {
    const big: PageTemplate = { ...WIDE_MODULE, width: mm(120), grow: undefined, shrink: 1 };
    const small: PageTemplate = { ...NARROW_MODULE, width: mm(80), grow: undefined, shrink: 1 };
    const md = `::::page{template="anidada"}\n# T\n\n${[boxOf('ancho', 'en', 0), boxOf('estrecho', 'en', 1)].join('\n')}::::\n`;
    const page = pageOf(build(md, withTemplates(NESTED_TEMPLATE, NOTICE_MODULE, CARD_MODULE, big, small)));
    const area = page.contentArea;
    const short = 120 * MM + 80 * MM + 5 * MM - area.width;
    expect(short).toBeGreaterThan(0);
    const [a, b] = [moduleBox(page, 'ancho[1]'), moduleBox(page, 'estrecho[1]')];
    expect(a.width).toBeCloseTo(120 * MM - (short * 120) / 200, 3);
    expect(b.width).toBeCloseTo(80 * MM - (short * 80) / 200, 3);
    expect(b.x + b.width).toBeCloseTo(area.x + area.width, 3);
    // Without shrink the row runs past the group's end, as before.
    const stiff = pageOf(build(md, withTemplates(NESTED_TEMPLATE, NOTICE_MODULE, CARD_MODULE, { ...big, shrink: undefined }, { ...small, shrink: undefined })));
    expect(moduleBox(stiff, 'estrecho[1]').width).toBeCloseTo(80 * MM, 3);
  });

  it('resolves and checks grow and shrink', () => {
    expect(resolvePageTemplate(NESTED_CONFIG, 'ancho')).toMatchObject({ grow: 2 });
    expect(resolvePageTemplate({ pageTemplates: [{ ...WIDE_MODULE, grow: -1, shrink: 'mucho' as never }] }, 'ancho')!.grow).toBeUndefined();
    const ws = validatePageTemplates({ ...NESTED_CONFIG, pageTemplates: [{ ...NESTED_TEMPLATE, grow: 1 }, { ...WIDE_MODULE, grow: -1, shrink: 'mucho' as never }] }).map((w) => [w.kind, w.path]);
    expect(ws).toContainEqual(['unknownConfigValue', '/pageTemplates/0/grow']);
    expect(ws).toContainEqual(['unknownConfigValue', '/pageTemplates/1/grow']);
    expect(ws).toContainEqual(['unknownConfigValue', '/pageTemplates/1/shrink']);
  });
});

describe('rowAlign: \'stretch\' reaches a module\'s \'auto\' boxes (#1095)', () => {
  const shellOf = (rowAlign?: 'start' | 'stretch'): PageTemplate => ({
    ...ROWS_TEMPLATE,
    id: 'fila',
    groups: [{ name: 'cuerpo', modules: true, kind: 'row', gap: mm(6), ...(rowAlign ? { rowAlign } : {}), placement: ROWS_TEMPLATE.groups![0]!.placement }],
  });
  const md = `::::page{template="fila"}\n# T\n\n${[noticeModule('es', 0), noticeModule('es', 1)].join('\n')}::::\n`;

  it('makes the shorter box as tall as the row', () => {
    const page = pageOf(build(md, withTemplates(shellOf(), NOTICE_MODULE)));
    const [tall, short] = [frame(page, 'aviso[1].texto').rect, frame(page, 'aviso[2].texto').rect];
    expect(bottom(short)).toBeCloseTo(bottom(tall), 3);
    expect(short.y).toBeCloseTo(tall.y, 3);
    // The template asked for it: no motion in the log.
    expect(page.composed!.log.filter((e) => e.frame === 'aviso[2].texto')).toEqual([]);
  });

  it('leaves it at its content\'s height with rowAlign: \'start\'', () => {
    const page = pageOf(build(md, withTemplates(shellOf('start'), NOTICE_MODULE)));
    expect(bottom(frame(page, 'aviso[1].texto').rect) - bottom(frame(page, 'aviso[2].texto').rect)).toBeGreaterThan(2 * MM);
  });

  it('keeps a frame as wide as its content (a pill) at its height', () => {
    const cards = `::::page{template="fila"}\n# T\n\n${[noticeModule('es', 0), cardModule('es', 0)].join('\n')}::::\n`;
    const page = pageOf(build(cards, withTemplates(shellOf(), NOTICE_MODULE, CARD_MODULE)));
    const pill = frame(page, 'tarjeta[1].pie').rect;
    const plain = pageOf(build(cards, withTemplates(shellOf('start'), NOTICE_MODULE, CARD_MODULE)));
    expect(pill.height).toBeCloseTo(frame(plain, 'tarjeta[1].pie').rect.height, 3);
  });
});

describe('a frame whose look is unknown (#1095)', () => {
  it('carries the look\'s name on the frame', () => {
    const md = `::::page{template="fila"}\n# T\n\n:::module{template="aviso"}\n:::frame{slot="texto" look="azul"}\nPalabras.\n:::\n:::\n::::\n`;
    const shell: PageTemplate = { ...ROWS_TEMPLATE, id: 'fila', groups: [ROWS_TEMPLATE.groups![0]!] };
    const doc = build(md, { ...withTemplates(shell, NOTICE_MODULE), frameLooks: [{ id: 'verde', background: { hex: '#00aa00', model: 'hex' } as never }] });
    expect(frame(pageOf(doc), 'aviso[1].texto').lookUnknown).toBe('azul');
    const known = build(md.replace('azul', 'verde'), { ...withTemplates(shell, NOTICE_MODULE), frameLooks: [{ id: 'verde', background: { hex: '#00aa00', model: 'hex' } as never }] });
    expect(frame(pageOf(known), 'aviso[1].texto').lookUnknown).toBeUndefined();
  });
});
