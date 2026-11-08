// Designs in the semantic .docx, round four (#1444): boxes in the part's
// colours, a band's foot rule and the room under it, large type on an
// exact line, a full-page picture behind the text, texts set one after
// another on a line, pills padded with spaces, a part's chapter list on
// its band, and a page-wide table kept off the text above it. Every
// unedited export reads back into the exact Markdown.

import { describe, expect, it } from 'vitest';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { exportDocx, exportProblems, looseMarkup } from '../fixtures/harness.js';

const mm = (value: number) => ({ value, unit: 'mm' });
const pt = (value: number) => ({ value, unit: 'pt' });
const at = (y: number, x = 0, extra: object = {}) => ({ anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(x), y: mm(y) }, ...extra });
const text = (id: string, content: string, y: number, extra: object = {}) => ({ kind: 'text', id, content, placement: at(y), fontSize: pt(12), ...extra });
const white = { hex: '#ffffff', model: 'hex' };
const gold = { hex: '#8f6408', model: 'hex', paletteId: 'band' };
const designed = (elements: object[]) => ({ headingStyles: [{ id: 'open', advancedDesign: { enabled: true, slot: { elements } } }] }) as never;

/** Read back unchanged: no edits, the same Markdown. */
function readsBack(bytes: Uint8Array, md: string, extra: object = {}): void {
  const r = applyDocxEdits(bytes, { chapters: [{ id: 'ch1', markdown: md }], ...extra });
  expect(r.edits).toEqual([]);
  expect(r.chapters[0]!.markdown).toBe(md);
}

/** The paragraph holding `s`. */
const para = (doc: string, s: string): string => new RegExp(`<w:p>(?:(?!<w:p>)[^])*?>${s}</w:t>(?:(?!</w:p>)[^])*</w:p>`).exec(doc)?.[0] ?? '';

/** The paragraph style `p` is set in, as styles.xml defines it. */
function styleOf(e: { part: (path: string) => string }, p: string): string {
  const id = /<w:pStyle w:val="([^"]+)"\/>/.exec(p)?.[1] ?? '';
  const xml = e.part('word/styles.xml');
  const at = xml.indexOf(`w:styleId="${id}"`);
  return at < 0 ? '' : xml.slice(at, xml.indexOf('</w:style>', at));
}

/** The table holding `s`. */
const table = (doc: string, s: string): string => new RegExp(`<w:tbl>(?:(?!<w:tbl>)[^])*?>${s}<(?:(?!</w:tbl>)[^])*</w:tbl>`).exec(doc)?.[0] ?? '';

describe('semantic docx: a box in a part takes the part\'s colours', () => {
  it('shades the box in the part palette and reads back unchanged', async () => {
    const config = {
      colorPalette: [{ id: 'band', name: 'Band', value: { hex: '#8f6408', model: 'hex' } }],
      calloutStyles: [{ id: 'note', name: 'Note', background: gold }],
    } as never;
    const md = ':::part{number="I" title="One" palette="band=#2b4acb"}\n:::\n\n# Alpha\n\n:::callout{type="note"}\nInside the box.\n:::\n';
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(looseMarkup(e.doc)).toEqual([]);
    expect(table(e.doc, 'Inside the box.')).toContain('w:fill="2B4ACB"');
    expect(e.doc).not.toContain('w:fill="8F6408"');
    readsBack(e.bytes, md);
  });
});

describe('semantic docx: an opener band, its foot rule and the room under it', () => {
  const config = designed([
    { kind: 'box', id: 'band', placement: { ...at(0), size: { width: 'fill', height: mm(40) } }, style: { backgroundColor: { hex: '#2b4acb', model: 'hex' } } },
    { kind: 'box', id: 'foot', placement: { ...at(40), size: { width: 'fill', height: mm(1.5) } }, style: { backgroundColor: { hex: '#111111', model: 'hex' } } },
    text('title', '{titleText}', 16, { fontSize: pt(30), color: white }),
  ]);
  const md = '# How it works {style="open"}\n\nThe text.\n';

  it('draws the strip as the band cell\'s foot border and the room under it as an unshaded row', async () => {
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    const band = table(e.doc, 'How it works');
    expect(band).toMatch(/<w:tcBorders><w:bottom w:val="single" w:sz="\d+" w:space="0" w:color="111111"\/><\/w:tcBorders>/);
    // The room is a row of exact height after the shaded one, not a
    // paragraph after the table (LibreOffice drops the running head of a
    // page whose opener table is followed by one).
    expect(band.split('<w:tr>')).toHaveLength(3);
    expect(band).toMatch(/<w:trHeight w:val="\d+" w:hRule="exact"\/>/);
    // Between the table and the text, only one-point carrier paragraphs.
    const between = e.doc.slice(e.doc.indexOf('</w:tbl>'), e.doc.indexOf('>The text.<'));
    expect(between.match(/w:line="(\d+)"/g)?.every((m) => m === 'w:line="20"')).toBe(true);
    readsBack(e.bytes, md);
  });

  it('sets a large title on an exact line a little taller than its size', async () => {
    const e = await exportDocx(md, { config });
    const line = /<w:spacing [^>]*w:line="(\d+)" w:lineRule="exact"/.exec(styleOf(e, para(e.doc, 'How it works')));
    expect(line).not.toBeNull();
    // 30 pt is 600 twips; the line is at least 1.1 times that.
    expect(Number(line![1])).toBeGreaterThanOrEqual(660);
  });
});

describe('semantic docx: a picture that fills the page', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const resources = [{ id: 'sky', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'f1', format: 'png', width: 1000, height: 1400 } }] as never;
  const resourceBytes = (id: string): Uint8Array | undefined => (id === 'f1' ? PNG : undefined);

  it('is drawn behind the text, placed on the page, with the title over it', async () => {
    const config = {
      headingStyles: [
        {
          id: 'cover',
          breakBefore: true,
          advancedDesign: {
            enabled: true,
            slot: {
              elements: [
                { kind: 'image', id: 'sky', resourceId: 'sky', placement: { anchor: { to: 'page', edge: 'top-left' }, size: { width: mm(170), height: mm(240) } } },
                text('title', '{titleText}', 30, { fontSize: pt(36), color: white }),
              ],
            },
          },
        },
      ],
    } as never;
    const md = '# Deep Sky {style="cover"}\n\nText.\n';
    const e = await exportDocx(md, { config, resources, resourceBytes });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.doc).toMatch(/<wp:anchor [^>]*behindDoc="1"/);
    expect(e.doc).toMatch(/<wp:positionH relativeFrom="page">/);
    expect(e.doc).toContain('<wp:wrapNone/>');
    expect(e.doc.indexOf('<wp:anchor')).toBeLessThan(e.doc.indexOf('>Deep Sky<'));
    readsBack(e.bytes, md, { resources });
  });
});

describe('semantic docx: texts on one line', () => {
  it('sets a text placed right after another after a space, not at a tab stop', async () => {
    const config = designed([
      text('kicker', 'Chapter', 2, { align: 'left', placement: at(2, 0, { size: { width: mm(20) } }) }),
      { ...text('num', '{attr.n}', 2), placement: { anchor: { to: '#kicker', edge: 'right-of' }, offset: { x: mm(1), y: mm(0) } } },
      text('title', '{titleText}', 14, { fontSize: pt(20) }),
    ]);
    const md = '# Rivers {style="open" n="4"}\n\nText.\n';
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    const line = para(e.doc, '4');
    expect(line).toContain('>Chapter<');
    expect(line).not.toContain('<w:tab/>');
    expect(line).toMatch(/>Chapter<(?:(?!>4<)[^])*<w:t xml:space="preserve"> <\/w:t>(?:(?!>4<)[^])*>4</);
    expect(e.frag('4').role).toBe('attr:heading:n');
    readsBack(e.bytes, md);
  });

  it('pads a text in a filled pill with a space each side, outside the source', async () => {
    const config = designed([
      text('tag', '{attr.tag}', 2, { color: white, box: { backgroundColor: { hex: '#c0392b', model: 'hex' } } }),
      text('title', '{titleText}', 14, { fontSize: pt(20) }),
    ]);
    const md = '# Rivers {style="open" tag="Field notes"}\n\nText.\n';
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    const pill = para(e.doc, 'Field notes');
    expect(styleOf(e, pill)).toContain('w:fill="C0392B"');
    expect(pill).toMatch(/> <\/w:t>(?:(?!<\/w:p>)[^])*>Field notes<(?:(?!<\/w:p>)[^])*> <\/w:t>/);
    expect(e.frag('Field notes').role).toBe('attr:heading:tag');
    readsBack(e.bytes, md);
  });

  it('leaves a white pill on white paper unshaded', async () => {
    const config = designed([text('tag', '{attr.tag}', 2, { box: { backgroundColor: white } }), text('title', '{titleText}', 14)]);
    const md = '# Rivers {style="open" tag="Field notes"}\n\nText.\n';
    const e = await exportDocx(md, { config });
    const pill = para(e.doc, 'Field notes');
    expect(styleOf(e, pill)).not.toContain('w:fill="FFFFFF"');
    expect(pill).not.toContain('\u00a0');
  });
});

describe('semantic docx: a part\'s chapter list on its band', () => {
  it('writes the part body inside the band, in the part body colour, and reads back unchanged', async () => {
    const config = {
      parts: {
        margins: { top: mm(80) },
        bodyStyle: { color: white },
        design: {
          elements: [
            { kind: 'box', id: 'band', placement: { ...at(0), size: { width: 'fill', height: mm(150) } }, style: { backgroundColor: { hex: '#1d3557', model: 'hex' } } },
            text('title', '{titleText}', 30, { fontSize: pt(28), color: white }),
          ],
        },
      },
    } as never;
    const md = ':::part{number="II" title="The craft"}\n1. First steps\n2. Going further\n:::\n\n# Alpha\n\nText.\n';
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    const band = table(e.doc, 'The craft');
    expect(band).toContain('>First steps<');
    expect(band).toContain('>Going further<');
    expect(para(band, 'First steps')).toContain('<w:color w:val="FFFFFF"/>');
    readsBack(e.bytes, md);
  });
});

describe('semantic docx: a page-wide table set where the columns stop', () => {
  it('keeps half a line from the text above, and reads back unchanged', async () => {
    const t1 = {
      id: 't1',
      typeId: 'table',
      kind: 'table',
      createdAt: 0,
      updatedAt: 0,
      placement: { position: 'here', span: 'page' },
      table: { model: { rows: [[{ content: 'a' }, { content: 'b' }], [{ content: '1' }, { content: '2' }]], headerRows: 1 } },
    };
    const resources = [t1] as never;
    const md = 'First column text.\n\n::resource{id="t1"}\n\nBack in columns.\n';
    const config = { layout: { layoutType: 'double', gutterWidth: { value: 0.5, unit: 'cm' } } } as never;
    const e = await exportDocx(md, { config, resources });
    expect(exportProblems(e, [md])).toEqual([]);
    const before = e.doc.slice(0, e.doc.indexOf(table(e.doc, 'a')));
    const gap = /<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="(\d+)" w:lineRule="exact"\/>(?:(?!<\/w:p>)[^])*<\/w:p>(?:<w:sdt>(?:(?!<w:sdtContent>)[^])*<w:sdtContent>)*$/.exec(before);
    expect(gap).not.toBeNull();
    expect(Number(gap![1])).toBeGreaterThanOrEqual(120);
    readsBack(e.bytes, md, { resources });
  });
});
