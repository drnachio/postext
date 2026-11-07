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

function unchanged(e: Exported, md: string[]): void {
  const r = applyDocxEdits(e.bytes, { chapters: md.map((markdown, i) => ({ id: `ch${i + 1}`, markdown })) });
  expect(r.edits).toEqual([]);
  expect(r.chapters.map((c) => c.markdown)).toEqual(md);
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
    expect(sectionsOf(e.doc)[0]).toContain('<w:footnotePr><w:numFmt w:val="lowerLetter"/><w:numRestart w:val="eachPage"/></w:footnotePr>');
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
