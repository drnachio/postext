import { describe, it, expect, beforeEach } from 'vitest';
import { buildDocument } from '../../pipeline';
import { annotateArabicMarks, hasArabicMarks, lineWordInks, markInkOverhang } from '../../arabicMarks';
import { columnClipRect } from '../../columnClip';
import type { PostextConfig } from '../../types';
import type { VDTBlock, VDTColumn, VDTDocument, VDTLine } from '../../vdt';

// Issue #376: Arabic vowel marks live in the leading. Lines that carry them
// record how far their ink reaches (`VDTLine.markInk`), the column clip takes
// it in, and a paragraph whose marks meet the next line is reported.

/** Ink metrics the stub measurer gives (`null`: none, as a measurer
 *  without `actualBoundingBox*`). */
let inkMetrics: ((text: string, sizePx: number) => { ascent: number; descent: number }) | null = null;

class StubCtx {
  font = '';
  measureText(s: string): Partial<TextMetrics> {
    const width = s.length * 7;
    if (!inkMetrics) return { width };
    const size = Number(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? 16);
    const ink = inkMetrics(s, size);
    return { width, actualBoundingBoxAscent: ink.ascent, actualBoundingBoxDescent: ink.descent, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

beforeEach(() => {
  inkMetrics = null;
});

const pt = (value: number) => ({ value, unit: 'pt' as const });

// Fully vocalised words (fatḥa, kasra, shadda, sukūn, dagger alef), with a
// Latin marker word in each paragraph so lines can be told apart.
const VOCALISED = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';
const BARE = 'بسم الله الرحمن الرحيم';
const para = (words: string, marker: string) => `${marker} ${Array.from({ length: 8 }, () => words).join(' ')}`;

function config(lineHeight: number, extra: Partial<PostextConfig> = {}): PostextConfig {
  return {
    locale: 'ar',
    page: { width: pt(300), height: pt(400), margins: { top: pt(30), bottom: pt(30), left: pt(30), right: pt(30) } },
    layout: { layoutType: 'single' },
    bodyText: { fontFamily: 'Amiri', fontSize: pt(12), lineHeight: { value: lineHeight, unit: 'em' } },
    ...extra,
  };
}

const kinds = (doc: VDTDocument) => (doc.contentWarnings ?? []).filter((w) => w.kind === 'arabicMarksExceedLeading');
const allLines = (doc: VDTDocument) => doc.blocks.flatMap((b) => b.lines);

describe('Arabic vowel marks — detection', () => {
  it('knows the ḥarakāt, the dagger alef and the Qurʾānic marks, and not the letters', () => {
    for (const mark of ['َ', 'ُ', 'ِ', 'ّ', 'ْ', 'ً', 'ٰ', 'ۖ', 'ؐ']) {
      expect(hasArabicMarks(`ب${mark}`)).toBe(true);
    }
    // Hamza and madda letters, tatweel, the end-of-āya sign and Latin are not marks.
    for (const text of ['أ إ آ ؤ ئ ء', 'ـــ', '۝', BARE, 'alpha 123']) expect(hasArabicMarks(text)).toBe(false);
  });
});

describe('Arabic vowel marks — leading check', () => {
  it('reports a vocalised paragraph set solid, once, on the lower line', () => {
    const doc = buildDocument({ markdown: [para(VOCALISED, 'ALPHA'), para(VOCALISED, 'BETA')].join('\n\n') }, config(1.2));
    const warnings = kinds(doc);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    const w = warnings[0]!;
    if (w.kind !== 'arabicMarksExceedLeading') throw new Error('kind');
    expect(w.lineHeightEm).toBeCloseTo(1.2, 2);
    expect(w.neededEm).toBeGreaterThan(1.2);
    expect(w.pageIndex).toBe(0);
    expect(w.sourceStart).toBeDefined();
    // One per paragraph at most.
    const starts = warnings.map((x) => x.sourceStart);
    expect(new Set(starts).size).toBe(starts.length);
  });

  it('says nothing with the leading a vocalised text wants', () => {
    const doc = buildDocument({ markdown: [para(VOCALISED, 'ALPHA'), para(VOCALISED, 'BETA')].join('\n\n') }, config(2));
    expect(kinds(doc)).toEqual([]);
    // The marked lines still carry their ink.
    expect(allLines(doc).filter((l) => l.markInk).length).toBeGreaterThan(0);
  });

  it('leaves unvocalised Arabic and Latin text alone', () => {
    const bare = buildDocument({ markdown: [para(BARE, 'ALPHA'), para(BARE, 'BETA')].join('\n\n') }, config(1.2));
    expect(kinds(bare)).toEqual([]);
    expect(allLines(bare).some((l) => l.markInk)).toBe(false);
    const latin = buildDocument({ markdown: 'Alpha beta gamma delta. '.repeat(40) }, { ...config(1.2), locale: 'en' });
    expect(latin.contentWarnings).toBeUndefined();
    expect(allLines(latin).some((l) => 'markInk' in l)).toBe(false);
  });

  it('reads the glyphs’ ink when the measurer gives it', () => {
    // Marks 1.6 em above the baseline: even 2 em of leading is too little
    // over a line hanging 0.6 em.
    inkMetrics = (text, size) => (hasArabicMarks(text) ? { ascent: 1.6 * size, descent: 0.6 * size } : { ascent: 0.7 * size, descent: 0.2 * size });
    const doc = buildDocument({ markdown: [para(VOCALISED, 'ALPHA'), para(VOCALISED, 'BETA')].join('\n\n') }, config(2));
    const w = kinds(doc)[0];
    expect(w).toBeDefined();
    if (w?.kind !== 'arabicMarksExceedLeading') throw new Error('kind');
    expect(w.neededEm).toBeCloseTo(2.2, 2);
    const marked = allLines(doc).find((l) => l.markInk)!;
    expect(marked.markInk!.above / marked.markInk!.below).toBeCloseTo(1.6 / 0.6, 3);
  });
});

/** A line of words at given x, `width` each, on `baseline`. */
function line(baseline: number, words: { x: number; text: string }[], width = 40): VDTLine {
  const segments = words.flatMap((w, i) => [
    ...(i > 0 ? [{ kind: 'space' as const, text: ' ', width: w.x - (words[i - 1]!.x + width) }] : []),
    { kind: 'text' as const, text: w.text, width },
  ]);
  const x = words[0]!.x;
  return {
    text: words.map((w) => w.text).join(' '),
    bbox: { x, y: baseline - 12, width: words[words.length - 1]!.x + width - x, height: 16 },
    baseline,
    hyphenated: false,
    segments,
    isLastLine: true,
  };
}

function docOf(lines: VDTLine[], col: Partial<VDTColumn> = {}): VDTDocument {
  const block = {
    id: 'b', type: 'paragraph', bbox: { x: 0, y: 0, width: 400, height: 100 }, lines,
    pageIndex: 0, columnIndex: 0, fontString: '400 16px Amiri', textAlign: 'left',
  } as unknown as VDTBlock;
  const column = { bbox: { x: 0, y: 0, width: 400, height: 100 }, blocks: [block], ...col } as unknown as VDTColumn;
  return { blocks: [block], pages: [{ columns: [column] }] } as unknown as VDTDocument;
}

describe('Arabic vowel marks — word by word', () => {
  it('compares only words that stand over each other', () => {
    // Every word: 1.2 em up with a mark, 0.6 em down; 1.5 em pitch.
    inkMetrics = (text, size) => (hasArabicMarks(text) ? { ascent: 1.2 * size, descent: 0.6 * size } : { ascent: 0.7 * size, descent: 0.3 * size });
    const upper = line(20, [{ x: 0, text: 'بِسْمِ' }]);
    const apart = line(44, [{ x: 200, text: 'اللَّهِ' }]);
    expect(annotateArabicMarks(docOf([upper, apart]))).toEqual([]);
    const over = line(44, [{ x: 20, text: 'اللَّهِ' }]);
    const found = annotateArabicMarks(docOf([line(20, [{ x: 0, text: 'بِسْمِ' }]), over]));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: 'arabicMarksExceedLeading', lineHeightEm: 1.5, neededEm: 1.8 });
  });

  it('follows the line’s flow order', () => {
    const l = line(20, [{ x: 0, text: 'alpha' }, { x: 50, text: 'بِسْمِ' }]);
    l.order = [2, 1, 0];
    const block = { bbox: { x: 0, y: 0, width: 400, height: 20 }, fontString: '400 16px Amiri', textAlign: 'left' } as unknown as VDTBlock;
    const words = lineWordInks(l, block);
    // The Arabic word is painted first now, at the line's start.
    expect(words.map((w) => w.x0)).toEqual([50, 0]);
    expect(words.map((w) => w.marked)).toEqual([false, true]);
  });
});

describe('Arabic vowel marks — column clip', () => {
  it('grows the clip over the marks of the first line and under those of the last', () => {
    const first = line(14, [{ x: 0, text: 'بِسْمِ' }]);
    const last = line(96, [{ x: 0, text: 'الرَّحِيمِ' }]);
    first.markInk = { above: 20, below: 6 };
    last.markInk = { above: 20, below: 10 };
    const doc = docOf([first, last]);
    const col = doc.pages[0]!.columns[0]!;
    expect(markInkOverhang(col.blocks, 0, 100)).toEqual([6, 6]);
    const clip = columnClipRect(col, 96, false);
    expect(clip.y).toBeCloseTo(-6);
    expect(clip.height).toBeCloseTo(112);
  });

  it('keeps the clip of a column without marks', () => {
    const doc = docOf([line(14, [{ x: 0, text: 'alpha' }]), line(96, [{ x: 0, text: 'beta' }])]);
    const clip = columnClipRect(doc.pages[0]!.columns[0]!, 96, false);
    expect(clip.y).toBe(0);
    expect(clip.height).toBe(100);
  });
});
