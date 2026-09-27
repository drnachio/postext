import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { VDTLine } from '../../vdt';

// Deterministic text measurement stub (no DOM in the node test env): every
// character, the space included, is 7 px wide.
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

/** A narrow single-column page, so paragraphs break often. */
const config = {
  page: { width: { value: 60, unit: 'mm' as const }, height: { value: 200, unit: 'mm' as const } },
  layout: { layoutType: 'single' as const },
  bodyText: { textAlign: 'left' as const, hyphenation: { enabled: false } },
};

const linesOf = (markdown: string): VDTLine[] => buildDocument({ markdown }, config).blocks.flatMap((b) => b.lines);

// A line's source range is the text it prints. Where the break consumed a
// space, the next line starts one character later; where it did not — between
// two ideographs, inside a word cut for being wider than the line — it starts
// right where the line ended, and no character is skipped.
describe('line source ranges across breaks', () => {
  it('stay contiguous across breaks between ideographs (plain path)', () => {
    const md = '日本語の文章は単語の間に空白を入れずに書くので行はどの文字の間でも折り返すことができますがその位置を正しく記録しなければなりません。';
    const lines = linesOf(md);
    expect(lines.length).toBeGreaterThan(1);
    for (let i = 1; i < lines.length; i++) expect(lines[i]!.sourceStart).toBe(lines[i - 1]!.sourceEnd);
    for (const line of lines) expect(md.slice(line.sourceStart, line.sourceEnd)).toBe(line.text);
  });

  it('stay contiguous inside a word cut for being wider than the line', () => {
    const word = 'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(2);
    const md = `A ${word} ends.`;
    const lines = linesOf(md);
    const cut = lines.filter((l) => /[a-z]$/i.test(l.text) && !l.isLastLine);
    expect(cut.length).toBeGreaterThan(0);
    const printed = lines.map((l) => md.slice(l.sourceStart, l.sourceEnd)).join('');
    expect(printed.replace(/\s+/g, '')).toBe(md.replace(/\s+/g, ''));
  });

  it('skip the space a break consumes, as before', () => {
    const md = 'The quick brown fox jumps over the lazy dog and keeps running across the field until night falls.';
    const lines = linesOf(md);
    expect(lines.length).toBeGreaterThan(2);
    for (let i = 1; i < lines.length; i++) {
      const end = lines[i - 1]!.sourceEnd!;
      expect(lines[i]!.sourceStart).toBe(end + 1);
      expect(md[end]).toBe(' ');
    }
  });

  it('keep a hard hyphen the line ends on (a formatted paragraph breaking at "chapter-relative")', () => {
    const md = 'A **template** such as the one for chapter-relative numbers keeps chapter-relative numbering, and chapter-relative counters restart.';
    for (const width of [44, 48, 52, 56, 60]) {
      const doc = buildDocument({ markdown: md }, { ...config, page: { ...config.page, width: { value: width, unit: 'mm' as const } } });
      const lines = doc.blocks.flatMap((b) => b.lines);
      for (const line of lines) {
        // The source range holds what the line prints, markup aside.
        expect(md.slice(line.sourceStart, line.sourceEnd).replace(/\*\*/g, '')).toBe(line.text);
      }
    }
  });

  it('count an author soft hyphen inside a line, which the line does not print', () => {
    const md = 'Protons react with water to give hydronium ions, so pH can be taken as the concen\u00ADtration of that latter chemical species, measured in moles per litre of solution.';
    for (const width of [44, 50, 56, 62]) {
      const doc = buildDocument({ markdown: md }, { ...config, page: { ...config.page, width: { value: width, unit: 'mm' as const } } });
      for (const line of doc.blocks.flatMap((b) => b.lines)) {
        expect(md.slice(line.sourceStart, line.sourceEnd).replace(/\u00AD/g, '')).toBe(line.text.trimEnd().replace(/-$/, ''));
      }
    }
  });

  it('count an author zero-width space the plain path does not print', () => {
    // U+200B is a break opportunity: the plain path drops it from the line,
    // the source keeps it. Justified text used to drift even before.
    const md = 'The quick brown fox jumps\u200Bover the lazy dog and keeps running across the field until night falls.';
    for (const textAlign of ['left', 'justify'] as const) {
      for (const width of [50, 60, 70]) {
        const doc = buildDocument({ markdown: md }, {
          ...config,
          page: { ...config.page, width: { value: width, unit: 'mm' as const } },
          bodyText: { ...config.bodyText, textAlign },
        });
        const lines = doc.blocks.flatMap((b) => b.lines);
        expect(lines.length).toBeGreaterThan(1);
        for (const line of lines) {
          expect(md.slice(line.sourceStart, line.sourceEnd).replace(/\u200B/g, '')).toBe(line.text.replace(/\u200B/g, '').trimEnd());
        }
      }
    }
  });
});
