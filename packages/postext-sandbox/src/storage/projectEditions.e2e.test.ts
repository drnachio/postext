// #903: a local project keeps every edition of an imported bundle in
// several languages, so the checks across editions, the switcher and the
// side-by-side view (#867) work on projects too. The bundle is written the
// way the Sandbox exports one, read back edition by edition the way the
// import does, and the record it makes is swapped, migrated and checked.

import { beforeAll, describe, expect, it } from 'vitest';
import { buildDocument } from 'postext';
import { layOutEdition } from '../editions/editionLayout.js';
import { FIXTURE_LOCALES, threeEditionsBook, type FixtureLocale } from '../editions/threeEditions.fixture.js';
import { composedChecksOf } from '../warnings/composedChecks.js';
import { buildBundleFiles, parseBundle } from '../presets/bundle.js';
import { openBundleZip, zipBundle } from '../presets/zip.js';
import { bundleContentLocales } from '../presets/locale.js';
import type { LoadedPreset } from '../presets/index.js';
import { newChapter } from '../book/chapterOps.js';
import type { Chapter } from '../book/types.js';
import { contentOfLoaded, editionTitlesOf, projectEditionFields } from './projectEditions.js';
import { migrateProjectRecord, PROJECT_RECORD_VERSION } from './projectMigration.js';
import { allEditionChapters, editionContentOf, editionTitleOf, renamePatch, toSummary, withActiveEdition, type ProjectRecord } from './projects.js';
import { chapterLayoutFromDoc, createBookPlanner } from '../book/pagination.js';
import { composeBookMemo } from '../book/compose.js';
import { LAYOUTS_FILE, localeLayoutsFile, type BundleLayoutsFile } from '../presets/bundle.js';
import type { ChapterLayout } from '../book/types.js';
import type { PostextConfig, Resource } from 'postext';
import type { PostextContent } from 'postext';
import { fontPx } from '../__tests__/fontPx.js';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const px = Number(fontPx(this.font)?.[1] ?? 16);
    return { width: s.length * px * 0.42 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx { return new StubCtx(); }
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

function chaptersOf(locale: FixtureLocale): Chapter[] {
  return threeEditionsBook(locale).chapters.map((c, i) => newChapter(`${locale}-src${i + 1}`, c.title, c.markdown));
}

let record: ProjectRecord;
let counter = 0;

beforeAll(async () => {
  const es = threeEditionsBook('es');
  const built = await buildBundleFiles(
    { id: 'tres', name: 'Tres ediciones', locale: 'es' },
    {
      chapters: chaptersOf('es'),
      config: es.config,
      resources: es.resources,
      localized: Object.fromEntries((['en', 'ca'] as const).map((l) => {
        const book = threeEditionsBook(l);
        return [l, { chapters: chaptersOf(l), config: book.config, resources: book.resources }];
      })),
    },
    { readBlob: async () => PNG.buffer.slice(0) as ArrayBuffer, readFont: async () => null },
  );
  // The archive, read back the way the import reads it.
  const opened = openBundleZip(zipBundle(built.files));
  const read = (locale: string): Promise<LoadedPreset> => parseBundle(opened.manifest, opened.readFile, {
    locale,
    summary: { id: 'tres', name: 'tres', source: 'private', available: true },
    ids: { blob: (f) => `project:p1:${f}`, font: (f) => `project-font:p1:${f}` },
    chapterIds: () => `p1-ch${++counter}`,
    untitledChapter: (n) => `Chapter ${n}`,
  });
  const tags = bundleContentLocales(opened.manifest).locales;
  const picked = await read('es');
  const asides = [];
  for (const tag of tags) if (tag !== picked.locale) asides.push(await read(tag));
  const fields = projectEditionFields(picked, asides, tags);
  record = {
    version: PROJECT_RECORD_VERSION,
    id: 'p1',
    name: 'Tres ediciones',
    locale: picked.locale,
    ...contentOfLoaded(picked),
    ...fields,
    editionsRev: 1,
    createdAt: 1,
    updatedAt: 1,
  } as ProjectRecord;
}, 120_000);

describe('a project imported from a bundle in three languages (#903)', () => {
  it('keeps every edition: the one picked in the record, the others aside, in the bundle\'s order', () => {
    expect(record.locale).toBe('es');
    expect(record.editionLocales).toEqual(['es', 'en', 'ca']);
    expect(Object.keys(record.editions!)).toEqual(['en', 'ca']);
    for (const locale of FIXTURE_LOCALES) {
      const content = editionContentOf(record, locale)!;
      expect(content.chapters.map((c) => c.markdown)).toEqual(threeEditionsBook(locale).chapters.map((c) => c.markdown));
    }
    // Chapters of different editions never share an id (layouts are keyed by it).
    const ids = allEditionChapters(record).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(6);
  });

  it('lists its languages in the summary', () => {
    expect(toSummary(record)).toMatchObject({ locale: 'es', locales: ['es', 'en', 'ca'], editionsRev: 1 });
    const single = { ...record };
    delete single.editions;
    delete single.editionLocales;
    expect(toSummary(single).locales).toBeUndefined();
  });

  it('swaps editions without losing either: the one on screen goes aside as it is', () => {
    const edited = { ...record, chapters: record.chapters.map((c) => ({ ...c, markdown: `${c.markdown}\nEdited.` })) };
    const ca = withActiveEdition(edited, 'ca');
    expect(ca.locale).toBe('ca');
    expect(ca.chapters.map((c) => c.markdown)).toEqual(threeEditionsBook('ca').chapters.map((c) => c.markdown));
    expect(Object.keys(ca.editions!).sort()).toEqual(['en', 'es']);
    expect(ca.editions!.es!.chapters[0]!.markdown.endsWith('Edited.')).toBe(true);
    expect(ca.editionLocales).toEqual(['es', 'en', 'ca']);
    // And back: the Spanish edition is the record's own again, edits kept.
    const es = withActiveEdition(ca, 'es');
    expect(es.locale).toBe('es');
    expect(es.chapters[0]!.markdown.endsWith('Edited.')).toBe(true);
    expect(Object.keys(es.editions!).sort()).toEqual(['ca', 'en']);
    expect(allEditionChapters(es)).toHaveLength(6);
    // The same edition, or one the book lacks: the record itself.
    expect(withActiveEdition(record, 'es')).toBe(record);
    expect(withActiveEdition(record, 'pt')).toBe(record);
    expect(withActiveEdition(record, 'EN').locale).toBe('en');
  });

  it('survives storage: a stored record reads back with its editions', () => {
    const stored = JSON.parse(JSON.stringify(record)) as unknown;
    const back = migrateProjectRecord(stored, { ids: () => 'x', untitled: (n) => `Chapter ${n}` })!;
    expect(back.editionLocales).toEqual(['es', 'en', 'ca']);
    expect(Object.keys(back.editions!)).toEqual(['en', 'ca']);
    expect(back.editions!.ca!.chapters).toHaveLength(2);
    expect(back.editionsRev).toBe(1);
    // A record of one language reads as before.
    const plain = migrateProjectRecord({ ...(stored as object), editions: undefined, editionLocales: undefined }, { ids: () => 'x', untitled: (n) => `Chapter ${n}` })!;
    expect(plain.editions).toBeUndefined();
  });

  it('is exported with every language again (the bundle round trip)', async () => {
    const built = await buildBundleFiles(
      { id: 'tres', name: 'Tres ediciones', locale: record.locale },
      {
        chapters: record.chapters,
        config: record.config,
        resources: record.resources,
        localized: Object.fromEntries(Object.entries(record.editions!).map(([l, e]) => [l, { chapters: e.chapters, config: e.config, resources: e.resources }])),
      },
      { readBlob: async () => PNG.buffer.slice(0) as ArrayBuffer, readFont: async () => null },
    );
    const manifest = built.manifest as { locales?: string[] };
    expect(manifest.locales).toEqual(['es', 'en', 'ca']);
    expect(bundleContentLocales(built.manifest).locales).toEqual(['es', 'en', 'ca']);
  });

  it('is checked in every edition, as a preset is: the same checks on the same frames', async () => {
    const found: string[] = [];
    for (const locale of record.editionLocales!) {
      const content = editionContentOf(record, locale)!;
      const layout = await layOutEdition(
        { locale, chapters: content.chapters, config: content.config, resources: content.resources },
        async (md, config) => buildDocument(md, config),
      );
      for (const c of composedChecksOf(locale, layout.chapters)) {
        // The stand-in's photos past their boxes (#1053), in every edition.
        if (c.warning.payload.kind === 'frameOutsideArea' && c.chapterIndex === 0 && /-fotos$/.test(c.frame ?? '')) continue;
        found.push(`${c.locale}:${c.warning.payload.kind}:${c.chapterIndex}:${c.fenceIndex}:${c.frame ?? ''}`);
      }
    }
    expect(found.sort()).toEqual([
      'ca:frameOverflow:1:0:dinero',
      'en:slotEmpty:0:1:ahorro',
      'es:slotUnknown:0:1:texto',
    ]);
  }, 120_000);
});

// #968: each edition of an exported book has its own title and its own
// pagination.
describe('the title and the pagination of each edition (#968)', () => {
  const NAMES = { es: 'Tres ediciones', en: 'Three editions', ca: 'Tres edicions' } as const;

  /** An edition paginated the way the Sandbox keeps it: one layout record
   *  per chapter, from the planner. */
  async function paginate(chapters: Chapter[], config: PostextConfig, resources: Resource[]): Promise<Record<string, ChapterLayout>> {
    const planner = createBookPlanner();
    const layouts: Record<string, ChapterLayout> = {};
    for (let round = 0; round < chapters.length * 6 + 4; round++) {
      const plan = planner.plan(chapters, config, resources, layouts, undefined);
      const id = plan.pendingChapterId;
      if (id === null) break;
      const chapterPlan = plan.byId[id]!;
      const book = composeBookMemo(chapters, id);
      const content: PostextContent = { markdown: book.markdown, metadata: book.metadata, resources, continuation: chapterPlan.continuation };
      const doc = buildDocument(content, config);
      const target = chapters.find((c) => c.id === id)!;
      const layout = chapterLayoutFromDoc(doc, chapterPlan, { markdown: target.markdown, config, resources });
      if (!layout) break;
      layouts[id] = layout;
    }
    return layouts;
  }

  const readBlob = async () => PNG.buffer.slice(0) as ArrayBuffer;

  it('writes the title of each edition and reads it back per edition', async () => {
    const es = threeEditionsBook('es');
    const built = await buildBundleFiles(
      { id: 'tres', name: NAMES.es, locale: 'es' },
      {
        chapters: chaptersOf('es'),
        config: es.config,
        resources: es.resources,
        localized: Object.fromEntries((['en', 'ca'] as const).map((l) => {
          const book = threeEditionsBook(l);
          return [l, { chapters: chaptersOf(l), config: book.config, resources: book.resources, name: NAMES[l], description: `About ${l}` }];
        })),
      },
      { readBlob, readFont: async () => null },
    );
    const opened = openBundleZip(zipBundle(built.files));
    const titles = editionTitlesOf(opened.manifest, ['es', 'en', 'ca'])!;
    expect(titles.es).toEqual({ name: NAMES.es });
    expect(titles.en).toEqual({ name: NAMES.en, description: 'About en' });
    expect(titles.ca).toEqual({ name: NAMES.ca, description: 'About ca' });
    expect(editionTitlesOf({ not: 'a manifest' }, ['es'])).toBeUndefined();
  });

  it('follows the edition on screen until the reader renames the project', () => {
    const titled: ProjectRecord = {
      ...record,
      name: NAMES.es,
      editionTitles: { es: { name: NAMES.es }, en: { name: NAMES.en, description: 'About en' }, ca: { name: NAMES.ca } },
    };
    const en = withActiveEdition(titled, 'en');
    expect(en.name).toBe(NAMES.en);
    expect(en.description).toBe('About en');
    const ca = withActiveEdition(en, 'ca');
    expect(ca.name).toBe(NAMES.ca);
    expect(ca.description).toBeUndefined();
    expect(toSummary(ca).name).toBe(NAMES.ca);
    expect(withActiveEdition(ca, 'es').name).toBe(NAMES.es);
    // The reader's name wins in every edition.
    const renamed: ProjectRecord = { ...titled, name: 'Mi libro', titleEdited: true };
    for (const locale of ['en', 'ca', 'es']) expect(withActiveEdition(renamed, locale).name).toBe('Mi libro');
    expect(editionTitleOf(titled, 'EN')?.name).toBe(NAMES.en);
    // A project that never had titles keeps its name across a switch.
    expect(withActiveEdition(record, 'en').name).toBe(record.name);
    // Stored and read back.
    const back = migrateProjectRecord(JSON.parse(JSON.stringify(renamed)) as unknown, { ids: () => 'x', untitled: (n) => `Chapter ${n}` })!;
    expect(back.titleEdited).toBe(true);
    expect(back.editionTitles?.en).toEqual({ name: NAMES.en, description: 'About en' });
  });

  it('marks the title as the reader\'s only when a book in several languages changes it', () => {
    const titled = { name: NAMES.es, description: 'About es', editions: record.editions };
    expect(renamePatch(titled, 'Mi libro')).toEqual({ name: 'Mi libro', description: 'About es', titleEdited: true });
    expect(renamePatch(titled, NAMES.es, 'Otra descripción')).toMatchObject({ description: 'Otra descripción', titleEdited: true });
    expect(renamePatch(titled, NAMES.es, '  ')).toMatchObject({ description: undefined, titleEdited: true });
    // The same title again changes nothing.
    expect(renamePatch(titled, NAMES.es, 'About es')).toEqual({ name: NAMES.es, description: 'About es' });
    expect(renamePatch(titled, NAMES.es)).not.toHaveProperty('titleEdited');
    // A book in one language has nothing to follow.
    expect(renamePatch({ name: 'A', description: undefined }, 'B')).toEqual({ name: 'B', description: undefined });
  });

  it('carries one pagination per edition, each valid for its own configuration', async () => {
    // The editions as the Sandbox holds them: read from a bundle.
    const own = editionContentOf(record, 'es')!;
    const esLayouts = await paginate(own.chapters, own.config, own.resources);
    const localized: NonNullable<Parameters<typeof buildBundleFiles>[1]['localized']> = {};
    for (const l of ['en', 'ca'] as const) {
      const e = editionContentOf(record, l)!;
      localized[l] = { chapters: e.chapters, config: e.config, resources: e.resources, layouts: await paginate(e.chapters, e.config, e.resources) };
    }
    const built = await buildBundleFiles(
      { id: 'tres', name: NAMES.es, locale: 'es' },
      { chapters: own.chapters, config: own.config, resources: own.resources, layouts: esLayouts, localized },
      { readBlob, readFont: async () => null },
    );
    expect(Object.keys(built.files).filter((f) => f.startsWith('layouts.')).sort()).toEqual([LAYOUTS_FILE, localeLayoutsFile('ca'), localeLayoutsFile('en')].sort());
    const file = (name: string) => JSON.parse(new TextDecoder().decode(built.files[name]!)) as BundleLayoutsFile;
    // Each file is keyed by the chapter files of its edition.
    expect(Object.keys(file(LAYOUTS_FILE).chapters)).toEqual(Object.keys(file(LAYOUTS_FILE).chapters).filter((p) => p.includes('/es/')));
    expect(Object.keys(file(localeLayoutsFile('ca')).chapters).every((p) => p.includes('/ca/'))).toBe(true);
    expect(file(localeLayoutsFile('en')).configKey).not.toBe(file(localeLayoutsFile('ca')).configKey);

    // Read back, every edition opens paginated.
    const opened = openBundleZip(zipBundle(built.files));
    for (const locale of ['es', 'en', 'ca']) {
      const loaded = await parseBundle(opened.manifest, opened.readFile, {
        locale,
        summary: { id: 'tres', name: 'tres', source: 'private', available: true },
        ids: { blob: (f) => `b:${f}`, font: (f) => `f:${f}` },
        chapterIds: () => `r${locale}${++counter}`,
        untitledChapter: (n) => `Chapter ${n}`,
      });
      expect(loaded.layouts, locale).toBeDefined();
      expect(Object.keys(loaded.layouts!), locale).toHaveLength(loaded.chapters.length);
    }
  }, 120_000);

  it('leaves out the pagination of an edition edited since', async () => {
    const book = threeEditionsBook('ca');
    const chapters = chaptersOf('ca');
    const layouts = await paginate(chapters, book.config, book.resources);
    const edited = chapters.map((c, i) => (i === 0 ? { ...c, markdown: `${c.markdown}\nMore.` } : c));
    const built = await buildBundleFiles(
      { id: 'tres', name: NAMES.es, locale: 'es' },
      { chapters: chaptersOf('es'), config: threeEditionsBook('es').config, resources: threeEditionsBook('es').resources, localized: { ca: { chapters: edited, config: book.config, resources: book.resources, layouts } } },
      { readBlob, readFont: async () => null },
    );
    const ca = JSON.parse(new TextDecoder().decode(built.files[localeLayoutsFile('ca')]!)) as BundleLayoutsFile;
    // The first chapter changed, so its record is not carried; the second may be.
    expect(Object.keys(ca.chapters).some((p) => p.includes('01-'))).toBe(false);
  }, 120_000);
});
