import { describe, expect, it } from 'vitest';
import type { PostextConfig, VDTDocument, VDTLine, VDTLineSegment, VDTRuby } from 'postext';
import { baseConfig, layOut } from './__tests__/vdt';
import { checkXml } from './__tests__/xml';
import { buildReflowablePublication } from '.';
import { appendLine, type InlineContext, type TextSink } from './inline';
import { buildOpf } from '../package/pack';

// #428: a Japanese book in reflowable EPUB keeps what the print shows in
// CSS reading systems understand: kinsoku as `line-break`, burasagari as
// `hanging-punctuation`, the configured emphasis marks, upright digits and
// !? pairs, the space after ？！, and jukugo ruby in one <ruby>.

const ja = (extra: Partial<PostextConfig> = {}): PostextConfig => ({ ...baseConfig, locale: 'ja', ...extra });
const jaVertical = (extra: Partial<PostextConfig> = {}): PostextConfig => ja({ layout: { writingMode: 'vertical-rl' }, page: { ...baseConfig.page, binding: 'right' }, ...extra });

async function render(docs: VDTDocument[], language = 'ja') {
  const pub = await buildReflowablePublication(docs, { layout: 'reflowable', metadata: { title: 'こころ', language, modified: new Date(Date.UTC(2026, 9, 5)) } });
  const xhtml = pub.items.filter((i) => i.mediaType === 'application/xhtml+xml').map((i) => i.data as string);
  for (const doc of xhtml) expect(checkXml(doc).errors).toEqual([]);
  const css = pub.items.filter((i) => i.mediaType === 'text/css').map((i) => String(i.data)).join('\n');
  return { pub, all: xhtml.join('\n'), css };
}

/** The declarations of the first rule of `selector` in `css`. */
const ruleOf = (css: string, selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};

const TEXT = '吾輩は{猫|ねこ}である。名前はまだ無い。*学ぶ*こと、何でも薄暗い12月の所で、なに!?と2026年に泣いていた。';

describe('Japanese stylesheet', () => {
  it('writes the kinsoku level as line-break and burasagari as hanging-punctuation', async () => {
    const levels: [NonNullable<NonNullable<PostextConfig['cjk']>['lineBreak']> | undefined, string][] = [
      [undefined, 'strict'], ['ja-very-strict', 'strict'], ['ja-strict', 'normal'], ['ja-loose', 'loose'],
    ];
    for (const [lineBreak, css] of levels) {
      const body = ruleOf((await render([layOut(TEXT, ja(lineBreak ? { cjk: { lineBreak } } : {}))])).css, 'body');
      expect(body, lineBreak).toContain(`line-break: ${css};\n  -epub-line-break: ${css};\n  -webkit-line-break: ${css};`);
      expect(body, lineBreak).toContain('hanging-punctuation: allow-end;');
    }
    const forced = ruleOf((await render([layOut(TEXT, ja({ cjk: { hangingPunctuation: 'force' } }))])).css, 'body');
    expect(forced).toContain('hanging-punctuation: force-end;');
    const none = ruleOf((await render([layOut(TEXT, ja({ cjk: { hangingPunctuation: 'none' } }))])).css, 'body');
    expect(none).not.toContain('hanging-punctuation');
    // A Chinese level in a Japanese book writes no line-break, as before.
    expect(ruleOf((await render([layOut(TEXT, ja({ cjk: { lineBreak: 'strict' } }))])).css, 'body')).not.toContain('line-break');
  });

  it('writes nothing new for a Chinese or a Latin book', async () => {
    for (const config of [
      { ...baseConfig, locale: 'zh-Hans', layout: { writingMode: 'vertical-rl' as const } },
      { ...baseConfig, locale: 'zh-Hant-TW', cjk: { hangingPunctuation: 'allow' as const } },
      baseConfig,
    ]) {
      const { css, all } = await render([layOut('天地玄黄，*宇宙*洪荒？日月12盈昃!?', config)], 'zh-Hans');
      expect(css).not.toMatch(/line-break|hanging-punctuation|\.pt-dots\.pt-dots-/);
      expect(all).not.toContain('pt-tcy');
      expect(all).not.toContain('　');
      expect(all).not.toMatch(/pt-dots-/);
    }
  });
});

describe('Japanese emphasis marks', () => {
  it('writes the sesame over horizontal text with its own classes and rules', async () => {
    const { all, css } = await render([layOut(TEXT, ja())]);
    expect(all).toContain('<span class="pt-dots pt-dots-filled-sesame pt-dots-over">学ぶ</span>');
    expect(ruleOf(css, '.pt-dots.pt-dots-filled-sesame')).toContain('text-emphasis-style: filled sesame;\n  -epub-text-emphasis-style: filled sesame;\n  -webkit-text-emphasis-style: filled sesame;');
    expect(ruleOf(css, '.pt-dots.pt-dots-over')).toContain('text-emphasis-position: over right;\n  -webkit-text-emphasis-position: over right;');
    // The Chinese rule stays as it was, under the others.
    expect(ruleOf(css, '.pt-dots')).toContain('text-emphasis: filled dot;');
    expect(css.indexOf('\n.pt-dots {')).toBeLessThan(css.indexOf('\n.pt-dots.pt-dots-filled-sesame {'));
  });

  it('right of vertical text is the default side: only the shape is classed', async () => {
    const { all, css } = await render([layOut(TEXT, jaVertical())]);
    expect(all).toContain('<span class="pt-dots pt-dots-filled-sesame">学ぶ</span>');
    expect(css).not.toContain('.pt-dots.pt-dots-over');
  });

  it('follows cjk.emphasisMark and the attributes of :dots, left of vertical text too', async () => {
    const { all, css } = await render([layOut(':dots[白丸]{style=circle fill=open}と:dots[左]{pos=under}と*点*', jaVertical({ cjk: { emphasisMark: { style: 'dot' } } }))]);
    expect(all).toContain('<span class="pt-dots pt-dots-open-circle">白丸</span>');
    expect(all).toContain('<span class="pt-dots pt-dots-under">左</span>');
    expect(all).toContain('<span class="pt-dots">点</span>');
    expect(ruleOf(css, '.pt-dots.pt-dots-open-circle')).toContain('text-emphasis-style: open circle;');
    expect(ruleOf(css, '.pt-dots.pt-dots-under')).toContain('text-emphasis-position: under left;');
  });
});

describe('Japanese vertical text', () => {
  it('sets the short numbers and the !? pairs the print sets upright in one cell as .pt-tcy', async () => {
    const { all } = await render([layOut(TEXT, jaVertical())]);
    expect(all).toContain('薄暗い<span class="pt-tcy">12</span>月');
    expect(all).toContain('なに<span class="pt-tcy">!?</span>と');
    // Four digits run sideways in the print (uprightDigits 2): plain.
    expect(all).toContain('と2026年');
    // An author's :tcy is written once.
    const own = (await render([layOut('第:tcy[100]号', jaVertical())])).all;
    expect(own).toContain('第<span class="pt-tcy">100</span>号');
    expect(own).not.toContain('pt-tcy"><span class="pt-tcy');
  });

  it('follows cjk.uprightDigits, and horizontal text has none', async () => {
    expect((await render([layOut(TEXT, jaVertical({ cjk: { uprightDigits: 4 } }))])).all).toContain('<span class="pt-tcy">2026</span>');
    expect((await render([layOut(TEXT, jaVertical({ cjk: { uprightDigits: 0 } }))])).all).not.toContain('<span class="pt-tcy">12</span>');
    expect((await render([layOut(TEXT, ja())])).all).not.toContain('pt-tcy');
  });

  it('names the writing mode in the package', async () => {
    const { pub } = await render([layOut(TEXT, jaVertical())]);
    expect(pub.writingMode).toBe('vertical-rl');
    expect(pub.pageProgression).toBe('rtl');
    expect(buildOpf(pub)).toContain('<meta name="primary-writing-mode" content="vertical-rl"/>');
    const horizontal = (await render([layOut(TEXT, ja())])).pub;
    expect(horizontal.writingMode).toBeUndefined();
    expect(buildOpf(horizontal)).not.toContain('primary-writing-mode');
  });
});

describe('the space after ？ and ！', () => {
  it('is an ideographic space inside a line and where a printed line ended on the mark', async () => {
    const { all } = await render([layOut('なぜ？それは「本当！」と言った。どうして！？なぜ', ja())]);
    // None before a closing bracket or between two marks.
    expect(all).toContain('なぜ？　それは「本当！」と言った。どうして！？　なぜ');
    const sink: TextSink = { inl: [] };
    const ctx: InlineContext = { doc: 0, lang: 'ja', basePx: 16, noteRef: () => true, spaceAfterQuestion: true };
    appendLine(sink, line([seg('どこで生れたかとんと見当がつかぬ？')]), ctx);
    appendLine(sink, line([seg('何でも')]), ctx);
    appendLine(sink, line([seg('なぜ？')]), ctx);
    appendLine(sink, line([seg('」と')]), ctx);
    expect(sink.inl.map((i) => (i.t === 'text' ? i.text : '')).join('')).toBe('どこで生れたかとんと見当がつかぬ？　何でもなぜ？」と');
  });

  it('keeps a space the author typed and writes none with the setting off', async () => {
    expect((await render([layOut('なぜ？　それは', ja())])).all).toContain('なぜ？　それは');
    expect((await render([layOut('なぜ？それは', ja({ cjk: { spaceAfterQuestion: false } }))])).all).toContain('なぜ？それは');
  });
});

const seg = (text: string, extra: Partial<VDTLineSegment> = {}): VDTLineSegment => ({ kind: 'text', text, width: 0, ...extra });
const line = (segments: VDTLineSegment[]): VDTLine => ({
  text: segments.map((s) => s.text).join(''),
  bbox: { x: 0, y: 0, width: 0, height: 0 },
  baseline: 0,
  hyphenated: false,
  segments,
});
/** A ruby base of the annotation `id` (`VDTRuby.id`, #422). */
const base = (text: string, reading: string, id?: number, extra: Partial<VDTLineSegment> = {}): VDTLineSegment =>
  seg(text, { ruby: { text: reading, fontString: '8px serif', baseWidth: 0, rtWidth: 0, position: 'over', runs: [], ...(id !== undefined ? { id } : {}) } as VDTRuby, ...extra });

describe('jukugo ruby', () => {
  const ctx: InlineContext = { doc: 0, lang: 'ja', basePx: 16, noteRef: () => true };
  const xhtml = (sink: TextSink): string => sink.inl.map((i) => (i.t === 'raw' ? i.xhtml : i.t === 'text' ? i.text : '')).join('');

  it('sets the bases of one annotation in one <ruby>, a reading after each', () => {
    const sink: TextSink = { inl: [] };
    appendLine(sink, line([base('東', 'とう', 1), base('京', 'きょう', 1), seg('と'), base('京', 'きょう', 2), base('都', 'と', 2), base('猫', 'ねこ')]), ctx);
    expect(xhtml(sink)).toBe('<ruby>東<rt>とう</rt>京<rt>きょう</rt></ruby>と<ruby>京<rt>きょう</rt>都<rt>と</rt></ruby><ruby>猫<rt>ねこ</rt></ruby>');
  });

  it('gives a word a line break cut its one <ruby> back', () => {
    const sink: TextSink = { inl: [] };
    appendLine(sink, line([seg('に'), base('東', 'とう', 4)]), ctx);
    appendLine(sink, line([base('京', 'きょう', 4), seg('で')]), ctx);
    expect(xhtml(sink)).toBe('に<ruby>東<rt>とう</rt>京<rt>きょう</rt></ruby>で');
  });

  it('keeps bases without an id apart (a Chinese mono ruby), and annotations under two links', () => {
    const sink: TextSink = { inl: [] };
    appendLine(sink, line([base('紅', 'hóng'), base('樓', 'lóu')]), ctx);
    expect(xhtml(sink)).toBe('<ruby>紅<rt>hóng</rt></ruby><ruby>樓<rt>lóu</rt></ruby>');
    const linked: TextSink = { inl: [] };
    appendLine(linked, line([base('東', 'とう', 1), base('京', 'きょう', 1, { href: 'https://example.com' })]), ctx);
    expect(linked.inl.filter((i) => i.t === 'raw')).toHaveLength(2);
  });
});

describe('Japanese navigation', () => {
  it('names the landmarks in Japanese', async () => {
    const { pub } = await render([layOut('# 第一章\n\n本文。', ja())]);
    expect(pub.landmarks.find((l) => l.type === 'bodymatter')?.label).toBe('本文');
    const en = await buildReflowablePublication([layOut('# One\n\nText.')], { layout: 'reflowable', metadata: { title: 'Book', language: 'en' } });
    expect(en.landmarks.find((l) => l.type === 'bodymatter')?.label).toBe('Start of content');
  });
});
