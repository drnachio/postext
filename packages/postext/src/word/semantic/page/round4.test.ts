// Pages of the semantic .docx, fourth review (#1444): the part in force in
// the running heads, page breaks the pages already make, note numbering on
// every section, the contents' tab in a one-column section, folios in the
// document's digits and on the outer edge of a book set right to left,
// composed pages that print no running heads, the side of a chapter's
// first page, notes in the margin and books without part pages. Every
// export re-imports unchanged.

import { describe, expect, it } from 'vitest';
import type { PostextConfig } from '../../../types.js';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { exportDocx, exportProblems, sectionsOf, type Exported } from '../fixtures/harness.js';

const cfg = (c: Record<string, unknown>): PostextConfig => c as unknown as PostextConfig;
const mm = (value: number) => ({ value, unit: 'mm' });
const cm = (value: number) => ({ value, unit: 'cm' });
/** A text element at the head of the page. */
const head = (content: string, extra: Record<string, unknown> = {}) => ({ kind: 'text', id: `h${content.length}`, content, placement: { anchor: { to: 'page', edge: 'top-left' } }, ...extra });

function unchanged(e: Exported, md: string[]): void {
  const r = applyDocxEdits(e.bytes, { chapters: md.map((markdown, i) => ({ id: `ch${i + 1}`, markdown })) });
  expect(r.edits).toEqual([]);
  expect(r.chapters.map((c) => c.markdown)).toEqual(md);
}

/** The XML of the header or footer a section refers to as `type`. */
function partOf(e: Exported, sect: string, kind: 'header' | 'footer', type: string): string {
  const id = new RegExp(`<w:${kind}Reference w:type="${type}" r:id="([^"]+)"`).exec(sect)?.[1];
  if (!id) return '';
  const rels = e.part('word/_rels/document.xml.rels');
  const target = new RegExp(`Id="${id}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${id}"`).exec(rels)?.slice(1).find(Boolean) ?? '';
  return e.part(`word/${target}`);
}

const textOf = (xml: string): string => [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');

describe('semantic docx: pages, fourth review (#1444)', () => {
  it('reads the part in force from the last part fence, not from a level-1 heading', async () => {
    const md = ['# Contents\n\nIntro.\n', ':::part{number="I" title="Solar System"}\n:::\n\n## Neptune\n\nText.\n', ':::part{number="II" title="Stars"}\n:::\n\n## Novae\n\nText.\n'];
    const config = cfg({ layout: { layoutType: 'single' }, header: { elements: [head('{partNumber} · {partTitle}')] } });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, md)).toEqual([]);
    const heads = sectionsOf(e.doc, true).map((s) => textOf(partOf(e, s, 'header', 'default')));
    const neptune = sectionsOf(e.doc, true).findIndex((_, i, all) => e.doc.indexOf(all[i]!) > e.doc.indexOf('>Neptune<'));
    const novae = sectionsOf(e.doc, true).findIndex((_, i, all) => e.doc.indexOf(all[i]!) > e.doc.indexOf('>Novae<'));
    expect(heads[neptune]).toBe('I · Solar System');
    expect(heads[novae]).toBe('II · Stars');
    unchanged(e, md);
  });

  it('drops a page break that a section break or a page-opening heading already makes', async () => {
    const md = ['# The Book {style="cover"}\n\n:::pagebreak\n\nPublished by someone.\n\n:::pagebreak\n\n# One\n\nText.\n\n:::pagebreak\n\nA new page.\n'];
    const config = cfg({
      layout: { layoutType: 'single' },
      headings: { levels: [{ level: 1, breakBefore: { enabled: true } }] },
      headingStyles: [{ id: 'cover', name: 'Cover', breakBefore: { enabled: true }, margins: { top: cm(18), bottom: cm(4), left: cm(2), right: cm(2) } }],
    });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, md)).toEqual([]);
    // Only the break inside the chapter's text is left.
    expect(e.doc.match(/<w:br w:type="page"\/>/g)?.length).toBe(1);
    expect(e.doc.indexOf('<w:br w:type="page"/>')).toBeGreaterThan(e.doc.indexOf('>Text.<'));
    unchanged(e, md);
  });

  it('keeps the chapter bookmark when the chapter opens with a dropped break', async () => {
    const md = ['# One\n\nText.\n', ':::pagebreak\n\n# Two\n\nMore.\n'];
    const e = await exportDocx(md, { config: cfg({ layout: { layoutType: 'single' } }) });
    expect(e.doc).not.toContain('<w:br w:type="page"/>');
    expect(e.doc).toContain('w:name="chapter_ch2"');
    unchanged(e, md);
  });

  it('says how notes are numbered on every section', async () => {
    const md = ['# One\n\nText.[^a]\n\n:::callout{span="page"}\nAcross.\n:::\n\nMore.[^b]\n\n[^a]: A.\n\n[^b]: B.\n'];
    const e = await exportDocx(md, { config: cfg({ layout: { layoutType: 'double' }, footnotes: { numbering: 'chapter' } }) });
    expect(exportProblems(e, md)).toEqual([]);
    const sects = sectionsOf(e.doc, true);
    expect(sects.length).toBeGreaterThan(2);
    expect(sects[0]).toContain('<w:footnotePr><w:numStart w:val="1"/><w:numRestart w:val="eachSect"/></w:footnotePr>');
    for (const s of sects.slice(1)) expect(s).toContain('<w:footnotePr><w:numStart w:val="1"/><w:numRestart w:val="continuous"/></w:footnotePr>');
    unchanged(e, md);
  });

  it('sets a one-column styled section in one column, the contents tab at its right edge', async () => {
    const md = ['# Contents {style="contents"}\n\n:::toc\n\n# One\n\nText.\n'];
    const config = cfg({ layout: { layoutType: 'double' }, headingStyles: [{ id: 'contents', name: 'Contents', layout: { layoutType: 'single' } }] });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, md)).toEqual([]);
    const tab = /<w:tab w:val="right" w:leader="dot" w:pos="(\d+)"\/>/.exec(e.doc)?.[1];
    const width = /<w:pgSz w:w="(\d+)"/.exec(e.doc)![1];
    const m = /<w:pgMar w:top="\d+" w:right="(\d+)" w:bottom="\d+" w:left="(\d+)"/.exec(e.doc)!;
    expect(Math.abs(Number(tab) - (Number(width) - Number(m[1]) - Number(m[2])))).toBeLessThanOrEqual(2);
    const contents = sectionsOf(e.doc, true).find((s) => e.doc.indexOf(s) > e.doc.indexOf('ptx:toc'))!;
    expect(contents).toContain('<w:cols w:space="720"/>');
    unchanged(e, md);
  });

  it('numbers the pages of an Arabic book in Arabic-Indic digits', async () => {
    const md = ['# باب\n\nنص.\n'];
    const e = await exportDocx(md, { config: cfg({ locale: 'ar', layout: { layoutType: 'single' } }) });
    for (const s of sectionsOf(e.doc, true)) expect(s).toContain('<w:pgNumType w:fmt="hindiNumbers"/>');
    unchanged(e, md);
  });

  it('writes the running heads of a book set right to left as left-to-right paragraphs, the folio where the design puts it', async () => {
    const md = ['# باب\n\nنص.\n'];
    const folio = { kind: 'text', id: 'f', content: '{pageNumber}', placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(10) } } };
    const title = { kind: 'text', id: 't', content: 'عنوان', align: 'right', placement: { anchor: { to: 'page', edge: 'top-right' }, offset: { x: mm(-10) } } };
    const e = await exportDocx(md, { config: cfg({ locale: 'ar', layout: { layoutType: 'single' }, header: { elements: [folio, title] } }) });
    const xml = partOf(e, sectionsOf(e.doc, true)[0]!, 'header', 'default');
    expect(xml).toContain('<w:bidi w:val="0"/>');
    // The folio first (the left of the line), then the title at the right tab.
    expect(xml.indexOf(' PAGE ')).toBeLessThan(xml.indexOf('عنوان'));
    unchanged(e, md);
  });

  it('leaves out the running heads of a composed page whose template prints none', async () => {
    const md = ['::::page{template="cover"}\n# Our river\n\nText.\n::::\n\n::::page{template="plain"}\n# Inside\n\nMore.\n::::\n'];
    const config = cfg({
      layout: { layoutType: 'single' },
      header: { elements: [head('Our river')] },
      pageTemplates: [
        { id: 'cover', header: false, frames: [{ name: 'body', takes: 'rest' }] },
        { id: 'plain', frames: [{ name: 'body', takes: 'rest' }] },
      ],
    });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, md)).toEqual([]);
    const sects = sectionsOf(e.doc, true);
    expect(sects.length).toBeGreaterThanOrEqual(2);
    expect(textOf(partOf(e, sects[0]!, 'header', 'default'))).toBe('');
    expect(textOf(partOf(e, sects[sects.length - 1]!, 'header', 'default'))).toBe('Our river');
    unchanged(e, md);
  });

  it('gives a chapter that starts on an even folio the opener heads of a left-hand page', async () => {
    const md = ['# Tortilla\n\nText.\n'];
    const config = cfg({
      layout: { layoutType: 'single' },
      page: { pageNumbering: { startAt: 58 } },
      headings: { levels: [{ level: 1, breakBefore: { enabled: true } }] },
      footer: { elements: [head('{pageNumber} Verso', { parity: 'even', placement: { anchor: { to: 'page', edge: 'bottom-left' } } }), head('Recto {pageNumber}', { parity: 'odd', placement: { anchor: { to: 'page', edge: 'bottom-right' } } })] },
    });
    const e = await exportDocx(md, { config });
    const first = sectionsOf(e.doc, true)[0]!;
    expect(first).toContain('w:start="58"');
    expect(textOf(partOf(e, first, 'footer', 'first'))).toContain('Verso');
    unchanged(e, md);
  });

  it('sets a note in the margin in a frame and draws a vertical rule down the page', async () => {
    const md = ['# One\n\nText.\n'];
    const note = { kind: 'text', id: 'note', content: 'Do not write in this margin', placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(175), y: mm(22) }, size: { width: mm(28) } } };
    const rule = { kind: 'rule', id: 'rule', direction: 'vertical', color: { hex: '#888888' }, thickness: { value: 0.75, unit: 'pt' }, placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(172), y: mm(22) }, size: { height: mm(200) } } };
    const config = cfg({ page: { width: mm(210), height: mm(297), margins: { left: mm(25), right: mm(45), top: mm(25), bottom: mm(25) } }, layout: { layoutType: 'single' }, header: { elements: [head('Paper 2'), note, rule] } });
    const e = await exportDocx(md, { config });
    const xml = partOf(e, sectionsOf(e.doc, true)[0]!, 'header', 'default');
    // The note in a frame at its place on the page.
    const frames = xml.match(/<w:framePr [^>]*\/>/g) ?? [];
    expect(frames.length).toBe(1);
    expect(frames[0]).toContain('w:hAnchor="page"');
    expect(textOf(xml)).toContain('Do not write in this margin');
    // The rule: a picture behind the text, 172 mm in and 22 mm down the
    // sheet, 200 mm tall and under a point wide. No paragraph of the
    // header is as tall as the rule: a reader without frames or placed
    // pictures loses the line, not the page.
    expect(xml).toMatch(/<wp:anchor [^>]*behindDoc="1"/);
    expect(xml).toMatch(/<wp:positionH relativeFrom="page"><wp:posOffset>619\d{4}<\/wp:posOffset>/);
    expect(xml).toMatch(/<wp:positionV relativeFrom="page"><wp:posOffset>79\d{4}<\/wp:posOffset>/);
    const [, cx, cy] = /<wp:extent cx="(\d+)" cy="(\d+)"\/>/.exec(xml) ?? [];
    expect(Number(cx)).toBeLessThan(12700);
    expect(Number(cy)).toBeGreaterThan(7190000);
    expect(Number(cy)).toBeLessThan(7210000);
    expect(xml).not.toMatch(/w:hRule="exact"/);
    expect(xml).not.toMatch(/w:line="\d{4,}"/);
    // Drawn from the running head's own paragraph, which reads its
    // picture from the header's relationships.
    expect(xml.match(/<w:p>/g)).toHaveLength(2);
    expect(exportProblems(e, md)).toEqual([]);
    unchanged(e, md);
  });

  it('prints nothing for a part in a book without part pages', async () => {
    const md = [':::part{number="A" title="The river"}\n:::\n\n# Born\n\nText.\n'];
    const e = await exportDocx(md, { config: cfg({ layout: { layoutType: 'single' }, parts: { page: false } }) });
    expect(exportProblems(e, md)).toEqual([]);
    expect(e.doc).not.toContain('>The river<');
    unchanged(e, md);
  });

  it('leaves the side of a later chapter first page to Word when its folio is unknown', async () => {
    const md = ['# Tortilla\n\nText.\n', '# Gazpacho\n\nMore text.\n'];
    const config = cfg({
      layout: { layoutType: 'single' },
      page: { pageNumbering: { startAt: 58 } },
      headings: { levels: [{ level: 1, breakBefore: { enabled: true } }] },
      footer: { elements: [head('{pageNumber} Verso', { parity: 'even', placement: { anchor: { to: 'page', edge: 'bottom-left' } } }), head('{chapterTitle} {pageNumber}', { parity: 'odd', placement: { anchor: { to: 'page', edge: 'bottom-right' } } })] },
    });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, md)).toEqual([]);
    const second = sectionsOf(e.doc, true).find((s) => e.doc.indexOf(s) > e.doc.indexOf('>Gazpacho<'))!;
    // Its opener prints what any page of its side prints: no first-page
    // footer, so Word picks the odd or even one by folio.
    expect(second).not.toContain('<w:titlePg/>');
    expect(second).not.toContain('w:type="first"');
    expect(textOf(partOf(e, second, 'footer', 'even'))).toContain('Verso');
    unchanged(e, md);
  });

  it('sets the page after a cover title with the cover margins, its text at the foot', async () => {
    const md = ['# The Book {style="cover"}\n\n:::pagebreak\n\nPublished by someone.\n\n# One\n\nText.\n'];
    const config = cfg({
      page: { width: cm(20), height: cm(30), margins: { top: cm(2), bottom: cm(2), left: cm(2), right: cm(2) } },
      layout: { layoutType: 'double', gutterWidth: mm(6) },
      headings: { levels: [{ level: 1, breakBefore: { enabled: true } }] },
      headingStyles: [{ id: 'cover', name: 'Cover', breakBefore: { enabled: true }, layout: { layoutType: 'single' }, margins: { top: cm(24), bottom: cm(2), left: cm(12), right: cm(2) } }],
    });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, md)).toEqual([]);
    const sects = sectionsOf(e.doc, true);
    const colophon = sects.find((s) => e.doc.indexOf(s) > e.doc.indexOf('>Published by someone.<'))!;
    // Left 12 cm, one column; the top margin gives the text twice its 4 cm.
    expect(colophon).toContain('w:left="6803"');
    expect(colophon).toContain('w:top="11338"');
    expect(colophon).toContain('<w:cols w:space="720"/><w:vAlign w:val="bottom"/>');
    // The cover's own page and the chapter after it keep the book's.
    expect(sects[0]).toContain('w:left="1134"');
    expect(sects.at(-1)).toContain('w:left="1134"');
    expect(sects.at(-1)).not.toContain('vAlign');
    unchanged(e, md);
  });
});
