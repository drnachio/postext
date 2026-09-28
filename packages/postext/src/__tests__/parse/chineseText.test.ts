import { describe, it, expect } from 'vitest';
import { mapInlineSnippet, parseInlineSnippetSpans, parseMarkdown } from '../../parse';
import type { ContentBlock, InlineSpan } from '../../parse';
import { parseInlineFormatting, stripInlineFormatting } from '../../parse/inlineFormatting';
import { invalidAttributeKeys, parseAttrBlobStrict, parseDirectiveAttrs } from '../../parse/attrs';
import { collectContentWarnings } from '../../pipeline/contentWarnings';
import { chapterFileName, slugify } from '../../bundle/manifest';
import { createBundle, openBundle } from '../../bundle';

// Parser fixes for Chinese text (#181), with passages of 红楼梦.

const text = (spans: readonly InlineSpan[]) => spans.map((s) => s.text).join('');
const bold = (spans: readonly InlineSpan[]) => spans.filter((s) => s.bold).map((s) => s.text);
const italic = (spans: readonly InlineSpan[]) => spans.filter((s) => s.italic).map((s) => s.text);
const scripts = (spans: readonly InlineSpan[]) => spans.filter((s) => s.script).map((s) => `${s.script}:${s.text}`);

/** Every plain character maps to the same character in the source. */
const expectAligned = (md: string, block: ContentBlock): void => {
  expect(block.sourceMap).toHaveLength(block.text.length);
  for (let i = 0; i < block.text.length; i++) expect(md[block.sourceMap[i]!]).toBe(block.text[i]);
};

describe('a line end between Chinese characters sets no space', () => {
  it('joins the lines of a paragraph without a space', () => {
    const md = '满纸荒唐言，\n一把辛酸泪。';
    const [p] = parseMarkdown(md);
    expect(p!.text).toBe('满纸荒唐言，一把辛酸泪。');
    expectAligned(md, p!);
    // A click on 一 lands on the second source line.
    expect(p!.sourceMap[p!.text.indexOf('一')]).toBe(md.indexOf('一'));
  });

  it('joins the opening of chapter 1 set over several lines', () => {
    const md = '此開卷第一回也。作者自云：因曾歷過一番夢幻之後，\n故將真事隱去，而借「通靈」之說，\n撰此《石頭記》一書也。';
    const [p] = parseMarkdown(md);
    expect(p!.text).toBe('此開卷第一回也。作者自云：因曾歷過一番夢幻之後，故將真事隱去，而借「通靈」之說，撰此《石頭記》一書也。');
    expectAligned(md, p!);
  });

  it('joins blockquote lines the same way', () => {
    const md = '> 都云作者痴，\n> 谁解其中味？';
    const [q] = parseMarkdown(md);
    expect(q!.type).toBe('blockquote');
    expect(q!.text).toBe('都云作者痴，谁解其中味？');
    expectAligned(md, q!);
  });

  it('keeps the space when either side is not East Asian', () => {
    expect(parseMarkdown('Hello\n世界')[0]!.text).toBe('Hello 世界');
    expect(parseMarkdown('中文\nEnglish')[0]!.text).toBe('中文 English');
    expect(parseMarkdown('The Story\nof the Stone')[0]!.text).toBe('The Story of the Stone');
  });

  it('keeps the space in Korean', () => {
    expect(parseMarkdown('안녕하세요\n세계')[0]!.text).toBe('안녕하세요 세계');
    expect(parseMarkdown('中文\n한국어')[0]!.text).toBe('中文 한국어');
  });

  it('looks through markup at the line ends', () => {
    const md = '宝玉道：**好**\n*妙*极了。';
    const [p] = parseMarkdown(md);
    expect(p!.text).toBe('宝玉道：好妙极了。');
    expect(bold(p!.spans)).toEqual(['好']);
    expect(italic(p!.spans)).toEqual(['妙']);
    expectAligned(md, p!);
  });

  it('removes it beside curly quotes and ellipses that close or open a line', () => {
    expect(parseMarkdown('士隐笑道：“你既不识，\n我便说与你听。”\n说毕走了。')[0]!.text)
      .toBe('士隐笑道：“你既不识，我便说与你听。”说毕走了。');
    expect(parseMarkdown('言毕……\n遂去')[0]!.text).toBe('言毕……遂去');
  });

  it('removes it between two ambiguous marks inside Chinese text', () => {
    // CSS Text 3 §4.1.3, second rule: in Chinese both sides may be
    // ambiguous-width marks; the characters past them tell the script.
    expect(parseMarkdown('他说……\n“好”')[0]!.text).toBe('他说……“好”');
    expect(parseMarkdown('“你好”\n“再见”')[0]!.text).toBe('“你好”“再见”');
    expect(parseMarkdown('他说：“你好”\n——然后走了。')[0]!.text).toBe('他说：“你好”——然后走了。');
    expect(parseMarkdown('言毕⸺\n遂去')[0]!.text).toBe('言毕⸺遂去');
    const md = '士隐道：“善哉！”\n“去罢。”';
    const [p] = parseMarkdown(md);
    expect(p!.text).toBe('士隐道：“善哉！”“去罢。”');
    expectAligned(md, p!);
    expect(text(parseInlineSnippetSpans('“你好”\n“再见”'))).toBe('“你好”“再见”');
  });

  it('keeps it between two ambiguous marks in Latin or Korean text', () => {
    expect(parseMarkdown('He said “hello”\n“bye”')[0]!.text).toBe('He said “hello” “bye”');
    expect(parseMarkdown('“Wait…”\n“No.”')[0]!.text).toBe('“Wait…” “No.”');
    expect(parseMarkdown('“안녕”\n“잘 가”')[0]!.text).toBe('“안녕” “잘 가”');
    expect(parseMarkdown('——\n——')[0]!.text).toBe('—— ——');
  });

  it('removes it beside a zero-width space', () => {
    expect(parseMarkdown('long​\nword')[0]!.text).toBe('long​word');
  });

  it('joins across a footnote marker that ends the line', () => {
    const md = '士隐道：“善哉！”[^1]\n遂别去。\n\n[^1]: 甲戌侧批。';
    const [p] = parseMarkdown(md);
    expect(p!.text).toBe('士隐道：“善哉！”\uE1A6遂别去。');
  });

  it('keeps link ranges over many joined lines', () => {
    const line = '[宝玉](https://a.example)道：好[黛玉](https://b.example)笑。';
    const md = Array.from({ length: 40 }, () => line).join('\n');
    const [p] = parseMarkdown(md);
    expect(p!.text).toBe('宝玉道：好黛玉笑。'.repeat(40));
    const links = p!.spans.flatMap((s) => (s.links ?? []).map((l) => s.text.slice(l.start, l.end)));
    expect(links).toEqual(Array.from({ length: 40 }, () => ['宝玉', '黛玉']).flat());
    // One link over several joined lines.
    const [q] = parseMarkdown('见[满纸荒唐言，\n一把辛酸泪。\n都云作者痴](https://c.example)。');
    expect(q!.text).toBe('见满纸荒唐言，一把辛酸泪。都云作者痴。');
    const span = q!.spans.find((s) => s.links)!;
    expect(span.links!.map((l) => span.text.slice(l.start, l.end))).toEqual(['满纸荒唐言，一把辛酸泪。都云作者痴']);
  });

  it('keeps a space typed inside a line', () => {
    expect(parseMarkdown('甄士隐 贾雨村')[0]!.text).toBe('甄士隐 贾雨村');
  });

  it('joins the lines of a caption or a table cell', () => {
    const spans = parseInlineSnippetSpans('荣国府\n  平面图');
    expect(text(spans)).toBe('荣国府平面图');
    expect(text(parseInlineSnippetSpans('Plan of the\nmansion'))).toBe('Plan of the\nmansion');
    // A blank line inside a cell is left alone.
    expect(text(parseInlineSnippetSpans('荣国府\n\n平面图'))).toBe('荣国府\n\n平面图');
    const mapped = mapInlineSnippet('**荣国府**\n平面图');
    expect(mapped.text).toBe('荣国府平面图');
    expect(mapped.sourceMap[3]).toBe('**荣国府**\n'.length);
  });
});

describe('underscore emphasis beside Han characters', () => {
  it('reads __bold__ and _italic_ between Han characters', () => {
    const b = parseInlineFormatting('中文__粗体__中文');
    expect(text(b)).toBe('中文粗体中文');
    expect(bold(b)).toEqual(['粗体']);
    expect(italic(b)).toEqual([]);
    const i = parseInlineFormatting('中文_斜体_中文');
    expect(text(i)).toBe('中文斜体中文');
    expect(italic(i)).toEqual(['斜体']);
    expect(italic(parseInlineFormatting('日本語_テスト_です'))).toEqual(['テスト']);
    expect(bold(parseInlineFormatting('한국어__굵게__입니다'))).toEqual(['굵게']);
  });

  it('never turns a __ that is not bold into a single-underscore italic', () => {
    const spans = parseInlineFormatting('foo__bar__baz');
    expect(text(spans)).toBe('foo__bar__baz');
    expect(italic(spans)).toEqual([]);
    expect(bold(spans)).toEqual([]);
    expect(stripInlineFormatting('foo__bar__baz')).toBe('foo__bar__baz');
    expect(text(parseInlineFormatting('a __init__ method'))).toBe('a init method');
  });

  it('keeps ** as it was: CJK punctuation beside it does not matter', () => {
    expect(bold(parseInlineFormatting('他说**「强调」**是这样。'))).toEqual(['「强调」']);
    expect(bold(parseInlineFormatting('这是**强调**，然后'))).toEqual(['强调']);
    expect(bold(parseInlineFormatting('他说：“**好**！”'))).toEqual(['好']);
    expect(bold(parseInlineFormatting('**好**、**坏**'))).toEqual(['好', '坏']);
  });
});

describe('a tilde between digits is a range', () => {
  it('leaves 3~5 and 10~20 as text', () => {
    const spans = parseInlineFormatting('需要3~5天，年龄10~20岁。');
    expect(text(spans)).toBe('需要3~5天，年龄10~20岁。');
    expect(scripts(spans)).toEqual([]);
    expect(scripts(parseInlineFormatting('3~5 days, ages 10~20'))).toEqual([]);
    expect(stripInlineFormatting('3~5天，10~20岁')).toBe('3~5天，10~20岁');
  });

  it('leaves a tilde between Han words as text', () => {
    const spans = parseInlineFormatting('周一~周五，周六~周日休息。');
    expect(text(spans)).toBe('周一~周五，周六~周日休息。');
    expect(scripts(spans)).toEqual([]);
    expect(scripts(parseInlineFormatting('北京~上海~广州'))).toEqual([]);
    expect(scripts(parseInlineFormatting('好的~谢谢~'))).toEqual([]);
    expect(stripInlineFormatting('周一~周五，周六~周日')).toBe('周一~周五，周六~周日');
    // A Han subscript still closes before a Han character: F合, P额.
    expect(scripts(parseInlineFormatting('合力F~合~等于ma，P~额~=U~额~I~额~'))).toEqual(['sub:合', 'sub:额', 'sub:额', 'sub:额']);
  });

  it('keeps chemical subscripts', () => {
    expect(scripts(parseInlineFormatting('H~2~O'))).toEqual(['sub:2']);
    expect(scripts(parseInlineFormatting('C~6~H~12~O~6~'))).toEqual(['sub:6', 'sub:12', 'sub:6']);
    expect(scripts(parseInlineFormatting('T~0~ and 3~5 days'))).toEqual(['sub:0']);
  });

  it('leaves the faces ^_^ and ^o^ as text, not n.^o^ or 1^er^', () => {
    const spans = parseInlineFormatting('开心^_^哈哈^o^好');
    expect(text(spans)).toBe('开心^_^哈哈^o^好');
    expect(scripts(spans)).toEqual([]);
    expect(stripInlineFormatting('开心^_^哈哈')).toBe('开心^_^哈哈');
    expect(scripts(parseInlineFormatting('el n.^o^ 5 y el 1^er^ piso'))).toEqual(['sup:o', 'sup:er']);
  });

  it('leaves two faces on one line as text', () => {
    for (const line of ['好的^_^，谢谢^_^', 'ok ^_^ and ^_^ fine', '他笑道：“好^_^。”她也笑^o^^_^']) {
      const spans = parseInlineFormatting(line);
      expect(text(spans)).toBe(line);
      expect(italic(spans)).toEqual([]);
      expect(scripts(spans)).toEqual([]);
      expect(stripInlineFormatting(line)).toBe(line);
      expect(text(parseInlineSnippetSpans(line))).toBe(line);
    }
    const [h] = parseMarkdown('# 标题^_^与^_^');
    expect(h!.text).toBe('标题^_^与^_^');
    expect(italic(h!.spans)).toEqual([]);
    // Emphasis around a face still works.
    const spans = parseInlineFormatting('_好_^_^，**谢谢**^_^');
    expect(italic(spans)).toEqual(['好']);
    expect(bold(spans)).toEqual(['谢谢']);
    expect(text(spans)).toBe('好^_^，谢谢^_^');
  });
});

describe('heading attributes after a Chinese title', () => {
  it('takes a block glued to the title', () => {
    const md = '# 回目{style="x"}';
    const [h] = parseMarkdown(md);
    expect(h!.text).toBe('回目');
    expect(h!.attrs).toEqual({ style: 'x' });
    expect(md.slice(h!.attrSources!.style!.start, h!.attrSources!.style!.end)).toBe('x');
    expect(parseMarkdown('# 回目　{style="x"}')[0]!.attrs).toEqual({ style: 'x' });
  });

  it('keeps braces that the attribute grammar does not read whole', () => {
    for (const md of ['# Title {x, y}', '# 第一回{draft}', '# 石头记{風月寶鑑}']) {
      const [h] = parseMarkdown(md);
      expect(h!.attrs).toBeUndefined();
      expect(h!.text).toBe(md.slice(2));
      expectAligned(md, h!);
    }
    // A compact ruby at the end of a title is the title's (#194).
    const md = '# 红楼梦 {紅樓|hóng lóu}';
    const [h] = parseMarkdown(md);
    expect(h!.attrs).toBeUndefined();
    expect(h!.text).toBe('红楼梦 紅樓');
    expect(h!.spans.filter((s) => s.ruby).map((s) => s.ruby!.text)).toEqual(['hóng', 'lóu']);
    expectAligned(md, h!);
    // A flag after a space is read, as before.
    expect(parseMarkdown('# Title {draft}')[0]!.attrs).toEqual({ draft: '' });
  });

  it('reads the other keys of a block that holds a key outside ASCII', () => {
    for (const md of ['# 回目{style="x" 作者=曹雪芹}', '# 回目 {style="x" 作者=曹雪芹}', '# 回目{作者＝“曹雪芹” style=「x」}']) {
      const [h] = parseMarkdown(md);
      expect(h!.text).toBe('回目');
      expect(h!.attrs).toEqual({ style: 'x' });
      expect(md.slice(h!.attrSources!.style!.start, h!.attrSources!.style!.end)).toBe('x');
      const found = collectContentWarnings(md).filter((w) => w.kind === 'attributeKeyInvalid');
      expect(found.map((w) => md.slice(w.sourceStart, w.sourceEnd))).toEqual(['作者']);
    }
    // Only such keys: the block is still taken, with no attributes.
    const [h] = parseMarkdown('# 回目{作者=曹雪芹}');
    expect(h!.text).toBe('回目');
    expect(h!.attrs).toBeUndefined();
    // A word in braces is no key: it stays in the title.
    expect(parseMarkdown('# 红楼梦 {風月寶鑑}')[0]!.text).toBe('红楼梦 {風月寶鑑}');
    expect(parseAttrBlobStrict('style="x" 作者=曹雪芹')!.map((t) => [t.key, !!t.invalidKey])).toEqual([['style', false], ['作者', true]]);
    expect(parseAttrBlobStrict('風月寶鑑')).toBeUndefined();
  });

  it('reads values in curly and corner quotes, and a fullwidth equals sign', () => {
    const md = '# 第一回{subtitle=“甄士隐梦幻识通灵” lead「贾雨村」 note＝「脂批」}';
    const [h] = parseMarkdown(md);
    // `lead「贾雨村」` has no `=`: the grammar does not read it, so the
    // braces stay.
    expect(h!.attrs).toBeUndefined();
    const md2 = '# 第一回{subtitle=“甄士隐梦幻识通灵” note＝「脂批」}';
    const [h2] = parseMarkdown(md2);
    expect(h2!.text).toBe('第一回');
    expect(h2!.attrs).toEqual({ subtitle: '甄士隐梦幻识通灵', note: '脂批' });
    expect(md2.slice(h2!.attrSources!.subtitle!.start, h2!.attrSources!.subtitle!.end)).toBe('甄士隐梦幻识通灵');
  });
});

describe('attribute values typed with a Chinese input method', () => {
  it('reads “…”, 「…」 and ＝', () => {
    expect(parseDirectiveAttrs('title=“甲戌本 眉批”')).toEqual({ title: '甲戌本 眉批' });
    expect(parseDirectiveAttrs('title＝"脂批"')).toEqual({ title: '脂批' });
    expect(parseDirectiveAttrs('title=「庚辰本 夹批」 type="note"')).toEqual({ title: '庚辰本 夹批', type: 'note' });
    // Typographic quotes inside an ASCII-quoted value stay text.
    expect(parseDirectiveAttrs('lead="He said “hi”"')).toEqual({ lead: 'He said “hi”' });
    const [c] = parseMarkdown(':::callout{type="note" title=“甲戌本 眉批”}\n正文\n:::');
    expect(c!.containerAttrs).toEqual({ type: 'note', title: '甲戌本 眉批' });
  });

  it('reads a blob whole or not at all', () => {
    expect(parseAttrBlobStrict('style="x" toc="false"')!.map((t) => t.key)).toEqual(['style', 'toc']);
    expect(parseAttrBlobStrict('a="1"b="2"')!.map((t) => t.key)).toEqual(['a', 'b']);
    expect(parseAttrBlobStrict('x, y')).toBeUndefined();
    expect(parseAttrBlobStrict('紅樓|hóng lóu')).toBeUndefined();
  });

  it('finds keys written outside ASCII, not an = inside a value', () => {
    expect(invalidAttributeKeys('作者=曹雪芹 year=1791').map((k) => k.key)).toEqual(['作者']);
    expect(invalidAttributeKeys('title="甲=乙" 版本＝程乙本').map((k) => k.key)).toEqual(['版本']);
    expect(invalidAttributeKeys('style="x"')).toEqual([]);
  });
});

describe('content warnings for Chinese markup', () => {
  const kinds = (md: string, kind: string) => collectContentWarnings(md).filter((w) => w.kind === kind);

  it('reports an attribute key outside ASCII, pointing at the key', () => {
    const md = ':::callout{作者=曹雪芹}\n正文\n:::\n\n# 第一回 {版本=程乙本}\n\n见:ref{id="图一" 标签="x"}';
    const found = kinds(md, 'attributeKeyInvalid');
    expect(found.map((w) => (w as { key: string }).key)).toEqual(['作者', '版本', '标签']);
    for (const w of found) expect(md.slice(w.sourceStart, w.sourceEnd)).toBe((w as { key: string }).key);
  });

  it('reports markup typed in fullwidth characters, once per line', () => {
    const md = [
      '：：：callout{type="note"}',
      '正文，见［＾一］。',
      '：：：',
      '',
      '＃ 第一回',
      '',
      '# 第二回｛style="x"｝',
      '',
      '这是＊＊强调＊＊和＊＊另一个＊＊。',
      '',
      '见[^1]与［＾2］。',
    ].join('\n');
    const found = kinds(md, 'fullwidthMarkup') as { typed: string; ascii: string; sourceStart?: number; sourceEnd?: number }[];
    expect(found.map((w) => [w.typed, w.ascii])).toEqual([
      ['：：：', ':::'],
      ['［＾一］', '[^…]'],
      ['：：：', ':::'],
      ['＃', '#'],
      ['｛style="x"｝', '{…}'],
      ['＊＊强调＊＊', '**…**'],
      ['［＾2］', '[^…]'],
    ]);
    for (const w of found) expect(md.slice(w.sourceStart, w.sourceEnd)).toBe(w.typed);
  });

  it('leaves ASCII markup and Chinese prose alone', () => {
    const md = ':::callout{type="note"}\n士隐笑道：“你既不识。”\n:::\n\n# 第一回\n\n见[^1]。\n\n[^1]: 注。';
    expect(kinds(md, 'fullwidthMarkup')).toEqual([]);
    expect(kinds(md, 'attributeKeyInvalid')).toEqual([]);
  });
});

describe('slugs keep the letters of every script', () => {
  it('slugifies Chinese titles', () => {
    expect(slugify('第一回 甄士隐梦幻识通灵')).toBe('第一回-甄士隐梦幻识通灵');
    expect(slugify('红楼梦')).toBe('红楼梦');
    expect(slugify('紅樓夢（程乙本）')).toBe('紅樓夢-程乙本');
    expect(slugify('Crème Brûlée')).toBe('creme-brulee');
    expect(slugify('Chapter 1: The Stone')).toBe('chapter-1-the-stone');
    expect(slugify('ｆｕｌｌ　１２')).toBe('full-12');
    expect(chapterFileName(0, '第一回', new Set(), 120)).toBe('chapters/001-第一回.md');
  });

  it('keeps a Chinese chapter file name through a bundle round trip, flagged UTF-8', async () => {
    const created = await createBundle({
      name: '红楼梦',
      chapters: [{ title: '第一回', markdown: '# 第一回\n\n此開卷第一回也。' }],
      config: {},
      resources: [],
    });
    expect(created.manifest.id).toBe('红楼梦');
    const zip = created.bytes;
    // Every entry whose name is not ASCII carries the UTF-8 flag (bit 11).
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const names: string[] = [];
    for (let i = 0; i + 30 < zip.length; i++) {
      if (view.getUint32(i, true) !== 0x04034b50) continue;
      const flags = view.getUint16(i + 6, true);
      const len = view.getUint16(i + 26, true);
      const name = new TextDecoder().decode(zip.subarray(i + 30, i + 30 + len));
      names.push(name);
      if (/[^\x00-\x7F]/.test(name)) expect(flags & 0x800).toBe(0x800);
    }
    expect(names).toContain('chapters/01-第一回.md');
    const opened = await openBundle(zip);
    expect(opened.chapters.map((c) => c.title)).toEqual(['第一回']);
    expect(opened.chapters[0]!.markdown).toContain('此開卷第一回也。');
  });
});
