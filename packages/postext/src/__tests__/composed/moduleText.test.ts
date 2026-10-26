import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import { renderToHtmlIndexed } from '../../html-backend/html-backend.js';
import { renderPageToCanvas } from '../../canvas-backend/index.js';
import { composedPaintOrder, decorationOver, decorationUnder } from '../../composed/paint.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import { contrastPairs } from '../../checks/contrast.js';
import { flowRectToPage } from '../../vdt.js';
import type { PageTemplate } from '../../composed/types.js';
import type { PostextConfig, VDTDesignTextBlock, VDTDocument, VDTPage } from '../../index.js';
import { CARD_MODULE, NOTICE_MODULE, ROWS_CONFIG, ROWS_TEMPLATE, rowsPage } from './fixtures/moduleRows.js';
import { MODULE_CONFIG, MODULE_RESOURCES, TOPIC_TEMPLATE, TREE_MODULE, treeModule } from './fixtures/modules.js';

// #1189: a module template's text elements are drawn, over the module's
// frames, and their `{attr.x}` reads the `:::module` fence first.

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
const text = (id: string, content: string, to: string, edge: string, extra: Record<string, unknown> = {}) =>
  ({ kind: 'text', id, content, fontSize: pt(9), placement: { anchor: { to, edge } }, ...extra });
const TREE_ELEMENTS = (TREE_MODULE.decoration as { elements: unknown[] }).elements;
/** The tree module with a literal on its root node (a filled frame), the
 *  `num` attribute in its top right corner, a text shown only when the
 *  fence sets `extra`, and one with no id. */
const textModule = (extra: Record<string, unknown> = {}): PageTemplate => ({
  ...TREE_MODULE,
  decoration: {
    elements: [
      ...TREE_ELEMENTS,
      text('rotulo', 'Literal', '#raiz', 'top-left', extra),
      text('num', '{attr.num}', 'container', 'top-right'),
      text('extra', 'Extra', 'container', 'bottom-right', { when: 'extra' }),
      { kind: 'text', content: 'NoId', fontSize: pt(9), placement: { anchor: { to: 'container', edge: 'bottom-left' } } },
    ],
  } as never,
});
const build = (markdown: string, templates: PageTemplate[] = [TOPIC_TEMPLATE, textModule()]): VDTDocument =>
  buildDocument({ markdown, resources: MODULE_RESOURCES }, { ...MODULE_CONFIG, pageTemplates: templates } as PostextConfig, createMeasurementCache());
const composedPages = (doc: VDTDocument): VDTPage[] => doc.pages.filter((p) => p.composed);
const textBlock = (page: VDTPage, id: string): VDTDesignTextBlock | undefined =>
  page.composed!.decoration!.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text' && b.elementId === id);
const printed = (page: VDTPage, id: string): string | undefined => textBlock(page, id)?.lines.map((l) => l.text).join(' ');
const page = (fenceAttrs: string, ...modules: string[]): string => `::::page{template="tema"${fenceAttrs}}\n# T\n\n${modules.join('\n')}::::\n`;

describe('text elements of a module template (#1189)', () => {
  it('draws them over the module\'s frames, in the module\'s box', () => {
    const doc = build(page('', treeModule('en', ' num="7"')));
    const p = composedPages(doc)[0]!;
    for (const id of ['arbol[1].rotulo', 'arbol[1].num']) expect(textBlock(p, id)?.over, id).toBe(true);
    expect(printed(p, 'arbol[1].rotulo')).toBe('Literal');
    // On the root node, a filled frame painted before the over item.
    const raiz = flowRectToPage(p, p.composed!.frames.find((f) => f.name === 'arbol[1].raiz')!.rect);
    const lit = textBlock(p, 'arbol[1].rotulo')!;
    expect(lit.bbox.x).toBeCloseTo(raiz.x, 3);
    expect(lit.bbox.y).toBeCloseTo(raiz.y, 3);
    const order = composedPaintOrder(p).map((i) => (i.kind === 'frame' ? i.frame.name : i.kind));
    expect(order.at(-1)).toBe('over');
    expect(order.indexOf('arbol[1].raiz')).toBeLessThan(order.indexOf('over'));
    // The module's other elements stay with the decoration, under the
    // frames; an element with no id is a module text too.
    const deco = p.composed!.decoration!;
    expect(decorationUnder(deco).blocks.map((b) => b.elementId)).toEqual(['arbol[1].suelo', 'arbol[1].tronco', 'arbol[1].rama', 'arbol[1].hacia-izq', 'arbol[1].hacia-der']);
    expect(decorationOver(deco)!.blocks.map((b) => b.elementId)).toEqual(['arbol[1].rotulo', 'arbol[1].num', 'text-9']);
    expect(doc.contentWarnings ?? []).toEqual([]);
  });

  it('over: false keeps a module text under the frames; a page template\'s text is under them unless over: true', () => {
    const under = composedPages(build(page('', treeModule('en')), [TOPIC_TEMPLATE, textModule({ over: false })]))[0]!;
    expect(textBlock(under, 'arbol[1].rotulo')!.over).toBeUndefined();
    expect(decorationUnder(under.composed!.decoration)!.blocks.map((b) => b.elementId)).toContain('arbol[1].rotulo');
    const shell = (extra: Record<string, unknown>): PageTemplate => ({ ...TOPIC_TEMPLATE, decoration: { elements: [text('sello', 'Sello', '#titulo', 'top-left', extra)] } as never });
    const plain = composedPages(build(page('', treeModule('en')), [shell({}), TREE_MODULE]))[0]!;
    expect(textBlock(plain, 'sello')!.over).toBeUndefined();
    expect(composedPaintOrder(plain).map((i) => i.kind)).not.toContain('over');
    const raised = composedPages(build(page('', treeModule('en')), [shell({ over: true }), TREE_MODULE]))[0]!;
    expect(textBlock(raised, 'sello')!.over).toBe(true);
  });

  it('{attr.x} reads the :::module fence first, then the page fence, and maps back to the value written', () => {
    const md = page(' num="P"', treeModule('en', ' num="7"'), treeModule('en'), treeModule('en', ' name="tercero" num="9" extra'));
    const doc = build(md);
    const p = composedPages(doc)[0]!;
    expect(printed(p, 'arbol[1].num')).toBe('7');
    expect(printed(p, 'arbol[2].num')).toBe('P');
    expect(printed(p, 'tercero.num')).toBe('9');
    // The module's `when` reads its own fence too.
    expect(textBlock(p, 'arbol[1].extra')).toBeUndefined();
    expect(printed(p, 'tercero.extra')).toBe('Extra');
    // Each value maps back to where it is written.
    const at = (needle: string) => md.indexOf(needle) + needle.length - 2;
    const seven = textBlock(p, 'arbol[1].num')!;
    expect([seven.sourceStart, seven.sourceEnd, seven.attr]).toEqual([at('num="7"'), at('num="7"') + 1, 'num']);
    const fromPage = textBlock(p, 'arbol[2].num')!;
    expect([fromPage.sourceStart, fromPage.attr]).toEqual([at('num="P"'), 'num']);
    // The page records what each module's fence writes, besides template
    // and name; a module that writes nothing else records nothing.
    expect(p.composed!.modules!.map((m) => m.attrs)).toEqual([{ num: '7' }, undefined, { num: '9', extra: '' }]);
    expect(p.composed!.modules![0]!.attrSources).toEqual({ num: { sourceStart: at('num="7"'), sourceEnd: at('num="7"') + 1 } });
    expect(doc.contentWarnings ?? []).toEqual([]);
  });

  it('a module that goes on whole to a next page reads its fence there', () => {
    const goingOn: PageTemplate = { ...TOPIC_TEMPLATE, groups: [{ ...TOPIC_TEMPLATE.groups![0]!, overflow: { continueIn: 'next-page' } }] };
    const trees = Array.from({ length: 7 }, (_, k) => treeModule('en', ` num="n${k + 1}"`));
    const [first, second] = composedPages(build(page('', ...trees), [goingOn, textModule()]));
    expect(second).toBeDefined();
    const laid = (p: VDTPage) => p.composed!.modules!.filter((m) => m.rect).map((m) => m.name);
    for (const p of [first!, second!]) {
      for (const name of laid(p)) expect(printed(p, `${name}.num`), name).toBe(`n${/\[(\d+)\]/.exec(name)![1]}`);
    }
    expect(laid(second!).length).toBeGreaterThan(0);
  });

  it('draws the texts of modules laid in rows and grids', () => {
    const notice: PageTemplate = { ...NOTICE_MODULE, decoration: { elements: [text('rotulo', 'Aviso', '#texto', 'top-right'), text('num', '{attr.num}', 'container', 'top-right')] } as never };
    const card: PageTemplate = { ...CARD_MODULE, decoration: { elements: [text('rotulo', 'Foto', '#foto', 'top-left')] } as never };
    const md = rowsPage('en').replace(':::module{template="aviso"', ':::module{template="aviso" num="1"');
    const doc = buildDocument({ markdown: md, resources: MODULE_RESOURCES }, { ...ROWS_CONFIG, pageTemplates: [ROWS_TEMPLATE, notice, card] } as PostextConfig, createMeasurementCache());
    const p = composedPages(doc)[0]!;
    const over = decorationOver(p.composed!.decoration)!.blocks.map((b) => [b.elementId, (b as VDTDesignTextBlock).lines.map((l) => l.text).join(' ')]);
    expect(over).toEqual([
      ['aviso[1].rotulo', 'Aviso'], ['aviso[1].num', '1'], ['aviso[2].rotulo', 'Aviso'], ['aviso[2].num', ''],
      ['tarjeta[1].rotulo', 'Foto'], ['tarjeta[2].rotulo', 'Foto'], ['tarjeta[3].rotulo', 'Foto'], ['tarjeta[4].rotulo', 'Foto'],
    ]);
  });

  it('the backends paint a module text after the module\'s frames', () => {
    const doc = build(page('', treeModule('en', ' num="7"')));
    const p = composedPages(doc)[0]!;
    // HTML: in the over box, above every frame.
    const html = renderToHtmlIndexed(doc).pages[p.index]!.innerHtml;
    const over = /class="pt-frame-decoration pt-frame-decoration-over" style="[^"]*z-index:(\d+);/.exec(html);
    expect(over).not.toBeNull();
    const frames = [...html.matchAll(/class="pt-frame[^"]*" data-frame-id="[^"]*" data-layer="-?\d+"[^>]*z-index:(\d+)/g)].map((m) => Number(m[1]));
    expect(Number(over![1])).toBeGreaterThan(Math.max(...frames));
    expect(html.indexOf('Literal')).toBeGreaterThan(over!.index);
    // Canvas: filled after the words of the root node.
    const ops: string[] = [];
    const ctx = new Proxy({ font: '', fillStyle: '#000000' } as Record<string | symbol, unknown>, {
      get(target, key) {
        if (key === 'fillText') return (t: string) => ops.push(t);
        if (key === 'measureText') return (s: string) => ({ width: [...s].length * 7 });
        if (key in target) return target[key];
        return () => undefined;
      },
      set(target, key, value) { target[key] = value; return true; },
    });
    renderPageToCanvas(p, doc, { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement);
    const words = ops.join(' ');
    expect(words.indexOf('Literal')).toBeGreaterThan(words.lastIndexOf('river'));
  });

  it('the contrast check reads an over text on the frame it lies on', () => {
    const groundOf = (doc: VDTDocument) => contrastPairs(doc).find((p) => p.text === 'Literal')?.background;
    // On the root node's white fill, not on the module's tinted ground.
    expect(groundOf(build(page('', treeModule('en'))))).toBe('#ffffff');
    expect(groundOf(build(page('', treeModule('en')), [TOPIC_TEMPLATE, textModule({ over: false })]))).toBe('#eef6ea');
  });

  it('an over that is no boolean is reported and read as unset', () => {
    const warnings = collectConfigWarnings({ pageTemplates: [TOPIC_TEMPLATE, textModule({ over: 'yes' })] } as PostextConfig);
    expect(warnings.filter((w) => w.path.endsWith('.over'))).toEqual([
      { kind: 'unknownConfigValue', path: 'pageTemplates[1].decoration.elements[5].over', value: 'yes', used: 'true' },
    ]);
  });
});
