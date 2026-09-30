'use client';

import { memo } from 'react';
import type { LayoutConfig, LocaleTag, PageConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { relocalizedResourceTypes } from '../../context/defaultConfig';
import { ChoiceInput, CollapsibleSection, SelectInput } from '../../controls';
import { WritingModePicture } from '../settings/pictures';
import { LOCALE_TO_HYPHENATION, documentLocaleOptionsFor } from './BodyTextSection/constants';
import { ChineseDefaultsField } from './ChineseDefaultsField';

/**
 * Language and direction: the document language (`locale`), the writing
 * mode (`layout.writingMode`), the binding (`page.binding`), and the
 * "Chinese defaults" action that sets a book up for Chinese in one step.
 * The two nested keys are edited here, not under Page & columns, because
 * the direction of the lines decides page progression and binding.
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

  const defaultLocale = LOCALE_TO_HYPHENATION[uiLocale] ?? 'en-us';
  const effectiveDocumentLocale = documentLocale ?? defaultLocale;
  const writingMode = rawLayout?.writingMode ?? 'horizontal-tb';
  const binding = rawPage?.binding ?? 'auto';
  const autoBinding = writingMode === 'vertical-rl' ? 'right' : 'left';
  const auto = (name: string) => labels.cjkAuto.replace('__value__', name);

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
        ...relocalized(hyphenationLocale ?? uiLocale),
        layout: layout && Object.keys(layout).length > 0 ? layout : undefined,
        page: page && Object.keys(page).length > 0 ? page : undefined,
      },
    });
  };

  const hasOverrides = documentLocale !== undefined || rawLayout?.writingMode !== undefined || rawPage?.binding !== undefined;

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
      <ChineseDefaultsField />
    </CollapsibleSection>
  );
});
