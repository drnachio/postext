// #1704: what the Design panel is editing, in one row — every language or
// the edition on screen, the book or a chapter style.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { SandboxStoreContext } from '../../context/SandboxContext.js';
import { DEFAULT_LABELS } from '../../types/defaultLabels.js';
import { ConfigScopeContext } from './ConfigScopeProvider.js';
import { DesignScopeBar } from './DesignScopeBar.js';

const STYLES: PostextConfig = { chapterStyles: [{ id: 'appendix', name: 'Appendix', config: {} }] };

interface Book {
  config?: PostextConfig;
  /** The scope of a book in several languages; none: a book in one. */
  scope?: 'all' | 'edition';
  /** The settings the edition on screen sets of its own. */
  own?: Record<string, unknown>;
  editing?: string | null;
  locales?: string[];
  help?: boolean;
}

function render({ config = {}, scope, own = {}, editing = null, locales = ['en', 'es'], help = false }: Book): string {
  const state = {
    config,
    configLayers: scope ? { shared: config, scope } : null,
    editingChapterStyle: editing,
    labels: DEFAULT_LABELS,
    locale: 'es',
  };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  const names: Record<string, string> = { en: 'inglés', es: 'español', fr: 'francés', de: 'alemán', it: 'italiano' };
  const layer = scope
    ? { scope, locale: 'es', locales, languageName: (tag: string) => names[tag] ?? tag, overrides: { es: own }, useGeneral: () => {}, useGeneralIn: () => {}, promote: () => {}, canChange: () => true, editConfig: config }
    : null;
  return renderToString(
    h(SandboxStoreContext, { value: store as never },
      h(ConfigScopeContext, { value: { shadowed: null, dismissShadowed: () => {}, layer: layer as never } },
        h(DesignScopeBar, { help }))),
  );
}

const count = (html: string, what: string) => html.split(what).length - 1;

describe('the Design panel\'s scope bar', () => {
  it('is one row in a book in several languages: the language switch and the chapter style menu', () => {
    const html = render({ scope: 'all' });
    expect(count(html, 'role="radiogroup"')).toBe(1);
    expect(html).toContain(DEFAULT_LABELS.configScopeAll);
    // The edition's option reads as its language alone, set as a name; its
    // full wording is its name for assistive technology and its tooltip.
    expect(html).toMatch(/aria-label="español only"[^>]*title="español only"/);
    expect(html).toMatch(/<span class="truncate">Español<\/span>/);
    // The menu beside it, named by what it edits; no row of its own.
    expect(html).toContain(`aria-label="${DEFAULT_LABELS.chapterStyleBarLabel}: ${DEFAULT_LABELS.chapterStyleBook}"`);
    expect(html).not.toContain(`>${DEFAULT_LABELS.chapterStyleBarLabel}</span>`);
    // "All languages" is never the option cut.
    expect(html).toMatch(/role="radio"[^>]*class="[^"]*shrink-0[^"]*"[^>]*>.*?All languages/s);
  });

  it('keeps what the scope means for the panel\'s help, and always as the switch\'s description', () => {
    const quiet = render({ scope: 'all' });
    const id = quiet.match(/aria-describedby="([^"]+)"/)![1]!;
    expect(quiet).toContain(`<p id="${id}" class="sr-only">`);
    expect(quiet).toContain('Changes reach every edition (inglés, español).');
    const helped = render({ scope: 'all', help: true });
    expect(helped).not.toContain('class="sr-only"');
    expect(helped).toContain('Changes reach every edition (inglés, español).');
    // Many editions are counted, not listed.
    expect(render({ scope: 'all', locales: ['en', 'es', 'fr', 'de', 'it'] })).toContain('Changes reach all 5 editions.');
    expect(render({ scope: 'edition' })).toContain('Changes reach only español.');
  });

  it('lists the fields the edition sets of its own only with the panel on that edition', () => {
    const own = { bodyText: { fontFamily: 'Lora' } };
    expect(render({ scope: 'edition', own })).toContain('1 settings set for español only');
    expect(render({ scope: 'all', own })).not.toContain('settings set for');
  });

  it('names the chapter style control in a book in one language, with the same menu', () => {
    const html = render({ config: STYLES });
    expect(html).not.toContain('role="radiogroup"');
    expect(html).toContain(`>${DEFAULT_LABELS.chapterStyleBarLabel}</span>`);
    expect(html).toContain(`aria-label="${DEFAULT_LABELS.chapterStyleBarLabel}: ${DEFAULT_LABELS.chapterStyleBook}"`);
    // No rule over the bar while the book itself is edited.
    expect(html).not.toContain('border-top');
  });

  it('shows the style being edited under the row: what it means, its name, delete and back', () => {
    const html = render({ config: STYLES, scope: 'all', editing: 'appendix' });
    expect(html).toContain(`aria-label="${DEFAULT_LABELS.chapterStyleBarLabel}: Appendix"`);
    expect(html).toContain('value="Appendix"');
    expect(html).toContain(DEFAULT_LABELS.chapterStyleBack);
    expect(html).toContain(DEFAULT_LABELS.chapterStyleDelete);
    // Every place the note names the style's id has it.
    expect(html).not.toContain('__id__');
    expect(count(html, 'appendix')).toBeGreaterThanOrEqual(2);
    expect(html).toContain('border-top:3px solid var(--edition, var(--brand))');
    // A style that is gone is not edited.
    expect(render({ config: STYLES, editing: 'nope' })).not.toContain(DEFAULT_LABELS.chapterStyleBack);
  });
});
