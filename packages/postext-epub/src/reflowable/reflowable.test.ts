import { describe, expect, it } from 'vitest';
import { initMathEngine } from 'postext';
import type { Resource, VDTBlock, VDTDocument, VDTLine, VDTLineSegment } from 'postext';
import { PNG, baseConfig, layOut, layOutBook, pt } from './__tests__/vdt';
import { checkXml } from './__tests__/xml';
import { buildReflowablePublication } from '.';
import { appendLine, appendLines, type InlineContext, type TextSink } from './inline';
import type { EpubPublication, RenderToEpubOptions } from '../types';

const para = 'Body text that runs on for a while so the page fills and the paragraph wraps over several lines. ';

const resources: Resource[] = [
  {
    id: 'f1', typeId: 'figure', kind: 'bitmap', caption: 'A square.', note: 'Drawn for the test.', altText: 'A red square on white',
    createdAt: 0, updatedAt: 0, bitmap: { fileId: 'f1.png', format: 'png', width: 400, height: 300 },
  },
  {
    id: 't1', typeId: 'table', kind: 'table', caption: 'Sizes.', createdAt: 0, updatedAt: 0,
    table: {
      model: {
        headerRowCount: 1,
        rows: [
          [{ content: 'Size' }, { content: 'Width' }, { content: 'Note' }],
          [{ content: 'Small' }, { content: '10' }, { content: '**tight**' }],
          [{ content: 'Both', colSpan: 2 }, { content: '', hiddenBy: { row: 2, col: 0 } }, { content: 'merged' }],
        ],
      },
    },
  },
];

const options = (extra: Partial<RenderToEpubOptions> = {}): RenderToEpubOptions => ({
  layout: 'reflowable',
  metadata: { title: 'Sample book', language: 'en-US', modified: new Date(Date.UTC(2026, 9, 4)) },
  resourceBytes: (fileId) => (fileId === 'f1.png' ? { bytes: PNG, mediaType: 'image/png' } : undefined),
  ...extra,
});

async function render(docs: VDTDocument[], extra?: Partial<RenderToEpubOptions>) {
  const pub = await buildReflowablePublication(docs, options(extra));
  const files = new Map<string, string>();
  for (const item of pub.items) {
    if (item.mediaType === 'application/xhtml+xml') files.set(item.href, item.data as string);
  }
  return { pub, files, all: [...files.values()].join('\n') };
}

/** Every content document is well formed, and every link inside the book
 *  lands on an id that exists. */
function expectSound(pub: EpubPublication, files: Map<string, string>): void {
  const ids = new Map<string, string[]>();
  const checks = new Map([...files].map(([href, xml]) => [href, checkXml(xml)]));
  for (const [href, check] of checks) {
    expect(check.errors, href).toEqual([]);
    ids.set(href, check.ids);
  }
  const resolve = (from: string, ref: string): [string, string] | undefined => {
    if (/^[a-z]+:/i.test(ref)) return undefined;
    const [path, frag] = ref.split('#') as [string, string | undefined];
    const dir = from.split('/').slice(0, -1);
    for (const part of path ? path.split('/') : []) {
      if (part === '..') dir.pop();
      else dir.push(part);
    }
    const target = path ? dir.join('/') : from;
    return [target, frag ?? ''];
  };
  for (const [href, check] of checks) {
    for (const ref of check.refs) {
      const r = resolve(href, ref);
      if (!r || !r[1]) continue;
      expect(ids.get(r[0]) ?? [], `${href} → ${ref}`).toContain(r[1]);
    }
  }
  for (const p of [...pub.pageList, ...flatToc(pub.toc), ...pub.landmarks]) {
    const [file, frag] = p.href.split('#') as [string, string | undefined];
    expect(files.has(file), p.href).toBe(true);
    if (frag) expect(ids.get(file), p.href).toContain(frag);
  }
}

function flatToc(points: EpubPublication['toc']): { href: string }[] {
  return points.flatMap((p) => [p, ...flatToc(p.children ?? [])]);
}

const ctx = (lang = 'en'): InlineContext => ({ doc: 0, lang, basePx: 16, noteRef: () => true });

const seg = (text: string, extra: Partial<VDTLineSegment> = {}): VDTLineSegment => ({ kind: 'text', text, width: 0, ...extra });
const space = (): VDTLineSegment => ({ kind: 'space', text: ' ', width: 0 });
const line = (segments: VDTLineSegment[], extra: Partial<VDTLine> = {}): VDTLine => ({
  text: segments.map((s) => s.text).join(''),
  bbox: { x: 0, y: 0, width: 0, height: 0 },
  baseline: 0,
  hyphenated: false,
  segments,
  ...extra,
});
const joined = (lines: VDTLine[], lang = 'en'): string => {
  const sink: TextSink = { inl: [] };
  for (const l of lines) appendLine(sink, l, ctx(lang));
  return sink.inl.map((i) => (i.t === 'text' ? i.text : '')).join('');
};

describe('joining lines', () => {
  it('joins lines with a space and drops the hyphen a break added', () => {
    expect(joined([
      line([seg('of'), space(), seg('extraordinar-')], { hyphenated: true }),
      line([seg('ily'), space(), seg('long')]),
      line([seg('words.')]),
    ])).toBe('of extraordinarily long words.');
  });

  it('keeps a hyphen the text carries and adds no space after it', () => {
    expect(joined([line([seg('a'), space(), seg('meta-')], { hyphenated: true, hardHyphen: true }), line([seg('analysis')])])).toBe('a meta-analysis');
    // A breaker that does not flag the hyphen: still no space.
    expect(joined([line([seg('well-')]), line([seg('known')])])).toBe('well-known');
  });

  it('drops the hyphen a compound repeats on the next line', () => {
    expect(joined([
      line([seg('vencer-')], { hyphenated: true, hardHyphen: true }),
      line([seg('-se'), space(), seg('así')], { repeatedHyphen: true }),
    ])).toBe('vencer-se así');
  });

  it('gives a Catalan l·l its middle dot back', () => {
    expect(joined([line([seg('una'), space(), seg('il-')], { hyphenated: true }), line([seg('lusió')])], 'ca')).toBe('una il·lusió');
    expect(joined([line([seg('il-')], { hyphenated: true }), line([seg('lusion')])], 'en')).toBe('illusion');
  });

  it('joins Chinese lines with nothing between them', () => {
    expect(joined([line([seg('天地玄黄')]), line([seg('宇宙洪荒')])])).toBe('天地玄黄宇宙洪荒');
    expect(joined([line([seg('我用')]), line([seg('Python')])])).toBe('我用Python');
  });

  it('keeps a line break inside a paragraph (a line marked its last with more after it)', () => {
    const sink: TextSink = { inl: [] };
    appendLines(sink, [line([seg('Roses'), space(), seg('red,')], { isLastLine: true }), line([seg('violets')], { isLastLine: true })], ctx());
    expect(sink.inl.map((i) => (i.t === 'text' ? i.text : i.t === 'raw' ? i.xhtml : '')).join('')).toBe('Roses red,<br/>violets');
  });

  it('keeps a forced line break (#620), across a page break too', () => {
    const sink: TextSink = { inl: [] };
    appendLines(sink, [line([seg('Roses'), space(), seg('red,')], { isLastLine: true, hardBreak: true })], ctx());
    // The next fragment of the paragraph, on the next page.
    appendLines(sink, [line([seg('violets')]), line([seg('blue.')], { isLastLine: true })], ctx());
    expect(sink.inl.map((i) => (i.t === 'text' ? i.text : i.t === 'raw' ? i.xhtml : '')).join('')).toBe('Roses red,<br/>violets blue.');
  });

  it('writes a forced line break of the text as <br/> (#620)', async () => {
    const { all } = await render([layOut(`First line\\\nand the paragraph goes on.\n\n${para}`)]);
    expect(all).toContain('First line<br/>and the paragraph goes on.');
  });

  it('sets ruby without the <rp> brackets EPUB discourages', () => {
    const sink: TextSink = { inl: [] };
    appendLine(sink, line([seg('漢', { ruby: { text: 'ㄏㄢˋ', position: 'right' } as VDTLineSegment['ruby'] })]), ctx('zh-Hant'));
    const xhtml = sink.inl.map((i) => (i.t === 'raw' ? i.xhtml : i.t === 'text' ? i.text : '')).join('');
    expect(xhtml).toBe('<ruby class="pt-ruby-right">漢<rt>ㄏㄢˋ</rt></ruby>');
  });

  it('leaves out the kashidas justification stretched a line with', () => {
    expect(joined([line([seg('كتـــاب')], { kashida: 3 })])).toBe('كتاب');
  });
});

describe('side lines (傍線, #421)', () => {
  it('mark the run with its style and side, drawn by text-decoration', async () => {
    const docs = [layOut('A :sideline[side line]{style="wavy" pos="over"} and :sideline[plain] text.')];
    const { pub, all } = await render(docs);
    expect(all).toContain('<span class="pt-side pt-side-over pt-side-wavy">side line</span>');
    expect(all).toContain('<span class="pt-side">plain</span>');
    const css = pub.items.filter((i) => i.mediaType === 'text/css').map((i) => String(i.data)).join('\n');
    expect(css).toMatch(/\.pt-side \{[^}]*text-decoration-line: underline;[^}]*text-decoration-skip-ink: none;[^}]*text-underline-position: under left/);
    expect(css).toMatch(/\.pt-side\.pt-side-over \{[^}]*text-decoration-line: overline/);
    for (const style of ['double', 'wavy', 'dotted']) expect(css).toContain(`.pt-side.pt-side-${style} {`);
  });
});

describe('kanbun marks (訓点, #430)', () => {
  it('raise the 送り仮名 after their character, lower the 返り点, a 竪点 as a hyphen; only the 送り仮名 read', async () => {
    const docs = [layOut(':kunten[學]{okuri="ビテ"}而:kunten[敬]{tate kaeri="二"}祭:kunten[:ruby[未]{rt="いま"}]{kaeri="レ" okuri="ダ"}嘗')];
    const { pub, all } = await render(docs);
    expect(all).toContain('<span class="pt-kunten">學<span class="pt-okuri">ビテ</span></span>');
    expect(all).toContain('<span class="pt-kunten">敬<span class="pt-kaeri" aria-hidden="true">二</span><span class="pt-tate" aria-hidden="true">‐</span></span>');
    expect(all).toContain('<span class="pt-kunten"><ruby>未<rt>いま</rt></ruby><span class="pt-okuri">ダ</span><span class="pt-kaeri" aria-hidden="true">レ</span></span>');
    const css = pub.items.filter((i) => i.mediaType === 'text/css').map((i) => String(i.data)).join('\n');
    expect(css).toMatch(/\.pt-okuri, \.pt-kaeri \{[^}]*font-size: 0\.5em/);
    expect(css).toMatch(/\.pt-okuri \{[^}]*vertical-align: super/);
    expect(css).toMatch(/\.pt-kaeri \{[^}]*vertical-align: sub/);
  });
});

describe('buildReflowablePublication', () => {
  it('writes one sound content document per chapter, with page starts and navigation', async () => {
    const docs = layOutBook([
      ['# Opening chapter {#intro}', '', `See :ref{id=f1} and :ref{id=t1}. ${para.repeat(40)}`, '', '### Skipped level', '', para.repeat(3)].join('\n'),
      ['# Closing', '', 'Back to the [opening](#intro).'].join('\n'),
    ], baseConfig, resources);
    const { pub, files, all } = await render(docs);
    expect([...files.keys()]).toEqual(['text/chapter-001.xhtml', 'text/chapter-002.xhtml']);
    expect(pub.spine.map((s) => s.idref)).toEqual(['chapter-001', 'chapter-002']);
    expectSound(pub, files);
    const ch1 = files.get('text/chapter-001.xhtml')!;
    // Headings never skip a level.
    expect(ch1).toMatch(/<h1 id="a-intro">/);
    expect(ch1).toMatch(/<h2 id="h-\d+">.*Skipped level<\/h2>/);
    // One paragraph for the long one, its later pages starting inside it.
    const long = /<p>See [\s\S]*?<\/p>/.exec(ch1)![0];
    expect(long).toContain('epub:type="pagebreak"');
    expect(long.match(/Body text/g)).toHaveLength(40);
    // Every printed page is in the page list, in order, with its label.
    const pages = docs.flatMap((d) => d.pages.map((p) => p.pageLabel));
    expect(pub.pageList.map((p) => p.label)).toEqual(pages);
    // The cross-reference into the other chapter.
    expect(files.get('text/chapter-002.xhtml')).toContain('href="chapter-001.xhtml#a-intro"');
    expect(pub.toc.map((p) => p.label)).toEqual(['Opening chapter', 'Closing']);
    expect(pub.toc[0]!.children?.map((p) => p.label)).toEqual(['Skipped level']);
    expect(pub.landmarks.find((l) => l.type === 'bodymatter')?.href).toBe('text/chapter-001.xhtml');
    expect(pub.accessibility.features).toEqual(expect.arrayContaining(['structuralNavigation', 'tableOfContents', 'printPageNumbers', 'alternativeText']));
    expect(all).toContain('lang="en-US" xml:lang="en-US"');
  });

  it('sets figures with alternative text and tables as tables', async () => {
    const { pub, files, all } = await render([layOut(`See :ref{id=f1} and :ref{id=t1}.\n\n${para}`, baseConfig, resources)]);
    expectSound(pub, files);
    expect(all).toMatch(/<figure id="res-f1"><img src="\.\.\/images\/[\w-]+\.png" alt="A red square on white"\/>/);
    // A figcaption is the first or last child: the note goes inside it, a
    // space after the caption's last word.
    expect(all).toMatch(/<figcaption>.*<span class="pt-label">Figure\s1\.<\/span>.*A square\. <span class="pt-note">Drawn for the test\.<\/span><\/figcaption><\/figure>/);
    expect(all).toMatch(/<table id="res-t1">\n<caption[^>]*>.*Sizes\.<\/caption>/);
    expect(all).toContain('<thead>\n<tr><th scope="col">Size</th><th scope="col">Width</th><th scope="col">Note</th></tr>\n</thead>');
    expect(all).toContain('<td><strong>tight</strong></td>');
    expect(all).toContain('<td colspan="2">Both</td><td>merged</td>');
    expect(pub.items.some((i) => i.href.startsWith('images/') && i.mediaType === 'image/png')).toBe(true);
  });

  it('nests lists, groups quotations and boxes, links footnotes both ways', async () => {
    const md = [
      'A claim.[^n] More text.',
      '',
      '[^n]: The *note* itself.',
      '',
      '- First item',
      '  - Nested item',
      '    1. Deep one',
      '- Second item',
      '',
      '> Quoted one.',
      '',
      '> Quoted two.',
      '',
      ':::callout{type="note"}',
      'Inside the box.',
      '',
      '- a listed point',
      ':::',
    ].join('\n');
    const { pub, files, all } = await render([layOut(md)]);
    expectSound(pub, files);
    expect(all).toMatch(/<ul>\n<li><span class="pt-lbl">[^<]+<\/span> First item\n<ul>\n<li><span class="pt-lbl">[^<]+<\/span> Nested item\n<ol>\n<li><span class="pt-lbl">1\.<\/span> Deep one<\/li>\n<\/ol>\n<\/li>\n<\/ul>\n<\/li>\n<li><span class="pt-lbl">[^<]+<\/span> Second item<\/li>\n<\/ul>/);
    expect(all).toMatch(/<blockquote>\n<p>Quoted one\.<\/p>\n<p>Quoted two\.<\/p>\n<\/blockquote>/);
    expect(all).toMatch(/<aside class="pt-callout pt-callout-note">[\s\S]*Inside the box\.[\s\S]*a listed point[\s\S]*<\/aside>/);
    expect(all).toContain('<a epub:type="noteref" role="doc-noteref" class="pt-noteref" href="#fn-n" id="fnref-n">');
    expect(all).toMatch(/<aside epub:type="footnote" role="doc-footnote" id="fn-n" class="pt-footnote"><p>.*The <em>note<\/em> itself\. <a href="#fnref-n" role="doc-backlink"/);
    // The note left the flow: its text is read once, in the notes.
    expect(all.match(/itself/g)).toHaveLength(1);
  });

  it('sets formulas as labelled SVG, each with ids of its own', async () => {
    await initMathEngine();
    const md = ['Inline $\\vec{F}=m\\vec{a}$ and again $\\vec{F}=m\\vec{a}$.', '', '$$\\vec{F}=m\\vec{a}$$'].join('\n');
    const { pub, files, all } = await render([layOut(md)]);
    expectSound(pub, files);
    expect(all).toMatch(/<span class="pt-math" role="math" aria-label="\\vec\{F\}=m\\vec\{a\}"><svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]* width="[\d.]+em"/);
    expect(all).toMatch(/<div class="pt-math-display" role="math" aria-label="\\vec\{F\}=m\\vec\{a\}"><svg /);
    expect(all).not.toContain('data-mml-node');
    expect(pub.accessibility.features).toContain('describedMath');
  });

  it('joins a paragraph of a box split across pages', async () => {
    const config = { ...baseConfig, page: { ...baseConfig.page, height: pt(260) }, calloutStyles: [{ id: 'note', keepTogether: false }] };
    const md = [para.repeat(3), '', ':::callout{type="note"}', para.repeat(10), '', 'Last words **in** **the** box.', ':::'].join('\n');
    const doc = layOut(md, config as typeof baseConfig);
    expect(doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks)).filter((b) => b.type === 'callout').length).toBeGreaterThan(1);
    const { pub, files, all } = await render([doc]);
    expectSound(pub, files);
    const box = /<aside class="pt-callout pt-callout-note">[\s\S]*?<\/aside>/.exec(all)![0];
    expect(box.match(/<p>/g)).toHaveLength(2);
    expect(box).toContain('epub:type="pagebreak"');
    expect(box).toContain('<strong>in the</strong>');
    // About 2.5 s alone, but past 30 s on the CI runner while turbo runs
    // every package's tests at once.
  }, 90_000);

  it('links the rows of a printed contents to their headings, without page numbers', async () => {
    const md = ['# Contents', '', ':::toc', ':::', '', '# Alpha', '', para.repeat(10), '', '## Beta', '', para].join('\n');
    const { pub, files, all } = await render([layOut(md)]);
    expectSound(pub, files);
    const nav = /<nav id="toc-\d+" class="pt-toc" role="doc-toc">[\s\S]*?<\/nav>/.exec(all)![0];
    expect(nav).toMatch(/<a href="#h-\d+">Alpha<\/a>/);
    // Beta is a level the contents do not list.
    expect(nav).not.toContain('Beta');
    expect(nav.replace(/<span class="pt-lbl">\d+<\/span>/g, '')).not.toMatch(/>\s*\d+\s*</);
    expect(pub.landmarks.find((l) => l.type === 'toc')?.href).toMatch(/^text\/chapter-001\.xhtml#toc-\d+$/);
  });

  it('links index page numbers to the pages they name', async () => {
    const md = ['The :index[heart] pumps blood.', '', para.repeat(12), '', 'The pulse:index{term="Pulse"} is taken.', '', '# Index', '', ':::index'].join('\n');
    const { pub, files, all } = await render([layOut(md)]);
    expectSound(pub, files);
    expect(all).toMatch(/heart, <a class="pt-pageref" href="#page-\d+">\d+<\/a>/);
    expect(pub.landmarks.find((l) => l.type === 'index')).toBeDefined();
    expect(pub.accessibility.features).toContain('index');
  });

  it('sets each index entry as a paragraph classed by its depth', async () => {
    const md = [
      'The :index{term="valves!mitral"}mitral and :index{term="valves!aortic"}aortic valves close. The node:index{term="AV node" see="atrioventricular node"} fires.',
      '', para.repeat(6), '', '# Index', '', ':::index',
    ].join('\n');
    const { pub, files, all } = await render([layOut(md)]);
    expectSound(pub, files);
    // The head with no page of its own and its first sub-entry share a
    // block in print: two paragraphs here, not one broken by <br/>.
    expect(all).toMatch(/<p (?:id="b-\d+" )?class="pt-index-entry">valves<\/p>\n<p class="pt-index-entry pt-index-l1">aortic, <a class="pt-pageref"/);
    expect(all).toMatch(/<p class="pt-index-entry pt-index-l1">mitral, <a class="pt-pageref"/);
    // An entry with only a cross-reference is an index entry too.
    expect(all).toMatch(/<p (?:id="b-\d+" )?class="pt-index-entry">AV node\. <em>See<\/em> atrioventricular node<\/p>/);
    expect(all).not.toContain('<br/>');
    const css = pub.items.find((i) => i.href === 'styles/book.css')!.data as string;
    expect(css).toMatch(/p\.pt-index-entry \{[^}]*padding-inline-start: 2em;\n {2}text-indent: -2em;/);
    expect(css).toContain('p.pt-index-l1 {\n  margin-inline-start: 1em;');
  });

  it('carries a heading\'s 行取り and 字下げ and a style\'s end indent into the stylesheet (#424)', async () => {
    const config = {
      ...baseConfig,
      bodyText: { ...baseConfig.bodyText, fontSize: pt(10), lineHeight: pt(17.5) },
      headings: { levels: [{ level: 2, fontSize: pt(14), lineHeight: pt(21), lineSpan: 3, indent: { value: 4, unit: 'em' as const } }] },
      paragraphStyles: [{ id: 'sign', textAlign: 'end' as const, endIndent: { value: 1, unit: 'em' as const } }],
    };
    const { pub } = await render([layOut('## 一\n\nText.\n\n:::paragraphs{style="sign"}\nK\n:::', config)]);
    const css = pub.items.find((i) => i.href === 'styles/book.css')!.data as string;
    // (3 × 17.5 − 21) / 2 = 15.75 px above and below a 14 px heading;
    // 4 body ems are 40 px, 2.857 of its own.
    expect(css).toMatch(/h2 \{[^}]*margin: 1\.125em 0;\n {2}margin-inline-start: 2\.857em;/);
    expect(css).toMatch(/p\.ps-sign[^{]*\{[^}]*margin-inline-end: 1em;/);
    // Nothing of it without the settings.
    const plain = (await render([layOut('## One\n\nText.')])).pub.items.find((i) => i.href === 'styles/book.css')!.data as string;
    expect(plain).not.toContain('margin-inline-end');
    expect(plain).not.toMatch(/h2 \{[^}]*margin-inline-start/);
  });

  it('gives a part its own opener document', async () => {
    const docs = layOutBook([
      ':::part{number="I" title="Foundations"}\n:::\n\n# One\n\nText of one.',
      '# Two\n\nText of two.',
    ]);
    const { pub, files } = await render(docs);
    expectSound(pub, files);
    const names = [...files.keys()];
    expect(names[0]).toBe('text/part-001.xhtml');
    expect(files.get('text/part-001.xhtml')).toMatch(/<h1 id="part-\d+" class="pt-part-title">.*I<\/span> Foundations<\/h1>/);
    expect(files.get('text/part-001.xhtml')).toContain('epub:type="part" role="doc-part"');
    expect(pub.toc[0]!.label).toBe('I Foundations');
    expect(pub.toc[0]!.children?.map((c) => c.label)).toEqual(['One', 'Two']);
  });

  it('reads a float in the document of the text that cites it', async () => {
    const config = { ...baseConfig, parts: { page: false } };
    const md = [
      ':::part{number="I" title="First"}', ':::', '', `See :ref{id=f1}. ${para}`, '',
      ':::part{number="II" title="Second"}', ':::', '', para.repeat(3),
    ].join('\n');
    const { pub, files } = await render([layOut(md, config as typeof baseConfig, resources)]);
    expectSound(pub, files);
    expect([...files.keys()]).toEqual(['text/part-001.xhtml', 'text/chapter-001.xhtml', 'text/part-002.xhtml', 'text/chapter-001-2.xhtml']);
    expect(files.get('text/chapter-001.xhtml')).toContain('<figure id="res-f1">');
  });

  it('writes a cover first in the spine', async () => {
    const { pub, files } = await render([layOut('# Title\n\nText.')], { cover: { bytes: PNG, mediaType: 'image/png', alt: 'The cover' } });
    expectSound(pub, files);
    expect(pub.spine[0]!.idref).toBe('cover');
    expect(files.get('text/cover.xhtml')).toContain('<img role="doc-cover" src="../images/cover.png" alt="The cover"/>');
    expect(pub.items.find((i) => i.id === 'cover-image')?.properties).toEqual(['cover-image']);
    expect(pub.landmarks[0]).toEqual({ type: 'cover', label: 'Cover', href: 'text/cover.xhtml' });
  });

  it('marks Arabic documents right to left', async () => {
    const { files, pub } = await render([layOut('# عنوان\n\nنص عربي قصير.', { ...baseConfig, locale: 'ar' })], { metadata: { title: 'كتاب', language: 'ar' } });
    expectSound(pub, files);
    expect(files.get('text/chapter-001.xhtml')).toContain('lang="ar" xml:lang="ar" dir="rtl"');
  });

  it('sets vertical Chinese in a vertical stylesheet, pages right to left', async () => {
    const config = { ...baseConfig, locale: 'zh-Hans', layout: { writingMode: 'vertical-rl' as const }, page: { ...baseConfig.page, binding: 'right' as const } };
    const { pub, files } = await render([layOut('# 第一回\n\n天地玄黄，宇宙洪荒。日月盈昃，辰宿列张。'.repeat(3), config)], { metadata: { title: '千字文', language: 'zh-Hans' } });
    expectSound(pub, files);
    const css = pub.items.find((i) => i.href === 'styles/book.css')!.data as string;
    expect(css).toContain('writing-mode: vertical-rl');
    expect(pub.pageProgression).toBe('rtl');
    expect(files.get('text/chapter-001.xhtml')).toContain('天地玄黄，宇宙洪荒。');
  });

  it('derives the stylesheet from the configuration', async () => {
    const config = {
      ...baseConfig,
      bodyText: { fontFamily: 'Lora', fontSize: pt(10), lineHeight: pt(14), textAlign: 'justify' as const, firstLineIndent: { value: 1, unit: 'em' as const } },
    };
    const { pub } = await render([layOut('# Title\n\nText.', config)]);
    const css = pub.items.find((i) => i.href === 'styles/book.css')!.data as string;
    expect(css).toMatch(/body \{\n {2}font-family: "Lora", serif;\n {2}line-height: 1\.4;/);
    expect(css).toContain('text-align: justify');
    expect(css).toContain('hyphens: auto');
    expect(css).toMatch(/p \{\n {2}margin: 0;\n {2}text-indent: 1em;/);
    // No fixed widths: every size is relative.
    // No fixed widths: every size is relative (but the 1px box of a
    // heading kept for navigation alone).
    expect(css).not.toMatch(/(?<![-\w])(width|font-size|margin|padding)[^;{]*:\s*(?!1px)[\d.]+(px|pt|mm|cm|in)\b/);
  });
});

/** A document as an older engine wrote it: no paragraph style ids,
 *  no index levels. */
function withoutHints(doc: VDTDocument): VDTDocument {
  const strip = (b: VDTBlock): VDTBlock => ({
    ...b,
    paragraphStyleId: undefined,
    indexLevel: undefined,
    lines: b.lines.map((l) => ({ ...l, indexLevel: undefined })),
  });
  return {
    ...doc,
    blocks: doc.blocks.map(strip),
    pages: doc.pages.map((p) => ({
      ...p,
      columns: p.columns.map((c) => ({ ...c, blocks: c.blocks.map(strip) })),
      ...(p.floats ? { floats: p.floats.map(strip) } : {}),
    })),
  };
}

describe('reflowable rendition: the engine names styles and index levels', () => {
  // Two styles in the body face and size: the face alone cannot tell them.
  const config = {
    ...baseConfig,
    paragraphStyles: [
      { id: 'lead', marginTop: pt(6) },
      { id: 'coda', marginBottom: pt(6) },
      { id: 'poem', fontSize: pt(11) },
    ],
  };
  const md = [
    ':::paragraphs{style="lead"}', 'A lead paragraph.', ':::', '',
    ':::paragraphs{style="coda"}', 'A closing paragraph.', ':::', '',
    ':::callout{type="note"}', ':::paragraphs{style="lead"}', 'A lead inside a box.', ':::', ':::', '',
    ':::verse{style="poem"}', 'One line || of verse', ':::', '',
    ':::verse{style="poem"}', 'A line of verse', '  set line by line', ':::',
  ].join('\n');

  it('classes paragraphs, boxed ones and poems by the style they were set in', async () => {
    const { pub, files, all } = await render([layOut(md, config)]);
    expectSound(pub, files);
    expect(all).toMatch(/<p class="ps-lead">(?:<span epub:type="pagebreak"[^>]*><\/span>)?A lead paragraph\.<\/p>/);
    expect(all).toContain('<p class="ps-coda">A closing paragraph.</p>');
    expect(all).toMatch(/<aside class="pt-callout pt-callout-note">\n<p class="ps-lead">A lead inside a box\.<\/p>/);
    expect(all).toMatch(/<div class="pt-verse ps-poem">/);
    expect(all).toMatch(/<div class="pt-stanza ps-poem">/);
    const css = pub.items.find((i) => i.href === 'styles/book.css')!.data as string;
    expect(css).toContain('p.ps-poem, div.pt-verse.ps-poem, div.pt-stanza.ps-poem {');
  });

  it('tells an older document\'s styles from their faces', async () => {
    const { all } = await render([withoutHints(layOut(md, config))]);
    // Same face: no class to give.
    expect(all).toMatch(/<p>(?:<span epub:type="pagebreak"[^>]*><\/span>)?A lead paragraph\.<\/p>/);
    expect(all).toMatch(/<div class="pt-verse">/);
    expect(all).toMatch(/<div class="pt-stanza">/);
  });

  it('nests index entries by the level the engine gives, not by their indent', async () => {
    const index = [
      'The :index{term="valves!mitral"}mitral and :index{term="valves!aortic"}aortic valves close.',
      '', para.repeat(6), '', '# Index', '', ':::index',
    ].join('\n');
    // Sub-entries set flush: their indent says nothing.
    const flush = { ...baseConfig, index: { indent: pt(0) } };
    const { pub, files, all } = await render([layOut(index, flush)]);
    expectSound(pub, files);
    expect(all).toMatch(/class="pt-index-entry">valves<\/p>\n<p class="pt-index-entry pt-index-l1">aortic, <a class="pt-pageref"/);
    expect(all).toMatch(/<p class="pt-index-entry pt-index-l1">mitral, /);
    const old = await render([withoutHints(layOut(index, flush))]);
    expect(old.all).toMatch(/<p class="pt-index-entry">mitral, /);
  });
});

describe('reflowable rendition: pull quotes', () => {
  const config = { ...baseConfig, calloutStyles: [{ id: 'pullquote', title: '“' }, { id: 'note' }] };

  it('hides a pull quote that repeats the text from assistive technology', async () => {
    const md = [
      'She put it plainly. “A person stood on the same jetty and looked at the same water,” she says.',
      '', ':::callout{type="pullquote"}', '*A person stood on the same jetty … the same water.*', ':::', '',
      ':::callout{type="pullquote"}', 'Words of its own, printed nowhere else.', ':::', '',
      ':::callout{type="note"}', 'She put it plainly.', ':::',
    ].join('\n');
    const { pub, files, all } = await render([layOut(md, config)]);
    expectSound(pub, files);
    expect(all).toMatch(/<aside class="pt-callout pt-callout-pullquote pt-pullquote" epub:type="pullquote" role="doc-pullquote" aria-hidden="true">\n(?:<p class="pt-callout-title">“<\/p>\n)<p><em>A person stood/);
    // A pull quote with words of its own is read.
    expect(all).toMatch(/<aside class="pt-callout pt-callout-pullquote pt-pullquote" epub:type="pullquote">\n(?:<p class="pt-callout-title">“<\/p>\n)<p>Words of its own/);
    // Too short to be told from a coincidence: a box like any other.
    expect(all).toMatch(/<aside class="pt-callout pt-callout-note">\n<p>She put it plainly\.<\/p>/);
  });
});

describe('reflowable rendition: stylesheets per chapter and part', () => {
  const band = { hex: '#9bcdbf', model: 'hex' as const, paletteId: 'band' };
  const config = {
    ...baseConfig,
    colorPalette: [{ id: 'band', name: 'Band', value: { hex: '#9bcdbf', model: 'hex' as const } }],
    bodyText: { boldColor: band },
    headings: { levels: [{ level: 2, color: band }] },
  };
  const sheetOf = (pub: EpubPublication, href: string) => pub.items.find((i) => i.href === href)?.data as string | undefined;

  it('recolours the documents of a part with the palette it sets, in a stylesheet of their own', async () => {
    const docs = layOutBook([
      '# Zero\n\nSome **bold** words.\n\n## Before\n\nText.',
      ':::part{number="II" title="Two" palette="band=#f6c297"}\n:::\n\n# One\n\nMore **bold** words.\n\n## After\n\nText.',
      '# Two\n\nStill in part two.',
    ], config);
    const { pub, files } = await render(docs);
    expectSound(pub, files);
    expect(sheetOf(pub, 'styles/book.css')).toMatch(/strong, b \{[^}]*color: #9bcdbf;/);
    const own = sheetOf(pub, 'styles/book-2.css')!;
    expect(own).toMatch(/^@charset "UTF-8";\n/);
    expect(own).toContain('strong, b {\n  color: #f6c297;\n}');
    expect(own).toContain('h2 {\n  color: #f6c297;\n}');
    // Only what the palette changes.
    expect(own).not.toContain('font-size');
    const links = (href: string) => [...files.get(href)!.matchAll(/<link rel="stylesheet" type="text\/css" href="([^"]+)"\/>/g)].map((m) => m[1]);
    expect(links('text/chapter-001.xhtml')).toEqual(['../styles/book.css']);
    // The part opener, the chapter after it and the next chapter of the part.
    const recoloured = [...files.keys()].filter((href) => links(href).includes('../styles/book-2.css'));
    expect(recoloured).toEqual(['text/part-001.xhtml', 'text/chapter-002.xhtml', 'text/chapter-003.xhtml']);
    expect(pub.items.filter((i) => i.mediaType === 'text/css')).toHaveLength(2);
  });

  it('writes what a chapter configured otherwise changes, and drops what it leaves out', async () => {
    const first = { ...baseConfig, headingStyles: [{ id: 'plate', fontSize: pt(20), italic: true }] };
    const second = { ...baseConfig, headingStyles: [{ id: 'plate', fontSize: pt(14) }] };
    const docs = [
      layOut('# One {style="plate"}\n\nText.', first),
      layOut('# Two {style="plate"}\n\nText.', second),
      layOut('# Three {style="plate"}\n\nText.', first),
    ];
    const { pub, files } = await render(docs);
    expectSound(pub, files);
    const own = sheetOf(pub, 'styles/book-2.css')!;
    expect(own).toMatch(/\.hs-plate \{\n {2}font-size: [\d.]+em;\n {2}font-style: unset;\n\}/);
    expect(files.get('text/chapter-002.xhtml')).toContain('href="../styles/book-2.css"');
    expect(files.get('text/chapter-003.xhtml')).not.toContain('book-2.css');
  });
});

describe('reflowable rendition: Japanese note markers (JLReq §4.2.3)', () => {
  const md = '先生[^a]と呼んでいた。\n\n[^a]: 注の本文。';

  it('sets a side marker in a box of no advance over the text, linked to its note', async () => {
    const doc = layOut(md, { ...baseConfig, locale: 'ja', footnotes: { placement: 'column', markerPosition: 'side' } });
    const { pub, files, all } = await render([doc]);
    expectSound(pub, files);
    expect(all).toMatch(/<a epub:type="noteref"[^>]*><span class="pt-note-side"><span>1<\/span><\/span><\/a>/);
    const css = pub.items.find((i) => i.href === 'styles/book.css')!.data as string;
    expect(css).toMatch(/\.pt-note-side \{[^}]*inline-size: 0;[^}]*font-size: 0\.6em;/);
    expect(css).not.toContain('.pt-note-right');
  });

  it('sets a right marker of a vertical book reduced against the line\'s right side', async () => {
    const doc = layOut(md, { ...baseConfig, locale: 'ja', layout: { writingMode: 'vertical-rl' }, footnotes: { placement: 'column' } });
    const { pub, all } = await render([doc]);
    // The digit stands upright in its own cell (automatic tate-chū-yoko, #428).
    expect(all).toMatch(/<a epub:type="noteref"[^>]*><span class="pt-note-right">（<\/span><span class="pt-note-right"><span class="pt-tcy">1<\/span><\/span><span class="pt-note-right">）<\/span><\/a>/);
    const css = pub.items.find((i) => i.href === 'styles/book.css')!.data as string;
    expect(css).toMatch(/\.pt-note-right \{[^}]*font-size: 0\.7em;/);
  });

  it('writes no marker rule for other books', async () => {
    const { pub } = await render([layOut(`${para}[^a]\n\n[^a]: Note.`)]);
    const css = pub.items.find((i) => i.href === 'styles/book.css')!.data as string;
    expect(css).not.toContain('pt-note-');
  });
});

describe('reflowable rendition: verse line by line (#620)', () => {
  const poem = [
    'Before the poem.', '',
    ':::verse{align=start}',
    'Whose woods these are I think I know.',
    '  His house is in the village though; and this line runs on past the measure of the page, so it turns over',
    '',
    'He will not see me stopping here',
    ':::', '',
    'After the poem.',
  ].join('\n');

  it('writes a stanza an element, a line of verse a block that hangs its turnovers', async () => {
    const { pub, files, all } = await render([layOut(poem, baseConfig)]);
    expectSound(pub, files);
    const stanzas = all.match(/<div class="pt-stanza">[\s\S]*?<\/div>/g) ?? [];
    expect(stanzas).toHaveLength(2);
    const lines = stanzas[0]!.match(/<span class="pt-verse-line" style="([^"]*)">([\s\S]*?)<\/span>/g) ?? [];
    expect(lines).toHaveLength(2);
    // The indented line: its own indent plus the hang, the hang taken back.
    const [, style, text] = /style="([^"]*)">([\s\S]*?)<\/span>$/.exec(lines[1]!)!;
    const [pad, hang] = /padding-inline-start: ([\d.]+)em; text-indent: -([\d.]+)em/.exec(style!)!.slice(1).map(Number);
    expect(hang).toBeGreaterThan(0);
    expect(pad! - hang!).toBeCloseTo(1, 2);
    // The line and its turnover read as one line.
    expect(text!.replace(/<[^>]+>/g, '')).toContain('His house is in the village though; and this line runs on past the measure of the page, so it turns over');
    const css = pub.items.find((i) => i.href === 'styles/book.css')!.data as string;
    expect(css).toContain('.pt-verse-line {');
    expect(css).toContain('.pt-stanza {');
  });

  it('leaves the bracket of a turnover set flush right out', async () => {
    const md = poem.replace('{align=start}', '{align=start turnover=right}');
    const { all } = await render([layOut(md, baseConfig)]);
    const stanza = (all.match(/<div class="pt-stanza">[\s\S]*?<\/div>/) ?? [''])[0]!;
    expect(stanza).not.toContain('[');
  });
});

describe('reflowable rendition: line numbers of verse (#621)', () => {
  const poem = [':::verse{align=start}', ...Array.from({ length: 12 }, (_, i) => `Line ${i + 1} of the poem`), ':::'].join('\n');

  it('writes every Nth line\'s number in the margin, hidden from assistive technology', async () => {
    const { pub, files, all } = await render([layOut(poem, { ...baseConfig, lineNumbers: { enabled: true } })]);
    expectSound(pub, files);
    const numbers = [...all.matchAll(/<span class="pt-line-number" aria-hidden="true">([^<]*)<\/span>Line (\d+)/g)].map((m) => [m[1], m[2]]);
    expect(numbers).toEqual([['5', '5'], ['10', '10']]);
    const css = pub.items.find((i) => i.href === 'styles/book.css')!.data as string;
    expect(css).toContain('.pt-line-number {');
  });

  it('writes none without line numbers', async () => {
    const { pub, all } = await render([layOut(poem, baseConfig)]);
    expect(all).not.toContain('pt-line-number');
    expect(pub.items.find((i) => i.href === 'styles/book.css')!.data as string).not.toContain('.pt-line-number');
  });
});

describe('reflowable rendition: hanging paragraph styles (#620)', () => {
  it('hangs the turnovers of a style, its first line at the indent it sets itself', async () => {
    const em = (value: number) => ({ value, unit: 'em' as const });
    const config = { ...baseConfig, paragraphStyles: [{ id: 'bib', hangingIndent: em(2) }, { id: 'pair', firstLineIndent: em(1), hangingIndent: em(3) }] };
    const md = [':::paragraphs{style="bib"}', 'An entry.', ':::', '', ':::paragraphs{style="pair"}', 'A line.', ':::'].join('\n');
    const { pub } = await render([layOut(md, config)]);
    const css = pub.items.find((i) => i.href === 'styles/book.css')!.data as string;
    expect(css).toMatch(/p\.ps-bib \{\n {2}padding-inline-start: 2em;\n {2}text-indent: -2em;\n\}/);
    expect(css).toMatch(/p\.ps-pair \{\n {2}padding-inline-start: 3em;\n {2}text-indent: -2em;\n\}/);
  });
});

describe('reflowable rendition: tab stops (#622)', () => {
  const config = { ...baseConfig, bodyText: { ...baseConfig.bodyText, tabStops: [{ position: 'end' as const, align: 'end' as const, leader: '.' }] } };

  it('writes a line holding tabs as a row of its parts, the leader a border hidden from assistive technology', async () => {
    const md = ['Soup of the day\t8.50', '', 'Roast lamb\t21.00', '', para].join('\n');
    const { pub, files, all } = await render([layOut(md, config)]);
    expectSound(pub, files);
    expect(all).toContain('<p><span class="pt-tab-row"><span class="pt-tab-part">Roast lamb</span><span class="pt-tab-fill pt-leader-dots" aria-hidden="true"></span><span class="pt-tab-part">21.00</span></span></p>');
    expect(all).not.toMatch(/\.\.\./);
    const css = pub.items.find((i) => i.href === 'styles/book.css')!.data as string;
    expect(css).toContain('.pt-tab-row {');
    expect(css).toContain('.pt-leader-dots {');
  });

  it('keeps a start stop\'s part at its printed width, the rest of the row after it', async () => {
    const start = { ...baseConfig, bodyText: { ...baseConfig.bodyText, tabStops: [{ position: { value: 3, unit: 'em' as const } }] } };
    const { all } = await render([layOut('Q1\tThe question that follows the number.', start)]);
    expect(all).toMatch(/<span class="pt-tab-part" style="min-width:[\d.]+em">(?:<span epub:type="pagebreak"[^>]*><\/span>)?Q1<\/span><span class="pt-tab-gap" aria-hidden="true"><\/span><span class="pt-tab-part pt-tab-rest">The question/);
  });

  it('writes no tab rules for a book without tabs', async () => {
    const { pub } = await render([layOut(para, baseConfig)]);
    expect(pub.items.find((i) => i.href === 'styles/book.css')!.data as string).not.toContain('.pt-tab-row');
  });
});

describe('reflowable rendition: drop caps (#623)', () => {
  const config = { ...baseConfig, headings: { levels: [{ level: 1, dropCap: { lines: 3 } }] } };

  it('writes the initial in a span right before the rest of its word, set as a CSS initial letter', async () => {
    const md = ['# One', '', `Long before ${para}${para}`, '', para].join('\n');
    const { pub, files, all } = await render([layOut(md, config)]);
    expectSound(pub, files);
    expect(all).toMatch(/<p class="pt-has-dropcap">(?:<span epub:type="pagebreak"[^>]*><\/span>)?<span class="pt-dropcap pt-dropcap-3-3" style="[^"]*">L<\/span>ong before/);
    const css = pub.items.find((i) => i.href === 'styles/book.css')!.data as string;
    expect(css).toContain('initial-letter: 3 3;');
    expect(css).toContain('.pt-dropcap {');
    expect(css).toContain('.pt-has-dropcap {');
  });

  it('writes no drop cap rules for a book without drop caps', async () => {
    const { pub } = await render([layOut(para, baseConfig)]);
    expect(pub.items.find((i) => i.href === 'styles/book.css')!.data as string).not.toContain('pt-dropcap');
  });
});
