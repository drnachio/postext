import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { createMeasurementCache } from '../../measure';
import { footnoteSymbol, formatFootnoteNumber } from '../../pipeline/footnotes';
import { resolveFootnotesConfig, stripFootnotesDefaults } from '../../defaults/footnotes';
import { collectConfigWarnings } from '../../configWarnings';
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

const SENTENCE =
  'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos que cruzan la bahía. ';
const filler = (n: number): string => SENTENCE.repeat(n).trim();
const mm = (value: number) => ({ value, unit: 'mm' as const });

const ONE_COL: PostextConfig = {
  headings: { balancing: { enabled: false } },
  page: { width: mm(160), height: mm(120), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
};

/** Each note's marker text and the page it stands on, in citation order. */
function markers(doc: VDTDocument): { id: string; text: string; page: number }[] {
  const out: { id: string; text: string; page: number }[] = [];
  for (const b of doc.blocks) {
    if (b.footnoteNote !== undefined) continue;
    for (const l of b.lines) for (const s of l.segments ?? []) if (s.footnoteId !== undefined) out.push({ id: s.footnoteId, text: s.text, page: b.pageIndex });
  }
  return out;
}

describe('footnote reference symbols (#538)', () => {
  it('runs * † ‡ § ‖ ¶, then doubles and triples them', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => footnoteSymbol(n))).toEqual(['*', '†', '‡', '§', '‖', '¶']);
    expect(footnoteSymbol(7)).toBe('**');
    expect(footnoteSymbol(8)).toBe('††');
    expect(footnoteSymbol(13)).toBe('***');
    expect(footnoteSymbol(3, ['*', '†', '§'])).toBe('§');
    expect(footnoteSymbol(4, ['*', '†', '§'])).toBe('**');
    expect(formatFootnoteNumber(2, 'symbols', '({n})')).toBe('(†)');
    expect(formatFootnoteNumber(2, { symbols: ['a', 'b'] })).toBe('b');
  });

  it('resolves symbols (and *) with per-page numbering unless numbering is set', () => {
    const f = resolveFootnotesConfig({ numberFormat: 'symbols' });
    expect(f.numberFormat).toBe('symbols');
    expect(f.numbering).toBe('page');
    expect(f.symbols).toBeUndefined();
    expect(resolveFootnotesConfig({ numberFormat: '*' }).numberFormat).toBe('symbols');
    expect(resolveFootnotesConfig({ numberFormat: 'symbols', numbering: 'chapter' }).numbering).toBe('chapter');
    expect(resolveFootnotesConfig({ numberFormat: 'symbols', placement: 'chapterEnd' }).numbering).toBe('chapter');
    expect(resolveFootnotesConfig({ numberFormat: 'symbols', symbols: ['*', '', '†'] }).symbols).toEqual(['*', '†']);
    // A decimal document numbers by chapter as before.
    expect(resolveFootnotesConfig({}).numbering).toBe('chapter');
    // Stripping keeps an explicit chapter numbering and drops the implied page one.
    expect(stripFootnotesDefaults({ numberFormat: 'symbols', numbering: 'page' })).toEqual({ numberFormat: 'symbols' });
    expect(stripFootnotesDefaults({ numberFormat: 'symbols', numbering: 'chapter' })).toEqual({ numberFormat: 'symbols', numbering: 'chapter' });
    expect(stripFootnotesDefaults({ numberFormat: 'symbols', symbols: ['*', '†', '‡', '§', '‖', '¶'] })).toEqual({ numberFormat: 'symbols' });
  });

  it('does not warn about footnotes.numberFormat: symbols', () => {
    const warnings = collectConfigWarnings({ footnotes: { numberFormat: 'symbols' } });
    expect(warnings.filter((w) => w.kind === 'unknownNumberFormat')).toEqual([]);
  });

  it('marks the notes with symbols, starting again on every page', () => {
    const md = [
      `${filler(1)} Primera.[^a] ${filler(1)} Segunda.[^b]`,
      `${filler(80)} Tercera.[^c] ${filler(1)}`,
      '[^a]: Nota a.',
      '[^b]: Nota b.',
      '[^c]: Nota c.',
    ].join('\n\n');
    const doc = buildDocument({ markdown: md }, { ...ONE_COL, footnotes: { numberFormat: 'symbols' } }, createMeasurementCache());
    const m = markers(doc);
    expect(m.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(m[0]!.page).toBe(0);
    expect(m[2]!.page).toBeGreaterThan(0);
    expect(m.map((x) => x.text)).toEqual(['*', '†', '*']);
    // The notes open with the same symbol.
    const note = (id: string) => doc.blocks.find((b) => b.footnoteNote === id)!;
    expect(note('b').lines[0]!.text.startsWith('†')).toBe(true);
    expect(note('c').lines[0]!.text.startsWith('*')).toBe(true);
  });

  it('takes the sequence of footnotes.symbols', () => {
    const md = [`${filler(1)} Uno.[^a] Dos.[^b] Tres.[^c]`, '[^a]: A.', '[^b]: B.', '[^c]: C.'].join('\n\n');
    const doc = buildDocument({ markdown: md }, { ...ONE_COL, footnotes: { numberFormat: 'symbols', symbols: ['*', '†'] } }, createMeasurementCache());
    expect(markers(doc).map((x) => x.text)).toEqual(['*', '†', '**']);
  });
});
