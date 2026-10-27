import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { formatWarning } from '../../../pipeline/contentWarnings.js';
import { validatePageTemplates } from '../../../composed/validate.js';
import { resolvePageTemplate } from '../../../composed/templates.js';
import { composedPages } from '../../../composed/document.js';
import { elementsForSource, findElement } from '../../../composed/sourceMap.js';
import { clearComposedPageMemo, composedPageMemoStats, setComposedPageMemo } from '../../../composed/pageMemo.js';
import { parseMarkdown } from '../../../parse/index.js';
import { flowRectToPage } from '../../../vdt.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { ContentWarning, DesignConnectorElement, DesignElement, PostextConfig, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';
import { BOX_MODULE, boxModule, MODULE_CONFIG, MODULE_RESOURCES, TOPIC_TEMPLATE, TOPIC_WORDS, topicPage, TREE_MODULE, treeModule } from '../fixtures/modules.js';

// #1062 (DESIGN §12.7): module templates a page stacks in its modules
// group, one per `:::module` block, their frames scoped by the instance.

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
  buildDocument({ markdown, resources: MODULE_RESOURCES }, { ...MODULE_CONFIG, ...config }, createMeasurementCache());
const composedPagesOf = (doc: VDTDocument): VDTPage[] => doc.pages.filter((p) => p.composed);
const frame = (page: VDTPage, name: string): VDTFrame => page.composed!.frames.find((f) => f.name === name)!;
const warningsOf = <K extends ContentWarning['kind']>(doc: VDTDocument, kind: K) => (doc.contentWarnings ?? []).filter((w): w is Extract<ContentWarning, { kind: K }> => w.kind === kind);
const textOf = (page: VDTPage, f: VDTFrame): string => f.blockIds.map((id) => (page.floats ?? []).find((b) => b.id === id)).flatMap((b) => b?.lines.map((l) => l.text) ?? []).join(' ').trim();
const bottom = (f: VDTFrame): number => f.rect.y + f.rect.height;
const withTemplates = (...templates: PageTemplate[]): Partial<PostextConfig> => ({ pageTemplates: templates });
/** The page shell whose modules go on, whole, on a next page. */
const goingOn: PageTemplate = { ...TOPIC_TEMPLATE, groups: [{ ...TOPIC_TEMPLATE.groups![0]!, overflow: { continueIn: 'next-page' } }] };

describe('a page built from modules (#1062)', () => {
  const pages = { en: composedPagesOf(build(topicPage('en'), { locale: 'en' }))[0]!, es: composedPagesOf(build(topicPage('es'), { locale: 'es' }))[0]! };

  it('lays the three modules one under another, their frames scoped by the instance', () => {
    const page = pages.en;
    expect(page.composed!.frames.map((f) => f.name)).toEqual([
      'titulo',
      'caja[1].texto', 'caja[1].foto',
      'arbol[1].raiz', 'arbol[1].izq', 'arbol[1].der',
      'fotos[1].cabecera', 'fotos[1].foto[1]', 'fotos[1].pie[1]', 'fotos[1].foto[2]', 'fotos[1].pie[2]', 'fotos[1].foto[3]', 'fotos[1].pie[3]', 'fotos[1].foto[4]', 'fotos[1].pie[4]',
    ]);
    // Ids, and each frame's entry in its module template.
    expect(frame(page, 'arbol[1].izq').id).toBe('cp0:arbol[1].izq');
    expect(frame(page, 'arbol[1].izq').configPath).toBe('/pageTemplates/2/frames/1');
    expect(frame(page, 'fotos[1].pie[3]').configPath).toBe('/pageTemplates/3/frames/2');
    expect(page.composed!.modules?.map((m) => [m.name, m.template, m.configPath])).toEqual([
      ['caja[1]', 'caja', '/pageTemplates/1'], ['arbol[1]', 'arbol', '/pageTemplates/2'], ['fotos[1]', 'fotos', '/pageTemplates/3'],
    ]);
    // Each module as wide as the group, from the foot of the one before
    // it, 8 mm on.
    const [caja, arbol, fotos] = page.composed!.modules!.map((m) => m.rect!);
    const area = page.contentArea;
    for (const r of [caja!, arbol!, fotos!]) {
      expect(r.x).toBeCloseTo(area.x, 3);
      expect(r.width).toBeCloseTo(area.width, 3);
    }
    expect(caja!.y).toBeCloseTo(bottom(frame(page, 'titulo')) + 6 * MM, 3);
    expect(arbol!.y).toBeCloseTo(caja!.y + caja!.height + 8 * MM, 3);
    expect(fotos!.y).toBeCloseTo(arbol!.y + arbol!.height + 8 * MM, 3);
    // A module is as tall as its frames: the box's tab room, its text and
    // its photo; the tree's root and branches.
    expect(caja!.height).toBeCloseTo(Math.max(bottom(frame(page, 'caja[1].texto')), bottom(frame(page, 'caja[1].foto'))) - caja!.y, 3);
    expect(arbol!.y + arbol!.height).toBeCloseTo(bottom(frame(page, 'arbol[1].izq')), 3);
    // Frames anchored to `'container'` read their module's box.
    expect(frame(page, 'caja[1].texto').rect.y).toBeCloseTo(caja!.y + 6.4 * MM, 3);
    expect(frame(page, 'caja[1].texto').rect.width).toBeCloseTo(area.width * 0.64, 3);
    const raiz = frame(page, 'arbol[1].raiz');
    expect(raiz.rect.x + raiz.rect.width / 2).toBeCloseTo(area.x + area.width / 2, 3);
    expect(raiz.rect.y).toBeCloseTo(arbol!.y + 4 * MM, 3);
    // …and anchors inside a module read its own frames.
    expect(frame(page, 'arbol[1].izq').rect.x).toBeCloseTo(raiz.rect.x - 44 * MM, 3);
    expect(frame(page, 'arbol[1].der').rect.y).toBeCloseTo(bottom(raiz) + 10 * MM, 3);
    expect(frame(page, 'caja[1].foto').rect.x).toBeCloseTo(frame(page, 'caja[1].texto').rect.x + frame(page, 'caja[1].texto').rect.width + 5 * MM, 3);
    // Each frame holds its own module's content.
    expect(textOf(page, frame(page, 'arbol[1].der'))).toBe(TOPIC_WORDS.en.tree[2]);
    expect(textOf(page, frame(page, 'fotos[1].cabecera'))).toBe(TOPIC_WORDS.en.photos);
    expect(textOf(page, frame(page, 'caja[1].texto'))).toContain('mountains');
  });

  it('lays a grid inside a module: 2 × 2 cards in its box', () => {
    const page = pages.en;
    const fotos = [1, 2, 3, 4].map((k) => frame(page, `fotos[1].foto[${k}]`));
    expect(fotos[1]!.repeat).toEqual({ frame: 'fotos[1].foto', item: 2 });
    const colW = (120 - 6) / 2;
    for (const f of fotos) expect(f.rect.width).toBeCloseTo(colW * MM, 3);
    expect(fotos[1]!.rect.x).toBeCloseTo(fotos[0]!.rect.x + (colW + 6) * MM, 3);
    expect(fotos[2]!.rect.x).toBeCloseTo(fotos[0]!.rect.x, 3);
    expect(fotos[2]!.rect.y).toBeGreaterThan(bottom(frame(page, 'fotos[1].pie[1]')));
    expect(textOf(page, frame(page, 'fotos[1].pie[4]'))).toBe(TOPIC_WORDS.en.captions[3]);
    // The module's foot is its last row's pills.
    expect(page.composed!.modules![2]!.rect!.y + page.composed!.modules![2]!.rect!.height).toBeCloseTo(bottom(frame(page, 'fotos[1].pie[3]')), 3);
  });

  it('moves the modules after one that grows down by as much, in the other language', () => {
    const [en, es] = [pages.en.composed!.modules!, pages.es.composed!.modules!];
    const grew = es[0]!.rect!.height - en[0]!.rect!.height;
    expect(grew).toBeGreaterThan(1 * MM);
    expect(es[1]!.rect!.y - en[1]!.rect!.y).toBeCloseTo(grew, 3);
    expect(es[2]!.rect!.y - en[2]!.rect!.y).toBeCloseTo(grew, 3);
    expect(frame(pages.es, 'fotos[1].foto[1]').rect.y - frame(pages.en, 'fotos[1].foto[1]').rect.y).toBeCloseTo(grew, 3);
    // The same ids in both languages.
    expect(pages.es.composed!.frames.map((f) => f.id)).toEqual(pages.en.composed!.frames.map((f) => f.id));
  });

  it('raises nothing on the fixture page', () => {
    for (const lang of ['en', 'es'] as const) {
      const doc = build(topicPage(lang), { locale: lang });
      const kinds = (doc.contentWarnings ?? []).map((w) => w.kind);
      expect(kinds).toEqual([]);
      expect(validatePageTemplates({ ...MODULE_CONFIG })).toEqual([]);
    }
  });

  it('draws a module\'s decoration in its own box', () => {
    const page = pages.en;
    const deco = page.composed!.decoration!.blocks;
    const ground = deco.find((b) => b.elementId === 'arbol[1].suelo')!;
    expect(ground).toBeDefined();
    const box = flowRectToPage(page, page.composed!.modules![1]!.rect!);
    expect(ground.bbox.x).toBeCloseTo(box.x, 3);
    expect(ground.bbox.y).toBeCloseTo(box.y, 3);
    expect(ground.bbox.width).toBeCloseTo(box.width, 3);
    expect(ground.bbox.height).toBeCloseTo(box.height, 3);
    // Anchored to its own frame: the trunk under the root.
    const trunk = deco.find((b) => b.elementId === 'arbol[1].tronco')!;
    const raiz = flowRectToPage(page, frame(page, 'arbol[1].raiz').rect);
    expect(trunk.bbox.y).toBeCloseTo(raiz.y + raiz.height, 3);
  });

  it('lays two instances of one module, each with its own name and content', () => {
    const md = topicPage('en', [treeModule('en'), treeModule('es', ' name="segundo"'), treeModule('en')]);
    const doc = build(md);
    const page = composedPagesOf(doc)[0]!;
    expect(page.composed!.modules!.map((m) => m.name)).toEqual(['arbol[1]', 'segundo', 'arbol[3]']);
    expect(textOf(page, frame(page, 'arbol[1].raiz'))).toBe(TOPIC_WORDS.en.tree[0]);
    expect(textOf(page, frame(page, 'segundo.raiz'))).toBe(TOPIC_WORDS.es.tree[0]);
    expect(frame(page, 'segundo.izq').rect.y).toBeGreaterThan(bottom(frame(page, 'arbol[1].izq')));
    expect(frame(page, 'arbol[3].raiz').rect.y).toBeGreaterThan(bottom(frame(page, 'segundo.izq')));
    // Each instance's decoration, scoped and in its box.
    const grounds = page.composed!.decoration!.blocks.filter((b) => b.elementId?.endsWith('.suelo')).map((b) => b.elementId);
    expect(grounds).toEqual(['arbol[1].suelo', 'segundo.suelo', 'arbol[3].suelo']);
    expect(doc.contentWarnings ?? []).toEqual([]);
  });

  it('sends whole modules that do not fit on to a next page', () => {
    const trees = Array.from({ length: 7 }, () => treeModule('en'));
    const doc = build(topicPage('en', trees), withTemplates(goingOn, BOX_MODULE, TREE_MODULE));
    const [first, second] = composedPagesOf(doc);
    expect(second).toBeDefined();
    const laidOn = (p: VDTPage) => p.composed!.modules!.filter((m) => m.rect).map((m) => m.name);
    const here = laidOn(first!);
    const there = laidOn(second!);
    expect(here.length).toBeGreaterThan(2);
    expect([...here, ...there]).toEqual(Array.from({ length: 7 }, (_, k) => `arbol[${k + 1}]`));
    // Every module is whole on one page, nothing cut.
    const area = first!.contentArea;
    for (const f of first!.composed!.frames) expect(bottom(f)).toBeLessThanOrEqual(area.y + area.height + 0.5);
    expect(warningsOf(doc, 'frameOverflow')).toEqual([]);
    // On the next page the modules start at the group's top (the title
    // takes no room there), named and laid as on the fence's page.
    const k = here.length + 1;
    const raiz = frame(second!, `arbol[${k}].raiz`);
    expect(raiz.id).toBe(`cp0:arbol[${k}].raiz~1`);
    expect(textOf(second!, raiz)).toBe(TOPIC_WORDS.en.tree[0]);
    expect(frame(second!, 'titulo').collapsed).toBe(true);
    expect(second!.composed!.modules!.find((m) => m.name === `arbol[${k}]`)!.rect!.y).toBeCloseTo(first!.composed!.modules![0]!.rect!.y - frame(first!, 'titulo').rect.height, 3);
    expect(second!.composed!.continuationOf).toBe(first!.index);
    // The sending page's log says where each frame went.
    const went = first!.composed!.log.filter((e) => e.kind === 'continued');
    expect(went.map((e) => e.frame)).toContain(`arbol[${k}].raiz`);
    expect(went.every((e) => e.toPage === second!.index)).toBe(true);
    // A module's decoration only where it is laid.
    const grounds = (p: VDTPage) => p.composed!.decoration!.blocks.filter((b) => b.elementId?.endsWith('.suelo')).length;
    expect(grounds(first!)).toBe(here.length);
    expect(grounds(second!)).toBe(there.length);
  });

  it('cuts the modules that do not fit at the group\'s foot when it cannot go on, and warns once', () => {
    const trees = Array.from({ length: 7 }, () => treeModule('en'));
    const doc = build(topicPage('en', trees), withTemplates(TOPIC_TEMPLATE, TREE_MODULE));
    expect(composedPagesOf(doc)).toHaveLength(1);
    const page = composedPagesOf(doc)[0]!;
    const area = page.contentArea;
    for (const f of page.composed!.frames) expect(bottom(f)).toBeLessThanOrEqual(area.y + area.height + 0.5);
    const over = warningsOf(doc, 'frameOverflow');
    expect(over).toHaveLength(1);
    expect(over[0]!.frame.startsWith('arbol[7].')).toBe(true);
  });

  it('mirrors the modules on a right-to-left page', () => {
    const ltr = composedPagesOf(build(topicPage('en')))[0]!;
    const rtl = composedPagesOf(build(topicPage('en'), { direction: 'rtl', locale: 'ar' } as PostextConfig))[0]!;
    const x = (p: VDTPage, n: string) => flowRectToPage(p, frame(p, n).rect).x;
    // The box's text starts on the right, its photo to its left.
    expect(x(rtl, 'caja[1].texto')).toBeGreaterThan(x(rtl, 'caja[1].foto'));
    expect(x(ltr, 'caja[1].texto')).toBeLessThan(x(ltr, 'caja[1].foto'));
    // The grid's cards from the right.
    expect(x(rtl, 'fotos[1].foto[1]')).toBeGreaterThan(x(rtl, 'fotos[1].foto[2]'));
    // The tree's left branch is on the page's start side.
    expect(x(rtl, 'arbol[1].izq')).toBeGreaterThan(x(rtl, 'arbol[1].der'));
  });

  it('maps a module\'s frames to their Markdown and their config', () => {
    const md = topicPage('en');
    const doc = build(md);
    const el = findElement(doc, 'cp0:arbol[1].der')?.element;
    expect(el?.level).toBe('frame');
    expect(el?.source).toEqual({ kind: 'config', path: '/pageTemplates/2/frames/2' });
    const word = TOPIC_WORDS.en.tree[2]!;
    const at = md.indexOf(word);
    const hits = elementsForSource(doc, at, at + word.length).map((h) => h.element.id);
    expect(hits.some((id) => id.startsWith('cp0:arbol[1].der'))).toBe(true);
    expect(hits.some((id) => id.startsWith('cp0:arbol[1].izq'))).toBe(false);
  });

  it('keeps a page of modules in the page memo, the same as laid afresh', () => {
    const md = topicPage('es');
    setComposedPageMemo(true);
    clearComposedPageMemo();
    try {
      const fresh = build(md);
      const before = composedPageMemoStats();
      const again = build(md);
      expect(composedPageMemoStats().hits).toBeGreaterThan(before.hits);
      const ids = (d: VDTDocument) => composedPagesOf(d)[0]!.composed!.frames.map((f) => `${f.id} ${f.rect.x.toFixed(3)} ${f.rect.y.toFixed(3)} ${f.blockIds.join(',')}`);
      expect(ids(again)).toEqual(ids(fresh));
      expect(composedPagesOf(again)[0]!.composed!.modules).toEqual(composedPagesOf(fresh)[0]!.composed!.modules);
    } finally {
      clearComposedPageMemo();
      setComposedPageMemo(true);
    }
  });

  it('sends a module\'s content that names no slot to its flow frame', () => {
    const flowing: PageTemplate = { ...BOX_MODULE, id: 'nota', frames: [{ name: 'cuerpo', style: 'recuadro', flow: true }] };
    const md = '::::page{template="tema"}\n# T\n\n:::module{template="nota"}\nLoose words of the note.\n:::\n::::\n';
    const doc = build(md, withTemplates(TOPIC_TEMPLATE, flowing));
    const page = composedPagesOf(doc)[0]!;
    expect(textOf(page, frame(page, 'nota[1].cuerpo'))).toBe('Loose words of the note.');
    expect(doc.contentWarnings ?? []).toEqual([]);
  });
});

describe('module configuration and checks (#1062)', () => {
  it('extends a module from a module', () => {
    const wide: PageTemplate = { id: 'caja-ancha', extends: 'caja', frames: [{ name: 'texto', width: { percent: 80 } }, { name: 'foto', remove: true }] };
    const config = { ...MODULE_CONFIG, pageTemplates: [...MODULE_CONFIG.pageTemplates!, wide] };
    expect(resolvePageTemplate(config, 'caja-ancha')!.role).toBe('module');
    const md = `::::page{template="tema"}\n# T\n\n${boxModule('en').replace('template="caja"', 'template="caja-ancha"').replace(/::resource\{[^}]*\}\n/, '')}::::\n`;
    const doc = build(md, { pageTemplates: config.pageTemplates });
    const page = composedPagesOf(doc)[0]!;
    expect(page.composed!.frames.map((f) => f.name)).toEqual(['titulo', 'caja-ancha[1].texto']);
    expect(frame(page, 'caja-ancha[1].texto').rect.width).toBeCloseTo(page.contentArea.width * 0.8, 3);
    expect(frame(page, 'caja-ancha[1].texto').configPath).toBe('/pageTemplates/4/frames/0');
  });

  it('expands the page\'s modules when resolving its template', () => {
    const t = resolvePageTemplate(MODULE_CONFIG, 'tema', { modules: [{ name: 'a', template: 'arbol' }, { name: 'b', template: 'caja' }] })!;
    expect(t.frames.map((f) => f.name)).toEqual(['titulo', 'a.raiz', 'a.izq', 'a.der', 'b.texto', 'b.foto']);
    expect(t.frames.find((f) => f.name === 'a.izq')!.placement!.anchor.to).toBe('#a.raiz');
    expect(t.groups[0]).toMatchObject({ name: 'cuerpo', modules: true, frames: ['a.raiz', 'a.izq', 'a.der', 'b.texto', 'b.foto'], items: [{ item: 1, frames: ['a.raiz', 'a.izq', 'a.der'], module: 'a' }, { item: 2, frames: ['b.texto', 'b.foto'], module: 'b' }] });
    // Decoration anchored to the module's `'container'` reads its box.
    const ground = t.decoration.elements.find((e) => e.id === 'a.suelo')! as Extract<DesignElement, { placement: unknown }>;
    expect(ground.placement.anchor.to).toBe('#a');
    expect(t.modules!.map((m) => m.name)).toEqual(['a', 'b']);
    // Without modules: the shell as it is, cached apart.
    expect(resolvePageTemplate(MODULE_CONFIG, 'tema')!.frames.map((f) => f.name)).toEqual(['titulo']);
    // Unknown uses are left out.
    expect(resolvePageTemplate(MODULE_CONFIG, 'tema', { modules: [{ name: 'x', template: 'nada' }] })!.modules).toBeUndefined();
  });

  it('scopes a connector\'s ends to the module instance', () => {
    const tree = (MODULE_CONFIG.pageTemplates ?? []).find((t) => t.id === 'arbol')!;
    const joined: PageTemplate = {
      ...tree,
      decoration: {
        elements: [
          ...(tree.decoration?.elements ?? []),
          { kind: 'connector', id: 'lineas', routing: 'tree', from: { to: '#raiz' }, to: [{ to: '#izq' }, { to: '#der' }] },
        ],
      },
    };
    const config = { ...MODULE_CONFIG, pageTemplates: (MODULE_CONFIG.pageTemplates ?? []).map((t) => (t.id === 'arbol' ? joined : t)) };
    const t = resolvePageTemplate(config, 'tema', { modules: [{ name: 'a', template: 'arbol' }, { name: 'b', template: 'arbol' }] })!;
    const lines = t.decoration.elements.filter((e): e is DesignConnectorElement => e.kind === 'connector');
    expect(lines.map((e) => e.id)).toEqual(['a.lineas', 'b.lineas']);
    expect(lines[1]!.from.to).toBe('#b.raiz');
    expect((lines[1]!.to as { to: string }[]).map((e) => e.to)).toEqual(['#b.izq', '#b.der']);
  });

  it('scopes the slots of a :::module by its name in the parser', () => {
    const blocks = parseMarkdown(topicPage('en', [treeModule('en', ' name="t"'), treeModule('en')]));
    const page = composedPages(blocks)[0]!;
    expect(Object.keys(page.slots)).toEqual(['t.raiz', 't.izq', 't.der', 'arbol[2].raiz', 'arbol[2].izq', 'arbol[2].der']);
    expect(page.modules.map((m) => m.fence.name)).toEqual(['t', 'arbol[2]']);
    expect(blocks[0]!.composedPage!.modules!.map((m) => m.name)).toEqual(['t', 'arbol[2]']);
  });

  it('warns about an unknown module, a template that is no module, and a page with no modules group', () => {
    const plain: PageTemplate = { id: 'plana', header: false, frames: [{ name: 'texto', flow: true }] };
    const md = '::::page{template="tema"}\n# T\n\n:::module{template="nada"}\nA.\n:::\n\n:::module{template="plana"}\nB.\n:::\n::::\n\n::::page{template="plana"}\n:::module{template="arbol"}\n:::frame{slot="raiz"}\nC.\n:::\n:::\n::::\n';
    const doc = build(md, withTemplates(TOPIC_TEMPLATE, TREE_MODULE, plain));
    const unknown = warningsOf(doc, 'moduleUnknown');
    expect(unknown.map((w) => [w.module, w.reason])).toEqual([['nada', 'unknown'], ['plana', 'notModule'], ['arbol', 'noGroup']]);
    expect(md.slice(unknown[0]!.sourceStart, unknown[0]!.sourceEnd)).toBe('nada');
    expect(formatWarning(unknown[0]!)).toContain('Unknown module "nada"');
    // Their content is never lost: it goes to the flow frame (or after the
    // page), with no slotUnknown of its own.
    expect(warningsOf(doc, 'slotUnknown')).toEqual([]);
    const all = doc.pages.flatMap((p) => [...(p.floats ?? []), ...p.columns.flatMap((c) => c.blocks)]).flatMap((b) => b.lines.map((l) => l.text)).join(' ');
    for (const w of ['A.', 'B.', 'C.']) expect(all).toContain(w);
  });

  it('warns about a module used as a page, a module inside a module, and a name taken', () => {
    const md = '::::page{template="arbol"}\nA.\n::::\n\n::::page{template="tema"}\n# T\n\n'
      + ':::module{template="arbol" name="uno"}\n:::module{template="caja"}\nB.\n:::\n:::\n\n'
      + ':::module{template="arbol" name="uno"}\nC.\n:::\n\n:::module{template="arbol" name="dos.x"}\nD.\n:::\n::::\n';
    const doc = build(md);
    expect(warningsOf(doc, 'moduleAsPage').map((w) => w.template)).toEqual(['arbol']);
    expect(warningsOf(doc, 'moduleNested').map((w) => w.module)).toEqual(['caja']);
    const named = warningsOf(doc, 'moduleNameRejected');
    expect(named.map((w) => [w.name, w.used, w.reason])).toEqual([['uno', 'arbol[2]', 'taken'], ['dos.x', 'arbol[3]', 'invalid']]);
    expect(formatWarning(named[0]!)).toContain('named "arbol[2]"');
    const pages = composedPagesOf(doc);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.composed!.modules!.map((m) => m.name)).toEqual(['uno', 'arbol[2]', 'arbol[3]']);
  });

  it('checks what a module template may not have, and the modules group', () => {
    const bad: PageTemplate = { id: 'mala', role: 'module', area: 'trim', header: false, spread: true, frames: [{ name: 'a' }], groups: [{ name: 'g', modules: true }] };
    const shell: PageTemplate = { id: 'shell', frames: [{ name: 'a' }], groups: [{ name: 'g', modules: true, kind: 'row', frames: ['a'], overflow: { continueIn: '#a' } }, { name: 'h', overflow: { continueIn: 'next-page' } }] };
    const ws = validatePageTemplates({ ...MODULE_CONFIG, pageTemplates: [bad, shell] }).map((w) => [w.kind, w.path]);
    expect(ws).toContainEqual(['unknownConfigValue', '/pageTemplates/0/area']);
    expect(ws).toContainEqual(['unknownConfigValue', '/pageTemplates/0/header']);
    expect(ws).toContainEqual(['unknownConfigValue', '/pageTemplates/0/spread']);
    expect(ws).toContainEqual(['unknownConfigValue', '/pageTemplates/0/groups/0/modules']);
    // A modules row is a kind of its own since #1088.
    expect(ws).not.toContainEqual(['unknownConfigValue', '/pageTemplates/1/groups/0/kind']);
    expect(ws).toContainEqual(['unknownConfigValue', '/pageTemplates/1/groups/0/frames']);
    expect(ws).toContainEqual(['unknownConfigValue', '/pageTemplates/1/groups/0/overflow/continueIn']);
    expect(ws).toContainEqual(['unknownConfigValue', '/pageTemplates/1/groups/1/overflow/continueIn']);
    // A module holds no modules group; a modules group no frames.
    expect(resolvePageTemplate({ pageTemplates: [bad] }, 'mala')!.groups[0]!.modules).toBeUndefined();
    expect(resolvePageTemplate({ pageTemplates: [shell] }, 'shell')!.groups[0]).toMatchObject({ kind: 'row', frames: [], modules: true });
  });

  it('reports a cycle of modules extending each other', () => {
    const a: PageTemplate = { id: 'ma', role: 'module', extends: 'mb', frames: [{ name: 'x' }] };
    const b: PageTemplate = { id: 'mb', role: 'module', extends: 'ma', frames: [{ name: 'y' }] };
    const ws = validatePageTemplates({ ...MODULE_CONFIG, pageTemplates: [TOPIC_TEMPLATE, a, b] });
    expect(ws.filter((w) => w.kind === 'templateExtendsCycle').map((w) => w.path)).toEqual(['/pageTemplates/1/extends', '/pageTemplates/2/extends']);
    // A module that cannot be resolved is not laid: `moduleUnknown`.
    const doc = build('::::page{template="tema"}\n# T\n\n:::module{template="ma"}\nA.\n:::\n::::\n', withTemplates(TOPIC_TEMPLATE, a, b));
    expect(warningsOf(doc, 'moduleUnknown').map((w) => w.reason)).toEqual(['unknown']);
  });

  it('lays a template without modules as before', () => {
    const doc = build('::::page{template="tema"}\n# T\n::::\n');
    const page = composedPagesOf(doc)[0]!;
    expect(page.composed!.frames.map((f) => f.id)).toEqual(['cp0:titulo']);
    expect(page.composed!.modules).toBeUndefined();
  });
});

