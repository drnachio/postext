import { afterEach, describe, expect, it } from 'vitest';
import { clearStorage, loadEpubLayout, loadPanel, loadProjectId, saveEpubLayout, saveProjectId } from './persistence';

function installStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
  (globalThis as { window?: unknown }).window = { localStorage };
  return map;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('loadPanel', () => {
  it('maps the legacy presets panel to projects', () => {
    installStorage({ 'postext-sandbox-panel': 'presets' });
    expect(loadPanel()).toBe('projects');
    installStorage({ 'postext-sandbox-panel': 'markdown' });
    expect(loadPanel()).toBe('markdown');
    installStorage({ 'postext-sandbox-panel': '__closed__' });
    expect(loadPanel()).toBeNull();
    installStorage();
    expect(loadPanel()).toBeUndefined();
  });

  it('accepts the Chapters panel and ignores unknown ids', () => {
    installStorage({ 'postext-sandbox-panel': 'chapters' });
    expect(loadPanel()).toBe('chapters');
    installStorage({ 'postext-sandbox-panel': 'library' });
    expect(loadPanel()).toBeUndefined();
  });

  it('drops the stored split of the former library/open-book divider', () => {
    const map = installStorage({ 'postext-sandbox-books-split': '40', 'postext-sandbox-panel': 'projects' });
    expect(loadPanel()).toBe('projects');
    expect(map.has('postext-sandbox-books-split')).toBe(false);
  });
});

describe('project id', () => {
  it('round-trips and clears on null', () => {
    const map = installStorage();
    saveProjectId('abc');
    expect(loadProjectId()).toBe('abc');
    saveProjectId(null);
    expect(loadProjectId()).toBeNull();
    expect(map.has('postext-sandbox-project')).toBe(false);
  });
});

describe('EPUB layout', () => {
  it('round-trips, ignores unknown values and goes with the rest of the view', () => {
    const map = installStorage();
    expect(loadEpubLayout()).toBeNull();
    saveEpubLayout('fixed');
    expect(loadEpubLayout()).toBe('fixed');
    saveEpubLayout('reflowable');
    expect(loadEpubLayout()).toBe('reflowable');
    map.set('postext-sandbox-epub-layout', 'pre-paginated');
    expect(loadEpubLayout()).toBeNull();
    saveEpubLayout('fixed');
    clearStorage();
    expect(map.has('postext-sandbox-epub-layout')).toBe(false);
  });
});

describe('working book', () => {
  const migration = { ids: () => 'gen', untitled: (n: number) => `Chapter ${n}` };
  it('falls back to the legacy markdown key as a one-chapter book', async () => {
    installStorage({ 'postext-sandbox-markdown': '# Old\n\ntext' });
    const { loadBook } = await import('./persistence');
    const book = loadBook(migration)!;
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0]!.title).toBe('Old');
    expect(book.activeChapterId).toBe('gen');
  });
  it('round-trips and removes the legacy key on save', async () => {
    const map = installStorage({ 'postext-sandbox-markdown': 'old' });
    const { loadBook, saveBook } = await import('./persistence');
    const book = { chapters: [{ id: 'a', title: 'A', markdown: 'x', createdAt: 1, updatedAt: 1 }], activeChapterId: 'a' };
    saveBook(book);
    expect(map.has('postext-sandbox-markdown')).toBe(false);
    expect(loadBook(migration)).toEqual(book);
  });
  it('returns null when nothing was saved', async () => {
    installStorage();
    const { loadBook } = await import('./persistence');
    expect(loadBook(migration)).toBeNull();
  });
});

describe('hidden presets', () => {
  it('round-trips and tolerates garbage', async () => {
    installStorage({ 'postext-sandbox-hidden-presets': '{"nope":1}' });
    const { loadHiddenPresetIds, saveHiddenPresetIds } = await import('./persistence');
    expect(loadHiddenPresetIds()).toEqual([]);
    saveHiddenPresetIds(['a', 'b']);
    expect(loadHiddenPresetIds()).toEqual(['a', 'b']);
  });
});

describe('working configuration', () => {
  it('pins the heading breaks of a copy saved by postext 1.4 or earlier', async () => {
    const legacy = JSON.stringify({ headings: { fontFamily: 'Georgia' } });
    const map = installStorage({ 'postext-sandbox-config': legacy });
    const { loadConfig, saveConfig } = await import('./persistence');
    const config = loadConfig()!;
    expect(config.headings?.levels).toEqual([{ level: 1, breakBefore: { enabled: false } }]);
    // A save stamps the copy, so the next load reads it as it is.
    saveConfig(config);
    expect(map.get('postext-sandbox-config-version')).toBe('9');
    expect(loadConfig()).toEqual(config);
  });
  it('reads a stamped copy as it is', async () => {
    installStorage({
      'postext-sandbox-config': JSON.stringify({ headings: { fontFamily: 'Georgia' } }),
      'postext-sandbox-config-version': '9',
    });
    const { loadConfig } = await import('./persistence');
    expect(loadConfig()).toEqual({ headings: { fontFamily: 'Georgia' } });
  });
  // EF-93: a copy saved before the stamp reached 5 keeps the space 1.4 left
  // under an inline figure, when the saved book embeds one.
  it('pins the inline gap of an older copy by the saved book\'s embeds', async () => {
    const saved = { headings: { fontFamily: 'Georgia' } };
    const book = (markdown: string) => JSON.stringify({ version: 2, activeChapterId: 'a', chapters: [{ id: 'a', title: 'A', markdown, createdAt: 1, updatedAt: 1 }] });
    installStorage({ 'postext-sandbox-config': JSON.stringify(saved), 'postext-sandbox-config-version': '4', 'postext-sandbox-book': book('Text.\n\n::resource{id="fig"}\n\nMore.') });
    const { loadConfig } = await import('./persistence');
    expect(loadConfig()).toEqual({ ...saved, layout: { inlineResourceGap: 'above' } });
    installStorage({ 'postext-sandbox-config': JSON.stringify(saved), 'postext-sandbox-config-version': '4', 'postext-sandbox-book': book('Prose only.') });
    expect(loadConfig()).toEqual(saved);
    // A book that only mentions the directive (the guide's chapter 9) embeds
    // nothing, and shows no changed spacing setting.
    installStorage({ 'postext-sandbox-config': JSON.stringify(saved), 'postext-sandbox-config-version': '4', 'postext-sandbox-book': book('`::resource{id="…"}` on a line of its own embeds a resource.') });
    expect(loadConfig()).toEqual(saved);
  });
  // EF-75: a copy saved before the stamp reached 4 keeps the maths size it
  // was laid out at, when the saved book sets maths.
  it('pins the maths size of an older copy by the saved book\'s maths', async () => {
    const saved = { headings: { fontFamily: 'Georgia' }, math: { fontSizeScale: 1.2 } };
    const book = (markdown: string) => JSON.stringify({ version: 2, activeChapterId: 'a', chapters: [{ id: 'a', title: 'A', markdown, createdAt: 1, updatedAt: 1 }] });
    installStorage({ 'postext-sandbox-config': JSON.stringify(saved), 'postext-sandbox-config-version': '3', 'postext-sandbox-book': book('Area $\\pi r^2$.') });
    const { loadConfig } = await import('./persistence');
    const { LEGACY_MATH_SIZE } = await import('postext/bundle');
    expect(loadConfig()).toEqual({
      headings: { fontFamily: 'Georgia' },
      math: { fontSizeScale: 1.2 * LEGACY_MATH_SIZE, marginTop: { value: 0.8 / LEGACY_MATH_SIZE, unit: 'em' }, marginBottom: { value: 0.8 / LEGACY_MATH_SIZE, unit: 'em' } },
    });
    // A book without a formula keeps its configuration as it was saved.
    installStorage({ 'postext-sandbox-config': JSON.stringify(saved), 'postext-sandbox-config-version': '3', 'postext-sandbox-book': book('Prose only.') });
    expect(loadConfig()).toEqual(saved);
    installStorage({ 'postext-sandbox-config': JSON.stringify(saved), 'postext-sandbox-config-version': '3', 'postext-sandbox-markdown': 'Prose only.' });
    expect(loadConfig()).toEqual(saved);
    // No saved book: the maths may be anywhere, so the size is pinned.
    installStorage({ 'postext-sandbox-config': JSON.stringify(saved), 'postext-sandbox-config-version': '3' });
    expect(loadConfig()!.math?.fontSizeScale).toBe(1.2 * LEGACY_MATH_SIZE);
  });
  it('pins the heading breaks and maths size of a postext-config.json exported by postext 1.4 or earlier', async () => {
    const { configFromExport } = await import('./persistence');
    const { LEGACY_MATH_SIZE } = await import('postext/bundle');
    const legacy = { type: 'postext-config' as const, version: 1 as const, config: { headings: { fontFamily: 'Georgia' } } };
    expect(configFromExport(legacy).headings?.levels).toEqual([{ level: 1, breakBefore: { enabled: false } }]);
    expect(configFromExport(legacy).math?.fontSizeScale).toBe(LEGACY_MATH_SIZE);
    // An export stamped 3 (a 1.5 prerelease) gets the maths size only.
    // An export carries no chapters: its headings may carry marks anywhere,
    // so every copy stamped before 6 prints them plain.
    // An export carries no chapters: it may hold a heading anywhere, so
    // every copy stamped before 8 keeps 1.4's split under a heading too.
    const v3 = configFromExport({ ...legacy, configVersion: 3 });
    expect(v3.headings).toEqual({ fontFamily: 'Georgia', inlineMarks: false, keepWithNextSplit: 'fill' });
    expect(v3.math?.fontSizeScale).toBe(LEGACY_MATH_SIZE);
    // One stamped 4 (a later 1.5 prerelease) gets the inline gap and the
    // version-6, version-7 and version-8 pins: an export carries no
    // chapters, so it may embed a figure (in a box too), introduce a list
    // with a colon, mark a heading, hold a box, set a closed dash or a
    // compound anywhere. It sets no text ragged, so its ragged breaking is
    // not pinned.
    // It may set a poem with no separator anywhere too (#620).
    expect(configFromExport({ ...legacy, configVersion: 4 })).toEqual({
      headings: { fontFamily: 'Georgia', inlineMarks: false, keepWithNextSplit: 'fill' },
      layout: { inlineResourceGap: 'above', inlineResourceGapInBoxes: false, boxChildSplitMinLines: 1 },
      bodyText: { colonListRoom: 'line', breakAfterDashes: false, breakAfterHyphens: false, verse: { layout: 'bayt' } },
    });
    // One stamped 5 gets the version-6, version-7 and version-8 pins only
    // (EF-110, EF-115, EF-117, EF-122; EF-141; EF-186).
    expect(configFromExport({ ...legacy, configVersion: 5 })).toEqual({
      headings: { fontFamily: 'Georgia', inlineMarks: false, keepWithNextSplit: 'fill' },
      layout: { inlineResourceGapInBoxes: false, boxChildSplitMinLines: 1 },
      bodyText: { colonListRoom: 'line', breakAfterDashes: false, breakAfterHyphens: false, verse: { layout: 'bayt' } },
    });
    // One stamped 6 gets the version-7 and version-8 pins only: the dash
    // breaks, the ragged breaking when it sets text ragged (EF-141,
    // EF-147), the split under a heading (EF-185) and the compound breaks
    // (EF-186).
    expect(configFromExport({ ...legacy, configVersion: 6 })).toEqual({ headings: { fontFamily: 'Georgia', keepWithNextSplit: 'fill' }, bodyText: { breakAfterDashes: false, breakAfterHyphens: false, verse: { layout: 'bayt' } } });
    const ragged = { ...legacy, config: { bodyText: { textAlign: 'left' as const } } };
    expect(configFromExport({ ...ragged, configVersion: 6 })).toEqual({ bodyText: { textAlign: 'left', breakAfterDashes: false, optimalRagged: false, breakAfterHyphens: false, verse: { layout: 'bayt' } }, headings: { keepWithNextSplit: 'fill' } });
    // One stamped 7 gets the version-8 pins only: the split under a
    // heading, the compound breaks, and the space under containers when it
    // declares a paragraph style (EF-159, EF-181).
    expect(configFromExport({ ...legacy, configVersion: 7 })).toEqual({ headings: { fontFamily: 'Georgia', keepWithNextSplit: 'fill' }, bodyText: { breakAfterHyphens: false, verse: { layout: 'bayt' } } });
    const styled = { ...legacy, config: { paragraphStyles: [{ id: 'verse' }] } };
    expect(configFromExport({ ...styled, configVersion: 7 })).toEqual({ paragraphStyles: [{ id: 'verse' }], headings: { keepWithNextSplit: 'fill' }, bodyText: { breakAfterHyphens: false, paragraphContainerSpacing: 'add', verse: { layout: 'bayt' } } });
    // One stamped 8 (postext 1.5 to 1.22) gets the version-9 pins only: the
    // verse layout, and a first-line indent dropped from a style that hangs
    // (#620).
    const hanging = { ...legacy, config: { paragraphStyles: [{ id: 'bib', firstLineIndent: { value: 1, unit: 'em' as const }, hangingIndent: { value: 2, unit: 'em' as const } }] } };
    expect(configFromExport({ ...legacy, configVersion: 8 })).toEqual({ headings: { fontFamily: 'Georgia' }, bodyText: { verse: { layout: 'bayt' } } });
    expect(configFromExport({ ...hanging, configVersion: 8 })).toEqual({ paragraphStyles: [{ id: 'bib', hangingIndent: { value: 2, unit: 'em' } }], bodyText: { verse: { layout: 'bayt' } } });
    // Exports carry the version since 1.5, and read back as they are.
    expect(configFromExport({ ...legacy, configVersion: 9 })).toEqual({ headings: { fontFamily: 'Georgia' } });
    expect(configFromExport({ ...styled, configVersion: 9 })).toEqual({ paragraphStyles: [{ id: 'verse' }] });
  });
  // The applied preset's snapshot hashed the copy as it was stored; once the
  // copy is migrated on load, an untouched book must still read untouched
  // (the built-in guide, saved by 1.4 without a stamp, has maths).
  it('re-keys the applied preset\'s snapshot to a copy migrated on load', async () => {
    const { stripConfigDefaults } = await import('postext');
    const { createPostextGuideConfig } = await import('../context/guideConfig');
    const { withDefaultResourceTypes } = await import('../context/defaultConfig');
    const { DEFAULT_MARKDOWN_EN } = await import('../defaultMarkdown/en');
    const { hashChapters, hashConfig, hashResources, isDocumentUntouched, rekeyMigratedConfig } = await import('../presets/hash');
    const { loadStoredConfig } = await import('./persistence');
    const guide = createPostextGuideConfig('en');
    const bookOf = (markdown: string) => [{ id: 'a', title: 'A', markdown, createdAt: 1, updatedAt: 1 }];
    const open = (saved: object, markdown: string, stamp?: number) => {
      installStorage({
        'postext-sandbox-config': JSON.stringify(saved),
        'postext-sandbox-book': JSON.stringify({ version: 2, activeChapterId: 'a', chapters: bookOf(markdown) }),
        ...(stamp !== undefined ? { 'postext-sandbox-config-version': String(stamp) } : {}),
      });
      const snapshot = { presetId: 'postext-guide', fingerprint: 'guide-1.4', markdownHash: hashChapters(bookOf(markdown)), configHash: hashConfig(guide), resourcesHash: hashResources([]) };
      const { stored, config } = loadStoredConfig()!;
      const state = { chapters: bookOf(markdown), resources: [], config: withDefaultResourceTypes(config) };
      return { stored, config, state, snapshot, rekeyed: rekeyMigratedConfig(snapshot, withDefaultResourceTypes(stored), state.config) };
    };
    // Untouched, with maths: the copy is pinned, and only the re-keyed
    // snapshot still recognises it.
    const withMaths = open(stripConfigDefaults(guide), DEFAULT_MARKDOWN_EN);
    expect(DEFAULT_MARKDOWN_EN).toContain('$');
    expect(withMaths.config).not.toBe(withMaths.stored);
    expect(isDocumentUntouched(withMaths.state, withMaths.snapshot)).toBe(false);
    expect(withMaths.rekeyed).toEqual({ ...withMaths.snapshot, configHash: hashConfig(withMaths.state.config) });
    expect(isDocumentUntouched(withMaths.state, withMaths.rekeyed)).toBe(true);
    // Re-keying twice (a reload before the copy is saved again) is stable.
    expect(rekeyMigratedConfig(withMaths.rekeyed, withDefaultResourceTypes(withMaths.stored), withMaths.state.config)).toBe(withMaths.rekeyed);
    // Edited before the upgrade: still edited.
    const edited = open({ ...stripConfigDefaults(guide), math: { fontSizeScale: 1.2 } }, DEFAULT_MARKDOWN_EN);
    expect(edited.rekeyed).toBe(edited.snapshot);
    expect(isDocumentUntouched(edited.state, edited.rekeyed)).toBe(false);
    // No maths: the guide's ragged styles still get the 1.4 line-by-line
    // breaking (EF-147), and the re-keyed snapshot recognises the copy.
    const prose = open(stripConfigDefaults(guide), 'Prose only.');
    expect(prose.config).not.toBe(prose.stored);
    expect(prose.config.bodyText?.optimalRagged).toBe(false);
    expect(isDocumentUntouched(prose.state, prose.rekeyed)).toBe(true);
    // A copy stamped for today's rules: nothing is migrated, and the
    // snapshot is left as it is.
    const today = open(stripConfigDefaults(guide), 'Prose only.', 7);
    expect(today.config).toBe(today.stored);
    expect(today.rekeyed).toBe(today.snapshot);
    expect(isDocumentUntouched(today.state, today.rekeyed)).toBe(true);
  });
  it('drops the stamp with the configuration', async () => {
    const map = installStorage();
    const { clearStorage, saveConfig } = await import('./persistence');
    saveConfig({ headings: { fontFamily: 'Georgia' } });
    clearStorage();
    expect(map.has('postext-sandbox-config')).toBe(false);
    expect(map.has('postext-sandbox-config-version')).toBe(false);
  });
});
