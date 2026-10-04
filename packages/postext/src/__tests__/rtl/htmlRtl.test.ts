import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { HTML_TEXT_RESET, renderToHtml, renderToHtmlIndexed } from '../../html-backend';
import type { PostextConfig, Resource } from '../../types';
import type { VDTBlock, VDTDocument, VDTLine } from '../../vdt';

// #379: the HTML backend renders right-to-left text. Every word stays a box
// at the x the layout gave it; a box whose direction differs from what it
// inherits declares its own (`dir`), the document root a right-to-left
// document's, and the markup stays in logical order.

// 7 px a character, whatever the font.
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
const config = (direction: 'ltr' | 'rtl', extra: Partial<PostextConfig> = {}): PostextConfig => ({
  direction,
  ...(direction === 'rtl' ? { locale: 'ar' } : {}),
  page: { dpi: 72, width: pt(300), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { firstLineIndent: pt(0), textAlign: 'left', fontFamily: 'Test', boldFontWeight: 700 },
  ...extra,
});

const AR = 'قال AAA إن 2024 و١٤٤٥ (BBB) جميلة';

/** The positioned text boxes of the HTML, in markup order: attributes,
 *  left and text. */
interface Box { dir?: string; left: number; text: string; html: string }
function boxes(html: string): Box[] {
  const out: Box[] = [];
  const re = /<span( dir="(ltr|rtl)")? style="position:absolute;left:([\d.-]+)px;top:[^"]*white-space:pre;[^"]*">(.*?)<\/span>(?=<span|<\/div>|<a |<\/a>)/g;
  for (const m of html.matchAll(re)) {
    out.push({ ...(m[2] ? { dir: m[2] } : {}), left: Number(m[3]), html: m[4]!, text: m[4]!.replace(/<[^>]+>/g, '') });
  }
  return out;
}
const lineHtml = (html: string, needle: string): string => {
  const lines = html.split('<div class="pt-line"').slice(1);
  return lines.find((l) => l.includes(needle))!;
};

describe('document root and pages', () => {
  it('a right-to-left document declares its direction and language', () => {
    const doc = buildDocument({ markdown: AR }, config('rtl'));
    const html = renderToHtml(doc, { mode: 'multi' });
    expect(html).toMatch(/^<div class="pt-doc" lang="ar" dir="rtl" data-mode="multi" style="/);
    expect(html).toContain(HTML_TEXT_RESET.replace('direction:ltr;', 'direction:rtl;'));
    // Right-bound (the default for rtl): pages run right to left, which a
    // row already does in a right-to-left root.
    expect(doc.binding).toBe('right');
    expect(html).toContain('flex-direction:row;');
    const indexed = renderToHtmlIndexed(doc);
    expect(indexed.html).toContain('class="pt-page"');
    expect(indexed.html).toMatch(/class="pt-page" id="[^"]+" data-page="0" dir="rtl" lang="ar"/);
  });

  it('a right-to-left document bound on the left lays its pages left to right', () => {
    const doc = buildDocument({ markdown: AR }, config('rtl', { page: { ...config('rtl').page, binding: 'left' } }));
    expect(renderToHtml(doc, { mode: 'multi' })).toContain('flex-direction:row-reverse;');
  });

  it('a left-to-right document is marked as before', () => {
    const doc = buildDocument({ markdown: 'Plain English words.' }, config('ltr'));
    const html = renderToHtml(doc);
    expect(html).toMatch(/^<div class="pt-doc" data-mode="multi" style="/);
    expect(html).toContain(HTML_TEXT_RESET);
    expect(html).not.toContain(' dir=');
  });
});

describe('runs', () => {
  it('in an English book, only the right-to-left words declare a direction', () => {
    const doc = buildDocument({ markdown: `:::paragraphs{dir=rtl}\n${AR}\n:::` }, config('ltr'));
    const html = renderToHtml(doc);
    const all = boxes(lineHtml(html, 'قال'));
    const byText = new Map(all.map((b) => [b.text, b]));
    expect(byText.get('قال')!.dir).toBe('rtl');
    expect(byText.get('جميلة')!.dir).toBe('rtl');
    expect(byText.get('AAA')!.dir).toBeUndefined();
    expect(byText.get('2024')!.dir).toBeUndefined();
    // Markup in logical order: copying reads as written.
    expect(all.map((b) => b.text).join(' ').replace(/\s+/g, ' ')).toBe('قال AAA إن 2024 و ١٤٤٥ ( BBB ) جميلة');
    // Visual order: the sentence's end on the left, its start on the right.
    expect(byText.get('جميلة')!.left).toBeLessThan(byText.get('AAA')!.left);
    expect(byText.get('AAA')!.left).toBeLessThan(byText.get('قال')!.left);
  });

  it('in an Arabic book, the left-to-right words declare theirs', () => {
    const doc = buildDocument({ markdown: AR }, config('rtl'));
    const html = renderToHtml(doc);
    const byText = new Map(boxes(lineHtml(html, 'قال')).map((b) => [b.text, b]));
    expect(byText.get('قال')!.dir).toBeUndefined();
    expect(byText.get('AAA')!.dir).toBe('ltr');
    expect(byText.get('١٤٤٥')!.dir).toBe('ltr');
    // The mirrored flow turns the layout over; the words' flow order is
    // reversed accordingly (the start of the sentence at flow x 0).
    expect(html).toContain('pt-flow-mirrored');
    expect(byText.get('قال')!.left).toBeLessThan(byText.get('جميلة')!.left);
  });

  it('a word whose letters change style is one box, its styled letters inner spans', () => {
    const doc = buildDocument({ markdown: 'كتا**ب** جميل' }, config('rtl'));
    const block = doc.blocks.find((b) => b.lines.some((l) => l.text.includes('كتاب')))!;
    const seg = block.lines[0]!.segments!.find((s) => s.text === 'كتاب')!;
    expect(seg.runs).toBeDefined();
    const html = renderToHtml(doc);
    const box = boxes(lineHtml(html, 'كتا')).find((b) => b.text === 'كتاب')!;
    expect(box).toBeDefined();
    expect(box.html).toMatch(/^كتا<span style="font:[^"]*700[^"]*;line-height:0;[^"]*">ب<\/span>$/);
  });

  it('a tracked line leaves Arabic words untracked', () => {
    const doc = buildDocument({ markdown: `:::paragraphs{dir=rtl}\n${AR}\n:::` }, config('ltr'));
    const tracked: VDTDocument = {
      ...doc,
      pages: doc.pages.map((p) => ({ ...p, columns: p.columns.map((c) => ({ ...c, blocks: c.blocks.map((b) => ({ ...b, letterSpacing: 0.5 }) as VDTBlock) })) })),
    };
    const line = lineHtml(renderToHtml(tracked), 'قال');
    expect(line).toContain('letter-spacing:0.5px;');
    const all = boxes(line);
    const at = (t: string) => all.find((b) => b.text === t)!;
    expect(lineHtml(renderToHtml(tracked), 'قال')).toMatch(/<span dir="rtl" style="position:absolute;left:[\d.]+px;top:0;white-space:pre;letter-spacing:0;">قال</);
    expect(at('AAA').html).toBe('AAA');
    expect(line).not.toMatch(/letter-spacing:0;">AAA</);
  });
});

describe('lines set against their frame', () => {
  const lastLine = (b: VDTBlock): VDTLine => b.lines[b.lines.length - 1]!;
  it('a ragged Arabic line in an English book ends on the right of its span', () => {
    const doc = buildDocument({ markdown: `:::paragraphs{dir=rtl}\n${AR}\n:::` }, config('ltr'));
    const block = doc.blocks.find((b) => b.direction === 'rtl')!;
    const line = lastLine(block);
    const width = line.segments!.reduce((w, s) => w + s.width, 0);
    const all = boxes(lineHtml(renderToHtml(doc), 'قال'));
    const left = Math.min(...all.map((b) => b.left));
    // Box lefts are relative to the line box (at `bbox.x`).
    expect(left + line.bbox.x).toBeCloseTo(line.measure!.x + line.measure!.width - width, 2);
  });

  it('centred stays centred', () => {
    const doc = buildDocument({ markdown: `:::paragraphs{dir=rtl}\n${AR}\n:::` }, config('ltr', { bodyText: { textAlign: 'center', firstLineIndent: pt(0) } }));
    const block = doc.blocks.find((b) => b.direction === 'rtl')!;
    const line = lastLine(block);
    const width = line.segments!.reduce((w, s) => w + s.width, 0);
    const left = Math.min(...boxes(lineHtml(renderToHtml(doc), 'قال')).map((b) => b.left));
    expect(left + line.bbox.x).toBeCloseTo(line.measure!.x + (line.measure!.width - width) / 2, 2);
  });

  it('an English list in an Arabic book: its marker declares ltr', () => {
    const doc = buildDocument({ markdown: `${AR}\n\n:::paragraphs{dir=ltr}\n1. English item\n:::` }, config('rtl'));
    const html = renderToHtml(doc);
    expect(html).toMatch(/<div class="pt-bullet" aria-hidden="true" dir="ltr" style="/);
  });
});

describe('captions and table cells', () => {
  it('a mixed cell line advances in its order, its runs declaring their direction', () => {
    const table: Resource = {
      id: 'tab', typeId: 'table', kind: 'table', caption: 'جدول AAA ١', createdAt: 0, updatedAt: 0,
      table: { model: { rows: [[{ content: 'كلمة AAA BBB أخرى' }, { content: 'CCC' }]] } },
      placement: { position: 'here' },
    };
    const doc = buildDocument({ markdown: `${AR}\n\n::resource{id="tab"}\n`, resources: [table] }, config('ltr', { direction: 'rtl', locale: 'ar' }));
    const rb = doc.blocks.find((b) => b.resourceBlock)!.resourceBlock!;
    const cell = rb.table!.cells.find((c) => c.col === 0)!;
    expect(cell.lines[0]!.order).toBeDefined();
    const html = renderToHtml(doc);
    const line = lineHtml(html, 'كلمة');
    const all = boxes(line);
    const at = (t: string) => all.find((b) => b.text === t)!;
    expect(at('AAA').dir).toBe('ltr');
    expect(at('كلمة').dir).toBeUndefined();
    expect(at('BBB').dir).toBe('ltr');
    // Flow order of the mirrored page: the first word at the flow's left,
    // the English pair turned round in the flow so the mirror reads it
    // AAA BBB.
    expect(at('كلمة').left).toBeLessThan(at('BBB').left);
    expect(at('BBB').left).toBeLessThan(at('AAA').left);
    expect(at('AAA').left).toBeLessThan(at('أخرى').left);
  });
});
