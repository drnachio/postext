// Directives with a native Word rendering (#1444): front matter left out,
// `:::toc` and `:::index` as fields, `:::space` as blank room, `:::numbering`
// as the section's page numbers. None is source text in Word, and an
// unchanged file re-imports into the very same Markdown.

import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { applyDocxEdits } from '../roundtrip/index.js';
import { exportDocx, exportProblems, looseMarkup } from './fixtures/harness.js';

const BOOK = [
  '---\ntitle: "The Book"\nauthor: "Someone"\n---\n\n# Cover {style="cover"}\n\n# Title page {style="cover"}\n\n# Contents\n\n:::toc\n\n:::space{lines=2}\n\nA note.\n',
  ':::numbering{format="lower-roman" startAt=3}\n\n# Preface\n\nSome :index[alpha]{term="Alpha"} text and :index[beta]{term="Beta!gamma"} more.\n\n:::space\n\nAfter the space.\n',
  '# Index\n\n:::index\n',
];
const CONFIG = { headingStyles: [{ id: 'cover', name: 'Cover', breakBefore: { enabled: true } }] } as never;
const current = () => ({ chapters: BOOK.map((markdown, i) => ({ id: `ch${i + 1}`, markdown })) });

describe('semantic docx: directives', () => {
  it('leaves the front matter and config directives out of the text', async () => {
    const e = await exportDocx(BOOK, { config: CONFIG });
    expect(exportProblems(e, BOOK)).toEqual([]);
    expect(looseMarkup(e.doc)).toEqual([]);
    expect(e.doc).not.toContain('PostextSource');
    expect(e.map.fragments.some((f) => f.role?.startsWith('raw:'))).toBe(false);
    expect(e.doc).not.toContain('The Book');
    expect(e.part('docProps/core.xml')).not.toContain('---');
  });

  it('writes the contents as a TOC field listing the book headings', async () => {
    const e = await exportDocx(BOOK, { config: CONFIG });
    expect(e.doc).toContain('<w:tag w:val="ptx:toc"/>');
    expect(e.doc).toContain(' TOC \\o "1-1" \\h \\z \\u ');
    expect(e.doc).toMatch(/<w:pStyle w:val="TOC1"\/>.*?Preface/);
    expect(e.part('word/styles.xml')).toContain('<w:name w:val="toc 1"/>');
  });

  it('writes the index as an INDEX field listing the marked terms in order', async () => {
    const e = await exportDocx(BOOK, { config: CONFIG });
    expect(e.doc).toContain('<w:tag w:val="ptx:index"/>');
    expect(e.doc).toContain(' INDEX </w:instrText>');
    const result = e.doc.slice(e.doc.indexOf(' INDEX '));
    const at = (s: string): number => result.indexOf(`>${s}</w:t>`);
    expect(at('Alpha')).toBeGreaterThan(0);
    expect(at('Beta')).toBeGreaterThan(at('Alpha'));
    expect(at('gamma')).toBeGreaterThan(at('Beta'));
    expect(result).toMatch(/<w:pStyle w:val="Index2"\/>.*?gamma/);
  });

  it('sets :::space as an exact-height empty paragraph and :::numbering on the section', async () => {
    const e = await exportDocx(BOOK, { config: CONFIG });
    expect(e.doc).toContain('<w:tag w:val="ptx:space"/>');
    expect(e.doc).toMatch(/<w:spacing w:before="0" w:after="0" w:line="\d+" w:lineRule="exact"\/>/);
    const sects = e.doc.match(/<w:sectPr>.*?<\/w:sectPr>/g)!;
    expect(sects[0]).not.toContain('pgNumType');
    expect(sects[1]).toContain('<w:pgNumType w:fmt="lowerRoman" w:start="3"/>');
  });

  it('gives each page-opening heading style its own page', async () => {
    const e = await exportDocx(BOOK, { config: CONFIG });
    expect(e.part('word/styles.xml')).toMatch(/w:styleId="PostextHeadingcover1"[^>]*>(?:(?!<\/w:style>).)*<w:pageBreakBefore\/>/);
  });

  it('re-imports an unchanged export into the same Markdown', async () => {
    const e = await exportDocx(BOOK, { config: CONFIG });
    const r = applyDocxEdits(e.bytes, current());
    expect(r.edits).toEqual([]);
    expect(r.changed).toBe(false);
    expect(r.chapters.map((c) => c.markdown)).toEqual(BOOK);
  });

  it('reads nothing from a contents or index Word has updated', async () => {
    const e = await exportDocx(BOOK, { config: CONFIG });
    const files = unzipSync(e.bytes);
    let doc = strFromU8(files['word/document.xml']!);
    // Word's update: entries with hyperlinks, tabs and nested PAGEREF
    // fields, in paragraphs of their own.
    const entry = (text: string): string =>
      `<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr><w:hyperlink w:anchor="_Toc1"><w:r><w:t>${text}</w:t></w:r><w:r><w:tab/></w:r>` +
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGEREF _Toc1 \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>7</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:hyperlink></w:p>';
    doc = doc.replace(/(<w:fldChar w:fldCharType="separate"\/><\/w:r>)(.*?)(<\/w:p>)/, `$1<w:r><w:t>Updated entry</w:t></w:r>$3${entry('Second')}${entry('Third')}`);
    files['word/document.xml'] = strToU8(doc);
    const r = applyDocxEdits(zipSync(files), current());
    expect(r.edits).toEqual([]);
    expect(r.chapters.map((c) => c.markdown)).toEqual(BOOK);
  });

  it('still applies an edit next to the contents', async () => {
    const e = await exportDocx(BOOK, { config: CONFIG });
    const files = unzipSync(e.bytes);
    files['word/document.xml'] = strToU8(strFromU8(files['word/document.xml']!).replace('>A note.<', '>A longer note.<'));
    const r = applyDocxEdits(zipSync(files), current());
    expect(r.chapters[0]!.markdown).toBe(BOOK[0]!.replace('A note.', 'A longer note.'));
  });
});
