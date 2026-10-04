import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { resolveAllConfig } from '../../pipeline/config';
import { collectConfigWarnings } from '../../configWarnings';
import { stripConfigDefaults } from '../../defaults';
import { resolveBodyTextConfig } from '../../defaults/bodyText';
import { uprightArabicSpans, uprightFace } from '../../uprightArabic';
import type { InlineSpan } from '../../parse';
import type { PostextConfig } from '../../types';
import type { VDTBlock, VDTDocument, VDTLineSegment } from '../../vdt';

// Issue #376: `bodyText.emphasis` says how `*…*` is set; Arabic letters are
// never slanted.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });

function config(locale: string, extra: Partial<PostextConfig> = {}, bodyText: PostextConfig['bodyText'] = {}): PostextConfig {
  return {
    locale,
    page: { width: pt(300), height: pt(400), margins: { top: pt(30), bottom: pt(30), left: pt(30), right: pt(30) } },
    layout: { layoutType: 'single' },
    ...extra,
    bodyText: { fontFamily: 'Amiri', ...bodyText },
  };
}

const paragraphs = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'paragraph');
const segmentsOf = (b: VDTBlock): VDTLineSegment[] => b.lines.flatMap((l) => l.segments ?? []);
const italicText = (b: VDTBlock): string => segmentsOf(b).filter((s) => s.italic && s.kind === 'text').map((s) => s.text).join(' ');
const uprightText = (b: VDTBlock): string => segmentsOf(b).filter((s) => !s.italic && s.kind === 'text').map((s) => s.text).join(' ');

describe('bodyText.emphasis — resolution', () => {
  it('sets *…* in bold in Arabic-script documents and in italics elsewhere', () => {
    expect(resolveBodyTextConfig(undefined, 'ar').emphasis).toBe('bold');
    expect(resolveBodyTextConfig({}, 'fa-IR').emphasis).toBe('bold');
    expect(resolveBodyTextConfig({ emphasis: 'auto' }, 'ar-EG').emphasis).toBe('bold');
    // Italics are the absent field: an existing document resolves as before.
    expect('emphasis' in resolveBodyTextConfig(undefined, 'en')).toBe(false);
    expect('emphasis' in resolveBodyTextConfig({ fontSize: pt(9) }, 'he')).toBe(false);
    expect('emphasis' in resolveBodyTextConfig({ emphasis: 'italic' }, 'ar')).toBe(false);
    expect(resolveBodyTextConfig({ emphasis: 'overline' }, 'en').emphasis).toBe('overline');
    expect(resolveBodyTextConfig({ emphasis: 'color' }, 'ar').emphasis).toBe('color');
  });

  it('keeps a set value when saving, drops auto, and warns about an unknown one', () => {
    expect(stripConfigDefaults({ locale: 'ar', bodyText: { emphasis: 'auto' } }).bodyText).toBeUndefined();
    expect(stripConfigDefaults({ locale: 'en', bodyText: { emphasis: 'italic' } }).bodyText).toEqual({ emphasis: 'italic' });
    expect(stripConfigDefaults({ locale: 'ar', bodyText: { emphasis: 'bold' } }).bodyText).toEqual({ emphasis: 'bold' });
    const bad = { locale: 'ar', bodyText: { emphasis: 'slanted' } } as unknown as PostextConfig;
    expect(collectConfigWarnings(bad)).toContainEqual({ kind: 'unknownConfigValue', path: 'bodyText.emphasis', value: 'slanted', used: 'bold' });
    expect(resolveAllConfig(bad).bodyText.emphasis).toBe('bold');
    expect(collectConfigWarnings({ locale: 'en', bodyText: { emphasis: 'bold' } }).filter((w) => w.path.startsWith('bodyText'))).toEqual([]);
  });

  it('sets an Arabic quotation upright by default, and keeps an explicit italic one', () => {
    expect(resolveBodyTextConfig(undefined, 'ar').blockquote.italic).toBe(false);
    expect(resolveBodyTextConfig({}, 'en').blockquote.italic).toBe(true);
    expect(resolveBodyTextConfig({ blockquote: { italic: true } }, 'ar').blockquote.italic).toBe(true);
    expect(stripConfigDefaults({ locale: 'ar', bodyText: { blockquote: { italic: true } } }).bodyText).toEqual({ blockquote: { italic: true } });
    expect(stripConfigDefaults({ locale: 'ar', bodyText: { blockquote: { italic: false } } }).bodyText).toBeUndefined();
  });
});

describe('bodyText.emphasis — layout', () => {
  const MD = 'ALPHA قال *BETA كتاب* GAMMA\n\nDELTA **EPSILON** ZETA';

  it('keeps the italic faces of a Latin document', () => {
    const doc = buildDocument({ markdown: MD }, config('en'));
    const p = paragraphs(doc)[0]!;
    expect(p.italicFontString).toMatch(/italic/);
    expect(p.emphasis).toBeUndefined();
    expect(doc.blocks.some((b) => b.lines.some((l) => l.marks))).toBe(false);
  });

  it("sets *…* in the bold face and colour under 'bold' (the Arabic default)", () => {
    const doc = buildDocument({ markdown: MD }, config('ar', {}, { boldColor: { hex: '#aa0000', model: 'hex' }, italicColor: { hex: '#00aa00', model: 'hex' } }));
    const p = paragraphs(doc)[0]!;
    expect(p.italicFontString).toBe(p.boldFontString);
    expect(p.boldItalicFontString).toBe(p.boldFontString);
    expect(p.italicColor).toBe('#aa0000');
    // The runs keep their flag: they are still emphasis for the renderers.
    expect(italicText(p)).toContain('BETA');
  });

  it("sets *…* upright in the italic colour under 'color'", () => {
    const doc = buildDocument({ markdown: MD }, config('en', {}, { emphasis: 'color', italicColor: { hex: '#00aa00', model: 'hex' } }));
    const p = paragraphs(doc)[0]!;
    expect(p.italicFontString).toBe(p.fontString);
    expect(p.italicFontString).not.toMatch(/italic/);
    expect(p.italicColor).toBe('#00aa00');
  });

  it("draws a rule over each run under 'overline'", () => {
    const doc = buildDocument({ markdown: MD }, config('ar', {}, { emphasis: 'overline' }));
    const p = paragraphs(doc)[0]!;
    expect(p.emphasis).toBe('overline');
    expect(p.italicFontString).toBe(p.fontString);
    const line = p.lines.find((l) => l.segments?.some((s) => s.italic))!;
    const rules = (line.marks ?? []).filter((m) => m.kind === 'line');
    // One run, «BETA كتاب»: one rule over it, above the baseline.
    expect(rules).toHaveLength(1);
    expect(rules[0]!.y).toBeLessThan(0);
    const segs = line.segments!;
    const first = segs.findIndex((s) => s.italic);
    const widths = segs.slice(first).filter((s, i, a) => s.italic || (s.kind === 'space' && a[i + 1]?.italic)).reduce((sum, s) => sum + s.width, 0);
    expect(rules[0]!.length).toBeCloseTo(widths, 3);
    // The plain paragraph has none.
    expect(paragraphs(doc)[1]!.lines.some((l) => l.marks)).toBe(false);
  });

  it('applies to headings, lists and notes set in the body faces', () => {
    const md = '# Title *ONE*\n\n- item *TWO*\n\nText[^n]\n\n[^n]: Note *THREE*';
    const doc = buildDocument({ markdown: md }, config('ar'));
    for (const block of doc.blocks.filter((b) => b.lines.some((l) => l.segments?.some((s) => s.italic)))) {
      expect(block.italicFontString).toBe(block.boldFontString);
    }
    expect(doc.blocks.filter((b) => b.lines.some((l) => l.segments?.some((s) => s.italic))).length).toBeGreaterThanOrEqual(3);
  });
});

describe('Arabic letters are never slanted', () => {
  const span = (text: string, extra: Partial<InlineSpan> = {}): InlineSpan => ({ text, bold: false, italic: true, ...extra });
  const ITALIC = 'italic 400 16px Amiri';
  const BOLD_ITALIC = 'italic 700 16px Amiri';

  it('sets the Arabic words of an italic run upright, the Latin ones kept italic', () => {
    const out = uprightArabicSpans([span('ALPHA كتاب الأغاني, BETA')], ITALIC, BOLD_ITALIC);
    expect(out.map((s) => [s.text, s.italic])).toEqual([
      ['ALPHA ', true],
      ['كتاب الأغاني, ', false],
      ['BETA', true],
    ]);
    // Neutral characters before the first letter go with it.
    expect(uprightArabicSpans([span('(كتاب) X')], ITALIC, BOLD_ITALIC).map((s) => [s.text, s.italic])).toEqual([['(كتاب) ', false], ['X', true]]);
  });

  it('leaves runs alone when their face is upright or they hold no Arabic', () => {
    const spans = [span('كتاب'), span('BETA')];
    expect(uprightArabicSpans(spans, '700 16px Amiri', '700 16px Amiri')).toBe(spans);
    const latin = [span('ALPHA'), { ...span('كتاب'), italic: false }];
    expect(uprightArabicSpans(latin, ITALIC, BOLD_ITALIC)).toBe(latin);
  });

  it('turns an atomic span upright only when it is all Arabic', () => {
    const ref = { kind: 'resource' as const, id: 'fig' } as unknown as NonNullable<InlineSpan['ref']>;
    const [a] = uprightArabicSpans([span('شكل ١', { ref })], ITALIC, BOLD_ITALIC);
    expect(a!.italic).toBe(false);
    const [b] = uprightArabicSpans([span('Fig. شكل', { ref })], ITALIC, BOLD_ITALIC);
    expect(b!.italic).toBe(true);
  });

  it('keeps links on the pieces they cover', () => {
    const out = uprightArabicSpans([span('AB كتاب', { links: [{ start: 1, end: 6, href: 'https://x.test' }] })], ITALIC, BOLD_ITALIC);
    expect(out.map((s) => s.links)).toEqual([[{ start: 1, end: 3, href: 'https://x.test' }], [{ start: 0, end: 3, href: 'https://x.test' }]]);
  });

  it("sets an Arabic word in an italic run of an English document upright", () => {
    const doc = buildDocument({ markdown: 'ALPHA *BETA كتاب GAMMA* DELTA' }, config('en'));
    const p = paragraphs(doc)[0]!;
    expect(italicText(p)).toBe('BETA GAMMA');
    expect(uprightText(p)).toContain('كتاب');
  });

  it("does so under an explicit 'italic' in an Arabic document", () => {
    const doc = buildDocument({ markdown: 'قال *كتاب BETA*' }, config('ar', {}, { emphasis: 'italic' }));
    const p = paragraphs(doc)[0]!;
    expect(p.italicFontString).toMatch(/italic/);
    expect(italicText(p)).toBe('BETA');
  });

  // #401: a style whose base face is italic slants its plain runs too.
  it('marks the Arabic words of a run whose plain face is slanted upright', () => {
    const NORMAL = 'italic 400 16px Amiri';
    const BOLD = 'italic 700 16px Amiri';
    const plain = (text: string): InlineSpan => ({ text, bold: false, italic: false });
    // The flipped faces of an italic blockquote: `*…*` is upright already.
    const out = uprightArabicSpans([plain('ALPHA كتاب BETA'), span('قول')], '400 16px Amiri', '700 16px Amiri', NORMAL, BOLD);
    expect(out.map((s) => [s.text, s.italic, s.upright ?? false])).toEqual([
      ['ALPHA ', false, false],
      ['كتاب ', false, true],
      ['BETA', false, false],
      ['قول', true, false],
    ]);
    // Emphasis in colour in an italic style: every face slanted, the italic
    // run keeps its flag and is marked too.
    const colour = uprightArabicSpans([span('كتاب X')], NORMAL, BOLD, NORMAL, BOLD);
    expect(colour.map((s) => [s.text, s.italic, s.upright ?? false])).toEqual([['كتاب ', true, true], ['X', true, false]]);
    expect(uprightFace('italic 700 16px "Noto Naskh Arabic"')).toBe('700 16px "Noto Naskh Arabic"');
    expect(uprightFace('700 16px Amiri')).toBe('700 16px Amiri');
  });

  it('sets Arabic upright in an italic blockquote and an italic heading', () => {
    const doc = buildDocument(
      { markdown: '# عنوان Title\n\n> قال ALPHA إن *كتاب BETA* جميل' },
      config('ar', { headings: { levels: [{ level: 1, italic: true }] } }, { blockquote: { italic: true } }),
    );
    const quote = doc.blocks.find((b) => b.type === 'blockquote')!;
    expect(quote.fontString).toMatch(/^italic/);
    const segs = segmentsOf(quote).filter((s) => s.kind === 'text');
    const face = (t: string) => { const seg = segs.find((s) => s.text === t)!; return seg.fontString ?? (seg.italic ? quote.italicFontString : quote.fontString); };
    // Arabic words in the quote's face, unslanted; the Latin word keeps
    // the quote's italics. `*…*` is bold (the Arabic default) and slanted
    // with the quote: its Arabic word is bold and upright.
    expect(face('قال')).toBe(uprightFace(quote.fontString!));
    expect(face('قال')).not.toMatch(/italic/);
    expect(face('ALPHA')).toMatch(/^italic/);
    expect(face('كتاب')).toBe(uprightFace(quote.italicFontString!));
    expect(face('كتاب')).toMatch(/^700/);
    expect(face('BETA')).toBe(quote.italicFontString);
    const heading = doc.blocks.find((b) => b.type === 'heading')!;
    const hsegs = segmentsOf(heading).filter((s) => s.kind === 'text');
    const arabic = hsegs.find((s) => s.text.includes('عنوان'))!;
    expect(heading.fontString).toMatch(/^italic/);
    expect(arabic.fontString).toBe(uprightFace(heading.fontString!));
    expect(hsegs.find((s) => s.text.includes('Title'))!.fontString).toBeUndefined();
  });

  it('leaves an italic quote with no Arabic as it was', () => {
    const doc = buildDocument({ markdown: '> ALPHA BETA' }, config('en', {}, { blockquote: { italic: true } }));
    const quote = doc.blocks.find((b) => b.type === 'blockquote')!;
    expect(segmentsOf(quote).some((s) => s.fontString !== undefined)).toBe(false);
  });
});
