'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext';
import { resolveBodyTextConfig, DEFAULT_BODY_TEXT_CONFIG, DEFAULT_HYPHENATION_CONFIG, dimensionsEqual, colorsEqual } from 'postext';
import type { BodyTextConfig, HyphenationConfig } from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  NumberInput,
  SelectInput,
  ToggleSwitch,
} from '../../../controls';
import { LOCALE_TO_HYPHENATION, TEXT_SIZE_UNITS, LINE_HEIGHT_UNITS, INDENT_UNITS } from './constants';
import { JustificationSubsection } from './JustificationSubsection';
import { OrphansSubsection, WidowsSubsection, RuntsSubsection } from './OrphansWidowsRuntsSubsections';

const D = DEFAULT_BODY_TEXT_CONFIG;

export const BodyTextSection = memo(function BodyTextSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.bodyText);
  const locale = useSandboxSelector((s) => s.locale);
  const bodyText = resolveBodyTextConfig(raw);
  const defaultLocale = LOCALE_TO_HYPHENATION[locale] ?? 'en-us';

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
  const isParagraphSpacingDefault = bodyText.paragraphSpacing === D.paragraphSpacing;
  const isColorDefault = colorsEqual(bodyText.color, D.color);
  const isBoldColorDefault = bodyText.boldColor === undefined;
  const isItalicColorDefault = bodyText.italicColor === undefined;
  const DEFAULT_BOLD_COLOR = bodyText.boldColor ?? bodyText.color;
  const DEFAULT_ITALIC_COLOR = bodyText.italicColor ?? bodyText.color;
  const isTextAlignDefault = bodyText.textAlign === D.textAlign;
  const isFontWeightDefault = bodyText.fontWeight === D.fontWeight;
  const isBoldFontWeightDefault = bodyText.boldFontWeight === D.boldFontWeight;
  const isHyphenationEnabledDefault = bodyText.hyphenation.enabled === DEFAULT_HYPHENATION_CONFIG.enabled;
  const isHyphenationLocaleDefault = effectiveHyphenationLocale === defaultLocale;
  const isFirstLineIndentDefault = dimensionsEqual(bodyText.firstLineIndent, D.firstLineIndent);
  const isHangingIndentDefault = bodyText.hangingIndent === D.hangingIndent;
  const isIndentAfterHeadingDefault = bodyText.indentAfterHeading === D.indentAfterHeading;
  const isMaxWordSpacingDefault = bodyText.maxWordSpacing === D.maxWordSpacing;
  const isMinWordSpacingDefault = bodyText.minWordSpacing === D.minWordSpacing;
  const isOptimalLineBreakingDefault = bodyText.optimalLineBreaking === D.optimalLineBreaking;
  const isAvoidOrphansDefault = bodyText.avoidOrphans === D.avoidOrphans;
  const isOrphanMinLinesDefault = bodyText.orphanMinLines === D.orphanMinLines;
  const isOrphanPenaltyDefault = bodyText.orphanPenalty === D.orphanPenalty;
  const isAvoidOrphansInListsDefault = bodyText.avoidOrphansInLists === D.avoidOrphansInLists;
  const isAvoidWidowsDefault = bodyText.avoidWidows === D.avoidWidows;
  const isWidowMinLinesDefault = bodyText.widowMinLines === D.widowMinLines;
  const isWidowPenaltyDefault = bodyText.widowPenalty === D.widowPenalty;
  const isAvoidWidowsInListsDefault = bodyText.avoidWidowsInLists === D.avoidWidowsInLists;
  const isSlackWeightDefault = bodyText.slackWeight === D.slackWeight;
  const isAvoidRuntsDefault = bodyText.avoidRunts === D.avoidRunts;
  const isRuntMinCharactersDefault = bodyText.runtMinCharacters === D.runtMinCharacters;
  const isRuntPenaltyDefault = bodyText.runtPenalty === D.runtPenalty;
  const isAvoidRuntsInListsDefault = bodyText.avoidRuntsInLists === D.avoidRuntsInLists;
  const isKeepColonWithListDefault = bodyText.keepColonWithList === D.keepColonWithList;

  const ALIGN_OPTIONS = [
    { value: 'left', label: labels.bodyTextAlignLeft },
    { value: 'justify', label: labels.bodyTextAlignJustify },
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

      <ToggleSwitch
        label={labels.bodyParagraphSpacing}
        checked={bodyText.paragraphSpacing}
        onChange={(checked) => updateBodyText({ paragraphSpacing: checked })}
        tooltip={labels.bodyParagraphSpacingTooltip}
        isDefault={isParagraphSpacingDefault}
        onReset={() => resetField('paragraphSpacing')}
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

      <ColorPicker
        label={labels.bodyBoldColor}
        value={DEFAULT_BOLD_COLOR}
        onChange={(color) => updateBodyText({ boldColor: color })}
        tooltip={labels.bodyBoldColorTooltip}
        isDefault={isBoldColorDefault}
        onReset={() => resetField('boldColor')}
        fieldId="bodyText-boldColor"
      />

      <ColorPicker
        label={labels.bodyItalicColor}
        value={DEFAULT_ITALIC_COLOR}
        onChange={(color) => updateBodyText({ italicColor: color })}
        tooltip={labels.bodyItalicColorTooltip}
        isDefault={isItalicColorDefault}
        onReset={() => resetField('italicColor')}
        fieldId="bodyText-italicColor"
      />

      <NumberInput
        label={labels.bodyFontWeight}
        value={bodyText.fontWeight}
        onChange={(w) => updateBodyText({ fontWeight: w })}
        min={100}
        max={900}
        step={10}
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
        step={10}
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

      <ToggleSwitch
        label={labels.bodyIndentAfterHeading}
        checked={bodyText.indentAfterHeading}
        onChange={(checked) => updateBodyText({ indentAfterHeading: checked })}
        tooltip={labels.bodyIndentAfterHeadingTooltip}
        isDefault={isIndentAfterHeadingDefault}
        onReset={() => resetField('indentAfterHeading')}
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
        <JustificationSubsection
          bodyText={bodyText}
          raw={raw}
          effectiveHyphenationLocale={effectiveHyphenationLocale}
          isHyphenationEnabledDefault={isHyphenationEnabledDefault}
          isHyphenationLocaleDefault={isHyphenationLocaleDefault}
          isMaxWordSpacingDefault={isMaxWordSpacingDefault}
          isMinWordSpacingDefault={isMinWordSpacingDefault}
          isOptimalLineBreakingDefault={isOptimalLineBreakingDefault}
          updateBodyText={updateBodyText}
          updateHyphenation={updateHyphenation}
          resetField={resetField}
          labels={labels}
        />
      )}

      <ToggleSwitch
        label={labels.bodyAvoidOrphans}
        checked={bodyText.avoidOrphans}
        onChange={(checked) => updateBodyText({ avoidOrphans: checked })}
        tooltip={labels.bodyAvoidOrphansTooltip}
        isDefault={isAvoidOrphansDefault}
        onReset={() => resetField('avoidOrphans')}
      />

      {bodyText.avoidOrphans && (
        <OrphansSubsection
          bodyText={bodyText}
          isOrphanMinLinesDefault={isOrphanMinLinesDefault}
          isOrphanPenaltyDefault={isOrphanPenaltyDefault}
          isAvoidOrphansInListsDefault={isAvoidOrphansInListsDefault}
          updateBodyText={updateBodyText}
          resetField={resetField}
          labels={labels}
        />
      )}

      <ToggleSwitch
        label={labels.bodyAvoidWidows}
        checked={bodyText.avoidWidows}
        onChange={(checked) => updateBodyText({ avoidWidows: checked })}
        tooltip={labels.bodyAvoidWidowsTooltip}
        isDefault={isAvoidWidowsDefault}
        onReset={() => resetField('avoidWidows')}
      />

      {bodyText.avoidWidows && (
        <WidowsSubsection
          bodyText={bodyText}
          isWidowMinLinesDefault={isWidowMinLinesDefault}
          isWidowPenaltyDefault={isWidowPenaltyDefault}
          isAvoidWidowsInListsDefault={isAvoidWidowsInListsDefault}
          updateBodyText={updateBodyText}
          resetField={resetField}
          labels={labels}
        />
      )}

      <NumberInput
        label={labels.bodySlackWeight}
        value={bodyText.slackWeight}
        onChange={(v) => updateBodyText({ slackWeight: v })}
        min={0}
        max={1000}
        step={1}
        tooltip={labels.bodySlackWeightTooltip}
        isDefault={isSlackWeightDefault}
        onReset={() => resetField('slackWeight')}
      />

      <ToggleSwitch
        label={labels.bodyAvoidRunts}
        checked={bodyText.avoidRunts}
        onChange={(checked) => updateBodyText({ avoidRunts: checked })}
        tooltip={labels.bodyAvoidRuntsTooltip}
        isDefault={isAvoidRuntsDefault}
        onReset={() => resetField('avoidRunts')}
      />

      {bodyText.avoidRunts && (
        <RuntsSubsection
          bodyText={bodyText}
          isRuntMinCharactersDefault={isRuntMinCharactersDefault}
          isRuntPenaltyDefault={isRuntPenaltyDefault}
          isAvoidRuntsInListsDefault={isAvoidRuntsInListsDefault}
          updateBodyText={updateBodyText}
          resetField={resetField}
          labels={labels}
        />
      )}

      <ToggleSwitch
        label={labels.bodyKeepColonWithList}
        checked={bodyText.keepColonWithList}
        onChange={(checked) => updateBodyText({ keepColonWithList: checked })}
        tooltip={labels.bodyKeepColonWithListTooltip}
        isDefault={isKeepColonWithListDefault}
        onReset={() => resetField('keepColonWithList')}
      />
    </CollapsibleSection>
  );
});
