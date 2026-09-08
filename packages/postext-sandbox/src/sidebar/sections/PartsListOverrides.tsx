'use client';

import type { useSandboxLabels } from '../../context/SandboxContext';
import type {
  OrderedListsConfig,
  ResolvedOrderedListsConfig,
  ResolvedUnorderedListsConfig,
  UnorderedListsConfig,
} from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  NumberInput,
  TextInput,
  ToggleSwitch,
} from '../../controls';
import { TEXT_SIZE_UNITS, INDENT_UNITS, MARGIN_UNITS } from './OrderedListsSection/units';

type Labels = ReturnType<typeof useSandboxLabels>;

interface OverrideGroupProps<T extends object, R> {
  /** The part's partial override (`parts.bodyStyle.orderedLists` / `unorderedLists`). */
  raw: T | undefined;
  /** The document's resolved list config — what each field shows until overridden. */
  base: R;
  onUpdate: (partial: Partial<T>) => void;
  onReset: (field: keyof T) => void;
  onResetAll: () => void;
  labels: Labels;
}

/** `parts.bodyStyle.orderedLists`: partial overrides applied on top of the
 *  document's ordered lists inside `:::part`. Every field displays the
 *  document value until the part overrides it. */
export function PartsOrderedListsOverrides({
  raw,
  base,
  onUpdate,
  onReset,
  onResetAll,
  labels,
}: OverrideGroupProps<OrderedListsConfig, ResolvedOrderedListsConfig>) {
  const isDefault = (field: keyof OrderedListsConfig) => raw?.[field] === undefined;
  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  return (
    <CollapsibleSection
      title={labels.partsOrderedLists}
      sectionId="parts-ordered-lists"
      onReset={onResetAll}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <p className="px-2 py-1 text-xs" style={{ color: 'var(--slate)' }}>
        {labels.partsOrderedListsInfo}
      </p>
      <TextInput
        label={labels.orderedListsSeparator}
        value={raw?.separator ?? base.separator}
        onChange={(v) => onUpdate({ separator: v })}
        placeholder={labels.orderedListsSeparatorPlaceholder}
        tooltip={labels.orderedListsSeparatorTooltip}
        isDefault={isDefault('separator')}
        onReset={() => onReset('separator')}
        widthCh={6}
      />
      <FontPicker
        label={labels.orderedListsFont}
        value={raw?.fontFamily ?? base.fontFamily}
        onChange={(f) => onUpdate({ fontFamily: f })}
        tooltip={labels.orderedListsFontTooltip}
        isDefault={isDefault('fontFamily')}
        onReset={() => onReset('fontFamily')}
        searchPlaceholder={labels.orderedListsFontSearch}
        noResultsLabel={labels.orderedListsFontNoResults}
      />
      <ColorPicker
        label={labels.orderedListsColor}
        value={raw?.color ?? base.color}
        onChange={(color) => onUpdate({ color })}
        tooltip={labels.orderedListsColorTooltip}
        isDefault={isDefault('color')}
        onReset={() => onReset('color')}
        fieldId="parts-ordered-lists-color"
      />
      <NumberInput
        label={labels.orderedListsFontWeight}
        value={raw?.fontWeight ?? base.fontWeight}
        onChange={(w) => onUpdate({ fontWeight: w })}
        min={100}
        max={900}
        step={10}
        tooltip={labels.orderedListsFontWeightTooltip}
        isDefault={isDefault('fontWeight')}
        onReset={() => onReset('fontWeight')}
      />
      <ToggleSwitch
        label={labels.orderedListsItalic}
        checked={raw?.italic ?? base.italic}
        onChange={(v) => onUpdate({ italic: v })}
        tooltip={labels.orderedListsItalicTooltip}
        isDefault={isDefault('italic')}
        onReset={() => onReset('italic')}
      />
      <DimensionInput
        label={labels.orderedListsNumberFontSize}
        value={raw?.numberFontSize ?? base.numberFontSize}
        onChange={(dim) => onUpdate({ numberFontSize: dim })}
        min={0.1}
        step={0.1}
        tooltip={labels.orderedListsNumberFontSizeTooltip}
        isDefault={isDefault('numberFontSize')}
        onReset={() => onReset('numberFontSize')}
        units={TEXT_SIZE_UNITS}
      />
      <DimensionInput
        label={labels.orderedListsGap}
        value={raw?.gap ?? base.gap}
        onChange={(dim) => onUpdate({ gap: dim })}
        min={0}
        step={0.1}
        tooltip={labels.orderedListsGapTooltip}
        isDefault={isDefault('gap')}
        onReset={() => onReset('gap')}
        units={INDENT_UNITS}
      />
      <DimensionInput
        label={labels.orderedListsIndent}
        value={raw?.indent ?? base.indent}
        onChange={(dim) => onUpdate({ indent: dim })}
        min={0}
        step={0.1}
        tooltip={labels.orderedListsIndentTooltip}
        isDefault={isDefault('indent')}
        onReset={() => onReset('indent')}
        units={INDENT_UNITS}
      />
      <DimensionInput
        label={labels.orderedListsItemSpacing}
        value={raw?.itemSpacing ?? base.itemSpacing}
        onChange={(dim) => onUpdate({ itemSpacing: dim })}
        min={0}
        step={0.1}
        tooltip={labels.orderedListsItemSpacingTooltip}
        isDefault={isDefault('itemSpacing')}
        onReset={() => onReset('itemSpacing')}
        units={MARGIN_UNITS}
      />
      <FontPicker
        label={labels.orderedListsSeparatorFont}
        value={raw?.separatorFontFamily ?? base.separatorFontFamily}
        onChange={(f) => onUpdate({ separatorFontFamily: f })}
        tooltip={labels.orderedListsSeparatorFontTooltip}
        isDefault={isDefault('separatorFontFamily')}
        onReset={() => onReset('separatorFontFamily')}
        searchPlaceholder={labels.orderedListsFontSearch}
        noResultsLabel={labels.orderedListsFontNoResults}
      />
      <ColorPicker
        label={labels.orderedListsSeparatorColor}
        value={raw?.separatorColor ?? base.separatorColor}
        onChange={(color) => onUpdate({ separatorColor: color })}
        tooltip={labels.orderedListsSeparatorColorTooltip}
        isDefault={isDefault('separatorColor')}
        onReset={() => onReset('separatorColor')}
        fieldId="parts-ordered-lists-separator-color"
      />
      <NumberInput
        label={labels.orderedListsSeparatorFontWeight}
        value={raw?.separatorFontWeight ?? base.separatorFontWeight}
        onChange={(w) => onUpdate({ separatorFontWeight: w })}
        min={100}
        max={900}
        step={10}
        tooltip={labels.orderedListsSeparatorFontWeightTooltip}
        isDefault={isDefault('separatorFontWeight')}
        onReset={() => onReset('separatorFontWeight')}
      />
      <ToggleSwitch
        label={labels.orderedListsSeparatorItalic}
        checked={raw?.separatorItalic ?? base.separatorItalic}
        onChange={(v) => onUpdate({ separatorItalic: v })}
        tooltip={labels.orderedListsSeparatorItalicTooltip}
        isDefault={isDefault('separatorItalic')}
        onReset={() => onReset('separatorItalic')}
      />
      <DimensionInput
        label={labels.orderedListsSeparatorGap}
        value={raw?.separatorGap ?? base.separatorGap}
        onChange={(dim) => onUpdate({ separatorGap: dim })}
        min={0}
        step={0.05}
        tooltip={labels.orderedListsSeparatorGapTooltip}
        isDefault={isDefault('separatorGap')}
        onReset={() => onReset('separatorGap')}
        units={INDENT_UNITS}
      />
    </CollapsibleSection>
  );
}

/** `parts.bodyStyle.unorderedLists`: partial overrides applied on top of the
 *  document's unordered lists inside `:::part`. */
export function PartsUnorderedListsOverrides({
  raw,
  base,
  onUpdate,
  onReset,
  onResetAll,
  labels,
}: OverrideGroupProps<UnorderedListsConfig, ResolvedUnorderedListsConfig>) {
  const isDefault = (field: keyof UnorderedListsConfig) => raw?.[field] === undefined;
  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  return (
    <CollapsibleSection
      title={labels.partsUnorderedLists}
      sectionId="parts-unordered-lists"
      onReset={onResetAll}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <p className="px-2 py-1 text-xs" style={{ color: 'var(--slate)' }}>
        {labels.partsUnorderedListsInfo}
      </p>
      <TextInput
        label={labels.unorderedListsBulletChar}
        value={raw?.bulletChar ?? base.bulletChar}
        onChange={(v) => onUpdate({ bulletChar: v })}
        placeholder={labels.unorderedListsBulletCharPlaceholder}
        tooltip={labels.unorderedListsBulletCharTooltip}
        isDefault={isDefault('bulletChar')}
        onReset={() => onReset('bulletChar')}
        widthCh={6}
      />
      <FontPicker
        label={labels.unorderedListsFont}
        value={raw?.fontFamily ?? base.fontFamily}
        onChange={(f) => onUpdate({ fontFamily: f })}
        tooltip={labels.unorderedListsFontTooltip}
        isDefault={isDefault('fontFamily')}
        onReset={() => onReset('fontFamily')}
        searchPlaceholder={labels.unorderedListsFontSearch}
        noResultsLabel={labels.unorderedListsFontNoResults}
      />
      <ColorPicker
        label={labels.unorderedListsColor}
        value={raw?.color ?? base.color}
        onChange={(color) => onUpdate({ color })}
        tooltip={labels.unorderedListsColorTooltip}
        isDefault={isDefault('color')}
        onReset={() => onReset('color')}
        fieldId="parts-unordered-lists-color"
      />
      <NumberInput
        label={labels.unorderedListsFontWeight}
        value={raw?.fontWeight ?? base.fontWeight}
        onChange={(w) => onUpdate({ fontWeight: w })}
        min={100}
        max={900}
        step={10}
        tooltip={labels.unorderedListsFontWeightTooltip}
        isDefault={isDefault('fontWeight')}
        onReset={() => onReset('fontWeight')}
      />
      <ToggleSwitch
        label={labels.unorderedListsItalic}
        checked={raw?.italic ?? base.italic}
        onChange={(v) => onUpdate({ italic: v })}
        tooltip={labels.unorderedListsItalicTooltip}
        isDefault={isDefault('italic')}
        onReset={() => onReset('italic')}
      />
      <DimensionInput
        label={labels.unorderedListsBulletFontSize}
        value={raw?.bulletFontSize ?? base.bulletFontSize}
        onChange={(dim) => onUpdate({ bulletFontSize: dim })}
        min={0.1}
        step={0.1}
        tooltip={labels.unorderedListsBulletFontSizeTooltip}
        isDefault={isDefault('bulletFontSize')}
        onReset={() => onReset('bulletFontSize')}
        units={TEXT_SIZE_UNITS}
      />
      <DimensionInput
        label={labels.unorderedListsGap}
        value={raw?.gap ?? base.gap}
        onChange={(dim) => onUpdate({ gap: dim })}
        min={0}
        step={0.1}
        tooltip={labels.unorderedListsGapTooltip}
        isDefault={isDefault('gap')}
        onReset={() => onReset('gap')}
        units={INDENT_UNITS}
      />
      <DimensionInput
        label={labels.unorderedListsIndent}
        value={raw?.indent ?? base.indent}
        onChange={(dim) => onUpdate({ indent: dim })}
        min={0}
        step={0.1}
        tooltip={labels.unorderedListsIndentTooltip}
        isDefault={isDefault('indent')}
        onReset={() => onReset('indent')}
        units={INDENT_UNITS}
      />
      <DimensionInput
        label={labels.unorderedListsItemSpacing}
        value={raw?.itemSpacing ?? base.itemSpacing}
        onChange={(dim) => onUpdate({ itemSpacing: dim })}
        min={0}
        step={0.1}
        tooltip={labels.unorderedListsItemSpacingTooltip}
        isDefault={isDefault('itemSpacing')}
        onReset={() => onReset('itemSpacing')}
        units={MARGIN_UNITS}
      />
    </CollapsibleSection>
  );
}
