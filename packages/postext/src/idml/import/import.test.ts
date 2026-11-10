import { describe, expect, it } from 'vitest';
import { buildBundle } from '../../index.js';
import { build, config, LOREM } from '../../word/formatted/formatted.test-helper.js';
import { analyzeIdml, idmlDocument, importIdml, readIdml } from '../index.js';
import type { Resource } from '../../types.js';
import { parseXml } from './xml.js';
import { renderRuns } from './markdown.js';
import { indesignIdml, pngOf } from './idmlFixture.test-helper.js';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 6 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

type Elements = Array<Record<string, unknown> & { kind: string; content?: string; parity?: string }>;
const elements = (slot: unknown): Elements => ((slot as { elements?: Elements } | undefined)?.elements ?? []);

describe('the XML reader', () => {
  it('keeps processing instructions and decodes entities', () => {
    const root = parseXml('<?xml version="1.0"?><a x="1 &amp; 2"><b>caf&#233; &lt;</b><c><?ACE 18?></c><d/></a>');
    expect(root.attrs.x).toBe('1 & 2');
    expect(root.children[0]).toMatchObject({ name: 'b', children: ['café <'] });
    expect(root.children[1]).toMatchObject({ name: 'c', children: [{ pi: 'ACE 18' }] });
  });
});

describe('inline markup', () => {
  it('keeps punctuation outside the marks of neighbouring runs', () => {
    expect(renderRuns([{ text: 'cursiva', italic: true }, { text: ', una negrita', bold: true }])).toBe('*cursiva*, **una negrita**');
  });
});

describe('importIdml: a document as InDesign writes it', () => {
  const links = new Map([
    ['fig1.tif', new Uint8Array([0x49, 0x49, 42, 0])],
    ['fig1.png', pngOf(800, 600)],
    ['foto suelta.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0])],
  ]);
  const result = importIdml(indesignIdml(), { links, locale: 'es' });
  const [one, two] = result.chapters;

  it('reads the stories in thread order and guesses what each style is', () => {
    const a = result.analysis;
    expect(a.pages).toBe(3);
    expect(a.stories).toEqual(['umain', 'uside']);
    const guess = Object.fromEntries(a.paragraphStyles.map((s) => [s.name, s.guess]));
    expect(guess).toMatchObject({ Texto: 'body', 'Título 1': 'h1', 'Título 2': 'h2', 'Pie de figura': 'caption', Viñeta: 'list', Cita: 'quote', Recuadro: 'box', 'Texto sin sangría': 'style' });
    const chars = Object.fromEntries(a.characterStyles.map((s) => [s.name, s.guess]));
    expect(chars).toMatchObject({ Cursiva: 'italic', 'Destacado rojo': 'auto', Versalitas: 'auto' });
    expect(a.links).toEqual(['fig1.tif', 'foto suelta.jpg']);
    expect([a.tables, a.footnotes]).toEqual([1, 1]);
  });

  it('splits the text into chapters at the first heading level', () => {
    expect(result.chapters.map((c) => c.title)).toEqual(['Capítulo uno', 'Capítulo dos']);
    expect(one!.markdown).toMatch(/^# Capítulo uno\n/);
    expect(one!.markdown).toContain('## Un apartado');
    expect(two!.markdown).toMatch(/^# Capítulo dos\n/);
  });

  it('keeps emphasis, scripts and footnotes, and notes the character styles with a look of their own', () => {
    expect(one!.markdown).toContain('Un texto con *cursiva*, **una negrita** y el CO~2~ con una nota.[^1] Sigue el \\*texto\\*.');
    expect(one!.markdown).toContain('[^1]: La nota al pie.');
    expect(two!.markdown).toContain('Con un **destacado** y unas versalitas.');
    expect(result.notes.find((n) => n.id === 'characterStyles')).toMatchObject({ count: 2, examples: ['Destacado rojo', 'Versalitas'] });
  });

  it('sets lists, quotations, boxes and paragraph styles', () => {
    expect(one!.markdown).toContain('- Primer punto\n- Segundo punto');
    expect(one!.markdown).toContain('> Una cita en cursiva.');
    expect(one!.markdown).toContain(':::callout{type="recuadro"}\nTexto del recuadro.\n:::');
    expect(one!.markdown).toContain(':::paragraphs{style="texto-sin-sangria"}\nPárrafo sin sangría con un enlace.\n:::');
  });

  it('makes a table resource of a table, its header row and spans kept', () => {
    const table = result.resources.find((r) => r.kind === 'table') as Resource & { table: { model: { rows: Array<Array<Record<string, unknown>>>; headerRowCount: number; columnWidths: number[] } } };
    expect(one!.markdown).toContain(`::resource{id="${table.id}"}`);
    const { rows, headerRowCount, columnWidths } = table.table.model;
    expect(headerRowCount).toBe(1);
    expect(columnWidths).toEqual([0.25, 0.75]);
    expect(rows[0]![0]).toMatchObject({ content: 'Fármaco', isHeader: true });
    expect(rows[1]![1]).toMatchObject({ content: '10 mg', background: { hex: '#1e78c8' } });
    expect(rows[2]![0]).toMatchObject({ content: 'Las dos columnas', colSpan: 2 });
    expect(rows[2]![1]).toMatchObject({ hiddenBy: { row: 2, col: 0 } });
  });

  it('places an anchored picture from the links, a TIFF by its screen twin, with its caption', () => {
    const fig = result.resources.find((r) => r.id === 'fig-fig1') as Resource & { bitmap: { fileId: string; width: number; height: number; format: string } };
    expect(one!.markdown).toContain('::resource{id="fig-fig1"}');
    expect(fig.caption).toBe('Un esquema del sistema.');
    expect(fig.bitmap).toMatchObject({ format: 'png', width: 800, height: 600 });
    expect(result.files.get(fig.bitmap.fileId)?.mime).toBe('image/png');
    // The picture loose on a page is in the resources, to place.
    expect(result.resources.some((r) => r.id === 'fig-foto-suelta')).toBe(true);
    expect(result.notes.find((n) => n.id === 'loosePictures')).toMatchObject({ count: 1, examples: ['foto suelta.jpg'] });
  });

  it('takes the page, margins, columns and palette', () => {
    const c = result.config;
    expect(c.locale).toBe('es');
    expect(c.page).toMatchObject({ width: { value: 170, unit: 'mm' }, height: { value: 240, unit: 'mm' }, margins: { top: { value: 20 }, bottom: { value: 25 }, left: { value: 20 }, right: { value: 15 }, mirror: true } });
    expect(c.layout).toMatchObject({ layoutType: 'double', gutterWidth: { value: 14.17 } });
    expect(c.colorPalette!.map((p) => p.name)).toEqual(['Rojo editorial', 'PANTONE 286 C', 'Azul web']);
    // A spot swatch comes in as its CMYK equivalent, and is noted.
    expect(c.colorPalette![1]!.value).toMatchObject({ model: 'cmyk', cmyk: { c: 100, m: 66, y: 0, k: 2 } });
    expect(result.notes.find((n) => n.id === 'spotSwatches')).toMatchObject({ examples: ['PANTONE 286 C'] });
    expect(c.colorPalette![0]!.value).toMatchObject({ model: 'cmyk', cmyk: { c: 0, m: 100, y: 80, k: 5 } });
  });

  it('makes the body, the heading levels and the named paragraph styles', () => {
    const c = result.config;
    expect(c.bodyText).toMatchObject({ fontFamily: 'Minion Pro', fontSize: { value: 10 }, lineHeight: { value: 12.5 }, textAlign: 'justify', firstLineIndent: { value: 12 }, hyphenation: { enabled: true } });
    expect(c.headings!.levels![0]).toMatchObject({ level: 1, fontFamily: 'Myriad Pro', fontSize: { value: 20 }, lineHeight: { value: 24 }, fontWeight: 700, marginTop: { value: 24 }, color: { paletteId: 'rojo-editorial' } });
    expect(c.headings!.levels![1]).toMatchObject({ level: 2, fontWeight: 600, italic: true });
    expect(c.paragraphStyles).toEqual([{ id: 'texto-sin-sangria', name: 'Texto sin sangría', firstLineIndent: { value: 0, unit: 'pt' } }]);
    // The box's ground is a 20 % tint of the RGB blue.
    expect(c.calloutStyles![0]).toMatchObject({ id: 'recuadro', backgroundEnabled: true, background: { hex: '#d2e4f4' } });
  });

  it('makes the header and footer of the master spread', () => {
    const header = elements(result.config.header);
    const footer = elements(result.config.footer);
    expect(header.find((e) => e.kind === 'text')).toMatchObject({ content: '{chapterTitle}', parity: 'odd', italic: true, align: 'right', placement: { anchor: { to: 'page', edge: 'top-right' }, offset: { x: { value: -42.52 }, y: { value: 30 } } } });
    expect(header.find((e) => e.kind === 'rule')).toMatchObject({ direction: 'horizontal', thickness: { value: 0.5 }, placement: { offset: { x: { value: 56.69 } }, size: { width: { value: 382.68 } } } });
    expect(header.find((e) => e.kind === 'box')).toMatchObject({ parity: 'odd', style: { backgroundColor: { paletteId: 'pantone-286-c' } } });
    expect(footer.map((e) => [e.content, e.parity])).toEqual([['{pageNumber}', 'even'], ['Página {pageNumber} {{de}}', 'odd']]);
    expect(result.notes.find((n) => n.id === 'masterItems')).toMatchObject({ count: 1, examples: ['Polygon'] });
  });

  it('lays out as a book', () => {
    const docs = buildBundle({ chapters: result.chapters, config: result.config, resources: result.resources });
    expect(docs.length).toBe(2);
    expect(docs[0]!.pages.length).toBeGreaterThan(0);
  });

  it('takes the roles it is given, and reports the pictures without their files', () => {
    const doc = readIdml(indesignIdml());
    const styles = Object.fromEntries(analyzeIdml(doc).paragraphStyles.map((s) => [s.name, s.self]));
    const chars = Object.fromEntries(analyzeIdml(doc).characterStyles.map((s) => [s.name, s.self]));
    const r = importIdml(indesignIdml(), { paragraphRoles: { [styles['Texto sin sangría']!]: 'body', [styles['Título 2']!]: 'skip' }, characterRoles: { [chars.Cursiva!]: 'plain' } });
    expect(r.chapters[0]!.markdown).toContain('\n\nPárrafo sin sangría con un enlace.\n\n');
    expect(r.chapters[0]!.markdown).not.toContain('Un apartado');
    expect(r.chapters[0]!.markdown).toContain('Un texto con cursiva, **una negrita**');
    expect(r.notes.find((n) => n.id === 'missingLinks')).toMatchObject({ count: 2 });
    // A loose picture without its file is missing, not loose.
    expect(r.notes.some((n) => n.id === 'loosePictures')).toBe(false);
    // Its place is kept: the warnings panel names the missing resource.
    expect(r.chapters[0]!.markdown).toContain('::resource{id="fig-fig1"}');
  });

  it('reports a file that is not an IDML package', () => {
    expect(() => importIdml(new Uint8Array([1, 2, 3]))).toThrow(/not an IDML package/);
  });
});

describe('importIdml: a book written by idmlDocument comes back', () => {
  const BLUE = { hex: '#1d4f91', model: 'cmyk' as const, cmyk: { c: 95, m: 65, y: 0, k: 5 } };
  const cfg = config({ colorPalette: [{ id: 'blue', name: 'House blue', value: BLUE }], headings: { levels: [{ level: 1, color: { ...BLUE, paletteId: 'blue' } }] } } as never);
  const { bytes } = idmlDocument({ docs: [build(`# A chapter\n\nA *first* paragraph. ${LOREM}\n\n## A section\n\n${LOREM}`, cfg)] });
  const back = importIdml(bytes);

  it('has its chapter, its headings and its emphasis', () => {
    expect(back.chapters.map((c) => c.title)).toEqual(['A chapter']);
    expect(back.chapters[0]!.markdown).toMatch(/^# A chapter\n\nA \*first\* paragraph\. Typesetting/);
    expect(back.chapters[0]!.markdown).toContain('## A section');
    expect(back.analysis.paragraphStyles.map((s) => [s.name, s.guess])).toEqual([['Body', 'body'], ['Heading 1', 'h1'], ['Heading 2', 'h2']]);
  });

  it('has its page size and its palette', () => {
    expect(back.config.page).toMatchObject({ width: { value: 140, unit: 'mm' }, height: { value: 200, unit: 'mm' } });
    expect(back.config.colorPalette).toEqual([{ id: 'house-blue', name: 'House blue', value: expect.objectContaining({ model: 'cmyk', cmyk: BLUE.cmyk }) }]);
  });

  it('lays out again', () => {
    expect(buildBundle({ chapters: back.chapters, config: back.config, resources: back.resources }).length).toBe(1);
  });
});
