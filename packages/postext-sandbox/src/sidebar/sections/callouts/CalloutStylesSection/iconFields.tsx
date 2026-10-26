'use client';

// Tab and label icon pickers: the joined-tab patch, common tab glyphs,
// glyph buttons, tint and shape fields and the icon fields a box style card
// shows (#1276: split out of CalloutStylesSection.tsx).
import type { CalloutLabelConfig, CalloutLabelIconKind, ColorValue, CalloutIconShape, Dimension, ResolvedCalloutStyleConfig, CalloutIconConfig, Resource, CalloutIconKind, CalloutIconPosition, CalloutIconCornerSide, CalloutIconAlign } from 'postext';
import { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { ToggleSwitch, ColorPicker, SelectInput, DimensionInput, TextInput, FontPicker, NumberInput } from '../../../../controls/index.js';
import { cn } from '../../../../ui/index.js';
import { useFieldIds } from '../../../../controls/fieldContext.js';
import { FieldRow } from '../../../../controls/FieldRow.js';
import { flowSideLabels, useRightToLeftFlow } from '../../../settings/flowSides.js';
import { SPACING_UNITS, iconLabel } from './shared.js';

/** What the joined switch writes (#1063): a joined tab stands on the
 *  edge, so turning it on takes a rise off (the engine reads none and
 *  warns about one). */
export function joinedTabPatch(joined: boolean): Partial<CalloutLabelConfig> {
  return joined ? { joined: true, offset: { value: 0, unit: 'pt' } } : { joined: false };
}

/** The symbols the tab's glyph picker offers (#1066); any other character
 *  is typed in the glyph field. */
export const COMMON_TAB_GLYPHS = ['◉', '●', '○', '■', '□', '▲', '★', '✓', '✎', '➜'] as const;

/** What switching a tab icon's kind writes (#1066): the kind, and for a
 *  glyph tab with no glyph yet the first common symbol, so the switch
 *  shows one at once. */
export function labelIconKindPatch(icon: CalloutLabelConfig['icon'], kind: CalloutLabelIconKind): Partial<NonNullable<CalloutLabelConfig['icon']>> {
  return kind === 'glyph' && !icon?.glyph ? { kind, glyph: COMMON_TAB_GLYPHS[0] } : { kind };
}

/** A row of common symbols for a tab's glyph: a click sets it. Each is a
 *  button named «Use ◉» and pressed when it is the glyph set. */
export function GlyphPicker({ label, useLabel, value, onPick }: { label: string; useLabel: string; value: string; onPick: (glyph: string) => void }) {
  return (
    <FieldRow stacked label={label}>
      <GlyphButtons label={label} useLabel={useLabel} value={value} onPick={onPick} />
    </FieldRow>
  );
}

function GlyphButtons({ label, useLabel, value, onPick }: { label: string; useLabel: string; value: string; onPick: (glyph: string) => void }) {
  const ids = useFieldIds();
  return (
    <div id={ids?.controlId} role="group" aria-label={label} className="flex flex-wrap gap-1" data-glyph-picker="">
      {COMMON_TAB_GLYPHS.map((g) => (
        <button
          key={g}
          type="button"
          aria-label={useLabel.replace('__glyph__', g)}
          aria-pressed={value === g}
          onClick={() => onPick(g)}
          className={cn(
            'inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border text-sm leading-none transition-colors pt-large:h-11 pt-large:w-11',
            'focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
            value === g ? 'border-(--brand) bg-(--brand) text-(--background)' : 'border-(--rule) bg-transparent text-(--foreground) hover:bg-(--surface)',
          )}
        >
          <span aria-hidden="true">{g}</span>
        </button>
      ))}
    </div>
  );
}

/** A picture painted in one colour (#995, #1120): a switch, and the
 *  colour it is painted in (`ownColor` until one is picked). */
export function TintFields({ tint, ownColor, update, isDefault, onReset, fieldId, toggleLabel, toggleTooltip }: {
  tint: boolean | ColorValue | undefined;
  ownColor: ColorValue;
  update: (tint: boolean | ColorValue) => void;
  isDefault: boolean;
  onReset: () => void;
  fieldId: string;
  toggleLabel: string;
  toggleTooltip: string;
}) {
  const labels = useSandboxLabels();
  const on = tint === true || (typeof tint === 'object' && tint !== null);
  return (
    <>
      <ToggleSwitch
        label={toggleLabel}
        checked={on}
        onChange={(v) => update(v)}
        tooltip={toggleTooltip}
        isDefault={isDefault}
        onReset={onReset}
      />
      {on && (
        <ColorPicker
          label={labels.calloutStyleIconTintColor}
          tooltip={labels.calloutStyleIconTintColorTooltip}
          value={typeof tint === 'object' ? tint : ownColor}
          onChange={(v) => update(v)}
          isDefault={tint === true}
          onReset={() => update(true)}
          fieldId={fieldId}
        />
      )}
    </>
  );
}

/** A drawn ring or dot (#1120): which, and the ring's line. */
export function ShapeFields({ shape, strokeWidth, sizeForDefault, update, isDefault, onReset }: {
  shape: CalloutIconShape;
  strokeWidth: Dimension | undefined;
  sizeForDefault: Dimension;
  update: (partial: { shape?: CalloutIconShape; strokeWidth?: Dimension }) => void;
  isDefault: (field: 'shape' | 'strokeWidth') => boolean;
  onReset: (field: 'shape' | 'strokeWidth') => void;
}) {
  const labels = useSandboxLabels();
  return (
    <>
      <SelectInput
        label={labels.calloutStyleIconShape}
        value={shape}
        options={[
          { value: 'ring', label: labels.calloutStyleIconShapeRing },
          { value: 'dot', label: labels.calloutStyleIconShapeDot },
        ]}
        onChange={(v) => update({ shape: v as CalloutIconShape })}
        tooltip={labels.calloutStyleIconShapeTooltip}
        isDefault={isDefault('shape')}
        onReset={() => onReset('shape')}
      />
      {shape === 'ring' && (
        <DimensionInput
          label={labels.calloutStyleIconStrokeWidth}
          value={strokeWidth ?? { value: sizeForDefault.value / 8, unit: sizeForDefault.unit }}
          onChange={(v) => update({ strokeWidth: v })}
          min={0}
          step={0.05}
          units={SPACING_UNITS}
          tooltip={labels.calloutStyleIconStrokeWidthTooltip}
          isDefault={isDefault('strokeWidth')}
          onReset={() => onReset('strokeWidth')}
        />
      )}
    </>
  );
}

/** The fields the icon and the marker share; the position fields exist on
 *  the in-box icon only (the marker always sits in its own column). */
type IconSpec = Pick<ResolvedCalloutStyleConfig['icon'], 'kind' | 'glyph' | 'resourceId' | 'fontFamily' | 'fontWeight' | 'size' | 'color' | 'align'> &
  Partial<Pick<ResolvedCalloutStyleConfig['icon'], 'position' | 'cornerSide' | 'width' | 'shape' | 'strokeWidth' | 'tint'>>;
type IconField = keyof CalloutIconConfig;

interface IconFieldsProps {
  /** Resolved icon (or marker) spec the controls display. */
  value: IconSpec;
  kindLabel: string;
  kindTooltip: string;
  update: (partial: Partial<CalloutIconConfig>) => void;
  isDefault: (field: IconField) => boolean;
  onReset: (field: IconField) => void;
  fieldId: string;
  iconResources: Resource[];
  /** Show the inline / corner position controls (in-box icon only). */
  withPosition?: boolean;
}

/** Kind / glyph / resource / size / alignment controls shared by the in-box
 *  icon and the marker (the same `CalloutIconConfig` shape). */
export function IconFields({ value, kindLabel, kindTooltip, update, isDefault, onReset, fieldId, iconResources, withPosition }: IconFieldsProps) {
  const labels = useSandboxLabels();
  const side = flowSideLabels(useRightToLeftFlow(), labels.sideColumnSideLeft, labels.sideColumnSideRight);
  const kindOptions = [
    { value: 'none', label: labels.calloutStyleIconKindNone },
    { value: 'glyph', label: labels.calloutStyleIconKindGlyph },
    { value: 'resource', label: labels.calloutStyleIconKindResource },
    { value: 'shape', label: labels.calloutStyleIconKindShape },
  ];
  const alignOptions = [
    { value: 'top', label: labels.calloutStyleIconAlignTop },
    { value: 'center', label: labels.calloutStyleIconAlignCenter },
  ];
  const positionOptions = [
    { value: 'inline', label: labels.calloutStyleIconPositionInline },
    { value: 'corner', label: labels.calloutStyleIconPositionCorner },
  ];
  // Left and right are the body flow's sides; start and end the box's own
  // (an English box in an Arabic book has its start on the left).
  const cornerSideOptions = [
    { value: 'right', label: side.right },
    { value: 'left', label: side.left },
    { value: 'outer', label: labels.sideColumnSideOuter },
    { value: 'inner', label: labels.sideColumnSideInner },
    { value: 'start', label: labels.sideTextStart },
    { value: 'end', label: labels.sideTextEnd },
  ];
  const resourceOptions = [
    { value: '', label: labels.calloutStyleIconResourceNone },
    ...iconResources.map((r) => ({ value: r.id, label: iconLabel(r) })),
  ];
  // Keep a dangling resource id selectable so the picker never shows a
  // value that is not in its option list.
  if (value.resourceId && !iconResources.some((r) => r.id === value.resourceId)) {
    resourceOptions.push({ value: value.resourceId, label: value.resourceId });
  }
  return (
    <>
      <SelectInput
        label={kindLabel}
        value={value.kind}
        options={kindOptions}
        onChange={(v) => update({ kind: v as CalloutIconKind })}
        tooltip={kindTooltip}
        isDefault={isDefault('kind')}
        onReset={() => onReset('kind')}
      />
      {value.kind === 'glyph' && (
        <>
          <TextInput
            label={labels.calloutStyleIconGlyph}
            value={value.glyph}
            onChange={(v) => update({ glyph: v })}
            tooltip={labels.calloutStyleIconGlyphTooltip}
            widthCh={6}
            isDefault={isDefault('glyph')}
            onReset={() => onReset('glyph')}
          />
          <FontPicker
            label={labels.calloutStyleIconFont}
            value={value.fontFamily}
            onChange={(v) => update({ fontFamily: v })}
            isDefault={isDefault('fontFamily')}
            onReset={() => onReset('fontFamily')}
            searchPlaceholder={labels.bodyFontSearch}
            noResultsLabel={labels.bodyFontNoResults}
          />
          <NumberInput
            label={labels.calloutStyleIconWeight}
            value={value.fontWeight}
            onChange={(v) => update({ fontWeight: v })}
            min={100}
            max={900}
            step={10}
            isDefault={isDefault('fontWeight')}
            onReset={() => onReset('fontWeight')}
          />
          <ColorPicker
            label={labels.calloutStyleIconColor}
            value={value.color}
            onChange={(v) => update({ color: v })}
            isDefault={isDefault('color')}
            onReset={() => onReset('color')}
            fieldId={fieldId}
          />
        </>
      )}
      {value.kind === 'resource' && (
        <>
          <SelectInput
            label={labels.calloutStyleIconResource}
            value={value.resourceId}
            options={resourceOptions}
            onChange={(v) => update({ resourceId: v })}
            tooltip={labels.calloutStyleIconResourceTooltip}
            isDefault={isDefault('resourceId')}
            onReset={() => onReset('resourceId')}
          />
          <TintFields
            tint={value.tint}
            ownColor={value.color}
            update={(tint) => update({ tint })}
            isDefault={isDefault('tint')}
            onReset={() => onReset('tint')}
            fieldId={`${fieldId}-tint`}
            toggleLabel={labels.calloutStyleIconTint}
            toggleTooltip={labels.calloutStyleIconTintTooltip}
          />
        </>
      )}
      {value.kind === 'shape' && (
        <>
          <ShapeFields
            shape={value.shape ?? 'ring'}
            strokeWidth={value.strokeWidth}
            sizeForDefault={value.size}
            update={update}
            isDefault={isDefault}
            onReset={onReset}
          />
          <ColorPicker
            label={labels.calloutStyleIconColor}
            value={value.color}
            onChange={(v) => update({ color: v })}
            isDefault={isDefault('color')}
            onReset={() => onReset('color')}
            fieldId={`${fieldId}-shape`}
          />
        </>
      )}
      {value.kind !== 'none' && (
        <>
          <DimensionInput
            label={labels.calloutStyleIconSize}
            value={value.size}
            onChange={(v) => update({ size: v })}
            min={0}
            step={0.1}
            units={SPACING_UNITS}
            isDefault={isDefault('size')}
            onReset={() => onReset('size')}
          />
          <DimensionInput
            label={labels.calloutStyleIconWidth}
            value={value.width ?? value.size}
            onChange={(v) => update({ width: v })}
            min={0}
            step={0.1}
            units={SPACING_UNITS}
            tooltip={labels.calloutStyleIconWidthTooltip}
            isDefault={isDefault('width')}
            onReset={() => onReset('width')}
          />
          {withPosition && (
            <SelectInput
              label={labels.calloutStyleIconPosition}
              value={value.position ?? 'inline'}
              options={positionOptions}
              onChange={(v) => update({ position: v as CalloutIconPosition })}
              tooltip={labels.calloutStyleIconPositionTooltip}
              isDefault={isDefault('position')}
              onReset={() => onReset('position')}
            />
          )}
          {withPosition && value.position === 'corner' ? (
            <SelectInput
              label={labels.calloutStyleIconCornerSide}
              value={value.cornerSide ?? 'right'}
              options={cornerSideOptions}
              onChange={(v) => update({ cornerSide: v as CalloutIconCornerSide })}
              tooltip={labels.calloutStyleIconCornerSideTooltip}
              isDefault={isDefault('cornerSide')}
              onReset={() => onReset('cornerSide')}
            />
          ) : (
            <SelectInput
              label={labels.calloutStyleIconAlign} tooltip={labels.calloutStyleIconAlignTooltip}
              value={value.align}
              options={alignOptions}
              onChange={(v) => update({ align: v as CalloutIconAlign })}
              isDefault={isDefault('align')}
              onReset={() => onReset('align')}
            />
          )}
        </>
      )}
    </>
  );
}
