'use client';

// One box style's card: every setting of a callout style, with its
// numbering fields (#1276: split out of CalloutStylesSection.tsx).
import { useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { type CalloutStyleConfig, type CalloutBorderConfig, type CalloutPaddingConfig, type CalloutStripeConfig, type CalloutIconConfig, type CalloutMarkerConfig, type CalloutMarkerRuleConfig, type CalloutBodyStyleConfig, type CalloutListStyleConfig, type CalloutDesignConfig, type DesignSlot, type AnchorEdge, type ElementAnchor, type Dimension, type CalloutFixedConfig, type CalloutSpan, type CalloutSideAtColumnEnd, type CalloutPlacement, type CalloutWidth, uniformRadius, type CalloutMarkerTextAlign, type CalloutStripeSide, resolveDesignSlot } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../../../context/SandboxContext.js';
import { ItemCard, SelectInput, TextInput, NumberInput, DimensionInput, ToggleSwitch, ColorPicker, CollapsibleSection, NestedGroup, FontPicker } from '../../../../controls/index.js';
import { ConfirmPopover } from '../../../../ui/index.js';
import { SearchScope } from '../../../search/SearchScope.js';
import { CONTAINER_EDGES } from '../../running/HeaderFooterSection/placementAdapter.js';
import { CornerRadiusFields, BorderSidesFields } from '../../running/HeaderFooterSection/shapeFields.js';
import { SlotEditor } from '../../running/HeaderFooterSection/SlotEditor.js';
import { useRightToLeftFlow, flowSideLabels } from '../../../settings/flowSides.js';
import { hasSeveralColumns } from '../../../settings/multiColumnBook.js';
import { MULTIPLE_COLUMNS_MAX } from '../../../settings/multipleColumns.js';
import { TabStopsField } from '../../../settings/TabStopsField.js';
import { ParagraphSpacingField } from '../../../settings/ParagraphSpacingField.js';
import { IconFields } from './iconFields.js';
import { CalloutLabelFields, CalloutTitleStyleFields } from './labelFields.js';
import { slugifyStyleId, type Group, type GroupConfig, CardButton, Field, inputClass, inputStyle, OFFSET_UNITS, SPACING_UNITS, STROKE_UNITS, ZERO_PT, MIN_HEIGHT_UNITS, FONT_SIZE_UNITS, LINE_HEIGHT_UNITS, TRACKING_UNITS } from './shared.js';
import { CalloutNumberingFields } from './CalloutStyleCard/CalloutNumberingFields.js';
import type { CalloutStyleCardProps } from './CalloutStyleCard/props.js';

/** One callout style. Every control shows the resolved value and offers a
 *  per-field reset while the key is set, so a style only stores what
 *  differs from the built-in defaults (and from the body text, headings and
 *  list sections it inherits from). */
export function CalloutStyleCard({
  style,
  resolved,
  otherIds,
  parents,
  stored,
  iconResources,
  listDefaults,
  onChange,
  onResetField,
  onRename,
  onDuplicate,
  onRemove,
}: CalloutStyleCardProps) {
  const labels = useSandboxLabels();
  const rtl = useRightToLeftFlow();
  const stripeSide = flowSideLabels(rtl, labels.calloutStyleStripeSideLeft, labels.calloutStyleStripeSideRight);
  const textSide = flowSideLabels(rtl, labels.bodyTextAlignLeft, labels.headingsTextAlignRight);
  const markerSide = flowSideLabels(rtl, labels.headerFooterElementAlignLeft, labels.headerFooterElementAlignRight);
  // Ragged bodies hyphenate too once the body text turns ragged hyphenation on.
  const raggedHyphenation = useSandboxSelector((s) => s.config.bodyText?.hyphenation?.ragged === true);
  // Tab stops of the box (#622): an unset interval is the body's.
  const bodyTabInterval = useSandboxSelector((s) => s.config.bodyText?.tabInterval);
  // A floated box across several columns (#505): offered when a page of the
  // book has more than one, or when the style sets it.
  const severalColumns = useSandboxSelector((s) => hasSeveralColumns(s.config));
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
  const body = (partial: Partial<CalloutBodyStyleConfig>) => updateGroup('body', partial);
  const lists = (partial: Partial<CalloutListStyleConfig>) => updateGroup('lists', partial);
  /** The style's design (#1014). The resolved one shows what a style
   *  based on another inherits; an edit writes the whole design, its
   *  elements included, so a field the edit leaves out keeps its value. */
  const rawDesign = style.design;
  const shownDesign = resolved.design;
  const designOn = shownDesign?.enabled ?? false;
  const updateDesign = (partial: Partial<CalloutDesignConfig>) => {
    const next: CalloutDesignConfig = {
      ...rawDesign,
      slot: rawDesign?.slot ?? ((shownDesign?.slot ?? { elements: [] }) as DesignSlot),
      ...partial,
    };
    if ('minHeight' in partial && partial.minHeight === undefined) delete next.minHeight;
    if ('setsContent' in partial && partial.setsContent === undefined) delete next.setsContent;
    onChange({ design: next });
  };

  const spanOptions = [
    { value: 'column', label: labels.calloutStyleSpanColumn },
    { value: 'page', label: labels.calloutStyleSpanPage },
    { value: 'side', label: labels.calloutStyleSpanSide },
  ];
  const sideAtColumnEndOptions = [
    { value: 'before', label: labels.calloutStyleSideAtColumnEndBefore },
    { value: 'after', label: labels.calloutStyleSideAtColumnEndAfter },
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
    { value: 'left', label: stripeSide.left },
    { value: 'right', label: stripeSide.right },
    { value: 'start', label: labels.sideTextStart },
    { value: 'end', label: labels.sideTextEnd },
    { value: 'top', label: labels.calloutStyleStripeSideTop },
  ];
  const bodyAlignOptions = [
    { value: 'left', label: textSide.left },
    { value: 'justify', label: labels.bodyTextAlignJustify },
  ];
  const markerAlignOptions = [
    { value: 'left', label: markerSide.left },
    { value: 'center', label: labels.headerFooterElementAlignCenter },
    { value: 'right', label: markerSide.right },
  ];

  return (
    <SearchScope title={`${style.name ?? ''} ${style.id}`} overridden={stored}>
    <ItemCard
      list="calloutStyles"
      id={style.id}
      styleId={style.id}
      title={style.name || style.id}
      subtitle={style.name && style.name !== style.id ? style.id : undefined}
      actions={
        <>
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
        </>
      }
    >

      <div className="mb-2 flex flex-col gap-2">
        <Field
          label={labels.idLabel} tooltip={labels.styleIdHelp}
          hint={
            idTaken
              ? labels.calloutStyleIdHintDuplicate
              : labels.calloutStyleUsageHint.replace('__id__', style.id)
          }
        >
          <input
            dir="ltr"
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
        <Field label={labels.calloutStyleNameLabel} tooltip={labels.styleNameHelp}>
          <input
            dir="auto"
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

      {(parents.length > 0 || style.extends !== undefined) && (
        <SelectInput
          label={labels.calloutStyleExtends}
          value={style.extends ?? ''}
          options={[
            { value: '', label: labels.calloutStyleExtendsNone },
            ...parents.map((p) => ({ value: p.id, label: p.name })),
            // A parent that no longer exists stays visible until changed.
            ...(style.extends !== undefined && !parents.some((p) => p.id === style.extends) ? [{ value: style.extends, label: style.extends }] : []),
          ]}
          onChange={(v) => (v === '' ? onResetField('extends') : onChange({ extends: v }))}
          tooltip={labels.calloutStyleExtendsTooltip}
          isDefault={unset('extends')}
          onReset={() => onResetField('extends')}
        />
      )}

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
        label={labels.calloutStyleSideAtColumnEnd}
        value={resolved.sideAtColumnEnd}
        options={sideAtColumnEndOptions}
        onChange={(v) => onChange({ sideAtColumnEnd: v as CalloutSideAtColumnEnd })}
        tooltip={labels.calloutStyleSideAtColumnEndTooltip}
        isDefault={unset('sideAtColumnEnd')}
        onReset={() => onResetField('sideAtColumnEnd')}
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
      {resolved.span === 'column'
        && (resolved.placement === 'auto' || resolved.placement === 'top' || resolved.placement === 'bottom')
        && (severalColumns || !unset('columns')) && (
        <NumberInput
          label={labels.calloutStyleColumns}
          value={resolved.columns}
          onChange={(v) => onChange({ columns: Math.max(1, Math.round(v)) })}
          min={1}
          max={MULTIPLE_COLUMNS_MAX}
          step={1}
          tooltip={labels.calloutStyleColumnsTooltip}
          isDefault={unset('columns')}
          onReset={() => onResetField('columns')}
        />
      )}
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
      {/* Also for keep-together boxes: one taller than a full column splits. */}
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
      {/* One radius, or one per corner (#1059/#1063). */}
      <CornerRadiusFields
        label={labels.calloutStyleBorderRadius}
        value={resolved.borderRadius}
        fallback={uniformRadius(resolved.borderRadius) ?? { value: 0, unit: 'em' }}
        step={0.05}
        units={SPACING_UNITS}
        isDefault={unset('borderRadius')}
        onReset={() => onResetField('borderRadius')}
        onChange={(v) => onChange({ borderRadius: v })}
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
      <ToggleSwitch
        label={labels.calloutStyleSnapToGrid}
        checked={resolved.snapToGrid}
        onChange={(v) => onChange({ snapToGrid: v })}
        tooltip={labels.calloutStyleSnapToGridTooltip}
        isDefault={unset('snapToGrid')}
        onReset={() => onResetField('snapToGrid')}
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
        title={labels.calloutStyleContinuationGroup}
        sectionId={`${sectionId}.continuation`}
        variant="subsection"
      >
        <ToggleSwitch
          label={labels.calloutStyleRepeatTitle}
          checked={resolved.repeatTitle}
          onChange={(v) => onChange({ repeatTitle: v })}
          tooltip={labels.calloutStyleRepeatTitleTooltip}
          isDefault={unset('repeatTitle')}
          onReset={() => onResetField('repeatTitle')}
        />
        {resolved.repeatTitle && (
          <TextInput
            label={labels.calloutStyleContinuedSuffix}
            value={resolved.continuedSuffix}
            onChange={(v) => onChange({ continuedSuffix: v })}
            isDefault={unset('continuedSuffix')}
            onReset={() => onResetField('continuedSuffix')}
          />
        )}
        <ToggleSwitch
          label={labels.tableContinuesMarkerEnabled}
          checked={resolved.continuesMarkerEnabled}
          onChange={(v) => onChange({ continuesMarkerEnabled: v })}
          tooltip={labels.calloutStyleContinuesMarkerTooltip}
          isDefault={unset('continuesMarkerEnabled')}
          onReset={() => onResetField('continuesMarkerEnabled')}
        />
        {resolved.continuesMarkerEnabled && (
          <>
            <TextInput
              label={labels.tableContinuesMarker} tooltip={labels.tableContinuesMarkerTooltip}
              value={resolved.continuesMarker}
              onChange={(v) => onChange({ continuesMarker: v })}
              isDefault={unset('continuesMarker')}
              onReset={() => onResetField('continuesMarker')}
            />
            <SelectInput
              label={labels.calloutStyleContinuesMarkerAlign}
              value={resolved.continuesMarkerAlign}
              options={markerAlignOptions}
              onChange={(v) => onChange({ continuesMarkerAlign: v as CalloutMarkerTextAlign })}
              isDefault={unset('continuesMarkerAlign')}
              onReset={() => onResetField('continuesMarkerAlign')}
            />
            <ToggleSwitch
              label={labels.calloutStyleContinuesMarkerItalic}
              checked={resolved.continuesMarkerItalic}
              onChange={(v) => onChange({ continuesMarkerItalic: v })}
              isDefault={unset('continuesMarkerItalic')}
              onReset={() => onResetField('continuesMarkerItalic')}
            />
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.calloutStyleBorderGroup}
        sectionId={`${sectionId}.border`}
        variant="subsection"
      >
        <ToggleSwitch
          label={labels.calloutStyleBorder} tooltip={labels.calloutStyleBorderTooltip}
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
        {/* Per side (#1059/#1063): a side can be drawn while the whole
            border is off (a rule over the box's top only). */}
        <BorderSidesFields
          sides={style.border?.sides}
          whole={{ enabled: style.border?.enabled ?? resolved.border.enabled, color: resolved.border.color, width: resolved.border.width }}
          units={STROKE_UNITS}
          fieldId={fieldId}
          onChange={(sides) => (sides === undefined ? resetGroupField('border', 'sides') : border({ sides }))}
        />
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
              label={labels.calloutStyleStripeSide} tooltip={labels.calloutStyleStripeSideTooltip}
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

      <CalloutLabelFields style={style} resolved={resolved} onChange={onChange} onResetField={onResetField} sectionId={sectionId} fieldId={fieldId} iconResources={iconResources} />

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

      <CalloutTitleStyleFields style={style} resolved={resolved} onChange={onChange} onResetField={onResetField} sectionId={sectionId} fieldId={fieldId} />

      <CalloutNumberingFields style={style} resolved={resolved} onChange={onChange} onResetField={onResetField} sectionId={sectionId} />

      <CollapsibleSection
        title={labels.calloutStyleDesignGroup}
        sectionId={`${sectionId}.design`}
        variant="subsection"
      >
        <ToggleSwitch
          label={labels.calloutStyleDesign}
          checked={designOn}
          onChange={(v) => updateDesign({ enabled: v })}
          tooltip={labels.calloutStyleDesignTooltip}
          isDefault={unset('design')}
          onReset={() => onResetField('design')}
        />
        {designOn && (
          <NestedGroup>
            <p className="px-2 py-1 text-xs" style={{ color: 'var(--slate)' }}>
              {labels.calloutStyleDesignInfo}
            </p>
            <DimensionInput
              label={labels.calloutStyleDesignMinHeight}
              value={shownDesign?.minHeight ?? ZERO_PT}
              onChange={(dim) => updateDesign({ minHeight: dim })}
              min={0}
              step={1}
              tooltip={labels.calloutStyleDesignMinHeightTooltip}
              isDefault={rawDesign?.minHeight === undefined}
              onReset={() => updateDesign({ minHeight: undefined })}
              units={MIN_HEIGHT_UNITS}
            />
            <ToggleSwitch
              label={labels.calloutStyleDesignSetsContent}
              checked={shownDesign?.setsContent ?? false}
              onChange={(v) => updateDesign({ setsContent: v })}
              tooltip={labels.calloutStyleDesignSetsContentTooltip}
              isDefault={rawDesign?.setsContent === undefined}
              onReset={() => updateDesign({ setsContent: undefined })}
            />
            <SlotEditor
              slotKey="box"
              raw={rawDesign?.slot}
              resolved={shownDesign?.slot ?? resolveDesignSlot(undefined, 'box')}
              onUpdate={(slot: DesignSlot | undefined) => updateDesign({ enabled: true, slot: slot ?? { elements: [] } })}
            />
          </NestedGroup>
        )}
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
        <ColorPicker
          label={labels.calloutStyleBodyItalicColor}
          value={resolved.body.italicColor ?? resolved.body.color}
          onChange={(v) => body({ italicColor: v })}
          tooltip={labels.calloutStyleBodyItalicColorTooltip}
          isDefault={groupUnset('body', 'italicColor')}
          onReset={() => resetGroupField('body', 'italicColor')}
          fieldId={`${fieldId}-body-italic`}
        />
        <NumberInput
          label={labels.bodyFontWeight}
          value={resolved.body.fontWeight}
          onChange={(v) => body({ fontWeight: v })}
          min={100}
          max={900}
          step={10}
          tooltip={labels.textStyleFontWeightTooltip}
          isDefault={groupUnset('body', 'fontWeight')}
          onReset={() => resetGroupField('body', 'fontWeight')}
        />
        <NumberInput
          label={labels.bodyBoldFontWeight}
          value={resolved.body.boldFontWeight}
          onChange={(v) => body({ boldFontWeight: v })}
          min={100}
          max={900}
          step={10}
          tooltip={labels.textStyleBoldFontWeightTooltip}
          isDefault={groupUnset('body', 'boldFontWeight')}
          onReset={() => resetGroupField('body', 'boldFontWeight')}
        />
        <ToggleSwitch
          label={labels.textStyleItalic}
          checked={resolved.body.italic}
          onChange={(v) => body({ italic: v })}
          tooltip={labels.textStyleItalicTooltip}
          isDefault={groupUnset('body', 'italic')}
          onReset={() => resetGroupField('body', 'italic')}
        />
        <ToggleSwitch
          label={labels.textStyleSmallCaps}
          checked={resolved.body.smallCaps}
          onChange={(v) => body({ smallCaps: v })}
          tooltip={labels.textStyleSmallCapsTooltip}
          isDefault={groupUnset('body', 'smallCaps')}
          onReset={() => resetGroupField('body', 'smallCaps')}
        />
        <DimensionInput
          label={labels.calloutStyleBodyLetterSpacing}
          value={resolved.body.letterSpacing ?? { value: 0, unit: 'em' }}
          onChange={(v) => body({ letterSpacing: v })}
          min={-1}
          step={0.005}
          units={TRACKING_UNITS}
          tooltip={labels.calloutStyleBodyLetterSpacingTooltip}
          isDefault={groupUnset('body', 'letterSpacing')}
          onReset={() => resetGroupField('body', 'letterSpacing')}
        />
        <SelectInput
          label={labels.alignmentLabel} tooltip={labels.alignmentHelp}
          value={resolved.body.textAlign}
          options={bodyAlignOptions}
          onChange={(v) => body({ textAlign: v as CalloutBodyStyleConfig['textAlign'] })}
          isDefault={groupUnset('body', 'textAlign')}
          onReset={() => resetGroupField('body', 'textAlign')}
        />
        {(resolved.body.textAlign === 'justify' || raggedHyphenation) && (
          <ToggleSwitch
            label={labels.bodyHyphenation}
            checked={resolved.body.hyphenation}
            onChange={(v) => body({ hyphenation: v })}
            isDefault={groupUnset('body', 'hyphenation')}
            onReset={() => resetGroupField('body', 'hyphenation')}
          />
        )}
        <ParagraphSpacingField
          value={resolved.body.paragraphSpacing}
          line={resolved.body.lineHeight}
          onChange={(v) => body({ paragraphSpacing: v })}
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
        <TabStopsField
          inherits
          stops={style.body?.tabStops}
          interval={style.body?.tabInterval}
          inheritedInterval={bodyTabInterval}
          onStopsChange={(next) => (next === undefined ? resetGroupField('body', 'tabStops') : body({ tabStops: next }))}
          onIntervalChange={(next) => (next === undefined ? resetGroupField('body', 'tabInterval') : body({ tabInterval: next }))}
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
        <FontPicker
          label={labels.calloutStyleListsBulletFont}
          value={resolved.lists.bulletFontFamily ?? listDefaults.bulletFontFamily}
          onChange={(v) => lists({ bulletFontFamily: v })}
          tooltip={labels.calloutStyleListsBulletFontTooltip}
          isDefault={groupUnset('lists', 'bulletFontFamily')}
          onReset={() => resetGroupField('lists', 'bulletFontFamily')}
          searchPlaceholder={labels.headingFontSearch}
          noResultsLabel={labels.headingFontNoResults}
        />
        <DimensionInput
          label={labels.calloutStyleListsMarginTop}
          tooltip={labels.calloutStyleListsMarginsTooltip}
          value={resolved.lists.marginTop ?? listDefaults.marginTop}
          onChange={(v) => lists({ marginTop: v })}
          min={0}
          step={0.1}
          units={SPACING_UNITS}
          isDefault={groupUnset('lists', 'marginTop')}
          onReset={() => resetGroupField('lists', 'marginTop')}
        />
        <DimensionInput
          label={labels.calloutStyleListsMarginBottom}
          tooltip={labels.calloutStyleListsMarginsTooltip}
          value={resolved.lists.marginBottom ?? listDefaults.marginBottom}
          onChange={(v) => lists({ marginBottom: v })}
          min={0}
          step={0.1}
          units={SPACING_UNITS}
          isDefault={groupUnset('lists', 'marginBottom')}
          onReset={() => resetGroupField('lists', 'marginBottom')}
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
    </ItemCard>
    </SearchScope>
  );
}
