import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas } from '../../index';
import { renderToHtml } from '../../html-backend';
import { parseMarkdown } from '../../parse';
import { defaultCjkRubyAlign, defaultCjkRubyOverhang, resolveCjkConfig, stripCjkDefaults } from '../../defaults/cjk';
import { layoutJisRuby, layoutJukugo, overhangs, fullSizeKana } from '../../measure/rubyJis';
import { createMeasurementCache } from '../../measure';
import type { InlineSpan } from '../../parse';
import type { CjkRegion, PostextConfig } from '../../types';
import type { VDTBlock, VDTDocument, VDTLine, VDTLineSegment } from '../../vdt';
import { installSizedStub, stubCharWidth } from '../vertical/stub';

// Furigana (#422): jukugo ruby, kana-aware overhang, JIS 1:2:1 alignment,
// full-size small kana and the VDT ruby id. The stub measures kana and
// kanji 1 em, Latin letters ½ em: with 20 px text and the default
// half-size reading, a base character is 20 px and a reading character
// 10 px (one ruby em).
installSizedStub();

const pt = (value: number) => ({ value, unit: 'pt' as const });
const EM = 20;
const R = 10;
/** 72 dpi, 20 px text on a 40 px line (room for the readings), a measure
 *  of `chars` characters, set flush left so boxes keep their widths. */
const config = (locale = 'ja', cjk: PostextConfig['cjk'] = {}, chars = 20, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  locale,
  page: { width: pt(chars * EM + 40), height: pt(800), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(EM), lineHeight: pt(40), textAlign: 'left', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  cjk,
  ...extra,
});
const vertical = { layout: { layoutType: 'single' as const, writingMode: 'vertical-rl' as const } };
const justified = (cfg: PostextConfig): PostextConfig => ({ ...cfg, bodyText: { ...cfg.bodyText!, textAlign: 'justify' } });

const paragraphs = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'paragraph');
const lines = (doc: VDTDocument): VDTLine[] => paragraphs(doc).flatMap((b) => b.lines);
const segments = (doc: VDTDocument): VDTLineSegment[] => lines(doc).flatMap((l) => l.segments ?? []);
const build = (md: string, cfg: PostextConfig = config()): VDTDocument => buildDocument({ markdown: md }, cfg);
/** The ruby segments of a paragraph. */
const rubies = (md: string, cfg: PostextConfig = config()): VDTLineSegment[] => segments(build(md, cfg)).filter((s) => s.ruby);
/** Where a segment starts on its line. */
function segmentX(line: VDTLine, seg: VDTLineSegment): number {
  let x = 0;
  for (const s of line.segments!) {
    if (s === seg) return x;
    x += s.width;
  }
  throw new Error('not on the line');
}
/** The reading's runs as [text, dx]. */
const runs = (s: VDTLineSegment): [string, number][] => s.ruby!.runs.map((r) => [r.text, Math.round(r.dx * 1000) / 1000]);
const rubySpans = (md: string): InlineSpan[] => {
  const [block] = parseMarkdown(md);
  return (block as { spans: InlineSpan[] }).spans.filter((s) => s.ruby);
};

describe('cjk.ruby config', () => {
  it('auto: kana overhang and JIS alignment in Japan, the clreq rules (absent) elsewhere', () => {
    expect(defaultCjkRubyOverhang('japan')).toBe('kana');
    expect(defaultCjkRubyAlign('japan')).toBe('jis');
    for (const region of ['mainland', 'taiwan', 'hongkong'] as CjkRegion[]) {
      expect(defaultCjkRubyOverhang(region)).toBeUndefined();
      expect(defaultCjkRubyAlign(region)).toBeUndefined();
    }
    const ja = resolveCjkConfig(undefined, 'ja').ruby;
    expect(ja).toMatchObject({ overhang: 'kana', align: 'jis' });
    expect(ja.smallKana).toBeUndefined();
    // A Chinese document's resolved ruby config is what it was.
    expect(resolveCjkConfig(undefined, 'zh-Hans').ruby).toEqual({ fontSize: { value: 0.5, unit: 'em' }, position: 'auto' });
    expect(resolveCjkConfig(undefined, 'en').ruby).toEqual({ fontSize: { value: 0.5, unit: 'em' }, position: 'auto' });
  });

  it('keeps what the author sets, in any document; unknown values fall back', () => {
    expect(resolveCjkConfig({ ruby: { overhang: 'none', align: 'center', smallKana: 'full' } }, 'ja').ruby)
      .toMatchObject({ overhang: 'none', align: 'center', smallKana: 'full' });
    expect(resolveCjkConfig({ ruby: { overhang: 'any', align: 'start' } }, 'zh-Hans').ruby).toMatchObject({ overhang: 'any', align: 'start' });
    expect(resolveCjkConfig({ ruby: { overhang: 'x' as never, align: 'y' as never } }, 'ja').ruby).toMatchObject({ overhang: 'kana', align: 'jis' });
    expect(resolveCjkConfig({ ruby: { overhang: 'auto', align: 'auto', smallKana: 'keep' } }, 'zh-Hant').ruby.overhang).toBeUndefined();
  });

  it('strips the defaults', () => {
    expect(stripCjkDefaults({ ruby: { overhang: 'auto', align: 'auto', smallKana: 'keep' } })).toBeUndefined();
    expect(stripCjkDefaults({ ruby: { overhang: 'none', align: 'jis', smallKana: 'full' } })).toEqual({ ruby: { overhang: 'none', align: 'jis', smallKana: 'full' } });
  });
});

describe(':ruby mode and align', () => {
  it('mode=jukugo, mode=mono and align are read; mode=group and the group flag make one reading', () => {
    const j = rubySpans(':ruby[東京]{rt="とう きょう" mode=jukugo align=start}');
    expect(j.map((s) => [s.text, s.ruby!.text, s.ruby!.jukugo, s.ruby!.align])).toEqual([['東', 'とう', true, 'start'], ['京', 'きょう', true, 'start']]);
    const m = rubySpans('{東京|とう|きょう}').concat(rubySpans(':ruby[東京]{rt="とう きょう" mode=mono}'));
    expect(m.map((s) => [s.ruby!.jukugo, s.ruby!.mono])).toEqual([[undefined, undefined], [undefined, undefined], [undefined, true], [undefined, true]]);
    for (const md of [':ruby[東京]{rt="とう きょう" mode=group}', ':ruby[東京]{rt="とう きょう" group}']) {
      expect(rubySpans(md).map((s) => [s.text, s.ruby!.text, s.ruby!.group])).toEqual([['東京', 'とう きょう', true]]);
    }
    // Readings that do not pair with the base: a group ruby, whatever the mode.
    expect(rubySpans(':ruby[東京]{rt="とうきょう" mode=jukugo}').map((s) => [s.ruby!.group, s.ruby!.jukugo])).toEqual([[true, undefined]]);
    // Kana readings split on bars in `rt` are attributes, not a compact ruby.
    expect(rubySpans(':ruby[東京]{rt="とう|きょう" mode=mono}を').map((s) => [s.text, s.ruby!.text, s.ruby!.mono])).toEqual([['東', 'とう', true], ['京', 'きょう', true]]);
    // Unknown values are dropped.
    expect(rubySpans(':ruby[東]{rt="ひがし" align=middle mode=x}')[0]!.ruby).toEqual({ text: 'ひがし', id: 1 });
  });

  it('{漢字|かん|じ} is a jukugo ruby in a Japanese document, mono for Chinese; one reading stays a group ruby', () => {
    const ja = rubies('{漢字|かん|じ}');
    expect(ja.map((s) => [s.text, s.ruby!.text, s.ruby!.jukugo])).toEqual([['漢', 'かん', true], ['字', 'じ', true]]);
    const zh = rubies('{漢字|hàn|zì}', config('zh-Hans'));
    expect(zh.map((s) => [s.ruby!.jukugo, s.ruby!.id])).toEqual([[undefined, undefined], [undefined, undefined]]);
    // The Aozora form (one reading over the base) is group ruby.
    const group = rubies('{麦藁帽|むぎわらぼう}');
    expect(group.map((s) => [s.text, s.ruby!.group, s.ruby!.jukugo])).toEqual([['麦藁帽', true, undefined]]);
    // mode=mono keeps the characters apart in Japanese too.
    expect(rubies(':ruby[漢字]{rt="かん じ" mode=mono}').map((s) => s.ruby!.jukugo)).toEqual([undefined, undefined]);
    // One character: mono.
    expect(rubies('{漢|かん}')[0]!.ruby!.jukugo).toBeUndefined();
  });
});

describe('VDT ruby id', () => {
  it('Japanese readings name their annotation; Chinese ones are unchanged', () => {
    const ja = rubies('{漢字|かん|じ}と{麦藁帽|むぎわらぼう}');
    expect(ja.map((s) => s.ruby!.id)).toEqual([1, 1, 2]);
    expect(ja.map((s) => s.ruby!.jukugo)).toEqual([true, true, undefined]);
    for (const seg of rubies('{紅樓|hóng|lóu}夢，:ruby[石頭記]{rt="shí tou jì" group}', config('zh-Hans'))) {
      expect('id' in seg.ruby!).toBe(false);
      expect('jukugo' in seg.ruby!).toBe(false);
    }
  });

  it('a written mode or align opts a Chinese ruby in', () => {
    const [seg] = rubies(':ruby[紅]{rt="hóng" align=start}', config('zh-Hans'));
    expect(seg!.ruby!.id).toBe(1);
  });
});

describe('a reading shorter than its base', () => {
  it('jis spreads it 1:2:1, or from end to end when the half unit passes a ruby character', () => {
    // 3 kanji (60 px), 2 kana (20 px): units of 20 px, 10 px at each end.
    const [a] = rubies('{麦藁帽|むぎ}');
    expect(a!.width).toBe(60);
    expect(runs(a!)).toEqual([['む', 10], ['ぎ', 40]]);
    // 4 kanji (80 px), 2 kana: 15 px ends would pass 10 px: space-between.
    const [b] = rubies('{麦藁帽子|むぎ}');
    expect(runs(b!)).toEqual([['む', 0], ['ぎ', 70]]);
    // One character is centred.
    const [c] = rubies('{日|ひ}');
    expect(runs(c!)).toEqual([['ひ', 5]]);
    // As long as its base: solid.
    expect(runs(rubies('{日本|にっぽん}')[0]!)).toEqual([['にっぽん', 0]]);
  });

  it('center and start', () => {
    expect(runs(rubies(':ruby[麦藁帽]{rt="むぎ" align=center}')[0]!)).toEqual([['むぎ', 20]]);
    expect(runs(rubies(':ruby[麦藁帽]{rt="むぎ" align=start}')[0]!)).toEqual([['むぎ', 0]]);
    expect(runs(rubies('{麦藁帽|むぎ}', config('ja', { ruby: { align: 'center' } }))[0]!)).toEqual([['むぎ', 20]]);
  });

  it('a base at a line edge stays flush with it', () => {
    // Five characters a line: 麦藁帽 opens the second.
    const doc = build('あいうえお{麦藁帽|むぎ}か', config('ja', {}, 5));
    const line = lines(doc)[1]!;
    expect(line.segments![0]!.ruby).toBeDefined();
    expect(line.segments![0]!.inkOffset ?? 0).toBe(0);
    expect(runs(line.segments![0]!)).toEqual([['む', 10], ['ぎ', 40]]);
  });
});

describe('a reading longer than its base: overhang', () => {
  it('runs onto kana on both sides, up to a ruby character each', () => {
    // かんじ: 30 px over 20 px, 5 px onto each kana.
    const [s] = rubies('あ{漢|かんじ}い');
    expect(s!.width).toBe(20);
    expect(s!.inkOffset ?? 0).toBe(0);
    expect(runs(s!)).toEqual([['かんじ', -5]]);
    // Four kana (40 px): a ruby character onto each.
    const [f] = rubies('あ{漢|かんじょ}い');
    expect(f!.width).toBe(20);
    expect(runs(f!)).toEqual([['かんじょ', -10]]);
    // Five (50 px): the base spreads by what is left, centred in its box.
    const [g] = rubies('あ{漢|かんじょう}い');
    expect(g!.width).toBe(30);
    expect(g!.inkOffset).toBe(5);
    expect(runs(g!)).toEqual([['かんじょう', -10]]);
  });

  it('never onto kanji: the base spreads; one kana neighbour takes it all', () => {
    const [k] = rubies('日{漢|かんじ}本');
    expect(k!.width).toBe(30);
    expect(k!.inkOffset).toBe(5);
    expect(runs(k!)).toEqual([['かんじ', 0]]);
    // Kanji before, kana after: the reading starts at the base and runs a
    // ruby character onto い.
    const [h] = rubies('日{漢|かんじ}い');
    expect(h!.width).toBe(20);
    expect(runs(h!)).toEqual([['かんじ', 0]]);
    // ー and katakana count as kana; Latin text does not.
    expect(rubies('ー{漢|かんじ}カ')[0]!.width).toBe(20);
    expect(rubies('A{漢|かんじ}B')[0]!.width).toBe(30);
  });

  it('half a ruby character onto an opening bracket; the blank of a mark before it', () => {
    // 「 after: 5 px; kanji before: 0. The base spreads by 5.
    const [o] = rubies('日{漢|かんじ}「あ」');
    expect(o!.width).toBe(25);
    expect(runs(o!)).toEqual([['かんじ', 0]]);
    // 」 before the base: its half em of blank after the glyph (a ruby
    // character); kanji after.
    const [c] = rubies('あ」{漢|かんじ}日');
    expect(c!.width).toBe(20);
    expect(runs(c!)).toEqual([['かんじ', -10]]);
    // 、 after the base: its glyph faces the reading, nothing.
    expect(rubies('日{漢|かんじ}、日')[0]!.width).toBe(30);
  });

  it('two readings never share a kana from both sides: the later one keeps to its base', () => {
    const [a, b] = rubies('{漢|かんじ}の{字|かんじ}');
    // The first runs a ruby character onto の (nothing at the paragraph's
    // start); the second gets none and spreads.
    expect(a!.width).toBe(20);
    expect(runs(a!)).toEqual([['かんじ', 0]]);
    expect(b!.width).toBe(30);
    expect(runs(b!)).toEqual([['かんじ', 0]]);
  });

  it('overhang none and any', () => {
    expect(rubies('あ{漢|かんじ}い', config('ja', { ruby: { overhang: 'none' } }))[0]!.width).toBe(30);
    const [any] = rubies('日{漢|かんじ}本', config('ja', { ruby: { overhang: 'any' } }));
    expect(any!.width).toBe(20);
    expect(runs(any!)).toEqual([['かんじ', -5]]);
  });

  it('a group base spreads 1:2:1 under jis, centred under center', () => {
    // 2 kanji (40 px), 6 kana (60 px) between kanji: 20 px to spread, a
    // unit of 10 px after each character, half of one before the first.
    const [s] = rubies('日{紅茶|こうちゃかな}本');
    expect(s!.width).toBe(60);
    expect(s!.tracking).toBe(10);
    expect(s!.inkOffset).toBe(5);
    expect(runs(s!)).toEqual([['こうちゃかな', 0]]);
    const [c] = rubies('日:ruby[紅茶]{rt="こうちゃかな" align=center}本');
    expect(c!.width).toBe(60);
    expect(c!.tracking).toBeUndefined();
    expect(c!.inkOffset).toBe(10);
  });
});

describe('at a line edge', () => {
  it('a longer reading opening a line is flush with its start and runs onto the kana after it', () => {
    // 漢 between お and い, at the start of the second line.
    const doc = build('あいうえお{漢|かんじ}いう', config('ja', {}, 5));
    const seg = lines(doc)[1]!.segments![0]!;
    expect(seg.ruby).toBeDefined();
    expect(seg.width).toBe(20);
    expect(runs(seg)).toEqual([['かんじ', 0]]);
  });

  it('closing a line: flush with its end; between kanji the base goes down when the spread would not fit', () => {
    const fits = build('あいうえ{漢|かんじ}いう', config('ja', {}, 5));
    const line = lines(fits)[0]!;
    expect(line.text).toBe('あいうえ漢');
    const seg = line.segments!.find((s) => s.ruby)!;
    expect(segmentX(line, seg) + seg.ruby!.runs[0]!.dx + 30).toBeCloseTo(100, 9);
    // 日 before the base: at the end of the line the reading would need
    // the base spread to 30 px; the line of 5 characters has no room.
    const down = build('あいう日{漢|かんじ}いう', config('ja', {}, 5));
    expect(lines(down).map((l) => l.text)).toEqual(['あいう日', '漢いう']);
  });

  it('a reading never passes the line', () => {
    // The base opening the second line, then closing the first.
    for (const md of ['あいうえお{漢|かんじょう}いうえおか', 'かきく{漢|かんじょう}あいうえお']) {
      const doc = build(md, justified(config('ja', {}, 5)));
      for (const line of lines(doc)) {
        const width = line.segments!.reduce((w, s) => w + s.width, 0);
        for (const seg of line.segments!.filter((s) => s.ruby)) {
          const x = segmentX(line, seg);
          for (const r of seg.ruby!.runs) {
            expect(x + r.dx).toBeGreaterThanOrEqual(-1e-9);
            expect(x + r.dx + r.text.length * R).toBeLessThanOrEqual(width + 1e-9);
          }
        }
        expect(width).toBeLessThanOrEqual(100 + 1e-9);
      }
    }
  });
});

describe('jukugo ruby', () => {
  it('readings that fit their bases are set as mono ruby', () => {
    const [ni, hon] = rubies('日{日本|に|ほん}日');
    expect([ni!.width, hon!.width]).toEqual([20, 20]);
    expect(runs(ni!)).toEqual([['に', 5]]);
    expect(runs(hon!)).toEqual([['ほん', 0]]);
  });

  it('a reading runs onto the next base of the word, and past it onto kana', () => {
    // きょう (30 px) over 京 runs 10 px onto the の after the word.
    const [to, kyo] = rubies('日{東京|とう|きょう}の');
    expect([to!.width, kyo!.width]).toEqual([20, 20]);
    expect(runs(to!)).toEqual([['とう', 0]]);
    expect(runs(kyo!)).toEqual([['きょう', 0]]);
    // ぎょう (30 px) over 行 and ざ over 座: ぎょう moves onto 座 by half a
    // ruby character, ざ after it.
    const [gyo, za] = rubies('日{行座|ぎょう|ざ}日');
    expect(runs(gyo!)).toEqual([['ぎょう', 0]]);
    expect(runs(za!)).toEqual([['ざ', 10]]);
    expect([gyo!.width, za!.width]).toEqual([20, 20]);
    // Three bases: the long middle reading between two short ones.
    const three = rubies('日{一二三|い|ろはに|ほ}日');
    expect(three.map((s) => s.width)).toEqual([20, 20, 20]);
    expect(three.map(runs)).toEqual([[['い', 5]], [['ろはに', -5]], [['ほ', 5]]]);
  });

  it('when the readings do not fit, the word shares them as a group ruby, spread 1:2:1', () => {
    // とうきょう (50 px) over 東京 (40 px) between kanji.
    const [to, kyo] = rubies('日{東京|とう|きょう}日');
    expect([to!.width, kyo!.width]).toEqual([25, 25]);
    expect([to!.inkOffset, kyo!.inkOffset]).toEqual([2.5, 2.5]);
    expect(runs(to!)).toEqual([['とう', 0]]);
    expect(runs(kyo!)).toEqual([['きょう', -5]]);
    // Each segment keeps its own reading, and the word's id.
    expect([to!.ruby!.text, kyo!.ruby!.text]).toEqual(['とう', 'きょう']);
    expect([to!.ruby!.id, kyo!.ruby!.id]).toEqual([1, 1]);
  });

  it('breaks between its characters, each part laid out again with its readings', () => {
    // Six characters a line: あいうえ東 | 京日. 京 opens the second line:
    // its reading flush with the line's start, the base spread after it.
    const doc = build('あいうえ{東京|とう|きょう}日', config('ja', {}, 6));
    const all = lines(doc);
    expect(all.map((l) => l.text)).toEqual(['あいうえ東', '京日']);
    const to = all[0]!.segments!.find((s) => s.ruby)!;
    expect(to.width).toBe(20);
    expect(runs(to)).toEqual([['とう', 0]]);
    const kyo = all[1]!.segments![0]!;
    expect(kyo.ruby!.text).toBe('きょう');
    expect(kyo.width).toBe(30);
    expect(kyo.inkOffset).toBe(5);
    expect(runs(kyo)).toEqual([['きょう', 0]]);
    expect([to.ruby!.id, kyo.ruby!.id]).toEqual([1, 1]);
    expect([to.ruby!.jukugo, kyo.ruby!.jukugo]).toEqual([true, true]);
  });

  it('kinsoku still applies: a closing mark stays with the word’s last character', () => {
    const doc = build('あいう「{東京|とう|きょう}」の', config('ja', {}, 6));
    for (const l of lines(doc)) expect(l.text.startsWith('」')).toBe(false);
  });

  it('a justified line never spreads inside the word', () => {
    const doc = build('あいう{東京|とう|きょう}のかきくけこさしすせそたちつてと', justified(config('ja', {}, 9.5)));
    const first = lines(doc)[0]!;
    const to = first.segments!.find((s) => s.ruby?.text === 'とう')!;
    expect(to.tracking ?? 0).toBe(0);
    expect(first.segments!.some((s) => (s.tracking ?? 0) > 0)).toBe(true);
  });

  it('a group ruby never breaks', () => {
    const doc = build('あいうえ{麦藁帽|むぎわらぼう}か', config('ja', {}, 6));
    expect(lines(doc).map((l) => l.text)).toEqual(['あいうえ', '麦藁帽か']);
  });
});

describe('small kana', () => {
  it('keep paints them as written; full paints them full size, the text read keeping them', () => {
    expect(runs(rubies('日{学校|がっこう}日')[0]!)[0]![0]).toBe('がっこう');
    const [full] = rubies('日{学校|がっこう}日', config('ja', { ruby: { smallKana: 'full' } }));
    expect(full!.ruby!.text).toBe('がっこう');
    expect(full!.ruby!.runs.map((r) => r.text).join('')).toBe('がつこう');
    expect(fullSizeKana('ちょっとキャッシュㇰｬ')).toBe('ちよつとキヤツシユクﾔ');
  });
});

describe('vertical text', () => {
  /** Down a column of `chars` characters. */
  const vcfg = (cjk: PostextConfig['cjk'] = {}, chars = 20): PostextConfig => {
    const c = config('ja', cjk, 20, vertical);
    return { ...c, page: { ...c.page!, height: pt(chars * EM + 40) } };
  };

  it('the same geometry down the line, the reading right of the column', () => {
    const [a] = rubies('{麦藁帽|むぎ}', vcfg());
    expect(runs(a!)).toEqual([['む', 10], ['ぎ', 40]]);
    expect(a!.ruby!.position).toBe('over');
    expect(a!.ruby!.runs[0]!.dy).toBeLessThan(-0.88 * EM);
    const [k] = rubies('あ{漢|かんじ}い', vcfg());
    expect(k!.width).toBe(20);
    expect(runs(k!)).toEqual([['かんじ', -5]]);
    const [to, kyo] = rubies('日{東京|とう|きょう}日', vcfg());
    expect([to!.width, kyo!.width]).toEqual([25, 25]);
    expect(runs(kyo!)).toEqual([['きょう', -5]]);
  });

  it('a jukugo word breaks down the column as across it', () => {
    const doc = build('あいうえ{東京|とう|きょう}日', vcfg({}, 6));
    expect(lines(doc).map((l) => l.text)).toEqual(['あいうえ東', '京日']);
    const kyo = lines(doc)[1]!.segments![0]!;
    expect(kyo.width).toBe(30);
    expect(runs(kyo)).toEqual([['きょう', 0]]);
  });
});

describe('Chinese rubies are unchanged', () => {
  it('the clreq quarter em, centred readings, no ids', () => {
    const roomy = { bodyText: { fontSize: pt(20), lineHeight: pt(40), textAlign: 'justify' as const, firstLineIndent: pt(0), hyphenation: { enabled: false } } };
    const seg = rubies('此{莊|zhuāng}也', { ...config('zh-Hans'), ...roomy })[0]!;
    expect(seg.width - (seg.tracking ?? 0)).toBeCloseTo(25, 9);
    expect(seg.ruby!.runs[0]!.dx).toBeCloseTo(-2.5, 9);
    expect(seg.ruby!.id).toBeUndefined();
  });

  it('a Japanese ruby is measured apart from the same Chinese one (cache key)', () => {
    const cache = createMeasurementCache();
    const zh = buildDocument({ markdown: '日{漢|かんじ}本' }, config('zh-Hans'), cache);
    const ja = buildDocument({ markdown: '日{漢|かんじ}本' }, config('ja'), cache);
    expect(segments(zh).find((s) => s.ruby)!.width).toBe(25);
    expect(segments(ja).find((s) => s.ruby)!.width).toBe(30);
  });
});

describe('geometry functions', () => {
  const base = (width: number, graphemes: number, reading: string) => ({ width, graphemes, reading: [...reading].map((t) => ({ text: t, width: R })) });

  it('overhangs: evenly, then the side that takes more; start only after', () => {
    expect(overhangs(10, { start: 10, end: 10 }, 'jis')).toEqual({ start: 5, end: 5 });
    expect(overhangs(10, { start: 0, end: 10 }, 'jis')).toEqual({ start: 0, end: 10 });
    expect(overhangs(10, { start: 2, end: 10 }, 'center')).toEqual({ start: 2, end: 8 });
    expect(overhangs(30, { start: 10, end: 10 }, 'jis')).toEqual({ start: 10, end: 10 });
    expect(overhangs(10, { start: 10, end: 10 }, 'start')).toEqual({ start: 0, end: 10 });
  });

  it('layoutJisRuby and layoutJukugo', () => {
    const spread = layoutJisRuby(base(40, 2, 'かんじ'), 'jis', R, { start: 0, end: 0 });
    expect([spread.width, spread.inset, spread.tracking]).toEqual([40, 0, 0]);
    expect(spread.pieces.map((p) => p.text)).toEqual(['か', 'ん', 'じ']);
    spread.pieces.forEach((p, i) => expect(p.dx).toBeCloseTo(5 / 3 + i * (10 + 10 / 3), 9));
    const boxes = layoutJukugo([base(20, 1, 'とう'), base(20, 1, 'きょう')], 'jis', R, { start: 0, end: 0 });
    expect(boxes.map((b) => b.width)).toEqual([25, 25]);
    expect(boxes.reduce((w, b) => w + b.width, 0)).toBe(50);
  });
});

describe('renderers paint the geometry', () => {
  interface Call { op: string; args: unknown[]; font: string; spacing: string }
  function recordingCanvas(): { canvas: HTMLCanvasElement; calls: Call[] } {
    const calls: Call[] = [];
    const target: Record<string | symbol, unknown> = { letterSpacing: '0px', font: '10px Test', fillStyle: '#000', textAlign: 'left', textBaseline: 'alphabetic' };
    const stack: Record<string | symbol, unknown>[] = [];
    const ctx = new Proxy(target, {
      get(t, key) {
        if (key === 'save') return () => { stack.push({ ...t }); };
        if (key === 'restore') return () => { Object.assign(t, stack.pop() ?? {}); };
        if (key === 'measureText') {
          return (s: string) => {
            const em = Number(/(\d*\.?\d+)px/.exec(String(t.font))?.[1] ?? 10);
            let w = 0;
            for (const ch of s) w += stubCharWidth(ch, em);
            return { width: w };
          };
        }
        if (key in t) return t[key];
        return (...args: unknown[]) => { calls.push({ op: String(key), args, font: String(t.font), spacing: String(t.letterSpacing) }); };
      },
      set(t, key, value) { t[key] = value; return true; },
    });
    return { canvas: { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement, calls };
  }
  const MD = '日{紅茶|こうちゃかな}本の{麦藁帽|むぎ}';

  it('canvas: a spread base with its tracking from its inset, the reading solid; a short reading 1:2:1', () => {
    const doc = build(MD);
    const { canvas, calls } = recordingCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    const texts = calls.filter((c) => c.op === 'fillText');
    // 20 px margin, 日, then the box of 紅茶: the base 5 px in, 10 px after
    // each character.
    const base = texts.find((c) => c.args[0] === '紅茶')!;
    expect(Number(base.args[1])).toBe(45);
    expect(base.spacing).toBe('10px');
    expect(Number(texts.find((c) => c.args[0] === 'こうちゃかな')!.args[1])).toBe(40);
    // 麦藁帽 starts at 20 + 20 + 60 + 20 + 20 = 140: む at 150, ぎ at 180.
    expect(Number(texts.find((c) => c.args[0] === 'む')!.args[1])).toBe(150);
    expect(Number(texts.find((c) => c.args[0] === 'ぎ')!.args[1])).toBe(180);
  });

  it('HTML: the same boxes', () => {
    const html = renderToHtml(build(MD));
    expect(html).toContain('<span style="position:absolute;left:25.000px;top:0;white-space:pre;letter-spacing:10px;">紅茶</span>');
    expect(html).toMatch(/left:20\.000px;top:-[\d.]+px;white-space:pre;"><span style="font:[^"]*10px[^"]*">こうちゃかな</);
    expect(html).toMatch(/left:130\.000px;top:-[\d.]+px;white-space:pre;"><span style="font:[^"]*">む</);
    expect(html).toMatch(/left:160\.000px;top:-[\d.]+px;white-space:pre;"><span style="font:[^"]*">ぎ</);
  });
});
