// The leading of the paragraph styles (#1458): a multiple of the face's
// own line where the engine's distance is no tighter than it, which Word,
// LibreOffice and Google Docs set alike; "at least" kept for display text
// and for the styles whose lines mix faces or hold pictures.

import { describe, expect, it } from 'vitest';
import type { WordFontPlan } from '../../fonts/types.js';
import { naturalLine, styleLeadings, type LeadingStyle } from './leading.js';

/** The tables of a face that matter here: `head`, `hhea` and `OS/2`. */
function face(m: { upm?: number; hhea: [number, number, number]; typo?: [number, number, number]; win?: [number, number]; useTypo?: boolean }): Uint8Array {
  const tables: [string, Uint8Array][] = [];
  const head = new DataView(new ArrayBuffer(54));
  head.setUint16(18, m.upm ?? 1000);
  tables.push(['head', new Uint8Array(head.buffer)]);
  const hhea = new DataView(new ArrayBuffer(36));
  hhea.setInt16(4, m.hhea[0]);
  hhea.setInt16(6, m.hhea[1]);
  hhea.setInt16(8, m.hhea[2]);
  tables.push(['hhea', new Uint8Array(hhea.buffer)]);
  const os2 = new DataView(new ArrayBuffer(96));
  const typo = m.typo ?? m.hhea;
  os2.setUint16(62, m.useTypo === false ? 0 : 0x80);
  os2.setInt16(68, typo[0]);
  os2.setInt16(70, typo[1]);
  os2.setInt16(72, typo[2]);
  os2.setUint16(74, m.win?.[0] ?? 1200);
  os2.setUint16(76, m.win?.[1] ?? 300);
  tables.push(['OS/2', new Uint8Array(os2.buffer)]);
  const out = new Uint8Array(12 + tables.length * 16 + tables.reduce((n, [, t]) => n + t.length, 0));
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x00010000);
  v.setUint16(4, tables.length);
  let at = 12 + tables.length * 16;
  tables.forEach(([tag, data], i) => {
    for (let k = 0; k < 4; k++) out[12 + i * 16 + k] = tag.charCodeAt(k);
    v.setUint32(12 + i * 16 + 8, at);
    v.setUint32(12 + i * 16 + 12, data.length);
    out.set(data, at);
    at += data.length;
  });
  return out;
}

const LORA = face({ hhea: [1006, -274, 0] });
const GEIST = face({ hhea: [1005, -295, 0] });
const plan = (faces: [string, Uint8Array][]): WordFontPlan => ({ faces: faces.map(([family, bytes]) => ({ family, slot: 'regular', bytes })), map: new Map(), warnings: [], altNames: new Map() });

describe('the line a face sets on its own', () => {
  it('reads ascent, descent and gap in ems', () => {
    expect(naturalLine(LORA)).toBeCloseTo(1.28, 5);
    expect(naturalLine(face({ upm: 2000, hhea: [1956, -510, 0] }))).toBeCloseTo(1.233, 5);
  });

  it('gives none where the readers would not agree', () => {
    // hhea and typographic values apart.
    expect(naturalLine(face({ hhea: [1006, -274, 0], typo: [800, -200, 200] }))).toBeUndefined();
    // Typographic values not marked for use, and Windows ones taller.
    expect(naturalLine(face({ hhea: [1006, -274, 0], useTypo: false }))).toBeUndefined();
    // Unmarked, but all three alike.
    expect(naturalLine(face({ hhea: [1006, -274, 0], useTypo: false, win: [1006, 274] }))).toBeCloseTo(1.28, 5);
    expect(naturalLine(new Uint8Array(8))).toBeUndefined();
  });
});

describe('the leading written for each style', () => {
  const body: LeadingStyle = { type: 'paragraph', pPr: { line: { twips: 272, rule: 'atLeast' } }, rPr: { font: 'Lora PTX', sz: 19 } };
  const defs = (extra: Record<string, LeadingStyle>): Map<string, LeadingStyle> => new Map(Object.entries({ Normal: body, ...extra }));
  const fonts = plan([
    ['Lora PTX', LORA],
    ['Geist PTX', GEIST],
  ]);

  it('writes the body as a multiple of its face\'s line', () => {
    const out = styleLeadings(defs({}), fonts);
    // 13.6 pt on a 9.5 pt face whose line is 1.28 ems (12.16 pt).
    expect(out.get('Normal')).toEqual({ twips: 268, rule: 'auto' });
    expect(((268 / 240) * 1.28 * 9.5).toFixed(1)).toBe('13.6');
  });

  it('leaves a style that sets the same face and size to inherit', () => {
    const out = styleLeadings(defs({ ListParagraph: { type: 'paragraph', basedOn: 'Normal' }, Quote: { type: 'paragraph', basedOn: 'Normal', rPr: {} } }), fonts);
    expect(out.has('ListParagraph')).toBe(false);
    expect(out.has('Quote')).toBe(false);
  });

  it('gives a style of another face or size its own multiple of the same distance', () => {
    const out = styleLeadings(defs({ PostextCode: { type: 'paragraph', basedOn: 'Normal', rPr: { font: 'Geist PTX', sz: 15 } } }), fonts);
    const line = out.get('PostextCode')!;
    expect(line.rule).toBe('auto');
    // Still 13.6 pt: its multiple of 1.3 ems at 7.5 pt.
    expect((line.twips / 240) * 1.3 * 7.5).toBeCloseTo(13.6, 1);
  });

  it('keeps the distance of a title set tighter than its face\'s line', () => {
    // 28 pt on a 32 pt line: under 1.28 ems.
    const out = styleLeadings(defs({ Heading1: { type: 'paragraph', basedOn: 'Normal', pPr: { line: { twips: 640, rule: 'atLeast' } }, rPr: { sz: 56 } } }), fonts);
    expect(out.has('Heading1')).toBe(false);
  });

  it('keeps the distance of the styles whose lines mix faces or hold pictures', () => {
    const out = styleLeadings(defs({ Header: { type: 'paragraph', basedOn: 'Normal', rPr: { sz: 16 } }, PostextFigure: { type: 'paragraph', basedOn: 'Normal' }, TOC1: { type: 'paragraph', basedOn: 'Normal', pPr: { line: { twips: 300, rule: 'atLeast' } }, rPr: { sz: 16 } } }), fonts);
    // What they inherited, said in full now that the body says a multiple.
    expect(out.get('Header')).toEqual({ twips: 272, rule: 'atLeast' });
    expect(out.get('PostextFigure')).toEqual({ twips: 272, rule: 'atLeast' });
    expect(out.has('TOC1')).toBe(false);
  });

  it('leaves exact and automatic leadings as they are', () => {
    const out = styleLeadings(defs({ PostextBoxa: { type: 'paragraph', basedOn: 'Normal', pPr: { line: { twips: 226, rule: 'exact' } } }, PostextBoxb: { type: 'paragraph', basedOn: 'Normal', pPr: { line: { twips: 240, rule: 'auto' } } } }), fonts);
    expect(out.has('PostextBoxa')).toBe(false);
    expect(out.has('PostextBoxb')).toBe(false);
  });

  it('writes a table cell\'s exact leading as a multiple too', () => {
    const cells = { PostextTableBodyDefault: { type: 'paragraph', basedOn: 'Normal', pPr: { line: { twips: 226, rule: 'exact' } }, rPr: { font: 'Geist PTX', sz: 16 } }, PostextTableHeaderDefault: { type: 'paragraph', basedOn: 'PostextTableBodyDefault', pPr: { line: { twips: 180, rule: 'exact' } }, rPr: { sz: 15 } } } as const;
    const out = styleLeadings(defs(cells), fonts);
    // 11.3 pt on 8 pt Geist (10.4 pt of its own).
    expect(out.get('PostextTableBodyDefault')).toEqual({ twips: 261, rule: 'auto' });
    // A header set tighter than its face's line stays exact.
    expect(out.has('PostextTableHeaderDefault')).toBe(false);
  });

  it('changes nothing without embedded faces, or for a face it cannot measure', () => {
    expect(styleLeadings(defs({}), undefined).size).toBe(0);
    expect(styleLeadings(defs({}), plan([['Other', LORA]])).size).toBe(0);
    expect(styleLeadings(defs({}), plan([['Lora PTX', face({ hhea: [1006, -274, 0], useTypo: false })]])).size).toBe(0);
  });
});
