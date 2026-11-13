import { describe, it, expect, afterEach } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { measureRichSnippet } from '../../measure/rich.js';
import { measureBlock } from '../../measure/index.js';
import { isNumberWord } from '../../measure/rich/numbers.js';
import { initHyphenator } from '../../measure/font.js';
import { formatWarning } from '../../pipeline/contentWarnings.js';
import type { ContentWarning, ResolvedResourceBlock, VDTDocument, VDTLine } from '../../vdt.js';
import type { PostextConfig, Resource, TableModel } from '../../types.js';

// #1549: a number is never divided as a word. In a table column narrower
// than `3,600` the overlong-word fallback gave `3,60-` | `0`; the number now
// runs past its measure whole, its line says so (`numberOverflow`) and the
// build names the cell, the caption or the note it lies in. A no-break
// space between its groups is still where a number parts (EF-66).

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

const FONT = '10px serif';
const NBSP = ' ';
const snippet = (text: string, width: number, hyphenate = false): VDTLine[] =>
  measureRichSnippet([{ text, bold: false, italic: false }], FONT, FONT, FONT, FONT, width, 12, { textAlign: 'left', ...(hyphenate ? { hyphenate: true, optimal: true } : {}) }).lines;

afterEach(() => initHyphenator('en-us'));

describe('what a number is (#1549)', () => {
  it('reads figures with their separators, signs, exponents, units and punctuation', () => {
    for (const n of ['3,600', '3.600,25', '−12.5', '+4', '1.2e-3', '(€1,250.00)', `37${NBSP}°C`, '45%', '12kg', '120km/h', '1990s', '١٢٬٥', '“3,600”,', '0.5']) {
      expect(isNumberWord(n), n).toBe(true);
    }
    for (const w of ['COVID-19', '2026-11-13', 'A4', 'x', '7', 'information', '10.1006/ijhc.2001.0458', '1990–2000', 'v1.2']) {
      expect(isNumberWord(w), w).toBe(false);
    }
  });

  it('reads a long run of separators or closing marks in linear time', () => {
    // The closing punctuation used to be a last `[…]*` of the pattern that
    // shared `'` `’` `.` `,` with the digit groups (CodeQL js/polynomial-redos).
    const t = performance.now();
    for (const mark of ["'", '’', '.', ',']) {
      expect(isNumberWord(`1${mark.repeat(50_000)}#`)).toBe(false);
      expect(isNumberWord(`1${mark.repeat(50_000)}`)).toBe(true);
    }
    expect(performance.now() - t).toBeLessThan(1000);
  });
});

describe('a number wider than its line stays whole (#1549)', () => {
  it('runs past a narrow cell measure whole, its line flagged, with or without hyphenation', () => {
    for (const hyphenate of [false, true]) {
      // "3,600" is 35 px; the measure holds four characters.
      const ls = snippet('3,600', 28, hyphenate);
      expect(ls.map((l) => l.text), String(hyphenate)).toEqual(['3,600']);
      expect(ls[0]!.wordOverflow).toBe(true);
      expect(ls[0]!.numberOverflow).toBe(true);
      expect(ls[0]!.wordDivided).toBeUndefined();
    }
    // A word in the same place is still divided.
    expect(snippet('CLIMAX', 28).map((l) => l.text)).toEqual(['CLI-', 'MAX']);
  });

  it('keeps a number with its sign, currency and unit whole, next to other words', () => {
    const ls = snippet(`Total (€1,250.00) and 37${NBSP}°C`, 49);
    expect(ls.map((l) => l.text)).toEqual(['Total', '(€1,250.00)', 'and', `37${NBSP}°C`]);
    // `37 °C` fits its line; `(€1,250.00)` does not.
    expect(ls.map((l) => l.numberOverflow === true)).toEqual([false, true, false, false]);
  });

  it('parts a number only at a no-break space between its groups, nothing added (EF-66)', () => {
    const ls = snippet(`300${NBSP}000${NBSP}000`, 56);
    expect(ls.map((l) => l.text)).toEqual([`300${NBSP}000`, '000']);
    expect(ls.some((l) => l.numberOverflow)).toBe(false);
  });

  it('holds on the plain path too, which pretext would cut between two digits', () => {
    for (const options of [{ textAlign: 'left' as const }, { textAlign: 'justify' as const, hyphenate: true }, { textAlign: 'justify' as const, hyphenate: true, optimal: true }]) {
      const { lines } = measureBlock('x 1234567890 y', FONT, 42, 12, options);
      expect(lines.map((l) => l.text.trim()), JSON.stringify(options)).toEqual(['x', '1234567890', 'y']);
      expect(lines[1]!.numberOverflow).toBe(true);
    }
  });
});

const table = (model: TableModel, caption?: string): Resource => ({
  id: 'prices', typeId: 'table', kind: 'table', placement: { position: 'here' }, createdAt: 0, updatedAt: 0,
  ...(caption ? { caption } : {}),
  table: { model },
});

const numbers = (doc: VDTDocument): ContentWarning[] => (doc.contentWarnings ?? []).filter((w) => w.kind === 'numberOverflow');

describe('the build names the cell, caption or note a number overflows (#1549)', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const config = (hyphenation: boolean): PostextConfig => ({
    page: { dpi: 72, width: pt(220), height: pt(400), margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
    layout: { layoutType: 'single' },
    tableStyle: { hyphenation },
    captionStyle: { hyphenation },
  }) as PostextConfig;

  it('warns once per number with its cell, and never cuts it', () => {
    for (const hyphenation of [false, true]) {
      const model: TableModel = { rows: [[{ content: 'Item' }, { content: 'Units' }, { content: 'Price' }, { content: 'Note' }, { content: 'Sum' }, { content: 'Tax' }, { content: 'Total' }], [{ content: 'Desk' }, { content: '2' }, { content: '1,800' }, { content: 'oak' }, { content: '3,600' }, { content: '21%' }, { content: '4,356,000.00' }]], columnWidths: [1, 1, 1, 1, 1, 1, 1] };
      const doc = buildDocument({ markdown: '::resource{id="prices"}\n', resources: [table(model, 'Prices of 2026: 4,356,000.00 in all')] }, config(hyphenation));
      const rb = doc.pages.flatMap((p) => [...p.columns.flatMap((c) => c.blocks), ...(p.floats ?? [])]).map((b) => b.resourceBlock).find((r): r is ResolvedResourceBlock => r !== undefined);
      const cellLines = rb!.table!.cells.flatMap((c) => c.lines);
      expect(cellLines.some((l) => /\d-$/.test(l.text)), String(hyphenation)).toBe(false);
      const ws = numbers(doc);
      expect(ws.every((w) => w.kind === 'numberOverflow' && w.resourceId === 'prices')).toBe(true);
      const total = ws.find((w) => w.kind === 'numberOverflow' && w.part === 'cell' && w.text === '4,356,000.00');
      expect(total).toMatchObject({ kind: 'numberOverflow', text: '4,356,000.00', resourceId: 'prices', part: 'cell', cell: { row: 1, col: 6 } });
      expect(formatWarning(total!)).toContain('In cell 2, 7 of the table "prices": The number "4,356,000.00" is wider than its line');
    }
  });

  it('warns for a caption, as for a cell', () => {
    const narrow = { ...config(true), page: { dpi: 72, width: pt(70), height: pt(400), margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } } } as PostextConfig;
    const doc = buildDocument({ markdown: '::resource{id="prices"}\n', resources: [table({ rows: [[{ content: 'a' }]] }, 'Sum 123,456,789.00')] }, narrow);
    const ws = numbers(doc);
    expect(ws).toEqual([expect.objectContaining({ kind: 'numberOverflow', text: '123,456,789.00', resourceId: 'prices', part: 'caption' })]);
    expect(formatWarning(ws[0]!)).toContain('In the caption of "prices": The number');
  });
});
