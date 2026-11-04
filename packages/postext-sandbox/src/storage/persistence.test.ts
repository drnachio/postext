import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG_VERSION, pinLegacyHtmlViewerBreaking } from 'postext/bundle';
import { clearStorage, loadEpubLayout, loadPanel, loadProjectId, saveEpubLayout, saveProjectId } from './persistence.js';

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
    const { loadBook } = await import('./persistence.js');
    const book = loadBook(migration)!;
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0]!.title).toBe('Old');
    expect(book.activeChapterId).toBe('gen');
  });
  it('round-trips and removes the legacy key on save', async () => {
    const map = installStorage({ 'postext-sandbox-markdown': 'old' });
    const { loadBook, saveBook } = await import('./persistence.js');
    const book = { chapters: [{ id: 'a', title: 'A', markdown: 'x', createdAt: 1, updatedAt: 1 }], activeChapterId: 'a' };
    saveBook(book);
    expect(map.has('postext-sandbox-markdown')).toBe(false);
    expect(loadBook(migration)).toEqual(book);
  });
  it('returns null when nothing was saved', async () => {
    installStorage();
    const { loadBook } = await import('./persistence.js');
    expect(loadBook(migration)).toBeNull();
  });
});

describe('hidden presets', () => {
  it('round-trips and tolerates garbage', async () => {
    installStorage({ 'postext-sandbox-hidden-presets': '{"nope":1}' });
    const { loadHiddenPresetIds, saveHiddenPresetIds } = await import('./persistence.js');
    expect(loadHiddenPresetIds()).toEqual([]);
    saveHiddenPresetIds(['a', 'b']);
    expect(loadHiddenPresetIds()).toEqual(['a', 'b']);
  });
});

describe('working configuration', () => {
  it('pins the heading breaks of a copy saved by postext 1.4 or earlier', async () => {
    const legacy = JSON.stringify({ headings: { fontFamily: 'Georgia' } });
    const map = installStorage({ 'postext-sandbox-config': legacy });
    const { loadConfig, saveConfig } = await import('./persistence.js');
    const config = loadConfig()!;
    expect(config.headings?.levels).toEqual([{ level: 1, breakBefore: { enabled: false } }]);
    // A save stamps the copy, so the next load reads it as it is.
    saveConfig(config);
    expect(map.get('postext-sandbox-config-version')).toBe('22');
    expect(loadConfig()).toEqual(config);
  });
  it('reads a stamped copy as it is', async () => {
    installStorage({
      'postext-sandbox-config': JSON.stringify({ headings: { fontFamily: 'Georgia' } }),
      'postext-sandbox-config-version': '22',
    });
    const { loadConfig } = await import('./persistence.js');
    expect(loadConfig()).toEqual({ headings: { fontFamily: 'Georgia' } });
    // A copy stamped 14 to 17 with no saved book to read keeps the rounded
    // ends of its highlight bands (#1149).
    installStorage({
      'postext-sandbox-config': JSON.stringify({ headings: { fontFamily: 'Georgia' } }),
      'postext-sandbox-config-version': '14',
    });
    expect(loadConfig()).toEqual(pinLegacyHtmlViewerBreaking({ headings: { fontFamily: 'Georgia' }, bodyText: { breakAfterSlashes: false }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    // Today's stamp is 14: a copy stamped 13 (postext 1.29) that names no
    // language for its text keeps the host's (#770), and one that names its
    // own keeps that.
    installStorage({
      'postext-sandbox-config': JSON.stringify({ headings: { fontFamily: 'Georgia' } }),
      'postext-sandbox-config-version': '13',
    });
    expect(loadConfig()).toEqual(pinLegacyHtmlViewerBreaking({ headings: { fontFamily: 'Georgia' }, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    installStorage({
      'postext-sandbox-config': JSON.stringify({ headings: { fontFamily: 'Georgia' }, bodyText: { shapingLanguage: 'document' } }),
      'postext-sandbox-config-version': '13',
    });
    expect(loadConfig()).toEqual(pinLegacyHtmlViewerBreaking({ headings: { fontFamily: 'Georgia' }, bodyText: { shapingLanguage: 'document', breakAfterSlashes: false }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    // A copy stamped 12 gets the pins of rules 13 and 14, its text shaped
    // in the language of the host (#764, #770) and, with no saved book to
    // read, the box of its task items kept as a character (#765).
    installStorage({
      'postext-sandbox-config': JSON.stringify({ headings: { fontFamily: 'Georgia' } }),
      'postext-sandbox-config-version': '12',
    });
    expect(loadConfig()).toEqual(pinLegacyHtmlViewerBreaking({ headings: { fontFamily: 'Georgia' }, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false }, unorderedLists: { taskBox: 'character' }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
  });
  // EF-93: a copy saved before the stamp reached 5 keeps the space 1.4 left
  // under an inline figure, when the saved book embeds one.
  it('pins the inline gap of an older copy by the saved book\'s embeds', async () => {
    const saved = { headings: { fontFamily: 'Georgia' } };
    const book = (markdown: string) => JSON.stringify({ version: 2, activeChapterId: 'a', chapters: [{ id: 'a', title: 'A', markdown, createdAt: 1, updatedAt: 1 }] });
    installStorage({ 'postext-sandbox-config': JSON.stringify(saved), 'postext-sandbox-config-version': '4', 'postext-sandbox-book': book('Text.\n\n::resource{id="fig"}\n\nMore.') });
    const { loadConfig } = await import('./persistence.js');
    // (Its inline tables move whole, #634, and a column under a figure
    // across several columns stretches as under any figure, #708.)
    expect(loadConfig()).toEqual(pinLegacyHtmlViewerBreaking({
      headings: { fontFamily: 'Georgia', balancing: { stretchAfterWideFloats: 'always' } }, // (no fence, no list: the level cut keeps today's unit)
      layout: { inlineResourceGap: 'above' },
      tableStyle: { splitInline: false },
      // (every copy stamped before 12 shapes its words with no letter alone,
      // #725, and every copy stamped before 14 its text in the language of
      // the host, #764 and #770)
      bodyText: { scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false },
    }));
    installStorage({ 'postext-sandbox-config': JSON.stringify(saved), 'postext-sandbox-config-version': '4', 'postext-sandbox-book': book('Prose only.') });
    expect(loadConfig()).toEqual(pinLegacyHtmlViewerBreaking({ ...saved, bodyText: { scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false } }));
    // A book that only mentions the directive (the guide's chapter 9) embeds
    // nothing, and shows no changed spacing setting.
    installStorage({ 'postext-sandbox-config': JSON.stringify(saved), 'postext-sandbox-config-version': '4', 'postext-sandbox-book': book('`::resource{id="…"}` on a line of its own embeds a resource.') });
    expect(loadConfig()).toEqual(pinLegacyHtmlViewerBreaking({ ...saved, bodyText: { scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false } }));
  });
  // EF-75: a copy saved before the stamp reached 4 keeps the maths size it
  // was laid out at, when the saved book sets maths.
  it('pins the maths size of an older copy by the saved book\'s maths', async () => {
    const saved = { headings: { fontFamily: 'Georgia' }, math: { fontSizeScale: 1.2 } };
    const book = (markdown: string) => JSON.stringify({ version: 2, activeChapterId: 'a', chapters: [{ id: 'a', title: 'A', markdown, createdAt: 1, updatedAt: 1 }] });
    installStorage({ 'postext-sandbox-config': JSON.stringify(saved), 'postext-sandbox-config-version': '3', 'postext-sandbox-book': book('Area $\\pi r^2$.') });
    const { loadConfig } = await import('./persistence.js');
    const { LEGACY_MATH_SIZE } = await import('postext/bundle');
    expect(loadConfig()).toEqual(pinLegacyHtmlViewerBreaking({
      headings: { fontFamily: 'Georgia' },
      math: { fontSizeScale: 1.2 * LEGACY_MATH_SIZE, marginTop: { value: 0.8 / LEGACY_MATH_SIZE, unit: 'em' }, marginBottom: { value: 0.8 / LEGACY_MATH_SIZE, unit: 'em' } },
      bodyText: { scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false },
    }));
    // A book without a formula keeps its configuration as it was saved
    // (but for the pins every copy stamped before 12 takes, #725, and
    // before 14, #764 and #770).
    installStorage({ 'postext-sandbox-config': JSON.stringify(saved), 'postext-sandbox-config-version': '3', 'postext-sandbox-book': book('Prose only.') });
    expect(loadConfig()).toEqual(pinLegacyHtmlViewerBreaking({ ...saved, bodyText: { scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false } }));
    installStorage({ 'postext-sandbox-config': JSON.stringify(saved), 'postext-sandbox-config-version': '3', 'postext-sandbox-markdown': 'Prose only.' });
    expect(loadConfig()).toEqual(pinLegacyHtmlViewerBreaking({ ...saved, bodyText: { scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false } }));
    // No saved book: the maths may be anywhere, so the size is pinned.
    installStorage({ 'postext-sandbox-config': JSON.stringify(saved), 'postext-sandbox-config-version': '3' });
    expect(loadConfig()!.math?.fontSizeScale).toBe(1.2 * LEGACY_MATH_SIZE);
  });
  it('pins the heading breaks and maths size of a postext-config.json exported by postext 1.4 or earlier', async () => {
    const { configFromExport } = await import('./persistence.js');
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
    // (and every copy stamped before 12 the order of its balancing levers, #707)
    expect(v3.headings).toEqual({ fontFamily: 'Georgia', inlineMarks: false, keepWithNextSplit: 'fill', balancing: { maxLinesBeforeLoose: 4, stretchAfterWideFloats: 'always', trailingStep: 'grid' } });
    expect(v3.math?.fontSizeScale).toBe(LEGACY_MATH_SIZE);
    // One stamped 4 (a later 1.5 prerelease) gets the inline gap and the
    // version-6, version-7 and version-8 pins: an export carries no
    // chapters, so it may embed a figure (in a box too), introduce a list
    // with a colon, mark a heading, hold a box, set a closed dash or a
    // compound anywhere. It sets no text ragged, so its ragged breaking is
    // not pinned.
    // It may set a poem with no separator anywhere too, and end a line with
    // a backslash, which printed up to 1.22 (#620).
    // It may hold a heading in balanced columns: the order of the balancing
    // levers is pinned too (#707).
    // It may hold a cross-reference: its labels stay one word (#702).
    expect(configFromExport({ ...legacy, configVersion: 4 })).toEqual(pinLegacyHtmlViewerBreaking({
      headings: { fontFamily: 'Georgia', inlineMarks: false, keepWithNextSplit: 'fill', balancing: { maxLinesBeforeLoose: 4, stretchAfterWideFloats: 'always', trailingStep: 'grid' } },
      layout: { inlineResourceGap: 'above', inlineResourceGapInBoxes: false, boxChildSplitMinLines: 1, flowColumns: false },
      bodyText: { colonListRoom: 'line', breakAfterDashes: false, breakAfterHyphens: false, verse: { layout: 'bayt', tighten: false }, hardLineBreaks: false, scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false },
      codeStyle: { blocks: false },
      tableStyle: { splitInline: false },
      // (it may print an index: a column may end between any two entries of a group, #712)
      index: { groups: { splitMinEntries: 1 } },
      cjk: { titleMinChars: 1, circledNumbers: 'western', composeDesignText: false, warichu: { minChars: 1 } },
      crossRefs: { breakLabels: false },
      // (it may hold a comic: its balloons are placed as before 1.28, #728)
      comics: { lettering: { strictPlacement: false } },
      // (it may hold a task list: the box of an item stays a character, #765)
      unorderedLists: { taskBox: 'character' },
      // (it may set a mark: its band keeps its rounded ends, #1149)
      markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }],
      // (it may hold a notation fence: it stays a code listing, #1172)
      scoreStyle: { enabled: false },
    }));
    // (Every copy stamped before 12 also gets the pins of rules 12 that read
    // no content: the order of the balancing levers, #707, the line under a
    // float across columns, #708, and the breaks inside index groups, #712.)
    // One stamped 5 gets the version-6, version-7 and version-8 pins only
    // (EF-110, EF-115, EF-117, EF-122; EF-141; EF-186).
    expect(configFromExport({ ...legacy, configVersion: 5 })).toEqual(pinLegacyHtmlViewerBreaking({ comics: { lettering: { strictPlacement: false } },
      headings: { fontFamily: 'Georgia', inlineMarks: false, keepWithNextSplit: 'fill', balancing: { maxLinesBeforeLoose: 4, stretchAfterWideFloats: 'always', trailingStep: 'grid' } },
      layout: { inlineResourceGapInBoxes: false, boxChildSplitMinLines: 1, flowColumns: false },
      bodyText: { colonListRoom: 'line', breakAfterDashes: false, breakAfterHyphens: false, verse: { layout: 'bayt', tighten: false }, hardLineBreaks: false, scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false },
      codeStyle: { blocks: false },
      tableStyle: { splitInline: false },
      index: { groups: { splitMinEntries: 1 } },
      cjk: { titleMinChars: 1, circledNumbers: 'western', composeDesignText: false, warichu: { minChars: 1 } },
      crossRefs: { breakLabels: false },
      unorderedLists: { taskBox: 'character' },
      markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }],
      scoreStyle: { enabled: false },
    }));
    // One stamped 6 gets the version-7 and version-8 pins only: the dash
    // breaks, the ragged breaking when it sets text ragged (EF-141,
    // EF-147), the split under a heading (EF-185) and the compound breaks
    // (EF-186).
    expect(configFromExport({ ...legacy, configVersion: 6 })).toEqual(pinLegacyHtmlViewerBreaking({ comics: { lettering: { strictPlacement: false } }, headings: { fontFamily: 'Georgia', keepWithNextSplit: 'fill', balancing: { maxLinesBeforeLoose: 4, stretchAfterWideFloats: 'always', trailingStep: 'grid' } }, bodyText: { breakAfterDashes: false, breakAfterHyphens: false, verse: { layout: 'bayt', tighten: false }, hardLineBreaks: false, scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false }, codeStyle: { blocks: false }, tableStyle: { splitInline: false }, index: { groups: { splitMinEntries: 1 } }, layout: { flowColumns: false }, cjk: { titleMinChars: 1, circledNumbers: 'western', composeDesignText: false, warichu: { minChars: 1 } }, crossRefs: { breakLabels: false }, unorderedLists: { taskBox: 'character' }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    const ragged = { ...legacy, config: { bodyText: { textAlign: 'left' as const } } };
    expect(configFromExport({ ...ragged, configVersion: 6 })).toEqual(pinLegacyHtmlViewerBreaking({ comics: { lettering: { strictPlacement: false } }, bodyText: { textAlign: 'left', breakAfterDashes: false, optimalRagged: false, breakAfterHyphens: false, verse: { layout: 'bayt', tighten: false }, hardLineBreaks: false, scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false }, headings: { keepWithNextSplit: 'fill', balancing: { maxLinesBeforeLoose: 4, stretchAfterWideFloats: 'always', trailingStep: 'grid' } }, codeStyle: { blocks: false }, tableStyle: { splitInline: false }, index: { groups: { splitMinEntries: 1 } }, layout: { flowColumns: false }, cjk: { titleMinChars: 1, circledNumbers: 'western', composeDesignText: false, warichu: { minChars: 1 } }, crossRefs: { breakLabels: false }, unorderedLists: { taskBox: 'character' }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    // One stamped 7 gets the version-8 pins only: the split under a
    // heading, the compound breaks, and the space under containers when it
    // declares a paragraph style (EF-159, EF-181).
    expect(configFromExport({ ...legacy, configVersion: 7 })).toEqual(pinLegacyHtmlViewerBreaking({ comics: { lettering: { strictPlacement: false } }, headings: { fontFamily: 'Georgia', keepWithNextSplit: 'fill', balancing: { maxLinesBeforeLoose: 4, stretchAfterWideFloats: 'always', trailingStep: 'grid' } }, bodyText: { breakAfterHyphens: false, verse: { layout: 'bayt', tighten: false }, hardLineBreaks: false, scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false }, codeStyle: { blocks: false }, tableStyle: { splitInline: false }, index: { groups: { splitMinEntries: 1 } }, layout: { flowColumns: false }, cjk: { titleMinChars: 1, circledNumbers: 'western', composeDesignText: false, warichu: { minChars: 1 } }, crossRefs: { breakLabels: false }, unorderedLists: { taskBox: 'character' }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    const styled = { ...legacy, config: { paragraphStyles: [{ id: 'verse' }] } };
    expect(configFromExport({ ...styled, configVersion: 7 })).toEqual(pinLegacyHtmlViewerBreaking({ comics: { lettering: { strictPlacement: false } }, paragraphStyles: [{ id: 'verse' }], headings: { keepWithNextSplit: 'fill', balancing: { maxLinesBeforeLoose: 4, stretchAfterWideFloats: 'always', trailingStep: 'grid' } }, bodyText: { breakAfterHyphens: false, paragraphContainerSpacing: 'add', verse: { layout: 'bayt', tighten: false }, hardLineBreaks: false, scriptContext: false, shapingLanguage: 'host', paragraphStylesInBoxes: 'document', breakAfterSlashes: false }, codeStyle: { blocks: false }, tableStyle: { splitInline: false }, index: { groups: { splitMinEntries: 1 } }, layout: { flowColumns: false }, cjk: { titleMinChars: 1, circledNumbers: 'western', composeDesignText: false, warichu: { minChars: 1 } }, crossRefs: { breakLabels: false }, unorderedLists: { taskBox: 'character' }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    // One stamped 8 (postext 1.5 to 1.22) gets the version-9 and version-10
    // pins only: the verse layout, a first-line indent dropped from a style
    // that hangs, the printed backslashes (#620), fences read as Markdown
    // (#624) and the 1.23 verse turnovers.
    const hanging = { ...legacy, config: { paragraphStyles: [{ id: 'bib', firstLineIndent: { value: 1, unit: 'em' as const }, hangingIndent: { value: 2, unit: 'em' as const } }] } };
    expect(configFromExport({ ...legacy, configVersion: 8 })).toEqual(pinLegacyHtmlViewerBreaking({ comics: { lettering: { strictPlacement: false } }, headings: { fontFamily: 'Georgia', balancing: { maxLinesBeforeLoose: 4, stretchAfterWideFloats: 'always', trailingStep: 'grid' } }, bodyText: { verse: { layout: 'bayt', tighten: false }, hardLineBreaks: false, scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false }, codeStyle: { blocks: false }, tableStyle: { splitInline: false }, index: { groups: { splitMinEntries: 1 } }, layout: { flowColumns: false }, cjk: { titleMinChars: 1, circledNumbers: 'western', composeDesignText: false, warichu: { minChars: 1 } }, crossRefs: { breakLabels: false }, unorderedLists: { taskBox: 'character' }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(configFromExport({ ...hanging, configVersion: 8 })).toEqual(pinLegacyHtmlViewerBreaking({ comics: { lettering: { strictPlacement: false } }, paragraphStyles: [{ id: 'bib', hangingIndent: { value: 2, unit: 'em' } }], headings: { balancing: { maxLinesBeforeLoose: 4, stretchAfterWideFloats: 'always', trailingStep: 'grid' } }, bodyText: { verse: { layout: 'bayt', tighten: false }, hardLineBreaks: false, scriptContext: false, shapingLanguage: 'host', paragraphStylesInBoxes: 'document', breakAfterSlashes: false }, codeStyle: { blocks: false }, tableStyle: { splitInline: false }, index: { groups: { splitMinEntries: 1 } }, layout: { flowColumns: false }, cjk: { titleMinChars: 1, circledNumbers: 'western', composeDesignText: false, warichu: { minChars: 1 } }, crossRefs: { breakLabels: false }, unorderedLists: { taskBox: 'character' }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    // One stamped 9 (postext 1.23) gets the version-10 pin only: its lines
    // of verse turn over at their natural spacing (#620).
    expect(configFromExport({ ...legacy, configVersion: 9 })).toEqual(pinLegacyHtmlViewerBreaking({ comics: { lettering: { strictPlacement: false } }, headings: { fontFamily: 'Georgia', balancing: { maxLinesBeforeLoose: 4, stretchAfterWideFloats: 'always', trailingStep: 'grid' } }, bodyText: { verse: { tighten: false }, scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false }, tableStyle: { splitInline: false }, index: { groups: { splitMinEntries: 1 } }, layout: { flowColumns: false }, cjk: { titleMinChars: 1, circledNumbers: 'western', composeDesignText: false, warichu: { minChars: 1 } }, crossRefs: { breakLabels: false }, unorderedLists: { taskBox: 'character' }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    // One stamped 10 (postext 1.24) gets the version-11 pins: its inline
    // tables move whole and its :::columns fences are read as 1.24 read
    // them (#634).
    expect(configFromExport({ ...legacy, configVersion: 10 })).toMatchObject({ headings: { fontFamily: 'Georgia' }, tableStyle: { splitInline: false }, layout: { flowColumns: false }, cjk: { titleMinChars: 1, circledNumbers: 'western', composeDesignText: false, warichu: { minChars: 1 } } });
    // And, with a page-span heading, the slots 1.24 offered a float under
    // an opener (#639).
    const opener = { ...legacy, config: { headings: { levels: [{ level: 1, span: 'page' as const }] } } };
    expect(configFromExport({ ...opener, configVersion: 10 })).toMatchObject({ layout: { floatsUnderOpener: false } });
    // (One stamped 12, postext 1.28, gets the version-13 and version-14
    // pins alone: its text is shaped in the language of the host, #764 and
    // #770, and the box of a task item it may hold stays a character, #765.
    // One stamped 13, postext 1.29, gets the language alone. Every one
    // stamped before 18 keeps the rounded ends of a mark it may set, #1149,
    // and every one stamped before 19 its breaks at a slash, #1164, and
    // every one stamped before 20 its notation fences as listings, #1172.)
    expect(configFromExport({ ...opener, configVersion: 12 })).toEqual(pinLegacyHtmlViewerBreaking({ ...opener.config, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false }, unorderedLists: { taskBox: 'character' }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(configFromExport({ ...opener, configVersion: 13 })).toEqual(pinLegacyHtmlViewerBreaking({ ...opener.config, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(configFromExport({ ...opener, configVersion: 14 })).toEqual(pinLegacyHtmlViewerBreaking({ ...opener.config, bodyText: { breakAfterSlashes: false }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(configFromExport({ ...opener, configVersion: 18 })).toEqual(pinLegacyHtmlViewerBreaking({ ...opener.config, bodyText: { breakAfterSlashes: false }, scoreStyle: { enabled: false } }));
    expect(configFromExport({ ...opener, configVersion: 20 })).toEqual(pinLegacyHtmlViewerBreaking(opener.config));
    // Exports carry the version since 1.5, and read back as they are.
    // One stamped 11 (postext 1.25 to 1.27) gets the version-12 pins: a
    // two-row note it may hold breaks where 1.27 broke it (#720).
    expect(configFromExport({ ...legacy, configVersion: 11 })).toMatchObject({ headings: { fontFamily: 'Georgia' }, cjk: { warichu: { minChars: 1 } } });
    expect(configFromExport({ ...legacy, configVersion: 12 })).toEqual(pinLegacyHtmlViewerBreaking({ headings: { fontFamily: 'Georgia' }, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false }, unorderedLists: { taskBox: 'character' }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(configFromExport({ ...legacy, configVersion: 13 })).toEqual(pinLegacyHtmlViewerBreaking({ headings: { fontFamily: 'Georgia' }, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(configFromExport({ ...legacy, configVersion: 14 })).toEqual(pinLegacyHtmlViewerBreaking({ headings: { fontFamily: 'Georgia' }, bodyText: { breakAfterSlashes: false }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(configFromExport({ ...legacy, configVersion: 18 })).toEqual(pinLegacyHtmlViewerBreaking({ headings: { fontFamily: 'Georgia' }, bodyText: { breakAfterSlashes: false }, scoreStyle: { enabled: false } }));
    expect(configFromExport({ ...legacy, configVersion: 20 })).toEqual(pinLegacyHtmlViewerBreaking({ headings: { fontFamily: 'Georgia' } }));
    // And a column-and-a-half layout keeps the caption of a resource set in
    // the text under it, where 1.27 set it (#729); other layouts take no pin.
    const sided = { ...legacy, config: { layout: { layoutType: 'oneAndHalf' as const, sideColumnRole: 'floats' as const } } };
    expect(configFromExport({ ...sided, configVersion: 11 })).toMatchObject({ layout: { layoutType: 'oneAndHalf', sideColumnRole: 'floats', inlineCaptionSide: false } });
    expect(configFromExport({ ...sided, configVersion: 12 })).toEqual(pinLegacyHtmlViewerBreaking({ layout: { layoutType: 'oneAndHalf', sideColumnRole: 'floats' }, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false }, unorderedLists: { taskBox: 'character' }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(configFromExport({ ...sided, configVersion: 13 })).toEqual(pinLegacyHtmlViewerBreaking({ ...sided.config, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(configFromExport({ ...sided, configVersion: 14 })).toEqual(pinLegacyHtmlViewerBreaking({ ...sided.config, bodyText: { breakAfterSlashes: false }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(configFromExport({ ...sided, configVersion: 18 })).toEqual(pinLegacyHtmlViewerBreaking({ ...sided.config, bodyText: { breakAfterSlashes: false }, scoreStyle: { enabled: false } }));
    expect(configFromExport({ ...sided, configVersion: 20 })).toEqual(pinLegacyHtmlViewerBreaking(sided.config));
    expect(configFromExport({ ...legacy, configVersion: 11 }).layout?.inlineCaptionSide).toBeUndefined();
    expect(configFromExport({ ...styled, configVersion: 12 })).toEqual(pinLegacyHtmlViewerBreaking({ paragraphStyles: [{ id: 'verse' }], bodyText: { shapingLanguage: 'host', paragraphStylesInBoxes: 'document', breakAfterSlashes: false }, unorderedLists: { taskBox: 'character' }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(configFromExport({ ...styled, configVersion: 13 })).toEqual(pinLegacyHtmlViewerBreaking({ paragraphStyles: [{ id: 'verse' }], bodyText: { shapingLanguage: 'host', paragraphStylesInBoxes: 'document', breakAfterSlashes: false }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(configFromExport({ ...styled, configVersion: 14 })).toEqual(pinLegacyHtmlViewerBreaking({ paragraphStyles: [{ id: 'verse' }], bodyText: { paragraphStylesInBoxes: 'document', breakAfterSlashes: false }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    // A copy stamped 16 that declares a paragraph style keeps the type of
    // its styles inside a box (#1119); one stamped 17 only the ends of its
    // highlights (#1149) and, as every one stamped before 19, its breaks at
    // a slash (#1164); one stamped 18 the breaks at a slash; every one
    // stamped before 20 its notation fences as listings (#1172); one stamped
    // 20 is read as it is.
    expect(configFromExport({ ...styled, configVersion: 16 })).toEqual(pinLegacyHtmlViewerBreaking({ paragraphStyles: [{ id: 'verse' }], bodyText: { paragraphStylesInBoxes: 'document', breakAfterSlashes: false }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(configFromExport({ ...styled, configVersion: 17 })).toEqual(pinLegacyHtmlViewerBreaking({ paragraphStyles: [{ id: 'verse' }], bodyText: { breakAfterSlashes: false }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(configFromExport({ ...styled, configVersion: 18 })).toEqual(pinLegacyHtmlViewerBreaking({ paragraphStyles: [{ id: 'verse' }], bodyText: { breakAfterSlashes: false }, scoreStyle: { enabled: false } }));
    expect(configFromExport({ ...styled, configVersion: 20 })).toEqual(pinLegacyHtmlViewerBreaking({ paragraphStyles: [{ id: 'verse' }] }));
  });
  // The applied preset's snapshot hashed the copy as it was stored; once the
  // copy is migrated on load, an untouched book must still read untouched
  // (the built-in guide, saved by 1.4 without a stamp, has maths).
  it('re-keys the applied preset\'s snapshot to a copy migrated on load', async () => {
    const { stripConfigDefaults } = await import('postext');
    const { createPostextGuideConfig } = await import('../context/guideConfig.js');
    const { withDefaultResourceTypes } = await import('../context/defaultConfig.js');
    const { DEFAULT_MARKDOWN_EN } = await import('../defaultMarkdown/en.js');
    const { hashChapters, hashConfig, hashResources, isDocumentUntouched, rekeyMigratedConfig } = await import('../presets/hash.js');
    const { loadStoredConfig } = await import('./persistence.js');
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
    const today = open(stripConfigDefaults(guide), 'Prose only.', CONFIG_VERSION);
    expect(today.config).toBe(today.stored);
    expect(today.rekeyed).toBe(today.snapshot);
    expect(isDocumentUntouched(today.state, today.rekeyed)).toBe(true);
  });
  it('drops the stamp with the configuration', async () => {
    const map = installStorage();
    const { clearStorage, saveConfig } = await import('./persistence.js');
    saveConfig({ headings: { fontFamily: 'Georgia' } });
    clearStorage();
    expect(map.has('postext-sandbox-config')).toBe(false);
    expect(map.has('postext-sandbox-config-version')).toBe(false);
  });
});

describe('a full browser storage', () => {
  it('does not crash the autosave of the configuration or the book', async () => {
    const map = installStorage();
    const full = { getItem: (k: string) => map.get(k) ?? null, removeItem: () => {}, setItem: () => { throw new DOMException('full', 'QuotaExceededError'); } };
    (globalThis as { window?: unknown }).window = { localStorage: full };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { saveBook, saveConfig } = await import('./persistence.js');
    expect(() => saveConfig({ headings: { fontFamily: 'Georgia' } })).not.toThrow();
    expect(() => saveBook({ chapters: [{ id: 'c1', title: 'One', markdown: '# One' }], activeChapterId: 'c1' } as never)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(map.size).toBe(0);
    warn.mockRestore();
  });

  it('writes the version stamp only after the configuration', async () => {
    let writes = 0;
    const map = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: { getItem: (k: string) => map.get(k) ?? null, removeItem: () => {}, setItem: (k: string, v: string) => { if (++writes > 1) throw new Error('full'); map.set(k, v); } },
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { saveConfig } = await import('./persistence.js');
    expect(() => saveConfig({ headings: { fontFamily: 'Georgia' } })).not.toThrow();
    expect([...map.keys()]).toEqual(['postext-sandbox-config']);
    vi.restoreAllMocks();
  });
});
