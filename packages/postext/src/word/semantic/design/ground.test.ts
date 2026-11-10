// A page a design fills with one colour (#1458): the fill is drawn behind
// the text edge to edge, what the page prints flows over it in its own
// ink, the part's list of chapters stands on it, and a band across the
// foot of the sheet is a table set at its place.

import { strFromU8, unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { exportDocx, exportProblems } from '../fixtures/harness.js';
import { solidPng } from './ground.js';

const mm = (value: number) => ({ value, unit: 'mm' });
const pt = (value: number) => ({ value, unit: 'pt' });
const onPage = (x: number, y: number, w: number, h: number) => ({ anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(x), y: mm(y) }, size: { width: mm(w), height: mm(h) } });
const text = (id: string, content: string, y: number, extra: object = {}) => ({ kind: 'text', id, content, placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(20), y: mm(y) } }, fontSize: pt(12), color: { hex: '#ffffff', model: 'hex' }, ...extra });
const fill = (hex: string) => ({ backgroundColor: { hex, model: 'hex' } });

const PAGE = { width: mm(200), height: mm(280), margins: { top: mm(24), bottom: mm(22), left: mm(20), right: mm(20) } };
const config = {
  page: PAGE,
  layout: { layoutType: 'single' },
  parts: {
    margins: { top: mm(150), bottom: mm(70), left: mm(20), right: mm(60) },
    bodyStyle: { color: { hex: '#eeeeee', model: 'hex' } },
    design: {
      elements: [
        { kind: 'box', id: 'sheet', placement: onPage(0, 0, 200, 280), style: fill('#2b4acb') },
        { kind: 'box', id: 'foot', placement: onPage(0, 220, 200, 60), style: fill('#15171c') },
        text('label', 'Part', 60),
        text('num', '{number}', 70, { fontSize: pt(60) }),
        text('title', '{titleText}', 110, { fontSize: pt(30) }),
        text('imprint', 'The guide', 250),
      ],
    },
  },
} as never;
const md = ':::part{number="II" title="The craft"}\n1. First\n2. Second\n:::\n\n# Alpha\n\nText.\n';

describe('semantic docx: a page filled with one colour', () => {
  it('writes a valid PNG of one colour', () => {
    const png = solidPng('2B4ACB');
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const idat = strFromU8(png, true).indexOf('IDAT');
    const length = new DataView(png.buffer).getUint32(idat - 4);
    const raw = unzlibSync(png.subarray(idat + 4, idat + 4 + length));
    expect([...raw.subarray(0, 4)]).toEqual([0, 0x2b, 0x4a, 0xcb]);
  });

  it('draws the ground behind the text, the list on it and the foot band at its place', async () => {
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    // The sheet and the foot band, anchored to the page behind the text.
    const ground = /<w:sdt><w:sdtPr><w:tag w:val="ptx:design:ground"\/>(?:(?!<\/w:sdt>)[^])*<\/w:sdt>/.exec(e.doc)?.[0] ?? '';
    const anchors = ground.match(/<wp:anchor [^>]*behindDoc="1"[^>]*>/g) ?? [];
    expect(anchors).toHaveLength(2);
    expect(ground).toContain('<wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset>');
    // The whole sheet: 200 x 280 mm.
    expect(ground).toMatch(/<wp:extent cx="7200\d{3}" cy="100[78]\d{4}"\/>/);
    // The ground opens the page; nothing of the part is in a table shaded
    // in the sheet's colour.
    expect(e.doc.indexOf('ptx:design:ground')).toBeLessThan(e.doc.indexOf('>Part<'));
    expect(e.doc).not.toContain('w:fill="2B4ACB"');
    // The title keeps its white ink, and the list stands before the foot
    // band's text, in the part body's ink.
    const pos = (s: string): number => e.doc.indexOf(`>${s}<`);
    expect(pos('The craft')).toBeLessThan(pos('First'));
    expect(pos('First')).toBeLessThan(pos('The guide'));
    expect(e.doc).toMatch(/<w:color w:val="EEEEEE"\/>(?:(?!<\/w:p>)[^])*>First</);
    // The foot band: a table placed on the page, across the sheet.
    const y = Math.round((220 / 25.4) * 1440);
    expect(e.doc).toContain(`<w:tblpPr w:leftFromText="0" w:rightFromText="0" w:topFromText="0" w:bottomFromText="0" w:vertAnchor="page" w:horzAnchor="page" w:tblpX="1" w:tblpY="${y}"/>`);
    expect(e.doc).toMatch(/<w:shd w:val="clear" w:color="auto" w:fill="15171C"\/><\/w:tcPr>(?:(?!<\/w:tc>)[^])*>The guide</);
    // No text box anywhere, and the file reads back unchanged.
    expect(e.doc).not.toContain('w:txbxContent');
    const r = applyDocxEdits(e.bytes, { chapters: [{ id: 'ch1', markdown: md }] });
    expect(r.edits).toEqual([]);
  });

  it('draws no ground in the plain design', async () => {
    const e = await exportDocx(md, { config, design: 'plain' });
    expect(e.doc).not.toContain('ptx:design:ground');
    expect(e.doc).not.toContain('w:tblpPr');
  });
});
