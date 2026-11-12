// Chapter styles in the flow .docx (#1521): each chapter's section and
// text set in the chapter style it takes, the styles that differ named
// after it, and a round trip through Word that keeps the source as it was.

import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { semanticDocx } from '../index.js';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { config, LOREM, mm } from '../../formatted/formatted.test-helper.js';
import type { PostextConfig } from '../../../types.js';
import { chapterStyleIds } from './looks.js';

const DATE = '2026-11-12T00:00:00Z';
const pt = (value: number) => ({ value, unit: 'pt' as const });

const book = (): PostextConfig => config({
  bodyText: { fontSize: pt(10), textAlign: 'justify', firstLineIndent: mm(0), hyphenation: { enabled: true } },
  chapterStyles: [{
    id: 'appendix',
    name: 'Appendix',
    config: {
      page: { margins: { left: mm(20), right: mm(20) } },
      layout: { layoutType: 'double' },
      bodyText: { fontSize: pt(8) },
    },
  }],
} as never);

const CHAPTERS = [
  { id: 'one', markdown: `# One\n\n${LOREM}\n` },
  { id: 'two', markdown: `:::part{number="I" title="Appendices" style="appendix"}\n:::\n\n# Two\n\n${LOREM}\n` },
  { id: 'three', markdown: `# Three\n\n${LOREM}\n` },
  { id: 'four', markdown: `---\ntitle: Four\n---\n:::part{number="II" title="Back" page=false}\n:::\n\n# Four\n\n${LOREM}\n` },
  { id: 'five', markdown: `---\nchapterStyle: appendix\n---\n# Five\n\n${LOREM}\n` },
];

const files = (bytes: Uint8Array) => unzipSync(bytes);
const xmlOf = (bytes: Uint8Array, path: string) => strFromU8(files(bytes)[path]!);
/** The section properties of the document, in order. */
const sections = (doc: string): string[] => [...doc.matchAll(/<w:sectPr>[\s\S]*?<\/w:sectPr>/g)].map((m) => m[0]);
/** The text of a body chapter: from its bookmark to the next one's. */
const chapterXml = (doc: string, id: string, next?: string): string => doc.slice(doc.indexOf(`chapter_${id}`), next ? doc.indexOf(`chapter_${next}`) : undefined);

describe('chapter styles in the flow .docx (#1521)', () => {
  it('read the style each chapter takes, the part it is in included', () => {
    expect(chapterStyleIds(CHAPTERS, book())).toEqual([undefined, 'appendix', 'appendix', undefined, 'appendix']);
    expect(chapterStyleIds(CHAPTERS, config())).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  it('give each chapter its section in its own settings, and its own styles where the text differs', async () => {
    const bytes = await semanticDocx({ chapters: CHAPTERS, config: book(), date: DATE });
    const doc = xmlOf(bytes, 'word/document.xml');
    const styles = xmlOf(bytes, 'word/styles.xml');
    // Two columns and the style's margins in the appendix chapters only.
    const cols = sections(doc).map((s) => (/w:num="2"/.test(s) ? 2 : 1));
    expect(cols).toContain(2);
    const two = chapterXml(doc, 'two', 'three');
    const twoSect = sections(two).at(-1)!;
    expect(twoSect).toMatch(/w:num="2"/);
    expect(twoSect).toMatch(/w:left="1134"/);
    const one = chapterXml(doc, 'one', 'two');
    expect(sections(one).every((s) => !/w:num="2"/.test(s))).toBe(true);
    // The appendix text in a Normal of its own, 8 pt, named after the style.
    expect(styles).toContain('<w:name w:val="Normal (Appendix)"/>');
    expect(styles).toMatch(/w:styleId="NormalCs1"[^>]*>(?:(?!<\/w:style>).)*<w:sz w:val="16"\/>/);
    expect(two).toContain('<w:pStyle w:val="NormalCs1"/>');
    expect(one).not.toContain('Cs1"');
    expect(chapterXml(doc, 'four', 'five')).not.toContain('Cs1"');
    // A style no text of the appendix sets otherwise stays the book's: one
    // Normal is the default, the other is based on nothing and not default.
    expect(styles.match(/w:default="1" w:styleId="Normal"/g)).toHaveLength(1);
    expect(styles).not.toMatch(/w:styleId="NormalCs1"[^>]*w:default/);
  });

  it('leave a book without chapter styles as it was written', async () => {
    const { chapterStyles: _styles, ...plain } = book();
    void _styles;
    const a = await semanticDocx({ chapters: CHAPTERS, config: plain, date: DATE });
    const b = await semanticDocx({ chapters: CHAPTERS, config: { ...plain, chapterStyles: [{ id: 'unused', config: { layout: { layoutType: 'double' } } }] }, date: DATE });
    expect(xmlOf(b, 'word/document.xml')).toBe(xmlOf(a, 'word/document.xml'));
  });

  it('set the semantic route in the plain design, with the same chapter sections', async () => {
    const bytes = await semanticDocx({ chapters: CHAPTERS, config: book(), date: DATE, design: 'plain' });
    const doc = xmlOf(bytes, 'word/document.xml');
    // Content only: one column everywhere, and no style named apart when
    // the plain design sets the appendix as the rest.
    expect(sections(doc).every((s) => !/w:num="2"/.test(s))).toBe(true);
    expect(xmlOf(bytes, 'word/styles.xml')).not.toContain('(Appendix)');
  });

  it('come back from Word with the chapter and part styles where they were, once', async () => {
    const cfg = book();
    for (const design of ['book', 'plain'] as const) {
      const bytes = await semanticDocx({ chapters: CHAPTERS, config: cfg, date: DATE, design });
      expect(applyDocxEdits(bytes, { chapters: CHAPTERS }).edits).toEqual([]);
      const all = files(bytes);
      all['word/document.xml'] = strToU8(strFromU8(all['word/document.xml']!).replaceAll('Typesetting', 'Type setting'));
      const r = applyDocxEdits(zipSync(all), { chapters: CHAPTERS });
      expect(r.chapters.map((c) => c.markdown)).toEqual(CHAPTERS.map((c) => c.markdown.replace('Typesetting', 'Type setting')));
      for (const c of r.chapters) {
        expect(c.markdown.split('style="appendix"').length).toBe(CHAPTERS.find((x) => x.id === c.id)!.markdown.split('style="appendix"').length);
      }
    }
  });
});
