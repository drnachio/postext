import { describe, it, expect } from 'vitest';
import { joinsWithNext } from '../bidi';
import { measureRichBlock } from '../measure/rich';
import { chosenKashidaPoints, distributeKashida, kashidaCapacity, kashidaMeasureOptions, patternsForFont, writtenText, TATWEEL, type KashidaOptions } from '../measure/kashida';
import { computeBreakpoints } from '../knuthPlass/breakpoints';
import { richTokensToItems } from '../knuthPlass/richAdapter';
import { lineTracking } from '../knuthPlass/tracking';
import { resolveBodyTextConfig, stripBodyTextDefaults } from '../defaults/bodyText';
import { collectConfigWarnings } from '../configWarnings';
import { buildDocument } from '../pipeline';
import type { InlineSpan } from '../parse';
import type { PostextConfig } from '../types';
import type { VDTDocument, VDTLine, VDTLineSegment } from '../vdt';

// #375: kashida justification. Fixtures are Arabic with Latin marker words
// so that order and placement can be checked.

/** The stub font: 7 px a character, marks nothing, 2 px less for every
 *  joined pair, a space 4 px, a tatweel 5 px (the join it lengthens stays
 *  one join). */
function stubWidth(s: string): number {
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ' ') w += 4;
    else if (s[i] === TATWEEL) w += 5;
    else if (!/\p{M}/u.test(s[i]!)) w += 7;
    if (s[i] !== TATWEEL && joinsWithNext(s, i)) w -= 2;
  }
  return w;
}
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: stubWidth(s) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const FONT = '16px Test';
const span = (text: string): InlineSpan => ({ text, bold: false, italic: false });
const OPTS: KashidaOptions = { patterns: 'naskh', perWord: 1, maxLengthPx: 15 };
const widthOf = (_seg: VDTLineSegment, text: string) => stubWidth(text);
const seg = (text: string): VDTLineSegment => ({ kind: 'text', text, width: stubWidth(text), rtl: true });
const space = (): VDTLineSegment => ({ kind: 'space', text: ' ', width: 4 });
const lineWidth = (line: VDTLine) => line.segments!.reduce((s, x) => s + x.width, 0);

describe('kashida settings', () => {
  it('is on by default in an Arabic-script document only', () => {
    expect(resolveBodyTextConfig(undefined, 'ar').kashida).toBe('auto');
    expect(resolveBodyTextConfig({}, 'fa-IR').kashida).toBe('auto');
    expect(resolveBodyTextConfig({}, 'ur').kashidaPatterns).toBe('auto');
    const en = resolveBodyTextConfig({}, 'en');
    expect('kashida' in en || 'kashidaPatterns' in en || 'kashidaPerWord' in en || 'kashidaMaxLength' in en).toBe(false);
    expect('kashida' in resolveBodyTextConfig(undefined, 'he')).toBe(false);
    expect('kashida' in resolveBodyTextConfig({ kashida: 'none' }, 'ar')).toBe(false);
    expect(resolveBodyTextConfig({ kashida: 'auto', kashidaPerWord: 2, kashidaMaxLength: 1 }, 'en')).toMatchObject({ kashida: 'auto', kashidaPerWord: 2, kashidaMaxLength: 1, kashidaPatterns: 'auto' });
  });

  it('keeps only what differs from the document’s default when saved', () => {
    expect(stripBodyTextDefaults({ kashida: 'auto' }, 'ar')).toBeUndefined();
    expect(stripBodyTextDefaults({ kashida: 'none' }, 'en')).toBeUndefined();
    expect(stripBodyTextDefaults({ kashida: 'none' }, 'ar')).toEqual({ kashida: 'none' });
    expect(stripBodyTextDefaults({ kashida: 'auto', kashidaPatterns: 'auto', kashidaPerWord: 1 }, 'en')).toEqual({ kashida: 'auto' });
    expect(stripBodyTextDefaults({ kashidaPatterns: 'simple', kashidaMaxLength: 0.4 }, 'ar')).toEqual({ kashidaPatterns: 'simple', kashidaMaxLength: 0.4 });
  });

  it('reports an unknown value', () => {
    const warnings = collectConfigWarnings({ locale: 'ar', bodyText: { kashida: 'yes' as never, kashidaPatterns: 'kufi' as never } });
    expect(warnings).toContainEqual({ kind: 'unknownConfigValue', path: 'bodyText.kashida', value: 'yes', used: 'auto' });
    expect(warnings).toContainEqual({ kind: 'unknownConfigValue', path: 'bodyText.kashidaPatterns', value: 'kufi', used: 'auto' });
  });

  it('picks the rules from the face, and none for Ruqʿa', () => {
    expect(patternsForFont('400 20px "Amiri"')).toBe('naskh');
    expect(patternsForFont('400 20px "Aref Ruqaa"')).toBeUndefined();
    expect(patternsForFont('400 20px "Noto Nastaliq Urdu"')).toBe('nastaliq');
    const ar = resolveBodyTextConfig({}, 'ar');
    expect(kashidaMeasureOptions(ar, '400 20px "Amiri"', 20)).toEqual({ patterns: 'naskh', perWord: 1, maxLengthPx: 12 });
    expect(kashidaMeasureOptions(ar, '400 20px "Aref Ruqaa"', 20)).toBeUndefined();
    expect(kashidaMeasureOptions(resolveBodyTextConfig({ kashidaPatterns: 'simple' }, 'ar'), '400 20px "Aref Ruqaa"', 20)?.patterns).toBe('simple');
    expect(kashidaMeasureOptions(resolveBodyTextConfig({}, 'en'), '400 20px "Amiri"', 20)).toBeUndefined();
  });
});

describe('kashida points of a word', () => {
  it('takes the best point, the later of equals, at most perWord', () => {
    // كلمة: before the final teh marbuta (Naskh 9), never after kāf or lām.
    expect(chosenKashidaPoints('كلمة', 'naskh', 1)).toEqual([{ offset: 3, priority: 9 }]);
    // يهتم: three points of priority 6; the last one wins, then the one before.
    expect(chosenKashidaPoints('يهتم', 'naskh', 1).map((p) => p.offset)).toEqual([3]);
    expect(chosenKashidaPoints('يهتم', 'naskh', 2).map((p) => p.offset)).toEqual([3, 2]);
    expect(chosenKashidaPoints('لا', 'naskh', 1)).toEqual([]);
    expect(chosenKashidaPoints('Latin', 'naskh', 1)).toEqual([]);
  });

  it('lengthens a tatweel the author typed, and only there', () => {
    expect(chosenKashidaPoints('كتـاب', 'naskh', 2)).toEqual([{ offset: 3, priority: 9 }]);
    // A tatweel seating a mark is no elongation.
    expect(chosenKashidaPoints('ٱلرَّحۡمَـٰنِ', 'naskh', 1)[0]!.offset).not.toBe(0);
  });

  it('gives a word its capacity in whole tatweels', () => {
    expect(kashidaCapacity('كلمة', OPTS, 5)).toBe(15);
    expect(kashidaCapacity('كلمة', OPTS, 6)).toBe(12);
    expect(kashidaCapacity('كلمة', { ...OPTS, perWord: 2 }, 5)).toBe(15);
    expect(kashidaCapacity('يهتم', { ...OPTS, perWord: 2 }, 5)).toBe(30);
    expect(kashidaCapacity('word', OPTS, 5)).toBe(0);
    expect(kashidaCapacity('كلمة', OPTS, 16)).toBe(0);
  });
});

describe('distributing a line’s slack', () => {
  const line = () => [seg('كلمة'), space(), seg('يهتم'), space(), seg('AAA'), space(), seg('مسعد')];

  it('inserts whole tatweels, best points first, and never overfills', () => {
    const r = distributeKashida(line(), 12, OPTS, widthOf)!;
    // Two tatweels of 5 px: كلمة (9) and يهتم (6); مسعد (3) gets none.
    expect(r.count).toBe(2);
    expect(r.added).toBe(10);
    const [a, , b, , latin, , c] = r.segments;
    expect(a!.text).toBe('كلمـة');
    expect(a!.kashida).toEqual([3]);
    expect(writtenText(a!)).toBe('كلمة');
    expect(a!.width).toBe(stubWidth('كلمـة'));
    expect(b!.text).toBe(`يهت${TATWEEL}م`);
    expect(latin!.text).toBe('AAA');
    expect(c!.text).toBe('مسعد');
  });

  it('goes round the points before lengthening one, up to the longest elongation', () => {
    const r = distributeKashida(line(), 40, OPTS, widthOf)!;
    // Three points, three tatweels each at most (15 px): 8 fit in 40 px.
    expect(r.count).toBe(8);
    const counts = r.segments.map((s) => s.kashida?.length ?? 0);
    expect(counts).toEqual([3, 0, 3, 0, 0, 0, 2]);
    expect(r.segments[6]!.text).toBe(`مسع${TATWEEL}${TATWEEL}د`);
    expect(writtenText(r.segments[6]!)).toBe('مسعد');
    const r2 = distributeKashida(line(), 1000, OPTS, widthOf)!;
    expect(r2.count).toBe(9);
  });

  it('keeps several points of one word apart', () => {
    const r = distributeKashida([seg('يهتم')], 20, { ...OPTS, perWord: 2 }, widthOf)!;
    expect(r.segments[0]!.text).toBe(`يه${TATWEEL}${TATWEEL}ت${TATWEEL}${TATWEEL}م`);
    expect(r.segments[0]!.kashida).toEqual([2, 3, 5, 6]);
    expect(writtenText(r.segments[0]!)).toBe('يهتم');
  });

  it('leaves a slack under one tatweel, a shrunk line and Latin alone', () => {
    expect(distributeKashida(line(), 4, OPTS, widthOf)).toBeNull();
    expect(distributeKashida(line(), -3, OPTS, widthOf)).toBeNull();
    expect(distributeKashida([seg('AAA'), space(), seg('BBB')], 30, OPTS, widthOf)).toBeNull();
  });

  it('carries the tatweel into the styled run of the letter before it', () => {
    const word: VDTLineSegment = { ...seg('كلمة'), runs: [{ text: 'كلم' }, { text: 'ة', bold: true }] };
    const r = distributeKashida([word], 6, OPTS, widthOf)!;
    expect(r.segments[0]!.runs).toEqual([{ text: 'كلمـ' }, { text: 'ة', bold: true }]);
  });
});

describe('Knuth–Plass with kashida stretch', () => {
  it('gives an Arabic word box its capacity as stretch', () => {
    const items = richTokensToItems([
      { text: 'كلمة', bold: false, italic: false, kind: 'text', width: 22, kashida: 15 },
      { text: ' ', bold: false, italic: false, kind: 'space', width: 4 },
      { text: 'AAA', bold: false, italic: false, kind: 'text', width: 21 },
    ], 4, 1.5, 0.8);
    expect(items[0]).toMatchObject({ type: 'box', stretch: 15 });
    expect('stretch' in items[2]!).toBe(false);
  });

  it('counts a box’s stretch with its line’s glue', () => {
    // Two words of 50 px in a 120 px line: 16 px of slack, 2 px of glue
    // stretch. Rigid, the words take tracking past the spaces' limit; with
    // 20 px of kashida the line is set within it and takes none.
    const items = (stretch?: number) => [
      { type: 'box' as const, width: 50, sourceIndex: 0, chars: 5, ...(stretch ? { stretch } : {}) },
      { type: 'glue' as const, width: 4, stretch: 2, shrink: 1, sourceIndex: 1 },
      { type: 'box' as const, width: 50, sourceIndex: 2, chars: 5, ...(stretch ? { stretch } : {}) },
      { type: 'glue' as const, width: 4, stretch: 2, shrink: 1, sourceIndex: 3 },
    ];
    expect(lineTracking(items(), 0, 3, 120, 2)).toBeGreaterThan(0);
    expect(lineTracking(items(10), 0, 3, 120, 2)).toBe(0);
    // The breaker reads the same stretch.
    const para = (stretch?: number) => [...items(stretch), { type: 'box' as const, width: 50, sourceIndex: 4 },
      { type: 'glue' as const, width: 0, stretch: 100000, shrink: 0, sourceIndex: -1 },
      { type: 'penalty' as const, width: 0, penalty: -100000, flagged: false, sourceIndex: -1 }];
    const opts = { lineWidth: () => 120, normalSpaceWidth: 4, maxStretchRatio: 1.5, minShrinkRatio: 0.75, looseness: 0 };
    expect(computeBreakpoints(para(10), opts)).toEqual([3, 6]);
  });
});

describe('justified Arabic paragraphs', () => {
  const TEXT = 'قال AAA إن كلمة يهتم مسعد كتاب جميلة وكانت المدينة BBB عامرة بالناس والكتب والعلماء في كل زمان';

  it('elongates every justified line but the last, and its spaces take what is left', () => {
    const base = { textAlign: 'justify' as const, optimal: true, direction: 'rtl' as const };
    const plain = measureRichBlock([span(TEXT)], FONT, FONT, FONT, FONT, 150, 20, base);
    const k = measureRichBlock([span(TEXT)], FONT, FONT, FONT, FONT, 150, 20, { ...base, kashida: OPTS });
    expect(k.lines.length).toBeGreaterThan(2);
    const last = k.lines[k.lines.length - 1]!;
    expect(last.kashida).toBeUndefined();
    expect(last.segments!.some((s) => s.kashida)).toBe(false);
    let elongated = 0;
    for (const line of k.lines.slice(0, -1)) {
      if (!line.kashida) continue;
      elongated++;
      const inserted = line.segments!.reduce((n, s) => n + (s.kashida?.length ?? 0), 0);
      expect(line.kashida).toBe(inserted);
      // The natural width counts the tatweels; the spaces take less than
      // one tatweel's worth of slack each line.
      expect(line.bbox.width).toBeCloseTo(lineWidth(line), 6);
      expect(150 - (line.bbox.x) - line.bbox.width).toBeLessThan(5 + 1e-6);
      expect(line.justifiedSpaceRatio!).toBeLessThan(2);
      // The line's own text is as written, and so is every segment's.
      expect(line.segments!.map((s) => writtenText(s)).join('')).toBe(line.text);
      for (const s of line.segments!) if (s.kashida) expect(s.rtl).toBe(true);
      // Latin markers are never elongated.
      for (const s of line.segments!) if (/[A-Z]/.test(s.text)) expect(s.kashida).toBeUndefined();
    }
    expect(elongated).toBeGreaterThan(0);
    // Without kashida the same paragraph sets its spaces wider.
    const loosest = (ls: VDTLine[]) => Math.max(...ls.filter((l) => l.justifiedSpaceRatio !== undefined).map((l) => l.justifiedSpaceRatio!));
    expect(loosest(k.lines)).toBeLessThan(loosest(plain.lines));
  });

  it('touches neither ragged nor Latin paragraphs', () => {
    const ragged = measureRichBlock([span(TEXT)], FONT, FONT, FONT, FONT, 150, 20, { textAlign: 'right', optimal: true, direction: 'rtl', kashida: OPTS });
    expect(ragged.lines.some((l) => l.kashida)).toBe(false);
    const latin = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore';
    const a = measureRichBlock([span(latin)], FONT, FONT, FONT, FONT, 150, 20, { textAlign: 'justify', optimal: true });
    const b = measureRichBlock([span(latin)], FONT, FONT, FONT, FONT, 150, 20, { textAlign: 'justify', optimal: true, kashida: OPTS });
    expect(b).toEqual(a);
  });
});

describe('kashida in a built document', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const config = (extra: PostextConfig = {}): PostextConfig => ({
    page: { dpi: 72, width: pt(320), height: pt(600), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    ...extra,
    // 20 px text: an elongation of 12 px takes two 5 px tatweels.
    bodyText: { fontSize: pt(20), ...extra.bodyText },
  });
  const markdown = 'قال AAA إن كلمة يهتم مسعد كتاب جميلة وكانت المدينة [BBB](https://example.org) عامرة بالناس والكتب والعلماء في كل زمان ومكان وفي كل بلد.';
  const lines = (doc: VDTDocument) => doc.blocks.flatMap((b) => b.lines);

  it('inserts tatweels in an Arabic book and keeps the plain text, source ranges and links as written', () => {
    const on = buildDocument({ markdown }, config({ locale: 'ar' }));
    const off = buildDocument({ markdown }, config({ locale: 'ar', bodyText: { kashida: 'none' } }));
    expect(lines(on).some((l) => l.kashida)).toBe(true);
    expect(lines(off).some((l) => l.kashida || l.segments?.some((s) => s.kashida))).toBe(false);
    // Every line's source range spells its text as written.
    const source = markdown.replace('[BBB](https://example.org)', 'BBB');
    const plainDoc = buildDocument({ markdown: source }, config({ locale: 'ar' }));
    const elongated = lines(plainDoc).filter((l) => l.kashida);
    expect(elongated.length).toBeGreaterThan(0);
    for (const line of lines(plainDoc)) {
      const written = line.segments!.map((s) => writtenText(s)).join('');
      expect(written).toBe(line.text);
      expect(source.slice(line.sourceStart, line.sourceEnd).trim()).toBe(written.trim());
    }
    expect(lines(on).flatMap((l) => l.segments ?? []).some((s) => s.href === 'https://example.org' && s.text === 'BBB')).toBe(true);
  });

  it('leaves an English book as it was', () => {
    const md = 'He quoted كلمة يهتم مسعد in a long sentence that runs over several lines of the page for the test.';
    const a = buildDocument({ markdown: md }, config());
    expect(lines(a).some((l) => l.kashida)).toBe(false);
    const b = buildDocument({ markdown: md }, config({ bodyText: { kashida: 'auto' } }));
    // Asked for, the quoted words may take kashidas; the Latin never does.
    for (const s of lines(b).flatMap((l) => l.segments ?? [])) if (s.kashida) expect(/[a-z]/i.test(s.text)).toBe(false);
  });
});
