// "Words kept whole" (#1530): which lists the field offers, by the book's
// languages and the config layer in scope, and what it shows.

import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { resolveBodyTextConfig, type BodyTextConfig } from 'postext';
import { SandboxStoreContext } from '../../../../context/SandboxContext.js';
import { FieldLayerContext, type FieldLayerValue } from '../../../../controls/fieldLayer.js';
import { DEFAULT_LABELS } from '../../../../types/defaultLabels.js';
import { HyphenationExceptionsField, exceptionListLanguages, passageLanguages } from './HyphenationExceptionsField.js';

const layer = (scope: 'all' | 'edition', locale: string, locales: string[]) => ({ scope, locale, locales });

describe('exceptionListLanguages', () => {
  it('offers no language in a book with one language and no chapter in another', () => {
    expect(exceptionListLanguages({ layer: null, documentTag: 'es', chapterStyles: undefined, stored: undefined })).toEqual([]);
  });

  it('offers the document\'s language and a chapter style\'s other dictionary', () => {
    const chapterStyles = [{ id: 'appendix', config: { bodyText: { hyphenation: { locale: 'en-GB' } } } }];
    expect(exceptionListLanguages({ layer: null, documentTag: 'es', chapterStyles, stored: undefined })).toEqual(['es', 'en-GB']);
  });

  it('offers the languages the passages of the text name (#1547)', () => {
    const markdown = ':::paragraphs{dir=ltr lang=fr}\nTexte.\n:::\n\nUn :ltr[word]{lang="en-GB"} y :::verse{lang=el}';
    expect(passageLanguages(markdown)).toEqual(['fr', 'en-GB', 'el']);
    expect(exceptionListLanguages({ layer: null, documentTag: 'es', chapterStyles: undefined, stored: undefined, passages: passageLanguages(markdown) })).toEqual(['es', 'fr', 'en-GB']);
  });

  it('offers a list already written, and never a language without patterns', () => {
    expect(exceptionListLanguages({ layer: null, documentTag: 'es', chapterStyles: undefined, stored: { es: ['ca-mi-no'], el: ['x'] } })).toEqual(['es']);
  });

  it('offers every edition with patterns of its own in the scope of all languages, one tag per dictionary', () => {
    expect(exceptionListLanguages({ layer: layer('all', 'es', ['es', 'en', 'en-GB', 'ar']), documentTag: 'es', chapterStyles: undefined, stored: undefined })).toEqual(['es', 'en']);
  });

  it('in one edition\'s scope offers its own language only once it has a list', () => {
    expect(exceptionListLanguages({ layer: layer('edition', 'es', ['es', 'en']), documentTag: 'es', chapterStyles: undefined, stored: { en: ['Alice'] } })).toEqual([]);
    expect(exceptionListLanguages({ layer: layer('edition', 'es', ['es', 'en']), documentTag: 'es', chapterStyles: undefined, stored: { 'es-ES': ['ca-mi-no'] } })).toEqual(['es']);
  });

  it('reads a chapter style being edited as a book of one language', () => {
    const style = { ...layer('edition', 'appendix', ['appendix']), wording: { own: '', general: '', useGeneral: '', promote: '', mark: '' } };
    expect(exceptionListLanguages({ layer: style, documentTag: 'es', chapterStyles: undefined, stored: undefined })).toEqual([]);
  });
});

function render(raw: BodyTextConfig, fieldLayer: Partial<FieldLayerValue> | null): string {
  const state = { config: {}, resources: [], labels: DEFAULT_LABELS, locale: 'en' };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  const bodyText = resolveBodyTextConfig({ textAlign: 'justify', ...raw });
  const field = h(HyphenationExceptionsField, { bodyText, raw, updateBodyText: () => {}, labels: DEFAULT_LABELS });
  const inner: ReactNode = fieldLayer ? h(FieldLayerContext, { value: fieldLayer as FieldLayerValue }, field) : field;
  return renderToString(h(SandboxStoreContext, { value: store as never }, inner));
}

describe('HyphenationExceptionsField', () => {
  it('shows the list of every language, with Import and Export buttons, in a book of one language', () => {
    const html = render({ hyphenation: { exceptions: ['Alice', 'You-Tube'] } }, null);
    expect(html).not.toContain(DEFAULT_LABELS.bodyHyphenationExceptionsList);
    expect(html).toContain('Alice, You-Tube');
    expect(html).toContain(`>${DEFAULT_LABELS.bodyHyphenationExceptionsImport}<`);
    expect(html).toContain(`>${DEFAULT_LABELS.bodyHyphenationExceptionsExport}<`);
    // The file input is reached through the Import button only.
    expect(html).toMatch(/<input[^>]*type="file"[^>]*aria-hidden="true"[^>]*tabindex="-1"/);
  });

  it('offers the editions\' lists in the scope of every language', () => {
    const html = render({ hyphenation: { exceptions: ['Alice'], exceptionsByLanguage: { es: ['ca-mi-no'] } } }, layer('all', 'es', ['es', 'en']));
    expect(html).toContain(DEFAULT_LABELS.bodyHyphenationExceptionsList);
    expect(html).toContain(DEFAULT_LABELS.bodyHyphenationExceptionsAllLanguages);
    // The list of every language is the one shown first.
    expect(html).toContain('value="Alice"');
  });
});
