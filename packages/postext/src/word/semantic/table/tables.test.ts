// Tables of the semantic .docx after the second review (#1444): the rules
// the table style asks for, the cells' own faces in cell styles, padding,
// zebra rows, columns no narrower than their longest word, and cell
// pictures. Every export reads back unchanged, and a cell edited in Word
// lands in its resource cell.

import { describe, expect, it } from 'vitest';
import type { PostextConfig, Resource, TableCell } from '../../../types.js';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { exportDocx, exportProblems, type Exported } from '../fixtures/harness.js';
import { columnFractions, visibleText } from './widths.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="20"/>');
const MD = 'Before.\n\n::resource{id="t1"}\n\nAfter.\n';
const cfg = (c: Record<string, unknown>): PostextConfig => c as unknown as PostextConfig;

function table(rows: TableCell[][], extra: Record<string, unknown> = {}, styleId?: string): Resource {
  return { id: 't1', typeId: 'table', kind: 'table', caption: 'Cap', createdAt: 0, updatedAt: 0, table: { ...(styleId ? { styleId } : {}), model: { headerRowCount: 1, rows, ...extra } } } as Resource;
}

const SIMPLE = table([
  [{ content: 'Amplitude' }, { content: 'Measured' }],
  [{ content: '5°' }, { content: '2.0069' }],
  [{ content: '10°' }, { content: '2.0096' }],
]);

/** The sides `w:tblBorders` strokes (`nil` ones left out). */
function stroked(e: Exported): string[] {
  const b = /<w:tblBorders>(.*?)<\/w:tblBorders>/.exec(e.doc)![1]!;
  return [...b.matchAll(/<w:(\w+) w:val="single"/g)].map((m) => m[1]!);
}

const styleOf = (e: Exported, id: string): string => {
  const xml = e.part('word/styles.xml');
  const at = xml.indexOf(`w:styleId="${id}"`);
  return at < 0 ? '' : xml.slice(at, xml.indexOf('</w:style>', at));
};

function unchanged(e: Exported, resources: Resource[]): void {
  const r = applyDocxEdits(e.bytes, { chapters: [{ id: 'ch1', markdown: MD }], resources });
  expect(r.edits).toEqual([]);
  expect(r.changed).toBe(false);
  expect(r.chapters[0]!.markdown).toBe(MD);
}

function fields(resources: Resource[]) {
  return (f: { target: { kind: string } & Record<string, unknown> }): string | undefined => {
    const t = f.target as { resourceId?: string; field?: string; row?: number; col?: number };
    const r = resources.find((x) => x.id === t.resourceId);
    return t.field === 'cell' ? r?.table!.model.rows[t.row!]![t.col!]!.content : undefined;
  };
}

describe('semantic docx: table rules (#1444)', () => {
  it('draws only the rules the table style asks for', async () => {
    const rules = async (r: string, borders = true): Promise<Exported> => exportDocx(MD, { resources: [SIMPLE], config: cfg({ tableStyle: { rules: r, borders } }) });
    expect(stroked(await rules('grid'))).toEqual(['top', 'left', 'bottom', 'right', 'insideH', 'insideV']);
    expect(stroked(await rules('horizontal'))).toEqual(['top', 'bottom', 'insideH']);
    expect(stroked(await rules('outer'))).toEqual(['top', 'left', 'bottom', 'right']);
    expect(stroked(await rules('none'))).toEqual([]);
    expect(stroked(await rules('grid', false))).toEqual([]);
  });

  it('sets booktabs as heavy rules above and below and a light rule under the header', async () => {
    const config = cfg({ tableStyle: { rules: 'booktabs', bodyFontSize: { value: 10, unit: 'pt' }, borderColor: { hex: '#141a1f', model: 'hex' } } });
    const e = await exportDocx(MD, { resources: [SIMPLE], config });
    expect(exportProblems(e, [MD], fields([SIMPLE]))).toEqual([]);
    expect(stroked(e)).toEqual(['top', 'bottom']);
    // 0.08em and 0.05em of 10pt: 0.8pt and 0.5pt, in eighths of a point.
    expect(e.doc).toContain('<w:top w:val="single" w:sz="6" w:space="0" w:color="141A1F"/>');
    const header = /<w:tr><w:trPr>[^]*?<w:tblHeader\/>[^]*?<\/w:tr>/.exec(e.doc)![0];
    expect(header.match(/<w:tcBorders><w:bottom w:val="single" w:sz="4" w:space="0" w:color="141A1F"\/><\/w:tcBorders>/g)).toHaveLength(2);
    // Body rows carry no rules of their own.
    expect(e.doc.match(/<w:tcBorders>/g)).toHaveLength(2);
    unchanged(e, [SIMPLE]);
  });

  it('rules a group row and a spanning header cell in a booktabs table', async () => {
    const t = table(
      [
        [{ content: 'Both', colSpan: 2 }, { content: '', hiddenBy: { row: 0, col: 0 } }],
        [{ content: 'A' }, { content: 'B' }],
        [{ content: 'Group', colSpan: 2 }, { content: '', hiddenBy: { row: 2, col: 0 } }],
        [{ content: '1' }, { content: '2' }],
        [{ content: 'Next', colSpan: 2 }, { content: '', hiddenBy: { row: 4, col: 0 } }],
        [{ content: '3' }, { content: '4' }],
      ],
      { headerRowCount: 2 },
    );
    const e = await exportDocx(MD, { resources: [t], config: cfg({ tableStyle: { rules: 'booktabs', groupRules: true } }) });
    expect(exportProblems(e, [MD], fields([t]))).toEqual([]);
    const tc = (text: string): string => {
      const at = e.doc.indexOf(`>${text}<`);
      return e.doc.slice(e.doc.lastIndexOf('<w:tc>', at), at);
    };
    expect(tc('Both')).toMatch(/<w:tcBorders><w:bottom w:val="single" w:sz="\d+"/);
    expect(tc('A')).toMatch(/<w:tcBorders><w:bottom /);
    // The first group opens under the header rule; the next one gets its own.
    expect(tc('Group')).not.toContain('<w:tcBorders>');
    expect(tc('Next')).toMatch(/<w:tcBorders><w:top w:val="single"/);
    unchanged(e, [t]);
  });
});

/** The `w:tcPr` of each cell of each row of the first table. */
function cellProps(e: Exported): string[][] {
  const tbl = /<w:tbl>[^]*?<\/w:tbl>/.exec(e.doc)![0];
  return [...tbl.matchAll(/<w:tr>([^]*?)<\/w:tr>/g)].map((tr) => [...tr[1]!.matchAll(/<w:tcPr>([^]*?)<\/w:tcPr>/g)].map((m) => m[1]!));
}

describe('semantic docx: merged cells in a booktabs table (#1444)', () => {
  const hid = (row: number, col: number): TableCell => ({ content: '', hiddenBy: { row, col } });

  it('rules a spanning header cell where it ends, and not when it reaches the header rule', async () => {
    // "Wide" spans two columns and the first two of three header rows; "Deep"
    // spans two columns and all three, so the header rule is its only one.
    const t = table(
      [
        [{ content: 'Wide', colSpan: 2, rowSpan: 2 }, hid(0, 0), { content: 'Deep', colSpan: 2, rowSpan: 3 }, hid(0, 2)],
        [hid(0, 0), hid(0, 0), hid(0, 2), hid(0, 2)],
        [{ content: 'a' }, { content: 'b' }, hid(0, 2), hid(0, 2)],
        [{ content: '1' }, { content: '2' }, { content: '3' }, { content: '4' }],
      ],
      { headerRowCount: 3 },
    );
    const e = await exportDocx(MD, { resources: [t], config: cfg({ tableStyle: { rules: 'booktabs', spanRules: 'full' } }) });
    expect(exportProblems(e, [MD], fields([t]))).toEqual([]);
    const [r0, r1, r2, r3] = cellProps(e);
    // Row 0: the two merged regions open, neither with a rule of its own.
    expect(r0!.map((p) => p.includes('<w:tcBorders>'))).toEqual([false, false]);
    expect(r0![0]).toContain('<w:vMerge w:val="restart"/>');
    // Row 1: "Wide" ends here and carries the span rule; "Deep" goes on.
    expect(r1![0]).toContain('<w:vMerge/>');
    expect(r1![0]).toMatch(/<w:tcBorders><w:bottom w:val="single"/);
    expect(r1![1]).not.toContain('<w:tcBorders>');
    // Row 2, the last header row: the header rule under every cell, "Deep"
    // continuation included, and nothing more.
    expect(r2!).toHaveLength(3);
    for (const p of r2!) expect(p.match(/<w:bottom /g)).toHaveLength(1);
    expect(r3!.some((p) => p.includes('<w:tcBorders>'))).toBe(false);
    unchanged(e, [t]);
  });

  it('carries a merged cell fill and header style into its continuation', async () => {
    const t = table(
      [
        [{ content: 'Head', rowSpan: 2 }, { content: 'H1' }],
        [hid(0, 0), { content: 'H2' }],
        [{ content: 'Tint', rowSpan: 2, background: { hex: '#ddeeff', model: 'hex' } }, { content: 'x' }],
        [hid(2, 0), { content: 'y' }],
      ],
      { headerRowCount: 2 },
    );
    const e = await exportDocx(MD, { resources: [t], config: cfg({ tableStyle: { headerBackgroundEnabled: true, headerBackground: { hex: '#112233', model: 'hex' } } }) });
    expect(exportProblems(e, [MD], fields([t]))).toEqual([]);
    const rows = cellProps(e);
    expect(rows[1]![0]).toContain('<w:vMerge/>');
    expect(rows[1]![0]).toContain('w:fill="112233"');
    expect(rows[3]![0]).toContain('<w:vMerge/>');
    expect(rows[3]![0]).toContain('w:fill="DDEEFF"');
    expect(rows[3]![1]).not.toContain('w:fill=');
    // The header continuation's paragraph is in the header style.
    const tbl = /<w:tbl>[^]*?<\/w:tbl>/.exec(e.doc)![0];
    const row1 = [...tbl.matchAll(/<w:tr>([^]*?)<\/w:tr>/g)][1]![1]!;
    expect(row1.match(/<w:pStyle w:val="PostextTableHeaderDefault"\/>/g)).toHaveLength(2);
    unchanged(e, [t]);
  });

  it('rules a group head that spans rows once, and not a row of continuations', async () => {
    const t = table(
      [
        [{ content: 'A' }, { content: 'B' }],
        [{ content: '1' }, { content: '2' }],
        [{ content: 'Group', colSpan: 2, rowSpan: 2 }, hid(2, 0)],
        [hid(2, 0), hid(2, 0)],
        [{ content: 'Tall', rowSpan: 2 }, { content: '3' }],
        [hid(4, 0), { content: '4' }],
      ],
      { headerRowCount: 1 },
    );
    const e = await exportDocx(MD, { resources: [t], config: cfg({ tableStyle: { rules: 'booktabs', groupRules: true } }) });
    expect(exportProblems(e, [MD], fields([t]))).toEqual([]);
    const rows = cellProps(e);
    const topped = rows.map((r) => r.some((p) => /<w:tcBorders><w:top /.test(p)));
    // Only the group head; not the row its cell runs into, nor a row whose
    // one visible cell sits beside a continuation.
    expect(topped).toEqual([false, false, true, false, false, false]);
    unchanged(e, [t]);
  });
});

describe('semantic docx: table cells (#1444)', () => {
  it('sets cells in their table style faces, sizes and colours, header bold in the style', async () => {
    const config = cfg({
      tableStyle: { bodyFontFamily: 'Chivo', headerFontFamily: 'Schibsted Grotesk', bodyFontSize: { value: 8.5, unit: 'pt' }, headerFontSize: { value: 7.5, unit: 'pt' }, headerColor: { hex: '#0f4d3f', model: 'hex' }, headerTextTransform: 'uppercase' },
      tableStyles: [{ id: 'lines', bodyFontFamily: 'Inter Tight', rules: 'horizontal' }],
    });
    const named = { ...table([[{ content: 'x' }], [{ content: 'y' }]]), id: 't2', table: { styleId: 'lines', model: { rows: [[{ content: 'x' }], [{ content: 'y' }]] } } } as Resource;
    const md = `${MD}\n::resource{id="t2"}\n`;
    const e = await exportDocx(md, { resources: [SIMPLE, named], config });
    const body = styleOf(e, 'PostextTableBodyDefault');
    expect(body).toContain('<w:basedOn w:val="Normal"/>');
    expect(body).toContain('w:ascii="Chivo"');
    expect(body).toContain('<w:sz w:val="17"/>');
    expect(body).toContain('<w:spacing w:before="0" w:after="0"');
    const header = styleOf(e, 'PostextTableHeaderDefault');
    expect(header).toContain('<w:basedOn w:val="PostextTableBodyDefault"/>');
    expect(header).toContain('w:ascii="Schibsted Grotesk"');
    expect(header).toContain('<w:b/>');
    expect(header).toContain('<w:caps/>');
    expect(header).toContain('<w:color w:val="0F4D3F"/>');
    expect(header).toContain('<w:sz w:val="15"/>');
    expect(styleOf(e, 'PostextTableBodylines')).toContain('w:ascii="Inter Tight"');
    // Runs carry no bold of their own (the importer would read it as an edit).
    const amplitude = e.doc.slice(e.doc.lastIndexOf('<w:p>', e.doc.indexOf('>Amplitude<')), e.doc.indexOf('>Amplitude<'));
    expect(amplitude).toContain('<w:pStyle w:val="PostextTableHeaderDefault"/>');
    expect(amplitude).not.toContain('<w:b/>');
    const r = applyDocxEdits(e.bytes, { chapters: [{ id: 'ch1', markdown: md }], resources: [SIMPLE, named] });
    expect(r.edits).toEqual([]);
  });

  it('pads cells as the table style does and stripes alternate rows', async () => {
    const t = table([[{ content: 'H' }], [{ content: 'a' }], [{ content: 'b' }], [{ content: 'c', background: { hex: '#ffeeaa', model: 'hex' } }]]);
    const config = cfg({ tableStyle: { cellPadding: { value: 7.5, unit: 'pt' }, bodyAlternateBackgroundEnabled: true, bodyAlternateBackground: { hex: '#f2f2f2', model: 'hex' } } });
    const e = await exportDocx(MD, { resources: [t], config });
    expect(e.doc).toContain('<w:tblCellMar><w:top w:w="150" w:type="dxa"/><w:left w:w="150" w:type="dxa"/><w:bottom w:w="150" w:type="dxa"/><w:right w:w="150" w:type="dxa"/></w:tblCellMar>');
    const fill = (text: string): string | undefined => {
      const at = e.doc.indexOf(`>${text}<`);
      return /w:fill="(\w+)"/.exec(e.doc.slice(e.doc.lastIndexOf('<w:tc>', at), at))?.[1];
    };
    expect([fill('a'), fill('b'), fill('c')]).toEqual([undefined, 'F2F2F2', 'FFEEAA']);
    unchanged(e, [t]);
  });

  it('keeps an empty writing row a line and its padding tall', async () => {
    const t = table([[{ content: '**11 a)**' }, { content: '' }], [{ content: '' }, { content: '' }]], { headerRowCount: 0, columnWidths: [1, 5] }, 'lines');
    const config = cfg({ tableStyles: [{ id: 'lines', rules: 'horizontal', cellPadding: { value: 7.5, unit: 'pt' } }] });
    const e = await exportDocx(MD, { resources: [t], config });
    expect(exportProblems(e, [MD], fields([t]))).toEqual([]);
    // Every cell, empty ones too, holds a paragraph in the cell style.
    expect(e.doc.match(/<w:pStyle w:val="PostextTableBodylines"\/>/g)).toHaveLength(4);
    expect(stroked(e)).toEqual(['top', 'bottom', 'insideH']);
    unchanged(e, [t]);
  });
});

describe('semantic docx: table column widths (#1444)', () => {
  it('reads the cell text roughly as a reader sees it', () => {
    expect(visibleText('**Whole town** :chip[A]{style=x} $x$')).toBe('Whole town A xxxx');
  });

  it('gives a column room for its longest word', () => {
    const model = { rows: [[{ content: 'Amplitude' }, { content: 'b' }, { content: 'c' }, { content: 'd' }]], columnWidths: [1, 3, 3, 3] };
    const m = (): { charEm: number; fontPx: number } => ({ charEm: 0.6, fontPx: 10 });
    const f = columnFractions(model, 4, 300, 4, m);
    expect(f.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    // "Amplitude": 9 × 6 px and 8 px of padding.
    expect(f[0]! * 300).toBeCloseTo(62);
    expect(f[1]).toBeCloseTo(f[2]!);
    // Weights from the text when the model has none: the longer column wider.
    const g = columnFractions({ rows: [[{ content: 'x' }, { content: 'a much longer piece of text' }]] }, 2, 600, 0, m);
    expect(g[1]!).toBeGreaterThan(g[0]! * 3);
  });

  it('writes the widths as percentages of the table and grid columns of its width', async () => {
    const t = table([[{ content: 'Observatory' }, { content: 'x' }]], { headerRowCount: 0, columnWidths: [1, 20] });
    const e = await exportDocx(MD, { resources: [t] });
    const pct = [...e.doc.matchAll(/<w:tcW w:w="(\d+)" w:type="pct"\/>/g)].map((m) => Number(m[1]));
    expect(pct[0]! + pct[1]!).toBeGreaterThanOrEqual(4999);
    expect(pct[0]!).toBeGreaterThan(Math.round(5000 / 21));
    expect(e.doc).toContain('<w:tblW w:w="5000" w:type="pct"/>');
  });
});

describe('semantic docx: table cell pictures (#1444)', () => {
  const bar: Resource = { id: 'bar', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, svg: { fileId: 'bar.svg', width: 200, height: 20 } } as Resource;
  const dot: Resource = { id: 'dot', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'dot.png', format: 'png', width: 10, height: 10 } } as Resource;
  const t = table([
    [{ content: 'Ward' }, { content: 'Share' }],
    [{ content: 'Market' }, { content: '', image: { resourceId: 'bar', width: 0.5 } }],
    [{ content: 'Town' }, { content: 'Mark', image: { resourceId: 'dot' }, align: 'center' }],
  ], { columnWidths: [1, 1] });
  const resources = [t, bar, dot];
  const options = {
    resources,
    resourceBytes: (id: string): Uint8Array | undefined => (id === 'bar.svg' ? SVG : id === 'dot.png' ? PNG : undefined),
    rasterizeSvg: async (): Promise<Uint8Array> => PNG,
  };

  it('draws a cell picture inline, sized like the engine, and reads back unchanged', async () => {
    const e = await exportDocx(MD, options);
    expect(exportProblems(e, [MD], fields(resources))).toEqual([]);
    expect(e.doc.match(/<w:drawing>/g)).toHaveLength(2);
    // The bar's SVG travels with its bitmap fallback.
    expect(Object.keys(e.files).filter((f) => /^word\/media\/.*\.svg$/.test(f))).toHaveLength(1);
    // Half the cell's inner width, at the picture's ratio (10:1).
    const [cx, cy] = /<wp:extent cx="(\d+)" cy="(\d+)"\/>/.exec(e.doc)!.slice(1).map(Number);
    expect(cx! / cy!).toBeCloseTo(10, 0);
    // The bitmap keeps its own size (10 px at the default 300 dpi),
    // centred over its text.
    const mark = e.doc.slice(e.doc.lastIndexOf('<w:tc>', e.doc.indexOf('>Mark<')), e.doc.indexOf('>Mark<'));
    expect(mark).toContain('<wp:extent cx="30480" cy="30480"/>');
    expect(mark.match(/<w:jc w:val="center"\/>/g)).toHaveLength(2);
    unchanged(e, resources);
  });

  it('writes a cell edit back to the resource and leaves the picture', async () => {
    const e = await exportDocx(MD, options);
    const files = unzipSync(e.bytes);
    files['word/document.xml'] = strToU8(strFromU8(files['word/document.xml']!).replace('>Mark<', '>Seal<'));
    const r = applyDocxEdits(zipSync(files), { chapters: [{ id: 'ch1', markdown: MD }], resources });
    expect(r.chapters[0]!.markdown).toBe(MD);
    const cell = r.resources!.find((x) => x.id === 't1')!.table!.model.rows[2]![1]!;
    expect(cell).toEqual({ content: 'Seal', image: { resourceId: 'dot' }, align: 'center' });
  });
});
