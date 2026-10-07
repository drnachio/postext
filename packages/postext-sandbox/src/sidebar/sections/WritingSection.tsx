'use client';

import { memo } from 'react';
import type { DigitSystem, LayoutConfig, LocaleTag, NumeralsSetting, PageConfig } from 'postext';
import { isJapaneseLanguage } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { relocalizedResourceTypes } from '../../context/defaultConfig';
import { ChoiceInput, CollapsibleSection, SelectInput } from '../../controls';
import { WritingModePicture } from '../settings/pictures';
import { documentLocaleOptionsFor } from './BodyTextSection/constants';
import { defaultDocumentLocale } from '../../controls/hyphenation';
import { ChineseDefaultsField } from './ChineseDefaultsField';
import { ArabicDefaultsField } from './ArabicDefaultsField';
import { JapaneseDefaultsField } from './JapaneseDefaultsField';
import { isArabicScriptLanguage } from '../../context/arabicDefaults';
import { documentComicDirection, documentDigits, documentDirection, documentLanguage } from '../../context/documentDirection';

/**
 * Language and direction: the document language (`locale`), the direction
 * of the text (`direction`), the writing mode (`layout.writingMode`), the
 * binding (`page.binding`), the digits of generated numbers (`numerals`),
 * and the "Chinese defaults", "Arabic defaults" and "Japanese defaults"
 * actions that set a book up for each in one step. The two nested keys are edited here, not
 * under Page & columns, because the direction of the lines decides page
 * progression and binding.
 */
export const WritingSection = memo(function WritingSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const uiLocale = useSandboxSelector((s) => s.locale);
  const documentLocale = useSandboxSelector((s) => s.config.locale);
  const hyphenationLocale = useSandboxSelector((s) => s.config.bodyText?.hyphenation?.locale);
  const resourceTypes = useSandboxSelector((s) => s.config.resourceTypes);
  const rawLayout = useSandboxSelector((s) => s.config.layout);
  const rawPage = useSandboxSelector((s) => s.config.page);
  const rawDirection = useSandboxSelector((s) => s.config.direction);
  const rawNumerals = useSandboxSelector((s) => s.config.numerals);
  const rawComics = useSandboxSelector((s) => s.config.comics);

  const defaultLocale = defaultDocumentLocale(uiLocale);
  const effectiveDocumentLocale = documentLocale ?? defaultLocale;
  const writingMode = rawLayout?.writingMode ?? 'horizontal-tb';
  const binding = rawPage?.binding ?? 'auto';
  // What Auto means here: the direction and digits of the language (the
  // engine reads the hyphenation locale when the book names no language),
  // and the binding of vertical or right-to-left text and of a comic book
  // read right to left.
  const language = documentLanguage({ locale: documentLocale, bodyText: { hyphenation: { locale: hyphenationLocale } } }, defaultLocale);
  const direction = rawDirection === 'ltr' || rawDirection === 'rtl' ? rawDirection : 'auto';
  const autoDirection = documentDirection(undefined, language);
  const resolvedDirection = documentDirection(rawDirection, language);
  const comicDirection = documentComicDirection({ comics: rawComics }, language, writingMode, resolvedDirection);
  const autoBinding = writingMode === 'vertical-rl' || resolvedDirection === 'rtl' || comicDirection === 'rtl' ? 'right' : 'left';
  const numerals: NumeralsSetting = rawNumerals === 'latn' || rawNumerals === 'arab' || rawNumerals === 'arabext' ? rawNumerals : 'auto';
  const autoDigits = documentDigits(undefined, language);
  const auto = (name: string) => labels.cjkAuto.replace('__value__', name);
  const digitsLabel = (d: DigitSystem) =>
    d === 'arab' ? labels.numeralsArab : d === 'arabext' ? labels.numeralsArabext : labels.numeralsLatn;

  // Built-in resource types still in the language the document was in (or
  // the interface's, which seeds a new book) follow the new one: "Figura"
  // becomes 图; renamed types stay as they are.
  const relocalized = (next: string) => {
    const previous = documentLocale ?? hyphenationLocale ?? uiLocale;
    const types = relocalizedResourceTypes(resourceTypes, [previous, uiLocale], next);
    return types ? { resourceTypes: types } : {};
  };
  const updateDocumentLocale = (value: LocaleTag | undefined) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { locale: value, ...relocalized(value ?? hyphenationLocale ?? uiLocale) } });
  };

  const setWritingMode = (v: string) => {
    const next: LayoutConfig = { ...rawLayout };
    if (v === 'vertical-rl') next.writingMode = 'vertical-rl';
    else delete next.writingMode;
    dispatch({ type: 'UPDATE_CONFIG', payload: { layout: Object.keys(next).length > 0 ? next : undefined } });
  };
  const setDirection = (v: string) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { direction: v === 'ltr' || v === 'rtl' ? v : undefined } });
  };
  const setNumerals = (v: string) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { numerals: v === 'latn' || v === 'arab' || v === 'arabext' ? v : undefined } });
  };
  const setBinding = (v: string) => {
    const next: PageConfig = { ...rawPage };
    if (v === 'left' || v === 'right') next.binding = v;
    else delete next.binding;
    dispatch({ type: 'UPDATE_CONFIG', payload: { page: Object.keys(next).length > 0 ? next : undefined } });
  };

  const reset = () => {
    const layout: LayoutConfig | undefined = rawLayout ? { ...rawLayout } : undefined;
    if (layout) delete layout.writingMode;
    const page: PageConfig | undefined = rawPage ? { ...rawPage } : undefined;
    if (page) delete page.binding;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: {
        locale: undefined,
        direction: undefined,
        numerals: undefined,
        ...relocalized(hyphenationLocale ?? uiLocale),
        layout: layout && Object.keys(layout).length > 0 ? layout : undefined,
        page: page && Object.keys(page).length > 0 ? page : undefined,
      },
    });
  };

  const hasOverrides = documentLocale !== undefined || rawDirection !== undefined || rawNumerals !== undefined
    || rawLayout?.writingMode !== undefined || rawPage?.binding !== undefined;

  return (
    <CollapsibleSection
      title={labels.writingSection}
      sectionId="writing"
      onReset={reset}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <SelectInput
        label={labels.documentLocale}
        value={effectiveDocumentLocale}
        options={documentLocaleOptionsFor(effectiveDocumentLocale)}
        onChange={(v) => updateDocumentLocale(v)}
        tooltip={labels.documentLocaleTooltip}
        isDefault={documentLocale === undefined}
        onReset={() => updateDocumentLocale(undefined)}
      />
      <SelectInput
        label={labels.documentDirection}
        value={direction}
        options={[
          { value: 'auto', label: auto(autoDirection === 'rtl' ? labels.documentDirectionRtl : labels.documentDirectionLtr) },
          { value: 'ltr', label: labels.documentDirectionLtr },
          { value: 'rtl', label: labels.documentDirectionRtl },
        ]}
        onChange={setDirection}
        tooltip={labels.documentDirectionTooltip}
        isDefault={direction === 'auto'}
        onReset={() => setDirection('auto')}
      />
      <ChoiceInput
        label={labels.writingMode}
        value={writingMode}
        options={[
          {
            value: 'horizontal-tb',
            label: labels.writingModeHorizontal,
            description: labels.writingModeHorizontalDescription,
            picture: <WritingModePicture mode="horizontal-tb" />,
          },
          {
            value: 'vertical-rl',
            label: labels.writingModeVerticalShort,
            description: labels.writingModeVerticalDescription,
            picture: <WritingModePicture mode="vertical-rl" />,
          },
        ]}
        onChange={setWritingMode}
        tooltip={labels.writingModeTooltip}
        isDefault={writingMode === 'horizontal-tb'}
        onReset={() => setWritingMode('horizontal-tb')}
      />
      <SelectInput
        label={labels.binding}
        value={binding}
        options={[
          { value: 'auto', label: auto(autoBinding === 'right' ? labels.bindingRight : labels.bindingLeft) },
          { value: 'left', label: labels.bindingLeft },
          { value: 'right', label: labels.bindingRight },
        ]}
        onChange={setBinding}
        tooltip={labels.bindingTooltip}
        isDefault={binding === 'auto'}
        onReset={() => setBinding('auto')}
      />
      <SelectInput
        label={labels.numerals}
        value={numerals}
        options={[
          { value: 'auto', label: auto(digitsLabel(autoDigits)) },
          ...(['latn', 'arab', 'arabext'] as const).map((d) => ({ value: d, label: digitsLabel(d) })),
        ]}
        onChange={setNumerals}
        tooltip={labels.numeralsTooltip}
        isDefault={numerals === 'auto'}
        onReset={() => setNumerals('auto')}
      />
      <ChineseDefaultsField />
      {isArabicScriptLanguage(language) && <ArabicDefaultsField locale={language} />}
      {isJapaneseLanguage(language) && <JapaneseDefaultsField />}
    </CollapsibleSection>
  );
});
