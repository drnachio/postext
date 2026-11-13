import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomFontFamily, PostextConfig, VDTDocument } from 'postext';
import type { ProjectRecord } from '../storage/projects.js';

// The compiler's core as it runs in its worker (#1526), its stores and
// its layout stubbed: what it reads, what it leaves alone.

const record = vi.hoisted(() => ({ current: null as unknown }));
const layouts = vi.hoisted(() => ({ get: vi.fn(async () => ({})), put: vi.fn(async () => undefined) }));
vi.mock('../storage/projects.js', async (original) => ({ ...(await original<object>()), getProject: vi.fn(async () => record.current) }));
vi.mock('../storage/layouts.js', async (original) => ({ ...(await original<object>()), getChapterLayouts: layouts.get, putChapterLayouts: layouts.put }));
vi.mock('../storage/blobStore.js', async (original) => ({ ...(await original<object>()), getBlob: vi.fn(async () => null) }));
vi.mock('../epub/inputs.js', async (original) => ({ ...(await original<object>()), collectEpubFonts: vi.fn(async () => ({ fonts: [], withheld: [], stoodIn: [] })) }));
const doc = { pages: [{}, {}], config: { page: { dpi: 96 } } } as unknown as VDTDocument;
vi.mock('../book/paginate.js', () => ({ paginateBook: vi.fn(async ({ onChapter }: { onChapter: (d: number, t: number) => void }) => { onChapter(1, 1); return { plan: {} }; }) }));
vi.mock('../book/printChain.js', () => ({ layOutBookPrint: vi.fn(async ({ onChapter }: { onChapter: (d: number, t: number) => void }) => { onChapter(1, 1); return [doc]; }) }));
vi.mock('postext', async (original) => ({ ...(await original<object>()), renderHtmlBook: vi.fn((_docs: unknown, o: { title: string; lang: string }) => `<title>${o.title}</title><html lang="${o.lang}">`) }));

const { compileBook, compiledBaseName } = await import('./compileBook.js');
const { compiledEdition } = await import('./edition.js');
const { customFontsSignature, setCustomFonts } = await import('../controls/fonts/fontLoader.js');

const family = (name: string): CustomFontFamily => ({ name, variants: [{ weight: 400, style: 'normal', fileId: `${name}.ttf`, format: 'ttf' }] });
const chapter = (id: string, markdown: string) => ({ id, title: id, markdown });

function book(): ProjectRecord {
  return {
    version: 1,
    id: 'p1',
    name: 'Mi libro',
    locale: 'es',
    config: { locale: 'es', customFonts: [family('Licensed Serif')] } as PostextConfig,
    chapters: [chapter('es-1', '# Uno')],
    resources: [],
    editions: { en: { config: { locale: 'en', customFonts: [family('Licensed Serif')] } as PostextConfig, chapters: [chapter('en-1', '# One')], resources: [] } },
    editionTitles: { es: { name: 'Mi libro' }, en: { name: 'My book' } },
    createdAt: 0,
    updatedAt: 0,
  } as unknown as ProjectRecord;
}

const host = () => {
  const service = { build: vi.fn(), dispose: vi.fn() };
  const phases: string[] = [];
  return {
    service,
    phases,
    host: {
      onProgress: (p: { phase: string }) => { phases.push(p.phase); },
      rasterizeSvg: async () => null,
      layoutService: () => service as never,
    },
  };
};

beforeEach(() => {
  record.current = book();
  layouts.get.mockClear();
  layouts.put.mockClear();
});

describe('compiledBaseName', () => {
  it('takes the title, letters and digits of any script kept', () => {
    expect(compiledBaseName('El ingenioso hidalgo')).toBe('El-ingenioso-hidalgo');
    expect(compiledBaseName('紅樓夢 第一回')).toBe('紅樓夢-第一回');
    expect(compiledBaseName('  «Cuentos»: 2.ª edición ')).toBe('Cuentos-2-ª-edición');
    expect(compiledBaseName('***')).toBe('book');
  });
});

describe('compiledEdition', () => {
  it('takes the edition asked for, with its own title', () => {
    const edition = compiledEdition(book(), 'EN', 'fr');
    expect(edition?.locale).toBe('EN');
    expect(edition?.content.chapters[0]!.id).toBe('en-1');
    expect(edition?.name).toBe('My book');
  });

  it('takes the edition the book opens with when none is asked for', () => {
    const edition = compiledEdition(book(), undefined, 'fr');
    expect(edition?.locale).toBe('es');
    expect(edition?.content.chapters[0]!.id).toBe('es-1');
  });

  it('refuses a language the book has no edition in, and keeps a title the reader gave the book', () => {
    expect(compiledEdition(book(), 'de', 'fr')).toBeNull();
    expect(compiledEdition({ ...book(), titleEdited: true, name: 'Renamed' } as ProjectRecord, 'en', 'fr')?.name).toBe('Renamed');
  });

  it('reads a book that names no language as the interface language', () => {
    const plain = { ...book(), locale: undefined, editions: undefined, config: {} as PostextConfig } as ProjectRecord;
    expect(compiledEdition(plain, undefined, 'fr')?.locale).toBe('fr');
    expect(compiledEdition(plain, 'fr', 'fr')?.content.chapters[0]!.id).toBe('es-1');
  });
});

describe('compileBook (#1526)', () => {
  it('lays the edition out with its own fonts, in its realm, and writes the HTML page', async () => {
    setCustomFonts([family('Open Book Face')], { newBook: true });
    const { host: h, service, phases } = host();
    const out = await compileBook({ projectId: 'p1', format: 'html', locale: 'en', uiLocale: 'fr', epubLayout: 'fixed', profileBaseUrl: 'https://example.test/icc/' }, h);
    expect(new TextDecoder().decode(out.bytes)).toBe('<title>My book</title><html lang="en">');
    expect(out).toMatchObject({ fileName: 'My-book.html', locale: 'en', pages: 2, warnings: [] });
    // The registry of the realm it runs in (the compile worker's) is the
    // compiled book's: the page's is never set (see compileClient.test).
    expect(customFontsSignature()).toBe(customFontsSignature([family('Licensed Serif')]));
    expect(phases).toEqual(['paginate', 'layout', 'inputs', 'documents']);
    expect(service.dispose).toHaveBeenCalledOnce();
  });

  it('reads the stored layouts of the edition and never writes them', async () => {
    const { host: h } = host();
    await compileBook({ projectId: 'p1', format: 'html', uiLocale: 'fr', epubLayout: 'fixed', profileBaseUrl: 'https://example.test/icc/' }, h);
    expect(layouts.get).toHaveBeenCalledWith(['es-1']);
    expect(layouts.put).not.toHaveBeenCalled();
  });

  it('fails on a book that is gone or an edition it lacks, its layout service ended', async () => {
    const { host: h, service } = host();
    await expect(compileBook({ projectId: 'p1', format: 'pdf', locale: 'de', uiLocale: 'fr', epubLayout: 'fixed', profileBaseUrl: '' }, h)).rejects.toThrow(/no edition in "de"/);
    record.current = null;
    await expect(compileBook({ projectId: 'p1', format: 'pdf', uiLocale: 'fr', epubLayout: 'fixed', profileBaseUrl: '' }, h)).rejects.toThrow(/not found/);
    expect(service.dispose).not.toHaveBeenCalled();
  });
});
