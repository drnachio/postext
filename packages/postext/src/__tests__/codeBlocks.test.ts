import { describe, it, expect, afterEach } from 'vitest';
import { parseMarkdown, parseMarkdownWithIssues } from '../parse';
import { buildDocument } from '../pipeline';
import { renderToHtml } from '../html-backend';
import { CONFIG_VERSION, migrateConfig, migrateBundleConfig, pinLegacyCodeBlocks } from '../bundle/configVersion';
import { resolveCodeStyleConfig, stripCodeStyleDefaults, DEFAULT_CODE_STYLE } from '../defaults/codeStyle';
import { resolveBodyTextConfig } from '../defaults/bodyText';
import { stripConfigDefaults } from '../defaults';
import { highlightCode, registerCodeHighlighter } from '../code/highlight';
import { fencedCodeLines } from '../parse/codeFence';
import { collectConfigWarnings } from '../configWarnings';
import { configFontFamilies, collectFontUsage } from '../fonts/usage';
import { formatWarning } from '../pipeline/contentWarnings';
import type { PostextConfig } from '../types';
import type { VDTBlock, VDTDocument, VDTLine } from '../vdt';

// #624: code blocks. The stub font: 7 px a character, a space 4 px; the
// 'Shrinky' face scales with its size (7 px at 17 px).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    let w = 0;
    for (const c of s) w += c === ' ' ? 4 : 7;
    const size = /(\d+(?:\.\d+)?)px/.exec(this.font);
    return { width: this.font.includes('Shrinky') && size ? w * Number(size[1]) / 17 : w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const em = (value: number) => ({ value, unit: 'em' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
// 72 dpi, a 20 pt body on 30 pt leading, a 360 pt measure from x = 20; the
// code at 0.85 em (17 px) in a box padded 0.6 em of it.
const config = (extra: PostextConfig = {}, width = 400, height = 600): PostextConfig => ({
  page: { dpi: 72, width: pt(width), height: pt(height), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  ...extra,
  bodyText: { fontSize: pt(20), lineHeight: { value: 1.5, unit: 'em' }, firstLineIndent: pt(0), hyphenation: { enabled: false }, ...extra.bodyText },
});
const codeBlocks = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'code');
const frames = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'callout');
const codeLines = (doc: VDTDocument): VDTLine[] => codeBlocks(doc).flatMap((b) => b.lines);
const pageOf = (doc: VDTDocument, block: VDTBlock): number => doc.pages.findIndex((p) => p.columns.some((c) => c.blocks.includes(block)));

/** Copied text of a block in the HTML viewer: its markup with tags and
 *  hidden spans (leaders, numbers) left out. */
function copiedText(html: string, blockId: string): string {
  const start = html.indexOf(`data-block-id="${blockId}"`);
  const open = html.lastIndexOf('<div', start);
  let depth = 0;
  let end = open;
  const re = /<(\/?)div\b[^>]*>/g;
  re.lastIndex = open;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) { end = m.index; break; }
  }
  const inner = html.slice(open, end).replace(/<span aria-hidden="true"[^>]*>[^<]*(?:<span[^>]*>[^<]*<\/span>)?<\/span>/g, '');
  return inner.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

afterEach(() => {
  registerCodeHighlighter('js', null);
  registerCodeHighlighter('*', null);
});

describe('code fences: the markup', () => {
  const md = ['Before.', '```js', '  # not a heading', '- not a list', '1. not a list', '> no quote', '$x$ **no** `x` :::callout', ':::', '', '\tTab  and  spaces', '```', 'After.'].join('\n');

  it('keeps every character of the listing, nothing read as Markdown', () => {
    const blocks = parseMarkdown(md);
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'code', 'paragraph']);
    const code = blocks[1]!;
    expect(code.code!.lang).toBe('js');
    expect(code.code!.fence).toBe('```');
    expect(code.code!.lines).toEqual(['  # not a heading', '- not a list', '1. not a list', '> no quote', '$x$ **no** `x` :::callout', ':::', '', '\tTab  and  spaces']);
    expect(code.text).toBe(code.code!.lines.join('\n'));
    expect(code.spans).toEqual([{ text: code.text, bold: false, italic: false }]);
  });

  it('maps every character to its source, a line feed to the line end', () => {
    const code = parseMarkdown(md)[1]!;
    for (let i = 0; i < code.text.length; i++) {
      if (code.text[i] === '\n') expect(md[code.sourceMap[i]!]).toBe('\n');
      else expect(md[code.sourceMap[i]!]).toBe(code.text[i]);
    }
    expect(code.sourceStart).toBe(md.indexOf('```js'));
    expect(md.slice(code.sourceEnd - 3, code.sourceEnd)).toBe('```');
  });

  it('interrupts a paragraph, and the text after the closing fence is a new paragraph', () => {
    const blocks = parseMarkdown(['One', 'two', '~~~', 'x', '~~~', 'three'].join('\n'));
    expect(blocks.map((b) => [b.type, b.text])).toEqual([['paragraph', 'One two'], ['code', 'x'], ['paragraph', 'three']]);
  });

  it('closes on a fence of its own character at least as long', () => {
    const four = parseMarkdown(['````md', '```js', 'inner', '```', '````'].join('\n'));
    expect(four.map((b) => b.type)).toEqual(['code']);
    expect(four[0]!.code!.lines).toEqual(['```js', 'inner', '```']);
    const tilde = parseMarkdown(['~~~', '```', 'x', '~~~'].join('\n'));
    expect(tilde[0]!.code!.lines).toEqual(['```', 'x']);
    expect(tilde[0]!.code!.fence).toBe('~~~');
  });

  it('takes the fence indentation off the lines', () => {
    const [code] = parseMarkdown(['  ```', '  a', '    b', 'c', '  ```'].join('\n'));
    expect(code!.code!.lines).toEqual(['a', '  b', 'c']);
  });

  it('reports a fence left open and runs it to the end', () => {
    const { blocks, issues } = parseMarkdownWithIssues(['Text.', '', '```python', 'print(1)', '', '# end'].join('\n'));
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'code']);
    expect(blocks[1]!.code!.lines).toEqual(['print(1)', '', '# end']);
    expect(issues).toEqual([expect.objectContaining({ kind: 'unclosedCodeBlock', delimiter: '```', lang: 'python' })]);
  });

  it('reads the info string: language, attributes, a bare title', () => {
    const read = (info: string) => parseMarkdown(['```' + info, 'x', '```'].join('\n'))[0]!.code!;
    expect(read('bash {title="backup.sh" lineNumbers start=12 highlight="3,5-7"}')).toMatchObject({ lang: 'bash', title: 'backup.sh', attrs: { title: 'backup.sh', lineNumbers: '', start: '12', highlight: '3,5-7' } });
    expect(read('console Terminal')).toMatchObject({ lang: 'console', title: 'Terminal' });
    expect(read('python normalize.py')).toMatchObject({ lang: 'python', title: 'normalize.py' });
    expect(read('JS title="a b"')).toMatchObject({ lang: 'js', title: 'a b' });
    expect(read('')).toEqual(expect.objectContaining({ info: '', attrs: {} }));
    // A backtick fence's info string holds no backtick: a line of text.
    expect(parseMarkdown('```js `x` here').map((b) => b.type)).toEqual(['paragraph']);
  });

  it('reads indented code only when asked', () => {
    const md2 = ['Text.', '', '    let a = 1;', '', '\tlet b = 2;', '', 'After.'].join('\n');
    expect(parseMarkdown(md2).map((b) => b.type)).toEqual(['paragraph', 'paragraph', 'paragraph', 'paragraph']);
    const on = parseMarkdown(md2, { indentedCode: true });
    expect(on.map((b) => b.type)).toEqual(['paragraph', 'code', 'paragraph']);
    expect(on[1]!.code!.lines).toEqual(['let a = 1;', '', 'let b = 2;']);
    expect(on[1]!.code!.fence).toBe('indent');
    // A nested list keeps its items.
    expect(parseMarkdown(['- a', '', '    - b'].join('\n'), { indentedCode: true }).map((b) => b.type)).toEqual(['listItem', 'listItem']);
  });

  it('reads fences as Markdown when asked (postext 1.22)', () => {
    const blocks = parseMarkdown(md, { fences: false });
    expect(blocks.some((b) => b.type === 'code')).toBe(false);
    expect(blocks.some((b) => b.type === 'heading')).toBe(true);
  });

  it('works inside a box and closes a list', () => {
    const blocks = parseMarkdown([':::callout', '```', ':::', '```', ':::', '', '- item', '```', 'x', '```'].join('\n'));
    expect(blocks.map((b) => b.type)).toEqual(['containerStart', 'code', 'containerEnd', 'listItem', 'code']);
  });

  it('keeps index marks and anchors in a listing as written', () => {
    const blocks = parseMarkdown(['A :index[term] mark.', '', '```', 'B :index[x] and :anchor{#a}', '```'].join('\n'));
    expect(blocks[1]!.code!.lines).toEqual(['B :index[x] and :anchor{#a}']);
    expect(blocks[0]!.indexMarks?.length).toBe(1);
    expect(blocks[1]!.indexMarks).toBeUndefined();
  });

  it('tells editors which lines a listing takes', () => {
    expect(fencedCodeLines(['a', '```js', '# x', '```', 'b', '~~~', 'c'])).toEqual([false, true, true, true, false, true, true]);
  });

  it('records the inline code of text blocks', () => {
    const md3 = 'Run `ls -l` and `pwd`.';
    const [p] = parseMarkdown(md3);
    expect(p!.inlineCode!.map((r) => md3.slice(r.start, r.end))).toEqual(['ls -l', 'pwd']);
  });
});

describe('code listings: the layout', () => {
  const LISTING = ['Text.', '', '```', 'one', '  two  three', '', 'four', '```', '', 'After.'].join('\n');

  it('sets one line per source line, as written, in the code face, never justified', () => {
    const doc = buildDocument({ markdown: LISTING }, config({ bodyText: { textAlign: 'justify' } }));
    const [code] = codeBlocks(doc);
    expect(code!.lines.map((l) => l.text)).toEqual(['one', '  two  three', '', 'four']);
    for (const line of code!.lines) {
      expect(line.hyphenated).toBe(false);
      expect(line.ragged).toBe(true);
      for (const seg of line.segments ?? []) expect(seg.fontString).toContain('Source Code Pro');
    }
    // Spaces keep their advance: two spaces then "two".
    const second = code!.lines[1]!;
    expect(second.segments!.reduce((s, g) => s + g.width, 0)).toBe(4 * 4 + 3 * 7 + 5 * 7);
    expect(code!.textAlign).toBe('left');
  });

  it('sets the box of codeStyle: background, border, radius, padding', () => {
    const doc = buildDocument({ markdown: LISTING }, config({ codeStyle: {
      background: hex('#101010'), border: { enabled: true, color: hex('#ff0000'), width: pt(1) },
      borderRadius: pt(4), padding: { top: pt(5), right: pt(6), bottom: pt(7), left: pt(8) },
    } }));
    const [frame] = frames(doc);
    const [code] = codeBlocks(doc);
    expect(frame!.callout!.styleId).toBe('__postext-code');
    const box = frame!.designOverlay!.blocks.find((b) => b.kind === 'box');
    expect(box && box.kind === 'box' ? box.box : undefined).toEqual({ backgroundColor: '#101010', borderColor: '#ff0000', borderWidthPx: 1, borderRadiusPx: 4 });
    expect(code!.bbox.x - frame!.bbox.x).toBeCloseTo(8, 5);
    expect(code!.bbox.y - frame!.bbox.y).toBeCloseTo(5, 5);
    expect(frame!.bbox.height).toBeCloseTo(5 + 4 * 30 + 7, 5);
  });

  it('keeps tabs as tab segments at the next stop', () => {
    const doc = buildDocument({ markdown: ['```', 'a\tb', '\tc', '```'].join('\n') }, config());
    const [code] = codeBlocks(doc);
    const [first, second] = code!.lines;
    const tab = first!.segments!.find((s) => s.text === '\t')!;
    expect(tab.kind).toBe('space');
    // 'a' takes one cell, the tab the three to the stop at 4.
    expect(tab.width).toBe(3 * 4);
    expect(second!.segments![0]!.width).toBe(4 * 4);
    expect(first!.text).toBe('a\tb');
  });

  it('a title row from the fence, or a label tab when codeStyle.label is set', () => {
    const md = ['```js app.js', 'x', '```'].join('\n');
    const titled = frames(buildDocument({ markdown: md }, config()))[0]!;
    expect(titled.designOverlay!.blocks.some((b) => b.kind === 'text' && b.lines[0]!.text === 'app.js')).toBe(true);
    const labelled = frames(buildDocument({ markdown: md }, config({ codeStyle: { label: { background: hex('#000000'), color: hex('#ffffff') } } })))[0]!;
    const texts = labelled.designOverlay!.blocks.filter((b) => b.kind === 'text');
    expect(texts.map((b) => b.kind === 'text' ? b.lines[0]!.text : '')).toEqual(['app.js']);
    expect(labelled.designOverlay!.blocks.some((b) => b.kind === 'box' && b.box.backgroundColor === '#000000')).toBe(true);
  });

  it('spans the page with span=page in a two-column layout', () => {
    const doc = buildDocument({ markdown: ['Text.', '', '```js {span=page}', 'wide()', '```'].join('\n') }, config({ layout: { layoutType: 'double', gutterWidth: pt(20) } }));
    const [frame] = frames(doc);
    expect(frame!.bbox.width).toBeCloseTo(360, 0);
  });

  it('sits in a box nested in a callout', () => {
    const doc = buildDocument({ markdown: [':::callout', 'Note.', '', '```', 'code', '```', ':::'].join('\n') }, config());
    const fs = frames(doc);
    expect(fs.map((f) => f.callout!.styleId)).toEqual(['note', '__postext-code']);
    const [code] = codeBlocks(doc);
    expect(code!.lines[0]!.text).toBe('code');
    expect(code!.bbox.x).toBeGreaterThan(fs[1]!.bbox.x);
    expect(fs[1]!.bbox.x).toBeGreaterThan(fs[0]!.bbox.x);
  });

  it('keeps the code style in a :::paragraphs group', () => {
    const doc = buildDocument({ markdown: [':::paragraphs{style="small"}', 'Para.', '', '```', 'code', '```', ':::'].join('\n') }, config({ paragraphStyles: [{ id: 'small', fontSize: pt(10) }] }));
    const [code] = codeBlocks(doc);
    expect(code!.lines[0]!.segments![0]!.fontString).toContain('17px');
  });

  it('follows the flow of a vertical book, with no line numbers', () => {
    const doc = buildDocument({ markdown: ['本文。', '', '```js {lineNumbers}', 'let a = 1;', '```'].join('\n') }, config({ locale: 'ja', layout: { layoutType: 'single', writingMode: 'vertical-rl' } }));
    const [code] = codeBlocks(doc);
    expect(code!.lines.map((l) => l.text)).toEqual(['let a = 1;']);
    expect(doc.pages.every((p) => !p.lineNumbers)).toBe(true);
  });

  it('is laid out in a right-to-left document left to right, from the far side', () => {
    const doc = buildDocument({ markdown: ['نص.', '', '```', 'let a = 1;', '```'].join('\n') }, config({ locale: 'ar' }));
    const [code] = codeBlocks(doc);
    expect(code!.lines[0]!.text).toBe('let a = 1;');
    expect(code!.direction).toBe('ltr');
    expect(code!.lines[0]!.measure).toBeDefined();
  });
});

describe('code listings: lines wider than the box', () => {
  const long = 'x'.repeat(60) + ' ' + 'y'.repeat(59);
  const md = ['```js', long, 'short', '```'].join('\n');
  // A 300 pt page: 260 pt measure, the code 17 px a character? The stub
  // sets every character 7 px: 239 px of code room, 34 characters.
  const narrow = (cs: PostextConfig['codeStyle']) => buildDocument({ markdown: md }, config({ codeStyle: cs }, 300));

  it('wraps with the marker in the hang, and warns', () => {
    const doc = narrow({});
    const lines = codeLines(doc);
    expect(lines.length).toBeGreaterThan(3);
    const conts = lines.filter((l) => l.codeLine?.continued);
    expect(conts.length).toBeGreaterThan(0);
    expect(lines[0]!.codeLine!.wrapped).toBe(true);
    for (const c of conts) {
      expect(c.segments![0]!.leader).toBe('text');
      expect(c.segments![0]!.text).toBe('»');
      expect(c.text.includes('»')).toBe(false);
    }
    // The pieces join into the line as written.
    const joined = lines.slice(0, lines.findIndex((l) => l.text === 'short')).map((l) => l.text).join('');
    expect(joined).toBe(long);
    // Every visual line fits.
    const room = codeBlocks(doc)[0]!.bbox.width;
    for (const l of lines) expect(l.segments!.reduce((s, g) => s + g.width, 0)).toBeLessThanOrEqual(room + 0.01);
    expect(doc.contentWarnings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'codeOverflow', mode: 'wrap', lines: 1, lang: 'js' })]));
  });

  it('breaks after a space when one fits', () => {
    const doc = buildDocument({ markdown: ['```', 'aaaa '.repeat(20), '```'].join('\n') }, config({}, 300));
    for (const l of codeLines(doc).slice(0, -1)) expect(l.text.endsWith(' ')).toBe(true);
  });

  it('shrinks the listing down to minFontScale, then wraps, and warns', () => {
    const shrink = { overflow: 'shrink' as const, minFontScale: 0.5, fontFamily: 'Shrinky' };
    const fits = buildDocument({ markdown: ['```js', 'x'.repeat(50), 'short', '```'].join('\n') }, config({ codeStyle: shrink }, 300));
    const [code] = codeBlocks(fits);
    expect(code!.lines.map((l) => l.text)).toEqual(['x'.repeat(50), 'short']);
    const scale = code!.code!.fit!.scale;
    expect(scale).toBeLessThan(1);
    expect(scale).toBeGreaterThanOrEqual(0.5);
    expect(code!.lines[0]!.segments![0]!.fontString).toContain(`${17 * scale}px`);
    expect(code!.lines[0]!.segments!.reduce((s, g) => s + g.width, 0)).toBeLessThanOrEqual(code!.bbox.width + 0.01);
    const w = fits.contentWarnings!.find((x) => x.kind === 'codeOverflow');
    expect(w).toMatchObject({ mode: 'shrink', lines: 1, scale });
    expect(formatWarning(w!)).toContain('%');
    // Past the floor the line turns over too.
    const floor = codeBlocks(narrow(shrink))[0]!;
    expect(floor.code!.fit!.scale).toBe(0.5);
    expect(floor.lines.some((l) => l.codeLine?.continued)).toBe(true);
  });

  it('clips at the box edge, and warns', () => {
    const doc = narrow({ overflow: 'clip' });
    const [code] = codeBlocks(doc);
    expect(code!.lines.length).toBe(2);
    expect(code!.lines[0]!.codeLine!.clipped).toBe(true);
    expect(code!.lines[0]!.segments!.reduce((s, g) => s + g.width, 0)).toBeLessThanOrEqual(code!.bbox.width + 0.01);
    expect(doc.contentWarnings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'codeOverflow', mode: 'clip' })]));
  });
});

describe('code listings: across columns and pages', () => {
  const many = (n: number) => ['Intro.', '', '```', ...Array.from({ length: n }, (_, i) => `line ${i + 1}`), '```', '', 'After.'].join('\n');

  it('splits between lines across pages, each part framed, no part of one line', () => {
    const doc = buildDocument({ markdown: many(40) }, config({}, 400, 400));
    const parts = codeBlocks(doc);
    expect(parts.length).toBeGreaterThan(1);
    expect(new Set(parts.map((p) => pageOf(doc, p))).size).toBe(parts.length);
    for (const p of parts) expect(p.lines.length).toBeGreaterThanOrEqual(2);
    expect(frames(doc).length).toBe(parts.length);
    expect(parts.flatMap((p) => p.lines.map((l) => l.text))).toEqual(Array.from({ length: 40 }, (_, i) => `line ${i + 1}`));
  });

  it('splits across columns', () => {
    const doc = buildDocument({ markdown: many(30) }, config({ layout: { layoutType: 'double', gutterWidth: pt(20) } }, 400, 400));
    const parts = codeBlocks(doc);
    expect(parts.length).toBeGreaterThan(1);
    const cols = parts.map((p) => doc.pages.flatMap((pg) => pg.columns).findIndex((c) => c.blocks.includes(p)));
    expect(new Set(cols).size).toBe(parts.length);
  });

  it('repeats the title only when asked', () => {
    const md = ['```js long.js', ...Array.from({ length: 40 }, (_, i) => `line ${i + 1}`), '```'].join('\n');
    const titles = (doc: VDTDocument) => frames(doc).map((f) => f.designOverlay!.blocks.filter((b) => b.kind === 'text').map((b) => b.kind === 'text' ? b.lines[0]!.text : '').join());
    const plain = titles(buildDocument({ markdown: md }, config({}, 400, 400)));
    expect(plain[0]).toBe('long.js');
    expect(plain.slice(1).every((t) => t === '')).toBe(true);
    const repeated = titles(buildDocument({ markdown: md }, config({ codeStyle: { repeatTitle: true } }, 400, 400)));
    expect(repeated.slice(1).every((t) => t.startsWith('long.js'))).toBe(true);
  });

  it('keeps a wrapped line with its continuations when another cut fits', () => {
    const long = 'z'.repeat(80);
    const lines = Array.from({ length: 30 }, (_, i) => (i % 3 === 2 ? long : `line ${i + 1}`));
    const doc = buildDocument({ markdown: ['```', ...lines, '```'].join('\n') }, config({}, 300, 400));
    const parts = codeBlocks(doc);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts.slice(1)) expect(p.lines[0]!.codeLine!.continued).toBeUndefined();
  });
});

describe('code listings: line numbers and highlighted lines', () => {
  const md = ['```js {lineNumbers start=9 highlight="2"}', 'a();', 'b();', 'c();', '```'].join('\n');

  it('numbers the lines in the page slot, out of the text', () => {
    const doc = buildDocument({ markdown: md }, config());
    const [code] = codeBlocks(doc);
    expect(code!.lines.map((l) => l.codeLine!.number)).toEqual(['9', '10', '11']);
    const slot = doc.pages[0]!.lineNumbers!;
    const nums = slot.blocks.filter((b) => b.kind === 'text');
    expect(nums.map((b) => b.kind === 'text' ? b.lines[0]!.text : '')).toEqual(['9', '10', '11']);
    for (const b of nums) expect(b.kind === 'text' && b.artifact).toBe(true);
    // Right-aligned against the gutter, left of the code.
    const rights = nums.map((b) => b.bbox.x + b.bbox.width);
    expect(rights[0]).toBeCloseTo(rights[1]!, 5);
    expect(rights[0]!).toBeLessThan(code!.lines[0]!.bbox.x);
    // The gutter: two digits and the gap.
    const frame = frames(doc)[0]!;
    expect(code!.lines[0]!.bbox.x - frame.callout!.innerRect.x - frame.bbox.x).toBeCloseTo(2 * 7 + 17, 5);
    // The highlighted line has a band behind it.
    const band = frame.designOverlay!.blocks.find((b) => b.kind === 'box' && b.box.backgroundColor === DEFAULT_CODE_STYLE.highlightBackground.hex);
    expect(band).toBeDefined();
    expect(band!.bbox.y).toBeCloseTo(code!.lines[1]!.bbox.y, 5);
  });

  it('numbers every listing with codeStyle.lineNumbers, a fence turning it off', () => {
    const doc = buildDocument({ markdown: ['```', 'a', '```', '', '```js {lineNumbers=false}', 'b', '```'].join('\n') }, config({ codeStyle: { lineNumbers: true } }));
    expect(codeBlocks(doc).map((b) => b.lines[0]!.codeLine!.number)).toEqual(['1', undefined]);
  });

  it('copies the listing with its indentation and no numbers or markers from the HTML viewer', () => {
    const doc = buildDocument({ markdown: ['```py {lineNumbers}', 'def f():', '    return 1  # one', '', 'x = f()', '```'].join('\n') }, config());
    const html = renderToHtml(doc);
    const [code] = codeBlocks(doc);
    expect(copiedText(html, code!.id)).toBe('def f():\n    return 1  # one\n\nx = f()\n');
    expect(html).toContain('pt-line-numbers');
  });

  it('copies a wrapped line whole', () => {
    const long = 'w'.repeat(70);
    const doc = buildDocument({ markdown: ['```', long, 'end', '```'].join('\n') }, config({}, 300));
    const [code] = codeBlocks(doc);
    expect(copiedText(renderToHtml(doc), code!.id)).toBe(`${long}\nend\n`);
  });
});

describe('code listings: syntax colouring', () => {
  const kinds = (code: string, lang: string) => highlightCode(code, lang, true)!.flat().filter((t) => t.token).map((t) => [t.token, t.text]);

  it('names the tokens of js, python, bash and console', () => {
    expect(kinds('const a = "s"; // c\nf(42);', 'js')).toEqual([
      ['keyword', 'const'], ['operator', '='], ['string', '"s"'], ['punctuation', ';'], ['comment', '// c'],
      ['function', 'f'], ['punctuation', '('], ['number', '42'], ['punctuation', ');'],
    ]);
    expect(kinds('def f(x):\n    return "a" # c', 'python')).toEqual([
      ['keyword', 'def'], ['function', 'f'], ['punctuation', '('], ['punctuation', ')'], ['operator', ':'],
      ['keyword', 'return'], ['string', '"a"'], ['comment', '# c'],
    ]);
    expect(kinds('if [ -f "$F" ]; then echo $HOME; fi # done', 'bash')).toEqual([
      ['keyword', 'if'], ['punctuation', '['], ['meta', '-f'], ['string', '"$F"'], ['punctuation', ']'], ['operator', ';'],
      ['keyword', 'then'], ['function', 'echo'], ['variable', '$HOME'], ['operator', ';'], ['keyword', 'fi'], ['comment', '# done'],
    ]);
    expect(kinds('$ ls -l\ntotal 8\n% pwd', 'console')).toEqual([['prompt', '$ ls -l'], ['output', 'total 8'], ['prompt', '% pwd']]);
  });

  it('keeps a comment or a string that runs over lines', () => {
    const lines = highlightCode('a /* one\ntwo */ b\n"""x\ny"""', 'js', true)!;
    expect(lines[1]![0]).toEqual({ text: 'two */', token: 'comment' });
    const py = highlightCode('s = """x\ny"""', 'python', true)!;
    expect(py[1]![0]).toEqual({ text: 'y"""', token: 'string' });
  });

  it('reads json, css, html, markdown and sql', () => {
    expect(kinds('{"a": 1, "b": true}', 'json')).toEqual(expect.arrayContaining([['variable', '"a"'], ['number', '1'], ['number', 'true']]));
    expect(kinds('a { color: #fff; }', 'css')).toEqual(expect.arrayContaining([['type', 'a'], ['variable', 'color'], ['number', '#fff']]));
    expect(kinds('<a href="x">t</a>', 'html')).toEqual(expect.arrayContaining([['keyword', 'a'], ['variable', 'href'], ['string', '"x"']]));
    expect(kinds('# Head\n- item `c`', 'markdown')).toEqual(expect.arrayContaining([['keyword', '# Head'], ['punctuation', '-'], ['string', '`c`']]));
    expect(kinds('SELECT a FROM t -- c', 'sql')).toEqual(expect.arrayContaining([['keyword', 'SELECT'], ['keyword', 'FROM'], ['comment', '-- c']]));
  });

  it('sets an unknown language plain, and none with highlight: none', () => {
    expect(highlightCode('x', 'cobol', true)).toBeUndefined();
    expect(highlightCode('const a', 'js', false)).toBeUndefined();
  });

  it('colours the tokens in codeStyle.tokens colours, palette links included', () => {
    const md = ['```js', 'const a = 1; // note', '```'].join('\n');
    const cfg = config({
      colorPalette: [{ id: 'kw', name: 'kw', value: hex('#aa0000') }],
      codeStyle: { tokens: { keyword: { color: { hex: '#000000', model: 'hex', paletteId: 'kw' }, bold: true }, comment: { color: hex('#00aa00') } } },
    });
    const segs = codeLines(buildDocument({ markdown: md }, cfg)).flatMap((l) => l.segments ?? []);
    const kw = segs.find((s) => s.text === 'const')!;
    expect(kw.color).toBe('#aa0000');
    expect(kw.bold).toBe(true);
    expect(kw.fontString).toContain('700');
    const comment = segs.find((s) => s.text.startsWith('//'))!;
    expect(comment.color).toBe('#00aa00');
    expect(comment.italic).toBe(true);
  });

  it('follows a part palette', () => {
    const md = [':::part{palette="kw=#0000ff"}', '# Part', ':::', '', '```js', 'const a', '```'].join('\n');
    const cfg = config({
      colorPalette: [{ id: 'kw', name: 'kw', value: hex('#aa0000') }],
      codeStyle: { tokens: { keyword: { color: { hex: '#aa0000', model: 'hex', paletteId: 'kw' } } } },
    });
    const kw = codeLines(buildDocument({ markdown: md }, cfg)).flatMap((l) => l.segments ?? []).find((s) => s.text === 'const')!;
    expect(kw.color?.toLowerCase()).toBe('#0000ff');
  });

  it('lets a registered highlighter replace the built-in one for its language', () => {
    registerCodeHighlighter('js', (code) => code.split('\n').map((line) => [{ text: line, color: '#123456' }]));
    const segs = codeLines(buildDocument({ markdown: ['```js', 'const a', '```'].join('\n') }, config())).flatMap((l) => l.segments ?? []);
    expect(segs.map((s) => [s.text, s.color])).toEqual([['const a', '#123456']]);
    // One whose lines do not match the listing is ignored.
    registerCodeHighlighter('js', () => [[{ text: 'other' }]]);
    expect(highlightCode('const a', 'js', true)![0]![0]).toEqual({ text: 'const', token: 'keyword' });
    // A catch-all one takes every language.
    registerCodeHighlighter('js', null);
    registerCodeHighlighter('*', (code) => code.split('\n').map((line) => [{ text: line, token: 'string' as const }]));
    expect(highlightCode('x', 'cobol', true)).toEqual([[{ text: 'x', token: 'string' }]]);
  });
});

describe('inline code', () => {
  const md = 'Run `ls -l` now.';

  it('stays in the body face unless codeStyle.inline is set', () => {
    const doc = buildDocument({ markdown: md }, config());
    const p = doc.blocks.find((b) => b.type === 'paragraph')!;
    expect(p.lines.flatMap((l) => l.segments ?? []).some((s) => s.chip)).toBe(false);
    expect(p.lines[0]!.text).toBe('Run ls -l now.');
  });

  it('is set as a chip in the code face with codeStyle.inline', () => {
    const doc = buildDocument({ markdown: md }, config({ codeStyle: { inline: { background: hex('#eeeeee'), color: hex('#333333') } } }));
    const p = doc.blocks.find((b) => b.type === 'paragraph')!;
    const chip = p.lines.flatMap((l) => l.segments ?? []).find((s) => s.chip)!;
    expect(chip.text).toBe('ls -l');
    expect(chip.chip!.runs[0]!.fontString).toContain('Source Code Pro');
    expect(chip.chip!.runs[0]!.fontString).toContain('18px');
    expect(chip.chip!.background).toBe('#eeeeee');
    expect(chip.chip!.color).toBe('#333333');
    expect(p.lines[0]!.text).toBe('Run ls -l now.');
    expect(p.lines[0]!.sourceEnd).toBe(md.length);
  });
});

describe('codeStyle: settings', () => {
  const body = resolveBodyTextConfig(undefined);

  it('resolves and strips', () => {
    const r = resolveCodeStyleConfig({ tabSize: 2, overflow: 'clip', tokens: { keyword: { bold: true } }, inline: {} }, body);
    expect(r.tabSize).toBe(2);
    expect(r.overflow).toBe('clip');
    expect(r.tokens.keyword).toMatchObject({ bold: true, color: { hex: '#8b2c8f' } });
    expect(r.inline).toMatchObject({ fontFamily: 'Source Code Pro', fontSize: em(0.9), paddingX: em(0) });
    expect(r.color).toEqual(body.color);
    expect(stripCodeStyleDefaults({ tabSize: 4, overflow: 'wrap', fontFamily: 'Source Code Pro' })).toBeUndefined();
    expect(stripCodeStyleDefaults({ tabSize: 2, tokens: { keyword: { color: hex('#8b2c8f'), bold: true } } })).toEqual({ tabSize: 2, tokens: { keyword: { bold: true } } });
    expect(stripConfigDefaults({ codeStyle: { blocks: true } }).codeStyle).toBeUndefined();
  });

  it('warns of unknown keys and values', () => {
    const w = collectConfigWarnings({ codeStyle: { overflow: 'warp' as never, tabsize: 2, tokens: { keywrd: {} }, inline: { colour: hex('#000000') } } as never });
    expect(w).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'unknownConfigValue', path: 'codeStyle.overflow', suggestion: 'wrap' }),
      expect.objectContaining({ kind: 'unknownConfigKey', path: 'codeStyle.tabsize', suggestion: 'tabSize' }),
      expect.objectContaining({ kind: 'unknownConfigKey', path: 'codeStyle.tokens.keywrd', suggestion: 'keyword' }),
      expect.objectContaining({ kind: 'unknownConfigKey', path: 'codeStyle.inline.colour', suggestion: 'color' }),
    ]));
  });

  it('asks for the code face when the text holds a fence', () => {
    expect(configFontFamilies({}, 'no code')).not.toContain('Source Code Pro');
    expect(configFontFamilies({}, ['# A', '```\nx\n```'])).toContain('Source Code Pro');
    expect(configFontFamilies({ codeStyle: { fontFamily: 'JetBrains Mono' } })).toContain('JetBrains Mono');
    expect(configFontFamilies({ codeStyle: { blocks: false } }, '```\nx\n```')).not.toContain('Source Code Pro');
    expect(collectFontUsage({}, { markdown: '```\nx\n```' }).get('Source Code Pro')).toEqual(expect.arrayContaining([{ weight: 700, style: 'italic' }]));
  });
});

/** A stable signature of a layout: every page's blocks and lines. */
function signature(doc: VDTDocument): string {
  const r = (n: number) => Math.round(n * 100) / 100;
  return JSON.stringify(doc.pages.map((p) => p.columns.map((c) => c.blocks.map((b) => [b.type, r(b.bbox.x), r(b.bbox.y), r(b.bbox.height), b.lines.map((l) => [l.text, r(l.bbox.x), r(l.baseline)])]))));
}
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

describe('stored documents (CONFIG_VERSION 9)', () => {
  // A chapter written before #624: fences read as Markdown then.
  const LEGACY = [
    '# Shell', '',
    'Some text before a listing,', '```bash', '# a comment that was a heading', 'echo "hi" && ls -l', '- a list item', '```', 'and text after it.', '',
    '~~~', '1. numbered', '`inline` code', '~~~', '',
    'The end.',
  ].join('\n');

  it('pins the 1.22 reading of fences for a configuration with fences in its text', () => {
    expect(CONFIG_VERSION).toBe(11);
    expect(pinLegacyCodeBlocks({} as PostextConfig)).toEqual({ codeStyle: { blocks: false } });
    const own = { codeStyle: { blocks: true } };
    expect(pinLegacyCodeBlocks(own)).toBe(own);
    expect(migrateConfig({} as PostextConfig, 8, { content: LEGACY }).codeStyle).toEqual({ blocks: false });
    expect(migrateConfig({} as PostextConfig, 8, { content: 'no fences here' }).codeStyle).toBeUndefined();
    expect(migrateConfig({} as PostextConfig, 8).codeStyle).toEqual({ blocks: false });
    expect(migrateConfig({} as PostextConfig, 9, { content: LEGACY }).codeStyle).toBeUndefined();
    expect(migrateBundleConfig({}, [{}], 8, { content: [LEGACY] }).codeStyle).toEqual({ blocks: false });
  });

  it('lays a pinned document out exactly as postext 1.22 did', () => {
    const doc = buildDocument({ markdown: LEGACY }, config({ codeStyle: { blocks: false } }));
    expect(codeBlocks(doc)).toEqual([]);
    // The hash of the same layout built by the engine before #624
    // (c784c63b, with the same stub font).
    expect(fnv(signature(doc))).toBe(LEGACY_HASH);
    // Unpinned, the fences are code blocks: another layout.
    const today = buildDocument({ markdown: LEGACY }, config());
    expect(codeBlocks(today).length).toBe(2);
    expect(fnv(signature(today))).not.toBe(LEGACY_HASH);
  });
});

/** See 'lays a pinned document out exactly as postext 1.22 did'. */
const LEGACY_HASH = 'c50e5ec7';
