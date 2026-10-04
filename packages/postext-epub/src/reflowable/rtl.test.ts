// Right-to-left books in the reflowable rendition (#402): bidi isolates
// for runs set against their paragraph, languages named on isolates,
// kashidas, `:::verse` poems, footnote markers, and the navigation and
// style sheet of an Arabic book. Fixtures mix Arabic with Latin marker
// words and digits, so the order a run is read in can be checked.

import { describe, expect, it } from 'vitest';
import type { PostextConfig, VDTDocument, VDTLine, VDTLineSegment } from 'postext';
import { baseConfig, layOut, pt } from './__tests__/vdt';
import { checkXml } from './__tests__/xml';
import { buildReflowablePublication } from '.';
import { appendLine, type InlineContext, type TextSink } from './inline';
import type { InlineItem } from './model';
import { bidiLevels } from './xhtml';
import { buildNav, buildOpf } from '../package/pack';
import type { RenderToEpubOptions } from '../types';

const arabic: PostextConfig = { ...baseConfig, locale: 'ar' };

async function render(docs: VDTDocument[], extra: Partial<RenderToEpubOptions> = {}) {
  const pub = await buildReflowablePublication(docs, {
    layout: 'reflowable',
    metadata: { title: 'كتاب', language: 'ar', modified: new Date(Date.UTC(2026, 9, 4)) },
    ...extra,
  });
  const files = new Map<string, string>();
  for (const item of pub.items) {
    if (item.mediaType === 'application/xhtml+xml') files.set(item.href, item.data as string);
  }
  for (const [href, xml] of files) expect(checkXml(xml).errors, href).toEqual([]);
  const css = pub.items.find((i) => i.href === 'styles/book.css')!.data as string;
  return { pub, files, chapter: files.get('text/chapter-001.xhtml')!, css };
}

/** The body of a content document, line breaks removed. */
const bodyOf = (xhtml: string): string => /<body>([\s\S]*)<\/body>/.exec(xhtml)![1]!.replace(/\n/g, '');

const text = (t: string, lvl?: number): InlineItem => ({ t: 'text', text: t, fmt: {}, ...(lvl !== undefined ? { lvl } : {}) });

describe('bidi levels of inline items', () => {
  it('has none for a paragraph with nothing set against it', () => {
    expect(bidiLevels([text('Plain'), text(' '), text('English 42.')], 0)).toBeUndefined();
    expect(bidiLevels([text('نص', 1), text(' ', 1), text('١٤٤٥', 1)], 1)).toBeUndefined();
  });

  it('keeps the levels the engine resolved, neutrals between two runs of one direction joining them', () => {
    // «قال AAA BBB جميلة»: the space between the two Latin words comes
    // from a line join and carries no level.
    expect(bidiLevels([text('قال ', 1), text('AAA', 2), text(' '), text('BBB', 2), text(' جميلة', 1)], 1)).toEqual([1, 2, 2, 2, 1]);
  });

  it('reads a level from the letters of an item that has none', () => {
    expect(bidiLevels([text('An '), text('كتاب'), text(' here 42')], 0)).toEqual([0, 1, 0]);
    expect(bidiLevels([text('قال '), text('Hello'), text(' ١٢')], 1)).toEqual([1, 2, 1]);
  });

  it('treats a level under the paragraph’s as unknown (a verse gap, an inserted mark)', () => {
    expect(bidiLevels([text('AAA', 2), text('\t', 0), text('BBB', 2)], 1)).toEqual([2, 2, 2]);
  });
});

describe('right-to-left runs and languages', () => {
  it('isolates Latin runs of an Arabic paragraph, digits left bare', async () => {
    const { chapter } = await render([layOut('قال AAA إن 2024 و١٤٤٥ (BBB) جميلة.', arabic)]);
    const body = bodyOf(chapter);
    expect(body).toContain('قال <span dir="ltr">AAA</span> إن 2024 و١٤٤٥ (<span dir="ltr">BBB</span>) جميلة.');
  });

  it('keeps a Latin phrase broken over two lines in one isolate', async () => {
    const md = `${'كلام عربي طويل '.repeat(3)}The old man said hello there friend ${'كلام عربي '.repeat(4)}.`;
    const doc = layOut(md, arabic);
    const lines = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines)));
    // The phrase does run over a line break in this layout.
    expect(lines.some((l, i) => /[A-Za-z]$/.test(l.text.trim()) && /^[A-Za-z]/.test(lines[i + 1]?.text ?? ''))).toBe(true);
    const { chapter } = await render([doc]);
    expect(bodyOf(chapter)).toContain('<span dir="ltr">The old man said hello there friend</span>');
  });

  it('declares the language an isolate names, inside its direction', async () => {
    const { chapter } = await render([layOut('وقال الشيخ :ltr[the old man]{lang=en} ثم سكت.', arabic)]);
    expect(bodyOf(chapter)).toContain('وقال الشيخ <span dir="ltr"><span lang="en" xml:lang="en">the old man</span></span> ثم سكت.');
  });

  it('sets an English block of an Arabic book left to right, its Arabic word isolated', async () => {
    const { chapter } = await render([layOut('نص.\n\n:::paragraphs{dir=ltr}\nAn English paragraph with the word كتاب in it.\n:::', arabic)]);
    expect(bodyOf(chapter)).toContain('<p dir="ltr">An English paragraph with the word <span dir="rtl">كتاب</span> in it.</p>');
  });

  it('isolates an Arabic quotation of an English book, nesting a Latin word inside it', async () => {
    const { chapter } = await render([layOut('He wrote :rtl[AB كتاب] in the margin.')], { metadata: { title: 'Book', language: 'en' } });
    const body = bodyOf(chapter);
    expect(body).toContain('He wrote <span dir="rtl"><span dir="ltr">AB</span> كتاب</span> in the margin.');
    expect(chapter).not.toContain(' dir="rtl">\n');
  });

  it('writes no isolate in a left-to-right book', async () => {
    const { files } = await render([layOut('Plain text, 42 times (really).\n\n- one\n- two')], { metadata: { title: 'Book', language: 'en' } });
    expect([...files.values()].join('\n')).not.toContain('dir=');
  });
});

describe('kashidas', () => {
  const ctx: InlineContext = { doc: 0, lang: 'ar', basePx: 16, noteRef: () => true };
  const seg = (t: string, extra: Partial<VDTLineSegment> = {}): VDTLineSegment => ({ kind: 'text', text: t, width: 0, rtl: true, ...extra });
  const line = (segments: VDTLineSegment[], extra: Partial<VDTLine> = {}): VDTLine => ({
    text: segments.map((s) => s.text).join(''), bbox: { x: 0, y: 0, width: 0, height: 0 }, baseline: 0, hyphenated: false, segments, ...extra,
  });
  const joined = (l: VDTLine, segments?: VDTLineSegment[]): string => {
    const sink: TextSink = { inl: [] };
    appendLine(sink, l, ctx, [], segments);
    return sink.inl.map((i) => (i.t === 'text' ? i.text : '')).join('');
  };

  it('drops the tatweels justification inserted and keeps the ones the author typed', () => {
    // «جمـيـــل»: the first tatweel typed, the three after the second ي inserted.
    expect(joined(line([seg('جمـيـــل', { kashida: [4, 5, 6] })], { kashida: 3 }))).toBe('جمـيل');
  });

  it('reads the offsets across a word’s styled runs', () => {
    const word = seg('كتـــاب', { kashida: [2, 3, 4], runs: [{ text: 'كتـ' }, { text: 'ــاب', bold: true }] });
    expect(joined(line([word], { kashida: 3 }))).toBe('كتاب');
  });

  it('keeps a typed tatweel of a hemistich whose line has inserted ones elsewhere', () => {
    const sadr = seg('أَخْـ');
    const gap: VDTLineSegment = { kind: 'space', text: '\t', width: 0, labelTab: true };
    const ajuz = seg('ــرَجَ', { kashida: [1] });
    const l = line([sadr, gap, ajuz], { kashida: 1 });
    expect(joined(l, [sadr])).toBe('أَخْـ');
    expect(joined(l, [ajuz])).toBe('ـرَجَ');
  });

  it('drops every tatweel of a stretched line from a layout without offsets', () => {
    expect(joined(line([seg('جمـيـــل')], { kashida: 3 }))).toBe('جميل');
  });

  it('writes justified Arabic text without the elongations', async () => {
    const config: PostextConfig = { ...arabic, bodyText: { textAlign: 'justify' } };
    const doc = layOut(`${'قال الراوي إن الملك شهريار كان يحكم بلاد الهند والصين، '.repeat(8)}وكتب المؤلف جمـيل.`, config);
    const stretched = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines))).filter((l) => l.kashida);
    expect(stretched.length).toBeGreaterThan(0);
    const { chapter } = await render([doc]);
    const tatweels = [...bodyOf(chapter)].filter((c) => c === 'ـ').length;
    expect(tatweels).toBe(1);
    expect(chapter).toContain('جمـيل.');
  });
});

describe(':::verse', () => {
  const poem = [
    'فأنشد:',
    '',
    ':::verse{ornament="٭"}',
    'يا حرقة الدهر كفي || إن لم تكفي فعفي',
    'فلا بحظي أعطي AAA || ولا بصنعة كفي',
    'بيت واحد',
    ':::',
    '',
    'ثم سكت.',
  ].join('\n');

  it('writes a bayt a row, its ṣadr and ʿajuz apart, the ornament hidden from the text', async () => {
    const { chapter, css } = await render([layOut(poem, arabic)]);
    const body = bodyOf(chapter);
    expect(body).toContain(
      '<div class="pt-verse">' +
      '<p class="pt-bayt"><span class="pt-sadr">يا حرقة الدهر كفي</span> <span class="pt-verse-ornament" aria-hidden="true">٭</span> <span class="pt-ajuz">إن لم تكفي فعفي</span></p>' +
      '<p class="pt-bayt"><span class="pt-sadr">فلا بحظي أعطي <span dir="ltr">AAA</span></span> <span class="pt-verse-ornament" aria-hidden="true">٭</span> <span class="pt-ajuz">ولا بصنعة كفي</span></p>' +
      '<p class="pt-bayt pt-bayt-single"><span class="pt-sadr">بيت واحد</span></p>' +
      '</div>',
    );
    expect(body).toContain('<p>ثم سكت.</p>');
    expect(css).toMatch(/\.pt-bayt \{\n {2}display: grid;\n {2}grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\);/);
    expect(css).toMatch(/\.pt-ajuz \{\n {2}grid-column: 3;\n {2}text-align: end;/);
    expect(css).toContain('@media (max-width: 30em)');
  });

  it('joins a staggered bayt and a hemistich broken over lines back into one bayt', async () => {
    const narrow: PostextConfig = { ...arabic, page: { ...baseConfig.page, width: pt(150) } };
    const long = 'كلام طويل جدا جدا جدا جدا جدا جدا';
    const doc = layOut(`:::verse\n${long} || ${long} آخر\nقصير || قصير\n:::`, narrow);
    const parts = doc.pages[0]!.columns[0]!.blocks[0]!.lines.map((l) => l.verse?.part);
    expect(parts).toContain('sadr');
    expect(parts).toContain('ajuz');
    const { chapter } = await render([doc]);
    const body = bodyOf(chapter);
    expect(body).toContain(`<p class="pt-bayt"><span class="pt-sadr">${long}</span> <span class="pt-ajuz">${long} آخر</span></p>`);
    expect(body).toContain('<p class="pt-bayt"><span class="pt-sadr">قصير</span> <span class="pt-ajuz">قصير</span></p>');
  });

  it('keeps a poem split across pages in one block, the page start in its bayt', async () => {
    const short: PostextConfig = { ...arabic, page: { ...baseConfig.page, height: pt(200) } };
    const bayts = Array.from({ length: 30 }, (_, i) => `صدر البيت ${i + 1} هنا || عجز البيت ${i + 1} هنا`).join('\n');
    const doc = layOut(`:::verse\n${bayts}\n:::`, short);
    expect(doc.pages.length).toBeGreaterThan(1);
    const { chapter } = await render([doc]);
    const body = bodyOf(chapter);
    expect(body.match(/<div class="pt-verse">/g)).toHaveLength(1);
    expect(body.match(/class="pt-bayt"/g)).toHaveLength(30);
    expect(body).toMatch(/<span class="pt-sadr"><span epub:type="pagebreak" role="doc-pagebreak" id="page-2" aria-label="[^"]+"><\/span>صدر البيت/);
  });

  it('writes no verse rules for a book without a poem', async () => {
    const { css } = await render([layOut('نص.', arabic)]);
    expect(css).not.toContain('pt-bayt');
  });
});

describe('an Arabic book', () => {
  it('gives notes their «(١)» markers, in the text and at the note (an en space after it)', async () => {
    const config: PostextConfig = { ...arabic, footnotes: { markerTemplate: '({n})' } };
    const { chapter } = await render([layOut('قال الراوي[^a] كلاما.\n\n[^a]: حاشية NOTE-A.', config)]);
    expect(chapter).toContain('<a epub:type="noteref" role="doc-noteref" class="pt-noteref" href="#fn-a" id="fnref-a"><sup>(١)</sup></a>');
    expect(chapter).toMatch(/<aside epub:type="footnote" role="doc-footnote" id="fn-a" class="pt-footnote"><p><sup>\(١\)<\/sup>\u2002حاشية <span dir="ltr">NOTE-A<\/span>\. <a href="#fnref-a" role="doc-backlink" aria-label="العودة إلى النص">/);
  });

  it('names its landmarks and contents in Arabic, right to left, pages turning to the left', async () => {
    const docs = [layOut('# الفصل الأول\n\nنص.', arabic)];
    expect(docs[0]!.binding).toBe('right');
    const { pub } = await render(docs, { cover: { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), mediaType: 'image/png' } });
    expect(pub.pageProgression).toBe('rtl');
    expect(pub.landmarks.map((l) => l.label)).toEqual(['الغلاف', 'بداية المحتوى']);
    expect(String(pub.items.find((i) => i.id === 'cover')!.data)).toContain('lang="ar" xml:lang="ar" dir="rtl"');
    const nav = buildNav(pub);
    expect(nav).toContain('lang="ar" xml:lang="ar" dir="rtl"');
    expect(nav).toContain('<h1>المحتويات</h1>');
    expect(buildOpf(pub)).toContain('<spine toc="ncx" page-progression-direction="rtl">');
  });

  it('keeps English landmark names in a left-to-right book', async () => {
    const { pub } = await render([layOut('# Title\n\nText.')], { metadata: { title: 'Book', language: 'en' } });
    expect(pub.landmarks.map((l) => l.label)).toEqual(['Start of content']);
  });

  it('puts a box’s left padding on the start side and aligns a cell’s right on its end', async () => {
    const config: PostextConfig = {
      ...arabic,
      calloutStyles: [{ id: 'note', padding: { top: pt(2), right: pt(4), bottom: pt(2), left: pt(12) } }],
    } as PostextConfig;
    const doc = layOut(':::callout{style=note}\nنص في صندوق.\n:::', config);
    const { css } = await render([doc]);
    // The 12pt left padding is on the start side: the page's right.
    const rule = /aside\.pt-callout-note \{[^}]*padding: ([^;]+);/.exec(css)![1]!.split(' ');
    expect(Number.parseFloat(rule[1]!)).toBeGreaterThan(Number.parseFloat(rule[3]!));
    const ltr = await render([layOut(':::callout{style=note}\nText in a box.\n:::', { ...config, locale: 'en' })], { metadata: { title: 'Book', language: 'en' } });
    const ltrRule = /aside\.pt-callout-note \{[^}]*padding: ([^;]+);/.exec(ltr.css)![1]!.split(' ');
    expect(Number.parseFloat(ltrRule[3]!)).toBeGreaterThan(Number.parseFloat(ltrRule[1]!));
  });
});
