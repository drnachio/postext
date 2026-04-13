'use client';

import { useSandbox } from '../../context/SandboxContext';
import { resolveHeadingsConfig, DEFAULT_HEADINGS_CONFIG, dimensionsEqual, colorsEqual } from 'postext';
import type { HeadingsConfig, HeadingLevelConfig, ColorValue, Dimension, DimensionUnit } from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  NumberInput,
  SelectInput,
} from '../../controls';

const TEXT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
const LINE_HEIGHT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const MARGIN_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];

const D = DEFAULT_HEADINGS_CONFIG;

function HeadingLevelSection({
  level,
  resolved,
  raw,
  generalFont,
  generalLineHeight,
  generalColor,
  generalFontWeight,
  generalMarginTop,
  generalMarginBottom,
  onUpdate,
  onReset,
  labels,
}: {
  level: number;
  resolved: { fontSize: Dimension; lineHeight: Dimension; fontFamily: string; color: ColorValue; fontWeight: number; marginTop: Dimension; marginBottom: Dimension };
  raw: HeadingLevelConfig | undefined;
  generalFont: string;
  generalLineHeight: Dimension;
  generalColor: ColorValue;
  generalFontWeight: number;
  generalMarginTop: Dimension;
  generalMarginBottom: Dimension;
  onUpdate: (level: number, partial: Partial<HeadingLevelConfig>) => void;
  onReset: (level: number, field: keyof HeadingLevelConfig) => void;
  labels: ReturnType<typeof useSandbox>['state']['labels'];
}) {
  const defLevel = D.levels.find((l) => l.level === level)!;

  const isSizeDefault = dimensionsEqual(resolved.fontSize, defLevel.fontSize);
  const isLhDefault = dimensionsEqual(resolved.lineHeight, generalLineHeight);
  const isFontDefault = resolved.fontFamily === generalFont;
  const isColorDefault = colorsEqual(resolved.color, generalColor);
  const isFontWeightDefault = resolved.fontWeight === generalFontWeight;
  const isMarginTopDefault = dimensionsEqual(resolved.marginTop, generalMarginTop);
  const isMarginBottomDefault = dimensionsEqual(resolved.marginBottom, generalMarginBottom);
  const hasOverrides = raw !== undefined && Object.keys(raw).filter((k) => k !== 'level').length > 0;

  return (
    <CollapsibleSection
      title={`${labels.headingLevel}${level}`}
      sectionId={`heading-h${level}`}
      onReset={() => onReset(level, 'fontSize')}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <DimensionInput
        label={labels.headingFontSize}
        value={resolved.fontSize}
        onChange={(dim) => onUpdate(level, { fontSize: dim })}
        min={1}
        step={0.5}
        tooltip={labels.headingFontSizeTooltip}
        isDefault={isSizeDefault}
        onReset={() => onReset(level, 'fontSize')}
        units={TEXT_SIZE_UNITS}
      />
      <DimensionInput
        label={labels.headingLineHeight}
        value={resolved.lineHeight}
        onChange={(dim) => onUpdate(level, { lineHeight: dim })}
        min={0.5}
        max={5}
        step={0.1}
        tooltip={labels.headingLineHeightTooltip}
        isDefault={isLhDefault}
        onReset={() => onReset(level, 'lineHeight')}
        units={LINE_HEIGHT_UNITS}
      />
      <FontPicker
        label={labels.headingFont}
        value={resolved.fontFamily}
        onChange={(font) => onUpdate(level, { fontFamily: font })}
        tooltip={labels.headingFontTooltip}
        isDefault={isFontDefault}
        onReset={() => onReset(level, 'fontFamily')}
        searchPlaceholder={labels.headingFontSearch}
        noResultsLabel={labels.headingFontNoResults}
      />
      <NumberInput
        label={labels.headingFontWeight}
        value={resolved.fontWeight}
        onChange={(w) => onUpdate(level, { fontWeight: w })}
        min={100}
        max={900}
        step={100}
        tooltip={labels.headingFontWeightTooltip}
        isDefault={isFontWeightDefault}
        onReset={() => onReset(level, 'fontWeight')}
      />
      <ColorPicker
        label={labels.headingColor}
        value={resolved.color}
        onChange={(color) => onUpdate(level, { color })}
        tooltip={labels.headingColorTooltip}
        isDefault={isColorDefault}
        onReset={() => onReset(level, 'color')}
        fieldId={`heading-h${level}-color`}
      />
      <DimensionInput
        label={labels.headingMarginTop}
        value={resolved.marginTop}
        onChange={(dim) => onUpdate(level, { marginTop: dim })}
        min={0}
        step={0.1}
        tooltip={labels.headingMarginTopTooltip}
        isDefault={isMarginTopDefault}
        onReset={() => onReset(level, 'marginTop')}
        units={MARGIN_UNITS}
      />
      <DimensionInput
        label={labels.headingMarginBottom}
        value={resolved.marginBottom}
        onChange={(dim) => onUpdate(level, { marginBottom: dim })}
        min={0}
        step={0.1}
        tooltip={labels.headingMarginBottomTooltip}
        isDefault={isMarginBottomDefault}
        onReset={() => onReset(level, 'marginBottom')}
        units={MARGIN_UNITS}
      />
    </CollapsibleSection>
  );
}

export function HeadingsSection() {
  const { state, dispatch } = useSandbox();
  const raw = state.config.headings;
  const headings = resolveHeadingsConfig(raw);
  const { labels } = state;

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

  const ALIGN_OPTIONS = [
    { value: 'left', label: labels.headingsTextAlignLeft },
    { value: 'justify', label: labels.headingsTextAlignJustify },
  ];

  return (
    <CollapsibleSection
      title={labels.headings}
      sectionId="headings"
      defaultOpen
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
        step={100}
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
}
