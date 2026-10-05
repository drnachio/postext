import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../index';
import type { PostextConfig } from '../../types';
import type { VDTDocument, VDTLine } from '../../vdt';
import { resolveCjkConfig, stripCjkDefaults } from '../../defaults/cjk';
import { resolveParagraphStylesConfig, stripParagraphStylesDefaults } from '../../defaults/paragraphStyles';
import { resolveBodyTextConfig } from '../../defaults/bodyText';
import { cjkCompositionKey, cjkCompositionOf } from '../../measure/cjkPunctuation';
import { installSizedStub } from '../vertical/stub';

// `cjk.wordBreak: 'keep-all'` (#463): kana written with a space between
// phrases (分かち書き) breaks only at the spaces, and next to punctuation
// where kinsoku allows; a phrase longer than the line is broken inside it.
// The stub measures kana, kanji, hangul and full-width marks 1 em (20 px), a
// space ¼ em (5 px), Latin letters ½ em.
installSizedStub();

const pt = (value: number) => ({ value, unit: 'pt' as const });
/** 72 dpi, 20 px text, a measure of `chars` characters. */
const config = (locale: string, cjk: PostextConfig['cjk'] = {}, chars = 8, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  locale,
  page: { width: pt(chars * 20 + 40), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(20), lineHeight: pt(30), textAlign: 'left', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  cjk,
  ...extra,
});
const KEEP: PostextConfig['cjk'] = { wordBreak: 'keep-all' };

const paragraphLines = (doc: VDTDocument): VDTLine[][] => doc.blocks.filter((b) => b.type === 'paragraph').map((b) => b.lines);
const linesOf = (md: string, c: PostextConfig): string[] => paragraphLines(buildDocument({ markdown: md }, c)).flat().map((l) => l.text);

describe('keep-all line breaking (#463)', () => {
  // Eight characters to the line.
  const PHRASES = 'むかし むかし ある ところに おじいさんが いました';

  it('breaks phrase-spaced kana only at the spaces', () => {
    expect(linesOf(PHRASES, config('ja', KEEP))).toEqual(['むかし むかし', 'ある ところに', 'おじいさんが', 'いました']);
    // `normal` (the default) breaks between any two kana.
    const normal = linesOf(PHRASES, config('ja'));
    expect(normal[0]).toBe('むかし むかし あ');
    expect(linesOf(PHRASES, config('ja', { wordBreak: 'normal' }))).toEqual(normal);
  });

  it('treats the ideographic space as a phrase break', () => {
    expect(linesOf('むかし　むかし　ある　ところに', config('ja', KEEP))).toEqual(['むかし　むかし　', 'ある　ところに']);
  });

  it('still breaks next to punctuation, as the level allows', () => {
    // After 、 and 。: the first line ends on the mark.
    expect(linesOf('あいうえお、かきくけこ', config('ja', KEEP))).toEqual(['あいうえお、', 'かきくけこ']);
    expect(linesOf('あいうえお。かきくけこ', config('ja', KEEP))).toEqual(['あいうえお。', 'かきくけこ']);
    // Before 「, never after it.
    expect(linesOf('あいうえお「かきく」けこ', config('ja', KEEP))[0]).toBe('あいうえお');
    expect(linesOf('あいうえお「かきく」けこ', config('ja'))[0]).toBe('あいうえお「かき');
  });

  it('keeps kinsoku at the spaces: no closing mark or small kana opens a line', () => {
    // The space before 」 is no break: the line ends at the space before.
    const lines = linesOf('あいう えおかきく 」さし', config('ja', KEEP));
    expect(lines.every((l) => !/^[」、。っ]/.test(l))).toBe(true);
    expect(lines[0]).toBe('あいう');
  });

  it('breaks a phrase longer than the line inside it, where the level allows', () => {
    // Fifteen kana and no space: the line breaks as `normal` would.
    expect(linesOf('あいうえおかきくけこさしすせそ', config('ja', KEEP))).toEqual(linesOf('あいうえおかきくけこさしすせそ', config('ja')));
    // A small kana still never opens the line at ja-very-strict.
    const long = linesOf('あいうえおかきっこさしすせ', config('ja', KEEP));
    expect(long[1]).not.toMatch(/^っ/);
    expect(long.join('')).toBe('あいうえおかきっこさしすせ');
    // A short phrase before a long one goes down whole first.
    expect(linesOf('あい かきくけこさしすせそたち', config('ja', KEEP))[0]).toBe('あい');
  });

  it('never parts a Latin word from the kana next to it', () => {
    // Normal breaks after T (a CJK character follows it); keep-all keeps
    // Tシャツを together and breaks at the space.
    expect(linesOf('あいうえおか Tシャツを きる', config('ja', KEEP))).toEqual(['あいうえおか', 'Tシャツを きる']);
  });

  it('keeps Korean words (어절) whole', () => {
    const md = '나는 학교에 갑니다';
    expect(linesOf(md, config('ko', KEEP, 5))).toEqual(['나는', '학교에', '갑니다']);
    expect(linesOf(md, config('ko', {}, 5))[0]).toBe('나는 학교');
  });

  it('works in vertical text', () => {
    const vertical = config('ja', KEEP, 8, { layout: { layoutType: 'single', writingMode: 'vertical-rl' } });
    // The page is 8 characters tall in vertical text.
    vertical.page = { ...vertical.page!, width: pt(600), height: pt(8 * 20 + 40) };
    expect(linesOf(PHRASES, vertical)).toEqual(['むかし むかし', 'ある ところに', 'おじいさんが', 'いました']);
  });

  it('follows a paragraph style over the document setting', () => {
    const styled = (doc: PostextConfig['cjk'], style: 'normal' | 'keep-all') => paragraphLines(buildDocument(
      { markdown: `${PHRASES}\n\n:::paragraphs{style="p"}\n${PHRASES}\n:::\n` },
      config('ja', doc, 8, { paragraphStyles: [{ id: 'p', wordBreak: style }] }),
    )).map((ls) => ls.map((l) => l.text));
    const [plain, inStyle] = styled({}, 'keep-all');
    expect(plain![0]).toBe('むかし むかし あ');
    expect(inStyle![0]).toBe('むかし むかし');
    const [plainKeep, inNormal] = styled(KEEP, 'normal');
    expect(plainKeep![0]).toBe('むかし むかし');
    expect(inNormal![0]).toBe('むかし むかし あ');
  });

  it('leaves Chinese text as it was unless asked', () => {
    const md = '天地玄黄 宇宙洪荒 日月盈昃 辰宿列张';
    expect(linesOf(md, config('zh-Hans'))[0]).toBe('天地玄黄 宇宙洪');
    expect(linesOf(md, config('zh-Hans', KEEP, 7))).toEqual(['天地玄黄', '宇宙洪荒', '日月盈昃', '辰宿列张']);
  });
});

describe('justified keep-all lines (#463)', () => {
  const justify = (cjk: PostextConfig['cjk'], chars = 8): PostextConfig => {
    const c = config('ja', cjk, chars);
    c.bodyText = { ...c.bodyText, textAlign: 'justify' };
    return c;
  };

  it('spreads a phrase-spaced line to the measure: the spaces first, then the kana', () => {
    const [first] = paragraphLines(buildDocument({ markdown: 'むかし むかし ある ところに' }, justify(KEEP)))[0]!;
    expect(first!.text).toBe('むかし むかし');
    expect(first!.bbox.width).toBeCloseTo(160, 3);
    const space = first!.segments!.find((s) => s.kind === 'space')!;
    // Half an em, then the rest between the kana.
    expect(space.width).toBeCloseTo(10, 3);
  });

  it('spreads a line whose only stretchable gaps are word spaces (phrases glued by word joiners)', () => {
    const WJ = '⁠';
    const glue = (s: string) => [...s].join(WJ);
    const md = ['むかし', 'むかし', 'ある', 'ところに'].map(glue).join(' ');
    const [first] = paragraphLines(buildDocument({ markdown: md }, justify({})))[0]!;
    expect(first!.text).toBe('むかし むかし');
    expect(first!.bbox.width).toBeCloseTo(160, 3);
    expect(first!.ragged).toBeUndefined();
    expect(first!.segments!.find((s) => s.kind === 'space')!.width).toBeCloseTo(40, 3);
  });
});

describe('cjk.wordBreak config (#463)', () => {
  it('resolves keep-all, and leaves the resolved config as it was otherwise', () => {
    expect(resolveCjkConfig({ wordBreak: 'keep-all' }, 'ja').wordBreak).toBe('keep-all');
    expect('wordBreak' in resolveCjkConfig({}, 'ja')).toBe(false);
    expect('wordBreak' in resolveCjkConfig({ wordBreak: 'normal' }, 'zh-Hans')).toBe(false);
    expect('wordBreak' in resolveCjkConfig({ wordBreak: 'bogus' as never }, 'zh-Hans')).toBe(false);
  });

  it('strips the default and keeps keep-all', () => {
    expect(stripCjkDefaults({ wordBreak: 'normal' })).toBeUndefined();
    expect(stripCjkDefaults({ wordBreak: 'keep-all' })).toEqual({ wordBreak: 'keep-all' });
  });

  it('joins the composition key only when set', () => {
    const key = (cjk: PostextConfig['cjk']) => cjkCompositionKey(cjkCompositionOf(resolveCjkConfig(cjk, 'ja'), 96, 'ja'));
    expect(key(KEEP)).toBe(`${key({})}:ka`);
    expect(cjkCompositionOf(resolveCjkConfig({}, 'zh-Hans'), 96, 'zh-Hans')).not.toHaveProperty('keepAll');
  });

  it('resolves and strips a paragraph style’s own setting', () => {
    const body = resolveBodyTextConfig(undefined);
    const [keep, plain] = resolveParagraphStylesConfig([{ id: 'k', wordBreak: 'keep-all' }, { id: 'p' }], body);
    expect(keep!.wordBreak).toBe('keep-all');
    expect('wordBreak' in plain!).toBe(false);
    expect(stripParagraphStylesDefaults([{ id: 'n', wordBreak: 'normal' }])).toEqual([{ id: 'n', wordBreak: 'normal' }]);
  });
});
