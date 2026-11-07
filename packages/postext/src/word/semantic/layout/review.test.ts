// The review of the second round of page layout (#1444): a line of verse
// split in Word, page-number formats on every section, page references as
// PAGEREF fields, what spans the page, ruby at its paragraph's size and the
// insets of a box inside a box.

import { describe, expect, it } from 'vitest';
import type { PostextConfig, Resource } from '../../../types.js';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { editDocx } from '../../roundtrip/fixture.test-helper.js';
import { exportDocx, exportProblems, type Exported } from '../fixtures/harness.js';

const cfg = (c: Record<string, unknown>): PostextConfig => c as unknown as PostextConfig;
const chapters = (md: string[]): { chapters: { id: string; markdown: string }[] } => ({ chapters: md.map((markdown, i) => ({ id: `ch${i + 1}`, markdown })) });

function unchanged(e: Exported, md: string[], bytes = e.bytes): void {
  const r = applyDocxEdits(bytes, chapters(md));
  expect(r.edits).toEqual([]);
  expect(r.chapters.map((c) => c.markdown)).toEqual(md);
}

const sectionsOf = (doc: string): string[] => doc.match(/<w:sectPr>.*?<\/w:sectPr>/g) ?? [];

/** The paragraph properties of the paragraph holding `text`. */
function pPrOf(doc: string, text: string): string {
  const at = doc.indexOf(text);
  const start = doc.lastIndexOf('<w:p>', at);
  return /<w:pPr>.*?<\/w:pPr>/.exec(doc.slice(start, at))![0];
}

describe('semantic docx: second layout review (#1444)', () => {
  const VERSE = ':::verse\nThe world is charged with the grandeur of God.\n    It gathers to a greatness, like the ooze of oil\nCrushed.\n:::\n';

  it('reads a line of verse split in Word as two lines of the stanza', async () => {
    const e = await exportDocx(VERSE);
    expect(exportProblems(e, [VERSE])).toEqual([]);
    const pPr = pPrOf(e.doc, 'It gathers');
    const split = (lead: string): Uint8Array =>
      editDocx(e.bytes, (xml) => xml.replace('greatness, like', `greatness,</w:t></w:r></w:p><w:p>${pPr}<w:r><w:t xml:space="preserve">${lead}like`));
    const plain = applyDocxEdits(split(''), chapters([VERSE]));
    expect(plain.edits.every((x) => x.kind === 'text' && x.status === 'applied')).toBe(true);
    expect(plain.chapters[0]!.markdown).toBe(VERSE.replace('greatness, like', 'greatness,\nlike'));
    // A new line indented with en spaces, as the writer indents lines.
    const indented = applyDocxEdits(split('  '), chapters([VERSE]));
    expect(indented.chapters[0]!.markdown).toBe(VERSE.replace('greatness, like', 'greatness,\n  like'));
  });

  it('keeps a paragraph mark typed in prose a paragraph break', async () => {
    const md = 'One sentence. Another one.\n';
    const e = await exportDocx(md);
    const pPr = pPrOf(e.doc, 'One sentence');
    const r = applyDocxEdits(editDocx(e.bytes, (xml) => xml.replace('sentence. Another', `sentence.</w:t></w:r></w:p><w:p>${pPr}<w:r><w:t xml:space="preserve">Another`)), chapters([md]));
    expect(r.chapters[0]!.markdown).toBe('One sentence.\n\nAnother one.\n');
  });

  it('writes the page-number format on every section, the start on the first only', async () => {
    const md = ['# One\n\nText.\n\n## Sub\n\nMore.\n', '# Two\n\nText.\n'];
    const config = cfg({
      page: { pageNumbering: { format: 'lower-roman', startAt: 5 } },
      headings: { levels: [{ level: 2, breakBefore: { enabled: true, parity: 'any' } }] },
    });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, md)).toEqual([]);
    const sects = sectionsOf(e.doc);
    expect(sects).toHaveLength(3);
    expect(sects[0]).toContain('<w:pgNumType w:fmt="lowerRoman" w:start="5"/>');
    for (const s of sects.slice(1)) expect(s).toContain('<w:pgNumType w:fmt="lowerRoman"/>');
    unchanged(e, md);
  });

  it('writes the page of a page reference as a PAGEREF Word fills in', async () => {
    const md = '# Optics {#optics}\n\nSee :ref{id="optics" style=page} now.\n';
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.doc).toContain('PAGEREF optics \\h');
    expect(e.doc).toContain('<w:fldChar w:fldCharType="begin" w:dirty="true"/>');
    const frag = e.map.fragments.find((f) => f.text.startsWith('See '))!;
    expect(frag.text).not.toContain('?');
    expect(frag.text).toContain('￼');
    unchanged(e, [md]);
    // Word updates the field: its result is no edit.
    const updated = editDocx(e.bytes, (xml) => {
      const at = xml.indexOf('PAGEREF optics');
      const end = xml.indexOf('<w:fldChar w:fldCharType="end"/>', at);
      const open = xml.lastIndexOf('<w:r>', end);
      return `${xml.slice(0, open)}<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>12</w:t></w:r>${xml.slice(open)}`;
    });
    unchanged(e, [md], updated);
  });

  it('spans the page for a heading with a design and a float across every column', async () => {
    const res: Resource = { id: 'w', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'w', format: 'png', width: 2000, height: 1000 }, placement: { columns: 2 } } as never;
    const md = '# Opener\n\nText in columns.\n\n::resource{id="w"}\n\nMore text.\n';
    const config = cfg({ layout: { layoutType: 'double' }, headings: { levels: [{ level: 1, advancedDesign: { enabled: true } }] } });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const e = await exportDocx(md, { config, resources: [res], resourceBytes: () => png });
    expect(exportProblems(e, [md])).toEqual([]);
    const cols = sectionsOf(e.doc).map((s) => (s.includes('w:num="2"') ? 2 : 1));
    // Opener (one column), text (two), picture (one), text (two).
    expect(cols).toEqual([1, 2, 1, 2]);
    unchanged(e, [md]);
  });

  it('sets ruby at the size of its paragraph style', async () => {
    const md = '# 大きな:ruby[漢字]{rt="かんじ"}\n\nA :ruby[漢字]{rt="かんじ"} here.\n';
    const e = await exportDocx(md, { config: cfg({ locale: 'ja' }) });
    expect(exportProblems(e, [md])).toEqual([]);
    const sizes = [...e.doc.matchAll(/<w:hpsBaseText w:val="(\d+)"\/>/g)].map((m) => Number(m[1]));
    expect(sizes).toHaveLength(2);
    expect(sizes[0]).toBeGreaterThan(sizes[1]!);
    unchanged(e, [md]);
  });

  it('keeps the print insets of a box inside a box', async () => {
    const md = ':::callout{type="outer"}\nOuter.\n\n:::callout{type="inner"}\nInner.\n:::\n:::\n';
    const pad = (mm: number): Record<string, unknown> => {
      const v = { value: mm, unit: 'mm' };
      return { top: v, right: v, bottom: v, left: v };
    };
    const config = cfg({ layout: { layoutType: 'double' }, calloutStyles: [{ id: 'outer', padding: pad(4) }, { id: 'inner', padding: pad(3) }] });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    const lefts = [...e.doc.matchAll(/<w:tblCellMar><w:top w:w="\d+" w:type="dxa"\/><w:left w:w="(\d+)"/g)].map((m) => Number(m[1]));
    // 3 mm is 170 twips: the inner box keeps it.
    expect(lefts[1]).toBe(170);
    unchanged(e, [md]);
  });
});
