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
import { valueText } from './ChineseDefaultsField';

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

  it('names the direction, binding and digits Auto gives an Arabic book, and offers the Arabic defaults (#381)', () => {
    const english = render(WritingSection, createDefaultConfig('en'));
    expect(english).toContain(DEFAULT_LABELS.documentDirection);
    expect(english).toContain('Auto (Left to right)');
    expect(english).toContain(DEFAULT_LABELS.numerals);
    expect(english).toContain('Auto (European 0 1 2 3)');
    expect(english).not.toContain(DEFAULT_LABELS.arabicDefaults);

    const arabic = render(WritingSection, { ...createDefaultConfig('ar'), locale: 'ar' });
    expect(arabic).toContain('Auto (Right to left)');
    expect(arabic).toContain('Auto (Right edge)');
    expect(arabic).toContain('Auto (Arabic-Indic ٠ ١ ٢ ٣)');
    expect(arabic).toContain(DEFAULT_LABELS.arabicDefaults);
    // The Maghreb prints European digits; an explicit left to right binds
    // on the left again.
    const maghreb = render(WritingSection, { ...createDefaultConfig('ar'), locale: 'ar-MA', direction: 'ltr' });
    expect(maghreb).toContain('Auto (European 0 1 2 3)');
    expect(maghreb).toContain('Auto (Left edge)');
    expect(maghreb).toContain(`${DEFAULT_LABELS.documentDirection} (changed)${DEFAULT_LABELS.documentDirectionLtr}`);
  });

  it('offers the Japanese defaults for a Japanese book only (#431)', () => {
    expect(render(WritingSection, createDefaultConfig('en'))).not.toContain(DEFAULT_LABELS.japaneseDefaults);
    expect(render(WritingSection, { ...createDefaultConfig('en'), locale: 'zh-Hant' })).not.toContain(DEFAULT_LABELS.japaneseDefaults);
    const japanese = render(WritingSection, { ...createDefaultConfig('en'), locale: 'ja' });
    expect(japanese).toContain(DEFAULT_LABELS.japaneseDefaults);
    expect(japanese).toContain('日本語');
    expect(render(WritingSection, { ...createDefaultConfig('en'), locale: 'ja-JP' })).toContain(DEFAULT_LABELS.japaneseDefaults);
    // In Spanish too, and the settings search finds it.
    expect(render(WritingSection, { ...createDefaultConfig('es'), locale: 'ja' }, { labels: ES })).toContain(ES.japaneseDefaults);
    const config = { ...createDefaultConfig('en'), locale: 'ja' };
    for (const [labels, query] of [[DEFAULT_LABELS, 'japanese defaults'], [ES, 'ajustes japonés']] as const) {
      const plan = planSettingsSearch(buildSectionSearchIndex(labels, config, []), compileMatcher(query).tokens, false, config);
      expect(plan.find((g) => g.sections.includes('writing'))?.id, query).toBe('writing');
    }
  });

  it('finds the direction and digit fields by search, in English and Spanish', () => {
    const config = createDefaultConfig('en');
    for (const [labels, query] of [
      [DEFAULT_LABELS, 'digits'],
      [DEFAULT_LABELS, 'right to left'],
      [ES, 'cifras'],
      [ES, 'derecha a izquierda'],
    ] as const) {
      const index = buildSectionSearchIndex(labels, config, []);
      const plan = planSettingsSearch(index, compileMatcher(query).tokens, false, config);
      expect(plan.find((g) => g.sections.includes('writing'))?.id, query).toBe('writing');
    }
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
        DEFAULT_LABELS.cjkGroupVertical,
        DEFAULT_LABELS.cjkGroupAnnotations,
        DEFAULT_LABELS.cjkRuby,
        DEFAULT_LABELS.cjkWarichu,
        DEFAULT_LABELS.cjkGrid,
        DEFAULT_LABELS.cjkPunctuationWidth,
      ]) expect(html).toContain(label);
    }
  });

  it('groups the vertical, annotation, ruby and warichu fields after Spacing and before the grid', () => {
    const html = render(CjkSection, { ...createDefaultConfig('en'), locale: 'zh-Hant' });
    const at = (label: string) => {
      const i = html.indexOf(label);
      expect(i).toBeGreaterThanOrEqual(0);
      return i;
    };
    const order = [
      DEFAULT_LABELS.cjkGroupSpacing,
      DEFAULT_LABELS.cjkGroupVertical,
      DEFAULT_LABELS.cjkUprightDigits,
      DEFAULT_LABELS.cjkGroupAnnotations,
      DEFAULT_LABELS.cjkEmphasis,
      DEFAULT_LABELS.cjkBookTitleMark,
      DEFAULT_LABELS.cjkAnnotationColor,
      DEFAULT_LABELS.cjkRubySize,
      DEFAULT_LABELS.cjkWarichuSize,
      DEFAULT_LABELS.cjkGridEnabled,
    ].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('finds the ruby, warichu and upright-number fields by search in Writing system', () => {
    const config = createDefaultConfig('en');
    for (const [labels, query, row] of [
      [DEFAULT_LABELS, 'upright', DEFAULT_LABELS.cjkUprightDigits],
      [DEFAULT_LABELS, 'warichu', DEFAULT_LABELS.cjkWarichuSize],
      [ES, 'lecturas', ES.cjkRubySize],
    ] as const) {
      const index = buildSectionSearchIndex(labels, config, []);
      const plan = planSettingsSearch(index, compileMatcher(query).tokens, false, config);
      expect(plan.find((g) => g.sections.includes('cjk'))?.id).toBe('writing');
      expect(render(CjkSection, config, { labels, search: searching(query) })).toContain(row);
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

describe('Chinese defaults review values', () => {
  it('names every alignment a body can have', () => {
    const align = (value: 'left' | 'justify' | 'center' | 'right') => valueText({ kind: 'align', value }, DEFAULT_LABELS, 'en');
    expect([align('left'), align('justify'), align('center'), align('right')]).toEqual([
      DEFAULT_LABELS.bodyTextAlignLeft, DEFAULT_LABELS.bodyTextAlignJustify,
      DEFAULT_LABELS.headingsTextAlignCenter, DEFAULT_LABELS.headingsTextAlignRight,
    ]);
    expect(valueText({ kind: 'align', value: 'center' }, ES, 'es')).toBe('Centrado');
  });
});
