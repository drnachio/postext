import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../index.js';
import type { PostextConfig } from '../../types.js';
import type { VDTBlock, VDTDocument, VDTLine, VDTLineSegment } from '../../vdt.js';
import { installSizedStub } from '../vertical/stub.js';
import { createMeasurementCache } from '../../measure/index.js';
import { splitNote } from '../../measure/cjk/cjkAnnotate.js';

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

  it('give a number set in one upright cell one dot in vertical text (#190 with #193)', () => {
    const vertical = config({}, { layout: { layoutType: 'single', writingMode: 'vertical-rl' } });
    // 28 stands in one cell (cjk.uprightDigits 2), 12 by :tcy: a dot each,
    // centred on the cell.
    for (const md of [':dots[第28回]', ':dots[第:tcy[12]回]']) {
      const line = lines(buildDocument({ markdown: md }, vertical))[0]!;
      const dots = line.marks!.filter((m) => m.kind === 'dot');
      expect(dots.map((d) => d.x)).toEqual([10, 30, 50]);
    }
    // Sideways (three digits under 2) and in horizontal text: a dot a digit.
    expect(lines(buildDocument({ markdown: ':dots[第120回]' }, vertical))[0]!.marks!).toHaveLength(5);
    expect(lines(buildDocument({ markdown: ':dots[第28回]' }, config()))[0]!.marks!).toHaveLength(4);
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

// #719: a part of two characters or more closed by a mark came out as one
// row, since the only fold with the upper row at least half the part would
// open the lower row with the mark. The nearest fold before the half point
// is taken, the lower row the longer.
describe('warichu: the nearest fold wins over a single row (#719)', () => {
  it('splitNote chooses among the folds that keep both rules', () => {
    // 本 名 。 and the same with a half-width stop.
    expect(splitNote([10, 10, 10], [false, false, true])).toBe(1);
    expect(splitNote([10, 10, 5], [false, false, true])).toBe(1);
    // 甲 乙 丙 。 」
    expect(splitNote([10, 10, 10, 10, 10], [false, false, false, true, true])).toBe(2);
    // 廢 。: one character with its mark has no fold.
    expect(splitNote([10, 10], [false, true])).toBe(2);
    expect(splitNote([10], [false])).toBe(1);
    expect(splitNote([], [])).toBe(0);
    // An opening bracket may not end the upper row: 「 甲 。
    expect(splitNote([10, 10, 10], [false, false, true], [true, false, false])).toBe(3);
    // 甲 「 乙 。: the fold before the bracket.
    expect(splitNote([10, 10, 10, 10], [false, false, false, true], [false, true, false, false])).toBe(1);
  });

  it('folds as before whenever a fold at or after the half point keeps the rules', () => {
    // 要 緊 句 。, 甲 戌 側 批 。, and twenty equal units.
    expect(splitNote([10, 10, 10, 10], [false, false, false, true])).toBe(2);
    expect(splitNote([10, 10, 10, 10, 10], [false, false, false, false, true])).toBe(3);
    expect(splitNote(Array(20).fill(10), Array(20).fill(false))).toBe(10);
    expect(splitNote(Array(21).fill(10), Array(21).fill(false))).toBe(11);
    // The half point falls before a mark: the upper row takes it.
    expect(splitNote([10, 10, 10, 10], [false, true, false, false])).toBe(2);
    expect(splitNote([10, 10, 10, 10, 10, 10], [false, false, false, true, false, false])).toBe(4);
  });

  const rows = (doc: VDTDocument): string[] => segments(doc).filter((s) => s.warichu).map((s) => `${s.warichu!.upper}/${s.warichu!.lower}`);
  const vertical = { layout: { layoutType: 'single' as const, writingMode: 'vertical-rl' as const } };
  for (const locale of ['zh-Hant', 'ja']) {
    for (const [mode, extra] of [['horizontal', {}], ['vertical', vertical]] as const) {
      it(`${locale}, ${mode}: a note closed by a mark folds with the mark in the lower row`, () => {
        const set = (note: string): VDTDocument => buildDocument({ markdown: `寶玉:warichu[${note}]道` }, config({}, { locale, ...extra }), createMeasurementCache());
        expect(rows(set('本名。'))).toEqual(['本/名。']);
        expect(rows(set('豈敢。'))).toEqual(['豈/敢。']);
        expect(rows(set('甲乙丙。」'))).toEqual(['甲乙/丙。」']);
        // Two note characters wide: the lower row, 名 and its stop.
        const seg = segments(set('本名。')).find((s) => s.warichu)!;
        expect(seg.width - (seg.tracking ?? 0)).toBeCloseTo(20, 9);
        expect(seg.text).toBe('本名。');
        // One character with its mark is one row; the folds of before stay.
        expect(rows(set('廢。'))).toEqual(['廢。/']);
        expect(rows(set('要緊句。'))).toEqual(['要緊/句。']);
        expect(rows(set('甲戌側批。'))).toEqual(['甲戌側/批。']);
        expect(rows(set('本名'))).toEqual(['本/名']);
      });
    }

    it(`${locale}: the remainder of a note at the head of a line folds too`, () => {
      // Ten characters to the line, the note pushed along it one character
      // at a time: wherever it is cut, no part of two characters or more
      // is left in one row.
      const tails = new Set<string>();
      for (let lead = 3; lead <= 10; lead++) {
        const md = `${'一二三四五六七八九十'.slice(0, lead)}:warichu[豈敢豈敢豈敢。]道一二三四五六七八九十`;
        const doc = buildDocument({ markdown: md }, config({}, { locale }, 10), createMeasurementCache());
        const parts = rows(doc);
        expect(parts.map((p) => p.replace('/', '')).join(''), String(lead)).toBe('豈敢豈敢豈敢。');
        for (const part of parts) {
          const [upper, lower] = part.split('/') as [string, string];
          if ([...upper].filter((c) => c !== '。').length > 1) expect(lower, `${lead}: ${parts.join(' | ')}`).not.toBe('');
          expect(lower.startsWith('。'), part).toBe(false);
        }
        if (parts.length > 1) tails.add(parts.at(-1)!);
      }
      // The two-character remainder, which was `豈敢。` in one row.
      expect([...tails]).toContain('豈/敢。');
    });
  }

  it('a Latin note of two words folds between them', () => {
    const doc = buildDocument({ markdown: 'The text :warichu[see Encyclopaedia] goes on.' }, config({}, { locale: 'en' }, 30), createMeasurementCache());
    const w = segments(doc).find((s) => s.warichu)!.warichu!;
    expect(w.upper.trim()).toBe('see');
    expect(w.lower).toBe('Encyclopaedia');
  });
});

// #720: a note that runs over a line end left one of its characters alone,
// at the end of a line or at the head of the next (and so of a column or a
// page). A line now breaks inside a note only where `cjk.warichu.minChars`
// of its characters (2 by default) stand on either side.
describe('warichu: two characters on either side of a line break (#720)', () => {
  const K = '一二三四五六七八九十';
  const parts = (doc: VDTDocument): string[] => segments(doc).filter((s) => s.warichu).map((s) => `${s.warichu!.upper}/${s.warichu!.lower}`);
  /** The counted characters of a part: its marks do not count. */
  const letters = (part: string): number => [...part.replace('/', '')].filter((c) => !'。，、」』）'.includes(c) && c !== ' ').length;
  const cjkOf = (minChars?: number): PostextConfig['cjk'] => (minChars === undefined ? {} : { warichu: { minChars } });
  const overflowOf = (doc: VDTDocument): number => Math.max(0, ...paragraphs(doc).flatMap((b) => b.lines.map((l) => {
    let w = 0;
    for (const s of l.segments ?? []) if (!s.hangs) w += s.width;
    return w - (b.bbox.width - (l.bbox.x - b.bbox.x));
  })));

  it('the tail of a note is never one character at the head of a line', () => {
    // Ten characters to the line, nine before the note: 豈敢 / 豈 fits the
    // line and 敢。 would open the next one.
    for (const locale of ['zh-Hant', 'ja']) {
      const md = `${K.slice(0, 9)}:warichu[豈敢豈敢。]道${K}`;
      const before = parts(buildDocument({ markdown: md }, config(cjkOf(1), { locale }, 10), createMeasurementCache()));
      const after = parts(buildDocument({ markdown: md }, config({}, { locale }, 10), createMeasurementCache()));
      for (const part of after) expect(letters(part), `${locale}: ${after.join(' | ')}`).toBeGreaterThanOrEqual(2);
      expect(after.map((p) => p.replace('/', '')).join('')).toBe('豈敢豈敢。');
      // Under `minChars: 1` the lines of postext 1.27.
      if (locale === 'zh-Hant') expect(before).toEqual(['豈敢/豈', '敢。/']);
    }
  });

  it('sweeps a note along the line: no part of one character, no line past its measure', () => {
    const note = '此是第一首標題詩大有可異。';
    for (const locale of ['zh-Hant', 'ja']) {
      for (const vertical of [false, true]) {
        for (let lead = 0; lead <= 12; lead++) {
          const md = `${(K + K).slice(0, lead)}:warichu[${note}]道${K}`;
          const extra = { locale, ...(vertical ? { layout: { layoutType: 'single' as const, writingMode: 'vertical-rl' as const } } : {}) };
          const doc = buildDocument({ markdown: md }, config({}, extra, 10), createMeasurementCache());
          const set = parts(doc);
          const label = `${locale} ${vertical ? 'V' : 'H'} ${lead}: ${set.join(' | ')}`;
          expect(set.map((p) => p.replace('/', '')).join(''), label).toBe(note);
          for (const part of set) expect(letters(part), label).toBeGreaterThanOrEqual(2);
          expect(overflowOf(doc), label).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('the head of a note is never one character at the end of a line', () => {
    // Two cells, one cell and none left on the line: the line takes two
    // characters of the note or more, or the whole note opens the next.
    for (let lead = 8; lead <= 10; lead++) {
      const md = `${K.slice(0, lead)}:warichu[甲乙丙丁戊己庚辛]道${K}`;
      const doc = buildDocument({ markdown: md }, config({}, { locale: 'zh-Hant' }, 10), createMeasurementCache());
      const set = parts(doc);
      for (const part of set) expect(letters(part), `${lead}: ${set.join(' | ')}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('a note of two or three characters is never divided', () => {
    for (const note of ['本名', '本名。', '要緊句', '要緊句。']) {
      for (let lead = 6; lead <= 10; lead++) {
        const md = `${K.slice(0, lead)}:warichu[${note}]道${K}`;
        const set = parts(buildDocument({ markdown: md }, config({}, { locale: 'zh-Hant' }, 10), createMeasurementCache()));
        expect(set.map((p) => p.replace('/', '')), `${note} ${lead}`).toEqual([note]);
      }
    }
  });

  it('a note longer than two lines still fills each line', () => {
    const note = '甲戌側批此是第一首標題詩也本回有夢幻之說一二三四五六七八九十'.repeat(2);
    const doc = buildDocument({ markdown: `此開卷第一回也:warichu[${note}]道` }, config({}, { locale: 'zh-Hant' }, 10), createMeasurementCache());
    const ls = lines(doc);
    expect(parts(doc).length).toBeGreaterThanOrEqual(3);
    // Every line but the last is set to the measure.
    for (const l of ls.slice(0, -1)) expect(l.segments!.reduce((w, x) => w + x.width, 0)).toBeCloseTo(200, 6);
    expect(overflowOf(doc)).toBeLessThan(1e-6);
  });

  it('a Latin note counts its words', () => {
    const gloss = 'a long English gloss on the passage that runs on for many words and keeps going';
    for (let lead = 0; lead < 12; lead++) {
      const doc = buildDocument({ markdown: `${'x'.repeat(lead)} says :warichu[${gloss}] and the text goes on.` }, config({}, { locale: 'en' }, 20), createMeasurementCache());
      const set = segments(doc).filter((s) => s.warichu).map((s) => s.text.trim());
      expect(set.join(' ')).toBe(gloss);
      for (const part of set) expect(part.split(' ').length, `${lead}: ${set.join(' | ')}`).toBeGreaterThanOrEqual(2);
      expect(overflowOf(doc)).toBeLessThan(1e-6);
    }
  });

  it('falls back on the level\'s breaks when the line has no other', () => {
    // Three characters to the line and a note of five: no break leaves two
    // of its characters on each side of every line, and no line may run
    // past the measure.
    const doc = buildDocument({ markdown: ':warichu[甲乙丙丁戊己庚辛壬癸子丑寅]' }, config({}, { locale: 'zh-Hant' }, 3), createMeasurementCache());
    expect(parts(doc).map((p) => p.replace('/', '')).join('')).toBe('甲乙丙丁戊己庚辛壬癸子丑寅');
    expect(overflowOf(doc)).toBeLessThan(1e-6);
  });

  it('a note across a page turn carries two characters with its stop', () => {
    // A vertical grid of ten characters and two lines to the page: 17
    // characters, then a note whose last character and stop went over.
    const note = '此是第一首標題詩大有可異。';
    const page = { width: pt(2 * 30 + 40), height: pt(10 * 20 + 40), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } };
    const build = (minChars?: number): VDTDocument => buildDocument(
      { markdown: `${(K + K).slice(0, 17)}:warichu[${note}]道${K}` },
      config({ grid: { enabled: true, charsPerLine: 10, linesPerPage: 2 }, ...cjkOf(minChars) }, { locale: 'zh-Hant', layout: { layoutType: 'single', writingMode: 'vertical-rl' }, page }, 10),
      createMeasurementCache(),
    );
    const byPage = (doc: VDTDocument): string[][] => {
      const out: string[][] = [];
      for (const b of paragraphs(doc)) {
        for (const l of b.lines) for (const s of l.segments ?? []) if (s.warichu) (out[b.pageIndex] ??= []).push(`${s.warichu.upper}/${s.warichu.lower}`);
      }
      return out;
    };
    // 1.27: page 2 opens with 異。 in one row.
    expect(byPage(build(1))[1]).toEqual(['異。/']);
    const after = byPage(build());
    expect(after[1]).toEqual(['可/異。']);
    expect(after[0]!.join('').replace('/', '')).toBe('此是第一首標題詩大有');
  });

  it('resolves, strips and keys the setting', async () => {
    const { resolveCjkConfig, stripCjkDefaults } = await import('../../defaults/text/cjk.js');
    const { cjkCompositionKey, cjkCompositionOf } = await import('../../measure/cjk/cjkPunctuation.js');
    const resolved = (minChars: unknown): number => resolveCjkConfig({ warichu: { minChars: minChars as number } }, 'zh-Hant').warichu.minChars;
    expect(resolveCjkConfig({}, 'zh-Hant').warichu.minChars).toBe(2);
    expect(resolveCjkConfig({}, 'ja').warichu.minChars).toBe(2);
    expect(resolved(1)).toBe(1);
    expect(resolved(3.9)).toBe(3);
    expect(resolved('4')).toBe(4);
    for (const bad of [0, -1, NaN, Infinity, 'two', null, true]) expect(resolved(bad), String(bad)).toBe(2);
    expect(stripCjkDefaults({ warichu: { minChars: 2 } })).toBeUndefined();
    expect(stripCjkDefaults({ warichu: { minChars: 1 } })).toEqual({ warichu: { minChars: 1 } });
    expect(stripCjkDefaults({ warichu: { minChars: 3, open: '〔' } })).toEqual({ warichu: { minChars: 3, open: '〔' } });
    const key = (cjk: PostextConfig['cjk']): string => cjkCompositionKey(cjkCompositionOf(resolveCjkConfig(cjk, 'zh-Hant'), 72, 'zh-Hant'));
    expect(cjkCompositionOf(resolveCjkConfig({}, 'zh-Hant'), 72, 'zh-Hant').noteMinChars).toBeUndefined();
    expect(key({ warichu: { minChars: 2 } })).toBe(key({}));
    expect(key({ warichu: { minChars: 1 } })).toBe(`${key({})}:n1`);
    expect(key({ warichu: { minChars: 3 } })).toBe(`${key({})}:n3`);
  });
});

// Review fixes (T8 review): the warichu breaker, the note's rows, a Latin
// note, ruby at a line edge, zhuyin tone marks in vertical text, shared
// line gaps, a split group ruby, 《》 outside measured paragraphs and
// escaped compact rubies.
describe('review fixes', () => {
  /** Where each line's text ends past its measure (px, 0 when it fits). */
  const overflow = (doc: VDTDocument): number[] => paragraphs(doc).flatMap((b) => b.lines.map((l) => {
    let w = 0;
    for (const s of l.segments ?? []) if (!s.hangs) w += s.width;
    return Math.max(0, w - (b.bbox.width - (l.bbox.x - b.bbox.x)));
  }));

  it('a warichu line never runs past its measure, 」。 and …… clusters in the note', () => {
    const lead = '此開卷第一回也作者自云因曾歷過一番夢幻之後故將真事隱去';
    const note = '甲戌眉批：「……」。「……」。能解者方有辛酸之淚，哭成此書。壬午除夕，書未成，芹為淚盡而逝。余嘗哭芹，淚亦待盡。';
    for (const vertical of [false, true]) {
      for (let k = 0; k < 20; k++) {
        const md = `${lead.slice(0, k)}:warichu[${note}]{open="〔" close="〕"}道：「此石亦可謂之奇矣。」`;
        const extra = vertical ? { layout: { layoutType: 'single' as const, writingMode: 'vertical-rl' as const } } : {};
        const doc = buildDocument({ markdown: md }, config({}, extra, 20));
        expect(overflow(doc).every((o) => o < 1e-6), `${vertical ? 'V' : 'H'} ${k}: ${overflow(doc)}`).toBe(true);
        // The note is read once, whole.
        expect(segments(doc).filter((s) => s.warichu).map((s) => s.text).join('')).toBe(note);
      }
    }
  });

  it('the upper row of a note never ends with an opening bracket', () => {
    for (const text of ['甲乙丙「丁戊己庚', '甲乙丙（丁戊己庚辛']) {
      const doc = buildDocument({ markdown: `寶玉:warichu[${text}]道` }, config());
      const w = segments(doc).find((s) => s.warichu)!.warichu!;
      expect(/[「（]$/.test(w.upper), `${w.upper} / ${w.lower}`).toBe(false);
      expect(w.upper + w.lower).toBe(text);
    }
  });

  it('a Latin note breaks between its words', () => {
    const gloss = 'a long English gloss on the passage that runs on for many words and keeps going well past the end of the line it opens on';
    const doc = buildDocument({ markdown: `The commentary says :warichu[${gloss}] and the text goes on.` }, config({}, { locale: 'en' }, 20));
    const ls = lines(doc);
    // The note opens on the first line and fills it.
    const first = ls[0]!.segments!.find((s) => s.warichu);
    expect(first).toBeDefined();
    const natural = ls[0]!.segments!.reduce((w, s) => w + s.width - (s.tracking ?? 0), 0);
    expect(natural).toBeGreaterThan(400 - 30);
    // No part opens with a space; the note reads once.
    const parts = segments(doc).filter((s) => s.warichu);
    for (const p of parts.slice(1)) expect(p.text.startsWith(' ')).toBe(false);
    expect(parts.map((p) => p.text).join('')).toBe(gloss);
    expect(overflow(doc).every((o) => o < 1e-6)).toBe(true);
  });

  const roomy = { bodyText: { fontSize: pt(20), lineHeight: pt(40), textAlign: 'justify' as const, firstLineIndent: pt(0), hyphenation: { enabled: false } } };

  it('a ruby base opening a line aligns to its start with its reading', () => {
    // 20 characters fill the first line; 莊 (zhuāng, 30 px over 20) opens
    // the second.
    const doc = buildDocument({ markdown: '此開卷第一回也作者自云因曾歷過一番夢幻之{莊|zhuāng}也' }, config({}, roomy, 20));
    const line = lines(doc)[1]!;
    const seg = line.segments![0]!;
    expect(seg.ruby).toBeDefined();
    expect(seg.inkOffset ?? 0).toBe(0);
    expect(seg.ruby!.runs[0]!.dx).toBeCloseTo(0, 9);
    // The box keeps what the reading needs past its right side, less its
    // quarter-em overhang: never wider than it was (25 px).
    expect(seg.width - (seg.tracking ?? 0)).toBeLessThanOrEqual(25 + 1e-9);
  });

  it('a ruby base closing a line aligns to its end with its reading', () => {
    // 18 characters, 莊 (a 25 px box) and 也夫, which go down: 莊 ends the
    // justified first line.
    const doc = buildDocument({ markdown: '此開卷第一回也作者自云因曾歷過一番夢{莊|zhuāng}也夫' }, config({}, roomy, 20));
    const line = lines(doc)[0]!;
    const seg = line.segments![line.segments!.length - 1]!;
    expect(seg.ruby).toBeDefined();
    const x = segmentX(line, seg);
    const lineEnd = line.segments!.reduce((w, s) => w + s.width, 0);
    // The base's right edge and the reading's end are the line's end.
    expect(x + (seg.inkOffset ?? 0) + 20).toBeCloseTo(lineEnd, 6);
    expect(x + seg.ruby!.runs[0]!.dx + 30).toBeCloseTo(lineEnd, 6);
  });

  it('zhuyin in vertical text: the tone mark stands upright right of the column, by the last symbol', () => {
    const doc = buildDocument({ markdown: ':ruby[滿]{rt="ㄇㄢˇ"}紙' }, config({}, { ...roomy, layout: { layoutType: 'single', writingMode: 'vertical-rl' } }));
    const r = segments(doc).find((s) => s.ruby)!.ruby!;
    const [symbols, tone] = r.runs;
    expect(symbols!.text).toBe('ㄇㄢ');
    expect(tone).toMatchObject({ text: 'ˇ', upright: true });
    // 6 px symbols: ㄢ's top is 6 px down the column. The stub centres the
    // tone's ink 0.38 em over its baseline, on the cell's axis: the cell is
    // centred on that top.
    const zEm = 6;
    expect(tone!.dx + zEm / 2).toBeCloseTo(symbols!.dx + zEm, 9);
    // Right of the column (the over side: smaller y).
    expect(tone!.dy).toBeLessThan(symbols!.dy);
  });

  it('two zhuyin readings side by side keep a quarter of the symbols’ em apart, not of the ruby em (Nº 080)', () => {
    // ㄐㄧㄡ and ㄒㄧㄤ: three 6 px symbols beside 20 px characters, 1 px
    // to spare at each end. A quarter of the 10 px ruby em apart (2.5 px)
    // made 就 21 px; a quarter of the symbols' 6 px em (1.5 px) keeps both
    // characters one em.
    const vertical = { ...roomy, locale: 'zh-Hant-TW', layout: { layoutType: 'single' as const, writingMode: 'vertical-rl' as const } };
    const doc = buildDocument({ markdown: '一{就|ㄐㄧㄡˋ}{像|ㄒㄧㄤˋ}二' }, config({}, vertical));
    const line = lines(doc)[0]!;
    const [jiu, xiang] = line.segments!.filter((s) => s.ruby);
    expect([jiu!.width, xiang!.width]).toEqual([20, 20]);
    // The readings stay apart: 就's ends 1 px before its cell ends, 像's
    // starts 1 px into its own.
    const end = segmentX(line, jiu!) + jiu!.ruby!.runs[0]!.dx + 18;
    const start = segmentX(line, xiang!) + xiang!.ruby!.runs[0]!.dx;
    expect(start - end).toBeCloseTo(2, 9);
    // So 21 characters and 就像 fill a measure of 23 with or without readings.
    const run = '此開卷第一回也作者自云因曾歷過一番夢幻之後';
    for (const md of [`${run}就像`, `${run}{就|ㄐㄧㄡˋ}{像|ㄒㄧㄤˋ}`]) {
      expect(lines(buildDocument({ markdown: md }, config({}, vertical, 23))).map((l) => l.text)).toEqual([`${run}就像`]);
    }
    // Two pinyin readings still keep a quarter of the ruby em apart: shuō
    // and míng fill their 20 px bases, so 說 grows by 2 × 2.5 px.
    const pinyin = segments(buildDocument({ markdown: '一{說|shuō}{明|míng}二' }, config({}, roomy))).filter((s) => s.ruby);
    expect(pinyin[0]!.width).toBeCloseTo(25, 9);
  });

  it('marks under one line and readings over the next share the line gap', () => {
    // 20 px text on 32 px lines: a gap of 0.6 em, enough for each alone.
    const tight = { bodyText: { fontSize: pt(20), lineHeight: pt(32), textAlign: 'justify' as const, firstLineIndent: pt(0), hyphenation: { enabled: false } } };
    const md = '讀:book[牡丹亭]，:dots[不可]{style="sesame"}輕忽。\n\n作者{都云|dōu|yún}痴，{誰解|shuí|jiě}';
    const doc = buildDocument({ markdown: md }, config({}, { locale: 'zh-Hant-TW', ...tight }));
    const w = doc.contentWarnings?.find((x) => x.kind === 'rubyExceedsLeading');
    expect(w).toBeDefined();
    expect(w).toMatchObject({ gapEm: 0.6 });
    expect((w as { neededEm: number }).neededEm).toBeGreaterThan(0.6);
    // Each paragraph alone is silent.
    for (const alone of [md.split('\n\n')[0]!, md.split('\n\n')[1]!]) {
      const d = buildDocument({ markdown: alone }, config({}, { locale: 'zh-Hant-TW', ...tight }));
      expect(d.contentWarnings?.some((x) => x.kind === 'rubyExceedsLeading' || x.kind === 'cjkMarksExceedLeading') ?? false).toBe(false);
    }
  });

  it('a group ruby around a formula is read once', () => {
    const doc = buildDocument({ markdown: '甲:ruby[紅$x$樓]{rt="a b"}乙' }, config({}, roomy));
    const readings = segments(doc).filter((s) => s.ruby).map((s) => s.ruby!.text);
    expect(readings).toEqual(['a b']);
  });

  it('under brackets the contents, a plain heading, captions and cells keep 《》', () => {
    const md = ':::toc\n\n# 第一回　讀:book[西廂記]\n\n正文讀:book[西廂記]。見 :ref{id="tab"}。';
    const cell = (content: string) => ({ content });
    const table = {
      id: 'tab', typeId: 'table', kind: 'table' as const, caption: '讀:book[牡丹亭]', createdAt: 0, updatedAt: 0,
      table: { model: { rows: [[cell('戲'), cell(':book[還魂記]')]] } },
    };
    for (const inlineMarks of [true, false]) {
      const doc = buildDocument({ markdown: md, resources: [table] }, config({}, { headings: { inlineMarks } }, 20));
      const texts = doc.blocks.map((b) => b.lines.map((l) => l.text).join(''));
      // The contents row and the heading.
      expect(texts.filter((t) => t.includes('第一回　讀《西廂記》'))).toHaveLength(2);
      const res = [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])].find((b) => b.resourceBlock)!.resourceBlock!;
      expect(res.captionLines.map((l) => l.text).join('')).toContain('讀《牡丹亭》');
      expect(JSON.stringify(res)).toContain('《還魂記》');
    }
    // Wavy (Taiwan): no brackets anywhere.
    const tw = buildDocument({ markdown: md, resources: [table] }, config({}, { locale: 'zh-Hant-TW' }, 20));
    expect(JSON.stringify(tw.blocks.map((b) => b.lines.map((l) => l.text)))).not.toContain('《');
  });

  it('an index term written as a book title takes the book-title mark', () => {
    const md = '又讀:book[牡丹亭]:index{term=":book[牡丹亭]"}。\n\n:::index';
    const entry = (locale: string) => lines(buildDocument({ markdown: md }, config({}, { locale }, 20))).find((l) => l.text.includes('牡丹亭') && l.text.includes(', 1'))!;
    expect(entry('zh-Hans').text).toContain('《牡丹亭》, 1');
    expect(entry('zh-Hans').marks).toBeUndefined();
    const tw = entry('zh-Hant-TW');
    expect(tw.text).not.toContain('《');
    expect(tw.marks!.map((m) => m.kind)).toEqual(['wavy']);
  });

  it('a backslash keeps a compact ruby literal', () => {
    for (const md of ['\\{紅|hóng}樓', '{紅\\|hóng}樓']) {
      const doc = buildDocument({ markdown: md }, config({}, roomy));
      expect(segments(doc).some((s) => s.ruby)).toBe(false);
      expect(lines(doc)[0]!.text).toBe('{紅|hóng}樓');
    }
    // An escaped bar inside a ruby's reading is a bar of the reading.
    const doc = buildDocument({ markdown: '{紅|a\\|b}' }, config({}, roomy));
    expect(segments(doc).find((s) => s.ruby)!.ruby!.text).toBe('a|b');
  });
});
