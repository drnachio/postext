'use client';

import type { useSandboxLabels } from '../../../context/SandboxContext';
import { DEFAULT_HEADINGS_CONFIG, dimensionsEqual, colorsEqual, resolveDesignSlot } from 'postext';
import type { HeadingLevelConfig, HeadingBreakBeforeConfig, HeadingBreakParity, HeadingSpan, HeadingTextTransform, HeadingAdvancedDesignConfig, ResolvedHeadingLevelConfig, ColorValue, Dimension, DimensionUnit, DesignSlot, ResolvedDesignSlot } from 'postext';
import { SlotEditor } from '../HeaderFooterSection/SlotEditor';
import { breakParityOptions } from './breakParityOptions';
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

const D = DEFAULT_HEADINGS_CONFIG;

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
  const isBreakBeforeEnabledDefault = resolved.breakBefore.enabled === false;
  const isBreakBeforeParityDefault = resolved.breakBefore.parity === 'any';
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
      <TextInput
        label={labels.headingNumberingTemplate}
        value={resolved.numberingTemplate ?? ''}
        onChange={(v) => onUpdate(level, { numberingTemplate: v })}
        placeholder={labels.headingNumberingTemplatePlaceholder}
        tooltip={labels.headingNumberingTemplateTooltip}
        isDefault={isNumberingDefault}
        onReset={() => onReset(level, 'numberingTemplate')}
      />
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
        label={labels.headingSpan ?? 'Span'}
        value={resolved.span}
        options={[
          { value: 'column', label: labels.headingSpanColumn ?? 'Column (default)' },
          { value: 'page', label: labels.headingSpanPage ?? 'Full page (chapter opener)' },
        ]}
        onChange={(v) => onUpdate(level, { span: v as HeadingSpan })}
        tooltip={labels.headingSpanTooltip}
        isDefault={resolved.span === 'column'}
        onReset={() => onUpdate(level, { span: 'column' })}
      />
      <ToggleSwitch
        label={labels.headingAdvancedDesign ?? 'Advanced design'}
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
            resolved={(resolveDesignSlot(rawAdvanced?.slot, 'header') as ResolvedDesignSlot)}
            onUpdate={(slot: DesignSlot | undefined) => {
              updateAdvanced({ enabled: true, slot: slot ?? { elements: [] } });
            }}
          />
        </NestedGroup>
      )}
    </CollapsibleSection>
  );
}
