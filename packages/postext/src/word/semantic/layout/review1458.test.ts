// What the review of the two Word routes found in the flow writer (#1458):
// the part's colour on references, links, caption labels and folios; notes
// numbered again at a chapter title that opens a page; no levelling
// section after a box (a blank page in LibreOffice); exercises in styles
// of their own; and, in the plain design, columns one under the other,
// boxes that may split and a lead's lines in one paragraph.

import { describe, expect, it } from 'vitest';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { exportDocx, exportProblems, levelSections, sectionsOf } from '../fixtures/harness.js';
import { endsInTable } from './pageSpan.js';

const gold = { hex: '#8f6408', model: 'hex', paletteId: 'band' };
const para = (doc: string, s: string): string => new RegExp(`<w:p>(?:(?!<w:p>)[^])*?>${s}<(?:(?!</w:p>)[^])*</w:p>`).exec(doc)?.[0] ?? '';

describe('semantic docx: the part’s colour beyond headings', () => {
  const config = {
    colorPalette: [{ id: 'band', name: 'Band', value: { hex: '#8f6408', model: 'hex' } }],
    bodyText: { referenceColor: gold },
    captionStyle: { labelColor: gold, labelBold: true },
    footer: { elements: [{ kind: 'text', id: 'folio', content: '{pageNumber}', color: gold, placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: { value: 0, unit: 'mm' }, y: { value: 0, unit: 'mm' } } } }] },
  } as never;
  const resources = [{ id: 't1', typeId: 'table', kind: 'table', caption: 'Sizes', table: { model: { rows: [[{ content: 'a' }], [{ content: 'b' }]] } }, createdAt: 0, updatedAt: 0 }] as never;
  const md = '# Zero\n\nSee :ref{id="t1"} and [the site](https://example.org).\n\n:::part{number="I" title="One" palette="band=#2b4acb"}\n:::\n\n# Alpha\n\nSee :ref{id="t1"} and [the site](https://example.org).\n\n::resource{id="t1"}\n';

  it('sets references, links, caption labels and folios in the part’s colour', async () => {
    const e = await exportDocx(md, { config, resources });
    expect(exportProblems(e, [md], (f) => (f.target.kind === 'resource' && f.target.field === 'caption' ? 'Sizes' : undefined)).filter((p) => !p.includes('cell'))).toEqual([]);
    const refs = e.doc.match(/<w:rPr><w:rStyle w:val="PostextReference"\/>(?:(?!<\/w:rPr>).)*<\/w:rPr>/g) ?? [];
    // Before the part: the style's own colour. In it: the part's.
    expect(refs).toHaveLength(2);
    expect(refs[0]).not.toContain('w:color');
    expect(refs[1]).toContain('<w:color w:val="2B4ACB"/>');
    const links = e.doc.match(/<w:rPr><w:rStyle w:val="Hyperlink"\/>(?:(?!<\/w:rPr>).)*<\/w:rPr>/g) ?? [];
    expect(links.map((l) => l.includes('2B4ACB'))).toEqual([false, true]);
    // The caption's label, in the part where the table stands.
    expect(e.doc).toMatch(/<w:rPr><w:b\/><w:color w:val="2B4ACB"\/><\/w:rPr><w:t xml:space="preserve">Tab/);
    // A footer of each colour.
    const footers = Object.keys(e.files).filter((f) => /^word\/footer\d+\.xml$/.test(f)).map((f) => e.part(f));
    expect(footers.some((f) => f.includes('8F6408'))).toBe(true);
    expect(footers.some((f) => f.includes('2B4ACB'))).toBe(true);
    expect(applyDocxEdits(e.bytes, { chapters: [{ id: 'ch1', markdown: md }], resources }).edits).toEqual([]);
  });

  it('keeps the plain design in its one ink', async () => {
    const e = await exportDocx(md, { config, resources, design: 'plain' });
    expect(e.doc).not.toContain('2B4ACB');
  });
});

describe('semantic docx: notes and sections', () => {
  it('numbers the notes again at a chapter title that opens a page', async () => {
    const md = '# One\n\nText[^a].\n\n[^a]: First.\n\n# Two\n\nMore[^b].\n\n[^b]: Second.\n';
    const config = { layout: { layoutType: 'single' }, headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] }, footnotes: { numbering: 'chapter' } } as never;
    const e = await exportDocx(md, { config });
    const sects = sectionsOf(e.doc);
    expect(sects).toHaveLength(2);
    for (const s of sects) expect(s).toContain('<w:numRestart w:val="eachSect"/>');
  });

  it('adds no levelling section after a box that ends the chapter', async () => {
    const box = ':::callout{title="Try"}\nInside.\n:::\n';
    const text = '# One\n\nText of the chapter.\n\n';
    const boxed = await exportDocx([`${text}${box}`, '# Two\n\nMore.\n']);
    const plainEnd = await exportDocx([`${text}Its last words.\n`, '# Two\n\nMore.\n']);
    // The second chapter ends the document either way; the first is
    // levelled only when it ends with text.
    expect(levelSections(plainEnd.doc) - levelSections(boxed.doc)).toBe(1);
  });

  it('sees a table at the end of a piece through the room under it and the controls around it', () => {
    // A composed page's last frame: its table, the room it keeps under
    // it, then the end of the page's own content control. LibreOffice
    // cannot level columns that end in a row that does not split, and
    // sent the levelling section after such a page to a blank one.
    const close = '</w:sdtContent></w:sdt>';
    const room = '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="141" w:lineRule="exact"/><w:ind w:firstLine="0"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr></w:p>';
    const table = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Keys</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
    expect(endsInTable(`<w:sdt><w:sdtContent>${table}`)).toBe(true);
    expect(endsInTable(`${table}${close}${room}`)).toBe(true);
    expect(endsInTable(`<w:p><w:r><w:t>Title</w:t></w:r></w:p>${table}${close}${room}${room}${close}${close}`)).toBe(true);
    // Text after the table: the columns end with lines that can be levelled.
    expect(endsInTable(`${table}${close}<w:p><w:r><w:t>After.</w:t></w:r></w:p>${close}`)).toBe(false);
    expect(endsInTable(`<w:p><w:r><w:t>Only text.</w:t></w:r></w:p>${room}`)).toBe(false);
  });

  it('ends a chapter with a paragraph one point tall and no empty room before it', async () => {
    const box = ':::callout{title="Try"}\nInside.\n:::\n';
    const text = '# One\n\nText of the chapter.\n\n';
    const thin = '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:ind w:firstLine="0"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr><w:sectPr>';
    // A chapter that ends with a box: the paragraph that closes it comes
    // right after the box's table, one point tall, the room the box keeps
    // under it left out (it would be room at the foot of the page, or a
    // line alone on the next one).
    const mds = [`${text}${box}`, '# Two\n\nMore.\n'];
    const boxed = await exportDocx(mds);
    expect(exportProblems(boxed, mds)).toEqual([]);
    const end = boxed.doc.indexOf(thin);
    expect(end).toBeGreaterThan(0);
    expect(boxed.doc.slice(0, end)).toMatch(/<\/w:tbl>(?:<\/w:sdtContent><\/w:sdt>)*$/);
    // No paragraph of the document closes a section at the body's full
    // line, and none hides its mark (LibreOffice then loses the page
    // break after it).
    expect(boxed.doc).not.toMatch(/<w:p><w:pPr><w:sectPr>/);
    expect(boxed.doc).not.toContain('<w:vanish/>');
    // The same box in the middle of the chapter keeps its room.
    const inner = [`${text}${box}\nAfter the box.\n`, '# Two\n\nMore.\n'];
    const inside = await exportDocx(inner);
    expect(exportProblems(inside, inner)).toEqual([]);
    expect(inside.doc).toMatch(/<\/w:tbl>(?:<\/w:sdtContent><\/w:sdt>)*<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="\d{2,}" w:lineRule="exact"\/>/);
  });
});

describe('semantic docx: exercises and the plain design', () => {
  const exercise = ':::exercise\nWhich one is a colour?\n\n- [ ] Seven\n- [x] Blue\n:::\n';

  it('sets an exercise in styles of its own in both designs', async () => {
    for (const design of ['book', 'plain'] as const) {
      const e = await exportDocx(exercise, { design });
      expect(exportProblems(e, [exercise])).toEqual([]);
      expect(para(e.doc, 'Which one is a colour\\?')).toContain('<w:pStyle w:val="PostextExerciseinstruction"/>');
      expect(para(e.doc, 'Blue')).toContain('<w:pStyle w:val="PostextExercise"/>');
      const styles = e.part('word/styles.xml');
      expect(styles).toContain('<w:name w:val="Postext Exercise"/>');
      expect(styles).toContain('<w:name w:val="Postext Exercise instruction"/>');
      expect(applyDocxEdits(e.bytes, { chapters: [{ id: 'ch1', markdown: exercise }] }).edits).toEqual([]);
    }
  });

  it('stacks the columns of a box and lets the box split in the plain design', async () => {
    const md = ':::callout{title="In numbers"}\n:::columns{count=2}\nOne side.\n\nOther side.\n:::\n:::\n';
    const book = await exportDocx(md);
    const plain = await exportDocx(md, { design: 'plain' });
    const control = (doc: string): string => /<w:tag w:val="ptx:columns"\/>(?:(?!<\/w:sdt>)[^])*/.exec(doc)?.[0] ?? '';
    expect(control(book.doc)).toContain('<w:tbl>');
    expect(control(plain.doc)).not.toBe('');
    expect(control(plain.doc)).not.toContain('<w:tbl>');
    expect(plain.doc).not.toContain('<w:cantSplit/>');
    expect(plain.map.fragments.map((f) => f.text)).toEqual(book.map.fragments.map((f) => f.text));
    expect(applyDocxEdits(plain.bytes, { chapters: [{ id: 'ch1', markdown: md }] }).edits).toEqual([]);
  });

  it('keeps the lines of a heading attribute in one paragraph in the plain design', async () => {
    const config = {
      headings: { levels: [{ level: 1, advancedDesign: { enabled: true, slot: { elements: [
        { kind: 'text', id: 'title', content: '{titleText}', placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: { value: 0, unit: 'mm' }, y: { value: 0, unit: 'mm' } } } },
        { kind: 'text', id: 'lead', content: '{attr.lead}', placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: { value: 0, unit: 'mm' }, y: { value: 20, unit: 'mm' } } } },
      ] } } }] },
    } as never;
    const md = '# One {lead="A green parrot\\nkept repeating:"}\n\nText.\n';
    const plain = await exportDocx(md, { config, design: 'plain' });
    expect(exportProblems(plain, [md])).toEqual([]);
    const lead = plain.map.fragments.find((f) => f.role === 'attr:heading:lead')!;
    expect(lead.text).toBe('A green parrot\nkept repeating:');
    expect(para(plain.doc, 'A green parrot')).toContain('<w:br/>');
    // Two paragraphs in the book's design, as the print sets two lines.
    const book = await exportDocx(md, { config });
    expect(book.map.fragments.filter((f) => f.role === 'attr:heading:lead').map((f) => f.text)).toEqual(['A green parrot', 'kept repeating:']);
    // A correction in the second line lands in the attribute.
    const r = applyDocxEdits(plain.bytes, { chapters: [{ id: 'ch1', markdown: md }] });
    expect(r.edits).toEqual([]);
  });
});
