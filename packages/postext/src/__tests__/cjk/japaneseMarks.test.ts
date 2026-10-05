import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../index';
import { parseMarkdown } from '../../parse';
import { stripAnnotations, withBookBrackets } from '../../parse/annotations';
import { plainSpans } from '../../parse/inlineFormatting';
import { defaultCjkBookTitleBrackets, defaultCjkEmphasisMark, resolveCjkConfig, stripCjkDefaults } from '../../defaults/cjk';
import { createMeasurementCache } from '../../measure';
import type { InlineSpan } from '../../parse';
import type { CjkRegion, PostextConfig, Resource } from '../../types';
import type { VDTBlock, VDTDocument, VDTLine, VDTLineMark, VDTLineSegment } from '../../vdt';
import { installSizedStub } from '../vertical/stub';

// Japanese emphasis marks (傍点: the sesame over the text), side lines
// (傍線, `:sideline[…]`) and the 『』 of book titles (#421). The stub
// measures kana and kanji 1 em, Latin letters ½ em, a space ¼ em.
installSizedStub();

const pt = (value: number) => ({ value, unit: 'pt' as const });
const EM = 20;
/** The central axis of the stub's text, px from the baseline. */
const AXIS = -0.38 * EM;
/** 72 dpi, 20 px text on a 30 px line (a gap of half an em), a measure of
 *  20 characters. */
const config = (locale = 'ja', cjk: PostextConfig['cjk'] = {}, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  locale,
  page: { width: pt(440), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(EM), lineHeight: pt(30), textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  cjk,
  ...extra,
});
const vertical = { layout: { layoutType: 'single' as const, writingMode: 'vertical-rl' as const } };

const paragraphs = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'paragraph');
const lines = (doc: VDTDocument): VDTLine[] => paragraphs(doc).flatMap((b) => b.lines);
const segments = (doc: VDTDocument): VDTLineSegment[] => lines(doc).flatMap((l) => l.segments ?? []);
const marksOf = (md: string, cfg: PostextConfig = config()): VDTLineMark[] => lines(buildDocument({ markdown: md }, cfg))[0]!.marks ?? [];

describe('cjk.emphasisMark', () => {
  it('auto: the filled sesame over the text in Japan, the Chinese dot elsewhere', () => {
    expect(defaultCjkEmphasisMark('japan')).toEqual({ style: 'sesame', fill: 'auto', position: 'over' });
    for (const region of ['mainland', 'taiwan', 'hongkong'] as CjkRegion[]) {
      expect(defaultCjkEmphasisMark(region)).toEqual({ style: 'dot', fill: 'auto', position: 'auto' });
    }
    expect(resolveCjkConfig(undefined, 'ja').emphasisMark).toEqual({ style: 'sesame', fill: 'auto', position: 'over' });
    expect(resolveCjkConfig(undefined, 'zh-Hans').emphasisMark).toEqual({ style: 'dot', fill: 'auto', position: 'auto' });
    expect(resolveCjkConfig(undefined, 'en').emphasisMark).toEqual({ style: 'dot', fill: 'auto', position: 'auto' });
  });

  it('keeps what the author sets; unknown values fall back to the region', () => {
    expect(resolveCjkConfig({ emphasisMark: { style: 'circle', fill: 'filled', position: 'under' } }, 'ja').emphasisMark)
      .toEqual({ style: 'circle', fill: 'filled', position: 'under' });
    expect(resolveCjkConfig({ emphasisMark: { style: 'auto', position: 'auto' } }, 'ja').emphasisMark)
      .toEqual({ style: 'sesame', fill: 'auto', position: 'over' });
    expect(resolveCjkConfig({ emphasisMark: { style: 'star' as never, fill: 'x' as never } }, 'zh-Hans').emphasisMark)
      .toEqual({ style: 'dot', fill: 'auto', position: 'auto' });
  });

  it('strips the fields left at auto', () => {
    expect(stripCjkDefaults({ emphasisMark: { style: 'auto', fill: 'auto', position: 'auto' } })).toBeUndefined();
    expect(stripCjkDefaults({ emphasisMark: { style: 'sesame', fill: 'auto' } })).toEqual({ emphasisMark: { style: 'sesame' } });
  });

  it('*…* in Japanese sets one filled sesame over each kana and kanji, none on 、', () => {
    const line = lines(buildDocument({ markdown: 'これは*大切、な*こと' }, config()))[0]!;
    const marks = line.marks!;
    expect(marks.map((m) => m.kind)).toEqual(['sesame', 'sesame', 'sesame']);
    // これは are 60 px: the marks are centred on 大 (60–80), 切 and な (、
    // between them takes none).
    expect(marks.map((m) => m.x)).toEqual([70, 90, 130]);
    for (const m of marks) {
      expect(m.open).toBeUndefined();
      // Over the em box: 0.06 em from it, the mark 0.3 em long.
      expect(m.y).toBeCloseTo(AXIS - EM / 2 - 0.06 * EM - 0.3 * EM / 2, 9);
      expect(m.size).toBeCloseTo(0.3 * EM, 9);
    }
    expect(line.segments!.find((s) => s.text.startsWith('大'))!.cjkMarks)
      .toEqual({ dots: { style: 'sesame', fill: 'filled', position: 'over' } });
  });

  it('in vertical Japanese text the sesame is over the line too: right of it', () => {
    const marks = marksOf('これは:dots[大切]なこと', config('ja', {}, vertical));
    expect(marks.map((m) => m.kind)).toEqual(['sesame', 'sesame']);
    for (const m of marks) expect(m.y).toBeLessThan(AXIS - EM / 2);
  });

  it(':dots attributes win over the region; unset ones take it', () => {
    const marks = marksOf(':dots[大切]{style="dot" pos="under"}:dots[な]{style="circle"}:dots[こと]{pos="under"}');
    expect(marks.map((m) => [m.kind, m.y > AXIS ? 'under' : 'over', m.open ?? false])).toEqual([
      ['dot', 'under', false],
      ['dot', 'under', false],
      ['circle', 'over', true],
      ['sesame', 'under', false],
      ['sesame', 'under', false],
    ]);
  });

  it('a configured mark applies to Chinese text too, and leaves the auto Chinese marks as they were', () => {
    expect(marksOf('此事:dots[不可]輕忽', config('zh-Hans')).map((m) => [m.kind, m.y > AXIS])).toEqual([['dot', true], ['dot', true]]);
    const set = marksOf('此事:dots[不可]輕忽', config('zh-Hans', { emphasisMark: { style: 'sesame', position: 'over', fill: 'open' } }));
    expect(set.map((m) => [m.kind, m.y < AXIS, m.open])).toEqual([['sesame', true, true], ['sesame', true, true]]);
  });

  it('a mark changed in the configuration is measured again (cache key)', () => {
    const cache = createMeasurementCache();
    const sesame = buildDocument({ markdown: ':dots[大切]' }, config(), cache);
    expect(lines(sesame)[0]!.marks!.map((m) => m.kind)).toEqual(['sesame', 'sesame']);
    const dot = buildDocument({ markdown: ':dots[大切]' }, config('ja', { emphasisMark: { style: 'dot' } }), cache);
    expect(lines(dot)[0]!.marks!.map((m) => m.kind)).toEqual(['dot', 'dot']);
  });

  it('marks on the side of a ruby reading go outside it', () => {
    // A reading over 漢 (0.5 em, over the em box): the sesame clears it.
    const line = lines(buildDocument({ markdown: ':dots[{漢|かん}字]' }, config()))[0]!;
    const [onRuby, plain] = line.marks!;
    const reading = line.segments!.find((s) => s.ruby)!.ruby!;
    const readingTop = Math.min(...reading.runs.map((r) => r.dy - (0.38 + 0.5) * EM / 2));
    expect(onRuby!.y + onRuby!.size! / 2).toBeLessThanOrEqual(readingTop + 1e-9);
    expect(plain!.y).toBeCloseTo(AXIS - EM / 2 - 0.06 * EM - 0.3 * EM / 2, 9);
    // Under the text the reading is on the other side: the dots stay put.
    const under = lines(buildDocument({ markdown: ':dots[{漢|かん}字]{pos="under"}' }, config()))[0]!.marks!;
    expect(under[0]!.y).toBeCloseTo(under[1]!.y, 9);
  });
});

describe('cjk.bookTitleBrackets', () => {
  it('auto: 『』 and 「」 in Japan, 《》 and 〈〉 for Chinese', () => {
    expect(defaultCjkBookTitleBrackets('japan')).toEqual([{ open: '『', close: '』' }, { open: '「', close: '」' }]);
    expect(defaultCjkBookTitleBrackets('mainland')).toEqual([{ open: '《', close: '》' }, { open: '〈', close: '〉' }]);
    expect(resolveCjkConfig(undefined, 'ja')).toMatchObject({ bookTitleMark: 'brackets' });
    expect(resolveCjkConfig(undefined, 'zh-Hant-TW')).toMatchObject({ bookTitleMark: 'wavy' });
  });

  it('a Japanese title takes 『』, a title inside it 「」', () => {
    const text = (md: string, cfg = config()) => lines(buildDocument({ markdown: md }, cfg))[0]!.text;
    expect(text('漱石の:book[こころ]を読む')).toBe('漱石の『こころ』を読む');
    expect(text(':book[漱石全集:book[こころ]]')).toBe('『漱石全集「こころ」』');
    expect(text('讀:book[脂硯齋重評:book[石頭記]]', config('zh-Hans'))).toBe('讀《脂硯齋重評〈石頭記〉》');
    // The brackets are no plain text: the line maps to the source as written.
    const doc = buildDocument({ markdown: '漱石の:book[こころ]' }, config());
    expect(paragraphs(doc)[0]!.lines[0]!.plainEnd).toBe('漱石のこころ'.length);
  });

  it('pairs set by the author, a title nested deeper than the list taking its last pair', () => {
    const cfg = config('ja', { bookTitleBrackets: [{ open: '〈', close: '〉' }] });
    expect(lines(buildDocument({ markdown: ':book[A:book[B:book[C]]]' }, cfg))[0]!.text).toBe('〈A〈B〈C〉〉〉');
    // An empty list is no list: the region's.
    expect(resolveCjkConfig({ bookTitleBrackets: [] }, 'ja').bookTitleBrackets[0]).toEqual({ open: '『', close: '』' });
    expect(stripCjkDefaults({ bookTitleBrackets: 'auto' })).toBeUndefined();
    expect(stripCjkDefaults({ bookTitleBrackets: [{ open: '«', close: '»' }] })).toEqual({ bookTitleBrackets: [{ open: '«', close: '»' }] });
    // A bracket written empty is left out.
    const bare = config('ja', { bookTitleBrackets: [{ open: '', close: '' }] });
    expect(lines(buildDocument({ markdown: ':book[こころ]' }, bare))[0]!.text).toBe('こころ');
  });

  it('captions and table cells keep the document’s brackets', () => {
    const table: Resource = {
      id: 'tab', typeId: 'table', kind: 'table', caption: ':book[こころ]の版', createdAt: 0, updatedAt: 0,
      table: { model: { headerRowCount: 1, rows: [[{ content: '書名' }], [{ content: ':book[門]' }]] } },
    };
    const doc = buildDocument({ markdown: '見よ :ref{id="tab"}。', resources: [table] }, config());
    const block = [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])].find((b) => b.resourceBlock)!.resourceBlock!;
    expect(block.captionLines.map((l) => l.text).join('')).toContain('『こころ』の版');
    expect(JSON.stringify(block.table)).toContain('『門』');
  });
});

describe(':sideline (傍線)', () => {
  const spansOf = (md: string): InlineSpan[] => {
    const [block] = parseMarkdown(md);
    return block!.spans;
  };

  it('parses: the text stays, every span of a line shares its look; unknown attributes are dropped', () => {
    const spans = spansOf('前:sideline[傍*線*]{style="double" pos="over"}後:sideline[次]{style="zigzag" pos="left"}');
    expect(spans.map((s) => s.text).join('')).toBe('前傍線後次');
    const first = spans.filter((s) => s.text === '傍' || s.text === '線');
    expect(first).toHaveLength(2);
    expect(first[0]!.sideline).toEqual({ id: 1, style: 'double', position: 'over' });
    expect(first[1]!.sideline).toBe(first[0]!.sideline);
    expect(first[1]!.italic).toBe(true);
    expect(spans.find((s) => s.text === '次')!.sideline).toEqual({ id: 2 });
    expect(stripAnnotations('前:sideline[傍線]{style="wavy"}後')).toBe('前傍線後');
    // A heading set plain loses the line.
    expect(plainSpans(spans).some((s) => s.sideline)).toBe(false);
  });

  it('maps the source around its markup', () => {
    // The `s` after the attributes maps to itself, never into them.
    const md = '前 :sideline[傍線 s]{style="dotted" pos="over"} s後';
    const [p] = parseMarkdown(md);
    expect(p!.text).toBe('前 傍線 s s後');
    for (let i = 0; i < p!.text.length; i++) expect(md[p!.sourceMap[i]!]).toBe(p!.text[i]);
    expect(p!.sourceMap[p!.text.lastIndexOf(' s')]).toBe(md.lastIndexOf(' s'));
  });

  it('a solid line under horizontal text, right of vertical text, along every character', () => {
    const md = 'これは:sideline[大切、なこと。]です';
    const [h] = marksOf(md);
    // From 大 (60) to 。 (200): punctuation is not skipped.
    expect(h).toMatchObject({ kind: 'line', x: 60 });
    expect(h!.length).toBeCloseTo(140, 9);
    expect(h!.y).toBeCloseTo(AXIS + EM / 2 + 0.08 * EM, 9);
    expect(h!.thickness).toBeCloseTo(0.05 * EM, 9);
    const [v] = marksOf(md, config('ja', {}, vertical));
    expect(v!.kind).toBe('line');
    expect(v!.y).toBeCloseTo(AXIS - EM / 2 - 0.08 * EM, 9);
    // pos="under" puts it left of vertical text.
    const [left] = marksOf(':sideline[大切]{pos="under"}', config('ja', {}, vertical));
    expect(left!.y).toBeCloseTo(AXIS + EM / 2 + 0.08 * EM, 9);
  });

  it('double, wavy and dotted lines', () => {
    const [double] = marksOf(':sideline[大切な]{style="double"}');
    expect(double).toMatchObject({ kind: 'double', x: 0, length: 60 });
    expect(double!.gap).toBeCloseTo(0.08 * EM, 9);
    // The inner rule where a solid line would be.
    expect(double!.y - double!.gap! / 2).toBeCloseTo(AXIS + EM / 2 + 0.08 * EM, 9);
    const [wavy] = marksOf(':sideline[大切な]{style="wavy"}');
    expect(wavy).toMatchObject({ kind: 'wavy', x: 0, length: 60 });
    const [dotted] = marksOf(':sideline[大切な]{style="dotted"}');
    expect(dotted).toMatchObject({ kind: 'dotted', x: 0, length: 60 });
    // Dots from end to end, at a pitch that comes out even.
    const span = 60 - dotted!.size!;
    expect(span / dotted!.gap!).toBeCloseTo(Math.round(span / dotted!.gap!), 9);
  });

  it('two lines side by side are two runs an eighth of an em short at the meeting', () => {
    const [a, b] = marksOf(':sideline[大切]:sideline[なこと]');
    expect(a!.x + a!.length!).toBeCloseTo(40 - EM / 8, 9);
    expect(b!.x).toBeCloseTo(40 + EM / 8, 9);
  });

  it('runs on across a line break as one mark a line', () => {
    const md = `${'あ'.repeat(18)}:sideline[いろはにほ]`;
    const ls = lines(buildDocument({ markdown: md }, config()));
    expect(ls).toHaveLength(2);
    expect(ls.map((l) => (l.marks ?? []).map((m) => m.kind))).toEqual([['line'], ['line']]);
  });

  it('works in any script: a Latin phrase and its word spaces', () => {
    const doc = buildDocument({ markdown: 'Read :sideline[the whole thing] now.' }, config('en'));
    const line = lines(doc)[0]!;
    const marks = line.marks!;
    expect(marks).toHaveLength(1);
    // Under the text by default; one run across the spaces.
    expect(marks[0]!.kind).toBe('line');
    const marked = line.segments!.filter((s) => s.cjkMarks?.sideline);
    expect(marked.map((s) => s.text).join(' ')).toBe('the whole thing');
    // From the start of “the” to the end of “thing”.
    const start = marked[0]!;
    const end = marked[marked.length - 1]!;
    const xOf = (seg: VDTLineSegment) => {
      let x = 0;
      for (const s of line.segments!) {
        if (s === seg) return x;
        x += s.width;
      }
      return NaN;
    };
    expect(marks[0]!.x).toBeCloseTo(xOf(start), 6);
    expect(marks[0]!.x + marks[0]!.length!).toBeCloseTo(xOf(end) + end.width, 6);
  });

  it('a line under a whole book title runs on under its 『』', () => {
    const [line] = marksOf('漱石:sideline[:book[こころ]]を');
    // 漱石 (0–40), 『こころ』 (40–140) — the brackets are half an em each
    // once compressed or full: the line starts at 『 either way.
    expect(line!.x).toBeCloseTo(40, 9);
    const doc = buildDocument({ markdown: '漱石:sideline[:book[こころ]]を' }, config());
    const segs = lines(doc)[0]!.segments!;
    const close = segs.find((s) => s.text === '』')!;
    let x = 0;
    for (const s of segs) {
      if (s === close) break;
      x += s.width;
    }
    expect(line!.x + line!.length!).toBeGreaterThan(x);
    // A line on part of the title leaves the brackets alone.
    const [part] = marksOf('漱石:book[:sideline[こ]ころ]を');
    expect(part!.length).toBeLessThanOrEqual(EM + 1e-9);
  });

  it('dots on the side of a line move out past it', () => {
    const [line, ...dots] = marksOf(':dots[:sideline[大切]{pos="over"}]');
    expect(line!.kind).toBe('line');
    expect(dots.map((d) => d.kind)).toEqual(['sesame', 'sesame']);
    for (const d of dots) expect(d.y + d.size! / 2).toBeLessThan(line!.y - line!.thickness / 2);
    // Dots on the other side keep their place.
    const [, ...under] = marksOf(':dots[:sideline[大切]{pos="under"}]');
    expect(under[0]!.y).toBeCloseTo(AXIS - EM / 2 - 0.06 * EM - 0.3 * EM / 2, 9);
  });

  it('counts in the line-gap check: a line on each side needs five eighths of an em', () => {
    const tight = config('ja', {}, { bodyText: { fontSize: pt(EM), lineHeight: pt(31), hyphenation: { enabled: false } } });
    const doc = buildDocument({ markdown: ':sideline[大切]{pos="under"}:dots[なこと]' }, tight);
    expect(doc.contentWarnings!.find((w) => w.kind === 'cjkMarksExceedLeading')).toMatchObject({ neededEm: 0.625 });
  });

  it('is measured again when it is toggled (cache key)', () => {
    const cache = createMeasurementCache();
    expect(lines(buildDocument({ markdown: '大切なこと' }, config(), cache))[0]!.marks).toBeUndefined();
    expect(lines(buildDocument({ markdown: ':sideline[大切なこと]' }, config(), cache))[0]!.marks!.map((m) => m.kind)).toEqual(['line']);
    expect(lines(buildDocument({ markdown: ':sideline[大切なこと]{style="wavy"}' }, config(), cache))[0]!.marks!.map((m) => m.kind)).toEqual(['wavy']);
  });

  it('table cells and captions set the text plain', () => {
    const plain = segments(buildDocument({ markdown: '本文' }, config()));
    expect(plain.some((s) => s.cjkMarks)).toBe(false);
    const spans = withBookBrackets([{ text: 'こころ', bold: false, italic: false, bookTitle: { id: 1, depth: 1 }, sideline: { id: 2 } }], defaultCjkBookTitleBrackets('japan'));
    expect(spans.map((s) => [s.text, s.sideline?.id])).toEqual([['『', 2], ['こころ', 2], ['』', 2]]);
  });
});
