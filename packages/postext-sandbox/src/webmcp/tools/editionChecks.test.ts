import { describe, expect, it } from 'vitest';
import type { Chapter } from '../../book/types.js';
import { FIXTURE_LOCALES, threeEditionsBook, type FixtureLocale } from '../../editions/threeEditions.fixture.js';
import type { LoadedPreset, PresetProvider, PresetSummary } from '../../presets/types.js';
import { harness } from './testHarness.js';
import { fontPx } from '../../__tests__/fontPx.js';

// Text measured at about the width of a book face, as the editions' own
// tests do (the harness's stub is narrower).
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

const chaptersOf = (locale: FixtureLocale): Chapter[] =>
  threeEditionsBook(locale).chapters.map((c, i) => ({ id: `${locale}-ch${i + 1}`, title: c.title, markdown: c.markdown, createdAt: 1, updatedAt: 1 }));

const SUMMARY: PresetSummary = { id: 'trio', name: 'Trio', source: 'public', available: true, locale: 'es', locales: [...FIXTURE_LOCALES] };

/** A sample in three languages, open in Spanish. */
function trio() {
  const provider: PresetProvider = {
    summary: SUMMARY,
    load: async (locale) => {
      const l = FIXTURE_LOCALES.find((x) => x === locale)!;
      const book = threeEditionsBook(l);
      return { summary: SUMMARY, locale: l, chapters: chaptersOf(l), config: book.config, resources: book.resources, blobs: [], fonts: [] } satisfies LoadedPreset;
    },
  };
  const es = threeEditionsBook('es');
  const chapters = chaptersOf('es');
  return harness({
    chapters,
    markdown: chapters[0]!.markdown,
    activeChapterId: chapters[0]!.id,
    config: es.config,
    resources: es.resources,
    activePresetId: 'trio',
    presetSummaries: [SUMMARY],
    presetApplied: { presetId: 'trio', locale: 'es', fingerprint: null, markdownHash: '', configHash: '', resourcesHash: '' },
  }, { presetProvider: (id: string) => (id === 'trio' ? provider : undefined) });
}

type Check = { language: string; kind: string; chapter?: number; page?: number; frame?: string; title: string };

describe('sandbox_get_composed_checks (#952)', () => {
  it('lays out every language of the book and lists the checks of each, the one on screen too', async () => {
    const { call, get } = trio();
    const before = get();
    const out = await call('sandbox_get_composed_checks');
    expect(out).toMatchObject({ ok: true, book: { sample: 'trio' } });
    expect(out.editions.map((e: { language: string }) => e.language)).toEqual(['es', 'en', 'ca']);
    expect(out.editions[0]).toMatchObject({ language: 'es', onScreen: true, chapters: 2, settled: true });
    expect(out.editions.every((e: { settled: boolean }) => e.settled)).toBe(true);
    // The frame that does not fit is in Catalan only (as in the editions' own test).
    const overflow = (out.checks as Check[]).filter((c) => c.kind === 'frameOverflow');
    expect(overflow.map((c) => `${c.language}:${c.chapter}:${c.frame}`)).toEqual(['ca:2:dinero']);
    expect(overflow[0]!.page).toBeGreaterThan(0);
    expect(overflow[0]!.title.length).toBeGreaterThan(0);
    expect(out.total).toBe(out.checks.length);
    // Nothing was switched or changed.
    expect(get()).toBe(before);
  });

  it('checks one language, named as the book names it or by its language', async () => {
    const { call } = trio();
    const ca = await call('sandbox_get_composed_checks', { language: 'ca' });
    expect(ca.editions.map((e: { language: string }) => e.language)).toEqual(['ca']);
    expect((ca.checks as Check[]).some((c) => c.kind === 'frameOverflow')).toBe(true);
    const es = await call('sandbox_get_composed_checks', { language: 'es-ES' });
    expect(es.editions.map((e: { language: string }) => e.language)).toEqual(['es']);
    expect((es.checks as Check[]).some((c) => c.kind === 'frameOverflow')).toBe(false);
    expect((await call('sandbox_get_composed_checks', { language: 'fr' })).error).toMatch(/no edition in "fr"\. Its editions: es, en, ca/);
  });

  it('limits the list and says how many more', async () => {
    const { call } = trio();
    const all = await call('sandbox_get_composed_checks');
    expect(all.total).toBeGreaterThan(1);
    const few = await call('sandbox_get_composed_checks', { limit: 1 });
    expect(few.checks).toHaveLength(1);
    expect(few.more).toBe(all.total - 1);
  });

  it('answers for a book with one language: just its own checks', async () => {
    const es = threeEditionsBook('es');
    const chapters = chaptersOf('es');
    const { call } = harness({ chapters, markdown: chapters[0]!.markdown, activeChapterId: chapters[0]!.id, config: es.config, resources: es.resources });
    const out = await call('sandbox_get_composed_checks');
    expect(out.editions).toHaveLength(1);
    expect(out.editions[0]).toMatchObject({ language: 'es', onScreen: true });
  });

  it('reports an edition it could not read and goes on with the others', async () => {
    const es = threeEditionsBook('es');
    const chapters = chaptersOf('es');
    const offline: PresetProvider = { summary: SUMMARY, load: async () => { throw new Error('offline'); } };
    const h = harness({
      chapters, markdown: chapters[0]!.markdown, activeChapterId: chapters[0]!.id, config: es.config, resources: es.resources,
      activePresetId: 'trio', presetSummaries: [SUMMARY],
      presetApplied: { presetId: 'trio', locale: 'es', fingerprint: null, markdownHash: '', configHash: '', resourcesHash: '' },
    }, { presetProvider: () => offline });
    const out = await h.call('sandbox_get_composed_checks');
    expect(out.editions.filter((e: { error?: string }) => e.error).map((e: { language: string; error: string }) => `${e.language}:${e.error}`)).toEqual(['en:offline', 'ca:offline']);
    expect(out.editions[0]).toMatchObject({ language: 'es', onScreen: true, settled: true });
  });
});
