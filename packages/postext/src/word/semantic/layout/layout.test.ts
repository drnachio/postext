// Page layout of the semantic .docx after the second review (#1444):
// page-span content in its own one-column section, headings that open a
// page, the book's start counters, heading references linked to their
// heading, pictures sized to their slot, box insets fitted to the column,
// ruby, the faces of bold and italic runs, chips outlined and contents
// entries linked to their headings. Every export re-imports unchanged.

import { describe, expect, it } from 'vitest';
import type { PostextConfig, Resource } from '../../../types.js';
import type { WordFontPlan } from '../../fonts/types.js';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { exportDocx, exportProblems, type Exported } from '../fixtures/harness.js';

const cfg = (c: Record<string, unknown>): PostextConfig => c as unknown as PostextConfig;

function unchanged(e: Exported, md: string[]): void {
  const r = applyDocxEdits(e.bytes, { chapters: md.map((markdown, i) => ({ id: `ch${i + 1}`, markdown })) });
  expect(r.edits).toEqual([]);
  expect(r.chapters.map((c) => c.markdown)).toEqual(md);
}

const paraOf = (xml: string, text: string): string => {
  const at = xml.indexOf(text);
  const start = xml.lastIndexOf('<w:p>', at);
  return xml.slice(start, xml.indexOf('</w:p>', at) + 6);
};

const styleOf = (e: Exported, id: string): string => {
  const xml = e.part('word/styles.xml');
  const at = xml.indexOf(`w:styleId="${id}"`);
  return at < 0 ? '' : xml.slice(at, xml.indexOf('</w:style>', at));
};

const sectionsOf = (doc: string): string[] => doc.match(/<w:sectPr>.*?<\/w:sectPr>/g) ?? [];

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe('semantic docx: page layout (#1444)', () => {
  it('sets page-span content in a one-column section between continuous breaks', async () => {
    const md = '# Title {span="page"}\n\nFirst column text.\n\n:::callout{span="page"}\nAcross the page.\n:::\n\nBack in columns.\n';
    const config = cfg({ layout: { layoutType: 'double', gutterWidth: { value: 0.5, unit: 'cm' } }, headings: { levels: [{ level: 1, span: 'page' }] } });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    const sects = sectionsOf(e.doc);
    // Title (one column), text (two), box (one), the rest (two).
    expect(sects).toHaveLength(4);
    expect(sects[0]).toContain('<w:cols w:space="720"/>');
    for (const s of sects.slice(1)) {
      expect(s).toContain('<w:type w:val="continuous"/>');
      expect(s).not.toContain('<w:pgNumType');
    }
    expect(sects[1]).toContain('w:num="2"');
    expect(sects[2]).toContain('<w:cols w:space="720"/>');
    expect(sects[3]).toContain('w:num="2"');
    unchanged(e, [md]);
  });

  it('opens a page before a heading level that breaks, and a section on its parity', async () => {
    const md = 'Intro.\n\n## Part one\n\nText.\n\n## Part two\n\nMore.\n';
    const e = await exportDocx(md, { config: cfg({ headings: { levels: [{ level: 2, breakBefore: { enabled: true, parity: 'odd' } }] } }) });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(styleOf(e, 'Heading2')).toContain('<w:pageBreakBefore/>');
    const sects = sectionsOf(e.doc);
    expect(sects).toHaveLength(3);
    expect(sects[1]).toContain('<w:type w:val="oddPage"/>');
    expect(sects[2]).toContain('<w:type w:val="oddPage"/>');
    unchanged(e, [md]);
  });

  it('counts headings and pages on from the book start', async () => {
    const md = '# Light\n\n## Waves\n\nText.\n';
    const config = cfg({ headings: { levels: [{ level: 1, numberingTemplate: '{1}' }, { level: 2, numberingTemplate: '{1}.{2}' }] } });
    const e = await exportDocx(md, { config, start: { headings: { h1: 3, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 }, pageNumbering: { startAt: 87 } } as never });
    expect(exportProblems(e, [md])).toEqual([]);
    const numbers = e.map.fragments.filter((f) => f.role === 'number').map((f) => f.text.trim());
    expect(numbers[0]).toMatch(/^4\b/);
    expect(numbers[1]).toMatch(/^4\.1\b/);
    expect(sectionsOf(e.doc)[0]).toContain('<w:pgNumType w:start="87"/>');
    unchanged(e, [md]);
  });

  it('prints a heading reference as the engine does and links it to the heading', async () => {
    const md = '# Optics {#optics}\n\nSee :ref{id="optics"} for more.\n';
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.doc).toContain('w:name="optics"');
    expect(e.doc).toMatch(/<w:hyperlink w:anchor="optics" w:history="1">/);
    const ref = e.map.fragments.find((f) => f.text.startsWith('See '))!;
    expect(ref.text).not.toContain('optics ');
    expect(ref.atoms?.map((a) => a.kind)).toEqual(['ref']);
    unchanged(e, [md]);
  });

  it('sizes a picture to its slot and sets it on the slot side', async () => {
    const res: Resource = { id: 'p', typeId: 'figure', kind: 'bitmap', caption: 'Cap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'p', format: 'png', width: 2000, height: 1000 }, placement: { width: 0.5, align: 'right' } } as never;
    const md = 'Text.\n\n::resource{id="p"}\n';
    const e = await exportDocx(md, { resources: [res], resourceBytes: () => PNG });
    const full = await exportDocx(md, { resources: [{ ...res, placement: undefined } as never], resourceBytes: () => PNG });
    const cx = (x: Exported): number => Number(/<wp:extent cx="(\d+)"/.exec(x.doc)![1]);
    expect(cx(e) / cx(full)).toBeCloseTo(0.5, 2);
    expect(paraOf(e.doc, '<w:drawing>')).toContain('<w:jc w:val="right"/>');
    unchanged(e, [md]);
  });

  it('fits a box inset to the column it sits in', async () => {
    const md = ':::callout{type="abstract"}\nInside.\n:::\n';
    const pad = { value: 3, unit: 'cm' };
    const config = cfg({ layout: { layoutType: 'double' }, calloutStyles: [{ id: 'abstract', padding: { top: pad, right: pad, bottom: pad, left: pad } }] });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    const lefts = [...e.doc.matchAll(/<w:tblCellMar><w:top w:w="\d+" w:type="dxa"\/><w:left w:w="(\d+)"/g)].map((m) => Number(m[1]));
    const widths = [...e.doc.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1]));
    expect(lefts.length).toBeGreaterThan(0);
    // 3 cm (1701 twips) a side would leave a quarter of a column; a quarter
    // of the width is the most an inset takes.
    expect(lefts[0]).toBeLessThan(1701);
    expect(lefts[0]! * 2).toBeLessThanOrEqual(widths[0]! * 0.25 + 1);
    unchanged(e, [md]);
  });

  it('sets ruby over its base, the reading taken from the source', async () => {
    const md = 'A :ruby[漢字]{rt="かんじ"} here.\n';
    const e = await exportDocx(md, { config: cfg({ locale: 'ja' }) });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.doc).toMatch(/<w:ruby><w:rubyPr>.*?<w:lid w:val="ja"\/><\/w:rubyPr><w:rt>.*?かんじ.*?<\/w:rt><w:rubyBase>.*?漢字.*?<\/w:rubyBase><\/w:ruby>/);
    unchanged(e, [md]);
  });

  it('sets italic and bold runs in the family that holds those faces', async () => {
    const plan: WordFontPlan = {
      faces: [],
      warnings: [],
      altNames: new Map(),
      map: new Map([
        ['Merri|300|normal', { family: 'Merri Light PTX', bold: false, italic: false }],
        ['Merri|400|normal', { family: 'Merri PTX', bold: false, italic: false }],
        ['Merri|400|italic', { family: 'Merri PTX', bold: false, italic: true }],
        ['Merri|700|normal', { family: 'Merri PTX', bold: true, italic: false }],
        ['Sans|700|italic', { family: 'Sans PTX', bold: true, italic: true }],
      ]),
    };
    const md = '# Head *slanted*\n\nLight text with *italic* and **bold** words.\n';
    const config = cfg({ bodyText: { fontFamily: 'Merri', fontWeight: 300 }, headings: { levels: [{ level: 1, fontFamily: 'Sans', fontWeight: 700 }] } });
    const e = await exportDocx(md, { config, fonts: plan });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(styleOf(e, 'Normal')).toContain('w:ascii="Merri Light PTX"');
    const body = paraOf(e.doc, 'Light text');
    expect(body).toMatch(/<w:rFonts w:ascii="Merri PTX"[^>]*\/><w:i\/><w:iCs\/><\/w:rPr><w:t[^>]*>italic/);
    expect(body).toMatch(/<w:rFonts w:ascii="Merri PTX"[^>]*\/><w:b\/><w:bCs\/><\/w:rPr><w:t[^>]*>bold/);
    // The heading's own family holds its italic: no family on the run.
    expect(paraOf(e.doc, 'slanted')).not.toContain('Merri');
    unchanged(e, [md]);
  });

  it('outlines a chip as its style does and leaves a white fill out', async () => {
    const md = 'Pick :chip[A]{style="bubble"} or :chip[B]{style="line"}.\n';
    const config = cfg({
      chipStyles: [
        { id: 'bubble', background: { hex: '#ffffff', model: 'hex' }, borderColor: { hex: '#333333', model: 'hex' }, borderWidth: { value: 1, unit: 'pt' }, borderRadius: { value: 1, unit: 'em' } },
        { id: 'line', backgroundEnabled: false, underline: 'dashed' },
      ],
    });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    const bubble = styleOf(e, 'PostextChipbubble');
    expect(bubble).toContain('<w:bdr w:val="single" w:sz="8" w:space="0" w:color="333333"/>');
    expect(bubble).toContain('w:fill="auto"');
    expect(styleOf(e, 'PostextChipline')).toContain('<w:u w:val="dash"/>');
    unchanged(e, [md]);
  });

  it('links contents entries to their headings with a page reference', async () => {
    const md = ['# Contents\n\n:::toc\n', '# First\n\nText.\n', '# Second\n\nMore.\n'];
    const e = await exportDocx(md);
    expect(exportProblems(e, md)).toEqual([]);
    expect(e.doc).toContain('w:name="_Toc1_0"');
    expect(e.doc).toMatch(/<w:hyperlink w:anchor="_Toc1_0" w:history="1">.*?First.*?<w:tab\/>.*?PAGEREF _Toc1_0 \\h/);
    expect(e.doc).toContain('<w:tab w:val="right" w:leader="dot"');
    unchanged(e, md);
  });
});
