// A band's figure beside its texts (#1458): an opener's chapter number
// stands in a cell of its own at its side of the band's table, the kicker,
// the title and the lead in the cell next to it, as the print sets them.

import { describe, expect, it } from 'vitest';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { exportDocx, exportProblems } from '../fixtures/harness.js';

const mm = (value: number) => ({ value, unit: 'mm' });
const pt = (value: number) => ({ value, unit: 'pt' });
const white = { hex: '#ffffff', model: 'hex' };
const at = (y: number, x = 0, width?: number) => ({ anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(x), y: mm(y) }, ...(width ? { size: { width: mm(width) } } : {}) });
const text = (id: string, content: string, y: number, extra: object = {}) => ({ kind: 'text', id, content, placement: at(y, 0, 110), fontSize: pt(10), color: white, ...extra });
const band = { kind: 'box', id: 'band', placement: { ...at(0), size: { width: 'fill', height: mm(60) } }, style: { backgroundColor: { hex: '#2b4acb', model: 'hex' } } };
const opener = (elements: object[]) =>
  ({
    page: { width: mm(210), height: mm(280), margins: { top: mm(24), bottom: mm(22), left: mm(20), right: mm(20) } },
    headingStyles: [{ id: 'open', advancedDesign: { enabled: true, slot: { elements } } }],
  }) as never;
// The number at the right edge of the band, from above the kicker down
// past the title; the lead starts under it.
const number = { kind: 'text', id: 'number', content: '7', placement: at(4, 110, 60), fontSize: pt(100), align: 'right', color: white };
const md = '# Alpha {style="open" kicker="Chapter seven"}\n\nText.\n';
const elements = [band, number, text('kicker', '{attr.kicker}', 12), text('title', '{titleText}', 20, { fontSize: pt(28) }), text('lead', 'A lead of the design.', 44)];

/** The first row (the band) of the table holding `s`. */
const table = (doc: string, s: string): string => /<w:tr>(?:(?!<\/w:tr>)[^])*<\/w:tr>/.exec(new RegExp(`<w:tbl>(?:(?!<w:tbl>)[^])*?>${s}<(?:(?!</w:tbl>)[^])*</w:tbl>`).exec(doc)?.[0] ?? '')?.[0] ?? '';

describe('semantic docx: a figure beside the texts of a band', () => {
  it('sets the number in a cell at the right of the texts', async () => {
    const e = await exportDocx(md, { config: opener(elements) });
    expect(exportProblems(e, [md])).toEqual([]);
    const t = table(e.doc, 'Alpha');
    const cells = t.match(/<w:tc>(?:(?!<\/w:tc>)[^])*<\/w:tc>/g) ?? [];
    // Two cells of the band's fill: the texts, then the number.
    expect(cells).toHaveLength(2);
    for (const c of cells) expect(c).toContain('w:fill="2B4ACB"');
    expect(cells[0]).toContain('>Chapter seven<');
    expect(cells[0]).toContain('>Alpha<');
    expect(cells[0]).toContain('>A lead of the design.<');
    expect(cells[0]).not.toContain('>7<');
    expect(cells[1]).toContain('>7<');
    expect(cells[1]).not.toContain('>Alpha<');
    // The texts keep most of the band, the number a narrow cell with no
    // room under its line.
    const widths = [...t.matchAll(/<w:tcW w:w="(\d+)" w:type="dxa"\/>/g)].map((m) => Number(m[1]));
    expect(widths).toHaveLength(2);
    expect(widths[0]!).toBeGreaterThan(widths[1]! * 2);
    expect(cells[1]).toMatch(/<w:spacing [^>]*w:after="0"/);
    const r = applyDocxEdits(e.bytes, { chapters: [{ id: 'ch1', markdown: md }] });
    expect(r.edits).toEqual([]);
    expect(r.chapters[0]!.markdown).toBe(md);
  });

  it('keeps a figure above the texts on a line of its own', async () => {
    // The same number set above the kicker, not beside it.
    const above = [band, { ...number, placement: at(2, 110, 60), fontSize: pt(24) }, text('kicker', '{attr.kicker}', 14), text('title', '{titleText}', 22, { fontSize: pt(28) })];
    const e = await exportDocx(md, { config: opener(above) });
    expect(exportProblems(e, [md])).toEqual([]);
    const t = table(e.doc, 'Alpha');
    expect(t.match(/<w:tc>/g)).toHaveLength(1);
    expect(t.indexOf('>7<')).toBeLessThan(t.indexOf('>Chapter seven<'));
  });

  it('gives a long line beside the texts no cell of its own', async () => {
    const words = [band, { ...number, content: 'Volume one' }, text('kicker', '{attr.kicker}', 12), text('title', '{titleText}', 20, { fontSize: pt(28) })];
    const e = await exportDocx(md, { config: opener(words) });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(table(e.doc, 'Alpha').match(/<w:tc>/g)).toHaveLength(1);
  });
});
