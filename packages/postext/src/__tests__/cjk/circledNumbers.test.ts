import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../index';
import type { PostextConfig } from '../../types';
import type { VDTDocument, VDTLine } from '../../vdt';
import { cjkClassOf, isCjkGrapheme, isLabelEndProhibited, setCjkCircledNumbers } from '../../measure/cjkClasses';
import { installSizedStub } from '../vertical/stub';

// Circled numbers set as Chinese characters (#637, `cjk.circledNumbers`).
// The stub measures a Han character 1 em (20 px) and ① half an em in
// horizontal text; a vertical cell is 1 em.
installSizedStub();

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (chars: number, cjk: PostextConfig['cjk'] = {}): PostextConfig => ({
  locale: 'zh-Hant',
  page: { width: pt(chars * 20 + 40), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(20), lineHeight: pt(30), textAlign: 'left', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  cjk: { punctuationWidth: 'fullwidth', lineBreak: 'gb', ...cjk },
});
const vertical = (chars: number, cjk: PostextConfig['cjk'] = {}): PostextConfig => ({
  ...config(chars, cjk),
  layout: { layoutType: 'single', writingMode: 'vertical-rl' },
  page: { width: pt(400), height: pt(chars * 20 + 40), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
});
const paragraphLines = (doc: VDTDocument): VDTLine[] =>
  doc.blocks.filter((b) => b.type === 'paragraph').flatMap((b) => b.lines);
const linesOf = (doc: VDTDocument): string[] => paragraphLines(doc).map((l) => l.text);

describe('circled numbers (cjk.circledNumbers)', () => {
  it('are CJK characters in their class', () => {
    for (const g of ['①', '⑳', '⑴', '⒈', 'ⓐ', '❶', '➀', '➓']) {
      expect(isCjkGrapheme(g)).toBe(true);
      expect(cjkClassOf(g)).toBe('ideograph');
    }
    expect(isLabelEndProhibited('①', 'gb')).toBe(true);
    expect(isLabelEndProhibited('①', 'strict')).toBe(true);
    expect(isLabelEndProhibited('①', 'ja-strict')).toBe(true);
    expect(isLabelEndProhibited('①', 'basic')).toBe(true);
    expect(isLabelEndProhibited('①', 'none')).toBe(false);
    expect(isLabelEndProhibited('①', 'ja-loose')).toBe(false);
    expect(isLabelEndProhibited('天', 'gb')).toBe(false);
    const prev = setCjkCircledNumbers(false);
    try {
      expect(isCjkGrapheme('①')).toBe(false);
      expect(cjkClassOf('①')).toBe('western');
      expect(isLabelEndProhibited('①', 'gb')).toBe(false);
    } finally {
      setCjkCircledNumbers(prev);
    }
  });

  it('take no Han–Latin space and a cell of their own', () => {
    const [line] = paragraphLines(buildDocument({ markdown: '義項①天也。②顛也。' }, config(20)));
    const segs = line!.segments!;
    expect(segs.some((s) => s.kind === 'space')).toBe(false);
    expect(line!.text).toBe('義項①天也。②顛也。');
    // The same paragraph as Western letters: a quarter em beside each Han
    // character (none after 。).
    const [legacy] = paragraphLines(buildDocument({ markdown: '義項①天也。②顛也。' }, config(20, { circledNumbers: 'western' })));
    expect(legacy!.segments!.filter((s) => s.kind === 'space' && s.autospace).map((s) => s.width)).toEqual([5, 5, 5]);
  });

  it('never end a line when text follows them', () => {
    const md = '一二三四五六七①天也②顛也';
    expect(linesOf(buildDocument({ markdown: md }, config(8, { circledNumbers: 'western' })))[0]).toBe('一二三四五六七①');
    const lines = linesOf(buildDocument({ markdown: md }, config(8)));
    expect(lines[0]).toBe('一二三四五六七');
    expect(lines[1]!.startsWith('①天也')).toBe(true);
    // A bold sense number (`**①**`) is kept with the text after it too.
    const bold = linesOf(buildDocument({ markdown: '此開卷第一回**①**作者自云' }, config(7)));
    expect(bold).toEqual(['此開卷第一回', '①作者自云']);
    // So does `basic`, Taiwan's level; `none` lets a line end on one.
    expect(linesOf(buildDocument({ markdown: md }, config(8, { lineBreak: 'basic' })))[0]).toBe('一二三四五六七');
    expect(linesOf(buildDocument({ markdown: md }, config(8, { lineBreak: 'none' })))[0]).toBe('一二三四五六七①');
  });

  it('stand upright in a cell of vertical text, with no space around them', () => {
    const [line] = paragraphLines(buildDocument({ markdown: '義項①天也。' }, vertical(20)));
    expect(line!.segments!.some((s) => s.kind === 'space')).toBe(false);
    expect(line!.segments!.some((s) => s.orientation === 'sideways')).toBe(false);
    // One em along the line: six cells.
    const width = line!.segments!.reduce((w, s) => w + s.width, 0);
    expect(width).toBeCloseTo(6 * 20, 6);
    const lines = linesOf(buildDocument({ markdown: '一二三四五六七①天也②顛也' }, vertical(8)));
    expect(lines[0]).toBe('一二三四五六七');
  });
});
