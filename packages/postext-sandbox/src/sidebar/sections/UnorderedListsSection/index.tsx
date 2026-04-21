'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext';
import {
  resolveUnorderedListsConfig,
  resolveBodyTextConfig,
  DEFAULT_UNORDERED_LISTS_STATIC,
  dimensionsEqual,
  colorsEqual,
} from 'postext';
import type {
  UnorderedListsConfig,
  UnorderedListLevelConfig,
} from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  NumberInput,
  TextInput,
  ToggleSwitch,
} from '../../../controls';
import { UnorderedListLevelSection } from './UnorderedListLevelSection';
import { TEXT_SIZE_UNITS, INDENT_UNITS, MARGIN_UNITS, OFFSET_UNITS } from './units';

const D = DEFAULT_UNORDERED_LISTS_STATIC;

export const UnorderedListsSection = memo(function UnorderedListsSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.unorderedLists);
  const rawBodyText = useSandboxSelector((s) => s.config.bodyText);
  const bodyText = resolveBodyTextConfig(rawBodyText);
  const lists = resolveUnorderedListsConfig(raw, bodyText);

  const updateLists = (partial: Partial<UnorderedListsConfig>) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { unorderedLists: { ...raw, ...partial } },
    });
  };

  const resetLists = () => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { unorderedLists: undefined } });
  };

  const resetField = (field: keyof UnorderedListsConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { unorderedLists: hasKeys ? next : undefined },
    });
  };

  const updateLevel = (level: number, partial: Partial<UnorderedListLevelConfig>) => {
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

  const resetLevelField = (level: number, field: keyof UnorderedListLevelConfig) => {
    if (!raw?.levels) return;
    if (field === 'bulletChar') {
      const newLevels = raw.levels.filter((l) => l.level !== level);
      if (newLevels.length > 0) {
        updateLists({ levels: newLevels });
      } else {
        const next = { ...raw };
        delete next.levels;
        const hasKeys = Object.keys(next).length > 0;
        dispatch({
          type: 'UPDATE_CONFIG',
          payload: { unorderedLists: hasKeys ? next : undefined },
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
          payload: { unorderedLists: hasKeys ? r : undefined },
        });
      }
    }
  };

  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  const isFontDefault = lists.fontFamily === bodyText.fontFamily;
  const isColorDefault = colorsEqual(lists.color, bodyText.color);
  const isFontWeightDefault = lists.fontWeight === D.fontWeight;
  const isItalicDefault = lists.italic === D.italic;
  const isBulletCharDefault = lists.bulletChar === D.bulletChar;
  const isBulletFontSizeDefault = dimensionsEqual(lists.bulletFontSize, D.bulletFontSize);
  const isGapDefault = dimensionsEqual(lists.gap, D.gap);
  const isIndentDefault = dimensionsEqual(lists.indent, D.indent);
  const isVerticalOffsetDefault = dimensionsEqual(lists.bulletVerticalOffset, D.bulletVerticalOffset);
  const isMarginTopDefault = dimensionsEqual(lists.marginTop, D.marginTop);
  const isMarginBottomDefault = dimensionsEqual(lists.marginBottom, D.marginBottom);
  const isItemSpacingDefault = dimensionsEqual(lists.itemSpacing, D.itemSpacing);
  const isHangingDefault = lists.hangingIndent === D.hangingIndent;
  const isTaskCheckboxDefault = lists.taskCheckboxChar === D.taskCheckboxChar;
  const isTaskCheckedDefault = lists.taskCheckedChar === D.taskCheckedChar;
  const isTaskStrikeDefault = lists.taskCompletedStrikethrough === D.taskCompletedStrikethrough;
  const isTaskCompletedColorDefault = lists.taskCompletedColor === undefined;

  return (
    <CollapsibleSection
      title={labels.unorderedLists}
      sectionId="unordered-lists"
      onReset={resetLists}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <TextInput
        label={labels.unorderedListsBulletChar}
        value={lists.bulletChar}
        onChange={(v) => updateLists({ bulletChar: v })}
        placeholder={labels.unorderedListsBulletCharPlaceholder}
        tooltip={labels.unorderedListsBulletCharTooltip}
        isDefault={isBulletCharDefault}
        onReset={() => resetField('bulletChar')}
        widthCh={6}
      />

      <FontPicker
        label={labels.unorderedListsFont}
        value={lists.fontFamily}
        onChange={(f) => updateLists({ fontFamily: f })}
        tooltip={labels.unorderedListsFontTooltip}
        isDefault={isFontDefault}
        onReset={() => resetField('fontFamily')}
        searchPlaceholder={labels.unorderedListsFontSearch}
        noResultsLabel={labels.unorderedListsFontNoResults}
      />

      <ColorPicker
        label={labels.unorderedListsColor}
        value={lists.color}
        onChange={(color) => updateLists({ color })}
        tooltip={labels.unorderedListsColorTooltip}
        isDefault={isColorDefault}
        onReset={() => resetField('color')}
        fieldId="unordered-lists-color"
      />

      <NumberInput
        label={labels.unorderedListsFontWeight}
        value={lists.fontWeight}
        onChange={(w) => updateLists({ fontWeight: w })}
        min={100}
        max={900}
        step={10}
        tooltip={labels.unorderedListsFontWeightTooltip}
        isDefault={isFontWeightDefault}
        onReset={() => resetField('fontWeight')}
      />

      <ToggleSwitch
        label={labels.unorderedListsItalic}
        checked={lists.italic}
        onChange={(v) => updateLists({ italic: v })}
        tooltip={labels.unorderedListsItalicTooltip}
        isDefault={isItalicDefault}
        onReset={() => resetField('italic')}
      />

      <DimensionInput
        label={labels.unorderedListsBulletFontSize}
        value={lists.bulletFontSize}
        onChange={(dim) => updateLists({ bulletFontSize: dim })}
        min={0.1}
        step={0.1}
        tooltip={labels.unorderedListsBulletFontSizeTooltip}
        isDefault={isBulletFontSizeDefault}
        onReset={() => resetField('bulletFontSize')}
        units={TEXT_SIZE_UNITS}
      />

      <DimensionInput
        label={labels.unorderedListsGap}
        value={lists.gap}
        onChange={(dim) => updateLists({ gap: dim })}
        min={0}
        step={0.1}
        tooltip={labels.unorderedListsGapTooltip}
        isDefault={isGapDefault}
        onReset={() => resetField('gap')}
        units={INDENT_UNITS}
      />

      <DimensionInput
        label={labels.unorderedListsIndent}
        value={lists.indent}
        onChange={(dim) => updateLists({ indent: dim })}
        min={0}
        step={0.1}
        tooltip={labels.unorderedListsIndentTooltip}
        isDefault={isIndentDefault}
        onReset={() => resetField('indent')}
        units={INDENT_UNITS}
      />

      <DimensionInput
        label={labels.unorderedListsBulletVerticalOffset}
        value={lists.bulletVerticalOffset}
        onChange={(dim) => updateLists({ bulletVerticalOffset: dim })}
        min={-5}
        step={0.05}
        tooltip={labels.unorderedListsBulletVerticalOffsetTooltip}
        isDefault={isVerticalOffsetDefault}
        onReset={() => resetField('bulletVerticalOffset')}
        units={OFFSET_UNITS}
      />

      <DimensionInput
        label={labels.unorderedListsMarginTop}
        value={lists.marginTop}
        onChange={(dim) => updateLists({ marginTop: dim })}
        min={0}
        step={0.1}
        tooltip={labels.unorderedListsMarginTopTooltip}
        isDefault={isMarginTopDefault}
        onReset={() => resetField('marginTop')}
        units={MARGIN_UNITS}
      />

      <DimensionInput
        label={labels.unorderedListsMarginBottom}
        value={lists.marginBottom}
        onChange={(dim) => updateLists({ marginBottom: dim })}
        min={0}
        step={0.1}
        tooltip={labels.unorderedListsMarginBottomTooltip}
        isDefault={isMarginBottomDefault}
        onReset={() => resetField('marginBottom')}
        units={MARGIN_UNITS}
      />

      <DimensionInput
        label={labels.unorderedListsItemSpacing}
        value={lists.itemSpacing}
        onChange={(dim) => updateLists({ itemSpacing: dim })}
        min={0}
        step={0.1}
        tooltip={labels.unorderedListsItemSpacingTooltip}
        isDefault={isItemSpacingDefault}
        onReset={() => resetField('itemSpacing')}
        units={MARGIN_UNITS}
      />

      <ToggleSwitch
        label={labels.unorderedListsHangingIndent}
        checked={lists.hangingIndent}
        onChange={(v) => updateLists({ hangingIndent: v })}
        tooltip={labels.unorderedListsHangingIndentTooltip}
        isDefault={isHangingDefault}
        onReset={() => resetField('hangingIndent')}
      />

      {lists.levels.map((resolved) => (
        <UnorderedListLevelSection
          key={resolved.level}
          level={resolved.level}
          resolved={resolved}
          raw={raw?.levels?.find((l) => l.level === resolved.level)}
          generalBulletChar={lists.bulletChar}
          generalFont={lists.fontFamily}
          generalFontSize={lists.bulletFontSize}
          generalColor={lists.color}
          generalFontWeight={lists.fontWeight}
          generalItalic={lists.italic}
          generalIndent={lists.indent}
          generalVerticalOffset={lists.bulletVerticalOffset}
          onUpdate={updateLevel}
          onReset={resetLevelField}
          labels={labels}
        />
      ))}

      <CollapsibleSection
        title={labels.taskLists}
        sectionId="unordered-lists-task"
        onReset={() => {
          resetField('taskCheckboxChar');
          resetField('taskCheckedChar');
          resetField('taskCompletedStrikethrough');
          resetField('taskCompletedColor');
        }}
        hasOverrides={
          !isTaskCheckboxDefault ||
          !isTaskCheckedDefault ||
          !isTaskStrikeDefault ||
          !isTaskCompletedColorDefault
        }
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <TextInput
          label={labels.taskCheckboxChar}
          value={lists.taskCheckboxChar}
          onChange={(v) => updateLists({ taskCheckboxChar: v })}
          placeholder={labels.taskCheckboxCharPlaceholder}
          tooltip={labels.taskCheckboxCharTooltip}
          isDefault={isTaskCheckboxDefault}
          onReset={() => resetField('taskCheckboxChar')}
          widthCh={6}
        />
        <TextInput
          label={labels.taskCheckedChar}
          value={lists.taskCheckedChar}
          onChange={(v) => updateLists({ taskCheckedChar: v })}
          placeholder={labels.taskCheckedCharPlaceholder}
          tooltip={labels.taskCheckedCharTooltip}
          isDefault={isTaskCheckedDefault}
          onReset={() => resetField('taskCheckedChar')}
          widthCh={6}
        />
        <ToggleSwitch
          label={labels.taskCompletedStrikethrough}
          checked={lists.taskCompletedStrikethrough}
          onChange={(v) => updateLists({ taskCompletedStrikethrough: v })}
          tooltip={labels.taskCompletedStrikethroughTooltip}
          isDefault={isTaskStrikeDefault}
          onReset={() => resetField('taskCompletedStrikethrough')}
        />
        <ColorPicker
          label={labels.taskCompletedColor}
          value={lists.taskCompletedColor ?? bodyText.color}
          onChange={(color) => updateLists({ taskCompletedColor: color })}
          tooltip={labels.taskCompletedColorTooltip}
          isDefault={isTaskCompletedColorDefault}
          onReset={() => resetField('taskCompletedColor')}
          fieldId="task-completed-color"
        />
      </CollapsibleSection>
    </CollapsibleSection>
  );
});
