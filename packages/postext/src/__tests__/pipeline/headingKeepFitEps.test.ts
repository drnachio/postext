import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, VDTDocument } from '../../index';

// Deterministic text measurement stub (no DOM in the node test env).
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

/** A single column of `lines` grid lines of 29 pt: at 150 dpi a line is
 *  60.41666… px and at 300 dpi 120.8333… px, so the sums of grid lines
 *  drift by about 1e-13 px (#635). */
const config = (lines: number, dpi: number): PostextConfig => ({
  page: { width: pt(300), height: pt(lines * 29 + 40), dpi, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: pt(14), lineHeight: pt(29), firstLineIndent: pt(0) },
  headings: { keepWithNext: true, levels: [{ level: 2, fontSize: pt(14), lineHeight: pt(29), marginTop: pt(0), marginBottom: pt(0) }] },
  unorderedLists: { marginTop: pt(0), marginBottom: pt(0) },
});

const build = (md: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown: md }, cfg, createMeasurementCache());
const paragraphs = (n: number): string => Array.from({ length: n }, (_, i) => `P${i}`).join('\n\n');
/** A paragraph of two lines in the column at this dpi (the text column is
 *  260 pt wide, the stub sets 7 px a character). */
const twoLines = (dpi: number): string => 'word '.repeat(Math.round((260 * dpi / 72 / 7 / 5) * 1.4)).trim();

/** Text of the blocks of a page, in order. */
const pageTexts = (doc: VDTDocument, page: number): string[] =>
  (doc.pages[page]?.columns ?? []).flatMap((c) => c.blocks.map((b) => (b.lines ?? []).map((l) => l.text).join(' ')));
/** The 0-based page that carries the block whose text starts with `start`. */
const pageOf = (doc: VDTDocument, start: string): number =>
  doc.pages.findIndex((_, i) => pageTexts(doc, i).some((t) => t.startsWith(start)));
/** Grid lines set on a page. */
const linesOn = (doc: VDTDocument, page: number): number =>
  (doc.pages[page]?.columns ?? []).reduce((n, c) => n + c.blocks.reduce((m, b) => m + (b.lines?.length ?? 0), 0), 0);

const DPIS = [150, 300, 96, 144];
const LINES = [20, 21, 22, 23, 24, 25];

describe('a heading whose text ends on the last grid line of the column stays (#635)', () => {
  for (const dpi of DPIS) {
    for (const lines of LINES) {
      it(`${dpi} dpi, ${lines} lines a page`, () => {
        // lines − 3 one-line paragraphs, the heading on the third line from
        // the foot and its two-line paragraph on the last two.
        const doc = build(`${paragraphs(lines - 3)}\n\n## Head\n\n${twoLines(dpi)}\n\nAfter.`, config(lines, dpi));
        expect(pageOf(doc, 'Head')).toBe(0);
        expect(linesOn(doc, 0)).toBe(lines);
        expect(pageOf(doc, 'After.')).toBe(1);
      });
    }
  }
});

describe('a heading one grid line short of its text is still pushed (#635)', () => {
  for (const dpi of DPIS) {
    for (const lines of LINES) {
      it(`${dpi} dpi, ${lines} lines a page`, () => {
        // The heading on the second line from the foot: one line under it,
        // and the widow minimum asks for two.
        const doc = build(`${paragraphs(lines - 2)}\n\n## Head\n\n${twoLines(dpi)}\n\nAfter.`, config(lines, dpi));
        expect(pageOf(doc, 'Head')).toBe(1);
        expect(linesOn(doc, 0)).toBe(lines - 2);
      });
    }
  }
});

describe('a paragraph ending in a colon keeps the last grid line for its list (#635)', () => {
  for (const dpi of DPIS) {
    for (const lines of LINES) {
      it(`${dpi} dpi, ${lines} lines a page: the first item fills the last line`, () => {
        const doc = build(`${paragraphs(lines - 2)}\n\nThese are:\n\n- one\n- two\n- three`, config(lines, dpi));
        expect(pageOf(doc, 'These are:')).toBe(0);
        expect(linesOn(doc, 0)).toBe(lines);
      });

      it(`${dpi} dpi, ${lines} lines a page: with no line left the paragraph goes with its list`, () => {
        const doc = build(`${paragraphs(lines - 1)}\n\nThese are:\n\n- one\n- two\n- three`, config(lines, dpi));
        expect(pageOf(doc, 'These are:')).toBe(1);
        expect(linesOn(doc, 0)).toBe(lines - 1);
      });
    }
  }
});
