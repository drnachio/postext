// #1700: in a book in several languages, a tool that changes the design
// writes where the Design panel's scope says, as sandbox_set_config does:
// with the panel on every language, into the settings every edition
// reads, the edition on screen keeping only what it had of its own.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mergeConfigLayers, sameConfig } from 'postext';
import type { PostextConfig, Resource } from 'postext';
import type { SandboxState } from '../../context/SandboxContext.js';
import { resetViewerEdits } from '../../editor/viewerEdits.js';
import { setActiveHistory } from '../../history/sandboxHistory.js';
import { MAP_NOTES_CONFIG, MAP_NOTES_MARKDOWN, MAP_NOTES_RESOURCES } from '../../templates/mapNotes.fixture.js';
import { RESHAPE_CONFIG, RESHAPE_RESOURCES, oneOffPage } from '../../templates/reshape.fixture.js';
import { chapter, harness } from './testHarness.js';

afterEach(() => {
  setActiveHistory(null);
  resetViewerEdits();
});

const mm = (value: number) => ({ value, unit: 'mm' as const });

/** What the edition on screen sets of its own. */
const OWN = { locale: 'es', bodyText: { fontFamily: 'Lora' } };
const OWN_FIELDS = ['bodyText.fontFamily', 'locale'];

type Book = Partial<SandboxState> & { config: PostextConfig };

/** `book` as the Spanish edition of a book in several languages: its
 *  design the general settings, with a typeface of its own over them. */
function editions(book: Book, scope: 'all' | 'edition' = 'all'): Partial<SandboxState> {
  return { ...book, config: mergeConfigLayers(book.config, OWN), configLayers: { shared: book.config, scope } };
}

type Harness = ReturnType<typeof harness>;

/** The change went to every language: the general settings changed, and
 *  the edition is still them and what it had of its own, nothing more. */
async function wentToAll({ call, get }: Harness, before: PostextConfig): Promise<PostextConfig> {
  const shared = get().configLayers!.shared;
  expect(sameConfig(shared, before)).toBe(false);
  expect(sameConfig(get().config, mergeConfigLayers(shared, OWN))).toBe(true);
  expect([...(await call('sandbox_get_config', {})).ownFields].sort()).toEqual(OWN_FIELDS);
  return shared;
}

const map = (): Book => {
  const chapters = [chapter('a', 'Map', MAP_NOTES_MARKDOWN)];
  return { chapters, markdown: chapters[0]!.markdown, activeChapterId: 'a', config: MAP_NOTES_CONFIG, resources: MAP_NOTES_RESOURCES };
};

const BOXES: PostextConfig = {
  calloutStyles: [{ id: 'note', name: 'Note' }, { id: 'caja', name: 'Caja', background: { hex: '#eeeeee', model: 'hex' } }, { id: 'hija', extends: 'caja' }],
  tableStyles: [{ id: 'plain' }],
  colorPalette: [{ id: 'ink', name: 'Ink', value: { hex: '#123456', model: 'hex' } }],
  bodyText: { color: { hex: '#000000', model: 'hex', paletteId: 'ink' } },
  chapterStyles: [{ id: 'appendix', name: 'Appendix', config: { layout: { layoutType: 'double' } } }],
  pageTemplates: [
    {
      id: 'tema',
      frames: [
        { name: 'texto', flow: true, placement: { anchor: { to: 'container', edge: 'top-left' } } },
        { name: 'caja', style: 'caja', placement: { anchor: { to: '#texto', edge: 'below' }, offset: { y: mm(6) } } },
      ],
    },
  ],
};

const boxes = (config: PostextConfig = BOXES): Book => {
  const chapters = [
    chapter('a', 'Topic', '::::page{template="tema"}\n# Money\n\nWords here.\n\n:::frame{slot="caja"}\nBoxed.\n:::\n::::\n'),
    chapter('b', 'Boxes', '# Boxes\n\n:::callout{type="caja"}\nInside.\n:::\n'),
  ];
  return { chapters, markdown: chapters[0]!.markdown, activeChapterId: 'a', config };
};

describe('sandbox_edit_labels in a book in several languages', () => {
  const pointer = { action: 'pointer', template: 'parts', from: 'n1', toFrame: 'map', anchor: 'title', wait: false };

  it('writes a pointer into the settings every edition reads, so the panel lists it', async () => {
    const h = harness(editions(map()));
    const added = await h.call('sandbox_edit_labels', pointer);
    expect(added).toMatchObject({ scope: 'all', pointer: 'pointer-n1-title' });
    const shared = await wentToAll(h, MAP_NOTES_CONFIG);
    expect(shared.pageTemplates!.find((t) => t.id === 'parts')!.decoration!.elements).toHaveLength(1);
    // What the panel reads on every language: the pointer is set, not only
    // in effect.
    const read = await h.call('sandbox_get_config', { path: 'pageTemplates[id=parts].decoration.elements' });
    expect(read.set).toHaveLength(1);

    expect((await h.call('sandbox_undo', {})).ok).toBe(true);
    expect(h.get().configLayers!.shared).toEqual(MAP_NOTES_CONFIG);
    expect(h.get().config.pageTemplates).toEqual(MAP_NOTES_CONFIG.pageTemplates);
  });

  it('writes it into the edition on screen alone with the panel on that edition', async () => {
    const h = harness(editions(map(), 'edition'));
    expect((await h.call('sandbox_edit_labels', pointer)).scope).toBe('edition');
    expect(h.get().configLayers!.shared).toEqual(MAP_NOTES_CONFIG);
    expect(h.get().config.pageTemplates!.find((t) => t.id === 'parts')!.decoration!.elements).toHaveLength(1);
  });

  it('says nothing of a scope in a book in one language', async () => {
    const added = await harness(map()).call('sandbox_edit_labels', pointer);
    expect('scope' in added).toBe(false);
  });
});

describe('the design-item tools in a book in several languages', () => {
  it('rename a box style for every language, with its uses', async () => {
    const h = harness(editions(boxes()));
    const done = await h.call('sandbox_rename_design_item', { list: 'calloutStyles', id: 'caja', to: 'box', wait: false });
    expect(done).toMatchObject({ scope: 'all', renamed: 'caja', to: 'box' });
    const shared = await wentToAll(h, BOXES);
    expect(shared.calloutStyles!.map((s) => s.id)).toEqual(['note', 'box', 'hija']);
    expect(shared.pageTemplates![0]!.frames![1]!.style).toBe('box');
  });

  it('rename a table style, a page template and a frame for every language', async () => {
    const table = { id: 't1', kind: 'table', table: { rows: [], styleId: 'plain' }, createdAt: 1, updatedAt: 1 } as unknown as Resource;
    const h = harness(editions({ ...boxes(), resources: [table] }));
    await h.call('sandbox_rename_design_item', { list: 'tableStyles', id: 'plain', to: 'ruled', wait: false });
    expect((await wentToAll(h, BOXES)).tableStyles![0]!.id).toBe('ruled');
    await h.call('sandbox_rename_design_item', { list: 'pageTemplates', id: 'tema', to: 'topic', wait: false });
    await h.call('sandbox_rename_design_item', { list: 'templateFrames', template: 'topic', id: 'caja', to: 'aside', wait: false });
    const shared = await wentToAll(h, BOXES);
    expect(shared.pageTemplates![0]!.id).toBe('topic');
    expect(shared.pageTemplates![0]!.frames!.map((f) => f.name)).toEqual(['texto', 'aside']);
  });

  it('remove a box style and a palette colour for every language', async () => {
    const h = harness(editions(boxes()));
    expect((await h.call('sandbox_remove_design_item', { list: 'calloutStyles', id: 'caja', wait: false })).scope).toBe('all');
    expect((await wentToAll(h, BOXES)).calloutStyles!.map((s) => s.id)).toEqual(['note', 'hija']);
    await h.call('sandbox_remove_design_item', { list: 'colorPalette', id: 'ink', wait: false });
    const shared = await wentToAll(h, BOXES);
    expect(shared.colorPalette).toBeUndefined();
    expect(shared.bodyText!.color).toEqual({ hex: '#123456', model: 'hex' });
  });

  it('apply a language\'s defaults for every language, the language itself staying the edition\'s', async () => {
    const h = harness(editions(boxes({})));
    const applied = await h.call('sandbox_language_defaults', { language: 'chinese', locale: 'zh-Hans', vertical: false, apply: true, wait: false });
    expect(applied).toMatchObject({ scope: 'all', undoSteps: 1 });
    const shared = h.get().configLayers!.shared;
    expect(shared.locale).toBeUndefined();
    expect(Object.keys(shared).length).toBeGreaterThan(0);
    expect(h.get().config.locale).toBe('zh-Hans');
    await h.call('sandbox_undo');
    expect(h.get().configLayers!.shared).toEqual({});
    expect(h.get().config.locale).toBe('es');
  });

  it('keep a page\'s layout as a template, and take the print profile away, for every language', async () => {
    const h = harness(editions(boxes({ ...BOXES, print: { outputProfile: 'custom', customProfile: { name: 'Press', fileId: 'f1' } } })));
    const before = h.get().configLayers!.shared;
    expect((await h.call('sandbox_save_layout_as_template', { chapter: 1 })).scope).toBe('all');
    expect((await wentToAll(h, before)).pageTemplates!.map((t) => t.id)).toEqual(['tema', 'tema-layout']);
    expect((await h.call('sandbox_print_profile', { remove: true, wait: false })).scope).toBe('all');
    expect((await wentToAll(h, before)).print).toBeUndefined();
  });
});

describe('the guides of sandbox_set_view in a book in several languages', () => {
  it('are switched for every language, as the Design panel switches them', async () => {
    const h = harness(editions(boxes()));
    await h.call('sandbox_set_view', { guides: { baselineGrid: true, looseLines: true } });
    const shared = await wentToAll(h, BOXES);
    expect(shared.page!.baselineGrid!.enabled).toBe(true);
    expect(shared.debug!.looseLineHighlight!.enabled).toBe(true);
  });
});

describe('the chapter-style tools in a book in several languages', () => {
  it('make, rename and remove a style for every language', async () => {
    const h = harness(editions(boxes()));
    expect(await h.call('sandbox_chapter_styles', { action: 'create', name: 'Glossary' })).toMatchObject({ scope: 'all', created: 'glossary' });
    expect((await wentToAll(h, BOXES)).chapterStyles!.map((s) => s.id)).toEqual(['appendix', 'glossary']);
    expect((await h.call('sandbox_chapter_styles', { action: 'rename', style: 'glossary', name: 'Terms' })).scope).toBe('all');
    expect((await h.call('sandbox_chapter_styles', { action: 'remove', style: 'appendix' })).scope).toBe('all');
    expect((await wentToAll(h, BOXES)).chapterStyles).toEqual([{ id: 'glossary', name: 'Terms', config: {} }]);
  });
});

describe('the module and frame-style tools in a book in several languages', () => {
  it('turn frames into a grid and into a module for every language', async () => {
    const chapters = [chapter('a', 'River', oneOffPage())];
    const h = harness(editions({ chapters, markdown: chapters[0]!.markdown, activeChapterId: 'a', config: RESHAPE_CONFIG, resources: RESHAPE_RESOURCES }));
    await h.call('sandbox_frames_to_grid', { template: 'rio', frames: ['foto1', 'pie1', 'foto2', 'pie2', 'foto3', 'pie3', 'foto4', 'pie4', 'foto5', 'pie5'], wait: false });
    expect((await wentToAll(h, RESHAPE_CONFIG)).pageTemplates![0]!.groups![0]).toMatchObject({ kind: 'grid' });
    expect((await h.call('sandbox_extract_module', { template: 'rio', frames: ['nota', 'imagen'], name: 'Caja', wait: false })).scope).toBe('all');
    const shared = await wentToAll(h, RESHAPE_CONFIG);
    expect(shared.pageTemplates!.map((t) => t.id)).toContain('caja');
    await h.call('sandbox_rename_module', { module: 'caja', to: 'box', wait: false });
    expect((await wentToAll(h, RESHAPE_CONFIG)).pageTemplates!.map((t) => t.id)).toContain('box');
    await h.call('sandbox_create_module', { name: 'Nota' });
    await h.call('sandbox_insert_module', { module: 'nota', chapter: 1, page: 1, wait: false });
    expect((await wentToAll(h, RESHAPE_CONFIG)).pageTemplates!.map((t) => t.id)).toContain('nota');
  });

  it('merge the box styles that look alike for every language', async () => {
    const pad = (v: number) => ({ top: mm(v), right: mm(v), bottom: mm(v), left: mm(v) });
    const config: PostextConfig = {
      calloutStyles: [
        { id: 'note', name: 'Note', border: { enabled: true }, stripe: { enabled: true } },
        { id: 'caja-a', background: { hex: '#fde9d9', model: 'hex' }, padding: pad(4) },
        { id: 'caja-b', background: { hex: '#fde9d9', model: 'hex' }, padding: pad(6) },
      ],
      pageTemplates: [{ id: 'tema', frames: [{ name: 'texto', flow: true }, { name: 'dinero', style: 'caja-b' }] }],
    };
    const chapters = [
      chapter('a', 'One', ':::callout{type="caja-a"}\nUno.\n:::\n\n:::callout{type="caja-a"}\nDos.\n:::\n'),
      chapter('b', 'Two', '::::page{template="tema"}\n# Tema\n::::\n\n:::callout{type="caja-b"}\nTres.\n:::\n'),
    ];
    const h = harness(editions({ chapters, markdown: chapters[0]!.markdown, config }));
    expect(await h.call('sandbox_merge_styles', { all: true, wait: false })).toMatchObject({ scope: 'all', merged: ['caja-b'] });
    const shared = await wentToAll(h, config);
    expect(shared.calloutStyles!.map((s) => s.id)).toEqual(['note', 'caja-a']);
    expect(shared.pageTemplates![0]!.frames![1]!.style).toBe('caja-a');
  });
});

describe('a check\'s fix in a book in several languages', () => {
  type Fixture = (locale: 'es' | 'en') => { markdown: string; config: PostextConfig; resources: Resource[] };
  let page8Fixture: Fixture;
  beforeAll(async () => {
    page8Fixture = ((await import(/* @vite-ignore */ new URL('../../../../postext/src/__tests__/composed/fixtures/page8.ts', import.meta.url).href)) as { page8Fixture: Fixture }).page8Fixture;
  });

  it('changes the template for every language, and the frame fits', async () => {
    const fixture = page8Fixture('en');
    const tpl = fixture.config.pageTemplates![0]!;
    const config: PostextConfig = {
      ...fixture.config,
      pageTemplates: [{ ...tpl, frames: tpl.frames!.map((f) => (f.name === 'dinero' ? { ...f, height: mm(36), minHeight: undefined } : f)) }],
    };
    const extra = Array.from({ length: 4 }, (_, i) => `More money ${i} `.repeat(30).trim()).join('\n\n');
    const markdown = fixture.markdown.replace(/(:::frame\{slot="dinero"[^\n]*\n)/, `$1${extra}\n\n`);
    const chapters = [chapter('p8', 'Page 8', markdown)];
    const h = harness(editions({ chapters, activeChapterId: 'p8', markdown, config, resources: fixture.resources }));
    const general = h.get().configLayers!.shared;
    const done = await h.call('sandbox_apply_proposal', { frame: 'dinero', proposal: 'allowShrink' });
    expect(done).toMatchObject({ ok: true, changed: true, scope: 'all', fits: true });
    const shared = await wentToAll(h, general);
    expect(shared.pageTemplates![0]!.frames!.find((f) => f.name === 'dinero')!.fit).toBeDefined();
    await h.call('sandbox_undo');
    expect(sameConfig(h.get().configLayers!.shared, general)).toBe(true);
  });
});
