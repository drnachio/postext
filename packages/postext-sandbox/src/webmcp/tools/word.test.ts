import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { readFileSync } from 'node:fs';
import { resetViewerEdits } from '../../editor/viewerEdits.js';
import { runTool, type WebMcpTool } from '../modelContext.js';
import { harness, state } from './testHarness.js';
import { wordTools } from './word.js';

/** The browser storage the templates are kept in. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => { items.set(k, v); },
    removeItem: (k: string) => { items.delete(k); },
    clear: () => items.clear(),
    key: () => null,
    get length() { return items.size; },
  };
}

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: memoryStorage(), addEventListener: () => undefined });
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewerEdits();
});

const base64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

/** A .docx as earlier versions of the Sandbox exported it (it carries the
 *  template it was written with), kept in ../../word/__fixtures__: the
 *  manuscript '# The Harbour … # The Market' (old-harbour), a book of two
 *  chapters with their markers (old-harbour-book), a tracked heading style
 *  (old-lantern). */
function fixture(name: string, fileName: string): { base64: string; fileName: string } {
  const bytes = new Uint8Array(readFileSync(new URL(`../../word/__fixtures__/${name}.docx`, import.meta.url)));
  return { base64: base64(bytes), fileName };
}

function tools(initial: Parameters<typeof harness>[0] = {}) {
  const h = harness(initial);
  const byName = new Map<string, WebMcpTool>(wordTools(h.host).map((t) => [t.name, t]));
  const word = (name: string, args: Record<string, unknown> = {}) => runTool(byName.get(name)!, args) as Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { ...h, word, byName };
}

describe('sandbox_import_word', () => {
  const file = fixture('old-harbour', 'harbour.docx');

  it('is described as a tool that replaces text', () => {
    const { byName } = tools();
    for (const tool of byName.values()) {
      expect(tool.name).toMatch(/^sandbox_[a-z_]+$/);
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
    expect(byName.get('sandbox_import_word')!.annotations).toEqual({ consequentialHint: true, untrustedContentHint: true });
    expect(byName.get('sandbox_import_word')!.description).toMatch(/dryRun: true/);
  });

  it('says on a dry run what the import would do, and changes nothing', async () => {
    const { word, get } = tools();
    const before = get();
    const dry = await word('sandbox_import_word', { file, dryRun: true });
    expect(dry).toMatchObject({ ok: true, dryRun: true, file: 'harbour.docx', destination: 'chapter', chapter: 1, template: { source: 'embedded' } });
    expect(dry.options).toEqual({ lineBreaks: 'break', directFormatting: 'keep', manualHeadings: 0, pageBreaks: 'drop', images: true, tables: true });
    expect(dry.quality.verdict).toBe('clean');
    expect(dry.quality.says).toBe('Well styled: it converts cleanly.');
    expect(dry.quality.paragraphs).toBe(6);
    const becomes = Object.fromEntries(dry.paragraphStyles.map((s: { name: string; becomes: unknown }) => [s.name.toLowerCase(), s.becomes]));
    expect(becomes['heading 1']).toEqual({ kind: 'heading', level: 1 });
    expect(becomes['heading 2']).toEqual({ kind: 'heading', level: 2 });
    expect(dry.paragraphStyles.find((s: { name: string }) => s.name.toLowerCase() === 'heading 1')).toMatchObject({ uses: 2, sample: 'The Harbour' });
    expect(dry.chapters).toHaveLength(1);
    expect(dry.resources).toEqual([]);
    expect(dry.preview).toMatch(/^# The Harbour\n\nA first paragraph with \*emphasis\* in it\./);
    expect(get()).toBe(before);

    const short = await word('sandbox_import_word', { file, dryRun: true, previewCharacters: 13 });
    expect(short.preview).toBe('# The Harbour');
    expect(short.previewOf).toBeGreaterThan(13);
  });

  it('maps a style to something else, and refuses a mapping it cannot use', async () => {
    const { word } = tools();
    const dry = await word('sandbox_import_word', { file, dryRun: true, mapping: { paragraphs: { 'Heading 2': { kind: 'heading', level: 4 }, Epigraph: { kind: 'quote' } } } });
    expect(dry.preview).toMatch(/\n#### Morning\n/);
    expect(dry.notes[0]).toMatch(/mapping names "Epigraph", which the document does not use/);
    expect((await word('sandbox_import_word', { file, dryRun: true, mapping: { paragraphs: { 'heading 2': { kind: 'title' } } } })).error).toMatch(/mapping: the paragraph style\(s\) "heading 2" map to nothing the import knows/);
    expect((await word('sandbox_import_word', { file, dryRun: true, mapping: { paragraphs: { 'heading 2': { kind: 'paragraphs', style: 'lede' } } } })).error).toMatch(/names the paragraph style "lede", which the book does not have/);
    expect((await word('sandbox_import_word', { file, dryRun: true, mapping: { characters: { Emphasis: { kind: 'chip', style: 'nope' } } } })).error).toMatch(/names the chip style "nope"/);
    expect((await word('sandbox_import_word', { file, dryRun: true, template: 'wt-nope' })).error).toMatch(/No saved Word template with id "wt-nope"/);
    expect((await word('sandbox_import_word', { file, dryRun: true, saveTemplateAs: 'House' })).error).toMatch(/A dry run changes nothing/);
    expect((await word('sandbox_import_word', { file: { base64: base64(new TextEncoder().encode('plain text')), fileName: 'notes.doc' } })).error).toMatch(/notes\.doc could not be read as a Word document \(not a zip\)/);
  });

  it('applies the options over the template\'s', async () => {
    const { word } = tools();
    const dry = await word('sandbox_import_word', { file, dryRun: true, template: 'auto', pageBreaks: 'keep', manualHeadings: 3, images: false });
    expect(dry.template).toEqual({ source: 'auto' });
    expect(dry.options).toEqual({ lineBreaks: 'break', directFormatting: 'keep', manualHeadings: 3, pageBreaks: 'keep', images: false, tables: true });
  });

  it('replaces a chapter, as one edit that can be taken back', async () => {
    const { word, call, get } = tools();
    const second = get().chapters[1]!.markdown;
    const done = await word('sandbox_import_word', { file, chapter: 2, wait: false });
    expect(done).toMatchObject({ ok: true, imported: true, destination: 'chapter', chapter: 2, changed: true, resources: [], laidOut: false });
    expect(done.chapters).toEqual([{ chapter: 2, title: 'Second', characters: get().chapters[1]!.markdown.length }]);
    expect(done.undo).toMatch(/sandbox_undo_text/);
    expect(get().chapters[1]!.markdown).toMatch(/^# The Harbour\n/);
    expect(get().chapters[1]!.markdown).toContain('# The Market');
    // The chapter on screen stays the one on screen.
    expect(get().activeChapterId).toBe('a');
    expect(get().chapters).toHaveLength(2);
    expect(await call('sandbox_undo_text', { wait: false })).toMatchObject({ undone: true, chapter: 2 });
    expect(get().chapters[1]!.markdown).toBe(second);
  });

  it('adds the document as new chapters after one', async () => {
    const { word, get } = tools();
    const done = await word('sandbox_import_word', { file, destination: 'append', chapter: 1, wait: false });
    expect(done.chapters.map((c: { chapter: number; title: string }) => [c.chapter, c.title])).toEqual([[2, 'The Harbour'], [3, 'The Market']]);
    expect(done).not.toHaveProperty('undo');
    expect(get().chapters.map((c) => c.title)).toEqual(['Opening', 'The Harbour', 'The Market', 'Second']);
    // The first of them is shown.
    expect(get().activeChapterId).toBe(done.chapters[0].id);
    expect(get().markdown).toMatch(/^# The Harbour\n/);
  });

  it('brings a whole book back as a book', async () => {
    const { word, get } = tools();
    const book = fixture('old-harbour-book', 'harbour.docx');
    // The chapter markers of an export make the book the destination.
    const dry = await word('sandbox_import_word', { file: book, dryRun: true });
    expect(dry.destination).toBe('book');
    expect(dry).not.toHaveProperty('chapter');
    expect(dry.chapters.map((c: { title: string }) => c.title)).toEqual(['One', 'Two']);
    expect((await word('sandbox_import_word', { file: book, chapter: 1 })).error).toMatch(/destination "book" replaces every chapter/);
    const done = await word('sandbox_import_word', { file: book, wait: false });
    expect(done.chapters.map((c: { chapter: number; title: string }) => [c.chapter, c.title])).toEqual([[1, 'One'], [2, 'Two']]);
    expect(get().chapters.map((c) => c.title)).toEqual(['One', 'Two']);
    expect(get().bookVersion).toBe(1);
  });

  it('keeps the mapping it used as a template', async () => {
    const { word } = tools();
    const done = await word('sandbox_import_word', { file, destination: 'append', mapping: { paragraphs: { 'heading 2': { kind: 'heading', level: 3 } } }, saveTemplateAs: ' House ', wait: false });
    expect(done.templateSaved).toMatchObject({ name: 'House' });
    const list = await word('sandbox_word_templates', { action: 'list' });
    expect(list.templates).toHaveLength(1);
    expect(list.lastUsed).toBe(done.templateSaved.id);
    const kept = (await word('sandbox_word_templates', { action: 'get', id: done.templateSaved.id })).template;
    const heading2 = Object.entries(kept.paragraphs).find(([name]) => name.toLowerCase() === 'heading 2')![1];
    expect(heading2).toEqual({ kind: 'heading', level: 3 });
    // Every style of the document is written out.
    expect(Object.keys(kept.paragraphs).map((n) => n.toLowerCase())).toContain('heading 1');

    // The saved template is then the one an import starts from, by its id
    // or as the one last used once the document carries none.
    const again = await word('sandbox_import_word', { file, dryRun: true, template: done.templateSaved.id });
    expect(again.template).toEqual({ source: 'saved', id: done.templateSaved.id, name: 'House' });
    expect(again.preview).toMatch(/\n### Morning\n/);
  });
});

describe('sandbox_word_templates', () => {
  it('keeps, lists, replaces and deletes templates', async () => {
    const { word } = tools();
    expect(await word('sandbox_word_templates', { action: 'list' })).toMatchObject({ ok: true, templates: [] });
    const saved = await word('sandbox_word_templates', { action: 'save', template: { name: 'House', paragraphs: { Lede: { kind: 'quote' } }, options: { pageBreaks: 'keep' } } });
    expect(saved).toMatchObject({ ok: true, replaced: false, saved: { name: 'House', paragraphStyles: 1, characterStyles: 0 } });
    const id = saved.saved.id as string;
    const got = (await word('sandbox_word_templates', { action: 'get', id })).template;
    expect(got).toMatchObject({ id, name: 'House', paragraphs: { Lede: { kind: 'quote' } }, characters: {}, options: { pageBreaks: 'keep', lineBreaks: 'break' } });

    // The file the dialog downloads is taken as it is; the one whose id it
    // carries is replaced.
    const replaced = await word('sandbox_word_templates', { action: 'save', template: { postextWordTemplate: { ...got, characters: { Strong: { kind: 'bold' } } } }, name: 'House 2' });
    expect(replaced).toMatchObject({ replaced: true, saved: { id, name: 'House 2', characterStyles: 1 } });
    const other = await word('sandbox_word_templates', { action: 'save', template: { name: 'Other', characters: {} } });
    const list = await word('sandbox_word_templates', { action: 'list' });
    expect(list.templates.map((t: { name: string }) => t.name)).toEqual(['Other', 'House 2']);
    expect(list.lastUsed).toBe(other.saved.id);

    expect((await word('sandbox_word_templates', { action: 'save', template: { name: 'Bad', paragraphs: { Lede: { kind: 'headline' } } } })).error).toMatch(/the paragraph style\(s\) "Lede" map to nothing the import knows/);
    expect((await word('sandbox_word_templates', { action: 'save', template: { name: 'Empty' } })).error).toMatch(/is not an import template/);
    expect((await word('sandbox_word_templates', { action: 'save', template: { paragraphs: {} } })).error).toMatch(/has no name/);
    expect((await word('sandbox_word_templates', { action: 'get', id: 'wt-nope' })).error).toMatch(/No saved Word template with id "wt-nope"\. The saved ones: .*\(Other\), .*\(House 2\)/);
    expect((await word('sandbox_word_templates', { action: 'delete' })).error).toMatch(/delete needs the id/);

    const deleted = await word('sandbox_word_templates', { action: 'delete', id: other.saved.id });
    expect(deleted.deleted).toMatchObject({ name: 'Other' });
    const after = await word('sandbox_word_templates', { action: 'list' });
    expect(after.templates.map((t: { name: string }) => t.name)).toEqual(['House 2']);
    expect(after).not.toHaveProperty('lastUsed');
  });
});

describe('sandbox_import_word and the character spacing of the Word styles (#951)', () => {
  const em = (value: number) => ({ value, unit: 'em' as const });
  // '# One\n\n# The lantern {style="portada"}\n\nText.\n', written by the
  // earlier writer with the style Portada spaced 0.1 em.
  const file = fixture('old-lantern', 'lantern.docx');
  const bare = { headingStyles: [{ id: 'portada', name: 'Portada' }] };

  it('says on a dry run which styles get spacing and which stay', async () => {
    const { word, get } = tools({ config: { ...state().config, ...bare } });
    const dry = await word('sandbox_import_word', { file, dryRun: true });
    expect(dry.characterSpacing).toEqual({ taken: true, setOn: [{ style: 'Portada', goesTo: 'Portada', em: 0.1 }] });
    expect(get().config.headingStyles).toEqual(bare.headingStyles);
    const off = await word('sandbox_import_word', { file, dryRun: true, characterSpacing: false });
    expect(off.characterSpacing).toMatchObject({ taken: false });
    const own = tools({ config: { ...state().config, headingStyles: [{ id: 'portada', name: 'Portada', letterSpacing: em(0.3) }] } });
    expect((await own.word('sandbox_import_word', { file, dryRun: true })).characterSpacing).toEqual({ taken: false, leftAsTheBookHasIt: [{ style: 'Portada', goesTo: 'Portada', em: 0.1 }] });
  });

  it('puts the spacing on the book\'s styles with the text, and leaves it with characterSpacing false', async () => {
    const withIt = tools({ config: { ...state().config, ...bare } });
    const done = await withIt.word('sandbox_import_word', { file, wait: false });
    expect(done.characterSpacing.setOn).toEqual([{ style: 'Portada', goesTo: 'Portada', em: 0.1 }]);
    expect(withIt.get().config.headingStyles).toEqual([{ id: 'portada', name: 'Portada', letterSpacing: em(0.1) }]);
    expect(withIt.get().chapters[0]!.markdown).toMatch(/^# One\n/);
    for (const destination of ['append', 'book'] as const) {
      const other = tools({ config: { ...state().config, ...bare } });
      await other.word('sandbox_import_word', { file, destination, wait: false });
      expect(other.get().config.headingStyles).toEqual([{ id: 'portada', name: 'Portada', letterSpacing: em(0.1) }]);
    }
    const without = tools({ config: { ...state().config, ...bare } });
    const kept = await without.word('sandbox_import_word', { file, characterSpacing: false, wait: false });
    expect(kept).not.toHaveProperty('characterSpacing');
    expect(without.get().config.headingStyles).toEqual(bare.headingStyles);
  });
});
