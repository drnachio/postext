import { describe, expect, it } from 'vitest';
import { initMathEngine } from 'postext';
import type { Resource, VDTDocument, VDTLine, VDTLineSegment } from 'postext';
import { PNG, baseConfig, layOut, layOutBook, pt } from './__tests__/vdt';
import { checkXml } from './__tests__/xml';
import { buildReflowablePublication } from '.';
import { appendLine, type InlineContext, type TextSink } from './inline';
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

  it('leaves out the kashidas justification stretched a line with', () => {
    expect(joined([line([seg('كتـــاب')], { kashida: 3 })])).toBe('كتاب');
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
    // A figcaption is the first or last child: the note goes inside it.
    expect(all).toMatch(/<figcaption>.*<span class="pt-label">Figure\s1\.<\/span>.*A square\.<span class="pt-note">Drawn for the test\.<\/span><\/figcaption><\/figure>/);
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

  it('writes a cover first in the spine', async () => {
    const { pub, files } = await render([layOut('# Title\n\nText.')], { cover: { bytes: PNG, mediaType: 'image/png', alt: 'The cover' } });
    expectSound(pub, files);
    expect(pub.spine[0]!.idref).toBe('cover');
    expect(files.get('text/cover.xhtml')).toContain('<img src="../images/cover.png" alt="The cover"/>');
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
