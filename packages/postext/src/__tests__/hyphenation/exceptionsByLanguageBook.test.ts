import { describe, it, expect, afterEach } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { createMeasurementCache, type MeasurementCache } from '../../measure/index.js';
import { setHyphenationLocale, setHyphenationRules } from '../../hyphenation/hyphenate.js';
import type { BookChapterRange, PostextConfig, VDTDocument, VDTLine } from '../../index.js';

// hyphenation.exceptionsByLanguage in a laid-out book (#1530): the list of
// the language whose dictionary divides a text applies there, also in a
// chapter whose style names another dictionary; a measurement cache shared
// by two builds with other lists gives each its own lines.

// Every printed character, the space included, is 7 px wide.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: [...s].filter((c) => c !== '­' && c !== '​').length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const SENTENCE = 'The table was a large one, but the three were all crowded at one corner of it. There is plenty of room said Alice indignantly, and she sat down in a large chair at one end of the table.';

const config = (widthPt: number, byLanguage?: Record<string, string[]>): PostextConfig => ({
  page: { dpi: 96, width: pt(widthPt), height: pt(900), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  bodyText: { textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: true, locale: 'en-us', ...(byLanguage ? { exceptionsByLanguage: byLanguage } : {}) } },
  headings: { levels: [] },
  chapterStyles: [{ id: 'spanish', config: { bodyText: { hyphenation: { locale: 'es' } } } }],
}) as unknown as PostextConfig;

/** Two chapters of the same sentence, the second set in the Spanish style. */
const BOOK = (() => {
  const chapters = [SENTENCE, `---\nchapterStyle: spanish\n---\n${SENTENCE}`];
  let markdown = '';
  const ranges: BookChapterRange[] = [];
  chapters.forEach((text, i) => {
    if (i > 0) markdown += '\n\n';
    ranges.push({ start: markdown.length, end: markdown.length + text.length });
    markdown += text;
  });
  return { markdown, chapters: ranges };
})();

/** Whether a line of each chapter ends inside Alice. */
const alice = (doc: VDTDocument): [boolean, boolean] => {
  const byChapter: [VDTLine[], VDTLine[]] = [[], []];
  for (const b of doc.blocks) byChapter[(b.sourceStart ?? 0) >= BOOK.chapters[1]!.start ? 1 : 0].push(...b.lines);
  const divided = (lines: VDTLine[]) => lines.some((l) => /\bAl(?:i|ic)?-$/.test(l.text));
  return [divided(byChapter[0]), divided(byChapter[1])];
};

const build = (w: number, byLanguage?: Record<string, string[]>, cache: MeasurementCache = createMeasurementCache()) =>
  buildDocument({ markdown: BOOK.markdown, chapters: BOOK.chapters }, config(w, byLanguage), cache);

afterEach(() => {
  setHyphenationLocale('en-us');
  setHyphenationRules();
});

describe('hyphenation.exceptionsByLanguage in a book', () => {
  it('keeps a word whole in the chapter whose style divides with that language\'s dictionary only', () => {
    let english = 0;
    let spanish = 0;
    for (let w = 115; w <= 340; w += 3) {
      const [en, es] = alice(build(w));
      if (en) english++;
      if (es) spanish++;
      const kept = alice(build(w, { es: ['Alice'] }));
      expect(kept[1], `${w}pt`).toBe(false);
      expect(kept[0], `${w}pt`).toBe(en);
    }
    // The sweep holds measures where each dictionary divides the name.
    expect(english).toBeGreaterThan(0);
    expect(spanish).toBeGreaterThan(0);
  }, 300_000);

  it('gives two builds with other lists that share a cache their own lines', () => {
    const cache = createMeasurementCache();
    let w = 115;
    while (w <= 340 && !alice(build(w))[1]) w += 3;
    const texts = (byLanguage?: Record<string, string[]>) => build(w, byLanguage, cache).blocks.flatMap((b) => b.lines.map((l) => l.text));
    const free = texts();
    const kept = texts({ es: ['Alice'] });
    expect(kept).not.toEqual(free);
    expect(texts()).toEqual(free);
    expect(texts({ es: ['Alice'] })).toEqual(kept);
  }, 120_000);
});
