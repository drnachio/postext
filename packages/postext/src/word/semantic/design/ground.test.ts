// A page a design fills with one colour (#1458): the fill is drawn behind
// the text edge to edge, what the page prints flows over it in its own
// ink, the part's list of chapters stands on it, and a band across the
// foot of the sheet is drawn from the page's footer, which holds its text.

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

  it('draws the ground behind the text, the list on it and the foot band from the footer', async () => {
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    // The sheet, anchored to the page behind the text, down to the band.
    const ground = /<w:sdt><w:sdtPr><w:tag w:val="ptx:design:ground"\/>(?:(?!<\/w:sdt>)[^])*<\/w:sdt>/.exec(e.doc)?.[0] ?? '';
    const anchors = ground.match(/<wp:anchor [^>]*behindDoc="1"[^>]*>/g) ?? [];
    expect(anchors).toHaveLength(1);
    expect(ground).toContain('<wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset>');
    // 200 mm wide, 220 mm down: where the band starts.
    expect(ground).toMatch(/<wp:extent cx="7200\d{3}" cy="79(?:19|20)\d{3}"\/>/);
    // The ground opens the page; nothing of the part is in a table shaded
    // in the sheet's colour.
    expect(e.doc.indexOf('ptx:design:ground')).toBeLessThan(e.doc.indexOf('>Part<'));
    expect(e.doc).not.toContain('w:fill="2B4ACB"');
    // The title keeps its white ink, and the list stands on the ground in
    // the part body's ink.
    const pos = (s: string): number => e.doc.indexOf(`>${s}<`);
    expect(pos('The craft')).toBeLessThan(pos('First'));
    expect(e.doc).toMatch(/<w:color w:val="EEEEEE"\/>(?:(?!<\/w:p>)[^])*>First</);
    // Nothing placed on the page that Google Docs would set in the flow:
    // no table at a position, no frame, no text box.
    expect(e.doc).not.toContain('w:tblpPr');
    expect(e.doc).not.toContain('w:framePr');
    expect(e.doc).not.toContain('w:txbxContent');
    expect(pos('The guide')).toBe(-1);
    // The band's text stands in the first-page footer of the part's
    // section, the band's fill drawn behind it at the band's place.
    const sect = /<w:sectPr>(?:(?!<\/w:sectPr>)[^])*<\/w:sectPr>/.exec(e.doc.slice(e.doc.indexOf('>First<')))?.[0] ?? '';
    expect(sect).toContain('<w:titlePg/>');
    const rel = /<w:footerReference w:type="first" r:id="([^"]+)"\/>/.exec(sect)?.[1];
    const target = new RegExp(`Id="${rel}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${rel}"`).exec(e.part('word/_rels/document.xml.rels'));
    const path = `word/${target?.[1] ?? target?.[2]}`;
    const footer = e.part(path);
    expect(footer).toContain('>The guide<');
    expect(footer).toMatch(/<wp:anchor [^>]*behindDoc="1"/);
    expect(footer).toMatch(/<wp:positionV relativeFrom="page"><wp:posOffset>79(?:19|20)\d{3}<\/wp:posOffset>/);
    expect(footer).toMatch(/<wp:extent cx="7200\d{3}" cy="21(?:59|60)\d{3}"\/>/);
    // The footer reads its picture from its own relationships.
    const blip = /r:embed="([^"]+)"/.exec(footer)?.[1];
    expect(e.part(path.replace('word/', 'word/_rels/') + '.rels')).toContain(`Id="${blip}"`);
    // The text's last line stands where the print sets it: some 25 mm
    // (the line 250 mm down a 280 mm sheet) above the sheet's foot.
    const distance = Number(/w:footer="(\d+)"/.exec(sect)?.[1]);
    expect(distance).toBeGreaterThan((20 / 25.4) * 1440);
    expect(distance).toBeLessThan((30 / 25.4) * 1440);
    // The pages after it keep the book's footer distance.
    const later = [...e.doc.matchAll(/w:footer="(\d+)"/g)].map((m) => Number(m[1]));
    expect(later.filter((d) => d === distance)).toHaveLength(1);
    // The footer is not in the map, and the file reads back unchanged.
    expect(e.map.fragments.some((f) => f.text === 'The guide')).toBe(false);
    const r = applyDocxEdits(e.bytes, { chapters: [{ id: 'ch1', markdown: md }] });
    expect(r.edits).toEqual([]);
  });

  it('gives a page with a foot band a section of its own wherever it stands', async () => {
    // A part after some text, and text right after it: the part's page
    // opens a section and what follows it the next one.
    const inner = 'Before.\n\n:::part{number="II" title="The craft"}\n:::\n\nAfter.\n';
    const e = await exportDocx(inner, { config });
    expect(exportProblems(e, [inner])).toEqual([]);
    const sects = [...e.doc.matchAll(/<w:sectPr>(?:(?!<\/w:sectPr>)[^])*<\/w:sectPr>/g)].map((m) => m[0]);
    expect(sects).toHaveLength(3);
    const at = (s: string): number => e.doc.indexOf(s);
    // Before | part page | After, each closed by its section.
    expect(at('>Before.<')).toBeLessThan(at(sects[0]!));
    expect(at(sects[0]!)).toBeLessThan(at('>The craft<'));
    expect(at('>The craft<')).toBeLessThan(at(sects[1]!));
    expect(at(sects[1]!)).toBeLessThan(at('>After.<'));
    expect(sects[1]).toContain('<w:type w:val="nextPage"/>');
    expect(sects[1]).toContain('<w:footerReference w:type="first"');
    expect(sects[1]).toContain('<w:titlePg/>');
    expect(sects[2]).toContain('<w:type w:val="nextPage"/>');
    expect(sects[2]).not.toContain('<w:titlePg/>');
  });

  it('draws no ground in the plain design', async () => {
    const e = await exportDocx(md, { config, design: 'plain' });
    expect(e.doc).not.toContain('ptx:design:ground');
    expect(e.doc).not.toContain('w:tblpPr');
  });
});
