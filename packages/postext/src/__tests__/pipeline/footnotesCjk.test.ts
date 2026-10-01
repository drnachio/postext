import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { createMeasurementCache } from '../../measure';
import { resolveFootnotesConfig, stripFootnotesDefaults } from '../../defaults';
import { numberFootnotesByPlacement, formatFootnoteNumber } from '../../pipeline/footnotes';
import type { PostextConfig, VDTBlock, VDTDocument, VDTLineSegment } from '../../index';

// Deterministic text measurement stub (no DOM in the node test env): wide
// characters an em of a 14 px font, the rest 7 px.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const size = Number(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? 14);
    let w = 0;
    for (const ch of s) w += ch.codePointAt(0)! > 0x2000 ? size : size / 2;
    return { width: w };
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
const HAN = '贾雨村言将真事隐去而撰此石头记一书也故曰甄士隐云云但书中所记何事何人自又云今风尘碌碌一事无成';
const han = (n: number): string => HAN.repeat(n);
const mm = (value: number) => ({ value, unit: 'mm' as const });

const ONE_COL: PostextConfig = {
  headings: { balancing: { enabled: false } },
  page: { width: mm(120), height: mm(90), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
};

function build(md: string, config: PostextConfig): VDTDocument {
  return buildDocument({ markdown: md }, config, createMeasurementCache());
}

const notes = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.footnoteNote !== undefined);
const markers = (doc: VDTDocument): VDTLineSegment[] => {
  const out: VDTLineSegment[] = [];
  for (const b of doc.blocks) {
    if (b.footnoteNote !== undefined) continue;
    for (const l of b.lines) for (const s of l.segments ?? []) if (s.footnoteId !== undefined) out.push(s);
  }
  return out;
};
const markerOf = (doc: VDTDocument, id: string) => markers(doc).find((s) => s.footnoteId === id)!;
const noteOf = (doc: VDTDocument, id: string) => notes(doc).find((b) => b.footnoteNote === id)!;

/** A document whose notes fall on several pages: `perPage` notes cited in
 *  each of `pages` runs of text long enough to fill a page. */
function notesOnPages(pages: number, perPage: number): string {
  const out: string[] = [];
  let k = 0;
  for (let p = 0; p < pages; p++) {
    for (let i = 0; i < perPage; i++) {
      k++;
      out.push(`${filler(1)} Cita ${k}.[^n${k}] ${filler(1)}`);
    }
    out.push(':::pagebreak\n:::');
  }
  for (let i = 1; i <= k; i++) out.push(`[^n${i}]: Nota número ${i}.`);
  return out.join('\n\n');
}

describe('footnotes config: number format and marker position', () => {
  it('resolves the format in any spelling and the marker position from it', () => {
    expect(resolveFootnotesConfig({ numberFormat: '①' })).toMatchObject({ numberFormat: 'circled-decimal', markerPosition: 'inline' });
    expect(resolveFootnotesConfig({ numberFormat: 'circled-decimal', markerPosition: 'superscript' }).markerPosition).toBe('superscript');
    expect(resolveFootnotesConfig({ numberFormat: 'roman-lower' })).toMatchObject({ numberFormat: 'lower-roman', markerPosition: 'superscript' });
    expect(resolveFootnotesConfig({ numberFormat: '一' }, 'zh-Hant').numberFormat).toBe('trad-chinese-informal');
    expect(resolveFootnotesConfig({ numberFormat: 'nonsense' }).numberFormat).toBe('decimal');
    expect(resolveFootnotesConfig({ numbering: 'page' }).numbering).toBe('page');
    expect(resolveFootnotesConfig({ numbering: 'nope' as never }).numbering).toBe('chapter');
    expect(resolveFootnotesConfig({ markerSize: { value: -1, unit: 'em' } }).markerSize).toEqual({ value: 1, unit: 'em' });
  });

  it('strips the defaults and keeps the rest', () => {
    expect(stripFootnotesDefaults({ numberFormat: 'decimal', markerPosition: 'auto', markerSize: { value: 1, unit: 'em' } })).toBeUndefined();
    expect(stripFootnotesDefaults({ numberFormat: '①', markerPosition: 'inline', markerSize: { value: 0.75, unit: 'em' }, numbering: 'page' }))
      .toEqual({ numberFormat: '①', markerPosition: 'inline', markerSize: { value: 0.75, unit: 'em' }, numbering: 'page' });
  });

  it('writes circled numbers up to 50, decimal past them', () => {
    expect(formatFootnoteNumber(1, 'circled-decimal')).toBe('①');
    expect(formatFootnoteNumber(21, 'circled-decimal')).toBe('㉑');
    expect(formatFootnoteNumber(50, 'circled-decimal')).toBe('㊿');
    expect(formatFootnoteNumber(51, 'circled-decimal')).toBe('51');
    expect(formatFootnoteNumber(4, 'lower-roman')).toBe('iv');
  });
});

describe('circled markers', () => {
  const md = `${filler(1)} Una cita.[^a] ${filler(1)} Otra.[^b]\n\n[^a]: Primera nota.\n\n[^b]: Segunda nota.`;

  it('sets ① inline in the text and at the head of the note', () => {
    const doc = build(md, { ...ONE_COL, footnotes: { numberFormat: 'circled-decimal' } });
    const a = markerOf(doc, 'a');
    expect(a.text).toBe('①');
    expect(a.script).toBeUndefined();
    expect(a.baselineShift).toBeUndefined();
    expect(a.fontString).toBeUndefined();
    expect(markerOf(doc, 'b').text).toBe('②');
    const note = noteOf(doc, 'a');
    expect(note.lines[0]!.text.startsWith('①')).toBe(true);
    expect(note.lines[0]!.segments!.some((s) => s.script === 'sup')).toBe(false);
  });

  it('sets a reduced inline marker at markerSize, on the baseline', () => {
    const doc = build(md, { ...ONE_COL, footnotes: { numberFormat: '①', markerSize: { value: 0.75, unit: 'em' } } });
    const a = markerOf(doc, 'a');
    expect(a.script).toBeUndefined();
    expect(a.baselineShift).toBeUndefined();
    const size = Number(/(\d*\.?\d+)px/.exec(a.fontString!)![1]);
    const body = Number(/(\d*\.?\d+)px/.exec(doc.blocks.find((b) => b.footnoteNote === undefined)!.fontString)![1]);
    expect(size).toBeCloseTo(body * 0.75, 3);
    expect(a.width).toBeCloseTo(body * 0.75, 3);
  });

  it('keeps a circled marker raised when asked to', () => {
    const doc = build(md, { ...ONE_COL, footnotes: { numberFormat: 'circled-decimal', markerPosition: 'superscript' } });
    expect(markerOf(doc, 'a')).toMatchObject({ text: '①', script: 'sup' });
  });

  it('numbers chapter-end notes in the format too', () => {
    const doc = build(md, { ...ONE_COL, footnotes: { numberFormat: 'lower-roman', placement: 'chapterEnd' } });
    expect(markerOf(doc, 'b').text).toBe('ii');
    expect(noteOf(doc, 'b').lines[0]!.text.startsWith('ii')).toBe(true);
  });
});

describe('numbering by page and by column', () => {
  it('numbers the notes of each page from ①', () => {
    const doc = build(notesOnPages(3, 2), { ...ONE_COL, footnotes: { numberFormat: 'circled-decimal', numbering: 'page' } });
    const byPage = new Map<number, string[]>();
    for (const n of notes(doc)) byPage.set(n.pageIndex, [...(byPage.get(n.pageIndex) ?? []), n.lines[0]!.text.slice(0, 1)]);
    expect([...byPage.values()]).toEqual([['①', '②'], ['①', '②'], ['①', '②']]);
    // Every marker prints the number its note prints.
    for (const m of markers(doc)) expect(noteOf(doc, m.footnoteId!).lines[0]!.text.startsWith(m.text)).toBe(true);
  });

  it('numbers by chapter when nothing asks otherwise', () => {
    const doc = build(notesOnPages(2, 2), { ...ONE_COL, footnotes: { numberFormat: 'circled-decimal' } });
    expect(markers(doc).map((m) => m.text)).toEqual(['①', '②', '③', '④']);
  });

  it('settles decimal page numbers too', () => {
    const doc = build(notesOnPages(2, 2), { ...ONE_COL, footnotes: { numbering: 'page' } });
    expect(markers(doc).map((m) => m.text)).toEqual(['1', '2', '1', '2']);
    for (const m of markers(doc)) expect(noteOf(doc, m.footnoteId!).lines[0]!.text.startsWith(m.text)).toBe(true);
  });

  it('numbers the notes of each column from 1 with numbering: column', () => {
    const md = [
      `${filler(2)} Uno.[^a] ${filler(1)} Dos.[^b] ${filler(6)} Tres.[^c] ${filler(2)}`,
      '[^a]: Nota a.',
      '[^b]: Nota b.',
      '[^c]: Nota c.',
    ].join('\n\n');
    const config: PostextConfig = { ...ONE_COL, layout: { layoutType: 'double' }, page: { ...ONE_COL.page, width: mm(160) } };
    const byColumn = build(md, { ...config, footnotes: { numbering: 'column' } });
    const c = noteOf(byColumn, 'c');
    const a = noteOf(byColumn, 'a');
    expect(c.columnIndex === a.columnIndex && c.pageIndex === a.pageIndex).toBe(false);
    const first = markers(byColumn).filter((m) => noteOf(byColumn, m.footnoteId!).columnIndex === c.columnIndex
      && noteOf(byColumn, m.footnoteId!).pageIndex === c.pageIndex);
    expect(first[0]!.text).toBe('1');
  });

  it('falls back to chapter numbering for chapter-end notes', () => {
    const doc = build(notesOnPages(2, 2), { ...ONE_COL, footnotes: { numbering: 'page', placement: 'chapterEnd' } });
    expect(markers(doc).map((m) => m.text)).toEqual(['1', '2', '3', '4']);
  });

  it('numbers by placement in reading order of the columns', () => {
    const pages = [
      { footnoteAreas: [{ columnIndex: 1, noteIds: ['c'] }, { columnIndex: 0, noteIds: ['a', 'b'] }] },
      { footnoteAreas: [{ columnIndex: 0, noteIds: ['d'] }] },
    ];
    expect([...numberFootnotesByPlacement(pages, 'page', 'circled-decimal').numbers]).toEqual([['a', '①'], ['b', '②'], ['c', '③'], ['d', '①']]);
    expect([...numberFootnotesByPlacement(pages, 'column').numbers]).toEqual([['a', '1'], ['b', '2'], ['c', '1'], ['d', '1']]);
  });
});

describe('Chinese text', () => {
  const zh: PostextConfig = { ...ONE_COL, locale: 'zh-Hans', footnotes: { numberFormat: 'circled-decimal', numbering: 'page' } };

  it('never starts a line with a marker', () => {
    // A marker after every few characters: some fall at a line end.
    const text = Array.from({ length: 40 }, (_, i) => `${HAN.slice(i % 20, (i % 20) + 3 + (i % 4))}[^z${i}]`).join('');
    const defs = Array.from({ length: 40 }, (_, i) => `[^z${i}]: 注${i}。`).join('\n\n');
    const doc = build(`${text}\n\n${defs}`, zh);
    let lines = 0;
    for (const b of doc.blocks) {
      if (b.footnoteNote !== undefined) continue;
      for (const l of b.lines) {
        const first = (l.segments ?? []).find((s) => s.text.length > 0 || s.footnoteId !== undefined);
        if (first) lines++;
        expect(first?.footnoteId).toBeUndefined();
      }
    }
    expect(lines).toBeGreaterThan(3);
    expect(markers(doc).every((m) => /^[①-⑳㉑-㉟㊱-㊿]$/.test(m.text))).toBe(true);
  });

  it('sets a circled marker upright in vertical text, one cell wide', () => {
    const doc = build(`${han(2)}[^a]${han(1)}\n\n[^a]: 注文。`, { ...zh, layout: { writingMode: 'vertical-rl' } });
    const a = markerOf(doc, 'a');
    expect(a.text).toBe('①');
    expect(a.script).toBeUndefined();
    expect(a.orientation).not.toBe('sideways');
    const body = Number(/(\d*\.?\d+)px/.exec(doc.blocks.find((b) => b.footnoteNote === undefined)!.fontString)![1]);
    expect(a.width).toBeCloseTo(body, 1);
  });
});
