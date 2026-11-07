// Designs in the semantic .docx, round three (#1444): part palettes,
// part pages drawn by the part design, bands as shaded tables with an
// inset, rules as bordered paragraphs, texts on one line sharing a
// paragraph, the chapter number from the book's start, outline levels of
// headings the contents leave out, the title's column read first, and an
// unedited export reading back into the exact Markdown each time.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { exportDocx, exportProblems, looseMarkup } from '../fixtures/harness.js';
import { designPictures } from './pictures.js';

function edit(bytes: Uint8Array, f: (xml: string) => string): Uint8Array {
  const files = unzipSync(bytes);
  files['word/document.xml'] = strToU8(f(strFromU8(files['word/document.xml']!)));
  return zipSync(files);
}

const mm = (value: number) => ({ value, unit: 'mm' });
const pt = (value: number) => ({ value, unit: 'pt' });
const at = (y: number, x = 0, extra: object = {}) => ({ anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(x), y: mm(y) }, ...extra });
const text = (id: string, content: string, y: number, extra: object = {}) => ({ kind: 'text', id, content, placement: at(y), fontSize: pt(12), ...extra });
const gold = { hex: '#8f6408', model: 'hex', paletteId: 'band' };

/** Read back unchanged: no edits, the same Markdown. */
function readsBack(bytes: Uint8Array, md: string): void {
  const r = applyDocxEdits(bytes, { chapters: [{ id: 'ch1', markdown: md }] });
  expect(r.edits).toEqual([]);
  expect(r.chapters[0]!.markdown).toBe(md);
}

/** The paragraph holding `s`. */
const para = (doc: string, s: string): string => new RegExp(`<w:p>(?:(?!<w:p>)[^])*?>${s}</w:t>(?:(?!</w:p>)[^])*</w:p>`).exec(doc)?.[0] ?? '';

describe('semantic docx: a part palette recolours designs and headings', () => {
  const config = {
    colorPalette: [{ id: 'band', name: 'Band', value: { hex: '#8f6408', model: 'hex' } }],
    headings: {
      levels: [
        {
          level: 1,
          advancedDesign: {
            enabled: true,
            slot: {
              elements: [
                { kind: 'box', id: 'band', placement: { ...at(0), size: { width: 'fill', height: mm(40) } }, style: { backgroundColor: gold } },
                text('kicker', 'Chapter {chapterNumber}', 6, { color: { hex: '#ffffff', model: 'hex' } }),
                text('title', '{titleText}', 16, { color: { hex: '#ffffff', model: 'hex' } }),
              ],
            },
          },
        },
        { level: 2, color: gold },
      ],
    },
  } as never;
  const md = ':::part{number="I" title="One" palette="band=#2b4acb"}\n:::\n\n# Alpha\n\n## Sub\n\nText.\n';

  it('shades the band and colours a section heading in the part colour, and reads back unchanged', async () => {
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(looseMarkup(e.doc)).toEqual([]);
    // The band is a shaded table, in the part's blue, not the base gold.
    expect(e.doc).toMatch(/<w:tbl>(?:(?!<\/w:tbl>)[^])*w:fill="2B4ACB"(?:(?!<\/w:tbl>)[^])*>Alpha</);
    expect(e.doc).not.toContain('w:fill="8F6408"');
    // Its paragraphs are inset from the band's edges.
    expect(e.doc).toMatch(/<w:tblCellMar><w:top w:w="\d+" w:type="dxa"\/><w:left w:w="\d{3}" w:type="dxa"\/>/);
    // The section heading takes a variant of its style in the part colour.
    const sub = /<w:pStyle w:val="([^"]+)"\/>(?:(?!<\/w:p>)[^])*>Sub</.exec(e.doc)?.[1] ?? '';
    expect(sub).not.toBe('Heading2');
    expect(e.part('word/styles.xml')).toMatch(new RegExp(`w:styleId="${sub}"(?:(?!</w:style>)[^])*<w:basedOn w:val="Heading2"/>(?:(?!</w:style>)[^])*w:val="2B4ACB"`));
    readsBack(e.bytes, md);
  });

  it('numbers the chapter from the book\'s start', async () => {
    const e = await exportDocx('# Alpha\n\nText.\n', { config, start: { headings: { h1: 3, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } } as never });
    expect(e.doc).toContain('>Chapter 4<');
  });
});

describe('semantic docx: a part page drawn by the part design', () => {
  const config = {
    parts: {
      design: {
        elements: [
          text('label', 'Part', 40),
          { ...text('num', '{number}', 0, { fontSize: pt(60) }), placement: { anchor: { to: '#label', edge: 'below' }, offset: { x: mm(0), y: mm(2) } } },
          { kind: 'rule', id: 'rule', direction: 'horizontal', placement: { anchor: { to: '#num', edge: 'below' }, offset: { x: mm(0), y: mm(3) }, size: { width: mm(30) } }, color: { hex: '#aa0000', model: 'hex' }, thickness: pt(2) },
          { ...text('title', '{titleText}', 0, { fontSize: pt(30) }), placement: { anchor: { to: '#rule', edge: 'below' }, offset: { x: mm(0), y: mm(4) } } },
        ],
      },
    },
  } as never;
  const md = ':::part{number="II" title="The craft"}\n1. First\n:::\n\n# Alpha\n\nText.\n';

  it('writes the kicker, the number, a rule and the title in order, the number and title mapped to the fence', async () => {
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    const pos = (s: string): number => e.doc.indexOf(`>${s}<`);
    expect(pos('Part')).toBeGreaterThan(0);
    expect(pos('Part')).toBeLessThan(pos('II'));
    expect(pos('II')).toBeLessThan(e.doc.indexOf('<w:pBdr>'));
    expect(e.doc.indexOf('<w:pBdr>')).toBeLessThan(pos('The craft'));
    expect(pos('The craft')).toBeLessThan(pos('First'));
    expect(e.frag('Part').target).toEqual({ kind: 'generated' });
    expect(e.frag('II').role).toBe('attr:part:number');
    expect(e.frag('The craft').role).toBe('attr:part:title');
    // The rule: an empty paragraph, a top border 30 mm long, the page
    // break on the kicker that opens the page.
    expect(e.doc).toMatch(/<w:p><w:pPr><w:keepNext\/><w:pBdr><w:top w:val="single" w:sz="16" w:space="0" w:color="AA0000"\/><\/w:pBdr>(?:(?!<\/w:p>)[^])*<w:ind w:left="0" w:right="\d+"/);
    expect(para(e.doc, 'Part')).toContain('<w:pageBreakBefore/>');
    expect(para(e.doc, 'The craft')).toContain('<w:pageBreakBefore w:val="0"/>');
    readsBack(e.bytes, md);
    const r = applyDocxEdits(edit(e.bytes, (x) => x.replace('>The craft<', '>The art<')), { chapters: [{ id: 'ch1', markdown: md }] });
    expect(r.chapters[0]!.markdown).toBe(md.replace('title="The craft"', 'title="The art"'));
  });
});

describe('semantic docx: texts printed on one line share a paragraph', () => {
  const config = {
    headingStyles: [
      {
        id: 'front',
        advancedDesign: {
          enabled: true,
          slot: {
            elements: [
              text('weather', '{attr.outlook}', 2, { align: 'left', placement: at(2, 0, { size: { width: mm(30) } }) }),
              text('price', '{attr.price}', 2, { align: 'right', placement: { anchor: { to: 'container', edge: 'top-right' }, offset: { x: mm(0), y: mm(2) }, size: { width: mm(30) } }, italic: true }),
              text('name', '{titleText}', 12, { align: 'center' }),
            ],
          },
        },
      },
    ],
  } as never;
  const md = '# The Courier {style="front" outlook="Bright spells" price="90p"}\n\nNews.\n';

  it('sets them apart with tab stops, each keeping its look, and reads back unchanged', async () => {
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    const line = para(e.doc, '90p');
    expect(line).toContain('>Bright spells<');
    expect(line).toMatch(/<w:tabs><w:tab w:val="right" w:pos="\d+"\/><\/w:tabs>/);
    expect(line).toContain('<w:tab/>');
    // The second text's look is a character style; italics it sets where
    // the line's style does not.
    const id = /<w:rStyle w:val="([^"]+)"\/>(?:(?!<\/w:r>)[^])*>90p</.exec(line)?.[1] ?? '';
    expect(e.part('word/styles.xml')).toMatch(new RegExp(`w:type="character" w:styleId="${id}"(?:(?!</w:style>)[^])*<w:i/>`));
    expect(e.frag('90p').role).toBe('attr:heading:price');
    readsBack(e.bytes, md);
  });
});

describe('semantic docx: reading order and outline of designed headings', () => {
  it('reads a column block level with the title after the title and its byline', async () => {
    const config = {
      headingStyles: [
        {
          id: 'deck',
          advancedDesign: {
            enabled: true,
            slot: {
              elements: [
                text('lead', '{attr.lead}', 50, { placement: at(50, 0, { size: { width: mm(40) } }) }),
                text('title', '{titleText}', 50, { placement: at(50, 50, { size: { width: mm(100) } }) }),
                { ...text('byline', '{attr.byline}', 0), placement: { anchor: { to: '#title', edge: 'below' }, offset: { x: mm(0), y: mm(2) } } },
              ],
            },
          },
        },
      ],
    } as never;
    const lead = 'At five in the morning the brine has the colour of pewter and the rakers are already in it up to their ankles, drawing the salt.';
    const md = `## A flat island {style="deck" byline="Words by M" lead="${lead}"}\n\nBody.\n`;
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    const pos = (s: string): number => e.doc.indexOf(`>${s}<`);
    expect(pos('A flat island')).toBeLessThan(pos('Words by M'));
    expect(pos('Words by M')).toBeLessThan(pos(lead));
    readsBack(e.bytes, md);
  });

  it('keeps a heading the contents leave out out of the outline', async () => {
    const md = '# Contents {toc="false"}\n\n# Rivers\n\nText.\n';
    const e = await exportDocx(md);
    expect(para(e.doc, 'Contents')).toContain('<w:outlineLvl w:val="9"/>');
    expect(para(e.doc, 'Rivers')).toContain('<w:outlineLvl w:val="0"/>');
    readsBack(e.bytes, md);
  });

  it('drops the space above a heading that opens a box', async () => {
    const md = ':::callout{title="Transport"}\n## The bridge reopens\n\nCars cross again.\n:::\n';
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    expect(para(e.doc, 'The bridge reopens')).toMatch(/<w:spacing w:before="0"/);
    readsBack(e.bytes, md);
  });
});

describe('semantic docx: decorative pictures', () => {
  const img = (id: string, extra: object) => ({ kind: 'image', id, resourceId: id, decorative: true, placement: { anchor: { to: 'container', edge: 'top-left' }, ...extra } });
  const resources = new Map(['head', 'paper', 'logo'].map((id) => [id, { id, kind: 'bitmap' } as never]));
  const b = { type: 'heading', level: 1, text: 'T' } as never;

  it('keeps an ornament the page reads and leaves a background out', () => {
    const els = [img('head', { size: { width: mm(120), height: mm(30) } }), img('paper', { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill', height: 'fill' } }), text('t', '{titleText}', 40)] as never;
    expect(designPictures(b, els, resources).map((p) => p.id)).toEqual(['head']);
  });

  it('keeps the art of a design that prints nothing else (an endpaper)', () => {
    const els = [img('paper', { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: mm(188) } })] as never;
    expect(designPictures(b, els, resources).map((p) => p.id)).toEqual(['paper']);
  });
});
