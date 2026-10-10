import { describe, it, expect } from 'vitest';
import { buildDocument } from '../index';
import type { PostextConfig } from '../types';
import type { VDTBlock, VDTDocument, VDTLineSegment } from '../vdt';
import { installSizedStub } from './vertical/stub';

// A heading number joins the title's first span only when that span is
// plain text: a ruby base, emphasis dots, a name or title line, a warichu,
// a tcy cell or a language tag leave the number a span of its own, so the
// annotation never covers it (#638). CJK characters measure 1 em, Latin
// letters ½ em (`vertical/stub.ts`).
installSizedStub();

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (extra: Partial<PostextConfig> = {}, numbered = true): PostextConfig => ({
  locale: 'zh-Hant-TW',
  page: { width: pt(440), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(20), lineHeight: pt(40), textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  ...(numbered ? { headings: { levels: [{ level: 1, numberingTemplate: '第{1}課' }] } } : {}),
  ...extra,
});
const vertical: Partial<PostextConfig> = { layout: { layoutType: 'single', writingMode: 'vertical-rl' } };

const heading = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'heading')!;
const segmentsOf = (b: VDTBlock): VDTLineSegment[] => b.lines.flatMap((l) => l.segments ?? []).filter((s) => s.kind === 'text');
const build = (md: string, extra: Partial<PostextConfig> = {}, numbered = true): VDTBlock =>
  heading(buildDocument({ markdown: `${md}\n\n正文。` }, config(extra, numbered)));

describe('a heading number and the title\'s first span (#638)', () => {
  const cases: Array<[string, string, Partial<PostextConfig>]> = [
    ['pinyin ruby, horizontal', '# {寓言|yù|yán}兩則', {}],
    ['pinyin ruby, vertical', '# {寓言|yù|yán}兩則', vertical],
    ['zhuyin, horizontal (right of the base)', '# {寓言|ㄩˋ|ㄧㄢˊ}兩則', {}],
    ['zhuyin, vertical', '# {寓言|ㄩˋ|ㄧㄢˊ}兩則', vertical],
  ];
  for (const [name, md, extra] of cases) {
    it(`keeps a ruby base to its own character: ${name}`, () => {
      const segs = segmentsOf(build(md, extra));
      expect(segs.slice(0, 3).map((s) => s.text).join('')).toBe('第1課');
      const firstRuby = segs.find((s) => s.ruby)!;
      expect(firstRuby.text).toBe('寓');
      // The base is one character wide, as in the same title unnumbered.
      const unnumbered = segmentsOf(build(md, extra, false)).find((s) => s.ruby)!;
      expect(unnumbered.text).toBe('寓');
      expect(firstRuby.ruby!.baseWidth).toBe(unnumbered.ruby!.baseWidth);
      expect(firstRuby.ruby!.position).toBe(unnumbered.ruby!.position);
      // No reading lands on the number.
      expect(segs.filter((s) => s.text.includes('第') || s.text.includes('課')).every((s) => !s.ruby)).toBe(true);
    });
  }

  it('zhuyin stands right of the base in horizontal text', () => {
    const seg = segmentsOf(build('# {寓言|ㄩˋ|ㄧㄢˊ}兩則')).find((s) => s.ruby)!;
    expect(seg.ruby!.position).toBe('right');
  });

  const marked: Array<[string, string, Partial<PostextConfig>, (s: VDTLineSegment) => boolean]> = [
    ['emphasis dots', '# :dots[文字]之美', {}, (s) => !!s.cjkMarks],
    ['emphasis dots', '# :dots[文字]之美', vertical, (s) => !!s.cjkMarks],
    ['a book title', '# :book[石頭記]考', {}, (s) => !!s.cjkMarks],
    ['a book title', '# :book[石頭記]考', vertical, (s) => !!s.cjkMarks],
    ['a proper name', '# :name[賈寶玉]傳', {}, (s) => !!s.cjkMarks],
    ['a proper name', '# :name[賈寶玉]傳', vertical, (s) => !!s.cjkMarks],
    ['a warichu', '# :warichu[甲戌側批]正文', {}, (s) => !!s.warichu],
    ['a warichu', '# :warichu[甲戌側批]正文', vertical, (s) => !!s.warichu],
    ['a tcy cell', '# :tcy[12]月', vertical, (s) => !!s.tcy],
    // Segments carry an isolate's language in Japanese text.
    ['a language tag', '# :ltr[Moby Dick]{lang=en}を読む', { locale: 'ja' }, (s) => s.lang === 'en'],
    ['a language tag', '# :ltr[Moby Dick]{lang=en}を読む', { ...vertical, locale: 'ja' }, (s) => s.lang === 'en'],
  ];
  for (const [name, md, extra, carries] of marked) {
    it(`leaves the number unmarked before ${name} (${extra.layout?.writingMode === 'vertical-rl' ? 'vertical' : 'horizontal'})`, () => {
      const segs = segmentsOf(build(md, extra));
      // The leading segments that hold the number: 第1課, nothing else.
      const numberSegs: VDTLineSegment[] = [];
      for (const s of segs) {
        if (numberSegs.map((n) => n.text).join('').replace(/\s/g, '').length >= 3) break;
        numberSegs.push(s);
      }
      expect(numberSegs.map((s) => s.text).join('').replace(/\s/g, '')).toBe('第1課');
      for (const s of numberSegs) {
        expect(s.ruby).toBeUndefined();
        expect(s.cjkMarks).toBeUndefined();
        expect(s.warichu).toBeUndefined();
        expect(s.tcy).toBeUndefined();
        expect(s.lang).toBeUndefined();
      }
      // The annotated run keeps its mark.
      expect(segs.slice(numberSegs.length).some(carries)).toBe(true);
    });
  }

  it('keeps a plain Latin title joined to its number, as before', () => {
    const doc = buildDocument(
      { markdown: '# Introduction\n\nText.' },
      config({ locale: 'en', headings: { levels: [{ level: 1, numberingTemplate: '{1}.' }] } }),
    );
    const block = heading(doc);
    expect(block.numberPrefix).toBe('1.');
    expect(block.lines.map((l) => l.text).join('')).toBe('1. Introduction');
    const segs = block.lines.flatMap((l) => l.segments ?? []);
    expect(segs.map((s) => [s.kind, s.text, s.width])).toEqual([['text', '1.', 18], ['space', ' ', 4.5], ['text', 'Introduction', 108]]);
  });
});
