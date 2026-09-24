// The settings search mounts only the sections `planSettingsSearch` picks,
// so the static index must cover every word a rendered row can match. This
// renders each section (server-side, every card forced open by an active
// search) against several books, in English and Spanish, records what each
// field row and card title is tested against, and checks every word is in
// that section's index — and that a section with a changed row counts as
// overridden for "Changed only".

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PostextConfig, Resource } from 'postext';
import { SandboxStoreContext } from '../../context/SandboxContext';
import { createDefaultConfig } from '../../context/defaultConfig';
import { createPostextGuideConfig } from '../../context/guideConfig';
import { DEFAULT_LABELS } from '../../types/defaultLabels';
import type { SandboxLabels } from '../../types/labels';
import { SECTION_COMPONENTS } from '../sections/components';
import { SETTINGS_SECTIONS, type SettingsSectionId } from '../sections/registry';
import { sectionHasOverrides } from '../sections/sectionOverrides';
import { SettingsSearchContext, type SettingsSearchState } from './SearchContext';
import { MatchScopeProvider } from './MatchScope';
import { buildSectionSearchIndex, planSettingsSearch } from './sectionIndex';
import { matchesTokens } from './normalize';

const harvest = { strings: [] as string[], overridden: [] as string[] };

vi.mock('./MatchScope', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./MatchScope')>();
  return {
    ...orig,
    useFieldMatch: (haystack: string, overridden: boolean) => {
      if (overridden) harvest.overridden.push(haystack);
      return orig.useFieldMatch(haystack, overridden);
    },
    MatchScopeProvider: (props: Parameters<typeof orig.MatchScopeProvider>[0]) => {
      if (props.overridden) harvest.overridden.push(`scope ${props.id ?? ''}`);
      return orig.MatchScopeProvider(props);
    },
  };
});

// Loaded through dynamic imports (the package has no Node typings).
const load = async <T>(path: string): Promise<T> =>
  ((await import(/* @vite-ignore */ new URL(path, import.meta.url).href)) as { default: T }).default;
const PRESETS = '../../../../../apps/web/public/presets/';
const generator = (await import(/* @vite-ignore */ new URL('../../../scripts/build-settings-search-index.mjs', import.meta.url).href)) as {
  isIndexCurrent(): boolean;
};
const spanishMessages = await load<{ Sandbox: Record<string, string> }>('../../../../../apps/web/messages/es.json');
const presetIndex = await load<{ presets: Array<{ dir: string }> }>(`${PRESETS}index.json`);
const presets = await Promise.all(
  presetIndex.presets.map(async ({ dir }) => ({
    dir,
    preset: await load<{ config?: PostextConfig; resources?: Resource[] }>(`${PRESETS}${dir}/preset.json`),
  })),
);

/** A search that matches nothing but records every string it is asked
 *  about: rows and card titles still render (hidden) and all cards open. */
const RECORDING_SEARCH: SettingsSearchState = {
  query: '\u0001',
  matcher: { tokens: ['\u0001'], test: (s) => { harvest.strings.push(s); return false; } },
  overriddenOnly: false,
  active: true,
};

function spanishLabels(): SandboxLabels {
  return { ...DEFAULT_LABELS, ...spanishMessages.Sandbox } as SandboxLabels;
}

interface Book { name: string; config: PostextConfig; resources: Resource[] }

function books(): Book[] {
  const out: Book[] = [
    { name: 'default', config: createDefaultConfig('en'), resources: [] },
    { name: 'guide', config: createPostextGuideConfig('en'), resources: [] },
  ];
  for (const { dir, preset } of presets) {
    if (preset.config) out.push({ name: dir, config: preset.config, resources: preset.resources ?? [] });
  }
  return out;
}

function renderSection(id: SettingsSectionId, labels: SandboxLabels, locale: string, book: Book) {
  const state = { config: book.config, resources: book.resources, labels, locale };
  const store = {
    getSnapshot: () => state,
    subscribe: () => () => {},
    dispatch: () => {},
  };
  harvest.strings = [];
  harvest.overridden = [];
  renderToString(
    h(SandboxStoreContext, { value: store as never },
      h(SettingsSearchContext, { value: RECORDING_SEARCH },
        h(MatchScopeProvider, { id: 'root', children: h(SECTION_COMPONENTS[id]) }))),
  );
  return { strings: harvest.strings, overridden: harvest.overridden };
}

const WORD = /[^\p{L}\p{N}]+/u;

describe('settings search index', () => {
  it('is up to date with the section sources', () => {
    // Stale: run `node scripts/build-settings-search-index.mjs`.
    expect(generator.isIndexCurrent()).toBe(true);
  });

  const locales: Array<[string, SandboxLabels]> = [['en', DEFAULT_LABELS], ['es', spanishLabels()]];
  for (const book of books()) {
    for (const [locale, labels] of locales) {
      it(`covers every rendered row of "${book.name}" (${locale})`, () => {
        const index = buildSectionSearchIndex(labels, book.config, book.resources);
        const missing: string[] = [];
        let rows = 0;
        for (const text of index) {
          const { strings, overridden } = renderSection(text.id, labels, locale, book);
          rows += strings.length;
          const gaps = new Set<string>();
          for (const s of strings) {
            for (const word of s.split(WORD)) {
              if (!word || /\d/.test(word) || (text.colors && /^[0-9a-f]+$/.test(word))) continue;
              if (!matchesTokens(text.all, [word])) gaps.add(word);
            }
          }
          if (gaps.size > 0) missing.push(`${text.id}: ${[...gaps].slice(0, 12).join(', ')}`);
          if (overridden.length > 0 && !sectionHasOverrides(book.config, text.id)) {
            missing.push(`${text.id}: sectionHasOverrides() is false but rows are changed: ${overridden.slice(0, 3).join(' / ')}`);
          }
        }
        expect(rows).toBeGreaterThan(300);
        expect(missing).toEqual([]);
      }, 60_000);
    }
  }
});

describe('planSettingsSearch', () => {
  const labels = spanishLabels();
  const config = createDefaultConfig('es');
  const index = buildSectionSearchIndex(labels, config, []);
  const ids = (tokens: string[], overriddenOnly = false) =>
    planSettingsSearch(index, tokens, overriddenOnly, config).flatMap((g) => g.sections);

  it('mounts every section for a word with a digit', () => {
    expect(ids(['2'])).toHaveLength(SETTINGS_SECTIONS.length);
  });

  it('narrows a query to the sections that name it', () => {
    const hits = ids(['margen']);
    expect(hits).toContain('page');
    expect(hits.length).toBeLessThan(SETTINGS_SECTIONS.length);
    expect(ids(['zzzz'])).toEqual([]);
  });

  it('puts the group whose section title matches first', () => {
    expect(planSettingsSearch(index, ['paleta'], false, config)[0].id).toBe('colors');
  });

  it('keeps only overridden sections for "Changed only"', () => {
    const changed = planSettingsSearch(index, [], true, { ...config, math: { fontScale: 2 } } as PostextConfig)
      .flatMap((g) => g.sections);
    expect(changed).toContain('math');
    expect(changed).not.toContain('page');
  });
});
