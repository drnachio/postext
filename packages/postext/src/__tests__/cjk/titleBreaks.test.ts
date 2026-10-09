import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../index';
import type { PostextConfig } from '../../types';
import type { VDTDocument } from '../../vdt';
import { installSizedStub } from '../vertical/stub';

// Book titles kept from one-character breaks (#637, `cjk.titleMinChars`).
// The stub measures a Han character and the brackets 1 em (20 px).
installSizedStub();

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (chars: number, cjk: PostextConfig['cjk'] = {}, locale = 'zh-Hant'): PostextConfig => ({
  locale,
  page: { width: pt(chars * 20 + 40), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(20), lineHeight: pt(30), textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  cjk: { punctuationWidth: 'fullwidth', ...cjk },
});
const linesOf = (doc: VDTDocument): string[] =>
  doc.blocks.filter((b) => b.type === 'paragraph').flatMap((b) => b.lines.map((l) => l.text));

describe('book titles (cjk.titleMinChars)', () => {
  const md = '一二三四五六《說文》解字八九十一二三四五';

  it('does not end a line with one character of a title', () => {
    const lines = linesOf(buildDocument({ markdown: md }, config(8)));
    expect(lines[0]).toBe('一二三四五六');
    expect(lines[1]!.startsWith('《說文》')).toBe(true);
    for (const l of lines) expect(l.endsWith('《說')).toBe(false);
  });

  it('breaks as before with titleMinChars: 1', () => {
    expect(linesOf(buildDocument({ markdown: md }, config(8, { titleMinChars: 1 })))).toEqual(['一二三四五六《說', '文》解字八九十一', '二三四五']);
  });

  it('leaves at least two characters of a longer title on either side', () => {
    // 》 may not open a line, so 論》 would go down alone: one character of
    // the title after the break. Two go down instead.
    const text = '一二《紅樓夢評論》八九十一二三四';
    expect(linesOf(buildDocument({ markdown: text }, config(8, { titleMinChars: 1 })))[0]).toBe('一二《紅樓夢評');
    expect(linesOf(buildDocument({ markdown: text }, config(8)))[0]).toBe('一二《紅樓夢');
    // Three a side: a title of five (2 × 3 − 1) is never broken.
    expect(linesOf(buildDocument({ markdown: text }, config(8, { titleMinChars: 3 })))[0]).toBe('一二');
    expect(linesOf(buildDocument({ markdown: '一二三《紅樓夢評論》八九十一二三四' }, config(8, { titleMinChars: 3 })))[0]).toBe('一二三');
  });

  it('keeps 〈…〉 titles and :book[…] titles too', () => {
    const angle = linesOf(buildDocument({ markdown: '一二三四五六〈說文〉解字八九十一' }, config(8)));
    expect(angle[0]).toBe('一二三四五六');
    // A :book title set with the wavy line has no brackets: its run is the
    // title.
    const wavy = linesOf(buildDocument({ markdown: '一二三四五六七:book[說文]解字八九' }, config(8, { bookTitleMark: 'wavy' })));
    expect(wavy[0]).toBe('一二三四五六七');
    expect(wavy[1]!.startsWith('說文')).toBe(true);
  });

  it('a title longer than the line still breaks', () => {
    const lines = linesOf(buildDocument({ markdown: '《一二三四五六七八九十一二》也' }, config(6)));
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(6);
  });

  it('yields when no other break fits the line', () => {
    // A three-character title (never broken at the default) on a line two
    // characters wide: the line breaks inside it rather than overflow.
    const lines = linesOf(buildDocument({ markdown: '《說文解》' }, config(3)));
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(3);
  });

  it('applies in vertical text', () => {
    const vertical = (cjk: PostextConfig['cjk']): PostextConfig => ({ ...config(8, cjk), layout: { layoutType: 'single', writingMode: 'vertical-rl' }, page: { width: pt(400), height: pt(8 * 20 + 40), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } } });
    expect(linesOf(buildDocument({ markdown: md }, vertical({})))[0]).toBe('一二三四五六');
    expect(linesOf(buildDocument({ markdown: md }, vertical({ titleMinChars: 1 })))[0]).toBe('一二三四五六《說');
  });
});

describe('book titles marked :book[…] in Japanese text', () => {
  it('keeps the brackets the region adds (『』) as a title', () => {
    const ja = (cjk: PostextConfig['cjk']): PostextConfig => ({ ...config(8, cjk, 'ja'), cjk: { punctuationWidth: 'fullwidth', lineBreak: 'ja-strict', ...cjk } });
    const md = '一二三四五六:book[説文]解字八九十一';
    expect(linesOf(buildDocument({ markdown: md }, ja({ titleMinChars: 1 })))[0]).toBe('一二三四五六『説');
    expect(linesOf(buildDocument({ markdown: md }, ja({})))[0]).toBe('一二三四五六');
  });
});
