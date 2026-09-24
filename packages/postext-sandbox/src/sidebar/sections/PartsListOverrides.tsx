'use client';

import type { useSandboxLabels } from '../../context/SandboxContext';
import type {
  OrderedListNumberFormat,
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
  SelectInput,
  TextInput,
  ToggleSwitch,
} from '../../controls';
import { TEXT_SIZE_UNITS, INDENT_UNITS, MARGIN_UNITS, OFFSET_UNITS } from './OrderedListsSection/units';
import { numberFormatOptions } from './OrderedListsSection/numberFormat';

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
  /** Collapse-state key; pass a distinct one per host (parts, each heading style). */
  sectionId?: string;
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
  sectionId = 'parts-ordered-lists',
}: OverrideGroupProps<OrderedListsConfig, ResolvedOrderedListsConfig>) {
  const isDefault = (field: keyof OrderedListsConfig) => raw?.[field] === undefined;
  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  return (
    <CollapsibleSection
      title={labels.partsOrderedLists}
      sectionId={sectionId}
      onReset={onResetAll}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <p className="px-2 py-1 text-xs" style={{ color: 'var(--slate)' }}>
        {labels.partsOrderedListsInfo}
      </p>
      <SelectInput
        label={labels.orderedListsNumberFormat}
        value={raw?.numberFormat ?? base.numberFormat}
        options={numberFormatOptions(labels)}
        onChange={(v) => onUpdate({ numberFormat: v as OrderedListNumberFormat })}
        tooltip={labels.orderedListsNumberFormatTooltip}
        isDefault={isDefault('numberFormat')}
        onReset={() => onReset('numberFormat')}
      />
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
      <DimensionInput
        label={labels.orderedListsNumberVerticalOffset}
        value={raw?.numberVerticalOffset ?? base.numberVerticalOffset}
        onChange={(dim) => onUpdate({ numberVerticalOffset: dim })}
        min={-5}
        step={0.05}
        tooltip={labels.orderedListsNumberVerticalOffsetTooltip}
        isDefault={isDefault('numberVerticalOffset')}
        onReset={() => onReset('numberVerticalOffset')}
        units={OFFSET_UNITS}
      />
      <DimensionInput
        label={labels.orderedListsMarginTop}
        value={raw?.marginTop ?? base.marginTop}
        onChange={(dim) => onUpdate({ marginTop: dim })}
        min={0}
        step={0.1}
        tooltip={labels.orderedListsMarginTopTooltip}
        isDefault={isDefault('marginTop')}
        onReset={() => onReset('marginTop')}
        units={MARGIN_UNITS}
      />
      <DimensionInput
        label={labels.orderedListsMarginBottom}
        value={raw?.marginBottom ?? base.marginBottom}
        onChange={(dim) => onUpdate({ marginBottom: dim })}
        min={0}
        step={0.1}
        tooltip={labels.orderedListsMarginBottomTooltip}
        isDefault={isDefault('marginBottom')}
        onReset={() => onReset('marginBottom')}
        units={MARGIN_UNITS}
      />
      <ToggleSwitch
        label={labels.orderedListsHangingIndent}
        checked={raw?.hangingIndent ?? base.hangingIndent}
        onChange={(v) => onUpdate({ hangingIndent: v })}
        tooltip={labels.orderedListsHangingIndentTooltip}
        isDefault={isDefault('hangingIndent')}
        onReset={() => onReset('hangingIndent')}
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
  sectionId = 'parts-unordered-lists',
}: OverrideGroupProps<UnorderedListsConfig, ResolvedUnorderedListsConfig>) {
  const isDefault = (field: keyof UnorderedListsConfig) => raw?.[field] === undefined;
  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  return (
    <CollapsibleSection
      title={labels.partsUnorderedLists}
      sectionId={sectionId}
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
      <DimensionInput
        label={labels.unorderedListsBulletVerticalOffset}
        value={raw?.bulletVerticalOffset ?? base.bulletVerticalOffset}
        onChange={(dim) => onUpdate({ bulletVerticalOffset: dim })}
        min={-5}
        step={0.05}
        tooltip={labels.unorderedListsBulletVerticalOffsetTooltip}
        isDefault={isDefault('bulletVerticalOffset')}
        onReset={() => onReset('bulletVerticalOffset')}
        units={OFFSET_UNITS}
      />
      <DimensionInput
        label={labels.unorderedListsMarginTop}
        value={raw?.marginTop ?? base.marginTop}
        onChange={(dim) => onUpdate({ marginTop: dim })}
        min={0}
        step={0.1}
        tooltip={labels.unorderedListsMarginTopTooltip}
        isDefault={isDefault('marginTop')}
        onReset={() => onReset('marginTop')}
        units={MARGIN_UNITS}
      />
      <DimensionInput
        label={labels.unorderedListsMarginBottom}
        value={raw?.marginBottom ?? base.marginBottom}
        onChange={(dim) => onUpdate({ marginBottom: dim })}
        min={0}
        step={0.1}
        tooltip={labels.unorderedListsMarginBottomTooltip}
        isDefault={isDefault('marginBottom')}
        onReset={() => onReset('marginBottom')}
        units={MARGIN_UNITS}
      />
      <ToggleSwitch
        label={labels.unorderedListsHangingIndent}
        checked={raw?.hangingIndent ?? base.hangingIndent}
        onChange={(v) => onUpdate({ hangingIndent: v })}
        tooltip={labels.unorderedListsHangingIndentTooltip}
        isDefault={isDefault('hangingIndent')}
        onReset={() => onReset('hangingIndent')}
      />
      <TextInput
        label={labels.taskCheckboxChar}
        value={raw?.taskCheckboxChar ?? base.taskCheckboxChar}
        onChange={(v) => onUpdate({ taskCheckboxChar: v })}
        placeholder={labels.taskCheckboxCharPlaceholder}
        tooltip={labels.taskCheckboxCharTooltip}
        isDefault={isDefault('taskCheckboxChar')}
        onReset={() => onReset('taskCheckboxChar')}
        widthCh={6}
      />
      <TextInput
        label={labels.taskCheckedChar}
        value={raw?.taskCheckedChar ?? base.taskCheckedChar}
        onChange={(v) => onUpdate({ taskCheckedChar: v })}
        placeholder={labels.taskCheckedCharPlaceholder}
        tooltip={labels.taskCheckedCharTooltip}
        isDefault={isDefault('taskCheckedChar')}
        onReset={() => onReset('taskCheckedChar')}
        widthCh={6}
      />
      <ToggleSwitch
        label={labels.taskCompletedStrikethrough}
        checked={raw?.taskCompletedStrikethrough ?? base.taskCompletedStrikethrough}
        onChange={(v) => onUpdate({ taskCompletedStrikethrough: v })}
        tooltip={labels.taskCompletedStrikethroughTooltip}
        isDefault={isDefault('taskCompletedStrikethrough')}
        onReset={() => onReset('taskCompletedStrikethrough')}
      />
      <ColorPicker
          label={labels.taskCompletedColor}
          value={raw?.taskCompletedColor ?? base.taskCompletedColor ?? base.color}
          onChange={(color) => onUpdate({ taskCompletedColor: color })}
          tooltip={labels.taskCompletedColorTooltip}
          isDefault={isDefault('taskCompletedColor')}
          onReset={() => onReset('taskCompletedColor')}
          fieldId="parts-unordered-lists-task-completed-color"
      />
    </CollapsibleSection>
  );
}
