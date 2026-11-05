// Regressions found reviewing the semantic writer (#1390): fragment order
// with captions above, cancelled first-line indents, list restarts, linear
// block joining, part page breaks, widths inside boxes, characters XML
// cannot carry, and XE field text.

import { describe, expect, it } from 'vitest';
import type { Resource } from '../../types.js';
import { endsWithTable, joinBlocks } from './blocks.js';
import { exportDocx, exportProblems } from './fixtures/harness.js';
import { pPr } from './wml.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const table: Resource = { id: 't1', typeId: 'table', kind: 'table', caption: 'Cap *x*', createdAt: 0, updatedAt: 0, table: { model: { rows: [[{ content: 'cell' }, { content: 'two' }]] } } };
const wide: Resource = { id: 'w1', typeId: 'figure', kind: 'bitmap', caption: 'Wide', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'p', format: 'png', width: 100000, height: 1000 } };
const fields = (f: { target: { kind: string } }): string | undefined => {
  const t = f.target as { kind: string; resourceId?: string; field?: string; row?: number; col?: number };
  if (t.resourceId === 't1') return t.field === 'cell' ? table.table!.model.rows[t.row!]![t.col!]!.content : table.caption;
  if (t.resourceId === 'w1') return wide.caption;
  return undefined;
};
const gridCols = (xml: string): number[] => [...xml.matchAll(/<w:tblW w:w="(\d+)"/g)].map((m) => Number(m[1]));

describe('semantic docx: review fixes', () => {
  it('logs a caption set above its table before the table cells (document order)', async () => {
    const md = '::resource{id="t1"}\n\nAfter\n';
    const e = await exportDocx(md, { resources: [table], config: { captionStyle: { position: 'above' } } as never });
    expect(exportProblems(e, [md], fields)).toEqual([]);
    expect(e.map.fragments.map((f) => f.text)).toEqual(['Table\u00a01. ', 'Cap x', 'cell', 'two', 'After']);
    expect(e.doc.indexOf('Cap')).toBeLessThan(e.doc.indexOf('<w:tbl>'));
  });

  it('writes a 0 indent so styles cancel Normal\'s first-line indent, and a negative one as hanging', async () => {
    expect(pPr({ ind: { firstLine: 0 } })).toBe('<w:pPr><w:ind w:firstLine="0"/></w:pPr>');
    expect(pPr({ ind: { left: 0, firstLine: -240 } })).toBe('<w:pPr><w:ind w:left="0" w:hanging="240"/></w:pPr>');
    const e = await exportDocx('# Head\n\n- item\n');
    const styles = e.part('word/styles.xml');
    for (const id of ['Heading1', 'Caption', 'ListParagraph', 'PostextSource', 'PostextCode']) {
      expect(styles).toMatch(new RegExp(`w:styleId="${id}"[^]*?<w:ind [^>]*w:firstLine="0"[^]*?</w:style>`));
    }
  });

  it('restarts every ordered list (Word continues a shared abstract numbering otherwise)', async () => {
    const e = await exportDocx('1. a\n2. b\n\npara\n\n1. c\n\nmore\n\n3. d\n');
    const numbering = e.part('word/numbering.xml');
    const nums = [...numbering.matchAll(/<w:num w:numId="\d+">.*?<\/w:num>/g)].map((m) => m[0]);
    expect(nums).toHaveLength(3);
    expect(nums.map((n) => /<w:lvlOverride w:ilvl="0"><w:startOverride w:val="(\d+)"\/>/.exec(n)?.[1])).toEqual(['1', '1', '3']);
  });

  it('joins blocks reading only each part, and still separates adjacent tables', () => {
    const tbl = '<w:tbl><w:tr/></w:tbl>';
    const sdt = `<w:sdt><w:sdtPr><w:tag w:val="x"/></w:sdtPr><w:sdtContent>${tbl}</w:sdtContent></w:sdt>`;
    expect(endsWithTable(tbl)).toBe(true);
    expect(endsWithTable(sdt)).toBe(true);
    expect(endsWithTable('<w:p/>')).toBe(false);
    expect(joinBlocks([tbl, '', sdt, '<w:p/>', tbl])).toBe(`${tbl}<w:p/>${sdt}<w:p/>${tbl}`);
    const many = Array.from({ length: 20000 }, (_, i) => (i % 2 ? tbl : '<w:p/>'));
    expect(joinBlocks(many)).toBe(many.join(''));
  });

  it('breaks the page once for a part with a number and a title', async () => {
    const md = ':::part{number="I" title="Origins"}\nText\n:::\n';
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.doc).toMatch(/<w:pStyle w:val="PostextPart"\/><w:pageBreakBefore w:val="0"\/><\/w:pPr>(?:<w:bookmarkStart[^>]*>)?<w:r><w:t xml:space="preserve">Origins/);
    expect(e.doc.match(/<w:pageBreakBefore w:val="0"\/>/g)).toHaveLength(1);
  });

  it('fits nested boxes, tables and pictures to the box cell', async () => {
    const md = ':::callout{type="note"}\n:::callout{type="note"}\nInner\n:::\n\n::resource{id="t1"}\n\n::resource{id="w1"}\n:::\n\n::resource{id="w1"}\n';
    const e = await exportDocx(md, { resources: [table, wide], resourceBytes: () => PNG });
    expect(exportProblems(e, [md], fields)).toEqual([]);
    const [outer, inner, innerTable, topTable] = gridCols(e.doc);
    expect(inner).toBeLessThan(outer!);
    expect(innerTable).toBeLessThan(outer!);
    expect(topTable).toBeUndefined();
    const extents = [...e.doc.matchAll(/<wp:extent cx="(\d+)"/g)].map((m) => Number(m[1]));
    expect(extents).toHaveLength(2);
    expect(extents[0]).toBeLessThan(extents[1]!);
  });

  it('leaves characters XML cannot carry out of both the runs and the map', async () => {
    const md = 'Bad \u000b here \ud800 and \udc00 ok 😀.\n';
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.frag('Bad  here  and  ok 😀.').map[4]).toBe(5);
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(e.files['word/document.xml'])).not.toThrow();
  });

  it('escapes colons in XE terms and uses the index locale\'s see label', async () => {
    const md = 'Word:index{term="C: drive" see="Disk"} here.\n';
    const e = await exportDocx(md, { config: { locale: 'es' } as never });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.doc).toContain(' XE "C\\: drive" \\t "Véase Disk" ');
  });
});
