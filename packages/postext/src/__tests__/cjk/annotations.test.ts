import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../index';
import type { PostextConfig } from '../../types';
import type { VDTBlock, VDTDocument, VDTLine, VDTLineSegment } from '../../vdt';
import { installSizedStub } from '../vertical/stub';
import { createMeasurementCache } from '../../measure';

// Emphasis dots and the proper-name and book-title marks (#193), ruby
// (#194) and warichu notes (#195), laid out with passages of 红楼梦. The stub
// measures CJK characters 1 em, Latin letters ½ em, a space ¼ em, at the
// size the font names.
installSizedStub();

const pt = (value: number) => ({ value, unit: 'pt' as const });
/** 72 dpi, 20 px text on a 30 px line (a gap of half an em), a measure of
 *  `chars` characters. */
const config = (cjk: PostextConfig['cjk'] = {}, extra: Partial<PostextConfig> = {}, chars = 20): PostextConfig => ({
  locale: 'zh-Hans',
  page: { width: pt(chars * 20 + 40), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(20), lineHeight: pt(30), textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  cjk,
  ...extra,
});

const paragraphs = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'paragraph');
const lines = (doc: VDTDocument): VDTLine[] => paragraphs(doc).flatMap((b) => b.lines);
const segments = (doc: VDTDocument): VDTLineSegment[] => lines(doc).flatMap((l) => l.segments ?? []);
/** Where a segment starts on its line (from the line's start). */
function segmentX(line: VDTLine, seg: VDTLineSegment): number {
  let x = 0;
  for (const s of line.segments!) {
    if (s === seg) return x;
    x += s.width;
  }
  throw new Error('not on the line');
}

describe('emphasis dots (:dots)', () => {
  it('sets one dot under each character, none under the comma after them', () => {
    const doc = buildDocument({ markdown: '此事:dots[不可]，輕忽。' }, config());
    const line = lines(doc)[0]!;
    const dots = line.marks!.filter((m) => m.kind === 'dot');
    expect(dots).toHaveLength(2);
    // 此事 are 40 px: the dots are centred on 不 (40–60) and 可 (60–80).
    expect(dots.map((d) => d.x)).toEqual([50, 70]);
    // Under the em box (0.12 em under the baseline), in the line gap.
    for (const d of dots) {
      expect(d.y).toBeGreaterThan(0.12 * 20);
      expect(d.y + d.size! / 2).toBeLessThan(10 + 0.12 * 20 + 1e-9);
    }
    expect(line.segments!.find((s) => s.text === '不可')!.cjkMarks).toEqual({ dots: { style: 'dot', fill: 'filled', position: 'under' } });
  });

  it('sets them right of the text in vertical text (the over side)', () => {
    const doc = buildDocument({ markdown: '此事:dots[不可]輕忽。' }, config({}, { layout: { layoutType: 'single', writingMode: 'vertical-rl' } }));
    const dots = lines(doc)[0]!.marks!;
    expect(dots).toHaveLength(2);
    for (const d of dots) expect(d.y).toBeLessThan(-0.88 * 20);
  });

  it('style, fill and side follow the attributes', () => {
    const doc = buildDocument({ markdown: ':dots[不可]{style="circle"}:dots[忘]{style="sesame" pos="over"}' }, config());
    const marks = lines(doc)[0]!.marks!;
    expect(marks.map((m) => [m.kind, m.open ?? false])).toEqual([['circle', true], ['circle', true], ['sesame', false]]);
    expect(marks[2]!.y).toBeLessThan(0);
  });

  it('stay centred on their characters when the line is spread', () => {
    // 21 characters in 20: the first line is justified with tracking.
    const doc = buildDocument({ markdown: ':dots[因曾歷過一番夢幻之後故將真事隱去而借通]靈之說' }, config());
    const line = lines(doc)[0]!;
    const seg = line.segments!.find((s) => s.cjkMarks)!;
    const t = seg.tracking ?? 0;
    const cell = seg.width / [...seg.text].length;
    line.marks!.forEach((d, i) => expect(d.x).toBeCloseTo(segmentX(line, seg) + i * cell + (cell - t) / 2, 6));
  });

  it('*…* sets dots on Chinese characters and keeps Latin italic under cjk.emphasis: dots', () => {
    const doc = buildDocument({ markdown: '這是*强调*與 *emphasis* 之別' }, config());
    const segs = segments(doc);
    expect(segs.find((s) => s.text === '强调')).toMatchObject({ cjkMarks: { dots: { style: 'dot' } } });
    expect(segs.find((s) => s.text === '强调')!.italic).toBeFalsy();
    expect(segs.find((s) => s.text === 'emphasis')!.italic).toBe(true);
    expect(lines(doc)[0]!.marks!).toHaveLength(2);
    // Italic when asked, and in a document that is not Chinese.
    const italic = buildDocument({ markdown: '這是*强调*' }, config({ emphasis: 'italic' }));
    expect(segments(italic).find((s) => s.text === '强调')!.italic).toBe(true);
    expect(lines(italic)[0]!.marks).toBeUndefined();
    const en = buildDocument({ markdown: 'The word *强调* means stress.' }, config({}, { locale: 'en' }));
    expect(lines(en).some((l) => l.marks)).toBe(false);
  });
});

describe('proper-name and book-title marks (:name, :book)', () => {
  it('two names side by side get two lines a quarter em apart', () => {
    const doc = buildDocument({ markdown: ':name[賈寶玉]:name[林黛玉]二人' }, config());
    const [a, b] = lines(doc)[0]!.marks!.filter((m) => m.kind === 'line');
    expect(a!.x).toBe(0);
    expect(a!.x + a!.length!).toBeCloseTo(60 - 20 / 8, 9);
    expect(b!.x).toBeCloseTo(60 + 20 / 8, 9);
    expect(b!.x - (a!.x + a!.length!)).toBeCloseTo(20 / 4, 9);
    expect(a!.y).toBeGreaterThan(0.12 * 20);
  });

  it('a name inside a Latin paragraph is marked too', () => {
    const doc = buildDocument({ markdown: 'The hero :name[賈寶玉] meets his cousin in the garden.' }, config({}, { locale: 'en' }));
    const marks = lines(doc).flatMap((l) => l.marks ?? []);
    expect(marks).toHaveLength(1);
    expect(marks[0]!.length).toBeCloseTo(60, 9);
  });

  it(':book prints 《》 on the mainland, the wavy line in Taiwan, nothing under none', () => {
    const md = '撰此:book[石頭記]一書也。';
    const hans = buildDocument({ markdown: md }, config());
    expect(lines(hans)[0]!.text).toBe('撰此《石頭記》一書也。');
    expect(lines(hans)[0]!.marks).toBeUndefined();
    // The brackets are no plain text: the line maps to the source as written.
    expect(paragraphs(hans)[0]!.lines[0]!.plainEnd).toBe('撰此石頭記一書也。'.length);
    const tw = buildDocument({ markdown: md }, config({}, { locale: 'zh-Hant-TW' }));
    expect(lines(tw)[0]!.text).toBe('撰此石頭記一書也。');
    const wavy = lines(tw)[0]!.marks!;
    expect(wavy).toHaveLength(1);
    expect(wavy[0]).toMatchObject({ kind: 'wavy', x: 40, length: 60 });
    const none = buildDocument({ markdown: md }, config({ bookTitleMark: 'none' }));
    expect(lines(none)[0]!.text).toBe('撰此石頭記一書也。');
    expect(lines(none)[0]!.marks).toBeUndefined();
  });

  it('a title inside a title takes 〈〉', () => {
    const doc = buildDocument({ markdown: '讀:book[脂硯齋重評:book[石頭記]]' }, config());
    expect(lines(doc)[0]!.text).toBe('讀《脂硯齋重評〈石頭記〉》');
  });

  it('annotationColor paints the marks', () => {
    const doc = buildDocument({ markdown: ':name[賈寶玉]' }, config({ annotationColor: { hex: '#c0392b', model: 'hex' } }));
    expect(lines(doc)[0]!.marks![0]!.color).toBe('#c0392b');
  });

  it('marks survive a :ref inside the run', () => {
    const doc = buildDocument({
      markdown: ':name[寶玉見:ref{id="fig" text="圖"}後]',
      resources: [],
    }, config());
    const marked = segments(doc).filter((s) => s.cjkMarks?.properName !== undefined);
    expect(marked.map((s) => s.text).join('')).toContain('寶玉見');
    expect(marked.map((s) => s.text).join('')).toContain('後');
  });

  it('warns when the line gap is narrower than the marks need', () => {
    // 20 px text on 28 px lines: a gap of 0.4 em.
    const tight = buildDocument({ markdown: ':dots[不可]輕忽' }, config({}, { bodyText: { fontSize: pt(20), lineHeight: pt(28), hyphenation: { enabled: false } } }));
    const w = tight.contentWarnings!.find((x) => x.kind === 'cjkMarksExceedLeading');
    expect(w).toMatchObject({ gapEm: 0.4, neededEm: 0.5 });
    const roomy = buildDocument({ markdown: ':dots[不可]輕忽' }, config());
    expect(roomy.contentWarnings?.some((x) => x.kind === 'cjkMarksExceedLeading') ?? false).toBe(false);
  });

  it('a mark toggled on the same text is measured again (cache key)', () => {
    const cache = createMeasurementCache();
    const plain = buildDocument({ markdown: '賈寶玉' }, config(), cache);
    expect(lines(plain)[0]!.marks).toBeUndefined();
    const named = buildDocument({ markdown: ':name[賈寶玉]' }, config(), cache);
    expect(lines(named)[0]!.marks).toHaveLength(1);
    const dotted = buildDocument({ markdown: ':dots[賈寶玉]' }, config(), cache);
    expect(lines(dotted)[0]!.marks!.map((m) => m.kind)).toEqual(['dot', 'dot', 'dot']);
  });
});

describe('ruby (:ruby and {base|reading})', () => {
  const roomy = { bodyText: { fontSize: pt(20), lineHeight: pt(40), textAlign: 'justify' as const, firstLineIndent: pt(0), hyphenation: { enabled: false } } };

  it('the two forms give the same segments; a line may break between the characters', () => {
    const a = segments(buildDocument({ markdown: ':ruby[紅樓]{rt="hóng lóu"}夢' }, config({}, roomy)));
    const b = segments(buildDocument({ markdown: '{紅樓|hóng|lóu}夢' }, config({}, roomy)));
    expect(b).toEqual(a);
    const ruby = a.filter((s) => s.ruby);
    expect(ruby.map((s) => [s.text, s.ruby!.text])).toEqual([['紅', 'hóng'], ['樓', 'lóu']]);
    // A measure of 7 characters: the line breaks between 紅 and 樓.
    const narrow = buildDocument({ markdown: '此開卷第一回{紅樓|hóng|lóu}夢' }, config({}, roomy, 7));
    expect(lines(narrow).map((l) => l.text)).toEqual(['此開卷第一回紅', '樓夢']);
  });

  it('a reading wider than its base spreads the base, and the reading sits over it', () => {
    // zhuāng at 10 px: 6 letters of 5 px = 30 px over a 20 px base; a
    // quarter of the ruby em (2.5 px) may pass each unannotated neighbour.
    const doc = buildDocument({ markdown: '此{莊|zhuāng}也' }, config({}, roomy));
    const line = lines(doc)[0]!;
    const seg = line.segments!.find((s) => s.ruby)!;
    expect(seg.width - (seg.tracking ?? 0)).toBeCloseTo(25, 9);
    expect(seg.inkOffset).toBeCloseTo(2.5, 9);
    const run = seg.ruby!.runs[0]!;
    expect(run.dx).toBeCloseTo(-2.5, 9);
    // Over the em box: its baseline above 0.88 em.
    expect(run.dy).toBeLessThan(-0.88 * 20);
    expect(line.text).toBe('此莊也');
  });

  it('a group ruby never breaks and spreads its base', () => {
    const doc = buildDocument({ markdown: '此開卷第一:ruby[紅樓]{rt="hóngloumeng" group}夢' }, config({}, roomy, 6));
    const all = lines(doc);
    const seg = all.flatMap((l) => l.segments!).find((s) => s.ruby)!;
    expect(seg.text).toBe('紅樓');
    // 11 letters × 5 px = 55 px over a 40 px base: 50 px with the overhang.
    expect(seg.width - (seg.tracking ?? 0)).toBeCloseTo(50, 9);
    expect(all.some((l) => l.text.endsWith('紅'))).toBe(false);
  });

  it('zhuyin goes right of each character, in horizontal and vertical text', () => {
    const h = buildDocument({ markdown: ':ruby[紅]{rt="ㄏㄨㄥˊ"}樓' }, config({}, roomy));
    const seg = segments(h).find((s) => s.ruby)!;
    expect(seg.ruby!.position).toBe('right');
    // The character's box grows by the column: 20 + gap + 6 px column + tone.
    expect(seg.width).toBeGreaterThan(20 + 6);
    const symbols = seg.ruby!.runs.filter((r) => r.text !== 'ˊ');
    expect(symbols.map((r) => r.text)).toEqual(['ㄏ', 'ㄨ', 'ㄥ']);
    for (const r of symbols) expect(r.dx).toBeGreaterThan(20);
    // Stacked down the column.
    expect(symbols[0]!.dy).toBeLessThan(symbols[1]!.dy);
    const v = buildDocument({ markdown: ':ruby[紅]{rt="ㄏㄨㄥˊ"}樓' }, config({}, { ...roomy, layout: { layoutType: 'single', writingMode: 'vertical-rl' } }));
    const vs = segments(v).find((s) => s.ruby)!;
    expect(vs.ruby!.position).toBe('over');
    expect(vs.ruby!.runs[0]!.text).toBe('ㄏㄨㄥ');
    expect(vs.ruby!.runs[0]!.dy).toBeLessThan(-0.88 * 20);
  });

  it('warns at a 1.2 line height and not at 2.0', () => {
    const tight = buildDocument({ markdown: '{紅樓|hóng|lóu}夢' }, config({}, { bodyText: { fontSize: pt(20), lineHeight: pt(24), hyphenation: { enabled: false } } }));
    expect(tight.contentWarnings?.find((w) => w.kind === 'rubyExceedsLeading')).toMatchObject({ gapEm: 0.2, neededEm: 0.5 });
    const loose = buildDocument({ markdown: '{紅樓|hóng|lóu}夢' }, config({}, roomy));
    expect(loose.contentWarnings?.some((w) => w.kind === 'rubyExceedsLeading') ?? false).toBe(false);
  });

  it('the plain text of an annotated paragraph is the base text', () => {
    const doc = buildDocument({ markdown: '{紅樓|hóng|lóu}夢，:ruby[石頭記]{rt="shí tou jì"}。' }, config({}, roomy));
    expect(paragraphs(doc)[0]!.lines.map((l) => l.text).join('')).toBe('紅樓夢，石頭記。');
    const p = paragraphs(doc)[0]!;
    expect(p.lines[p.lines.length - 1]!.plainEnd).toBe('紅樓夢，石頭記。'.length);
  });

  it('ruby font, size and colour follow cjk.ruby', () => {
    const doc = buildDocument({ markdown: '{紅|hóng}' }, config({ ruby: { fontFamily: 'Pinyin Sans', fontSize: { value: 0.4, unit: 'em' }, color: { hex: '#336699', model: 'hex' } } }, roomy));
    const r = segments(doc).find((s) => s.ruby)!.ruby!;
    expect(r.fontString).toBe('8px Pinyin Sans');
    expect(r.color).toBe('#336699');
  });
});

describe('warichu (:warichu)', () => {
  const note = (n: number): string => '甲戌側批此是第一首標題詩也本回有夢幻之說一二三四五六七八九十'.slice(0, n);

  it('a note that fits folds into two equal rows, the second never the longer', () => {
    for (const [n, upper, lower] of [[20, 10, 10], [21, 11, 10]] as const) {
      const doc = buildDocument({ markdown: `寶玉:warichu[${note(n)}]道` }, config({}, {}, 20));
      const seg = segments(doc).find((s) => s.warichu)!;
      expect([...seg.warichu!.upper].length).toBe(upper);
      expect([...seg.warichu!.lower].length).toBe(lower);
      expect(seg.text).toBe(note(n));
      // Rows of 10 px characters: the part takes the upper row's advance.
      expect(seg.width - (seg.tracking ?? 0)).toBeCloseTo(upper * 10, 9);
      // Centred on the line's axis: the upper row above it, the lower one under.
      expect(seg.warichu!.upperDy).toBeLessThan(seg.warichu!.lowerDy);
      expect(seg.warichu!.lowerDy - seg.warichu!.upperDy).toBeCloseTo(10, 9);
    }
  });

  it('a note straddling a line break fills the line and goes on with the next; brackets only at its ends', () => {
    // 11 characters, the bracket, then 60 note characters: 30 folded.
    const doc = buildDocument({ markdown: `此開卷第一回也作者自云:warichu[${note(30).repeat(2)}]{open="〔" close="〕"}因曾歷過` }, config({}, {}, 20));
    const ls = lines(doc);
    const parts = ls.map((l) => l.segments!.find((s) => s.warichu)).filter(Boolean) as VDTLineSegment[];
    expect(parts.length).toBe(2);
    expect(parts.map((p) => p.text).join('')).toBe(note(30).repeat(2));
    const brackets = segments(doc).filter((s) => s.inserted).map((s) => s.text);
    expect(brackets).toEqual(['〔', '〕']);
    // The first line is full.
    const first = ls[0]!;
    expect(first.segments!.reduce((s, x) => s + x.width, 0)).toBeCloseTo(400, 6);
  });

  it('never opens the second row with a full stop', () => {
    // 4 characters then 。: the split before 。 moves after it.
    const doc = buildDocument({ markdown: '寶玉:warichu[甲戌側批。]道' }, config());
    const seg = segments(doc).find((s) => s.warichu)!;
    expect(seg.warichu!.lower.startsWith('。')).toBe(false);
  });

  it('continues on the next page', () => {
    const long = Array.from({ length: 40 }, () => '此開卷第一回也作者自云因曾歷過一番夢幻').join('');
    // 34½ lines of text, then the note: it opens on the last line of a
    // page (5 lines each) and runs on to the next one.
    const md = `${long.slice(0, 690)}:warichu[${note(30).repeat(4)}]道`;
    const doc = buildDocument({ markdown: md }, config({}, { page: { width: pt(440), height: pt(200), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } } }, 20));
    const pagesWithNote = new Set(doc.blocks.filter((b) => b.lines.some((l) => l.segments?.some((s) => s.warichu))).map((b) => b.pageIndex));
    expect(pagesWithNote.size).toBeGreaterThan(1);
  });

  it('vertical text: the upper row is the right one', () => {
    const doc = buildDocument({ markdown: `寶玉:warichu[${note(10)}]道` }, config({}, { layout: { layoutType: 'single', writingMode: 'vertical-rl' } }));
    const seg = segments(doc).find((s) => s.warichu)!;
    // Flow frame: the right sub-column is the over side (smaller y).
    expect(seg.warichu!.upperDy).toBeLessThan(seg.warichu!.lowerDy);
  });

  it('the paragraph reads the note once, in order', () => {
    const doc = buildDocument({ markdown: `寶玉:warichu[${note(30)}]{open="〔" close="〕"}道` }, config({}, {}, 12));
    const p = paragraphs(doc)[0]!;
    const plain = p.lines.map((l) => l.segments!.filter((s) => !s.inserted).map((s) => s.text).join('')).join('');
    expect(plain).toBe(`寶玉${note(30)}道`);
    expect(p.lines[p.lines.length - 1]!.plainEnd).toBe(plain.length);
  });

  it('size and colour follow cjk.warichu, with its brackets', () => {
    const doc = buildDocument({ markdown: '寶玉:warichu[甲戌側批]道' }, config({ warichu: { fontSize: { value: 0.6, unit: 'em' }, color: { hex: '#b22222', model: 'hex' }, open: '（', close: '）' } }));
    const seg = segments(doc).find((s) => s.warichu)!;
    expect(seg.warichu!.fontString).toContain('12px');
    expect(seg.warichu!.color).toBe('#b22222');
    const brackets = segments(doc).filter((s) => s.inserted);
    expect(brackets.map((b) => [b.text, b.color])).toEqual([['（', '#b22222'], ['）', '#b22222']]);
  });
});
