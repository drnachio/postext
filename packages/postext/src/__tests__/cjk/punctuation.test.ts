import { describe, it, expect, afterEach } from 'vitest';
import { measureRichBlock } from '../../measure/rich';
import { measureBlock } from '../../measure/plain';
import { cachedMeasureRichBlock } from '../../measure/cache';
import { createMeasurementCache } from '../../measure/font';
import { cjkCompositionKey, cjkCompositionOf, punctuationAdvance, setCjkComposition, type CjkComposition } from '../../measure/cjkPunctuation';
import { resolveCjkConfig } from '../../defaults/cjk';
import { cjkClassOf } from '../../measure/cjkClasses';
import type { CjkConfig } from '../../types';
import type { InlineSpan } from '../../parse';
import type { MeasureBlockOptions } from '../../measure/types';
import type { VDTLine, VDTLineSegment } from '../../vdt';

// Stub: CJK characters and the marks Chinese sets full width (— … · “ ” ‘ ’)
// are 16 px (one em of the 16 px font), a space 4 px, anything else 8 px.
const FULL = new Set(['—', '…', '·', '“', '”', '‘', '’']);
function charWidth(ch: string): number {
  const cp = ch.codePointAt(0)!;
  if (ch === ' ') return 4;
  return cp >= 0x2e80 || FULL.has(ch) ? 16 : 8;
}
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    let w = 0;
    for (const ch of s) w += charWidth(ch);
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const FONT = '16px Test';
const run = (text: string): InlineSpan => ({ text, bold: false, italic: false });
afterEach(() => setCjkComposition(undefined));

/** The composition a document in `locale` with `cjk` sets text with. */
function comp(cjk: CjkConfig = {}, locale = 'zh-Hans'): CjkComposition {
  return cjkCompositionOf(resolveCjkConfig(cjk, locale), 96);
}

function lines(text: string, width: number, composition: CjkComposition, options: MeasureBlockOptions = {}): VDTLine[] {
  const rich = measureRichBlock([run(text)], FONT, FONT, FONT, FONT, width, 20, { cjkComposition: composition, ...options }).lines;
  // The plain path hands CJK text to the same composer.
  const plain = measureBlock(text, FONT, width, 20, { cjkComposition: composition, ...options }).lines;
  expect(plain.map((l) => l.text)).toEqual(rich.map((l) => l.text));
  return rich;
}

/** Each character of a line with its advance and its segment. */
function advances(line: VDTLine): { ch: string; w: number; seg: VDTLineSegment }[] {
  const out: { ch: string; w: number; seg: VDTLineSegment }[] = [];
  for (const seg of line.segments!) {
    const chars = [...seg.text];
    if (chars.length === 0) continue;
    for (const ch of chars) out.push({ ch, w: seg.width / chars.length, seg });
  }
  return out;
}

/** The advance of the characters `pair` (in order) on a single line. */
function pairWidth(line: VDTLine, pair: string): number {
  const a = advances(line);
  const chars = [...pair];
  for (let i = 0; i + chars.length <= a.length; i++) {
    if (chars.every((c, j) => a[i + j]!.ch === c)) return chars.reduce((s, _, j) => s + a[i + j]!.w, 0);
  }
  throw new Error(`${pair} not on the line ${line.text}`);
}

const lineWidth = (l: VDTLine): number => l.segments!.filter((s) => !s.hangs).reduce((s, seg) => s + seg.width, 0);

// The opening of chapter 1 of 红楼梦, in Simplified characters.
const DIALOGUE = '他说：“你来了吗？”她笑道：“来了。”宝玉听了';
const TITLE = '《红楼梦》（曹雪芹著）';
const HAN = '此开卷第一回也作者自云因曾历过一番梦幻之后故将真事隐去而借通灵之说撰此石头记一书也故曰甄士隐云云但书中所记何事何人自又云今风尘碌碌一事无成';

describe('punctuation widths (clreq §6.3.2)', () => {
  it('sets a pair of marks 1.5 em: Kaiming, and full width with compressAdjacent', () => {
    const wide = 2000;
    const kaiming = lines(DIALOGUE, wide, comp())[0]!;
    expect(pairWidth(kaiming, '？”')).toBe(24);
    expect(pairWidth(kaiming, '。”')).toBe(24);
    const full = lines(DIALOGUE, wide, comp({ punctuationWidth: 'fullwidth', compressAdjacent: true }))[0]!;
    expect(pairWidth(full, '？”')).toBe(24);
    expect(pairWidth(full, '。”')).toBe(24);
    expect(pairWidth(full, '：“')).toBe(24);
    const untouched = lines(DIALOGUE, wide, comp({ punctuationWidth: 'fullwidth', compressAdjacent: false }))[0]!;
    expect(pairWidth(untouched, '？”')).toBe(32);
    expect(pairWidth(untouched, '。”')).toBe(32);
  });

  it('sets a Kaiming stop close to the closing mark after it, the blank after the pair (。”␣, not 。␣”)', () => {
    // Each mark's advance and where its glyph is painted from its box.
    const marks = (line: VDTLine, pair: string): [number, number][] => {
      const a = advances(line);
      const chars = [...pair];
      const i = a.findIndex((_, k) => chars.every((c, j) => a[k + j]?.ch === c));
      expect(i).toBeGreaterThanOrEqual(0);
      return chars.map((_, j) => [a[i + j]!.w, a[i + j]!.seg.inkOffset ?? 0]);
    };
    for (const compressAdjacent of [true, false]) {
      const kaiming = lines(DIALOGUE, 2000, comp({ compressAdjacent }))[0]!;
      // The stop is its glyph alone; the quote takes the stop's half em after its own glyph.
      expect(marks(kaiming, '？”')).toEqual([[8, 0], [16, 0]]);
      expect(marks(kaiming, '。”')).toEqual([[8, 0], [16, 0]]);
      // As full width with compressAdjacent sets them.
      const full = lines(DIALOGUE, 2000, comp({ punctuationWidth: 'fullwidth', compressAdjacent: true }))[0]!;
      expect(marks(full, '。”')).toEqual(marks(kaiming, '。”'));
    }
    // A closing bracket after the quote takes the blank on: 。”）␣.
    const chain = lines('宝玉道：“来了。”）黛玉笑了', 2000, comp())[0]!;
    expect(marks(chain, '。”）')).toEqual([[8, 0], [8, 0], [16, 0]]);
    expect(marks(lines('（改作“偷”。）黛玉', 2000, comp())[0]!, '。）')).toEqual([[8, 0], [16, 0]]);
    // At the end of a line the stop's blank goes, as with a stop alone: 。” take one em.
    for (const trimLineStart of [true, false]) {
      const last = lines(`${HAN.slice(0, 5)}。”`, 2000, comp({ trimLineStart }))[0]!;
      expect(marks(last, '。”')).toEqual([[8, 0], [8, 0]]);
    }
    // A break between the two (lineBreak 'none') gives the stop its blank back: it ends
    // its line half an em, and the quote opens the next one half an em.
    const split = lines(`${HAN.slice(0, 5)}。”${HAN.slice(5, 10)}`, 88, comp(), { cjkLineBreak: 'none' });
    expect(split[0]!.text).toBe(`${HAN.slice(0, 5)}。`);
    expect(pairWidth(split[0]!, '。')).toBe(8);
    expect(split[1]!.text.startsWith('”')).toBe(true);
    expect(pairWidth(split[1]!, '”')).toBe(8);
    // Centred marks (a Taiwan stop under Kaiming) keep their blank where it was.
    const tw = lines('他說：「來了。」寶玉', 2000, comp({ punctuationWidth: 'kaiming' }, 'zh-TW'))[0]!;
    expect(marks(tw, '。」')).toEqual([[16, 0], [8, 0]]);
  });

  it('lets the blank a closing mark took from a Kaiming stop give way last, to take in a comma', () => {
    // As 'pushes a comma in' below, with 。” for 。: 36 characters and the pair (1.5 em)
    // fill a 600 px measure.
    const head = `${HAN.slice(0, 7)}。”${HAN.slice(7, 36)}`;
    expect([...head].length).toBe(38);
    const text = `${head}，${HAN.slice(36, 44)}`;
    const ls = lines(text, 600, comp(), { textAlign: 'justify' });
    expect(ls[0]!.text).toBe(`${head}，`);
    expect(lineWidth(ls[0]!)).toBeCloseTo(600, 6);
    expect(pairWidth(ls[0]!, '。”')).toBe(16);
  });

  it('reduces 》（ to 1.5 em when full width, and to one em under Kaiming', () => {
    const full = lines(TITLE, 2000, comp({ punctuationWidth: 'fullwidth', compressAdjacent: true }))[0]!;
    expect(pairWidth(full, '》（')).toBe(24);
    const kaiming = lines(TITLE, 2000, comp())[0]!;
    expect(pairWidth(kaiming, '》（')).toBe(16);
  });

  it('keeps a sentence mark one em inside a Kaiming line and half at its end', () => {
    // 甲乙丙丁。 fills an 80 px line; the next 戊 does not fit.
    const text = '此开卷第。一回也作者';
    for (const style of ['kaiming', 'lineEndHalf'] as const) {
      const ls = lines(`${HAN.slice(0, 4)}。${HAN.slice(4, 12)}`, 80, comp({ punctuationWidth: style }));
      expect(ls[0]!.text).toBe(`${HAN.slice(0, 4)}。`);
      expect(pairWidth(ls[0]!, '。')).toBe(8);
    }
    const full = lines(`${HAN.slice(0, 4)}。${HAN.slice(4, 12)}`, 80, comp({ punctuationWidth: 'fullwidth' }));
    expect(pairWidth(full[0]!, '。')).toBe(16);
    // Inside a line, Kaiming keeps 。 a full em; the halfwidth style halves it.
    expect(pairWidth(lines(text, 2000, comp())[0]!, '。')).toBe(16);
    expect(pairWidth(lines(text, 2000, comp({ punctuationWidth: 'halfwidth' }))[0]!, '。')).toBe(8);
  });

  it('pushes a comma in before it pushes a character out (37 characters, the 38th a comma)', () => {
    // 37 characters of 16 px fill a 592 px measure; one of them is 。.
    const head = `${HAN.slice(0, 7)}。${HAN.slice(7, 36)}`;
    expect([...head].length).toBe(37);
    const text = `${head}，${HAN.slice(36, 44)}`;
    const kaiming = lines(text, 592, comp(), { textAlign: 'justify' });
    expect(kaiming[0]!.text).toBe(`${head}，`);
    expect(lineWidth(kaiming[0]!)).toBeCloseTo(592, 6);
    // The 。 inside gave up its half em to take the comma in.
    expect(pairWidth(kaiming[0]!, '。')).toBe(8);
    // Full width, with nothing that may give way: the 37th character goes
    // down with the comma.
    const full = lines(text, 592, comp({ punctuationWidth: 'fullwidth', compressAdjacent: false, trimLineStart: false }), { textAlign: 'justify' });
    expect(full[0]!.text).toBe(head.slice(0, -1));
    expect(full[1]!.text.startsWith(`${head.slice(-1)}，`)).toBe(true);
    expect(lineWidth(full[0]!)).toBeCloseTo(592, 6);
  });

  it('shrinks marks to take in a mark that may not open a line, sharing alike', () => {
    // lineEndHalf: 甲乙丙丁戊，己庚辛 fill a 144 px line; the 。 after them
    // (half an em at the line end) may not open the next line, so the comma
    // gives up its half em to take it in.
    const one = `${HAN.slice(0, 5)}，${HAN.slice(5, 8)}。`;
    const ls = lines(one, 144, comp({ punctuationWidth: 'lineEndHalf' }), { textAlign: 'justify' });
    expect(ls[0]!.text).toBe(one);
    expect(pairWidth(ls[0]!, '，')).toBe(8);
    expect(lineWidth(ls[0]!)).toBeCloseTo(144, 6);
    // Two commas share the 8 px the line is short of.
    const two = `${HAN.slice(0, 3)}，${HAN.slice(3, 6)}，${HAN.slice(6, 8)}。`;
    const ls2 = lines(two, 160, comp({ punctuationWidth: 'lineEndHalf' }), { textAlign: 'justify' });
    expect(ls2[0]!.text).toBe(two);
    expect(advances(ls2[0]!).filter((a) => a.ch === '，').map((a) => a.w)).toEqual([12, 12]);
    expect(lineWidth(ls2[0]!)).toBeCloseTo(160, 6);
  });

  it('spreads a line that falls short rather than narrow its marks to take a character that may open the next', () => {
    // 37 units of 36 px short of a character: 35 Han, a mid-line 。 and a
    // Kaiming comma (half an em) make 584 px; the next 甄 (16 px) overflows
    // a 592 px measure by 8 px. It may open a line, so it goes down and the
    // line is spread; the 。 inside keeps its full em (Kaiming).
    const head = `${HAN.slice(0, 7)}。${HAN.slice(7, 20)}，${HAN.slice(20, 35)}`;
    expect([...head].length).toBe(37);
    const text = `${head}${HAN.slice(35, 44)}`;
    for (const style of ['kaiming', 'lineEndHalf'] as const) {
      const ls = lines(text, 592, comp({ punctuationWidth: style }), { textAlign: 'justify' });
      expect(ls[0]!.text).toBe(head);
      const stop = advances(ls[0]!).find((a) => a.ch === '。')!;
      expect(stop.w - (stop.seg.tracking ?? 0)).toBeCloseTo(16, 9);
      expect(lineWidth(ls[0]!)).toBeCloseTo(592, 6);
    }
  });

  it('gives a compressed pair its blank back when the line breaks between the two', () => {
    // Full width, compressAdjacent, no edge trims: ，「 inside a line take
    // 1.5 em, the comma giving up its half em.
    const c = comp({ punctuationWidth: 'fullwidth', compressAdjacent: true, trimLineStart: false });
    expect(pairWidth(lines(`${HAN.slice(0, 3)}，「${HAN.slice(3, 6)}`, 2000, c)[0]!, '，「')).toBe(24);
    // Split by the break, the comma ends its line a full em and nothing is
    // spread; the bracket opens the next one a full em.
    const text = `${HAN.slice(0, 9)}，「${HAN.slice(9, 16)}`;
    const ls = lines(text, 160, c, { textAlign: 'justify' });
    expect(ls[0]!.text).toBe(`${HAN.slice(0, 9)}，`);
    expect(pairWidth(ls[0]!, '，')).toBe(16);
    expect(ls[0]!.segments!.every((s) => s.tracking === undefined && s.inkOffset === undefined)).toBe(true);
    expect(lineWidth(ls[0]!)).toBe(160);
    expect(pairWidth(ls[1]!, '「')).toBe(16);
    // A line one pixel short breaks before the comma's character instead:
    // the comma at its full em no longer fits.
    expect(lines(text, 159, c, { textAlign: 'justify' })[0]!.text).toBe(HAN.slice(0, 8));
    // 」「 split the same way: 」 ends its line a full em.
    const close = lines(`${HAN.slice(0, 8)}「${HAN.slice(8, 9)}」「${HAN.slice(9, 14)}」`, 176, c, { textAlign: 'justify' });
    expect(close[0]!.text.endsWith('」')).toBe(true);
    expect(pairWidth(close[0]!, '」')).toBe(16);
    // Hong Kong centres its comma, so the bracket gave the blank; opening
    // the next line it is a full em again, painted where its box starts.
    const hk = comp({ trimLineStart: false }, 'zh-HK');
    expect(hk).toMatchObject({ region: 'hongkong', punctuationWidth: 'fullwidth', compressAdjacent: true });
    const hkText = `此開卷第一回也作者，「${HAN.slice(9, 16)}`;
    expect(pairWidth(lines(hkText, 2000, hk)[0]!, '，「')).toBe(24);
    const hkLines = lines(hkText, 160, hk, { textAlign: 'justify' });
    expect(hkLines[1]!.text.startsWith('「')).toBe(true);
    expect(hkLines[1]!.segments![0]!.inkOffset).toBeUndefined();
    expect(pairWidth(hkLines[1]!, '「')).toBe(16);
    // With trimLineStart the edge trims take the blank anyway: a closing
    // bracket ends its line half an em, as without the pair.
    const trimmed = lines(`${HAN.slice(0, 8)}「${HAN.slice(8, 9)}」「${HAN.slice(9, 14)}」`, 176, comp({ punctuationWidth: 'fullwidth', compressAdjacent: true, trimLineStart: true }), { textAlign: 'justify' });
    const endMark = trimmed[0]!.segments!.find((s) => s.text === '」')!;
    expect(endMark.width - (endMark.tracking ?? 0)).toBe(8);
  });

  it('trims an opening bracket at a line start and paints it half an em early', () => {
    const text = `${HAN.slice(0, 5)}「${HAN.slice(5, 8)}」`;
    const trimmed = lines(text, 80, comp({ punctuationWidth: 'fullwidth', trimLineStart: true }));
    expect(trimmed[1]!.text.startsWith('「')).toBe(true);
    const seg = trimmed[1]!.segments![0]!;
    expect(seg.text).toBe('「');
    expect(seg.width).toBe(8);
    expect(seg.inkOffset).toBe(-8);
    const kept = lines(text, 80, comp({ punctuationWidth: 'fullwidth', trimLineStart: false }));
    expect(pairWidth(kept[1]!, '「')).toBe(16);
    expect(kept[1]!.segments![0]!.inkOffset).toBeUndefined();
    // On a first line with a 2-em indent the bracket sits half an em into it.
    const indented = lines(`「${HAN.slice(0, 3)}」`, 400, comp({ punctuationWidth: 'fullwidth', trimLineStart: true }), { firstLineIndentPx: 32 });
    expect(indented[0]!.bbox.x).toBe(32);
    expect(indented[0]!.segments![0]!.inkOffset).toBe(-8);
  });

  it('trims a closing bracket at a line end', () => {
    const text = `${HAN.slice(0, 3)}「${HAN.slice(3, 4)}」${HAN.slice(4, 9)}`;
    // 3 + 「 + 1 + 」 = 96 px full width; with the trims 「 opens nothing
    // and 」 ends the line at 88.
    const ls = lines(text, 88, comp({ punctuationWidth: 'fullwidth', trimLineStart: true, compressAdjacent: false }));
    expect(ls[0]!.text).toBe(`${HAN.slice(0, 3)}「${HAN.slice(3, 4)}」`);
    expect(pairWidth(ls[0]!, '」')).toBe(8);
  });

  it('centres the marks of Taiwan and Hong Kong: a quarter em each side', () => {
    const r = punctuationAdvance('，', cjkClassOf('，'), 16, 16, comp({ punctuationWidth: 'halfwidth' }, 'zh-TW'));
    expect(r).toEqual({ advance: 8, inkOffset: -4 });
    // ？！ stay one em in horizontal Taiwan text, in any style.
    expect(punctuationAdvance('？', cjkClassOf('？'), 16, 16, comp({ punctuationWidth: 'halfwidth' }, 'zh-TW'))).toEqual({ advance: 16, inkOffset: 0 });
    // The mainland's corner marks keep their ink at the start.
    expect(punctuationAdvance('，', cjkClassOf('，'), 16, 16, comp({ punctuationWidth: 'halfwidth' }))).toEqual({ advance: 8, inkOffset: 0 });
    // In vertical text ：；？！ keep one em everywhere.
    expect(punctuationAdvance('：', cjkClassOf('：'), 16, 16, { ...comp({ punctuationWidth: 'halfwidth' }), vertical: true }).advance).toBe(16);
  });

  it('sets nothing narrower in Taiwan by default', () => {
    const tw = comp({}, 'zh-Hant-TW');
    expect(tw).toMatchObject({ region: 'taiwan', punctuationWidth: 'fullwidth', compressAdjacent: false, trimLineStart: false });
    const text = '他說：「你來了嗎？」她笑道：「來了。」《紅樓夢》（曹雪芹著）';
    for (const line of lines(text, 160, tw, { textAlign: 'justify' })) {
      for (const seg of line.segments!) expect(seg.inkOffset).toBeUndefined();
      for (const a of advances(line)) expect(a.w - (a.seg.tracking ?? 0)).toBe(16);
    }
  });

  it('gives each compressed mark a segment of its own', () => {
    const line = lines(`${DIALOGUE}“通灵”之说`, 2000, comp())[0]!;
    // The quotes after 。 and ？ keep their em (the stop's blank after their glyph).
    const cut = advances(line).filter((a) => '：“”'.includes(a.ch) && a.w < 16);
    expect(cut.map((a) => a.ch).join('')).toBe('：“：““”');
    for (const a of cut) expect([...a.seg.text].length).toBe(1);
  });
});

describe('hanging punctuation (clreq §6.1.3)', () => {
  const text = `${HAN.slice(0, 5)}，${HAN.slice(5, 9)}`;

  it('allow: a comma that would open the next line hangs past the measure', () => {
    const ls = lines(text, 80, comp({ hangingPunctuation: 'allow' }), { textAlign: 'justify' });
    expect(ls[0]!.text).toBe(`${HAN.slice(0, 5)}，`);
    const last = ls[0]!.segments![ls[0]!.segments!.length - 1]!;
    expect(last).toMatchObject({ text: '，', hangs: true });
    expect(ls[0]!.bbox.width).toBe(80);
    expect(lineWidth(ls[0]!)).toBe(80);
    // Without it the comma takes a character down with it.
    expect(lines(text, 80, comp(), { textAlign: 'justify' })[0]!.text).toBe(HAN.slice(0, 4));
  });

  it('never hangs two marks, nor a mark in horizontal Taiwan text under allow', () => {
    const two = `${HAN.slice(0, 5)}。”${HAN.slice(5, 9)}`;
    const ls = lines(two, 80, comp({ hangingPunctuation: 'allow' }), { textAlign: 'justify' });
    expect(ls.flatMap((l) => l.segments!).some((s) => s.hangs)).toBe(false);
    const tw = lines('此開卷第一，回也作者', 80, comp({ hangingPunctuation: 'allow' }, 'zh-TW'), { textAlign: 'justify' });
    expect(tw.flatMap((l) => l.segments!).some((s) => s.hangs)).toBe(false);
  });

  it('force: a comma that ends a line hangs even when it fits', () => {
    const ls = lines(`${HAN.slice(0, 4)}，${HAN.slice(4, 12)}`, 80, comp({ hangingPunctuation: 'force' }), { textAlign: 'justify' });
    expect(ls[0]!.segments!.some((s) => s.hangs && s.text === '，')).toBe(true);
    expect(lineWidth(ls[0]!)).toBeCloseTo(80, 6);
  });
});

describe('Han–Latin spacing (clreq §6.3.3)', () => {
  const c = comp();

  it('sets 用iPhone拍照 and 用 iPhone 拍照 alike', () => {
    const a = lines('用iPhone拍照', 2000, c)[0]!;
    const b = lines('用 iPhone 拍照', 2000, c)[0]!;
    const shape = (l: VDTLine) => l.segments!.map((s) => [s.kind, s.width, s.autospace ?? false]);
    expect(shape(a)).toEqual(shape(b));
    expect(a.segments!.filter((s) => s.autospace).map((s) => s.width)).toEqual([4, 4]);
    // The plain text of the line holds no added character.
    expect(a.text).toBe('用iPhone拍照');
    expect(b.text).toBe('用 iPhone 拍照');
  });

  it('sets a sentence with more typed spaces than characters alike with and without them', () => {
    // Web text types a space at each Han–Latin boundary. Those spaces become
    // Han–Latin spaces, so they do not count as word spaces against the
    // characters: each spaced sentence is composed like its solid spelling
    // (6 characters and 6 typed spaces, 5 and 6, 4 and 5, 2 and 2).
    const shape = (l: VDTLine) => l.segments!.map((s) => [s.kind, s.text.trim(), s.width, s.autospace ?? false]);
    for (const [spaced, solid] of [
      ['安装 Node.js、npm 和 Git 后运行 npm install。', '安装Node.js、npm和Git后运行npm install。'],
      ['使用 npm install 安装 React 和 ReactDOM。', '使用npm install安装React和ReactDOM。'],
      ['2026 年 9 月 28 日，晴。', '2026年9月28日，晴。'],
      ['第 3 章', '第3章'],
    ]) {
      const a = lines(solid!, 2000, c)[0]!;
      const b = lines(spaced!, 2000, c)[0]!;
      expect(a.cjkComposed).toBe(true);
      expect(b.cjkComposed).toBe(true);
      expect(shape(b)).toEqual(shape(a));
      // The stop and the comma take their Kaiming half em.
      for (const s of b.segments!.filter((seg) => seg.text === '。' || seg.text === '，')) expect(s.width).toBe(8);
    }
    // A Latin sentence that quotes a title keeps its word spaces (five
    // between Latin words against three characters) and Knuth–Plass.
    expect(lines('the novel 紅樓夢 was written by Cao Xueqin', 2000, c)[0]!.cjkComposed).toBeUndefined();
  });

  it('spaces digits and letters from Han, not signs, marks or a Western space', () => {
    const line = lines('1999年的iPhone 15售价为¥5,999。', 2000, c)[0]!;
    const segs = line.segments!;
    const around = (i: number) => `${segs[i - 1]!.text}|${segs[i + 1]!.text}`;
    const autos = segs.map((s, i) => (s.autospace ? around(i) : '')).filter(Boolean);
    expect(autos).toEqual(['1999|年的', '年的|iPhone', '15|售价为']);
    // iPhone 15 keeps its word space.
    expect(segs.find((s) => s.kind === 'space' && !s.autospace)).toMatchObject({ text: ' ', width: 4 });
  });

  it('adds none at a line edge or inside Chinese brackets', () => {
    const ls = lines('我们用iPhone拍照了', 48, c);
    for (const l of ls) {
      expect(l.segments![0]!.autospace).toBeUndefined();
      expect(l.segments![l.segments!.length - 1]!.autospace).toBeUndefined();
    }
    const inside = lines('用（iPhone）拍照', 2000, c)[0]!;
    expect(inside.segments!.some((s) => s.autospace)).toBe(false);
  });

  it('grows to half an em before the characters are spread', () => {
    // 我用iPhone拍 = 3 × 16 + 48 + 2 × 4 = 104 px; 10 px to spread on a
    // 114 px line: the two spaces take 4 px each (up to half an em), the
    // one gap between 我用 and the two spaces share the rest.
    const ls = lines('我用iPhone拍照了', 114, c, { textAlign: 'justify' });
    const first = ls[0]!;
    expect(first.text).toBe('我用iPhone拍');
    const spaces = first.segments!.filter((s) => s.autospace);
    const tracking = first.segments!.find((s) => s.tracking !== undefined)?.tracking ?? 0;
    expect(tracking).toBeCloseTo(2 / 3, 6);
    for (const s of spaces) expect(s.width).toBeCloseTo(8 + tracking, 6);
    expect(lineWidth(first)).toBeCloseTo(114, 6);
  });

  it('shrinks to an eighth of an em to take in a mark that may not open a line', () => {
    // 我用iPhone拍， = 104 + 8 = 112 px on a 108 px line: the comma may not
    // open the next line, so the two spaces give 2 px each to take it in.
    const first = lines('我用iPhone拍，照了', 108, c, { textAlign: 'justify' })[0]!;
    expect(first.text).toBe('我用iPhone拍，');
    expect(first.segments!.filter((s) => s.autospace).map((s) => s.width)).toEqual([2, 2]);
    expect(lineWidth(first)).toBeCloseTo(108, 6);
    // A character that may open the next line goes down instead, and the
    // spaces grow.
    const spread = lines('我用iPhone拍照了', 116, c, { textAlign: 'justify' })[0]!;
    expect(spread.text).toBe('我用iPhone拍');
    for (const s of spread.segments!.filter((seg) => seg.autospace)) expect(s.width).toBeGreaterThan(4);
  });

  it('is off at 0', () => {
    const off = comp({ latinSpacing: { value: 0, unit: 'em' } });
    const line = lines('用iPhone拍照', 2000, off)[0]!;
    expect(line.segments!.some((s) => s.autospace)).toBe(false);
    expect(lineWidth(line)).toBe(16 + 48 + 32);
    // A space typed at the boundary stays a word space.
    expect(lines('用 iPhone 拍照', 2000, off)[0]!.segments!.filter((s) => s.kind === 'space').every((s) => !s.autospace)).toBe(true);
  });

  it('takes a length as well as ems', () => {
    // 3 px at 96 dpi = 4 px.
    const px = cjkCompositionOf(resolveCjkConfig({ latinSpacing: { value: 3, unit: 'pt' } }, 'zh'), 96);
    expect(lines('用iPhone', 2000, px)[0]!.segments!.find((s) => s.autospace)!.width).toBe(4);
  });
});

describe('composition in the measurement cache', () => {
  it('never shares an entry between two compositions', () => {
    const cache = createMeasurementCache();
    const a = cachedMeasureRichBlock([run(DIALOGUE)], FONT, FONT, FONT, FONT, 2000, 20, { cjkComposition: comp() }, cache);
    const b = cachedMeasureRichBlock([run(DIALOGUE)], FONT, FONT, FONT, FONT, 2000, 20, { cjkComposition: comp({ punctuationWidth: 'fullwidth', compressAdjacent: false }) }, cache);
    expect(a.lines[0]!.bbox.width).not.toBe(b.lines[0]!.bbox.width);
  });

  it('keys the document language where it changes a measurement', () => {
    const cjk = resolveCjkConfig({}, 'zh-Hans');
    expect(cjkCompositionOf(cjk, 96, 'ko').language).toBe('ko');
    expect(cjkCompositionOf(cjk, 96).language).toBeUndefined();
    const key = (locale?: string): string => cjkCompositionKey(cjkCompositionOf(cjk, 96, locale));
    // Japanese and Korean route no shared marks; a Chinese document routes
    // them in a paragraph with kana; other languages behave alike.
    expect(key('ja')).toBe(key('ko'));
    expect(key('ja')).not.toBe(key('zh-Hant'));
    expect(key('zh-Hant')).not.toBe(key('en'));
    expect(key('en')).toBe(key('es'));
    expect(key('en')).toBe(key(undefined));
  });
});
