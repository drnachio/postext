'use client';

import { memo, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import type {
  AnchorEdge,
  CalloutBodyStyleConfig,
  CalloutBorderConfig,
  CalloutFixedConfig,
  CalloutIconAlign,
  CalloutIconConfig,
  CalloutIconCornerSide,
  CalloutIconKind,
  CalloutIconPosition,
  CalloutLabelConfig,
  CalloutListStyleConfig,
  CalloutMarkerConfig,
  CalloutMarkerRuleConfig,
  CalloutPaddingConfig,
  CalloutPlacement,
  CalloutSpan,
  CalloutStripeConfig,
  CalloutStripeSide,
  CalloutStyleConfig,
  CalloutTextTransform,
  CalloutTitleStyleConfig,
  CalloutWidth,
  Dimension,
  DimensionUnit,
  ElementAnchor,
  Resource,
  ResolvedCalloutStyleConfig,
} from 'postext';
import {
  DEFAULT_CALLOUT_STYLES,
  resolveBodyTextConfig,
  resolveCalloutStylesConfig,
  resolveHeadingsConfig,
  resolveUnorderedListsConfig,
} from 'postext';
import {
  useSandboxDispatch,
  useSandboxLabels,
  useSandboxResources,
  useSandboxSelector,
} from '../../context/SandboxContext';
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
import { Button, ConfirmPopover, IconButton } from '../../ui';
import { FieldRow } from '../../controls/FieldRow';
import { SearchScope } from '../search/SearchScope';
import { CONTAINER_EDGES } from './HeaderFooterSection/placementAdapter';

const FONT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
const LINE_HEIGHT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const SPACING_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const STROKE_UNITS: DimensionUnit[] = ['pt', 'px', 'mm'];
const OFFSET_UNITS: DimensionUnit[] = ['mm', 'pt', 'px', 'em'];
const TRACKING_UNITS: DimensionUnit[] = ['pt', 'em', 'px'];

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
const inputStyle = { borderColor: 'var(--rule)', color: 'var(--foreground)' } as const;

/** Turn free text into a `:::callout{type="…"}`-friendly id. */
function slugifyStyleId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function nextStyleId(existing: CalloutStyleConfig[]): string {
  const taken = new Set(existing.map((s) => s.id));
  let n = existing.length + 1;
  while (taken.has(`callout-${n}`)) n++;
  return `callout-${n}`;
}

/** Sub-objects of a callout style that are edited field by field. */
type Group = 'border' | 'padding' | 'stripe' | 'icon' | 'label' | 'marker' | 'titleStyle' | 'body' | 'lists';
type GroupConfig<G extends Group> = NonNullable<CalloutStyleConfig[G]>;

function iconLabel(r: Resource): string {
  const text = r.caption?.trim();
  return text ? `${text} (${r.id})` : r.id;
}

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <FieldRow stacked label={label} hint={hint} className="mb-0">
      {children}
    </FieldRow>
  );
}

function CardButton({
  label,
  onClick,
  destructive,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return <IconButton label={label} icon={children} onClick={onClick} destructive={destructive} />;
}

/** The fields the icon and the marker share; the position fields exist on
 *  the in-box icon only (the marker always sits in its own column). */
type IconSpec = Pick<ResolvedCalloutStyleConfig['icon'], 'kind' | 'glyph' | 'resourceId' | 'fontFamily' | 'fontWeight' | 'size' | 'color' | 'align'> &
  Partial<Pick<ResolvedCalloutStyleConfig['icon'], 'position' | 'cornerSide' | 'width'>>;
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
function IconFields({ value, kindLabel, kindTooltip, update, isDefault, onReset, fieldId, iconResources, withPosition }: IconFieldsProps) {
  const labels = useSandboxLabels();
  const kindOptions = [
    { value: 'none', label: labels.calloutStyleIconKindNone },
    { value: 'glyph', label: labels.calloutStyleIconKindGlyph },
    { value: 'resource', label: labels.calloutStyleIconKindResource },
  ];
  const alignOptions = [
    { value: 'top', label: labels.calloutStyleIconAlignTop },
    { value: 'center', label: labels.calloutStyleIconAlignCenter },
  ];
  const positionOptions = [
    { value: 'inline', label: labels.calloutStyleIconPositionInline },
    { value: 'corner', label: labels.calloutStyleIconPositionCorner },
  ];
  const cornerSideOptions = [
    { value: 'right', label: labels.sideColumnSideRight },
    { value: 'left', label: labels.sideColumnSideLeft },
    { value: 'outer', label: labels.sideColumnSideOuter },
    { value: 'inner', label: labels.sideColumnSideInner },
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
        <SelectInput
          label={labels.calloutStyleIconResource}
          value={value.resourceId}
          options={resourceOptions}
          onChange={(v) => update({ resourceId: v })}
          tooltip={labels.calloutStyleIconResourceTooltip}
          isDefault={isDefault('resourceId')}
          onReset={() => onReset('resourceId')}
        />
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
              label={labels.calloutStyleIconAlign}
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

interface CalloutStyleCardProps {
  style: CalloutStyleConfig;
  resolved: ResolvedCalloutStyleConfig;
  otherIds: Set<string>;
  iconResources: Resource[];
  /** Resolved document list values the optional bullet fields fall back to. */
  listDefaults: { bulletFontSize: Dimension; bulletFontWeight: number };
  onChange: (partial: Partial<CalloutStyleConfig>) => void;
  onResetField: (field: keyof CalloutStyleConfig) => void;
  onRename: (nextId: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

/** One callout style. Every control shows the resolved value and offers a
 *  per-field reset while the key is set, so a style only stores what
 *  differs from the built-in defaults (and from the body text, headings and
 *  list sections it inherits from). */
function CalloutStyleCard({
  style,
  resolved,
  otherIds,
  iconResources,
  listDefaults,
  onChange,
  onResetField,
  onRename,
  onDuplicate,
  onRemove,
}: CalloutStyleCardProps) {
  const labels = useSandboxLabels();
  const [idDraft, setIdDraft] = useState(style.id);
  const draftSlug = slugifyStyleId(idDraft);
  const idTaken = draftSlug.length > 0 && draftSlug !== style.id && otherIds.has(draftSlug);
  const idEmpty = draftSlug.length === 0;
  const sectionId = `calloutStyles.${style.id}`;
  const fieldId = `calloutStyle-${style.id}`;

  const commitId = () => {
    if (idEmpty || idTaken) {
      setIdDraft(style.id);
      return;
    }
    setIdDraft(draftSlug);
    if (draftSlug !== style.id) onRename(draftSlug);
  };

  const unset = (field: keyof CalloutStyleConfig) => style[field] === undefined;

  const updateGroup = <G extends Group>(group: G, partial: Partial<GroupConfig<G>>) => {
    const current = (style[group] ?? {}) as GroupConfig<G>;
    onChange({ [group]: { ...current, ...partial } } as Partial<CalloutStyleConfig>);
  };
  const resetGroupField = <G extends Group>(group: G, field: keyof GroupConfig<G>) => {
    const current = style[group] as GroupConfig<G> | undefined;
    if (!current) return;
    const next: Partial<GroupConfig<G>> = { ...current };
    delete next[field];
    if (Object.keys(next).length > 0) onChange({ [group]: next } as Partial<CalloutStyleConfig>);
    else onResetField(group);
  };
  const groupUnset = <G extends Group>(group: G, field: keyof GroupConfig<G>) => {
    const current = style[group] as Partial<GroupConfig<G>> | undefined;
    return current === undefined || current[field] === undefined;
  };

  const border = (partial: Partial<CalloutBorderConfig>) => updateGroup('border', partial);
  const padding = (partial: Partial<CalloutPaddingConfig>) => updateGroup('padding', partial);
  const stripe = (partial: Partial<CalloutStripeConfig>) => updateGroup('stripe', partial);
  const icon = (partial: Partial<CalloutIconConfig>) => updateGroup('icon', partial);
  const marker = (partial: Partial<CalloutMarkerConfig>) => updateGroup('marker', partial);
  /** `marker.rule` is nested one level deeper: merge there and drop the
   *  rule (then the marker) when nothing is left set. */
  const updateMarkerRule = (partial: Partial<CalloutMarkerRuleConfig>) =>
    marker({ rule: { ...style.marker?.rule, ...partial } });
  const resetMarkerRuleField = (field: keyof CalloutMarkerRuleConfig) => {
    const rule: CalloutMarkerRuleConfig = { ...style.marker?.rule };
    delete rule[field];
    if (Object.keys(rule).length > 0) marker({ rule });
    else resetGroupField('marker', 'rule');
  };
  const markerRuleUnset = (field: keyof CalloutMarkerRuleConfig) => style.marker?.rule?.[field] === undefined;
  const label = (partial: Partial<CalloutLabelConfig>) => updateGroup('label', partial);
  /** `label.icon` / `label.rule` are nested one level deeper, like the
   *  marker rule: merge there and drop the sub-object when nothing is left. */
  const updateLabelIcon = (partial: Partial<NonNullable<CalloutLabelConfig['icon']>>) =>
    label({ icon: { ...style.label?.icon, ...partial } });
  const resetLabelIconField = (field: keyof NonNullable<CalloutLabelConfig['icon']>) => {
    const icon = { ...style.label?.icon };
    delete icon[field];
    if (Object.keys(icon).length > 0) label({ icon });
    else resetGroupField('label', 'icon');
  };
  const labelIconUnset = (field: keyof NonNullable<CalloutLabelConfig['icon']>) => style.label?.icon?.[field] === undefined;
  const updateLabelRule = (partial: Partial<NonNullable<CalloutLabelConfig['rule']>>) =>
    label({ rule: { ...style.label?.rule, ...partial } });
  const resetLabelRuleField = (field: keyof NonNullable<CalloutLabelConfig['rule']>) => {
    const rule = { ...style.label?.rule };
    delete rule[field];
    if (Object.keys(rule).length > 0) label({ rule });
    else resetGroupField('label', 'rule');
  };
  const labelRuleUnset = (field: keyof NonNullable<CalloutLabelConfig['rule']>) => style.label?.rule?.[field] === undefined;
  const labelResourceOptions = [
    { value: '', label: labels.calloutStyleIconResourceNone },
    ...iconResources.map((r) => ({ value: r.id, label: iconLabel(r) })),
  ];
  if (resolved.label?.icon.resourceId && !iconResources.some((r) => r.id === resolved.label?.icon.resourceId)) {
    labelResourceOptions.push({ value: resolved.label.icon.resourceId, label: resolved.label.icon.resourceId });
  }
  const labelPositionOptions = [
    { value: 'top-right', label: labels.calloutStyleLabelPositionTopRight },
    { value: 'top-left', label: labels.calloutStyleLabelPositionTopLeft },
  ];
  const title = (partial: Partial<CalloutTitleStyleConfig>) => updateGroup('titleStyle', partial);
  const body = (partial: Partial<CalloutBodyStyleConfig>) => updateGroup('body', partial);
  const lists = (partial: Partial<CalloutListStyleConfig>) => updateGroup('lists', partial);

  const spanOptions = [
    { value: 'column', label: labels.calloutStyleSpanColumn },
    { value: 'page', label: labels.calloutStyleSpanPage },
    { value: 'side', label: labels.calloutStyleSpanSide },
  ];
  const placementOptions = [
    { value: 'here', label: labels.calloutStylePlacementHere },
    { value: 'auto', label: labels.calloutStylePlacementAuto },
    { value: 'top', label: labels.calloutStylePlacementTop },
    { value: 'bottom', label: labels.calloutStylePlacementBottom },
    { value: 'fixed', label: labels.calloutStylePlacementFixed },
  ];
  const fixedAnchorToOptions = [
    { value: 'container', label: labels.calloutStyleFixedAnchorContainer },
    { value: 'page', label: labels.headerFooterAnchorToPage },
    { value: 'bleed', label: labels.headerFooterAnchorToBleed },
  ];
  const frameEdgeLabels: Record<string, string> = {
    'top-left': labels.headerFooterFrameEdgeTopLeft,
    top: labels.headerFooterFrameEdgeTop,
    'top-right': labels.headerFooterFrameEdgeTopRight,
    left: labels.headerFooterFrameEdgeLeft,
    center: labels.headerFooterFrameEdgeCenter,
    right: labels.headerFooterFrameEdgeRight,
    'bottom-left': labels.headerFooterFrameEdgeBottomLeft,
    bottom: labels.headerFooterFrameEdgeBottom,
    'bottom-right': labels.headerFooterFrameEdgeBottomRight,
  };
  const fixedEdgeOptions = CONTAINER_EDGES.map((edge: AnchorEdge) => ({ value: edge, label: frameEdgeLabels[edge] ?? edge }));
  /** `fixed.anchor` / `fixed.offset` are nested objects: merge at each level
   *  and drop the group entirely when nothing is left set. */
  const updateFixedAnchor = (partial: Partial<ElementAnchor>) =>
    onChange({ fixed: { ...style.fixed, anchor: { ...resolved.fixed.anchor, ...partial } } });
  const updateFixedOffset = (axis: 'x' | 'y', value: Dimension) =>
    onChange({ fixed: { ...style.fixed, offset: { ...style.fixed?.offset, [axis]: value } } });
  const resetFixed = (part: 'anchor' | 'x' | 'y') => {
    const next: CalloutFixedConfig = { ...style.fixed };
    if (part === 'anchor') delete next.anchor;
    else if (next.offset) {
      const offset = { ...next.offset };
      delete offset[part];
      if (Object.keys(offset).length > 0) next.offset = offset;
      else delete next.offset;
    }
    if (Object.keys(next).length > 0) onChange({ fixed: next });
    else onResetField('fixed');
  };
  const widthOptions = [
    { value: 'fill', label: labels.calloutStyleWidthFill },
    { value: 'auto', label: labels.calloutStyleWidthAuto },
  ];
  const stripeSideOptions = [
    { value: 'left', label: labels.calloutStyleStripeSideLeft },
    { value: 'right', label: labels.calloutStyleStripeSideRight },
    { value: 'top', label: labels.calloutStyleStripeSideTop },
  ];
  const transformOptions = [
    { value: 'none', label: labels.calloutStyleTitleTransformNone },
    { value: 'uppercase', label: labels.calloutStyleTitleTransformUppercase },
  ];
  const bodyAlignOptions = [
    { value: 'left', label: labels.bodyTextAlignLeft },
    { value: 'justify', label: labels.bodyTextAlignJustify },
  ];

  return (
    <SearchScope title={`${style.name ?? ''} ${style.id}`} overridden>
    <div className="mb-3 rounded border p-2" style={{ borderColor: 'var(--rule)' }}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <span
          className="truncate text-xs font-medium"
          style={{ color: 'var(--foreground)' }}
          title={style.name ?? style.id}
        >
          {style.name || style.id}
        </span>
        <div className="flex items-center">
          <CardButton label={labels.calloutStyleDuplicate} onClick={onDuplicate}>
            <Copy size={13} aria-hidden="true" />
          </CardButton>
          <ConfirmPopover message={labels.calloutStyleDeleteConfirm} onConfirm={onRemove}>
            {({ open }) => (
              <CardButton label={labels.calloutStyleDelete} onClick={open} destructive>
                <Trash2 size={13} aria-hidden="true" />
              </CardButton>
            )}
          </ConfirmPopover>
        </div>
      </div>

      <div className="mb-2 flex flex-col gap-2">
        <Field
          label={labels.idLabel}
          hint={
            idTaken
              ? labels.calloutStyleIdHintDuplicate
              : labels.calloutStyleUsageHint.replace('__id__', style.id)
          }
        >
          <input
            type="text"
            value={idDraft}
            onChange={(e) => setIdDraft(e.target.value)}
            onBlur={commitId}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            aria-label={labels.calloutStyleIdAria}
            className={inputClass}
            style={{
              ...inputStyle,
              borderColor: idEmpty || idTaken ? 'var(--destructive)' : 'var(--rule)',
            }}
          />
        </Field>
        <Field label={labels.calloutStyleNameLabel}>
          <input
            type="text"
            value={style.name ?? ''}
            onChange={(e) => onChange({ name: e.target.value.length > 0 ? e.target.value : undefined })}
            aria-label={labels.calloutStyleNameAria}
            placeholder={style.id}
            className={inputClass}
            style={inputStyle}
          />
        </Field>
      </div>

      <TextInput
        label={labels.calloutStyleTitle}
        value={resolved.title}
        onChange={(v) => onChange({ title: v })}
        tooltip={labels.calloutStyleTitleTooltip}
        isDefault={unset('title')}
        onReset={() => onResetField('title')}
      />
      <SelectInput
        label={labels.calloutStyleSpan}
        value={resolved.span}
        options={spanOptions}
        onChange={(v) => onChange({ span: v as CalloutSpan })}
        tooltip={labels.calloutStyleSpanTooltip}
        isDefault={unset('span')}
        onReset={() => onResetField('span')}
      />
      <SelectInput
        label={labels.calloutStylePlacement}
        value={resolved.placement}
        options={placementOptions}
        onChange={(v) => onChange({ placement: v as CalloutPlacement })}
        tooltip={labels.calloutStylePlacementTooltip}
        isDefault={unset('placement')}
        onReset={() => onResetField('placement')}
      />
      {resolved.placement === 'fixed' && (
        <>
          <SelectInput
            label={labels.calloutStyleFixedAnchorTo}
            value={resolved.fixed.anchor.to}
            options={fixedAnchorToOptions}
            onChange={(v) => updateFixedAnchor({ to: v as ElementAnchor['to'] })}
            tooltip={labels.calloutStyleFixedAnchorToTooltip}
            isDefault={style.fixed?.anchor === undefined}
            onReset={() => resetFixed('anchor')}
          />
          <SelectInput
            label={labels.calloutStyleFixedEdge}
            value={resolved.fixed.anchor.edge}
            options={fixedEdgeOptions}
            onChange={(v) => updateFixedAnchor({ edge: v as AnchorEdge })}
            tooltip={labels.calloutStyleFixedEdgeTooltip}
            isDefault={style.fixed?.anchor === undefined}
            onReset={() => resetFixed('anchor')}
          />
          <DimensionInput
            label={labels.calloutStyleFixedOffsetX}
            value={resolved.fixed.offset.x}
            onChange={(v) => updateFixedOffset('x', v)}
            min={-500}
            step={0.5}
            units={OFFSET_UNITS}
            tooltip={labels.calloutStyleFixedOffsetTooltip}
            isDefault={style.fixed?.offset?.x === undefined}
            onReset={() => resetFixed('x')}
          />
          <DimensionInput
            label={labels.calloutStyleFixedOffsetY}
            value={resolved.fixed.offset.y}
            onChange={(v) => updateFixedOffset('y', v)}
            min={-500}
            step={0.5}
            units={OFFSET_UNITS}
            tooltip={labels.calloutStyleFixedOffsetTooltip}
            isDefault={style.fixed?.offset?.y === undefined}
            onReset={() => resetFixed('y')}
          />
        </>
      )}
      <ToggleSwitch
        label={labels.calloutStyleFloatBarrier}
        checked={resolved.floatBarrier}
        onChange={(v) => onChange({ floatBarrier: v })}
        tooltip={labels.calloutStyleFloatBarrierTooltip}
        isDefault={unset('floatBarrier')}
        onReset={() => onResetField('floatBarrier')}
      />
      <ToggleSwitch
        label={labels.calloutStyleKeepTogether}
        checked={resolved.keepTogether}
        onChange={(v) => onChange({ keepTogether: v })}
        tooltip={labels.calloutStyleKeepTogetherTooltip}
        isDefault={unset('keepTogether')}
        onReset={() => onResetField('keepTogether')}
      />
      {!resolved.keepTogether && (
        <NumberInput
          label={labels.calloutStyleSplitMinLines}
          value={resolved.splitMinLines}
          onChange={(v) => onChange({ splitMinLines: Math.max(1, Math.round(v)) })}
          min={1}
          max={20}
          step={1}
          tooltip={labels.calloutStyleSplitMinLinesTooltip}
          isDefault={unset('splitMinLines')}
          onReset={() => onResetField('splitMinLines')}
        />
      )}
      <SelectInput
        label={labels.calloutStyleWidth}
        value={resolved.width}
        options={widthOptions}
        onChange={(v) => onChange({ width: v as CalloutWidth })}
        tooltip={labels.calloutStyleWidthTooltip}
        isDefault={unset('width')}
        onReset={() => onResetField('width')}
      />
      <ToggleSwitch
        label={labels.calloutStyleBackground}
        checked={resolved.backgroundEnabled}
        onChange={(v) => onChange({ backgroundEnabled: v })}
        tooltip={labels.calloutStyleBackgroundTooltip}
        isDefault={unset('backgroundEnabled')}
        onReset={() => onResetField('backgroundEnabled')}
      />
      {resolved.backgroundEnabled && (
        <ColorPicker
          label={labels.calloutStyleBackgroundColor}
          value={resolved.background}
          onChange={(v) => onChange({ background: v })}
          isDefault={unset('background')}
          onReset={() => onResetField('background')}
          fieldId={`${fieldId}-background`}
        />
      )}
      <DimensionInput
        label={labels.calloutStyleBorderRadius}
        value={resolved.borderRadius}
        onChange={(v) => onChange({ borderRadius: v })}
        min={0}
        step={0.05}
        units={SPACING_UNITS}
        isDefault={unset('borderRadius')}
        onReset={() => onResetField('borderRadius')}
      />
      <DimensionInput
        label={labels.marginTop}
        value={resolved.marginTop}
        onChange={(v) => onChange({ marginTop: v })}
        min={0}
        step={0.1}
        units={SPACING_UNITS}
        tooltip={labels.calloutStyleMarginTopTooltip}
        isDefault={unset('marginTop')}
        onReset={() => onResetField('marginTop')}
      />
      <DimensionInput
        label={labels.marginBottom}
        value={resolved.marginBottom}
        onChange={(v) => onChange({ marginBottom: v })}
        min={0}
        step={0.1}
        units={SPACING_UNITS}
        tooltip={labels.calloutStyleMarginBottomTooltip}
        isDefault={unset('marginBottom')}
        onReset={() => onResetField('marginBottom')}
      />
      <DimensionInput
        label={labels.calloutStyleColumnGap}
        value={resolved.columnGap}
        onChange={(v) => onChange({ columnGap: v })}
        min={0}
        step={0.1}
        units={SPACING_UNITS}
        tooltip={labels.calloutStyleColumnGapTooltip}
        isDefault={unset('columnGap')}
        onReset={() => onResetField('columnGap')}
      />

      <CollapsibleSection
        title={labels.calloutStyleBorderGroup}
        sectionId={`${sectionId}.border`}
        variant="subsection"
      >
        <ToggleSwitch
          label={labels.calloutStyleBorder}
          checked={resolved.border.enabled}
          onChange={(v) => border({ enabled: v })}
          isDefault={groupUnset('border', 'enabled')}
          onReset={() => resetGroupField('border', 'enabled')}
        />
        {resolved.border.enabled && (
          <>
            <ColorPicker
              label={labels.calloutStyleBorderColor}
              value={resolved.border.color}
              onChange={(v) => border({ color: v })}
              isDefault={groupUnset('border', 'color')}
              onReset={() => resetGroupField('border', 'color')}
              fieldId={`${fieldId}-border`}
            />
            <DimensionInput
              label={labels.calloutStyleBorderWidth}
              value={resolved.border.width}
              onChange={(v) => border({ width: v })}
              min={0}
              step={0.1}
              units={STROKE_UNITS}
              isDefault={groupUnset('border', 'width')}
              onReset={() => resetGroupField('border', 'width')}
            />
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.calloutStylePaddingGroup}
        sectionId={`${sectionId}.padding`}
        variant="subsection"
      >
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <DimensionInput
            key={side}
            label={
              side === 'top'
                ? labels.calloutStylePaddingTop
                : side === 'right'
                  ? labels.calloutStylePaddingRight
                  : side === 'bottom'
                    ? labels.calloutStylePaddingBottom
                    : labels.calloutStylePaddingLeft
            }
            value={resolved.padding[side]}
            onChange={(v) => padding({ [side]: v })}
            min={0}
            step={0.05}
            units={SPACING_UNITS}
            isDefault={groupUnset('padding', side)}
            onReset={() => resetGroupField('padding', side)}
          />
        ))}
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.calloutStyleStripeGroup}
        sectionId={`${sectionId}.stripe`}
        variant="subsection"
      >
        <ToggleSwitch
          label={labels.calloutStyleStripe}
          checked={resolved.stripe.enabled}
          onChange={(v) => stripe({ enabled: v })}
          tooltip={labels.calloutStyleStripeTooltip}
          isDefault={groupUnset('stripe', 'enabled')}
          onReset={() => resetGroupField('stripe', 'enabled')}
        />
        {resolved.stripe.enabled && (
          <>
            <SelectInput
              label={labels.calloutStyleStripeSide}
              value={resolved.stripe.side}
              options={stripeSideOptions}
              onChange={(v) => stripe({ side: v as CalloutStripeSide })}
              isDefault={groupUnset('stripe', 'side')}
              onReset={() => resetGroupField('stripe', 'side')}
            />
            <DimensionInput
              label={labels.calloutStyleStripeWidth}
              value={resolved.stripe.width}
              onChange={(v) => stripe({ width: v })}
              min={0}
              step={0.05}
              units={SPACING_UNITS}
              isDefault={groupUnset('stripe', 'width')}
              onReset={() => resetGroupField('stripe', 'width')}
            />
            <ColorPicker
              label={labels.calloutStyleStripeColor}
              value={resolved.stripe.color}
              onChange={(v) => stripe({ color: v })}
              isDefault={groupUnset('stripe', 'color')}
              onReset={() => resetGroupField('stripe', 'color')}
              fieldId={`${fieldId}-stripe`}
            />
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.calloutStyleIconGroup}
        sectionId={`${sectionId}.icon`}
        variant="subsection"
      >
        <IconFields
          value={resolved.icon}
          kindLabel={labels.calloutStyleIconKind}
          kindTooltip={labels.calloutStyleIconKindTooltip}
          update={icon}
          isDefault={(f) => groupUnset('icon', f)}
          onReset={(f) => resetGroupField('icon', f)}
          fieldId={`${fieldId}-icon`}
          iconResources={iconResources}
          withPosition
        />
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.calloutStyleLabelGroup}
        sectionId={`${sectionId}.label`}
        variant="subsection"
      >
        <ToggleSwitch
          label={labels.calloutStyleLabel}
          checked={resolved.label !== undefined}
          onChange={(v) => (v ? onChange({ label: { ...style.label } }) : onResetField('label'))}
          tooltip={labels.calloutStyleLabelTooltip}
          isDefault={unset('label')}
          onReset={() => onResetField('label')}
        />
        {resolved.label && (
          <>
            <FontPicker
              label={labels.calloutStyleLabelFont}
              value={resolved.label.fontFamily}
              onChange={(v) => label({ fontFamily: v })}
              isDefault={groupUnset('label', 'fontFamily')}
              onReset={() => resetGroupField('label', 'fontFamily')}
              searchPlaceholder={labels.headingFontSearch}
              noResultsLabel={labels.headingFontNoResults}
            />
            <DimensionInput
              label={labels.calloutStyleLabelSize}
              value={resolved.label.fontSize}
              onChange={(v) => label({ fontSize: v })}
              min={1}
              step={0.5}
              units={FONT_SIZE_UNITS}
              isDefault={groupUnset('label', 'fontSize')}
              onReset={() => resetGroupField('label', 'fontSize')}
            />
            <NumberInput
              label={labels.calloutStyleLabelWeight}
              value={resolved.label.fontWeight}
              onChange={(v) => label({ fontWeight: v })}
              min={100}
              max={900}
              step={10}
              isDefault={groupUnset('label', 'fontWeight')}
              onReset={() => resetGroupField('label', 'fontWeight')}
            />
            <ColorPicker
              label={labels.calloutStyleLabelColor}
              value={resolved.label.color}
              onChange={(v) => label({ color: v })}
              isDefault={groupUnset('label', 'color')}
              onReset={() => resetGroupField('label', 'color')}
              fieldId={`${fieldId}-label`}
            />
            <ColorPicker
              label={labels.calloutStyleLabelBackground}
              value={resolved.label.background}
              onChange={(v) => label({ background: v })}
              isDefault={groupUnset('label', 'background')}
              onReset={() => resetGroupField('label', 'background')}
              fieldId={`${fieldId}-label-bg`}
            />
            <SelectInput
              label={labels.calloutStyleLabelPosition}
              value={resolved.label.position}
              options={labelPositionOptions}
              onChange={(v) => label({ position: v as NonNullable<CalloutLabelConfig['position']> })}
              isDefault={groupUnset('label', 'position')}
              onReset={() => resetGroupField('label', 'position')}
            />
            <DimensionInput
              label={labels.calloutStyleLabelHeight}
              value={resolved.label.height}
              onChange={(v) => label({ height: v })}
              min={0}
              step={0.1}
              units={SPACING_UNITS}
              isDefault={groupUnset('label', 'height')}
              onReset={() => resetGroupField('label', 'height')}
            />
            <DimensionInput
              label={labels.calloutStyleLabelPaddingX}
              value={resolved.label.paddingX}
              onChange={(v) => label({ paddingX: v })}
              min={0}
              step={0.05}
              units={SPACING_UNITS}
              isDefault={groupUnset('label', 'paddingX')}
              onReset={() => resetGroupField('label', 'paddingX')}
            />
            <DimensionInput
              label={labels.calloutStyleLabelOffset}
              value={resolved.label.offset}
              onChange={(v) => label({ offset: v })}
              min={0}
              step={0.05}
              units={SPACING_UNITS}
              tooltip={labels.calloutStyleLabelOffsetTooltip}
              isDefault={groupUnset('label', 'offset')}
              onReset={() => resetGroupField('label', 'offset')}
            />
            <DimensionInput
              label={labels.calloutStyleLabelInset}
              value={resolved.label.inset}
              onChange={(v) => label({ inset: v })}
              min={0}
              step={0.05}
              units={SPACING_UNITS}
              isDefault={groupUnset('label', 'inset')}
              onReset={() => resetGroupField('label', 'inset')}
            />
            <SelectInput
              label={labels.calloutStyleLabelIcon}
              value={resolved.label.icon.resourceId}
              options={labelResourceOptions}
              onChange={(v) => updateLabelIcon({ resourceId: v })}
              tooltip={labels.calloutStyleLabelIconTooltip}
              isDefault={labelIconUnset('resourceId')}
              onReset={() => resetLabelIconField('resourceId')}
            />
            {resolved.label.icon.resourceId && (
              <>
                <DimensionInput
                  label={labels.calloutStyleLabelIconWidth}
                  value={resolved.label.icon.width}
                  onChange={(v) => updateLabelIcon({ width: v })}
                  min={0}
                  step={0.1}
                  units={SPACING_UNITS}
                  isDefault={labelIconUnset('width')}
                  onReset={() => resetLabelIconField('width')}
                />
                <DimensionInput
                  label={labels.calloutStyleLabelIconGap}
                  value={resolved.label.icon.gap}
                  onChange={(v) => updateLabelIcon({ gap: v })}
                  min={0}
                  step={0.05}
                  units={SPACING_UNITS}
                  isDefault={labelIconUnset('gap')}
                  onReset={() => resetLabelIconField('gap')}
                />
              </>
            )}
            <ToggleSwitch
              label={labels.calloutStyleLabelRule}
              checked={resolved.label.rule.enabled}
              onChange={(v) => updateLabelRule({ enabled: v })}
              tooltip={labels.calloutStyleLabelRuleTooltip}
              isDefault={labelRuleUnset('enabled')}
              onReset={() => resetLabelRuleField('enabled')}
            />
            {resolved.label.rule.enabled && (
              <>
                <ColorPicker
                  label={labels.calloutStyleLabelRuleColor}
                  value={resolved.label.rule.color}
                  onChange={(v) => updateLabelRule({ color: v })}
                  isDefault={labelRuleUnset('color')}
                  onReset={() => resetLabelRuleField('color')}
                  fieldId={`${fieldId}-label-rule`}
                />
                <DimensionInput
                  label={labels.calloutStyleLabelRuleWidth}
                  value={resolved.label.rule.width}
                  onChange={(v) => updateLabelRule({ width: v })}
                  min={0}
                  step={0.25}
                  units={STROKE_UNITS}
                  isDefault={labelRuleUnset('width')}
                  onReset={() => resetLabelRuleField('width')}
                />
              </>
            )}
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.calloutStyleMarkerGroup}
        sectionId={`${sectionId}.marker`}
        variant="subsection"
      >
        <IconFields
          value={resolved.marker}
          kindLabel={labels.calloutStyleMarkerKind}
          kindTooltip={labels.calloutStyleMarkerKindTooltip}
          update={marker}
          isDefault={(f) => groupUnset('marker', f as keyof CalloutMarkerConfig)}
          onReset={(f) => resetGroupField('marker', f as keyof CalloutMarkerConfig)}
          fieldId={`${fieldId}-marker`}
          iconResources={iconResources}
        />
        {resolved.marker.kind !== 'none' && (
          <>
            <DimensionInput
              label={labels.calloutStyleMarkerGap}
              value={resolved.marker.gap}
              onChange={(v) => marker({ gap: v })}
              min={0}
              step={0.05}
              units={SPACING_UNITS}
              tooltip={labels.calloutStyleMarkerGapTooltip}
              isDefault={groupUnset('marker', 'gap')}
              onReset={() => resetGroupField('marker', 'gap')}
            />
            <ToggleSwitch
              label={labels.calloutStyleMarkerRule}
              checked={resolved.marker.rule.enabled}
              onChange={(v) => updateMarkerRule({ enabled: v })}
              tooltip={labels.calloutStyleMarkerRuleTooltip}
              isDefault={markerRuleUnset('enabled')}
              onReset={() => resetMarkerRuleField('enabled')}
            />
            {resolved.marker.rule.enabled && (
              <>
                <ColorPicker
                  label={labels.calloutStyleMarkerRuleColor}
                  value={resolved.marker.rule.color}
                  onChange={(v) => updateMarkerRule({ color: v })}
                  isDefault={markerRuleUnset('color')}
                  onReset={() => resetMarkerRuleField('color')}
                  fieldId={`${fieldId}-marker-rule`}
                />
                <DimensionInput
                  label={labels.calloutStyleMarkerRuleWidth}
                  value={resolved.marker.rule.width}
                  onChange={(v) => updateMarkerRule({ width: v })}
                  min={0}
                  step={0.25}
                  units={STROKE_UNITS}
                  isDefault={markerRuleUnset('width')}
                  onReset={() => resetMarkerRuleField('width')}
                />
                <DimensionInput
                  label={labels.calloutStyleMarkerRuleLength}
                  value={resolved.marker.rule.length}
                  onChange={(v) => updateMarkerRule({ length: v })}
                  min={0}
                  step={0.5}
                  units={OFFSET_UNITS}
                  tooltip={labels.calloutStyleMarkerRuleLengthTooltip}
                  isDefault={markerRuleUnset('length')}
                  onReset={() => resetMarkerRuleField('length')}
                />
              </>
            )}
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.calloutStyleTitleGroup}
        sectionId={`${sectionId}.title`}
        variant="subsection"
      >
        <FontPicker
          label={labels.calloutStyleTitleFont}
          value={resolved.titleStyle.fontFamily}
          onChange={(v) => title({ fontFamily: v })}
          isDefault={groupUnset('titleStyle', 'fontFamily')}
          onReset={() => resetGroupField('titleStyle', 'fontFamily')}
          searchPlaceholder={labels.headingFontSearch}
          noResultsLabel={labels.headingFontNoResults}
        />
        <DimensionInput
          label={labels.calloutStyleTitleSize}
          value={resolved.titleStyle.fontSize}
          onChange={(v) => title({ fontSize: v })}
          min={1}
          step={0.5}
          units={FONT_SIZE_UNITS}
          isDefault={groupUnset('titleStyle', 'fontSize')}
          onReset={() => resetGroupField('titleStyle', 'fontSize')}
        />
        <NumberInput
          label={labels.calloutStyleTitleWeight}
          value={resolved.titleStyle.fontWeight}
          onChange={(v) => title({ fontWeight: v })}
          min={100}
          max={900}
          step={10}
          isDefault={groupUnset('titleStyle', 'fontWeight')}
          onReset={() => resetGroupField('titleStyle', 'fontWeight')}
        />
        <ToggleSwitch
          label={labels.calloutStyleTitleItalic}
          checked={resolved.titleStyle.italic}
          onChange={(v) => title({ italic: v })}
          isDefault={groupUnset('titleStyle', 'italic')}
          onReset={() => resetGroupField('titleStyle', 'italic')}
        />
        <ColorPicker
          label={labels.calloutStyleTitleColor}
          value={resolved.titleStyle.color}
          onChange={(v) => title({ color: v })}
          isDefault={groupUnset('titleStyle', 'color')}
          onReset={() => resetGroupField('titleStyle', 'color')}
          fieldId={`${fieldId}-title`}
        />
        <SelectInput
          label={labels.calloutStyleTitleTransform}
          value={resolved.titleStyle.textTransform}
          options={transformOptions}
          onChange={(v) => title({ textTransform: v as CalloutTextTransform })}
          isDefault={groupUnset('titleStyle', 'textTransform')}
          onReset={() => resetGroupField('titleStyle', 'textTransform')}
        />
        <DimensionInput
          label={labels.calloutStyleTitleGap}
          value={resolved.titleStyle.gap}
          onChange={(v) => title({ gap: v })}
          min={0}
          step={0.05}
          units={SPACING_UNITS}
          tooltip={labels.calloutStyleTitleGapTooltip}
          isDefault={groupUnset('titleStyle', 'gap')}
          onReset={() => resetGroupField('titleStyle', 'gap')}
        />
        <DimensionInput
          label={labels.calloutStyleTitleLetterSpacing}
          value={resolved.titleStyle.letterSpacing}
          onChange={(v) => title({ letterSpacing: v })}
          min={-5}
          step={0.05}
          units={TRACKING_UNITS}
          isDefault={groupUnset('titleStyle', 'letterSpacing')}
          onReset={() => resetGroupField('titleStyle', 'letterSpacing')}
        />
        <DimensionInput
          label={labels.calloutStyleTitleIndent}
          value={resolved.titleStyle.indent}
          onChange={(v) => title({ indent: v })}
          min={0}
          step={0.1}
          units={SPACING_UNITS}
          tooltip={labels.calloutStyleTitleIndentTooltip}
          isDefault={groupUnset('titleStyle', 'indent')}
          onReset={() => resetGroupField('titleStyle', 'indent')}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.calloutStyleBodyGroup}
        sectionId={`${sectionId}.body`}
        variant="subsection"
      >
        <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
          {labels.calloutStyleBodyHint}
        </p>
        <FontPicker
          label={labels.fontLabel}
          value={resolved.body.fontFamily}
          onChange={(v) => body({ fontFamily: v })}
          isDefault={groupUnset('body', 'fontFamily')}
          onReset={() => resetGroupField('body', 'fontFamily')}
          searchPlaceholder={labels.bodyFontSearch}
          noResultsLabel={labels.bodyFontNoResults}
        />
        <DimensionInput
          label={labels.sizeLabel}
          value={resolved.body.fontSize}
          onChange={(v) => body({ fontSize: v })}
          min={1}
          step={0.5}
          units={FONT_SIZE_UNITS}
          isDefault={groupUnset('body', 'fontSize')}
          onReset={() => resetGroupField('body', 'fontSize')}
        />
        <DimensionInput
          label={labels.bodyLineHeight}
          value={resolved.body.lineHeight}
          onChange={(v) => body({ lineHeight: v })}
          min={0.5}
          max={5}
          step={0.1}
          units={LINE_HEIGHT_UNITS}
          isDefault={groupUnset('body', 'lineHeight')}
          onReset={() => resetGroupField('body', 'lineHeight')}
        />
        <ColorPicker
          label={labels.colorLabel}
          value={resolved.body.color}
          onChange={(v) => body({ color: v })}
          isDefault={groupUnset('body', 'color')}
          onReset={() => resetGroupField('body', 'color')}
          fieldId={`${fieldId}-body`}
        />
        <ColorPicker
          label={labels.calloutStyleBodyBoldColor}
          value={resolved.body.boldColor ?? resolved.body.color}
          onChange={(v) => body({ boldColor: v })}
          tooltip={labels.calloutStyleBodyBoldColorTooltip}
          isDefault={groupUnset('body', 'boldColor')}
          onReset={() => resetGroupField('body', 'boldColor')}
          fieldId={`${fieldId}-body-bold`}
        />
        <SelectInput
          label={labels.alignmentLabel}
          value={resolved.body.textAlign}
          options={bodyAlignOptions}
          onChange={(v) => body({ textAlign: v as CalloutBodyStyleConfig['textAlign'] })}
          isDefault={groupUnset('body', 'textAlign')}
          onReset={() => resetGroupField('body', 'textAlign')}
        />
        {resolved.body.textAlign === 'justify' && (
          <ToggleSwitch
            label={labels.bodyHyphenation}
            checked={resolved.body.hyphenation}
            onChange={(v) => body({ hyphenation: v })}
            isDefault={groupUnset('body', 'hyphenation')}
            onReset={() => resetGroupField('body', 'hyphenation')}
          />
        )}
        <ToggleSwitch
          label={labels.bodyParagraphSpacing}
          checked={resolved.body.paragraphSpacing}
          onChange={(v) => body({ paragraphSpacing: v })}
          tooltip={labels.bodyParagraphSpacingTooltip}
          isDefault={groupUnset('body', 'paragraphSpacing')}
          onReset={() => resetGroupField('body', 'paragraphSpacing')}
        />
        <DimensionInput
          label={labels.bodyFirstLineIndent}
          value={resolved.body.firstLineIndent}
          onChange={(v) => body({ firstLineIndent: v })}
          min={0}
          step={0.1}
          units={SPACING_UNITS}
          isDefault={groupUnset('body', 'firstLineIndent')}
          onReset={() => resetGroupField('body', 'firstLineIndent')}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.calloutStyleListsGroup}
        sectionId={`${sectionId}.lists`}
        variant="subsection"
      >
        <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
          {labels.calloutStyleListsHint}
        </p>
        <TextInput
          label={labels.unorderedListsBulletChar}
          value={resolved.lists.bulletChar}
          onChange={(v) => lists({ bulletChar: v })}
          placeholder={labels.unorderedListsBulletCharPlaceholder}
          tooltip={labels.unorderedListsBulletCharTooltip}
          widthCh={6}
          isDefault={groupUnset('lists', 'bulletChar')}
          onReset={() => resetGroupField('lists', 'bulletChar')}
        />
        <DimensionInput
          label={labels.calloutStyleListsBulletSize}
          value={resolved.lists.bulletFontSize ?? listDefaults.bulletFontSize}
          onChange={(v) => lists({ bulletFontSize: v })}
          min={1}
          step={0.5}
          units={FONT_SIZE_UNITS}
          isDefault={groupUnset('lists', 'bulletFontSize')}
          onReset={() => resetGroupField('lists', 'bulletFontSize')}
        />
        <NumberInput
          label={labels.calloutStyleListsBulletWeight}
          value={resolved.lists.bulletFontWeight ?? listDefaults.bulletFontWeight}
          onChange={(v) => lists({ bulletFontWeight: v })}
          min={100}
          max={900}
          step={10}
          isDefault={groupUnset('lists', 'bulletFontWeight')}
          onReset={() => resetGroupField('lists', 'bulletFontWeight')}
        />
        <ColorPicker
          label={labels.colorLabel}
          value={resolved.lists.color}
          onChange={(v) => lists({ color: v })}
          isDefault={groupUnset('lists', 'color')}
          onReset={() => resetGroupField('lists', 'color')}
          fieldId={`${fieldId}-lists`}
        />
        <DimensionInput
          label={labels.unorderedListsIndent}
          value={resolved.lists.indent}
          onChange={(v) => lists({ indent: v })}
          min={0}
          step={0.1}
          units={SPACING_UNITS}
          tooltip={labels.unorderedListsIndentTooltip}
          isDefault={groupUnset('lists', 'indent')}
          onReset={() => resetGroupField('lists', 'indent')}
        />
        <DimensionInput
          label={labels.unorderedListsGap}
          value={resolved.lists.gap}
          onChange={(v) => lists({ gap: v })}
          min={0}
          step={0.1}
          units={SPACING_UNITS}
          tooltip={labels.unorderedListsGapTooltip}
          isDefault={groupUnset('lists', 'gap')}
          onReset={() => resetGroupField('lists', 'gap')}
        />
        <DimensionInput
          label={labels.unorderedListsItemSpacing}
          value={resolved.lists.itemSpacing}
          onChange={(v) => lists({ itemSpacing: v })}
          min={0}
          step={0.1}
          units={SPACING_UNITS}
          tooltip={labels.unorderedListsItemSpacingTooltip}
          isDefault={groupUnset('lists', 'itemSpacing')}
          onReset={() => resetGroupField('lists', 'itemSpacing')}
        />
      </CollapsibleSection>
    </div>
    </SearchScope>
  );
}

/** Config-panel section for the named callout styles selected by
 *  `:::callout{type="…"}` (`config.calloutStyles`). While the config has no
 *  list, the built-in `note` style is shown so it can be edited in place. */
export const CalloutStylesSection = memo(function CalloutStylesSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.calloutStyles);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const headingsRaw = useSandboxSelector((s) => s.config.headings);
  const unorderedListsRaw = useSandboxSelector((s) => s.config.unorderedLists);
  const resources = useSandboxResources();
  const iconResources = resources.filter((r) => r.kind === 'svg' || r.kind === 'bitmap');

  const bodyText = resolveBodyTextConfig(bodyTextRaw);
  const headings = resolveHeadingsConfig(headingsRaw);
  const unorderedLists = resolveUnorderedListsConfig(unorderedListsRaw, bodyText);
  const styles: CalloutStyleConfig[] = raw ?? DEFAULT_CALLOUT_STYLES;
  const resolved = resolveCalloutStylesConfig(styles, bodyText, headings, unorderedLists);
  const resolveOne = (style: CalloutStyleConfig): ResolvedCalloutStyleConfig =>
    resolveCalloutStylesConfig([style], bodyText, headings, unorderedLists)[0]!;

  const write = (next: CalloutStyleConfig[]) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { calloutStyles: next.length > 0 ? next : undefined },
    });
  };

  const addStyle = () => {
    write([...styles, { id: nextStyleId(styles), name: labels.calloutStyleNewName }]);
  };

  const duplicateStyle = (id: string) => {
    const index = styles.findIndex((s) => s.id === id);
    const source = styles[index];
    if (!source) return;
    const taken = new Set(styles.map((s) => s.id));
    const copy: CalloutStyleConfig = structuredClone({ ...source, id: uniqueId(`${source.id}-copy`, taken) });
    const next = styles.slice();
    next.splice(index + 1, 0, copy);
    write(next);
  };

  const updateStyle = (id: string, partial: Partial<CalloutStyleConfig>) => {
    write(styles.map((s) => (s.id === id ? { ...s, ...partial } : s)));
  };

  const resetStyleField = (id: string, field: keyof CalloutStyleConfig) => {
    write(
      styles.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s };
        delete next[field];
        return next;
      }),
    );
  };

  const renameStyle = (id: string, nextId: string) => {
    if (styles.some((s) => s.id === nextId)) return;
    write(styles.map((s) => (s.id === id ? { ...s, id: nextId } : s)));
  };

  const removeStyle = (id: string) => {
    write(styles.filter((s) => s.id !== id));
  };

  return (
    <CollapsibleSection
      title={labels.calloutStylesSection}
      sectionId="calloutStyles"
      hasOverrides={raw !== undefined}
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { calloutStyles: undefined } })}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.calloutStylesResetConfirm}
    >
      {styles.length === 0 && (
        <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
          {labels.calloutStylesEmpty}
        </p>
      )}
      {styles.map((style, i) => (
        <CalloutStyleCard
          key={style.id}
          style={style}
          resolved={resolved[i] ?? resolveOne(style)}
          otherIds={new Set(styles.filter((s) => s.id !== style.id).map((s) => s.id))}
          iconResources={iconResources}
          listDefaults={{ bulletFontSize: unorderedLists.bulletFontSize, bulletFontWeight: unorderedLists.fontWeight }}
          onChange={(partial) => updateStyle(style.id, partial)}
          onResetField={(field) => resetStyleField(style.id, field)}
          onRename={(nextId) => renameStyle(style.id, nextId)}
          onDuplicate={() => duplicateStyle(style.id)}
          onRemove={() => removeStyle(style.id)}
        />
      ))}
      <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={addStyle} className="mt-1">
        {labels.calloutStyleAdd}
      </Button>
    </CollapsibleSection>
  );
});
