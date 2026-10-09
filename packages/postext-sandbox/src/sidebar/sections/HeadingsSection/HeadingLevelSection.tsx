'use client';

import { useMemo } from 'react';
import { useSandboxSelector, type useSandboxLabels } from '../../../context/SandboxContext';
import { DEFAULT_HEADINGS_CONFIG, dimensionsEqual, colorsEqual, resolveBodyTextConfig, resolveDesignSlot } from 'postext';
import { DropCapFields } from '../../settings/DropCapFields';
import type { HeadingLevelConfig, HeadingBreakBeforeConfig, HeadingBreakParity, HeadingSpan, HeadingTextTransform, HeadingAdvancedDesignConfig, ResolvedHeadingLevelConfig, ColorValue, Dimension, DimensionUnit, DesignSlot, ResolvedDesignSlot } from 'postext';
import { SlotEditor } from '../HeaderFooterSection/SlotEditor';
import { breakParityOptions } from './breakParityOptions';
import { separatorFromOption, separatorOption, separatorOptions, type SeparatorChoice } from '../../settings/eastAsianOptions';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  NestedGroup,
  NumberInput,
  SelectInput,
  TextInput,
  ToggleSwitch,
} from '../../../controls';

const TEXT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
const LINE_HEIGHT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const MARGIN_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const MIN_HEIGHT_UNITS: DimensionUnit[] = ['pt', 'mm', 'cm', 'in', 'em', 'px'];
const ZERO_PT: Dimension = { value: 0, unit: 'pt' };
const TRACKING_UNITS: DimensionUnit[] = ['pt', 'em', 'px'];
/** 字下げ counts body characters (`em` is the body size). */
const INDENT_UNITS: DimensionUnit[] = ['em', 'pt', 'mm'];
const ZERO_EM: Dimension = { value: 0, unit: 'em' };

const D = DEFAULT_HEADINGS_CONFIG;
/** Between a heading's number and its title: a space, the ideographic
 *  space of Chinese chapter heads, or nothing. */
const NUMBER_SEPARATOR_CHOICES: readonly SeparatorChoice[] = ['space', 'ideographic', 'none'];

export function HeadingLevelSection({
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
  resolved: ResolvedHeadingLevelConfig;
  raw: HeadingLevelConfig | undefined;
  generalFont: string;
  generalLineHeight: Dimension;
  generalColor: ColorValue;
  generalFontWeight: number;
  generalMarginTop: Dimension;
  generalMarginBottom: Dimension;
  onUpdate: (level: number, partial: Partial<HeadingLevelConfig>) => void;
  onReset: (level: number, field: keyof HeadingLevelConfig) => void;
  labels: ReturnType<typeof useSandboxLabels>;
}) {
  const defLevel = D.levels.find((l) => l.level === level)!;
  // A drop cap after the heading (#623) opens a body paragraph: unset
  // fields take the body text's face, weight and colour.
  const bodyConfig = useSandboxSelector((s) => s.config.bodyText);
  const body = useMemo(() => resolveBodyTextConfig(bodyConfig), [bodyConfig]);

  const isSizeDefault = dimensionsEqual(resolved.fontSize, defLevel.fontSize);
  const isLhDefault = dimensionsEqual(resolved.lineHeight, generalLineHeight);
  const isFontDefault = resolved.fontFamily === generalFont;
  const isColorDefault = colorsEqual(resolved.color, generalColor);
  const isFontWeightDefault = resolved.fontWeight === generalFontWeight;
  const isMarginTopDefault = dimensionsEqual(resolved.marginTop, generalMarginTop);
  const isMarginBottomDefault = dimensionsEqual(resolved.marginBottom, generalMarginBottom);
  const isNumberingDefault = (resolved.numberingTemplate ?? '') === '';
  const isItalicDefault = resolved.italic === false;
  const isTextTransformDefault = resolved.textTransform === 'none';
  const rawAdvanced = raw?.advancedDesign;
  const minHeight = resolved.advancedDesign.minHeight ?? ZERO_PT;
  const isMinHeightDefault = rawAdvanced?.minHeight === undefined;

  /** Merge into `advancedDesign`, keeping the slot and minHeight already set. */
  const updateAdvanced = (partial: Partial<HeadingAdvancedDesignConfig>) => {
    const base: HeadingAdvancedDesignConfig = {
      enabled: rawAdvanced?.enabled ?? resolved.advancedDesign.enabled,
      slot: rawAdvanced?.slot ?? { elements: [] },
      ...(rawAdvanced?.minHeight ? { minHeight: rawAdvanced.minHeight } : {}),
    };
    const next: HeadingAdvancedDesignConfig = { ...base, ...partial };
    if (partial.minHeight === undefined && 'minHeight' in partial) delete next.minHeight;
    onUpdate(level, { advancedDesign: next });
  };
  const isBreakBeforeEnabledDefault = raw?.breakBefore?.enabled === undefined;
  const isBreakBeforeParityDefault = raw?.breakBefore?.parity === undefined;
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
        step={10}
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
      <ToggleSwitch
        label={labels.headingLevelSnapToGrid}
        checked={resolved.snapToGrid}
        onChange={(v) => onUpdate(level, { snapToGrid: v })}
        tooltip={labels.headingLevelSnapToGridTooltip}
        isDefault={raw?.snapToGrid === undefined}
        onReset={() => onReset(level, 'snapToGrid')}
      />
      <NumberInput
        label={labels.headingLineSpan}
        value={resolved.lineSpan ?? 0}
        onChange={(v) => (v >= 1 ? onUpdate(level, { lineSpan: Math.round(v) }) : onReset(level, 'lineSpan'))}
        min={0}
        max={20}
        step={1}
        tooltip={labels.headingLineSpanTooltip}
        isDefault={raw?.lineSpan === undefined}
        onReset={() => onReset(level, 'lineSpan')}
      />
      <DimensionInput
        label={labels.headingIndent}
        value={resolved.indent ?? ZERO_EM}
        onChange={(dim) => onUpdate(level, { indent: dim })}
        min={0}
        step={0.5}
        tooltip={labels.headingIndentTooltip}
        isDefault={raw?.indent === undefined}
        onReset={() => onReset(level, 'indent')}
        units={INDENT_UNITS}
      />
      <DimensionInput
        label={labels.headingFirstLineIndent}
        value={resolved.firstLineIndent ?? ZERO_EM}
        onChange={(dim) => onUpdate(level, { firstLineIndent: dim })}
        min={0}
        step={0.5}
        tooltip={labels.headingFirstLineIndentTooltip}
        isDefault={raw?.firstLineIndent === undefined}
        onReset={() => onReset(level, 'firstLineIndent')}
        units={INDENT_UNITS}
      />
      <NumberInput
        label={labels.headingJidori}
        value={resolved.jidori ?? 0}
        onChange={(v) => (v > 1 ? onUpdate(level, { jidori: v }) : onReset(level, 'jidori'))}
        min={0}
        max={20}
        step={0.5}
        tooltip={labels.headingJidoriTooltip}
        isDefault={raw?.jidori === undefined}
        onReset={() => onReset(level, 'jidori')}
      />
      <ToggleSwitch
        label={labels.headingDropCap}
        checked={raw?.dropCap !== undefined && raw.dropCap !== false}
        onChange={(v) => (v ? onUpdate(level, { dropCap: { ...(raw?.dropCap || {}) } }) : onReset(level, 'dropCap'))}
        tooltip={labels.headingDropCapTooltip}
        isDefault={raw?.dropCap === undefined}
        onReset={() => onReset(level, 'dropCap')}
      />
      {raw?.dropCap && (
        <DropCapFields
          kind="body"
          value={raw.dropCap}
          onChange={(dropCap) => onUpdate(level, { dropCap })}
          inherited={{ fontFamily: body.fontFamily, fontWeight: body.fontWeight, color: body.color }}
          fieldId={`heading-level-dropcap-${level}`}
        />
      )}
      <ToggleSwitch
        label={labels.headingItalic}
        checked={resolved.italic}
        onChange={(v) => onUpdate(level, { italic: v })}
        tooltip={labels.headingItalicTooltip}
        isDefault={isItalicDefault}
        onReset={() => onReset(level, 'italic')}
      />
      <SelectInput
        label={labels.headingTextTransform}
        value={resolved.textTransform}
        options={[
          { value: 'none', label: labels.headingTextTransformNone },
          { value: 'uppercase', label: labels.headingTextTransformUppercase },
        ]}
        onChange={(v) => onUpdate(level, { textTransform: v as HeadingTextTransform })}
        tooltip={labels.headingTextTransformTooltip}
        isDefault={isTextTransformDefault}
        onReset={() => onReset(level, 'textTransform')}
      />
      <DimensionInput
        label={labels.headingLetterSpacing}
        value={resolved.letterSpacing ?? ZERO_PT}
        onChange={(dim) => onUpdate(level, { letterSpacing: dim })}
        min={-5}
        step={0.1}
        tooltip={labels.headingLetterSpacingTooltip}
        isDefault={raw?.letterSpacing === undefined}
        onReset={() => onReset(level, 'letterSpacing')}
        units={TRACKING_UNITS}
      />
      <TextInput
        label={labels.headingNumberingTemplate}
        value={resolved.numberingTemplate ?? ''}
        onChange={(v) => onUpdate(level, { numberingTemplate: v })}
        placeholder={labels.headingNumberingTemplatePlaceholder}
        tooltip={labels.headingNumberingTemplateTooltip}
        isDefault={isNumberingDefault}
        onReset={() => onReset(level, 'numberingTemplate')}
      />
      {!isNumberingDefault && (
        <SelectInput
          label={labels.headingNumberSeparator}
          value={separatorOption(resolved.numberSeparator, NUMBER_SEPARATOR_CHOICES)}
          options={separatorOptions(labels, NUMBER_SEPARATOR_CHOICES, resolved.numberSeparator)}
          onChange={(v) => {
            const sep = separatorFromOption(v);
            if (sep !== undefined) onUpdate(level, { numberSeparator: sep });
          }}
          tooltip={labels.headingNumberSeparatorTooltip}
          isDefault={raw?.numberSeparator === undefined}
          onReset={() => onReset(level, 'numberSeparator')}
        />
      )}
      {!isNumberingDefault && (
        <ToggleSwitch
          label={labels.headingNumberReplacesTitle}
          checked={resolved.numberPosition === 'replace'}
          onChange={(v) => (v ? onUpdate(level, { numberPosition: 'replace' }) : onReset(level, 'numberPosition'))}
          tooltip={labels.headingNumberReplacesTitleTooltip}
          isDefault={raw?.numberPosition === undefined}
          onReset={() => onReset(level, 'numberPosition')}
        />
      )}
      <ToggleSwitch
        label={labels.headingBreakBefore}
        checked={resolved.breakBefore.enabled}
        onChange={(v) => {
          const next: HeadingBreakBeforeConfig = { enabled: v };
          if (resolved.breakBefore.parity !== 'any') next.parity = resolved.breakBefore.parity;
          onUpdate(level, { breakBefore: next });
        }}
        tooltip={labels.headingBreakBeforeTooltip}
        isDefault={isBreakBeforeEnabledDefault}
        onReset={() => onReset(level, 'breakBefore')}
      />
      {resolved.breakBefore.enabled && (
        <NestedGroup>
          <SelectInput
            label={labels.headingBreakBeforeParity}
            value={resolved.breakBefore.parity}
            options={breakParityOptions(labels)}
            onChange={(v) => onUpdate(level, { breakBefore: { enabled: true, parity: v as HeadingBreakParity } })}
            tooltip={labels.headingBreakBeforeParityTooltip}
            isDefault={isBreakBeforeParityDefault}
            onReset={() => onUpdate(level, { breakBefore: { enabled: true } })}
          />
        </NestedGroup>
      )}
      <SelectInput
        label={labels.headingSpan}
        value={resolved.span}
        options={[
          { value: 'column', label: labels.headingSpanColumn },
          { value: 'page', label: labels.headingSpanPage },
        ]}
        onChange={(v) => onUpdate(level, { span: v as HeadingSpan })}
        tooltip={labels.headingSpanTooltip}
        isDefault={resolved.span === 'column'}
        onReset={() => onUpdate(level, { span: 'column' })}
      />
      <ToggleSwitch
        label={labels.headingHidden}
        checked={resolved.hidden}
        onChange={(v) => onUpdate(level, { hidden: v })}
        tooltip={labels.headingHiddenTooltip}
        isDefault={raw?.hidden === undefined}
        onReset={() => onReset(level, 'hidden')}
      />
      <ToggleSwitch
        label={labels.headingAdvancedDesign}
        checked={resolved.advancedDesign.enabled}
        onChange={(v) => updateAdvanced({ enabled: v })}
        tooltip={labels.headingAdvancedDesignTooltip}
        isDefault={resolved.advancedDesign.enabled === false}
        onReset={() => onReset(level, 'advancedDesign')}
      />
      {resolved.advancedDesign.enabled && (
        <NestedGroup>
          <p className="px-2 py-1 text-xs" style={{ color: 'var(--slate)' }}>
            {labels.headingAdvancedDesignInfo ??
              'Compose text, rules, and boxes. Include a text element with {titleText} to render the heading.'}
          </p>
          <DimensionInput
            label={labels.headingAdvancedMinHeight}
            value={minHeight}
            onChange={(dim) => updateAdvanced({ minHeight: dim })}
            min={0}
            step={1}
            tooltip={labels.headingAdvancedMinHeightTooltip}
            isDefault={isMinHeightDefault}
            onReset={() => updateAdvanced({ minHeight: undefined })}
            units={MIN_HEIGHT_UNITS}
          />
          <SlotEditor
            slotKey="heading"
            raw={rawAdvanced?.slot}
            resolved={(resolveDesignSlot(rawAdvanced?.slot, rawAdvanced?.slot === undefined ? 'header' : 'heading') as ResolvedDesignSlot)}
            onUpdate={(slot: DesignSlot | undefined) => {
              updateAdvanced({ enabled: true, slot: slot ?? { elements: [] } });
            }}
          />
        </NestedGroup>
      )}
    </CollapsibleSection>
  );
}
