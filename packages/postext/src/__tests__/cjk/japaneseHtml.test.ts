import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../index';
import { renderToHtml, renderToHtmlIndexed } from '../../html-backend';
import type { PostextConfig } from '../../types';
import type { VDTDocument, VDTLine, VDTLineSegment, VDTRuby } from '../../vdt';
import { installSizedStub } from '../vertical/stub';
import { verticalSpans } from '../vertical/verticalSpans';

// #428: the HTML backend writes a ruby base and its reading as a semantic
// <ruby> (the positioned boxes unchanged inside it), and a Japanese
// document's pages declare their language.
installSizedStub();

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (extra: Partial<PostextConfig> = {}): PostextConfig => ({
  locale: 'ja',
  page: { width: pt(440), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(20), lineHeight: pt(40), textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  ...extra,
});
const vertical = (extra: Partial<PostextConfig> = {}) => config({ layout: { layoutType: 'single', writingMode: 'vertical-rl' }, ...extra });

const MD = '吾輩は{猫|ねこ}である。{漢字|かん|じ}を:ruby[東京]{rt="とうきょう" group}で[{学|まな}ぶ](https://example.com)。';
const RUBY_OPEN = '<ruby style="all:inherit;display:contents;">';
const RT_OPEN = '<rt style="all:inherit;display:contents;">';

const lines = (doc: VDTDocument): VDTLine[] => doc.blocks.filter((b) => b.type === 'paragraph').flatMap((b) => b.lines);
const rubySegs = (doc: VDTDocument): VDTLineSegment[] => lines(doc).flatMap((l) => l.segments ?? []).filter((s) => s.ruby);

/** Every <ruby>, <rt> and <a> of `html` closed in the order it opened. */
function expectNested(html: string): void {
  const stack: string[] = [];
  for (const m of html.matchAll(/<(\/?)(ruby|rt|a)\b/g)) {
    if (m[1]) expect(stack.pop(), html).toBe(m[2]);
    else {
      // An <rt> sits right inside a <ruby>; a <ruby> never inside another.
      if (m[2] === 'rt') expect(stack[stack.length - 1]).toBe('ruby');
      if (m[2] === 'ruby') expect(stack).not.toContain('ruby');
      stack.push(m[2]!);
    }
  }
  expect(stack).toEqual([]);
}

/** A copy of `doc` whose ruby segments at `indices` (in reading order)
 *  carry the annotation id `id` (`VDTRuby.id`, #422). */
function withRubyId(doc: VDTDocument, indices: number[], id: number): VDTDocument {
  const copy = structuredClone(doc);
  const segs = rubySegs(copy);
  for (const i of indices) (segs[i]!.ruby as VDTRuby & { id?: number }).id = id;
  return copy;
}

describe('semantic ruby in horizontal HTML (#428)', () => {
  it('sets each base and its reading in a <ruby>, the reading in an <rt> assistive technology reads', () => {
    const doc = buildDocument({ markdown: MD }, config());
    const html = renderToHtml(doc);
    const segs = rubySegs(doc);
    // 猫, 漢, 字 (mono: one reading each), 東京 (group), 学.
    expect(segs.map((s) => s.text)).toEqual(['猫', '漢', '字', '東京', '学']);
    expect(html.match(/<ruby\b/g)).toHaveLength(segs.length);
    for (const s of segs) {
      const run = s.ruby!.runs[0]!;
      // The base box (painted from its ink offset), then the reading's box
      // at its place (the segment's start plus the run's dx), without
      // aria-hidden.
      const m = new RegExp(`${RUBY_OPEN}(?:<a [^>]*>)?<span style="position:absolute;left:([\\d.]+)px;top:0;white-space:pre;">${s.text}</span>${RT_OPEN}<span style="position:absolute;left:([\\d.]+)px;top:(-?[\\d.]+)px;white-space:pre;"><span style="font:[^"]*">${s.ruby!.text}</span></span></rt></ruby>`).exec(html);
      expect(m, s.text).not.toBeNull();
      expect(+m![2]! - +m![1]!).toBeCloseTo(run.dx - (s.inkOffset ?? 0), 3);
      expect(+m![3]!).toBeCloseTo(run.dy, 3);
    }
    expect(html).not.toMatch(/aria-hidden="true"[^>]*><span style="font:[^"]*">(ねこ|かん|じ|とうきょう|まな)</);
    expectNested(html);
  });

  it('keeps the reading boxes outside any other box: the line paints as before', () => {
    const html = renderToHtml(buildDocument({ markdown: MD }, config()));
    // Taking the elements out leaves the markup the backend wrote before
    // them (#194), the readings then hidden from assistive technology.
    const bare = html.replace(/<\/?ruby[^>]*>|<\/?rt[^>]*>/g, '');
    expect(bare).not.toContain('display:contents;"><span');
    expect(bare.match(/position:absolute;left:[\d.]+px;top:-[\d.]+px;white-space:pre;/g)).toHaveLength(5);
  });

  it('sets the bases of one annotation (VDTRuby.id) in one <ruby>, a reading after each', () => {
    const doc = buildDocument({ markdown: MD }, config());
    const html = renderToHtml(withRubyId(doc, [1, 2], 7));
    expect(html.match(/<ruby\b/g)).toHaveLength(4);
    expect(html).toMatch(new RegExp(`${RUBY_OPEN}<span [^>]*>漢</span>${RT_OPEN}.*?かん.*?</rt><span [^>]*>字</span>${RT_OPEN}.*?じ.*?</rt></ruby>`));
    expectNested(html);
    // Two annotations next to each other stay two.
    const apart = renderToHtml(withRubyId(withRubyId(doc, [1], 7), [2], 8));
    expect(apart.match(/<ruby\b/g)).toHaveLength(5);
  });

  it('never lets a <ruby> straddle a link', () => {
    const doc = withRubyId(buildDocument({ markdown: '{東|とう}[{京|きょう}](https://example.com)の話。' }, config()), [0, 1], 3);
    const html = renderToHtml(doc);
    expectNested(html);
    expect(html.match(/<ruby\b/g)).toHaveLength(2);
  });

  it('writes Chinese ruby, zhuyin and warichu in the same elements, the note rows still read once', () => {
    const doc = buildDocument({ markdown: '輕忽{紅樓|hóng|lóu}:ruby[滿]{rt="ㄇㄢˇ"}寶玉:warichu[甲戌側批此是]道' }, config({ locale: 'zh-Hant-TW' }));
    const html = renderToHtml(doc);
    expect(html.match(/<ruby\b/g)).toHaveLength(3);
    expect(html).toContain('role="note" aria-label="甲戌側批此是"');
    expect(html).toMatch(/aria-label="甲戌側批此是"><span aria-hidden="true"/);
    expectNested(html);
  });
});

describe('semantic ruby in vertical HTML (#428)', () => {
  /** The upright box of each line. */
  const uprights = (html: string): string[] => html.split('class="pt-line"').slice(1).map((box) => box.slice(box.indexOf('writing-mode:vertical-rl'), box.indexOf('</div>')));

  it('sets each base and its reading down the column inside a <ruby>, where they were', () => {
    const doc = buildDocument({ markdown: MD }, vertical());
    const html = renderToHtml(doc, { mode: 'single' });
    const segs = rubySegs(doc);
    expect(html.match(/<ruby\b/g)).toHaveLength(segs.length);
    expectNested(html);
    const up = uprights(html).join('');
    // The reading of 猫 at the base's place plus its dx, beside the column.
    const runs = verticalSpans(up);
    const neko = runs.find((r) => r.text === 'ねこ')!;
    const base = runs.find((r) => r.text === '猫' && r.size === undefined)!;
    expect(neko.top - base.top).toBeCloseTo(segs[0]!.ruby!.runs[0]!.dx - (segs[0]!.inkOffset ?? 0), 3);
    expect(up).toMatch(new RegExp(`${RUBY_OPEN}<span style="position:absolute;top:[\\d.]+px;right:0;[^"]*">猫</span>${RT_OPEN}<span style="position:absolute;[^"]*">ねこ</span></rt></ruby>`));
  });

  it('joins the bases of one annotation in vertical text too', () => {
    const doc = withRubyId(buildDocument({ markdown: MD }, vertical()), [1, 2], 1);
    const html = renderToHtml(doc, { mode: 'single' });
    expect(html.match(/<ruby\b/g)).toHaveLength(4);
    expect(html).toMatch(/>漢<\/span><rt [^>]*>.*?かん.*?<\/rt><span [^>]*>字<\/span><rt [^>]*>.*?じ.*?<\/rt><\/ruby>/);
    expectNested(html);
  });
});

describe('page language (#428)', () => {
  const pageTag = (html: string): string => /<div class="pt-page"[^>]*>/.exec(html)![0];

  it('a Japanese document\'s pages declare it, for a host that mounts them apart from the root', () => {
    const indexed = renderToHtmlIndexed(buildDocument({ markdown: '吾輩は猫である。' }, config()));
    expect(indexed.html).toContain('<div class="pt-doc" lang="ja"');
    expect(pageTag(indexed.html)).toContain(' lang="ja"');
    expect(pageTag(indexed.html)).not.toContain('dir=');
  });

  it('other documents\' pages are as before', () => {
    expect(pageTag(renderToHtml(buildDocument({ markdown: '天地玄黄。' }, config({ locale: 'zh-Hans' }))))).not.toContain('lang=');
    expect(pageTag(renderToHtml(buildDocument({ markdown: 'Plain text.' }, config({ locale: 'en' }))))).not.toContain('lang=');
    expect(pageTag(renderToHtml(buildDocument({ markdown: 'نص عربي.' }, config({ locale: 'ar' }))))).toContain(' dir="rtl" lang="ar"');
  });
});
