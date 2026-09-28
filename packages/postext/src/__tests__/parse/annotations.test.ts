import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../parse';
import type { ContentBlock, InlineSpan } from '../../parse';
import { parseInlineFormatting, plainSpans, stripInlineFormatting } from '../../parse/inlineFormatting';

// Chinese inline annotations (#193 emphasis dots and marks, #194 ruby, #195
// warichu), with passages of 红楼梦.

const text = (spans: readonly InlineSpan[]) => spans.map((s) => s.text).join('');

/** Every plain character maps to the same character in the source. */
const expectAligned = (md: string, block: ContentBlock): void => {
  expect(block.sourceMap).toHaveLength(block.text.length);
  for (let i = 0; i < block.text.length; i++) expect(md[block.sourceMap[i]!]).toBe(block.text[i]);
};

describe(':dots, :name and :book keep their text', () => {
  it(':dots[…] marks the characters, with its attributes', () => {
    const spans = parseInlineFormatting('此事:dots[不可]輕忽');
    expect(text(spans)).toBe('此事不可輕忽');
    const dotted = spans.filter((s) => s.emphasisMark);
    expect(text(dotted)).toBe('不可');
    expect(dotted[0]!.emphasisMark).toEqual({});
    const styled = parseInlineFormatting(':dots[不可]{style="sesame" fill=open pos="over"}');
    expect(styled[0]!.emphasisMark).toEqual({ style: 'sesame', fill: 'open', position: 'over' });
    expect(text(styled)).toBe('不可');
  });

  it(':name and :book get a run id each, so adjacent marks stay apart', () => {
    const spans = parseInlineFormatting(':name[賈寶玉]:name[林黛玉]讀:book[石頭記]');
    expect(text(spans)).toBe('賈寶玉林黛玉讀石頭記');
    const a = spans.find((s) => s.text === '賈寶玉')!;
    const b = spans.find((s) => s.text === '林黛玉')!;
    expect(a.properName).toBeDefined();
    expect(b.properName).toBeDefined();
    expect(a.properName).not.toBe(b.properName);
    expect(spans.find((s) => s.text === '石頭記')!.bookTitle).toEqual({ id: expect.any(Number), depth: 1 });
    expect(spans.find((s) => s.text === '讀')!.properName).toBeUndefined();
  });

  it('nests: a title inside a title is one level deeper, a name inside dots keeps both', () => {
    const spans = parseInlineFormatting(':book[脂硯齋重評:book[石頭記]]');
    expect(text(spans)).toBe('脂硯齋重評石頭記');
    expect(spans[0]!.bookTitle!.depth).toBe(1);
    expect(spans[1]!.bookTitle!.depth).toBe(2);
    const both = parseInlineFormatting(':dots[那:name[寶玉]]');
    const name = both.find((s) => s.text === '寶玉')!;
    expect(name.emphasisMark).toBeDefined();
    expect(name.properName).toBeDefined();
  });

  it('works across emphasis and keeps bold inside', () => {
    const spans = parseInlineFormatting('**:name[賈政]**與:name[**王夫人**]');
    expect(text(spans)).toBe('賈政與王夫人');
    expect(spans.find((s) => s.text === '賈政')).toMatchObject({ bold: true, properName: expect.any(Number) });
    expect(spans.find((s) => s.text === '王夫人')).toMatchObject({ bold: true, properName: expect.any(Number) });
  });

  it('an unclosed bracket stays text', () => {
    expect(text(parseInlineFormatting('見:name[賈寶玉'))).toBe('見:name[賈寶玉');
  });

  it('strips to the text for running heads and index terms', () => {
    expect(stripInlineFormatting(':name[賈寶玉]讀:book[石頭記]')).toBe('賈寶玉讀石頭記');
    expect(stripInlineFormatting('{紅樓|hóng|lóu}夢')).toBe('紅樓夢');
    expect(stripInlineFormatting('寶玉:warichu[甲戌側批：此是第一首標題詩。]{open="〔" close="〕"}道')).toBe('寶玉甲戌側批：此是第一首標題詩。道');
  });

  it('plainSpans drops the marks and keeps ruby and warichu spans', () => {
    const plain = plainSpans(parseInlineFormatting(':name[賈寶玉]{紅|hóng}樓'));
    expect(plain.some((s) => s.properName !== undefined)).toBe(false);
    expect(plain.some((s) => s.ruby)).toBe(true);
    expect(text(plain)).toBe('賈寶玉紅樓');
  });
});

describe(':ruby and the compact form', () => {
  it('mono ruby: one span per character, each with its reading', () => {
    const spans = parseInlineFormatting(':ruby[紅樓]{rt="hóng lóu"}夢');
    expect(text(spans)).toBe('紅樓夢');
    expect(spans[0]).toMatchObject({ text: '紅', ruby: { text: 'hóng' } });
    expect(spans[1]).toMatchObject({ text: '樓', ruby: { text: 'lóu' } });
    expect(spans[0]!.ruby!.id).toBe(spans[1]!.ruby!.id);
    expect(spans[2]!.ruby).toBeUndefined();
  });

  it('group ruby: one span for the base', () => {
    const spans = parseInlineFormatting(':ruby[紅樓]{rt="hónglóu" group}');
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ text: '紅樓', ruby: { text: 'hónglóu', group: true } });
  });

  it('a reading count that does not match the base is a group ruby', () => {
    const spans = parseInlineFormatting(':ruby[紅樓夢]{rt="hóng lóu"}');
    expect(spans).toHaveLength(1);
    expect(spans[0]!.ruby).toMatchObject({ text: 'hóng lóu', group: true });
  });

  it('pos sets the side; zhuyin keeps its tone marks', () => {
    const spans = parseInlineFormatting(':ruby[紅]{rt="ㄏㄨㄥˊ" pos="right"}');
    expect(spans[0]!.ruby).toMatchObject({ text: 'ㄏㄨㄥˊ', position: 'right' });
  });

  it('the compact form gives the same spans', () => {
    const long = parseInlineFormatting(':ruby[紅樓]{rt="hóng lóu"}');
    const compact = parseInlineFormatting('{紅樓|hóng|lóu}');
    expect(compact.map((s) => [s.text, s.ruby?.text])).toEqual(long.map((s) => [s.text, s.ruby?.text]));
    const spaced = parseInlineFormatting('{紅樓|hóng lóu}');
    expect(spaced.map((s) => s.ruby?.text)).toEqual(['hóng', 'lóu']);
    const group = parseInlineFormatting('{紅樓|hónglóu}');
    expect(group).toHaveLength(1);
    expect(group[0]!.ruby).toMatchObject({ text: 'hónglóu', group: true });
  });

  it('a brace group without a CJK base stays text', () => {
    expect(text(parseInlineFormatting('the set {x|x>0} is open'))).toBe('the set {x|x>0} is open');
    expect(parseInlineFormatting('the set {x|x>0} is open').some((s) => s.ruby)).toBe(false);
  });

  it('inline code keeps the compact form as written', () => {
    const [p] = parseMarkdown('寫作 `{紅樓|hóng|lóu}` 即可');
    expect(p!.text).toContain('{紅樓|hóng|lóu}');
    expect(p!.spans.some((s) => s.ruby)).toBe(false);
  });

  it('an emphasis marker inside a reading is data', () => {
    const spans = parseInlineFormatting(':ruby[紅]{rt="*hóng*"}樓*夢*');
    expect(spans[0]!.ruby!.text).toBe('*hóng*');
    expect(spans.find((s) => s.text === '夢')!.italic).toBe(true);
  });
});

describe(':warichu', () => {
  it('keeps the note text in place, all its spans sharing one note', () => {
    const spans = parseInlineFormatting('寶玉:warichu[甲戌側批：**此是**第一首標題詩。]{open="〔" close="〕"}道');
    expect(text(spans)).toBe('寶玉甲戌側批：此是第一首標題詩。道');
    const note = spans.filter((s) => s.warichu);
    expect(text(note)).toBe('甲戌側批：此是第一首標題詩。');
    expect(new Set(note.map((s) => s.warichu))).toHaveProperty('size', 1);
    expect(note[0]!.warichu).toMatchObject({ open: '〔', close: '〕' });
    expect(note.find((s) => s.text === '此是')!.bold).toBe(true);
  });

  it('holds marks and a nested name', () => {
    const spans = parseInlineFormatting(':warichu[:name[寶玉]也]');
    expect(spans[0]).toMatchObject({ text: '寶玉', properName: expect.any(Number), warichu: expect.any(Object) });
  });
});

describe('source mapping skips the annotation markup', () => {
  it('maps every plain character to its source character', () => {
    const md = '此開卷第一回也。:name[甄士隱] 夢幻識 :ruby[通靈]{rt="tōng líng"} 說，撰此:book[石頭記]一書也。';
    const [p] = parseMarkdown(md);
    expect(p!.text).toBe('此開卷第一回也。甄士隱 夢幻識 通靈 說，撰此石頭記一書也。');
    expectAligned(md, p!);
    // The space after the ruby maps to the space after its attributes,
    // not to the one inside the reading.
    const space = p!.text.indexOf(' 說');
    expect(p!.sourceMap[space]).toBe(md.indexOf(' 說'));
  });

  it('maps a compact ruby and a warichu note', () => {
    const md = '{紅樓|hóng|lóu}夢 lo :warichu[甲戌側批]{open="〔"} end';
    const [p] = parseMarkdown(md);
    expect(p!.text).toBe('紅樓夢 lo 甲戌側批 end');
    expectAligned(md, p!);
    expect(p!.sourceMap[p!.text.indexOf('lo')]).toBe(md.indexOf(' lo') + 1);
  });

  it('keeps the marks through a :ref inside the run', () => {
    const md = ':warichu[見:ref{id="fig"}圖]';
    const [p] = parseMarkdown(md);
    expect(p!.spans.every((s) => s.warichu)).toBe(true);
    expect(p!.spans.some((s) => s.ref && s.warichu)).toBe(true);
  });
});
