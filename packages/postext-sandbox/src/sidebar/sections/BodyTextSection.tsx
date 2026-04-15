'use client';

import { useSandbox } from '../../context/SandboxContext';
import { resolveBodyTextConfig, DEFAULT_BODY_TEXT_CONFIG, DEFAULT_HYPHENATION_CONFIG, dimensionsEqual, colorsEqual } from 'postext';
import type { BodyTextConfig, HyphenationConfig, HyphenationLocale } from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  NumberInput,
  SelectInput,
  ToggleSwitch,
  NestedGroup,
} from '../../controls';
import type { DimensionUnit } from 'postext';

const LOCALE_TO_HYPHENATION: Record<string, HyphenationLocale> = {
  en: 'en-us',
  es: 'es',
  fr: 'fr',
  de: 'de',
  it: 'it',
  pt: 'pt',
  ca: 'ca',
  nl: 'nl',
};

const TEXT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
const LINE_HEIGHT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const INDENT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];

const D = DEFAULT_BODY_TEXT_CONFIG;

export function BodyTextSection() {
  const { state, dispatch } = useSandbox();
  const raw = state.config.bodyText;
  const bodyText = resolveBodyTextConfig(raw);
  const { labels } = state;
  const defaultLocale = LOCALE_TO_HYPHENATION[state.locale] ?? 'en-us';

  // Use app locale as the effective default when user hasn't explicitly set one
  const effectiveHyphenationLocale = raw?.hyphenation?.locale ?? defaultLocale;

  const updateBodyText = (partial: Partial<BodyTextConfig>) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { bodyText: { ...raw, ...partial } },
    });
  };

  const resetBodyText = () => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { bodyText: undefined },
    });
  };

  const resetField = (field: keyof BodyTextConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { bodyText: hasKeys ? next : undefined },
    });
  };

  const updateHyphenation = (partial: Partial<HyphenationConfig>) => {
    updateBodyText({ hyphenation: { ...raw?.hyphenation, ...partial } });
  };

  const handleTextAlignChange = (value: string) => {
    const textAlign = value as BodyTextConfig['textAlign'];
    if (textAlign === 'left') {
      const next: BodyTextConfig = { ...raw, textAlign };
      delete next.hyphenation;
      const hasKeys = Object.keys(next).length > 0;
      dispatch({
        type: 'UPDATE_CONFIG',
        payload: { bodyText: hasKeys ? next : undefined },
      });
    } else {
      updateBodyText({ textAlign });
    }
  };

  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  const isFontDefault = bodyText.fontFamily === D.fontFamily;
  const isSizeDefault = dimensionsEqual(bodyText.fontSize, D.fontSize);
  const isLineHeightDefault = dimensionsEqual(bodyText.lineHeight, D.lineHeight);
  const isColorDefault = colorsEqual(bodyText.color, D.color);
  const isTextAlignDefault = bodyText.textAlign === D.textAlign;
  const isFontWeightDefault = bodyText.fontWeight === D.fontWeight;
  const isBoldFontWeightDefault = bodyText.boldFontWeight === D.boldFontWeight;
  const isHyphenationEnabledDefault = bodyText.hyphenation.enabled === DEFAULT_HYPHENATION_CONFIG.enabled;
  const isHyphenationLocaleDefault = effectiveHyphenationLocale === defaultLocale;
  const isFirstLineIndentDefault = dimensionsEqual(bodyText.firstLineIndent, D.firstLineIndent);
  const isHangingIndentDefault = bodyText.hangingIndent === D.hangingIndent;

  const ALIGN_OPTIONS = [
    { value: 'left', label: labels.bodyTextAlignLeft },
    { value: 'justify', label: labels.bodyTextAlignJustify },
  ];

  const LOCALE_OPTIONS = [
    { value: 'en-us', label: 'English' },
    { value: 'es', label: 'Español' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
    { value: 'it', label: 'Italiano' },
    { value: 'pt', label: 'Português' },
    { value: 'ca', label: 'Català' },
    { value: 'nl', label: 'Nederlands' },
  ];

  return (
    <CollapsibleSection
      title={labels.bodyText}
      sectionId="bodyText"
      onReset={resetBodyText}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <FontPicker
        label={labels.bodyFont}
        value={bodyText.fontFamily}
        onChange={(font) => updateBodyText({ fontFamily: font })}
        tooltip={labels.bodyFontTooltip}
        isDefault={isFontDefault}
        onReset={() => resetField('fontFamily')}
        searchPlaceholder={labels.bodyFontSearch}
        noResultsLabel={labels.bodyFontNoResults}
      />

      <DimensionInput
        label={labels.bodyFontSize}
        value={bodyText.fontSize}
        onChange={(dim) => updateBodyText({ fontSize: dim })}
        min={1}
        step={0.5}
        tooltip={labels.bodyFontSizeTooltip}
        isDefault={isSizeDefault}
        onReset={() => resetField('fontSize')}
        units={TEXT_SIZE_UNITS}
      />

      <DimensionInput
        label={labels.bodyLineHeight}
        value={bodyText.lineHeight}
        onChange={(dim) => updateBodyText({ lineHeight: dim })}
        min={0.5}
        max={5}
        step={0.1}
        tooltip={labels.bodyLineHeightTooltip}
        isDefault={isLineHeightDefault}
        onReset={() => resetField('lineHeight')}
        units={LINE_HEIGHT_UNITS}
      />

      <ColorPicker
        label={labels.bodyColor}
        value={bodyText.color}
        onChange={(color) => updateBodyText({ color })}
        tooltip={labels.bodyColorTooltip}
        isDefault={isColorDefault}
        onReset={() => resetField('color')}
        fieldId="bodyText-color"
      />

      <NumberInput
        label={labels.bodyFontWeight}
        value={bodyText.fontWeight}
        onChange={(w) => updateBodyText({ fontWeight: w })}
        min={100}
        max={900}
        step={100}
        tooltip={labels.bodyFontWeightTooltip}
        isDefault={isFontWeightDefault}
        onReset={() => resetField('fontWeight')}
      />

      <NumberInput
        label={labels.bodyBoldFontWeight}
        value={bodyText.boldFontWeight}
        onChange={(w) => updateBodyText({ boldFontWeight: w })}
        min={100}
        max={900}
        step={100}
        tooltip={labels.bodyBoldFontWeightTooltip}
        isDefault={isBoldFontWeightDefault}
        onReset={() => resetField('boldFontWeight')}
      />

      <DimensionInput
        label={labels.bodyFirstLineIndent}
        value={bodyText.firstLineIndent}
        onChange={(dim) => updateBodyText({ firstLineIndent: dim })}
        min={0}
        step={0.25}
        tooltip={labels.bodyFirstLineIndentTooltip}
        isDefault={isFirstLineIndentDefault}
        onReset={() => resetField('firstLineIndent')}
        units={INDENT_UNITS}
      />

      <ToggleSwitch
        label={labels.bodyHangingIndent}
        checked={bodyText.hangingIndent}
        onChange={(checked) => updateBodyText({ hangingIndent: checked })}
        tooltip={labels.bodyHangingIndentTooltip}
        isDefault={isHangingIndentDefault}
        onReset={() => resetField('hangingIndent')}
      />

      <SelectInput
        label={labels.bodyTextAlign}
        value={bodyText.textAlign}
        options={ALIGN_OPTIONS}
        onChange={handleTextAlignChange}
        tooltip={labels.bodyTextAlignTooltip}
        isDefault={isTextAlignDefault}
        onReset={() => {
          if (!raw) return;
          const next = { ...raw };
          delete next.textAlign;
          delete next.hyphenation;
          dispatch({ type: 'UPDATE_CONFIG', payload: { bodyText: Object.keys(next).length > 0 ? next : undefined } });
        }}
      />

      {bodyText.textAlign === 'justify' && (
        <NestedGroup>
          <ToggleSwitch
            label={labels.bodyHyphenation}
            checked={bodyText.hyphenation.enabled}
            onChange={(enabled) => updateHyphenation({ enabled })}
            tooltip={labels.bodyHyphenationTooltip}
            isDefault={isHyphenationEnabledDefault}
            onReset={() => {
              if (!raw?.hyphenation) return;
              const next = { ...raw.hyphenation };
              delete next.enabled;
              updateBodyText({ hyphenation: Object.keys(next).length > 0 ? next : undefined });
            }}
          />

          {bodyText.hyphenation.enabled && (
            <SelectInput
              label={labels.bodyHyphenationLocale}
              value={effectiveHyphenationLocale}
              options={LOCALE_OPTIONS}
              onChange={(locale) => updateHyphenation({ locale: locale as HyphenationConfig['locale'] })}
              tooltip={labels.bodyHyphenationLocaleTooltip}
              isDefault={isHyphenationLocaleDefault}
              onReset={() => {
                if (!raw?.hyphenation) return;
                const next = { ...raw.hyphenation };
                delete next.locale;
                updateBodyText({ hyphenation: Object.keys(next).length > 0 ? next : undefined });
              }}
            />
          )}
        </NestedGroup>
      )}
    </CollapsibleSection>
  );
}
