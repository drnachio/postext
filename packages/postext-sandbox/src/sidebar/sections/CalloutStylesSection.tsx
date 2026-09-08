'use client';

import { memo, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import type {
  CalloutBodyStyleConfig,
  CalloutBorderConfig,
  CalloutIconAlign,
  CalloutIconConfig,
  CalloutIconKind,
  CalloutListStyleConfig,
  CalloutPaddingConfig,
  CalloutPlacement,
  CalloutSpan,
  CalloutStripeConfig,
  CalloutStripeSide,
  CalloutStyleConfig,
  CalloutTextTransform,
  CalloutTitleStyleConfig,
  CalloutWidth,
  DimensionUnit,
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
import { ConfirmPopover } from '../../panels/ConfirmPopover';

const FONT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
const LINE_HEIGHT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const SPACING_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const STROKE_UNITS: DimensionUnit[] = ['pt', 'px', 'mm'];

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
const inputStyle = { borderColor: 'var(--rule)', color: 'var(--foreground)' } as const;
const labelStyle = { color: 'var(--slate)', fontSize: 11, lineHeight: '14px' } as const;

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
type Group = 'border' | 'padding' | 'stripe' | 'icon' | 'titleStyle' | 'body' | 'lists';
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
    <label className="flex flex-col gap-0.5">
      <span style={labelStyle}>{label}</span>
      {children}
      {hint && (
        <span style={labelStyle} className="opacity-80">
          {hint}
        </span>
      )}
    </label>
  );
}

function CardButton({
  label,
  onClick,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
      style={{
        color: destructive ? 'var(--destructive)' : 'var(--slate)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
    >
      {children}
    </button>
  );
}

interface CalloutStyleCardProps {
  style: CalloutStyleConfig;
  resolved: ResolvedCalloutStyleConfig;
  otherIds: Set<string>;
  iconResources: Resource[];
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
  const title = (partial: Partial<CalloutTitleStyleConfig>) => updateGroup('titleStyle', partial);
  const body = (partial: Partial<CalloutBodyStyleConfig>) => updateGroup('body', partial);
  const lists = (partial: Partial<CalloutListStyleConfig>) => updateGroup('lists', partial);

  const spanOptions = [
    { value: 'column', label: labels.calloutStyleSpanColumn },
    { value: 'page', label: labels.calloutStyleSpanPage },
  ];
  const placementOptions = [
    { value: 'here', label: labels.calloutStylePlacementHere },
    { value: 'top', label: labels.calloutStylePlacementTop },
    { value: 'bottom', label: labels.calloutStylePlacementBottom },
  ];
  const widthOptions = [
    { value: 'fill', label: labels.calloutStyleWidthFill },
    { value: 'auto', label: labels.calloutStyleWidthAuto },
  ];
  const stripeSideOptions = [
    { value: 'left', label: labels.calloutStyleStripeSideLeft },
    { value: 'right', label: labels.calloutStyleStripeSideRight },
    { value: 'top', label: labels.calloutStyleStripeSideTop },
  ];
  const iconKindOptions = [
    { value: 'none', label: labels.calloutStyleIconKindNone },
    { value: 'glyph', label: labels.calloutStyleIconKindGlyph },
    { value: 'resource', label: labels.calloutStyleIconKindResource },
  ];
  const iconAlignOptions = [
    { value: 'top', label: labels.calloutStyleIconAlignTop },
    { value: 'center', label: labels.calloutStyleIconAlignCenter },
  ];
  const transformOptions = [
    { value: 'none', label: labels.calloutStyleTitleTransformNone },
    { value: 'uppercase', label: labels.calloutStyleTitleTransformUppercase },
  ];
  const bodyAlignOptions = [
    { value: 'left', label: labels.bodyTextAlignLeft },
    { value: 'justify', label: labels.bodyTextAlignJustify },
  ];
  const resourceOptions = [
    { value: '', label: labels.calloutStyleIconResourceNone },
    ...iconResources.map((r) => ({ value: r.id, label: iconLabel(r) })),
  ];
  // Keep a dangling resource id selectable so the picker never shows a
  // value that is not in its option list.
  if (resolved.icon.resourceId && !iconResources.some((r) => r.id === resolved.icon.resourceId)) {
    resourceOptions.push({ value: resolved.icon.resourceId, label: resolved.icon.resourceId });
  }

  return (
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
        <SelectInput
          label={labels.calloutStyleIconKind}
          value={resolved.icon.kind}
          options={iconKindOptions}
          onChange={(v) => icon({ kind: v as CalloutIconKind })}
          tooltip={labels.calloutStyleIconKindTooltip}
          isDefault={groupUnset('icon', 'kind')}
          onReset={() => resetGroupField('icon', 'kind')}
        />
        {resolved.icon.kind === 'glyph' && (
          <>
            <TextInput
              label={labels.calloutStyleIconGlyph}
              value={resolved.icon.glyph}
              onChange={(v) => icon({ glyph: v })}
              tooltip={labels.calloutStyleIconGlyphTooltip}
              widthCh={6}
              isDefault={groupUnset('icon', 'glyph')}
              onReset={() => resetGroupField('icon', 'glyph')}
            />
            <FontPicker
              label={labels.calloutStyleIconFont}
              value={resolved.icon.fontFamily}
              onChange={(v) => icon({ fontFamily: v })}
              isDefault={groupUnset('icon', 'fontFamily')}
              onReset={() => resetGroupField('icon', 'fontFamily')}
              searchPlaceholder={labels.bodyFontSearch}
              noResultsLabel={labels.bodyFontNoResults}
            />
            <NumberInput
              label={labels.calloutStyleIconWeight}
              value={resolved.icon.fontWeight}
              onChange={(v) => icon({ fontWeight: v })}
              min={100}
              max={900}
              step={10}
              isDefault={groupUnset('icon', 'fontWeight')}
              onReset={() => resetGroupField('icon', 'fontWeight')}
            />
            <ColorPicker
              label={labels.calloutStyleIconColor}
              value={resolved.icon.color}
              onChange={(v) => icon({ color: v })}
              isDefault={groupUnset('icon', 'color')}
              onReset={() => resetGroupField('icon', 'color')}
              fieldId={`${fieldId}-icon`}
            />
          </>
        )}
        {resolved.icon.kind === 'resource' && (
          <SelectInput
            label={labels.calloutStyleIconResource}
            value={resolved.icon.resourceId}
            options={resourceOptions}
            onChange={(v) => icon({ resourceId: v })}
            tooltip={labels.calloutStyleIconResourceTooltip}
            isDefault={groupUnset('icon', 'resourceId')}
            onReset={() => resetGroupField('icon', 'resourceId')}
          />
        )}
        {resolved.icon.kind !== 'none' && (
          <>
            <DimensionInput
              label={labels.calloutStyleIconSize}
              value={resolved.icon.size}
              onChange={(v) => icon({ size: v })}
              min={0}
              step={0.1}
              units={SPACING_UNITS}
              isDefault={groupUnset('icon', 'size')}
              onReset={() => resetGroupField('icon', 'size')}
            />
            <SelectInput
              label={labels.calloutStyleIconAlign}
              value={resolved.icon.align}
              options={iconAlignOptions}
              onChange={(v) => icon({ align: v as CalloutIconAlign })}
              isDefault={groupUnset('icon', 'align')}
              onReset={() => resetGroupField('icon', 'align')}
            />
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
          onChange={(partial) => updateStyle(style.id, partial)}
          onResetField={(field) => resetStyleField(style.id, field)}
          onRename={(nextId) => renameStyle(style.id, nextId)}
          onDuplicate={() => duplicateStyle(style.id)}
          onRemove={() => removeStyle(style.id)}
        />
      ))}
      <button
        type="button"
        onClick={addStyle}
        className="mt-1 flex items-center gap-1 rounded border px-2 py-1 text-xs"
        style={{
          borderColor: 'var(--rule)',
          backgroundColor: 'var(--surface)',
          color: 'var(--foreground)',
          cursor: 'pointer',
        }}
      >
        <Plus size={12} aria-hidden="true" />
        {labels.calloutStyleAdd}
      </button>
    </CollapsibleSection>
  );
});
