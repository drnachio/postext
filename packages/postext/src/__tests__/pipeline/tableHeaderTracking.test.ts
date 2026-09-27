import { describe, it, expect } from 'vitest';
import { layoutResourceBlock } from '../../pipeline/resourceLayout';
import { resolveAllConfig } from '../../pipeline/config';
import { buildDocument } from '../../pipeline';
import { defaultResourceTypes } from '../../defaults/resourceTypes';
import { renderToHtml } from '../../html-backend';
import { renderPageToCanvas } from '../../canvas-backend';
import { resolveTableStyleConfig, stripTableStyleDefaults } from '../../defaults/tableStyle';
import { resolveBodyTextConfig } from '../../defaults/bodyText';
import type { PostextConfig, Resource, TableCell, TableModel } from '../../types';

// EF-174: header cells can be tracked (`headerLetterSpacing`) and set in
// capitals (`headerTextTransform`), as callout titles and headings can.

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

const W = 400;
const px = (value: number) => ({ value, unit: 'px' as const });
const cell = (content: string, extra: Partial<TableCell> = {}): TableCell => ({ content, ...extra });

const model = (header: TableCell[] = [cell('Dish'), cell('Price')]): TableModel => ({
  headerRowCount: 1,
  rows: [header, [cell('Soup'), cell('4')], [cell('Bread'), cell('2')]],
});

const table = (m: TableModel = model(), extra: Partial<Resource> = {}): Resource => ({
  id: 't', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0, table: { model: m }, ...extra,
});

function layout(resource: Resource, config?: PostextConfig) {
  const resourceTypes = defaultResourceTypes();
  return layoutResourceBlock({
    resource,
    resourceType: resourceTypes.find((t) => t.id === resource.typeId),
    number: '1',
    resolved: resolveAllConfig(config),
    columnWidth: W,
    resourceNumbering: {},
    resourceTypes,
    resources: [resource],
  }).block.table!;
}

const headerLines = (t: ReturnType<typeof layout>) => t.cells.filter((c) => c.isHeader).flatMap((c) => c.lines);
const bodyLines = (t: ReturnType<typeof layout>) => t.cells.filter((c) => !c.isHeader).flatMap((c) => c.lines);

describe('EF-174: table header tracking and capitals', () => {
  it('defaults to no tracking and no transform; stripping drops the defaults', () => {
    const body = resolveBodyTextConfig(undefined);
    const ts = resolveTableStyleConfig(undefined, body);
    expect(ts.headerLetterSpacing).toEqual({ value: 0, unit: 'pt' });
    expect(ts.headerTextTransform).toBe('none');
    expect(stripTableStyleDefaults({ headerLetterSpacing: { value: 0, unit: 'pt' }, headerTextTransform: 'none' })).toBeUndefined();
    expect(stripTableStyleDefaults({ headerLetterSpacing: px(2), headerTextTransform: 'uppercase' }))
      .toEqual({ headerLetterSpacing: px(2), headerTextTransform: 'uppercase' });
  });

  it('leaves a table without the options exactly as it was', () => {
    const plain = layout(table());
    const zero = layout(table(), { tableStyle: { headerLetterSpacing: px(0), headerTextTransform: 'none' } });
    expect(zero).toEqual(plain);
    for (const line of [...headerLines(plain), ...bodyLines(plain)]) expect(line.letterSpacing).toBeUndefined();
  });

  it('tracks the header lines only, measured and marked for painting', () => {
    const t = layout(table(), { tableStyle: { headerLetterSpacing: px(2) } });
    const dish = headerLines(t).find((l) => l.text === 'Dish')!;
    expect(dish.letterSpacing).toBe(2);
    expect(dish.bbox.width).toBeCloseTo(4 * 7 + 4 * 2, 6);
    for (const line of bodyLines(t)) expect(line.letterSpacing).toBeUndefined();
    expect(bodyLines(t).find((l) => l.text === 'Soup')!.bbox.width).toBeCloseTo(4 * 7, 6);
  });

  it('an em value is relative to the header size', () => {
    const t = layout(table(), { tableStyle: { headerFontSize: px(20), headerLetterSpacing: { value: 0.1, unit: 'em' } } });
    expect(headerLines(t)[0]!.letterSpacing).toBeCloseTo(2, 6);
  });

  it('sets the header in capitals, keeping its length, and leaves the body alone', () => {
    const t = layout(table(model([cell('Straße'), cell('Price $x$ **now**')])), { tableStyle: { headerTextTransform: 'uppercase' } });
    const texts = headerLines(t).map((l) => l.text);
    expect(texts).toContain('STRAßE');
    expect(texts.some((s) => s.startsWith('PRICE') && s.includes('NOW'))).toBe(true);
    expect(bodyLines(t).map((l) => l.text)).toEqual(['Soup', '4', 'Bread', '2']);
  });

  it('a header column cell (isHeader in the body) takes both too', () => {
    const m: TableModel = { rows: [[cell('Row head', { isHeader: true }), cell('value')]] };
    const t = layout(table(m), { tableStyle: { headerLetterSpacing: px(1), headerTextTransform: 'uppercase' } });
    const head = t.cells.find((c) => c.isHeader)!.lines[0]!;
    expect(head.text).toBe('ROW HEAD');
    expect(head.letterSpacing).toBe(1);
  });

  it('centres a tracked header by its ink: the tracking after the last letter is left out', () => {
    const m = model([cell('Dish', { align: 'center' }), cell('Price', { align: 'right' })]);
    const t = layout(table(m), { tableStyle: { headerLetterSpacing: px(4), cellPadding: px(0) } });
    const [dishCell, priceCell] = t.cells.filter((c) => c.isHeader);
    const dish = dishCell!.lines[0]!;
    const ink = dish.bbox.width - 4;
    expect(dish.bbox.x - dishCell!.rect.x).toBeCloseTo((dishCell!.rect.width - ink) / 2, 6);
    const price = priceCell!.lines[0]!;
    expect(price.bbox.x + price.bbox.width - 4).toBeCloseTo(priceCell!.rect.x + priceCell!.rect.width, 6);
  });

  it('a named table style inherits both from tableStyle and may override them', () => {
    const config: PostextConfig = {
      tableStyle: { headerLetterSpacing: px(2), headerTextTransform: 'uppercase' },
      tableStyles: [{ id: 'plain', headerTextTransform: 'none' }],
    };
    const t = layout(table(model(), { table: { model: model(), styleId: 'plain' } }), config);
    expect(headerLines(t).map((l) => l.text)).toContain('Dish');
    expect(headerLines(t)[0]!.letterSpacing).toBe(2);
  });

  const doc = () => buildDocument(
    { markdown: '::resource{id="t"}\n', resources: [table(model(), { placement: { position: 'here' } })] },
    { layout: { layoutType: 'single' }, header: { elements: [] }, footer: { elements: [] }, tableStyle: { headerLetterSpacing: px(2) } },
  );

  it('the canvas paints header lines with the tracking and body lines without', () => {
    const painted: { text: string; spacing: string }[] = [];
    const ctx: Record<string | symbol, unknown> = new Proxy({ letterSpacing: '0px' } as Record<string | symbol, unknown>, {
      get(target, key) {
        if (key === 'fillText') return (text: string) => { painted.push({ text, spacing: String(target.letterSpacing) }); };
        if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
        if (key in target) return target[key];
        return () => undefined;
      },
      set(target, key, value) { target[key] = value; return true; },
    });
    const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
    const d = doc();
    renderPageToCanvas(d.pages[0]!, d, canvas);
    expect(painted.find((p) => p.text === 'Dish')!.spacing).toBe('2px');
    expect(painted.find((p) => p.text === 'Soup')!.spacing).toBe('0px');
  });

  it('the HTML backend sets letter-spacing on header lines only', () => {
    const html = renderToHtml(doc());
    const lineOf = (text: string) => html.split('<div class="pt-line"').find((s) => s.includes(`>${text}<`))!;
    expect(lineOf('Dish')).toContain('letter-spacing:2px');
    expect(lineOf('Soup')).not.toContain('letter-spacing');
  });
});
