import { describe, it, expect, afterEach } from 'vitest';
import { measureRichBlock } from '../../measure/rich';
import { measureBlock } from '../../measure/plain';
import { cachedMeasureRichBlock } from '../../measure/cache';
import { createMeasurementCache } from '../../measure/font';
import { cjkCompositionOf, punctuationAdvance, setCjkComposition, type CjkComposition } from '../../measure/cjkPunctuation';
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

  it('shrinks word spaces before marks, and never a mark past half an em', () => {
    // lineEndHalf: a line one em too wide takes a character in by giving up
    // the blank of its two commas.
    const text = `${HAN.slice(0, 3)}，${HAN.slice(3, 6)}，${HAN.slice(6, 9)}`;
    const ls = lines(text, 9 * 16 + 16, comp({ punctuationWidth: 'lineEndHalf' }));
    expect(ls[0]!.text).toBe(text);
    expect(pairWidth(ls[0]!, '，')).toBe(8);
    expect(lineWidth(ls[0]!)).toBeCloseTo(160, 6);
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
    const line = lines(DIALOGUE, 2000, comp())[0]!;
    for (const seg of line.segments!) {
      if ([...seg.text].some((c) => '：“”'.includes(c))) expect([...seg.text].length).toBe(1);
    }
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

  it('shrinks to an eighth of an em to take one more character in', () => {
    // 我用iPhone拍照 = 120 px on a 116 px line: the two spaces give 2 px each.
    const first = lines('我用iPhone拍照了', 116, c, { textAlign: 'justify' })[0]!;
    expect(first.text).toBe('我用iPhone拍照');
    expect(first.segments!.filter((s) => s.autospace).map((s) => s.width)).toEqual([2, 2]);
    expect(lineWidth(first)).toBeCloseTo(116, 6);
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
});
