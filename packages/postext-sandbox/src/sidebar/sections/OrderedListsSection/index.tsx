'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext';
import {
  resolveOrderedListsConfig,
  resolveBodyTextConfig,
  DEFAULT_ORDERED_LISTS_STATIC,
  dimensionsEqual,
  colorsEqual,
} from 'postext';
import type {
  OrderedListsConfig,
  OrderedListLevelConfig,
  OrderedListNumberFormat,
} from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  NumberInput,
  SelectInput,
  TextInput,
  ToggleSwitch,
} from '../../../controls';
import { OrderedListLevelSection } from './OrderedListLevelSection';
import { numberFormatOptions } from './numberFormat';
import { TEXT_SIZE_UNITS, INDENT_UNITS, MARGIN_UNITS, OFFSET_UNITS } from './units';

const D = DEFAULT_ORDERED_LISTS_STATIC;

export const OrderedListsSection = memo(function OrderedListsSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.orderedLists);
  const rawBodyText = useSandboxSelector((s) => s.config.bodyText);
  const bodyText = resolveBodyTextConfig(rawBodyText);
  const lists = resolveOrderedListsConfig(raw, bodyText);

  const updateLists = (partial: Partial<OrderedListsConfig>) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { orderedLists: { ...raw, ...partial } },
    });
  };

  const resetLists = () => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { orderedLists: undefined } });
  };

  const resetField = (field: keyof OrderedListsConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { orderedLists: hasKeys ? next : undefined },
    });
  };

  const updateLevel = (level: number, partial: Partial<OrderedListLevelConfig>) => {
    const currentLevels = raw?.levels ?? [];
    const existing = currentLevels.find((l) => l.level === level);
    const updated = existing
      ? { ...existing, ...partial }
      : { level, ...partial };
    const newLevels = existing
      ? currentLevels.map((l) => (l.level === level ? updated : l))
      : [...currentLevels, updated];
    updateLists({ levels: newLevels });
  };

  const resetLevelField = (level: number, field: keyof OrderedListLevelConfig) => {
    if (!raw?.levels) return;
    if (field === 'numberFormat') {
      const newLevels = raw.levels.filter((l) => l.level !== level);
      if (newLevels.length > 0) {
        updateLists({ levels: newLevels });
      } else {
        const next = { ...raw };
        delete next.levels;
        const hasKeys = Object.keys(next).length > 0;
        dispatch({
          type: 'UPDATE_CONFIG',
          payload: { orderedLists: hasKeys ? next : undefined },
        });
      }
      return;
    }
    const existing = raw.levels.find((l) => l.level === level);
    if (!existing) return;
    const next = { ...existing };
    delete next[field];
    const hasFields = Object.keys(next).filter((k) => k !== 'level').length > 0;
    if (hasFields) {
      const newLevels = raw.levels.map((l) => (l.level === level ? next : l));
      updateLists({ levels: newLevels });
    } else {
      const newLevels = raw.levels.filter((l) => l.level !== level);
      if (newLevels.length > 0) {
        updateLists({ levels: newLevels });
      } else {
        const r = { ...raw };
        delete r.levels;
        const hasKeys = Object.keys(r).length > 0;
        dispatch({
          type: 'UPDATE_CONFIG',
          payload: { orderedLists: hasKeys ? r : undefined },
        });
      }
    }
  };

  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  const isFontDefault = lists.fontFamily === bodyText.fontFamily;
  const isColorDefault = colorsEqual(lists.color, bodyText.color);
  const isFontWeightDefault = lists.fontWeight === D.fontWeight;
  const isItalicDefault = lists.italic === D.italic;
  const isNumberFormatDefault = lists.numberFormat === D.numberFormat;
  const isSeparatorDefault = lists.separator === D.separator;
  const isNumberFontSizeDefault = dimensionsEqual(lists.numberFontSize, D.numberFontSize);
  const isGapDefault = dimensionsEqual(lists.gap, D.gap);
  const isIndentDefault = dimensionsEqual(lists.indent, D.indent);
  const isVerticalOffsetDefault = dimensionsEqual(lists.numberVerticalOffset, D.numberVerticalOffset);
  const isMarginTopDefault = dimensionsEqual(lists.marginTop, D.marginTop);
  const isMarginBottomDefault = dimensionsEqual(lists.marginBottom, D.marginBottom);
  const isItemSpacingDefault = dimensionsEqual(lists.itemSpacing, D.itemSpacing);
  const isHangingDefault = lists.hangingIndent === D.hangingIndent;

  return (
    <CollapsibleSection
      title={labels.orderedLists}
      sectionId="ordered-lists"
      onReset={resetLists}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <SelectInput
        label={labels.orderedListsNumberFormat}
        value={lists.numberFormat}
        options={numberFormatOptions(labels)}
        onChange={(v) => updateLists({ numberFormat: v as OrderedListNumberFormat })}
        tooltip={labels.orderedListsNumberFormatTooltip}
        isDefault={isNumberFormatDefault}
        onReset={() => resetField('numberFormat')}
      />
      <TextInput
        label={labels.orderedListsSeparator}
        value={lists.separator}
        onChange={(v) => updateLists({ separator: v })}
        placeholder={labels.orderedListsSeparatorPlaceholder}
        tooltip={labels.orderedListsSeparatorTooltip}
        isDefault={isSeparatorDefault}
        onReset={() => resetField('separator')}
        widthCh={6}
      />
      <FontPicker
        label={labels.orderedListsFont}
        value={lists.fontFamily}
        onChange={(f) => updateLists({ fontFamily: f })}
        tooltip={labels.orderedListsFontTooltip}
        isDefault={isFontDefault}
        onReset={() => resetField('fontFamily')}
        searchPlaceholder={labels.orderedListsFontSearch}
        noResultsLabel={labels.orderedListsFontNoResults}
      />
      <ColorPicker
        label={labels.orderedListsColor}
        value={lists.color}
        onChange={(color) => updateLists({ color })}
        tooltip={labels.orderedListsColorTooltip}
        isDefault={isColorDefault}
        onReset={() => resetField('color')}
        fieldId="ordered-lists-color"
      />
      <NumberInput
        label={labels.orderedListsFontWeight}
        value={lists.fontWeight}
        onChange={(w) => updateLists({ fontWeight: w })}
        min={100}
        max={900}
        step={10}
        tooltip={labels.orderedListsFontWeightTooltip}
        isDefault={isFontWeightDefault}
        onReset={() => resetField('fontWeight')}
      />
      <ToggleSwitch
        label={labels.orderedListsItalic}
        checked={lists.italic}
        onChange={(v) => updateLists({ italic: v })}
        tooltip={labels.orderedListsItalicTooltip}
        isDefault={isItalicDefault}
        onReset={() => resetField('italic')}
      />
      <DimensionInput
        label={labels.orderedListsNumberFontSize}
        value={lists.numberFontSize}
        onChange={(dim) => updateLists({ numberFontSize: dim })}
        min={0.1}
        step={0.1}
        tooltip={labels.orderedListsNumberFontSizeTooltip}
        isDefault={isNumberFontSizeDefault}
        onReset={() => resetField('numberFontSize')}
        units={TEXT_SIZE_UNITS}
      />
      <DimensionInput
        label={labels.orderedListsGap}
        value={lists.gap}
        onChange={(dim) => updateLists({ gap: dim })}
        min={0}
        step={0.1}
        tooltip={labels.orderedListsGapTooltip}
        isDefault={isGapDefault}
        onReset={() => resetField('gap')}
        units={INDENT_UNITS}
      />
      <DimensionInput
        label={labels.orderedListsIndent}
        value={lists.indent}
        onChange={(dim) => updateLists({ indent: dim })}
        min={0}
        step={0.1}
        tooltip={labels.orderedListsIndentTooltip}
        isDefault={isIndentDefault}
        onReset={() => resetField('indent')}
        units={INDENT_UNITS}
      />
      <DimensionInput
        label={labels.orderedListsNumberVerticalOffset}
        value={lists.numberVerticalOffset}
        onChange={(dim) => updateLists({ numberVerticalOffset: dim })}
        min={-5}
        step={0.05}
        tooltip={labels.orderedListsNumberVerticalOffsetTooltip}
        isDefault={isVerticalOffsetDefault}
        onReset={() => resetField('numberVerticalOffset')}
        units={OFFSET_UNITS}
      />
      <DimensionInput
        label={labels.orderedListsMarginTop}
        value={lists.marginTop}
        onChange={(dim) => updateLists({ marginTop: dim })}
        min={0}
        step={0.1}
        tooltip={labels.orderedListsMarginTopTooltip}
        isDefault={isMarginTopDefault}
        onReset={() => resetField('marginTop')}
        units={MARGIN_UNITS}
      />
      <DimensionInput
        label={labels.orderedListsMarginBottom}
        value={lists.marginBottom}
        onChange={(dim) => updateLists({ marginBottom: dim })}
        min={0}
        step={0.1}
        tooltip={labels.orderedListsMarginBottomTooltip}
        isDefault={isMarginBottomDefault}
        onReset={() => resetField('marginBottom')}
        units={MARGIN_UNITS}
      />
      <DimensionInput
        label={labels.orderedListsItemSpacing}
        value={lists.itemSpacing}
        onChange={(dim) => updateLists({ itemSpacing: dim })}
        min={0}
        step={0.1}
        tooltip={labels.orderedListsItemSpacingTooltip}
        isDefault={isItemSpacingDefault}
        onReset={() => resetField('itemSpacing')}
        units={MARGIN_UNITS}
      />
      <ToggleSwitch
        label={labels.orderedListsHangingIndent}
        checked={lists.hangingIndent}
        onChange={(v) => updateLists({ hangingIndent: v })}
        tooltip={labels.orderedListsHangingIndentTooltip}
        isDefault={isHangingDefault}
        onReset={() => resetField('hangingIndent')}
      />

      {lists.levels.map((resolved) => (
        <OrderedListLevelSection
          key={resolved.level}
          level={resolved.level}
          resolved={resolved}
          raw={raw?.levels?.find((l) => l.level === resolved.level)}
          generalNumberFormat={lists.numberFormat}
          generalSeparator={lists.separator}
          generalFont={lists.fontFamily}
          generalFontSize={lists.numberFontSize}
          generalColor={lists.color}
          generalFontWeight={lists.fontWeight}
          generalItalic={lists.italic}
          generalIndent={lists.indent}
          generalVerticalOffset={lists.numberVerticalOffset}
          onUpdate={updateLevel}
          onReset={resetLevelField}
          labels={labels}
        />
      ))}
    </CollapsibleSection>
  );
});
