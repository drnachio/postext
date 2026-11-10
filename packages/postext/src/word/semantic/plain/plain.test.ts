// The plain design of the flow .docx (#1458): the same content, parts and
// style names as the book design on a neutral A4 page in Arial, with no
// colour, no design element and no embedded font; an unchanged export
// reads back with no edits.

import { beforeAll, describe, expect, it } from 'vitest';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { initTexToOmml } from '../../ommlWrite/index.js';
import type { WordFontPlan } from '../../fonts/types.js';
import type { PostextConfig, Resource } from '../../../types.js';
import { PNG, RESOURCES, resourceBytes } from '../../integration/integration.test-helper.js';
import { CH1, CH2 } from '../../integration/sample.test-helper.js';
import { exportDocx, exportProblems, looseMarkup, sectionsOf, type Exported } from '../fixtures/harness.js';

const hexColor = (hex: string) => ({ hex, model: 'hex' });
const mm = (value: number) => ({ value, unit: 'mm' });
const pt = (value: number) => ({ value, unit: 'pt' });
const at = (y: number) => ({ anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(0), y: mm(y) } });

/** A book with a design of its own: a small two-column page, mirrored
 *  margins, a serif face, colour everywhere, running heads, a filled box
 *  with a label tab, a zebra table and a chapter opener on a band. */
const BOOK = {
  locale: 'en',
  page: { width: mm(170), height: mm(240), margins: { top: mm(20), bottom: mm(22), left: mm(24), right: mm(16), mirror: true }, backgroundColor: hexColor('#fdf6e3') },
  layout: { layoutType: 'double', gutterWidth: mm(5) },
  bodyText: { fontFamily: 'Lora', fontSize: pt(9.5), lineHeight: pt(13), textAlign: 'justify', color: hexColor('#1c2b3a'), firstLineIndent: pt(12), hyphenation: { enabled: true } },
  headings: {
    fontFamily: 'Fraunces',
    color: hexColor('#a03a2c'),
    levels: [
      { level: 1, fontSize: pt(30), breakBefore: { enabled: true, parity: 'odd' }, numberingTemplate: '{1}' },
      { level: 2, fontSize: pt(15), textTransform: 'uppercase', numberingTemplate: '{1}.{2}' },
    ],
  },
  headingStyles: [
    {
      id: 'opener',
      advancedDesign: {
        enabled: true,
        minHeight: mm(70),
        slot: {
          elements: [
            { kind: 'box', id: 'band', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill', height: mm(60) } }, style: { backgroundColor: hexColor('#a03a2c') } },
            { kind: 'text', id: 'kicker', content: '{attr.kicker}', placement: at(5), fontSize: pt(9), color: hexColor('#ffffff') },
            { kind: 'text', id: 'title', content: '{titleText}', placement: at(20), fontSize: pt(30), color: hexColor('#ffffff') },
            { kind: 'text', id: 'credit', content: 'A book of {chapterNumber} parts', placement: at(45), fontSize: pt(8), color: hexColor('#ffffff') },
            { kind: 'image', id: 'art', resourceId: 'cover', placement: at(62) },
          ],
        },
      },
    },
  ],
  header: { elements: [{ kind: 'text', id: 'rh', content: '{chapterTitle}', parity: 'odd', placement: { anchor: { to: 'container', edge: 'top-right' } } }] },
  footer: { elements: [{ kind: 'text', id: 'folio', content: '{pageNumber}', placement: { anchor: { to: 'container', edge: 'bottom-left' } } }] },
  calloutStyles: [
    {
      id: 'note',
      name: 'Note',
      title: 'Note',
      backgroundEnabled: true,
      background: hexColor('#e8f0fa'),
      border: { enabled: true, color: hexColor('#3465a4'), width: pt(1) },
      label: { position: 'top-left', background: hexColor('#3465a4'), color: hexColor('#ffffff') },
      body: { fontFamily: 'Inter', fontSize: pt(8.5), color: hexColor('#204a87') },
    },
  ],
  tableStyle: { rules: 'booktabs', headerBackgroundEnabled: true, headerBackground: hexColor('#3465a4'), headerColor: hexColor('#ffffff'), bodyAlternateBackgroundEnabled: true, bodyAlternateBackground: hexColor('#eef3f8'), bodyFontFamily: 'Inter' },
  captionStyle: { color: hexColor('#555753'), fontFamily: 'Inter' },
  unorderedLists: { bulletChar: '▸', color: hexColor('#a03a2c') },
  footnotes: { color: hexColor('#555753') },
  codeStyle: { fontFamily: 'JetBrains Mono', backgroundEnabled: true, background: hexColor('#f0f0f0'), color: hexColor('#4e9a06') },
} as unknown as PostextConfig;

const MD1 = CH1.replace('# Introduction', '# Introduction {style="opener" kicker="Part one"}')
  .replace(':::callout{type="note"}', ':::callout{type="note" label="Remember"}')
  .replace('Last paragraph of the chapter.', '```js\nconst a = 1;\n```\n\n> A quoted line.\n\nLast paragraph of the chapter.');
const CHAPTERS = [MD1, CH2];

const COVER: Resource = { id: 'cover', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'f1', format: 'png', width: 300, height: 150 } } as Resource;
const TABLE = RESOURCES[1]!;
const TINTED: Resource = { ...TABLE, table: { model: { headerRowCount: 1, rows: TABLE.table!.model.rows.map((row, r) => row.map((c, k) => (r === 1 && k === 0 ? { ...c, background: hexColor('#ffeeaa') } : c))) } } } as Resource;
const ALL = [RESOURCES[0]!, TINTED, COVER];

/** A font plan as the Sandbox gives one: a face to embed. */
const FONTS = { faces: [{ family: 'Lora', bold: false, italic: false, bytes: PNG, fsType: 0 }], families: new Map(), warnings: [] } as unknown as WordFontPlan;

const options = { config: BOOK, resources: ALL, resourceBytes, date: '2026-11-04T00:00:00Z' };
let plain: Exported;
let book: Exported;

beforeAll(async () => {
  await initTexToOmml();
  plain = await exportDocx(CHAPTERS, { ...options, design: 'plain', fonts: FONTS });
  book = await exportDocx(CHAPTERS, { ...options, design: 'book' });
});

const fields = (f: { target: Record<string, unknown> }): string | undefined => {
  const t = f.target as { resourceId?: string; field?: string; row?: number; col?: number };
  const r = ALL.find((x) => x.id === t.resourceId);
  if (t.field === 'cell') return r?.table!.model.rows[t.row!]![t.col!]!.content;
  return t.field === 'caption' ? r?.caption : undefined;
};

/** Every part of the package that Word reads as text. */
const parts = (e: Exported): string => ['word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'word/footnotes.xml', ...Object.keys(e.files).filter((f) => /^word\/(header|footer)\d*\.xml$/.test(f))].map((p) => e.part(p)).join('\n');

const styleOf = (e: Exported, id: string): string => {
  const xml = e.part('word/styles.xml');
  const from = xml.indexOf(`w:styleId="${id}"`);
  return from < 0 ? '' : xml.slice(from, xml.indexOf('</w:style>', from));
};

const styleIds = (e: Exported): string[] => [...e.part('word/styles.xml').matchAll(/w:styleId="([^"]+)"/g)].map((m) => m[1]!);

describe('plain design: a sound package', () => {
  it('validates, keeps its fragments in order and leaves no markup loose', () => {
    expect(exportProblems(plain, CHAPTERS, fields)).toEqual([]);
    expect(looseMarkup(plain.doc)).toEqual([]);
    expect(plain.warnings).toEqual([]);
  });

  it('says in the map which design it was written with', () => {
    expect(plain.map.design).toBe('plain');
    expect(book.map.design).toBe('book');
    expect(plain.map.variant).toBe('semantic');
  });
});

describe('plain design: the page', () => {
  it('is A4 upright with 2.5 cm margins, one column and one section a chapter', () => {
    const sections = sectionsOf(plain.doc, true);
    expect(sections).toHaveLength(CHAPTERS.length);
    for (const s of sections) {
      expect(s).toContain('<w:pgSz w:w="11906" w:h="16838"/>');
      expect(s).toMatch(/<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" /);
      expect(s).not.toContain('w:num=');
      expect(s).not.toContain('<w:titlePg/>');
      expect(s).not.toContain('w:headerReference');
    }
    // A chapter starts a new page, on either side.
    expect(sections[1]).toContain('<w:type w:val="nextPage"/>');
    expect(book.doc).toContain('w:num="2"');
  });

  it('has no running head, a centred page number and no paper colour', () => {
    const settings = plain.part('word/settings.xml');
    expect(settings).not.toContain('mirrorMargins');
    expect(settings).not.toContain('evenAndOddHeaders');
    expect(settings).toContain('<w:autoHyphenation w:val="false"/>');
    expect(Object.keys(plain.files).filter((f) => /^word\/header/.test(f))).toEqual([]);
    const footers = Object.keys(plain.files).filter((f) => /^word\/footer/.test(f));
    expect(footers).toHaveLength(1);
    const footer = plain.part(footers[0]!);
    expect(footer).toContain(' PAGE ');
    expect(footer).toContain('<w:jc w:val="center"/>');
    expect(plain.doc).not.toContain('<w:background');
    expect(book.doc).toContain('<w:background');
  });
});

describe('plain design: type', () => {
  it('names Arial and Courier New and embeds no font', () => {
    const faces = new Set([...parts(plain).matchAll(/w:ascii="([^"]+)"/g)].map((m) => m[1]));
    expect([...faces].sort()).toEqual(['Arial', 'Courier New']);
    // No East Asian face is named: Arial has none, and each reader sets
    // Han, kana and hangul in its own.
    expect(parts(plain)).not.toContain('w:eastAsia="Arial"');
    expect(styleOf(plain, 'Normal')).toContain('<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>');
    expect(Object.keys(plain.files).filter((f) => f.startsWith('word/fonts/'))).toEqual([]);
    expect(plain.part('word/settings.xml')).not.toContain('embedTrueTypeFonts');
  });

  it('sets the body at 11 pt, left, at 1.15 with 6 pt after and no indent', () => {
    const normal = styleOf(plain, 'Normal');
    expect(normal).toContain('<w:sz w:val="22"/>');
    expect(normal).toContain('<w:spacing w:before="0" w:after="120" w:line="276" w:lineRule="auto"/>');
    expect(normal).toContain('<w:jc w:val="left"/>');
    expect(normal).not.toMatch(/w:firstLine="[1-9]/);
    // No other style keeps a leading of the book's.
    expect(plain.part('word/styles.xml')).not.toMatch(/w:lineRule="(atLeast|exact)"/);
  });

  it('sets headings bold in stepped sizes, kept with what follows', () => {
    const sizes = [1, 2, 3].map((n) => Number(/<w:sz w:val="(\d+)"\/>/.exec(styleOf(plain, `Heading${n}`))![1]));
    expect(sizes).toEqual([40, 32, 28]);
    for (const n of [1, 2]) {
      expect(styleOf(plain, `Heading${n}`)).toContain('<w:b/>');
      expect(styleOf(plain, `Heading${n}`)).toContain('<w:keepNext/>');
      expect(styleOf(plain, `Heading${n}`)).not.toContain('<w:caps/>');
    }
    const caption = styleOf(plain, 'Caption');
    expect(caption).toContain('<w:sz w:val="18"/>');
  });

  it('uses no colour and no fill but the writer\'s own greys', () => {
    const xml = parts(plain);
    const inks = new Set([...xml.matchAll(/<w:color w:val="([^"]+)"/g)].map((m) => m[1]));
    // The grey of text kept as source.
    expect([...inks].filter((c) => c !== '595959' && c !== 'auto')).toEqual([]);
    const fills = new Set([...xml.matchAll(/w:fill="([^"]+)"/g)].map((m) => m[1]));
    // Source kept as it is, and an author's highlight.
    expect([...fills].filter((c) => c !== 'EDEDED' && c !== 'D9D9D9' && c !== 'auto')).toEqual([]);
    expect(plain.doc).not.toContain('w:fill=');
    // Rules are black.
    expect([...plain.doc.matchAll(/w:val="single"[^>]*w:color="([^"]+)"/g)].filter((m) => m[1] !== '000000' && m[1] !== 'auto')).toEqual([]);
  });
});

describe('plain design: no design element', () => {
  it('writes no anchored drawing, frame, band or pill', () => {
    expect(plain.doc).not.toContain('<wp:anchor');
    expect(plain.doc).not.toContain('<w:framePr');
    expect(plain.doc).not.toContain('<w:shd ');
    expect(book.doc).toContain('<w:shd ');
  });

  it('keeps the words of the Markdown a heading design prints, not the config\'s', () => {
    const pos = (s: string): number => plain.doc.indexOf(`>${s}<`);
    // The kicker (an attribute) above the title, both shown.
    expect(pos('Part one')).toBeGreaterThan(0);
    expect(pos('Part one')).toBeLessThan(pos('Introduction'));
    expect(plain.frag('Part one').target).toEqual({ kind: 'markdown', chapter: 0 });
    // The design's own words and its cover picture are the book's.
    expect(plain.doc).not.toContain('A book of');
    expect(book.doc).toContain('A book of');
    expect(Object.keys(plain.files).filter((f) => f.startsWith('word/media/'))).toHaveLength(1);
    expect(Object.keys(book.files).filter((f) => f.startsWith('word/media/')).length).toBeGreaterThan(0);
    // The heading keeps its number, and its own style.
    const title = plain.doc.slice(plain.doc.lastIndexOf('<w:p>', pos('Introduction')), pos('Introduction'));
    expect(title).toContain('<w:pStyle w:val="PostextHeadingopener1"/>');
    expect(title).not.toContain('<w:vanish/>');
  });

  it('stands a figure inline and centred, followed by its caption', () => {
    const drawing = plain.doc.indexOf('<w:drawing>');
    const p = plain.doc.slice(plain.doc.lastIndexOf('<w:p>', drawing), drawing);
    expect(p).toContain('<w:pStyle w:val="PostextFigure"/>');
    expect(p).not.toContain('<w:jc ');
    expect(plain.doc.match(/<wp:inline /g)).toHaveLength(1);
    expect(plain.doc.indexOf('>A <', drawing)).toBeGreaterThan(drawing);
    // No wider than the text area (16 cm).
    const cx = Number(/<wp:extent cx="(\d+)"/.exec(plain.doc)![1]);
    expect(cx).toBeLessThanOrEqual(5760000);
  });

  it('shows a box by a thin rule beside it, its label and title in bold', () => {
    const at = plain.doc.indexOf('<w:tag w:val="ptx:box:note"/>');
    expect(at).toBeGreaterThan(0);
    const tbl = plain.doc.slice(at, plain.doc.indexOf('</w:tbl>', at));
    expect(tbl).toContain('<w:top w:val="nil"/><w:left w:val="single" w:sz="6" w:space="0" w:color="000000"/><w:bottom w:val="nil"/><w:right w:val="nil"/>');
    expect(tbl).toContain('>Remember<');
    expect(tbl).toContain('>Note<');
    expect(styleOf(plain, 'PostextBoxTitlenote')).toContain('<w:b/>');
  });

  it('rules a table with thin black lines, its header bold and no cell filled', () => {
    const at = plain.doc.indexOf('<w:tag w:val="ptx:figure:t1"/>');
    const tbl = plain.doc.slice(at, plain.doc.indexOf('</w:tbl>', at));
    for (const side of ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']) expect(tbl).toContain(`<w:${side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`);
    expect(tbl).not.toContain('w:fill=');
    expect(styleOf(plain, 'PostextTableHeaderDefault')).toContain('<w:b/>');
    const bookTable = book.doc.slice(book.doc.indexOf('<w:tag w:val="ptx:figure:t1"/>'));
    expect(bookTable).toContain('w:fill="FFEEAA"');
  });
});

describe('plain design: the same content as the book design', () => {
  it('names its parts with the same styles', () => {
    const ids = new Set(styleIds(book));
    // A design text is named after its place on the band in the book, and
    // by its element alone here.
    expect(styleIds(plain).filter((id) => !ids.has(id))).toEqual([]);
    const used = (e: Exported): string[] => [...new Set([...e.doc.matchAll(/<w:pStyle w:val="([^"]+)"\/>/g)].map((m) => m[1]!))].filter((id) => !/^PostextDesign/.test(id)).sort();
    // The opener's title is set in its heading style here, and in a style
    // based on it under the book's design.
    expect(used(plain)).toEqual([...used(book), 'PostextHeadingopener1'].sort());
    for (const id of ['Heading1', 'Heading2', 'ListParagraph', 'Quote', 'Caption', 'FootnoteText', 'PostextCode', 'PostextEquation', 'PostextFigure', 'PostextBoxnote', 'PostextBoxTitlenote']) expect(styleIds(plain)).toContain(id);
  });

  it('maps the same fragments of the Markdown and the resources', () => {
    const mapped = (e: Exported): string[] => e.map.fragments.filter((f) => f.target.kind !== 'generated').map((f) => `${f.role}|${JSON.stringify(f.target)}|${f.range.join('-')}|${f.text}`);
    expect(mapped(plain)).toEqual(mapped(book));
    // Generated text: the same numbers and labels, less the design's own.
    const made = (e: Exported): string[] => e.map.fragments.filter((f) => f.target.kind === 'generated' && !/^design:/.test(f.role ?? '')).map((f) => `${f.role}|${f.text}`);
    // The chapter number the opener's design prints in a line of its own
    // stands before the title here.
    expect(made(plain)).toEqual(['number|1 ', ...made(book)]);
    expect(plain.map.fragments.length).toBe(book.map.fragments.filter((f) => !/^design:/.test(f.role ?? '')).length + 1);
  });

  it('keeps lists, notes, maths and the content controls native', () => {
    for (const e of [plain, book]) {
      expect(e.doc.match(/<w:numPr>/g)).toHaveLength(4);
      expect(e.doc.match(/<w:footnoteReference /g)).toHaveLength(1);
      expect(e.doc.match(/<m:oMath>/g)!.length).toBeGreaterThanOrEqual(2);
    }
    const tags = (e: Exported): string[] => [...e.doc.matchAll(/<w:tag w:val="(ptx:[^"]+)"\/>/g)].map((m) => m[1]!).filter((t) => !t.startsWith('ptx:design:'));
    expect(tags(plain)).toEqual(tags(book));
    expect(plain.doc.match(/<w:bookmarkStart [^>]*w:name="_ptx_/g)!.length + (plain.part('word/footnotes.xml').match(/w:name="_ptx_/g)?.length ?? 0)).toBe(plain.map.fragments.length);
  });

  it('reads back unchanged, with no edits', () => {
    const chapters = CHAPTERS.map((markdown, i) => ({ id: `ch${i + 1}`, markdown }));
    const r = applyDocxEdits(plain.bytes, { chapters, resources: ALL });
    expect(r.edits).toEqual([]);
    expect(r.changed).toBe(false);
    expect(r.chapters.map((c) => c.markdown)).toEqual(CHAPTERS);
  });
});

describe('plain design: a book with no design of its own', () => {
  it('writes the same fragments as the book design', async () => {
    const a = await exportDocx(CHAPTERS, { resources: ALL, resourceBytes, design: 'plain' });
    const b = await exportDocx(CHAPTERS, { resources: ALL, resourceBytes });
    expect(exportProblems(a, CHAPTERS, fields)).toEqual([]);
    expect(a.map.fragments.map((f) => f.text)).toEqual(b.map.fragments.map((f) => f.text));
    expect(a.map.fragments.length).toBe(b.map.fragments.length);
  });
});

describe('plain design: designs that print no title or a numeral of their own', () => {
  const text = (id: string, content: string, y: number) => ({ kind: 'text', id, content, placement: at(y), fontSize: pt(12) });
  const config = {
    headings: { levels: [{ level: 1, breakBefore: { enabled: true } }] },
    headingStyles: [
      // A cover: the design prints the book's title, never the heading's.
      { id: 'cover', advancedDesign: { enabled: true, slot: { elements: [text('book', 'The Book of Rivers', 30), text('line', '{attr.line}', 60)] } } },
      // An opener: a big numeral, the title under it.
      { id: 'opener', advancedDesign: { enabled: true, slot: { elements: [text('numeral', '{chapterNumber}', 5), text('title', '{titleText}', 30)] } } },
    ],
  } as unknown as PostextConfig;
  const MD = '# Cover {style="cover" line="A field guide"}\n\n# Sources {style="opener"}\n\nWhere a river starts.\n';

  it('shows a title the design leaves out, on no page of its own', async () => {
    const e = await exportDocx(MD, { config, design: 'plain' });
    expect(exportProblems(e, [MD])).toEqual([]);
    const cover = e.doc.slice(e.doc.lastIndexOf('<w:p>', e.doc.indexOf('>Cover<')), e.doc.indexOf('>Cover<'));
    expect(cover).toContain('<w:pageBreakBefore w:val="0"/>');
    expect(cover).not.toContain('<w:vanish/>');
    expect(e.doc).toContain('>A field guide<');
    expect(e.doc).not.toContain('The Book of Rivers');
    // The book design hides the heading and prints the design's words.
    const b = await exportDocx(MD, { config });
    expect(b.doc).toContain('The Book of Rivers');
    expect(b.doc.slice(b.doc.lastIndexOf('<w:p>', b.doc.indexOf('>Cover<')), b.doc.indexOf('>Cover<'))).toContain('<w:vanish/>');
  });

  it('sets the numeral a design prints alone before the title', async () => {
    const e = await exportDocx(MD, { config, design: 'plain' });
    const number = e.map.fragments.find((f) => f.role === 'number');
    expect(number).toMatchObject({ text: '2 ', target: { kind: 'generated' } });
    expect(e.doc.indexOf('>2 <')).toBeLessThan(e.doc.indexOf('>Sources<'));
    const r = applyDocxEdits(e.bytes, { chapters: [{ id: 'ch1', markdown: MD }] });
    expect(r.edits).toEqual([]);
    expect(r.chapters[0]!.markdown).toBe(MD);
  });
});
