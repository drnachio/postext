// Designs in the semantic .docx, round four repairs (#1444): a vertical
// book's page-filling picture sized from the turned flow frame, a plate
// whose caption is printed in the foot margin kept in the flow, a pill
// over a page-filling picture shaded as its paragraph, a part's chapter
// list numbered in the band's ink, and a long part body set after its
// band. Every unedited export reads back into the exact Markdown.

import { describe, expect, it } from 'vitest';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { exportDocx, exportProblems, looseMarkup } from '../fixtures/harness.js';

const mm = (value: number) => ({ value, unit: 'mm' });
const pt = (value: number) => ({ value, unit: 'pt' });
const onPage = (x: number, y: number, size?: object) => ({ anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(x), y: mm(y) }, ...(size ? { size } : {}) });
const white = { hex: '#ffffff', model: 'hex' };
const navy = { hex: '#1d5470', model: 'hex' };
const EMU_MM = 914400 / 25.4;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const picture = (width: number, height: number) => [{ id: 'art', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'f1', format: 'png', width, height } }] as never;
const resourceBytes = (id: string): Uint8Array | undefined => (id === 'f1' ? PNG : undefined);

/** Read back unchanged: no edits, the same Markdown. */
function readsBack(bytes: Uint8Array, md: string, extra: object = {}): void {
  const r = applyDocxEdits(bytes, { chapters: [{ id: 'ch1', markdown: md }], ...extra });
  expect(r.edits).toEqual([]);
  expect(r.chapters[0]!.markdown).toBe(md);
}

/** A heading style `cover` that opens a page with these elements. */
const cover = (elements: object[], extra: object = {}) => ({ headingStyles: [{ id: 'cover', breakBefore: true, advancedDesign: { enabled: true, slot: { elements } } }], ...extra }) as never;

/** The paragraph holding `s`. */
const para = (doc: string, s: string): string => new RegExp(`<w:p>(?:(?!<w:p>)[^])*?>${s}</w:t>(?:(?!</w:p>)[^])*</w:p>`).exec(doc)?.[0] ?? '';

/** The table holding `s`. */
const table = (doc: string, s: string): string => new RegExp(`<w:tbl>(?:(?!<w:tbl>)[^])*?>${s}<(?:(?!</w:tbl>)[^])*</w:tbl>`).exec(doc)?.[0] ?? '';

describe('semantic docx: a vertical book\'s page-filling picture', () => {
  it('is sized on the sheet from the turned flow frame, and reads back unchanged', async () => {
    // The design is placed in the flow's frame: 188 mm along the sheet's
    // height, the picture standing upright (its height across the flow).
    const config = cover(
      [
        { kind: 'image', id: 'art', resourceId: 'art', placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: mm(188), height: 'auto' } } },
        { kind: 'text', id: 'title', content: '{titleText}', placement: onPage(15, 95), fontSize: pt(24), color: white },
      ],
      { page: { sizePreset: 'custom', width: mm(127), height: mm(188) }, layout: { writingMode: 'vertical-rl' } },
    );
    const resources = picture(1270, 1880);
    const md = '# こころ {style="cover"}\n\n本文。\n';
    const e = await exportDocx(md, { config, resources, resourceBytes });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.doc).toMatch(/<wp:anchor [^>]*behindDoc="1"/);
    const ext = /<wp:anchor [^]*?<wp:extent cx="(\d+)" cy="(\d+)"\/>/.exec(e.doc)!;
    expect(Math.abs(Number(ext[1]) - 127 * EMU_MM)).toBeLessThan(2 * EMU_MM);
    expect(Math.abs(Number(ext[2]) - 188 * EMU_MM)).toBeLessThan(2 * EMU_MM);
    readsBack(e.bytes, md, { resources });
  });
});

describe('semantic docx: a page-sized plate with its caption in the foot margin', () => {
  it('stays in the flow with the caption under it, and reads back unchanged', async () => {
    // The caption 8 mm above the trim's foot, below the text area.
    const config = cover([
      { kind: 'image', id: 'art', resourceId: 'art', placement: onPage(0, 0, { width: 'fill', height: 'fill' }) },
      { kind: 'text', id: 'cap', content: '{attr.caption}', placement: { anchor: { to: 'page', edge: 'bottom-left' }, offset: { x: mm(20), y: mm(-8) }, size: { width: mm(120) } }, fontSize: pt(9) },
    ]);
    const resources = picture(1000, 1400);
    const md = '# Plate {style="cover" caption="Fern and rowan"}\n\nText.\n';
    const e = await exportDocx(md, { config, resources, resourceBytes });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.doc).not.toContain('behindDoc="1"');
    expect(e.doc).toContain('<wp:inline');
    expect(e.doc.indexOf('<wp:inline')).toBeLessThan(e.doc.indexOf('>Fern and rowan<'));
    readsBack(e.bytes, md, { resources });
  });
});

describe('semantic docx: a pill over a page-filling picture', () => {
  it('is shaded as its paragraph, cut to the words by an indent, and reads back unchanged', async () => {
    const config = cover([
      { kind: 'image', id: 'art', resourceId: 'art', placement: onPage(0, 0, { width: 'fill', height: 'fill' }) },
      { kind: 'text', id: 'kicker', content: 'Islands', placement: onPage(20, 120), fontSize: pt(10), color: white, box: { backgroundColor: navy } },
      { kind: 'text', id: 'title', content: '{titleText}', placement: onPage(20, 130), fontSize: pt(30), color: white },
    ]);
    const resources = picture(1000, 1400);
    const md = '# Salt {style="cover"}\n\nText.\n';
    const e = await exportDocx(md, { config, resources, resourceBytes });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(looseMarkup(e.doc)).toEqual([]);
    expect(e.doc).toMatch(/<wp:anchor [^>]*behindDoc="1"/);
    const p = para(e.doc, 'Islands');
    const pPr = /<w:pPr>[^]*?<\/w:pPr>/.exec(p)![0];
    expect(pPr).toContain('w:fill="1D5470"');
    expect(Number(/<w:ind [^>]*w:right="(\d+)"/.exec(pPr)?.[1] ?? 0)).toBeGreaterThan(1000);
    readsBack(e.bytes, md, { resources });
  });
});

describe('semantic docx: a part body on its band', () => {
  const design = (top: number) => ({
    parts: {
      margins: { top: mm(top) },
      bodyStyle: { color: white },
      design: {
        elements: [
          { kind: 'box', id: 'band', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill', height: mm(150) } }, style: { backgroundColor: { hex: '#c9702a', model: 'hex' } } },
          { kind: 'text', id: 'title', content: '{titleText}', placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(0), y: mm(30) } }, fontSize: pt(28), color: white },
        ],
      },
    },
  }) as never;

  it('numbers its list in the band\'s ink, and reads back unchanged', async () => {
    const config = { ...(design(80) as object), orderedLists: { color: { hex: '#2a7f97', model: 'hex' } } } as never;
    const md = ':::part{number="I" title="Solar System"}\n1. Neptune\n2. Comet\n:::\n\n# Alpha\n\nText.\n';
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    const band = table(e.doc, 'Solar System');
    const numId = /<w:numId w:val="(\d+)"\/>/.exec(para(band, 'Neptune'))![1];
    expect(/<w:numId w:val="(\d+)"\/>/.exec(para(band, 'Comet'))![1]).toBe(numId);
    const numbering = e.part('word/numbering.xml');
    const abs = new RegExp(`<w:num w:numId="${numId}"><w:abstractNumId w:val="(\\d+)"/>`).exec(numbering)![1];
    const def = new RegExp(`<w:abstractNum w:abstractNumId="${abs}">[^]*?</w:abstractNum>`).exec(numbering)![0];
    expect(def).toContain('<w:color w:val="FFFFFF"/>');
    expect(def).not.toContain('2A7F97');
    readsBack(e.bytes, md);
  });

  it('sets a body longer than the band\'s room after the band, and reads back unchanged', async () => {
    const long = Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1} of the part's introduction, which runs on for a good few lines of text so that the whole of it cannot stand on what is left of the band.`).join('\n\n');
    const md = `:::part{number="II" title="The long view"}\n${long}\n:::\n\n# Alpha\n\nText.\n`;
    const e = await exportDocx(md, { config: design(80) });
    expect(exportProblems(e, [md])).toEqual([]);
    const band = table(e.doc, 'The long view');
    expect(band).not.toBe('');
    expect(band).not.toContain('Paragraph 1 of');
    expect(e.doc.indexOf('Paragraph 1 of')).toBeGreaterThan(e.doc.indexOf(band));
    expect(para(e.doc, "Paragraph 1 of the part's introduction, which runs on for a good few lines of text so that the whole of it cannot stand on what is left of the band.")).not.toContain('w:val="FFFFFF"');
    readsBack(e.bytes, md);
  });
});
