// Page furniture and page settings of the semantic .docx, third review
// (#1444): running heads on even and odd pages, the notes' numbering and
// rule, the paper colour, fields Word updates on opening, columns that end
// level before a new page and a cover that fills its page. Every export
// re-imports unchanged.

import { describe, expect, it } from 'vitest';
import type { PostextConfig } from '../../../types.js';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { exportDocx, exportProblems, levelSections, sectionsOf, type Exported } from '../fixtures/harness.js';

const cfg = (c: Record<string, unknown>): PostextConfig => c as unknown as PostextConfig;
const cm = (value: number) => ({ value, unit: 'cm' });
/** A text element at the head of the page. */
const head = (content: string) => ({ elements: [{ kind: 'text', id: 'h', content, placement: { anchor: { to: 'page', edge: 'top-left' } } }] });

function unchanged(e: Exported, md: string[]): void {
  const r = applyDocxEdits(e.bytes, { chapters: md.map((markdown, i) => ({ id: `ch${i + 1}`, markdown })) });
  expect(r.edits).toEqual([]);
  expect(r.chapters.map((c) => c.markdown)).toEqual(md);
}

/** The text of the default header each section of the export prints. */
function defaultHeads(e: Exported): string[] {
  const rels = e.part('word/_rels/document.xml.rels');
  const target = (id: string): string => new RegExp(`Id="${id}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${id}"`).exec(rels)?.slice(1).find(Boolean) ?? '';
  return sectionsOf(e.doc, true).map((s) => {
    const id = /<w:headerReference w:type="default" r:id="([^"]+)"/.exec(s)?.[1];
    const xml = id ? e.part(`word/${target(id)}`) : '';
    return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
  });
}

describe('semantic docx: pages (#1444)', () => {
  it('writes running heads for even and odd pages with the folio as a PAGE field', async () => {
    const md = ['# One\n\nText.\n', '# Two\n\nMore.\n'];
    const e = await exportDocx(md, { config: cfg({ layout: { layoutType: 'single' } }) });
    expect(exportProblems(e, md)).toEqual([]);
    expect(e.part('word/settings.xml')).toContain('<w:evenAndOddHeaders/>');
    for (const s of sectionsOf(e.doc)) {
      expect(s).toContain('<w:headerReference w:type="default"');
      expect(s).toContain('<w:headerReference w:type="even"');
    }
    const parts = Object.keys(e.files).filter((p) => /^word\/(header|footer)\d+\.xml$/.test(p));
    expect(parts.some((p) => e.part(p).includes(' PAGE '))).toBe(true);
    unchanged(e, md);
  });

  it('numbers notes in letters from each page under a short rule', async () => {
    const md = ['# One\n\nText.[^a]\n\n[^a]: A note.\n'];
    const config = cfg({ footnotes: { numbering: 'page', numberFormat: 'lower-alpha', separator: { enabled: true, width: 0.25 } } });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, md)).toEqual([]);
    const settings = e.part('word/settings.xml');
    expect(settings).toMatch(/<w:footnotePr><w:numFmt w:val="lowerLetter"\/><w:numRestart w:val="eachPage"\/><w:footnote w:id="-1"\/>/);
    expect(sectionsOf(e.doc)[0]).toContain('<w:footnotePr><w:numFmt w:val="lowerLetter"/><w:numStart w:val="1"/><w:numRestart w:val="eachPage"/></w:footnotePr>');
    // The separator note: a top border three quarters short of the text.
    const separator = /<w:footnote w:type="separator" w:id="-1">(.*?)<\/w:footnote>/.exec(e.part('word/footnotes.xml'))?.[1] ?? '';
    expect(separator).toContain('<w:top ');
    expect(separator).toMatch(/<w:ind w:left="0" w:right="[1-9]\d*"/);
    unchanged(e, md);
  });

  it('paints the paper colour and updates the contents on opening', async () => {
    const md = ['# Contents\n\n:::toc\n', '# One\n\nText.\n'];
    const e = await exportDocx(md, { config: cfg({ page: { backgroundColor: { hex: '#F8F5EE', model: 'hex' } } }) });
    expect(exportProblems(e, md)).toEqual([]);
    expect(e.doc).toContain('<w:background w:color="F8F5EE"/><w:body>');
    const settings = e.part('word/settings.xml');
    expect(settings).toContain('<w:displayBackgroundShape/>');
    expect(settings).toContain('<w:updateFields w:val="true"/>');
    unchanged(e, md);
  });

  it('ends a chapter set in columns level before the next one opens a page', async () => {
    const md = ['# One\n\nText.\n', '# Two\n\nMore.\n'];
    const e = await exportDocx(md, { config: cfg({ layout: { layoutType: 'double' } }) });
    expect(exportProblems(e, md)).toEqual([]);
    // Each chapter's columns, then an empty one-column section on their
    // page: Word balances columns only above a continuous break.
    expect(levelSections(e.doc)).toBe(2);
    expect(e.doc).toMatch(/<w:cols w:num="2"[^>]*\/>.*?<\/w:sectPr><\/w:pPr><\/w:p><w:p><w:pPr>(?:(?!<\/w:p>).)*<w:type w:val="continuous"\/>(?:(?!<\/w:p>).)*<w:cols w:space="720"\/>/);
    unchanged(e, md);
  });

  it('leaves columns as Word sets them when the book does not level them', async () => {
    const md = ['# One\n\nText.\n', '# Two\n\nMore.\n'];
    const e = await exportDocx(md, { config: cfg({ layout: { layoutType: 'double' }, headings: { balancing: { trailing: false } } }) });
    expect(levelSections(e.doc)).toBe(0);
    unchanged(e, md);
  });

  it('gives a section with no block of its own the running heads in force there', async () => {
    // The page-width box opens a one-column section with no block; the
    // chapter's first block comes before its title, so reading the heads
    // from there would find the chapter before.
    const md = ['# One\n\nText.\n', 'Before the title.\n\n# Two {style="s"}\n\nText.\n\n:::callout{span="page"}\nAcross the page.\n:::\n\nBack in columns.\n'];
    const config = cfg({
      layout: { layoutType: 'double' },
      header: head('Book {chapterTitle}'),
      headingStyles: [{ id: 's', name: 'S', header: head('Styled {chapterTitle}') }],
    });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, md)).toEqual([]);
    const heads = defaultHeads(e);
    const at = [...e.doc.matchAll(/<w:sectPr>/g)].map((m) => m.index);
    const title = at.findIndex((i) => i > e.doc.indexOf('>Two<'));
    const box = at.findIndex((i) => i > e.doc.indexOf('Across the page.'));
    // One section for the box, one after it, and one that levels the end.
    expect(heads.length - title).toBeGreaterThanOrEqual(3);
    expect(box).toBeGreaterThan(title);
    for (const h of heads.slice(title)) expect(h).toBe('Styled Two');
    unchanged(e, md);
  });

  it('carries the heads that follow a masthead onto the pages after it', async () => {
    const md = ['# The Courier {style="front"}\n\n## Lead story {style="lead"}\n\nText.\n'];
    const config = cfg({
      layout: { layoutType: 'double' },
      header: head('The Courier {pageNumber}'),
      headings: { levels: [{ level: 1, breakBefore: { enabled: true } }, { level: 2, span: 'page' }] },
      headingStyles: [
        { id: 'front', name: 'Front', header: { elements: [] } },
        { id: 'lead', name: 'Lead' },
      ],
    });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, md)).toEqual([]);
    const first = sectionsOf(e.doc, true)[0]!;
    // The masthead's page prints nothing; its default slot, which an
    // application reading the first section for the pages after it uses,
    // has the paper's head.
    expect(first).toContain('<w:titlePg/>');
    expect(defaultHeads(e)[0]).toBe('The Courier 1');
    unchanged(e, md);
  });

  it('sets what follows a cover that fills its page on the next page', async () => {
    const md = ['# The Book {style="cover"}\n\nPublished by someone.\n\n# One\n\nText.\n'];
    const config = cfg({
      layout: { layoutType: 'single' },
      headingStyles: [{ id: 'cover', name: 'Cover', breakBefore: { enabled: true }, margins: { top: cm(18), bottom: cm(4), left: cm(2), right: cm(2) } }],
    });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, md)).toEqual([]);
    const sects = sectionsOf(e.doc);
    // The cover, then the colophon on a page of its own.
    expect(sects[1]).toContain('<w:type w:val="nextPage"/>');
    const colophon = e.doc.indexOf('Published by someone.');
    expect(e.doc.lastIndexOf('<w:sectPr>', colophon)).toBeGreaterThan(e.doc.indexOf('The Book'));
    unchanged(e, md);
  });
});
