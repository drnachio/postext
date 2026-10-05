import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../index';
import type { PostextConfig } from '../../types';
import type { VDTDocument, VDTLine, VDTLineSegment } from '../../vdt';
import { installSizedStub } from '../vertical/stub';

// Japanese kinsoku (#417) through a build: the level `cjk.lineBreak`
// resolves to, and the rows of a warichu note. The stub measures kana and
// kanji 1 em, at the size the font names.
installSizedStub();

const pt = (value: number) => ({ value, unit: 'pt' as const });
/** 72 dpi, 20 px text, a measure of `chars` characters. */
const config = (locale: string, cjk: PostextConfig['cjk'] = {}, chars = 20): PostextConfig => ({
  locale,
  page: { width: pt(chars * 20 + 40), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(20), lineHeight: pt(30), textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  cjk,
});

const lines = (doc: VDTDocument): VDTLine[] => doc.blocks.filter((b) => b.type === 'paragraph').flatMap((b) => b.lines);
const segments = (doc: VDTDocument): VDTLineSegment[] => lines(doc).flatMap((l) => l.segments ?? []);

describe('Japanese kinsoku in a build (#417)', () => {
  // Five characters to a line: っ is the sixth.
  const md = 'あいうえおっとりした人たち';

  it('keeps a small kana off the line start in a Japanese document (auto: ja-very-strict)', () => {
    expect(lines(buildDocument({ markdown: md }, config('ja', {}, 5))).map((l) => l.text)).toEqual(['あいうえ', 'おっとりし', 'た人たち']);
    expect(lines(buildDocument({ markdown: md }, config('ja', { lineBreak: 'ja-strict' }, 5))).map((l) => l.text)).toEqual(['あいうえお', 'っとりした', '人たち']);
  });

  it('leaves Chinese documents as they were: a small kana may open a line', () => {
    expect(lines(buildDocument({ markdown: md }, config('zh-Hans', {}, 5))).map((l) => l.text)).toEqual(['あいうえお', 'っとりした', '人たち']);
  });

  it('never opens the lower row of a warichu note with a small kana at ja-very-strict', () => {
    const lower = (locale: string, cjk: PostextConfig['cjk'] = {}): string => segments(buildDocument({ markdown: '寶玉:warichu[あいうっえか]道' }, config(locale, cjk))).find((s) => s.warichu)!.warichu!.lower;
    expect(lower('ja')).not.toMatch(/^っ/);
    expect(lower('ja', { lineBreak: 'ja-strict' })).toMatch(/^っ/);
    expect(lower('zh-Hans')).toMatch(/^っ/);
  });
});
