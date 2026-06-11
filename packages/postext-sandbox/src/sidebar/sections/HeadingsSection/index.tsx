'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext';
import { resolveHeadingsConfig, DEFAULT_HEADINGS_CONFIG, DEFAULT_COLUMN_BALANCING, dimensionsEqual, colorsEqual } from 'postext';
import type { HeadingsConfig, HeadingLevelConfig, DimensionUnit } from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  NestedGroup,
  NumberInput,
  SelectInput,
  ToggleSwitch,
} from '../../../controls';
import { HeadingLevelSection } from './HeadingLevelSection';

const LINE_HEIGHT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const MARGIN_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];

const D = DEFAULT_HEADINGS_CONFIG;

export const HeadingsSection = memo(function HeadingsSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.headings);
  const headings = resolveHeadingsConfig(raw);

  const updateHeadings = (partial: Partial<HeadingsConfig>) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { headings: { ...raw, ...partial } },
    });
  };

  const resetHeadings = () => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { headings: undefined },
    });
  };

  const resetBalancingField = (
    field: 'enabled' | 'maxLinesPerHeading' | 'stretchAfterLists' | 'looseParagraphs',
  ) => {
    if (!raw?.balancing) return;
    const next = { ...raw.balancing };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { headings: { ...raw, balancing: hasKeys ? next : undefined } },
    });
  };

  const resetField = (field: keyof HeadingsConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { headings: hasKeys ? next : undefined },
    });
  };

  const updateLevel = (level: number, partial: Partial<HeadingLevelConfig>) => {
    const currentLevels = raw?.levels ?? [];
    const existing = currentLevels.find((l) => l.level === level);
    const updated = existing
      ? { ...existing, ...partial }
      : { level, ...partial };
    const newLevels = existing
      ? currentLevels.map((l) => (l.level === level ? updated : l))
      : [...currentLevels, updated];
    updateHeadings({ levels: newLevels });
  };

  const resetLevelField = (level: number, field: keyof HeadingLevelConfig) => {
    if (!raw?.levels) return;
    if (field === 'fontSize') {
      // When resetting via the section reset button, remove the entire level
      const newLevels = raw.levels.filter((l) => l.level !== level);
      if (newLevels.length > 0) {
        updateHeadings({ levels: newLevels });
      } else {
        const next = { ...raw };
        delete next.levels;
        const hasKeys = Object.keys(next).length > 0;
        dispatch({
          type: 'UPDATE_CONFIG',
          payload: { headings: hasKeys ? next : undefined },
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
      updateHeadings({ levels: newLevels });
    } else {
      const newLevels = raw.levels.filter((l) => l.level !== level);
      if (newLevels.length > 0) {
        updateHeadings({ levels: newLevels });
      } else {
        const r = { ...raw };
        delete r.levels;
        const hasKeys = Object.keys(r).length > 0;
        dispatch({
          type: 'UPDATE_CONFIG',
          payload: { headings: hasKeys ? r : undefined },
        });
      }
    }
  };

  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  const isFontDefault = headings.fontFamily === D.fontFamily;
  const isLhDefault = dimensionsEqual(headings.lineHeight, D.lineHeight);
  const isColorDefault = colorsEqual(headings.color, D.color);
  const isFontWeightDefault = headings.fontWeight === D.fontWeight;
  const isMarginTopDefault = dimensionsEqual(headings.marginTop, D.marginTop);
  const isMarginBottomDefault = dimensionsEqual(headings.marginBottom, D.marginBottom);
  const isTextAlignDefault = headings.textAlign === D.textAlign;
  const isKeepWithNextDefault = headings.keepWithNext === D.keepWithNext;
  const isBalEnabledDefault = headings.balancing.enabled === DEFAULT_COLUMN_BALANCING.enabled;
  const isBalMaxLinesDefault = headings.balancing.maxLinesPerHeading === DEFAULT_COLUMN_BALANCING.maxLinesPerHeading;
  const isBalAfterListsDefault = headings.balancing.stretchAfterLists === DEFAULT_COLUMN_BALANCING.stretchAfterLists;
  const isBalLooseDefault = headings.balancing.looseParagraphs === DEFAULT_COLUMN_BALANCING.looseParagraphs;

  const ALIGN_OPTIONS = [
    { value: 'left', label: labels.headingsTextAlignLeft },
    { value: 'justify', label: labels.headingsTextAlignJustify },
  ];

  return (
    <CollapsibleSection
      title={labels.headings}
      sectionId="headings"
      onReset={resetHeadings}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <FontPicker
        label={labels.headingsFont}
        value={headings.fontFamily}
        onChange={(font) => updateHeadings({ fontFamily: font })}
        tooltip={labels.headingsFontTooltip}
        isDefault={isFontDefault}
        onReset={() => resetField('fontFamily')}
        searchPlaceholder={labels.headingsFontSearch}
        noResultsLabel={labels.headingsFontNoResults}
      />

      <DimensionInput
        label={labels.headingsLineHeight}
        value={headings.lineHeight}
        onChange={(dim) => updateHeadings({ lineHeight: dim })}
        min={0.5}
        max={5}
        step={0.1}
        tooltip={labels.headingsLineHeightTooltip}
        isDefault={isLhDefault}
        onReset={() => resetField('lineHeight')}
        units={LINE_HEIGHT_UNITS}
      />

      <ColorPicker
        label={labels.headingsColor}
        value={headings.color}
        onChange={(color) => updateHeadings({ color })}
        tooltip={labels.headingsColorTooltip}
        isDefault={isColorDefault}
        onReset={() => resetField('color')}
        fieldId="headings-color"
      />

      <NumberInput
        label={labels.headingsFontWeight}
        value={headings.fontWeight}
        onChange={(w) => updateHeadings({ fontWeight: w })}
        min={100}
        max={900}
        step={10}
        tooltip={labels.headingsFontWeightTooltip}
        isDefault={isFontWeightDefault}
        onReset={() => resetField('fontWeight')}
      />

      <SelectInput
        label={labels.headingsTextAlign}
        value={headings.textAlign}
        options={ALIGN_OPTIONS}
        onChange={(value) => updateHeadings({ textAlign: value as HeadingsConfig['textAlign'] })}
        tooltip={labels.headingsTextAlignTooltip}
        isDefault={isTextAlignDefault}
        onReset={() => resetField('textAlign')}
      />

      <DimensionInput
        label={labels.headingsMarginTop}
        value={headings.marginTop}
        onChange={(dim) => updateHeadings({ marginTop: dim })}
        min={0}
        step={0.1}
        tooltip={labels.headingsMarginTopTooltip}
        isDefault={isMarginTopDefault}
        onReset={() => resetField('marginTop')}
        units={MARGIN_UNITS}
      />

      <DimensionInput
        label={labels.headingsMarginBottom}
        value={headings.marginBottom}
        onChange={(dim) => updateHeadings({ marginBottom: dim })}
        min={0}
        step={0.1}
        tooltip={labels.headingsMarginBottomTooltip}
        isDefault={isMarginBottomDefault}
        onReset={() => resetField('marginBottom')}
        units={MARGIN_UNITS}
      />

      <ToggleSwitch
        label={labels.headingsKeepWithNext}
        checked={headings.keepWithNext}
        onChange={(v) => updateHeadings({ keepWithNext: v })}
        tooltip={labels.headingsKeepWithNextTooltip}
        isDefault={isKeepWithNextDefault}
        onReset={() => resetField('keepWithNext')}
      />

      <ToggleSwitch
        label={labels.balanceColumns}
        checked={headings.balancing.enabled}
        onChange={(v) =>
          updateHeadings({ balancing: { ...raw?.balancing, enabled: v } })
        }
        tooltip={labels.balanceColumnsTooltip}
        isDefault={isBalEnabledDefault}
        onReset={() => resetBalancingField('enabled')}
      />

      {headings.balancing.enabled && (
        <NestedGroup>
          <NumberInput
            label={labels.balanceColumnsMaxLines}
            value={headings.balancing.maxLinesPerHeading}
            onChange={(v) =>
              updateHeadings({ balancing: { ...raw?.balancing, maxLinesPerHeading: v } })
            }
            min={1}
            max={8}
            step={1}
            tooltip={labels.balanceColumnsMaxLinesTooltip}
            isDefault={isBalMaxLinesDefault}
            onReset={() => resetBalancingField('maxLinesPerHeading')}
          />
          <ToggleSwitch
            label={labels.balanceAfterLists}
            checked={headings.balancing.stretchAfterLists}
            onChange={(v) =>
              updateHeadings({ balancing: { ...raw?.balancing, stretchAfterLists: v } })
            }
            tooltip={labels.balanceAfterListsTooltip}
            isDefault={isBalAfterListsDefault}
            onReset={() => resetBalancingField('stretchAfterLists')}
          />
          <ToggleSwitch
            label={labels.balanceLooseParagraphs}
            checked={headings.balancing.looseParagraphs}
            onChange={(v) =>
              updateHeadings({ balancing: { ...raw?.balancing, looseParagraphs: v } })
            }
            tooltip={labels.balanceLooseParagraphsTooltip}
            isDefault={isBalLooseDefault}
            onReset={() => resetBalancingField('looseParagraphs')}
          />
        </NestedGroup>
      )}

      {headings.levels.map((resolved) => (
        <HeadingLevelSection
          key={resolved.level}
          level={resolved.level}
          resolved={resolved}
          raw={raw?.levels?.find((l) => l.level === resolved.level)}
          generalFont={headings.fontFamily}
          generalLineHeight={headings.lineHeight}
          generalColor={headings.color}
          generalFontWeight={headings.fontWeight}
          generalMarginTop={headings.marginTop}
          generalMarginBottom={headings.marginBottom}
          onUpdate={updateLevel}
          onReset={resetLevelField}
          labels={labels}
        />
      ))}
    </CollapsibleSection>
  );
});
