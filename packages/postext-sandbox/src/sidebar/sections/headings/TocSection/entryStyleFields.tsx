'use client';

// Units, config types and patch helpers of the contents section, the
// leader face fields and the fields of one entry level's style (#1276: split
// out of TocSection.tsx).
import type { DimensionUnit, TocConfig, TocLeaderFaceConfig, ColorValue, Dimension, TocEntryStyleConfig, ResolvedTocEntryStyleConfig } from 'postext';
import { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { ColorPicker, FontPicker, DimensionInput, NumberInput, ToggleSwitch } from '../../../../controls/index.js';

export const TEXT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
const LINE_HEIGHT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
export const SPACING_UNITS: DimensionUnit[] = ['em', 'pt', 'px', 'mm'];
export const infoStyle = { color: 'var(--slate)' } as const;
/** A part row's own placeholder: the contents' leader up to the page
 *  number (#889). */
export const TOC_PART_PLACEHOLDERS = ['leader'] as const;

type Labels = ReturnType<typeof useSandboxLabels>;
export type PageNumberConfig = NonNullable<TocConfig['pageNumber']>;
export type LeaderConfig = NonNullable<TocConfig['leader']>;
export type SubtitleConfig = NonNullable<TocConfig['subtitle']>;
export type PartsRowConfig = NonNullable<TocConfig['parts']>;
export type GroupsConfig = NonNullable<TocConfig['groups']>;
export type ContinuationConfig = NonNullable<GroupsConfig['continuation']>;

/** Copy of `obj` without `key`; `undefined` when nothing remains. */
export function omit<T extends object, K extends keyof T>(obj: T | undefined, key: K): T | undefined {
  if (!obj) return undefined;
  const next = { ...obj };
  delete next[key];
  return Object.keys(next).length > 0 ? next : undefined;
}

export function hasKeys(obj: object | undefined): boolean {
  return obj !== undefined && Object.keys(obj).length > 0;
}

/** `{ ...base, ...partial }` with the keys `partial` sets to `undefined` dropped. */
export function merge<T extends object>(base: T | undefined, partial: Partial<T>): T {
  const next = { ...base, ...partial } as T;
  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined) delete (next as Record<string, unknown>)[k];
  }
  return next;
}

/** The face of a contents leader (#1121): colour, family, size and
 *  weight, each shown as what the leader is set in while it is unset
 *  (`shown`). */
export function LeaderFaceFields({ raw, shown, onUpdate, onReset, fieldId, labels }: {
  raw: TocLeaderFaceConfig | undefined;
  shown: { color: ColorValue; fontFamily: string; fontSize: Dimension; fontWeight: number };
  onUpdate: (partial: TocLeaderFaceConfig) => void;
  onReset: (field: keyof TocLeaderFaceConfig) => void;
  fieldId: string;
  labels: Labels;
}) {
  return (
    <>
      <ColorPicker
        label={labels.colorLabel}
        value={raw?.color ?? shown.color}
        onChange={(v) => onUpdate({ color: v })}
        isDefault={raw?.color === undefined}
        onReset={() => onReset('color')}
        fieldId={fieldId}
      />
      <FontPicker
        label={labels.fontLabel}
        value={raw?.fontFamily ?? shown.fontFamily}
        onChange={(v) => onUpdate({ fontFamily: v })}
        isDefault={raw?.fontFamily === undefined}
        onReset={() => onReset('fontFamily')}
        searchPlaceholder={labels.bodyFontSearch}
        noResultsLabel={labels.bodyFontNoResults}
      />
      <DimensionInput
        label={labels.sizeLabel}
        value={raw?.fontSize ?? shown.fontSize}
        onChange={(v) => onUpdate({ fontSize: v })}
        min={0.5}
        step={0.5}
        units={TEXT_SIZE_UNITS}
        isDefault={raw?.fontSize === undefined}
        onReset={() => onReset('fontSize')}
      />
      <NumberInput
        label={labels.headingFontWeight}
        value={raw?.fontWeight ?? shown.fontWeight}
        onChange={(v) => onUpdate({ fontWeight: v })}
        min={100}
        max={900}
        step={10}
        isDefault={raw?.fontWeight === undefined}
        onReset={() => onReset('fontWeight')}
      />
    </>
  );
}

interface EntryStyleFieldsProps {
  raw: TocEntryStyleConfig | undefined;
  resolved: ResolvedTocEntryStyleConfig;
  onUpdate: (partial: Partial<TocEntryStyleConfig>) => void;
  onReset: (field: keyof TocEntryStyleConfig) => void;
  fieldIdPrefix: string;
  labels: Labels;
}

/** The typography of one kind of contents entry — a level, or the
 *  unnumbered headings. Shows the resolved value; each field resets by
 *  dropping its key. */
export function EntryStyleFields({ raw, resolved, onUpdate, onReset, fieldIdPrefix, labels }: EntryStyleFieldsProps) {
  const unset = (field: keyof TocEntryStyleConfig) => raw?.[field] === undefined;
  return (
    <>
      <FontPicker
        label={labels.fontLabel}
        value={resolved.fontFamily}
        onChange={(v) => onUpdate({ fontFamily: v })}
        isDefault={unset('fontFamily')}
        onReset={() => onReset('fontFamily')}
        searchPlaceholder={labels.bodyFontSearch}
        noResultsLabel={labels.bodyFontNoResults}
      />
      <DimensionInput
        label={labels.sizeLabel}
        value={resolved.fontSize}
        onChange={(v) => onUpdate({ fontSize: v })}
        min={1}
        step={0.5}
        units={TEXT_SIZE_UNITS}
        isDefault={unset('fontSize')}
        onReset={() => onReset('fontSize')}
      />
      <DimensionInput
        label={labels.bodyLineHeight}
        value={resolved.lineHeight}
        onChange={(v) => onUpdate({ lineHeight: v })}
        min={0.5}
        max={5}
        step={0.1}
        units={LINE_HEIGHT_UNITS}
        tooltip={labels.tocEntryLineHeightTooltip}
        isDefault={unset('lineHeight')}
        onReset={() => onReset('lineHeight')}
      />
      <NumberInput
        label={labels.headingFontWeight}
        value={resolved.fontWeight}
        onChange={(v) => onUpdate({ fontWeight: v })}
        min={100}
        max={900}
        step={10}
        isDefault={unset('fontWeight')}
        onReset={() => onReset('fontWeight')}
      />
      <ToggleSwitch
        label={labels.headingItalic} tooltip={labels.italicHelp}
        checked={resolved.italic}
        onChange={(v) => onUpdate({ italic: v })}
        isDefault={unset('italic')}
        onReset={() => onReset('italic')}
      />
      <ColorPicker
        label={labels.colorLabel}
        value={resolved.color}
        onChange={(v) => onUpdate({ color: v })}
        isDefault={unset('color')}
        onReset={() => onReset('color')}
        fieldId={`${fieldIdPrefix}-color`}
      />
      <DimensionInput
        label={labels.tocEntryIndent}
        value={resolved.indent}
        onChange={(v) => onUpdate({ indent: v })}
        min={0}
        step={0.1}
        units={SPACING_UNITS}
        tooltip={labels.tocEntryIndentTooltip}
        isDefault={unset('indent')}
        onReset={() => onReset('indent')}
      />
      <DimensionInput
        label={labels.tocEntryNumberWidth}
        value={resolved.numberWidth}
        onChange={(v) => onUpdate({ numberWidth: v })}
        min={0}
        step={0.1}
        units={SPACING_UNITS}
        tooltip={labels.tocEntryNumberWidthTooltip}
        isDefault={unset('numberWidth')}
        onReset={() => onReset('numberWidth')}
      />
      <DimensionInput
        label={labels.tocEntryNumberGap}
        value={resolved.numberGap}
        onChange={(v) => onUpdate({ numberGap: v })}
        min={0}
        step={0.1}
        units={SPACING_UNITS}
        tooltip={labels.tocEntryNumberGapTooltip}
        isDefault={unset('numberGap')}
        onReset={() => onReset('numberGap')}
      />
      <FontPicker
        label={labels.tocEntryNumberFont}
        value={resolved.numberFontFamily}
        onChange={(v) => onUpdate({ numberFontFamily: v })}
        tooltip={labels.tocEntryNumberFontTooltip}
        isDefault={unset('numberFontFamily')}
        onReset={() => onReset('numberFontFamily')}
        searchPlaceholder={labels.bodyFontSearch}
        noResultsLabel={labels.bodyFontNoResults}
      />
      <DimensionInput
        label={labels.tocEntryNumberFontSize}
        value={resolved.numberFontSize}
        onChange={(v) => onUpdate({ numberFontSize: v })}
        min={1}
        step={0.5}
        units={TEXT_SIZE_UNITS}
        isDefault={unset('numberFontSize')}
        onReset={() => onReset('numberFontSize')}
      />
      <NumberInput
        label={labels.tocEntryNumberFontWeight}
        value={resolved.numberFontWeight}
        onChange={(v) => onUpdate({ numberFontWeight: v })}
        min={100}
        max={900}
        step={10}
        isDefault={unset('numberFontWeight')}
        onReset={() => onReset('numberFontWeight')}
      />
      <ColorPicker
        label={labels.tocEntryNumberColor}
        value={resolved.numberColor}
        onChange={(v) => onUpdate({ numberColor: v })}
        isDefault={unset('numberColor')}
        onReset={() => onReset('numberColor')}
        fieldId={`${fieldIdPrefix}-number-color`}
      />
      <DimensionInput
        label={labels.marginTop}
        value={resolved.marginTop}
        onChange={(v) => onUpdate({ marginTop: v })}
        min={0}
        step={0.1}
        units={SPACING_UNITS}
        tooltip={labels.tocEntryMarginTooltip}
        isDefault={unset('marginTop')}
        onReset={() => onReset('marginTop')}
      />
      <DimensionInput
        label={labels.marginBottom}
        value={resolved.marginBottom}
        onChange={(v) => onUpdate({ marginBottom: v })}
        min={0}
        step={0.1}
        units={SPACING_UNITS}
        tooltip={labels.tocEntryMarginTooltip}
        isDefault={unset('marginBottom')}
        onReset={() => onReset('marginBottom')}
      />
    </>
  );
}
