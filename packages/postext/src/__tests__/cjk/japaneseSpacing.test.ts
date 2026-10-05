import { describe, it, expect, afterEach } from 'vitest';
import { measureRichBlock } from '../../measure/rich';
import { measureBlock } from '../../measure/plain';
import { cjkCompositionKey, cjkCompositionOf, isJlreqSpacing, punctuationSide, setCjkComposition, type CjkComposition } from '../../measure/cjkPunctuation';
import { resolveCjkConfig, stripCjkDefaults } from '../../defaults/cjk';
import { cjkClassOf } from '../../measure/cjkClasses';
import { buildDocument } from '../../pipeline';
import type { CjkConfig, PostextConfig } from '../../types';
import type { MeasureBlockOptions } from '../../measure/types';
import type { VDTDocument, VDTLine, VDTLineSegment } from '../../vdt';
import { installSizedStub } from '../vertical/stub';

// Yakumono spacing in Japanese text (#418, JLReq §3.1 and §3.8): full-width
// marks with JLReq's pair compression, the half em at a line end kept and
// given up whole, ・：； a quarter em each side, the space after ？！, the
// three placements of a bracket that opens a paragraph, ぶら下げ, solid
// 、・ in kanji numbers, the reduction and expansion order, and 泣き別れ.
// The stub measures kana and kanji one em (16 px at 16 px), Latin half.
installSizedStub();
afterEach(() => setCjkComposition(undefined));

const EM = 16;
const FONT = '16px Test';

/** The composition of a document in `locale` with `cjk`. */
function comp(cjk: CjkConfig = {}, locale = 'ja'): CjkComposition {
  return cjkCompositionOf(resolveCjkConfig(cjk, locale), 96, locale);
}

function lines(text: string, width: number, composition: CjkComposition = comp(), options: MeasureBlockOptions = {}): VDTLine[] {
  const rich = measureRichBlock([{ text, bold: false, italic: false }], FONT, FONT, FONT, FONT, width, 24, { cjkComposition: composition, textAlign: 'justify', ...options }).lines;
  // The plain path hands CJK text to the same composer.
  const plain = measureBlock(text, FONT, width, 24, { cjkComposition: composition, textAlign: 'justify', ...options }).lines;
  expect(plain.map((l) => l.text)).toEqual(rich.map((l) => l.text));
  return rich;
}
const texts = (ls: VDTLine[]): string[] => ls.map((l) => l.text);

interface Cell { ch: string; w: number; seg: VDTLineSegment }
/** Each character of a line with its advance (tracking included) and its
 *  segment; a space segment is one cell `␣` (its text may be empty). */
function cells(line: VDTLine): Cell[] {
  const out: Cell[] = [];
  for (const seg of line.segments!) {
    if (seg.kind === 'space') {
      out.push({ ch: '␣', w: seg.width, seg });
      continue;
    }
    const chars = [...seg.text];
    for (const ch of chars) out.push({ ch, w: seg.width / chars.length, seg });
  }
  return out;
}
/** The advances of the characters of `run` on a line (the first match). */
function widthsOf(line: VDTLine, run: string): number[] {
  const a = cells(line);
  const chars = [...run];
  for (let i = 0; i + chars.length <= a.length; i++) {
    if (chars.every((c, j) => a[i + j]!.ch === c)) return chars.map((_, j) => a[i + j]!.w);
  }
  throw new Error(`${run} not on the line ${line.text}`);
}
const lineWidth = (l: VDTLine): number => l.segments!.filter((s) => !s.hangs).reduce((s, seg) => s + seg.width, 0);

describe('Japanese marks: half a glyph and a conditional blank (JLReq §3.1.2)', () => {
  it('is JLReq spacing for Japan with full-width marks only', () => {
    expect(isJlreqSpacing(comp())).toBe(true);
    expect(isJlreqSpacing(comp({ punctuationWidth: 'kaiming' }))).toBe(false);
    for (const locale of ['zh-Hans', 'zh-Hant-TW', 'zh-HK']) expect(isJlreqSpacing(comp({}, locale))).toBe(false);
  });

  it('sets 、。 one em, ・：； a quarter em each side, ？！ solid', () => {
    expect(punctuationSide('：', cjkClassOf('：'), 'japan')).toBe('both');
    expect(punctuationSide('；', cjkClassOf('；'), 'japan')).toBe('both');
    expect(punctuationSide('？', cjkClassOf('？'), 'japan')).toBe('none');
    expect(punctuationSide('！', cjkClassOf('！'), 'japan')).toBe('none');
    // The mainland is unchanged: blank after them.
    expect(punctuationSide('：', cjkClassOf('：'), 'mainland')).toBe('end');
    expect(punctuationSide('？', cjkClassOf('？'), 'mainland')).toBe('end');
    const line = lines('あ、い。う・え：お；か', 2000)[0]!;
    expect(widthsOf(line, 'あ、い。う・え：お；か')).toEqual(Array(11).fill(EM));
  });
});

describe('consecutive marks (JLReq §3.1.4)', () => {
  /** The advances of `pair` set between kana on a wide line. */
  const pair = (p: string): number[] => widthsOf(lines(`あ${p}い`, 2000)[0]!, p);
  /** Where each glyph of `pair` is painted from its box. */
  const inks = (p: string): number[] => {
    const a = cells(lines(`あ${p}い`, 2000)[0]!);
    const i = a.findIndex((_, k) => [...p].every((c, j) => a[k + j]?.ch === c));
    return [...p].map((_, j) => a[i + j]!.seg.inkOffset ?? 0);
  };

  it('、」 。」: solid, the half em after 」', () => {
    expect(pair('、」')).toEqual([8, 16]);
    expect(pair('。」')).toEqual([8, 16]);
  });

  it('」、 」。: solid, the half em after 、。', () => {
    expect(pair('」、')).toEqual([8, 16]);
    expect(pair('」。')).toEqual([8, 16]);
  });

  it('、「 。「 」「: half an em between', () => {
    for (const p of ['、「', '。「', '」「', '）（']) {
      expect(pair(p), p).toEqual([8, 16]);
      // The opening bracket keeps its half em before its glyph.
      expect(inks(p)[1], p).toBe(0);
    }
  });

  it('「「 『「: solid, the half em before the first', () => {
    for (const p of ['「「', '『「', '（「']) {
      expect(pair(p), p).toEqual([16, 8]);
      expect(inks(p), p).toEqual([0, -8]);
    }
  });

  it('」」 」』: solid, the half em after the last', () => {
    expect(pair('」」')).toEqual([8, 16]);
    expect(pair('」』')).toEqual([8, 16]);
  });

  it('」・ ・「: a quarter em between (the bracket gives up its half, the dot keeps its quarter)', () => {
    expect(pair('」・')).toEqual([8, 16]);
    expect(pair('・「')).toEqual([16, 8]);
    expect(inks('・「')).toEqual([0, -8]);
    // ：； are middle dots too (cl-05).
    expect(pair('」：')).toEqual([8, 16]);
    expect(pair('：「')).toEqual([16, 8]);
  });

  it('・・ 、・ 。・: nothing given up (¼ + ¼, ½ + ¼)', () => {
    expect(pair('・・')).toEqual([16, 16]);
    expect(pair('、・')).toEqual([16, 16]);
    expect(pair('。・')).toEqual([16, 16]);
  });

  it('？」 ！」: no blank after ？！, the half em after 」', () => {
    expect(pair('？」')).toEqual([16, 16]);
    expect(pair('！』')).toEqual([16, 16]);
  });

  it('leaves every pair at full width without compressAdjacent', () => {
    const off = comp({ compressAdjacent: false });
    for (const p of ['、」', '」、', '「「', '」・']) expect(widthsOf(lines(`あ${p}い`, 2000, off)[0]!, p), p).toEqual([16, 16]);
  });

  it('keeps the Chinese quarter em rule for 」· outside Japan', () => {
    // Hong Kong centres its interpunct: the pair gives up a quarter em only.
    const hk = lines('甲」・乙', 2000, comp({}, 'zh-HK'))[0]!;
    expect(widthsOf(hk, '」・')).toEqual([12, 16]);
  });
});

describe('line edges (JLReq §3.1.5, §3.1.9)', () => {
  it('keeps the half em after a closing mark at a line end; Hong Kong trims it', () => {
    const ja = lines('あいう」えお', 64)[0]!;
    expect(ja.text).toBe('あいう」');
    expect(widthsOf(ja, '」')).toEqual([16]);
    const hk = lines('甲乙丙」丁戊', 64, comp({}, 'zh-HK'))[0]!;
    expect(widthsOf(hk, '」')).toEqual([8]);
  });

  it('trims an opening bracket at a wrapped line start (天付き)', () => {
    const ls = lines('あいうえ「おか」', 64);
    expect(ls[1]!.text.startsWith('「')).toBe(true);
    expect(widthsOf(ls[1]!, '「')).toEqual([8]);
    expect(cells(ls[1]!)[0]!.seg.inkOffset).toBe(-8);
  });

  it('gives the half em a pair took back when the break parts the two', () => {
    // 」 ends the first line with its half em; 「 opens the next trimmed.
    const ls = lines('あいう」「えお', 64);
    expect(texts(ls)).toEqual(['あいう」', '「えお']);
    expect(widthsOf(ls[0]!, '」')).toEqual([16]);
    expect(widthsOf(ls[1]!, '「')).toEqual([8]);
  });
});

describe('taking one more character in (JLReq §3.8.3)', () => {
  it('gives up the half em at the line end first, all of it', () => {
    // あいう」 fill 64 px; 、 may not open the next line. 」、 are solid, and
    // the line-end 、 gives up its half em: the line takes it in.
    const exact = lines('あいう」、えお', 64)[0]!;
    expect(exact.text).toBe('あいう」、');
    expect(widthsOf(exact, '」、')).toEqual([8, 8]);
    expect(lineWidth(exact)).toBeCloseTo(64, 6);
    // 70 px: 2 px would do, but the half em goes whole (never 6 px of it);
    // the line is spread back to the measure, between あいう only.
    const wide = lines('あいう」、えお', 70)[0]!;
    expect(wide.text).toBe('あいう」、');
    expect(widthsOf(wide, '」、')).toEqual([8, 8]);
    expect(lineWidth(wide)).toBeCloseTo(70, 6);
    expect(widthsOf(wide, 'あいう')).toEqual([19, 19, 16]);
  });

  it('then the half ems of 、「」 inside the line, never the one after 。', () => {
    // The 、 inside gives up its half em with the 。 at the end.
    const comma = lines('あ、いうえ。か', 80)[0]!;
    expect(comma.text).toBe('あ、いうえ。');
    expect(widthsOf(comma, '、')).toEqual([8]);
    expect(widthsOf(comma, '。')).toEqual([8]);
    // A 。 inside keeps its em: the 、 cannot come in, so it hangs.
    const stop = lines('あ。いうえ、か', 80)[0]!;
    expect(widthsOf(stop, '。')).toEqual([16]);
    expect(stop.segments!.at(-1)).toMatchObject({ text: '、', hangs: true, width: 8 });
    // Without hanging it goes down with the character before it.
    expect(texts(lines('あ。いうえ、か', 80, comp({ hangingPunctuation: 'none' })))).toEqual(['あ。いう', 'え、か']);
  });

  it('uses the line end before the marks inside the line', () => {
    // The last 、 gives up its half em; the 、 inside keeps its em.
    const line = lines('あ、いう」、か', 80)[0]!;
    expect(line.text).toBe('あ、いう」、');
    expect(widthsOf(line, 'あ、')).toEqual([16, 16]);
    expect(widthsOf(line, '」、')).toEqual([8, 8]);
  });

  it('shares the quarter ems of middle dots inside the line before the half ems of brackets', () => {
    // あ・い「う」、 is 104 px (」、 solid). At 88 px the 、 at the end gives
    // up its half em, then the dot its two quarters; 「 keeps its em.
    let line = lines('あ・い「う」、え', 88)[0]!;
    expect(line.text).toBe('あ・い「う」、');
    expect(widthsOf(line, '・い「')).toEqual([8, 16, 16]);
    // At 80 px the bracket's half em goes too.
    line = lines('あ・い「う」、え', 80)[0]!;
    expect(widthsOf(line, '・い「')).toEqual([8, 16, 8]);
  });
});

describe('justification (JLReq §3.8.4, §3.1.11)', () => {
  it('never spreads after an opening bracket, before a closing one, or next to 、。・？！', () => {
    const line = lines('あ「いう」え、お・か？きくけこさしすせそたちつてと', 300)[0]!;
    const tracked = (ch: string): boolean => cells(line).find((c) => c.ch === ch)!.seg.tracking !== undefined;
    // Before 「 and after 」: yes; after 「, before 」, around 、・？: no.
    expect(tracked('あ')).toBe(true);
    expect(tracked('」')).toBe(true);
    expect(tracked('「')).toBe(false);
    expect(tracked('う')).toBe(false);
    for (const ch of ['え', '、', 'お', '・', 'か', '？']) expect(tracked(ch), ch).toBe(false);
    expect(lineWidth(line)).toBeCloseTo(300, 6);
  });

  it('spreads every gap in Chinese text as before', () => {
    const line = lines('甲「乙丙」丁，戊己庚辛壬癸子丑寅卯辰巳午未申酉', 300, comp({}, 'zh-HK'))[0]!;
    expect(cells(line).find((c) => c.ch === '「')!.seg.tracking).toBeGreaterThan(0);
  });
});

describe('the space after ？！ (cjk.spaceAfterQuestion, JLReq §3.1.6)', () => {
  it('sets one em after ？！ inside a paragraph', () => {
    const line = lines('本当？そうです！ええ。', 2000)[0]!;
    const a = cells(line);
    expect(a.map((c) => c.ch).join('')).toBe('本当？␣そうです！␣ええ。');
    for (const c of a.filter((x) => x.ch === '␣')) expect(c).toMatchObject({ w: EM, seg: { kind: 'space', autospace: true, text: '' } });
  });

  it('sets none before a closing bracket, between ？！, at the end of the paragraph', () => {
    expect(cells(lines('「本当？」と彼。', 2000)[0]!).some((c) => c.ch === '␣')).toBe(false);
    expect(cells(lines('本当？！そう', 2000)[0]!).map((c) => c.ch).join('')).toBe('本当？！␣そう');
    expect(cells(lines('本当？', 2000)[0]!).some((c) => c.ch === '␣')).toBe(false);
  });

  it('replaces the space the author typed (U+3000 or a word space)', () => {
    const ideo = lines('本当？　そう', 2000)[0]!;
    expect(ideo.text).toBe('本当？　そう');
    expect(cells(ideo).map((c) => [c.ch, c.w])).toEqual([['本', 16], ['当', 16], ['？', 16], ['␣', 16], ['そ', 16], ['う', 16]]);
    expect(lineWidth(lines('本当？ そう', 2000)[0]!)).toBe(6 * EM);
  });

  it('goes at a line end, and does not open the next line', () => {
    const ls = lines('あいう？えおか', 64);
    expect(texts(ls)).toEqual(['あいう？', 'えおか']);
    expect(cells(ls[1]!)[0]!.ch).toBe('え');
    // A typed U+3000 goes too.
    expect(texts(lines('あいう？　えおか', 64))).toEqual(['あいう？', 'えおか']);
  });

  it('never stretches or shrinks on a justified line', () => {
    const line = lines('あいう？えおかきくけ', 150)[0]!;
    expect(cells(line).find((c) => c.ch === '␣')!.w).toBe(EM);
    expect(lineWidth(line)).toBeCloseTo(150, 6);
  });

  it('follows the setting, and is off in Chinese', () => {
    expect(cells(lines('本当？そう', 2000, comp({ spaceAfterQuestion: false }))[0]!).some((c) => c.ch === '␣')).toBe(false);
    expect(cells(lines('真的？是的', 2000, comp({}, 'zh-Hans'))[0]!).some((c) => c.ch === '␣')).toBe(false);
    expect(cells(lines('真的？是的', 2000, comp({ spaceAfterQuestion: true }, 'zh-Hans'))[0]!).map((c) => c.ch).join('')).toBe('真的？␣是的');
  });

  it('sets the space after a note marker that follows the mark', () => {
    const doc = buildDocument({ markdown: '本当？[^1]そう\n\n[^1]: 注。' }, config());
    const line = paragraphLines(doc)[0]!;
    const kinds = line.segments!.map((s) => (s.kind === 'space' ? '␣' : s.kind === 'text' ? s.text : `#${s.kind}`));
    const space = kinds.indexOf('␣');
    expect(space).toBeGreaterThan(kinds.findIndex((k) => k.includes('？')) + 1);
  });
});

describe('a bracket that opens a paragraph (cjk.paragraphStartBracket, JLReq §3.1.5)', () => {
  const TEXT = '「はい」と答えた。';
  const first = (cjk: CjkConfig, locale = 'ja', indent = EM): { x: number; bracket: number; ink: number } => {
    const line = lines(TEXT, 2000, comp(cjk, locale), { firstLineIndentPx: indent })[0]!;
    const seg = line.segments![0]!;
    return { x: line.bbox.x, bracket: seg.text === '「' ? seg.width : widthsOf(line, '「')[0]!, ink: seg.inkOffset ?? 0 };
  };

  it('③ half (the Japanese default): the bracket fills the indent, the text after it at one em', () => {
    expect(first({})).toEqual({ x: 8, bracket: 8, ink: -8 });
    expect(first({ paragraphStartBracket: 'half' })).toEqual({ x: 8, bracket: 8, ink: -8 });
    // A two-em indent: the text after the bracket at two em.
    expect(first({}, 'ja', 2 * EM)).toEqual({ x: 24, bracket: 8, ink: -8 });
  });

  it('① indent: the indent, then the bracket trimmed; the text at 1.5 em', () => {
    expect(first({ paragraphStartBracket: 'indent' })).toEqual({ x: 16, bracket: 8, ink: -8 });
    // Trimmed even where line starts are not (trimLineStart off).
    expect(first({ paragraphStartBracket: 'indent', trimLineStart: false })).toEqual({ x: 16, bracket: 8, ink: -8 });
  });

  it('天付き flush: no indent', () => {
    expect(first({ paragraphStartBracket: 'flush' })).toEqual({ x: 0, bracket: 8, ink: -8 });
  });

  it('leaves a paragraph without a bracket or without an indent alone', () => {
    for (const p of ['half', 'indent', 'flush'] as const) {
      expect(lines('はい、と答えた。', 2000, comp({ paragraphStartBracket: p }), { firstLineIndentPx: EM })[0]!.bbox.x, p).toBe(EM);
      expect(first({ paragraphStartBracket: p }, 'ja', 0), p).toEqual({ x: 0, bracket: 8, ink: -8 });
    }
  });

  it('keeps the Chinese line-start rules: trimmed on the mainland, the whole bracket in Taiwan', () => {
    expect(first({}, 'zh-Hans')).toEqual({ x: 16, bracket: 8, ink: -8 });
    expect(first({}, 'zh-Hant-TW')).toEqual({ x: 16, bracket: 16, ink: 0 });
    expect(resolveCjkConfig(undefined, 'zh-Hans').paragraphStartBracket).toBeUndefined();
  });

  it('sets a built Japanese paragraph with a one-em indent as ③, the others at one em', () => {
    const doc = buildDocument({ markdown: '「はい」と答えた。\n\nそう言って笑った。' }, config({ bodyText: { fontSize: pt(20), lineHeight: pt(30), textAlign: 'justify', firstLineIndent: { value: 1, unit: 'em' } } }));
    const [bracket, plain] = doc.blocks.filter((b) => b.type === 'paragraph').map((b) => b.lines[0]!);
    const left = (l: VDTLine): number => l.bbox.x - doc.blocks.find((b) => b.lines.includes(l))!.bbox.x;
    // 20 px text: the bracket's glyph in the second half of the indent.
    expect(left(bracket!)).toBeCloseTo(10, 6);
    expect(left(plain!)).toBeCloseTo(20, 6);
  });
});

describe('ぶら下げ (cjk.hangingPunctuation)', () => {
  it('auto hangs 、。，． in Japan only when the mark would otherwise open the next line', () => {
    expect(resolveCjkConfig(undefined, 'ja').hangingPunctuation).toBe('allow');
    for (const locale of ['zh-Hans', 'zh-Hant-TW', 'zh-HK', 'en']) expect(resolveCjkConfig(undefined, locale).hangingPunctuation, locale).toBe('none');
    for (const mark of ['、', '。', '，', '．']) {
      const ls = lines(`あいうえ${mark}お`, 64);
      expect(texts(ls), mark).toEqual([`あいうえ${mark}`, 'お']);
      expect(ls[0]!.segments!.at(-1), mark).toMatchObject({ text: mark, hangs: true, width: 8 });
      expect(lineWidth(ls[0]!)).toBeCloseTo(64, 6);
    }
    // Set inside the line when it fits: no hang.
    expect(lines('あいう、えお', 64)[0]!.segments!.some((s) => s.hangs)).toBe(false);
  });

  it('never hangs ？！, closing brackets or ・', () => {
    for (const mark of ['？', '！', '」', '・']) {
      const ls = lines(`あいうえ${mark}お`, 64, comp({ spaceAfterQuestion: false }));
      expect(ls.some((l) => l.segments!.some((s) => s.hangs)), mark).toBe(false);
      expect(ls[0]!.text, mark).toBe('あいう');
    }
  });

  it('hangs in vertical text too', () => {
    const ls = lines('あいうえ、お', 64, comp(), { writingMode: 'vertical-rl' });
    expect(texts(ls)).toEqual(['あいうえ、', 'お']);
    expect(ls[0]!.segments!.at(-1)).toMatchObject({ text: '、', hangs: true });
    expect(lines('あいうえ、お', 64, comp({ hangingPunctuation: 'none' }), { writingMode: 'vertical-rl' }).some((l) => l.segments!.some((s) => s.hangs))).toBe(false);
  });

  it('hangs in a built Japanese document by default', () => {
    const doc = buildDocument({ markdown: 'あいうえおかきくけこさしすせそたちつてと、なにぬねの' }, config());
    expect(doc.config.cjk.hangingPunctuation).toBe('allow');
    expect(paragraphLines(doc)[0]!.segments!.at(-1)).toMatchObject({ text: '、', hangs: true });
  });
});

describe('、 and ・ between kanji numerals (JLReq §3.1.3)', () => {
  it('are set solid: 二、三日, 三・一四', () => {
    const line = lines('二、三日と三・一四と、いう', 2000)[0]!;
    expect(widthsOf(line, '二、三')).toEqual([16, 8, 16]);
    expect(widthsOf(line, '三・一')).toEqual([16, 8, 16]);
    // Not between other characters.
    expect(widthsOf(line, 'と、い')).toEqual([16, 16, 16]);
  });

  it('never break the number at the mark', () => {
    // あいう二 fill the line; 、 may not open the next one, nor may the line
    // break after it: the number goes down whole.
    for (const text of ['あいう二、三日', 'あいう三・一四']) {
      const ls = lines(text, 64, comp({ hangingPunctuation: 'none' }));
      expect(ls.every((l) => !l.text.endsWith('、') && !l.text.endsWith('・')), text).toBe(true);
    }
  });

  it('are Japanese only', () => {
    const tw = lines('二、三日', 2000, comp({}, 'zh-Hant-TW'))[0]!;
    expect(widthsOf(tw, '、')).toEqual([16]);
  });
});

describe('泣き別れ: no last line of one character', () => {
  const TEXT = '彼は「ああ」、「そう」、「ええ」と言う。';
  it('takes the character into the line above by giving up blank (push-in) before pushing one down', () => {
    const plain = lines(TEXT, 136);
    expect(texts(plain)).toEqual(['彼は「ああ」、「そ', 'う」、「ええ」と言', 'う。']);
    const avoided = lines(TEXT, 136, comp(), { runtPenalty: 1000 });
    expect(texts(avoided)).toEqual(['彼は「ああ」、「そ', 'う」、「ええ」と言う。']);
    expect(lineWidth(avoided[0]!)).toBeCloseTo(136, 6);
  });

  it('pushes a character down when the line above cannot take the last in', () => {
    const ls = lines('それから「はい、いいえ」と言う。', 80, comp(), { runtPenalty: 1000 });
    expect(texts(ls)).toEqual(['それから', '「はい、い', 'いえ」と', '言う。']);
  });

  it('pushes down in Chinese as before (no push-in)', () => {
    const hk = comp({}, 'zh-HK');
    const ls = lines('他說「啊啊」、「是是」、「嗯嗯」就走了。', 136, hk, { runtPenalty: 1000 });
    expect(ls.length).toBe(lines('他說「啊啊」、「是是」、「嗯嗯」就走了。', 136, hk).length);
  });
});

describe('config', () => {
  it('resolves auto per region, present only for Japan', () => {
    const ja = resolveCjkConfig(undefined, 'ja');
    expect([ja.spaceAfterQuestion, ja.paragraphStartBracket]).toEqual([true, 'half']);
    for (const locale of ['zh-Hans', 'zh-Hant-TW', 'zh-HK', 'ko', 'en']) {
      const r = resolveCjkConfig(undefined, locale);
      expect('spaceAfterQuestion' in r || 'paragraphStartBracket' in r, locale).toBe(false);
    }
    expect(resolveCjkConfig({ spaceAfterQuestion: false, paragraphStartBracket: 'flush', hangingPunctuation: 'none' }, 'ja'))
      .toMatchObject({ paragraphStartBracket: 'flush', hangingPunctuation: 'none' });
    expect('spaceAfterQuestion' in resolveCjkConfig({ spaceAfterQuestion: false }, 'ja')).toBe(false);
    expect(resolveCjkConfig({ paragraphStartBracket: 'odd' as never }, 'ja').paragraphStartBracket).toBe('half');
    expect(stripCjkDefaults({ spaceAfterQuestion: 'auto', paragraphStartBracket: 'auto', hangingPunctuation: 'auto' })).toBeUndefined();
  });

  it('keys measurements by the new settings, other keys unchanged', () => {
    const zh = comp({}, 'zh-Hans');
    expect(cjkCompositionKey(zh)).toBe('mainland:kaiming:1:1:none:0.25em:zh');
    expect(cjkCompositionKey(comp())).toBe('japan:fullwidth:1:1:allow:0.25em:jk:q:phalf');
  });
});

const pt = (value: number) => ({ value, unit: 'pt' as const });
/** 72 dpi, 20 px text on a 30 px line, a measure of 20 characters. */
function config(extra: Partial<PostextConfig> = {}): PostextConfig {
  return {
    locale: 'ja',
    page: { width: pt(440), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    bodyText: { fontSize: pt(20), lineHeight: pt(30), textAlign: 'justify', firstLineIndent: pt(0) },
    ...extra,
  };
}
const paragraphLines = (doc: VDTDocument): VDTLine[] => doc.blocks.filter((b) => b.type === 'paragraph').flatMap((b) => b.lines);
