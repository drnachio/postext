// Design › Writing system (#197): Language and direction, the East Asian
// typography section with its hint for other languages, the pointer left in
// Body text, and the settings search finding the Chinese punctuation rows
// in English and Spanish.

import { createElement as h, type ComponentType } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { SandboxStoreContext } from '../../context/SandboxContext';
import { createDefaultConfig } from '../../context/defaultConfig';
import { DEFAULT_LABELS } from '../../types/defaultLabels';
import type { SandboxLabels } from '../../types/labels';
import { SettingsSearchContext, type SettingsSearchState } from '../search/SearchContext';
import { MatchScopeProvider } from '../search/MatchScope';
import { compileMatcher } from '../search/normalize';
import { buildSectionSearchIndex, planSettingsSearch } from '../search/sectionIndex';
import { BodyTextSection } from './BodyTextSection';
import { CjkSection } from './CjkSection';
import { WritingSection } from './WritingSection';

const spanish = (await import(/* @vite-ignore */ new URL('../../../../../apps/web/messages/es.json', import.meta.url).href)) as {
  default: { Sandbox: Record<string, string> };
};
const ES = { ...DEFAULT_LABELS, ...spanish.default.Sandbox } as SandboxLabels;

const IDLE: SettingsSearchState = { query: '', matcher: compileMatcher(''), overriddenOnly: false, active: false };

function searching(query: string): SettingsSearchState {
  return { query, matcher: compileMatcher(query), overriddenOnly: false, active: true };
}

function render(section: ComponentType, config: PostextConfig, { labels = DEFAULT_LABELS, search = IDLE } = {}): string {
  const state = { config, resources: [], labels, locale: labels === ES ? 'es' : 'en' };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  const html = renderToString(
    h(SandboxStoreContext, { value: store as never },
      h(SettingsSearchContext, { value: search },
        h(MatchScopeProvider, { id: 'root', children: h(section) }))),
  );
  // The text as read: tags (search highlights among them) dropped.
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

describe('Language and direction', () => {
  it('holds the document language, the writing mode, the binding and the Chinese defaults', () => {
    const html = render(WritingSection, createDefaultConfig('en'));
    for (const label of [
      DEFAULT_LABELS.documentLocale,
      DEFAULT_LABELS.writingMode,
      DEFAULT_LABELS.writingModeHorizontal,
      DEFAULT_LABELS.writingModeVerticalShort,
      DEFAULT_LABELS.binding,
      DEFAULT_LABELS.chineseDefaults,
      DEFAULT_LABELS.chineseDefaultsReview,
    ]) expect(html).toContain(label);
    // Auto binding names what it resolves to.
    expect(html).toContain('Auto (Left edge)');
  });

  it('names the binding a vertical book gets', () => {
    const html = render(WritingSection, { ...createDefaultConfig('en'), locale: 'zh-Hant', layout: { writingMode: 'vertical-rl' } });
    expect(html).toContain('Auto (Right edge)');
    expect(html).toContain('中文（繁體）');
  });
});

describe('Body text', () => {
  it('points at Writing system for the document language', () => {
    const html = render(BodyTextSection, { ...createDefaultConfig('en'), locale: 'zh-Hans' });
    expect(html).toContain(DEFAULT_LABELS.bodyDocumentLocaleMoved);
    expect(html).toContain('中文（简体）');
    // No select: the language is set elsewhere.
    expect(html).not.toContain(DEFAULT_LABELS.documentLocaleTooltip);
  });
});

describe('East Asian typography', () => {
  it('shows a hint instead of its fields in a document in another language', () => {
    const html = render(CjkSection, createDefaultConfig('en'));
    expect(html).toContain('These settings affect Chinese, Japanese and Korean text. Document language: English.');
    expect(html).toContain(DEFAULT_LABELS.cjkShowSettings);
    expect(html).not.toContain(DEFAULT_LABELS.cjkPunctuationWidth);
  });

  it('shows its fields, grouped, in a Chinese document or once one is set', () => {
    for (const config of [
      { ...createDefaultConfig('en'), locale: 'zh-Hant' },
      { ...createDefaultConfig('en'), cjk: { latinSpacing: { value: 0, unit: 'em' } } } as PostextConfig,
    ]) {
      const html = render(CjkSection, config);
      expect(html).not.toContain(DEFAULT_LABELS.cjkShowSettings);
      for (const label of [
        DEFAULT_LABELS.cjkGroupLineEdges,
        DEFAULT_LABELS.cjkGroupPunctuation,
        DEFAULT_LABELS.cjkGroupSpacing,
        DEFAULT_LABELS.cjkGrid,
        DEFAULT_LABELS.cjkPunctuationWidth,
      ]) expect(html).toContain(label);
    }
  });

  it('is found by a search for punctuation, in English and Spanish, in any document', () => {
    const config = createDefaultConfig('en');
    for (const [labels, query, row] of [
      [DEFAULT_LABELS, 'punctuation', DEFAULT_LABELS.cjkPunctuationWidth],
      [ES, 'puntuación', ES.cjkPunctuationWidth],
    ] as const) {
      const index = buildSectionSearchIndex(labels, config, []);
      const plan = planSettingsSearch(index, compileMatcher(query).tokens, false, config);
      expect(plan.flatMap((g) => g.sections)).toContain('cjk');
      expect(plan.find((g) => g.sections.includes('cjk'))?.id).toBe('writing');
      expect(render(CjkSection, config, { labels, search: searching(query) })).toContain(row);
    }
  });
});
