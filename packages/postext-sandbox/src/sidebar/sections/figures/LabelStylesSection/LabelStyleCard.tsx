'use client';

// One label style's card: text, halo, plate and leader settings (#1276:
// split out of LabelStylesSection.tsx).
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { LabelStyle, ParagraphStyleConfig, ColorValue, LeaderStyle, LineCap } from 'postext';
import { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { ItemCard, CollapsibleSection, SelectInput, FontPicker, DimensionInput, NumberInput, ColorPicker, ToggleSwitch } from '../../../../controls/index.js';
import { ConfirmPopover, IconButton } from '../../../../ui/index.js';
import { FieldRow } from '../../../../controls/FieldRow.js';
import { SearchScope } from '../../../search/SearchScope.js';
import type { LabelStyleUse } from '../../../../labelStyles/labelRefs.js';
import { slugifyStyleId, NO_PARAGRAPH_STYLE, INHERIT, dashName, withLeaderLook, inputClass, inputStyle, SIZE_UNITS, DEFAULT_HALO, HALO_UNITS, WHITE, DEFAULT_PADDING, PLATE_UNITS, DEFAULT_BORDER_WIDTH, LINE_UNITS, DASHES } from './shared.js';

interface LabelStyleCardProps {
  style: LabelStyle;
  paragraphStyles: readonly ParagraphStyleConfig[];
  /** The body text: what the fields show while unset. */
  bodyFamily: string;
  bodyWeight: number;
  bodyColor: ColorValue;
  otherIds: Set<string>;
  /** What names this style in the book (#994). */
  usage: LabelStyleUse | undefined;
  /** What the latest rename of this style rewrote, said once. */
  renamed: string | null;
  onChange: (partial: Partial<LabelStyle>) => void;
  onResetField: (field: keyof LabelStyle) => void;
  onRename: (nextId: string) => void;
  onRemove: () => void;
}

/** One label style (#969): id (renamed on blur / Enter, never to a
 *  colliding id), display name, the type (a paragraph style to borrow, then
 *  face, size, weight, slant, colour, capitals, tracking), the halo and
 *  plate behind the letters, and how a label is fitted (smallest scale,
 *  writing mode, overlap). Unset fields show what they inherit. */
export function LabelStyleCard({ style, paragraphStyles, bodyFamily, bodyWeight, bodyColor, otherIds, usage, renamed, onChange, onResetField, onRename, onRemove }: LabelStyleCardProps) {
  const labels = useSandboxLabels();
  const [idDraft, setIdDraft] = useState(style.id);
  const draftSlug = slugifyStyleId(idDraft);
  const idTaken = draftSlug.length > 0 && draftSlug !== style.id && otherIds.has(draftSlug);
  const idEmpty = draftSlug.length === 0;

  const commitId = () => {
    if (idEmpty || idTaken) {
      setIdDraft(style.id);
      return;
    }
    setIdDraft(draftSlug);
    if (draftSlug !== style.id) onRename(draftSlug);
  };

  const unset = (field: keyof LabelStyle) => style[field] === undefined;
  const reset = (field: keyof LabelStyle) => () => onResetField(field);
  const sectionId = `labelStyles.${style.id}`;
  const borrowed = style.paragraphStyle !== undefined ? paragraphStyles.find((p) => p.id === style.paragraphStyle) : undefined;
  const inheritedFamily = borrowed?.fontFamily ?? bodyFamily;
  const inheritedWeight = borrowed?.fontWeight ?? bodyWeight;
  const inheritedColor = borrowed?.color ?? bodyColor;

  const paragraphOptions = [
    { value: NO_PARAGRAPH_STYLE, label: labels.labelStyleParagraphNone },
    ...paragraphStyles.map((p) => ({ value: p.id, label: p.name || p.id })),
    ...(style.paragraphStyle !== undefined && !borrowed ? [{ value: style.paragraphStyle, label: labels.labelStyleParagraphMissing.replace('__id__', style.paragraphStyle) }] : []),
  ];
  const slantOptions = [
    { value: INHERIT, label: labels.labelStyleInherited },
    { value: 'normal', label: labels.labelStyleUpright },
    { value: 'italic', label: labels.textStyleItalic },
  ];
  const caseOptions = [
    { value: INHERIT, label: labels.labelStyleInherited },
    { value: 'none', label: labels.headingTextTransformNone },
    { value: 'uppercase', label: labels.headingTextTransformUppercase },
  ];
  const writingOptions = [
    { value: 'horizontal-tb', label: labels.writingModeHorizontal },
    { value: 'vertical-rl', label: labels.writingModeVertical },
  ];
  const overlapOptions = [
    { value: 'check', label: labels.resourceLabelAnchorsOverlapCheck },
    { value: 'allow', label: labels.resourceLabelAnchorsOverlapAllow },
  ];
  const alignOptions = [
    { value: INHERIT, label: labels.labelStyleAlignAsAnchor },
    { value: 'start', label: labels.resourceLabelAnchorsAlignStart },
    { value: 'center', label: labels.resourceLabelAnchorsAlignCenter },
    { value: 'end', label: labels.resourceLabelAnchorsAlignEnd },
  ];
  const capOptions = [
    { value: 'none', label: labels.leaderCapNone },
    { value: 'dot', label: labels.leaderCapDot },
    { value: 'arrow', label: labels.leaderCapArrow },
    { value: 'ring', label: labels.connectorCapRing },
    { value: 'bar', label: labels.connectorCapBar },
  ];
  const dashOptions = [
    { value: 'solid', label: labels.leaderDashSolid },
    { value: 'dashed', label: labels.leaderDashDashed },
    { value: 'dotted', label: labels.leaderDashDotted },
    ...(dashName(style.leader?.dash) === 'custom' ? [{ value: 'custom', label: labels.leaderDashCustom }] : []),
  ];
  const routingOptions = [
    { value: 'straight', label: labels.leaderRoutingStraight },
    { value: 'elbow', label: labels.leaderRoutingElbow },
  ];
  const leader = style.leader;
  const setLeader = (patch: Partial<LeaderStyle>) => onChange({ leader: withLeaderLook(leader, patch) });
  const leaderUnset = (k: keyof LeaderStyle) => leader?.[k] === undefined;
  const textColor = style.color ?? inheritedColor;

  return (
    <SearchScope title={`${style.name ?? ''} ${style.id}`} overridden>
    <ItemCard
      list="labelStyles"
      id={style.id}
      styleId={style.id}
      title={style.name || style.id}
      subtitle={style.name && style.name !== style.id ? style.id : undefined}
      actions={
        <ConfirmPopover message={labels.labelStyleDeleteConfirm} onConfirm={onRemove}>
          {({ open }) => (
            <IconButton label={labels.chipStyleDelete} icon={<Trash2 size={13} />} destructive onClick={open} />
          )}
        </ConfirmPopover>
      }
    >

      <div className="mb-2 flex flex-col gap-2">
        <FieldRow
          stacked
          label={labels.idLabel} tooltip={labels.styleIdHelp}
          hint={idTaken ? labels.chipStyleIdHintDuplicate : (
            <>
              <span className="block">{labels.labelStyleUsageHint.replace('__id__', style.id)}</span>
              <span className="block">{labels.labelStyleUsageCount.replace('__anchors__', String(usage?.anchors ?? 0)).replace('__lines__', String(usage?.lines ?? 0))}</span>
            </>
          )}
          className="mb-0"
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
            aria-label={labels.labelStyleIdAria}
            className={inputClass}
            style={{ ...inputStyle, borderColor: idEmpty || idTaken ? 'var(--destructive)' : 'var(--rule)' }}
          />
          {renamed && <p role="status" className="m-0 mt-1 text-xs" style={{ color: 'var(--slate)' }}>{renamed}</p>}
        </FieldRow>
        <FieldRow stacked label={labels.chipStyleNameLabel} tooltip={labels.styleNameHelp} className="mb-0">
          <input
            dir="auto"
            type="text"
            value={style.name ?? ''}
            onChange={(e) => onChange({ name: e.target.value.length > 0 ? e.target.value : undefined })}
            aria-label={labels.labelStyleNameAria}
            placeholder={style.id}
            className={inputClass}
            style={inputStyle}
          />
        </FieldRow>
      </div>

      <CollapsibleSection title={labels.labelStyleTypeGroup} sectionId={`${sectionId}.type`} variant="subsection">
        <SelectInput
          label={labels.labelStyleParagraphStyle}
          tooltip={labels.labelStyleParagraphStyleTooltip}
          value={style.paragraphStyle ?? NO_PARAGRAPH_STYLE}
          options={paragraphOptions}
          onChange={(v) => (v === NO_PARAGRAPH_STYLE ? onResetField('paragraphStyle') : onChange({ paragraphStyle: v }))}
          isDefault={unset('paragraphStyle')}
          onReset={reset('paragraphStyle')}
        />
        <FontPicker
          label={labels.fontLabel}
          value={style.fontFamily ?? inheritedFamily}
          onChange={(v) => onChange({ fontFamily: v })}
          isDefault={unset('fontFamily')}
          onReset={reset('fontFamily')}
          searchPlaceholder={labels.bodyFontSearch}
          noResultsLabel={labels.bodyFontNoResults}
        />
        <DimensionInput
          label={labels.sizeLabel}
          value={style.fontSize ?? { value: 1, unit: 'em' }}
          onChange={(v) => onChange({ fontSize: v })}
          min={0.1}
          step={0.5}
          units={SIZE_UNITS}
          tooltip={labels.labelStyleFontSizeTooltip}
          isDefault={unset('fontSize')}
          onReset={reset('fontSize')}
        />
        <NumberInput
          label={labels.bodyFontWeight}
          value={style.fontWeight ?? inheritedWeight}
          onChange={(v) => onChange({ fontWeight: v })}
          min={100}
          max={900}
          step={10}
          tooltip={labels.labelStyleWeightTooltip}
          isDefault={unset('fontWeight')}
          onReset={reset('fontWeight')}
        />
        <SelectInput
          label={labels.labelStyleSlant}
          tooltip={labels.labelStyleSlantTooltip}
          value={style.fontStyle ?? INHERIT}
          options={slantOptions}
          onChange={(v) => (v === INHERIT ? onResetField('fontStyle') : onChange({ fontStyle: v as LabelStyle['fontStyle'] }))}
          isDefault={unset('fontStyle')}
          onReset={reset('fontStyle')}
        />
        <ColorPicker
          label={labels.colorLabel}
          value={style.color ?? inheritedColor}
          onChange={(v) => onChange({ color: v })}
          tooltip={labels.labelStyleColorTooltip}
          isDefault={unset('color')}
          onReset={reset('color')}
          fieldId={`labelStyle-${style.id}-color`}
        />
        <SelectInput
          label={labels.paragraphStyleTextTransform}
          tooltip={labels.labelStyleTextTransformTooltip}
          value={style.textTransform ?? INHERIT}
          options={caseOptions}
          onChange={(v) => (v === INHERIT ? onResetField('textTransform') : onChange({ textTransform: v as LabelStyle['textTransform'] }))}
          isDefault={unset('textTransform')}
          onReset={reset('textTransform')}
        />
        <NumberInput
          label={labels.paragraphStyleLetterSpacing}
          value={style.letterSpacing ?? 0}
          onChange={(v) => onChange({ letterSpacing: v })}
          min={-0.2}
          max={2}
          step={0.01}
          suffix="em"
          tooltip={labels.labelStyleLetterSpacingTooltip}
          isDefault={unset('letterSpacing')}
          onReset={reset('letterSpacing')}
        />
      </CollapsibleSection>

      <CollapsibleSection title={labels.labelStyleBackdropGroup} sectionId={`${sectionId}.backdrop`} variant="subsection">
        <ToggleSwitch
          label={labels.labelStyleHalo}
          tooltip={labels.labelStyleHaloTooltip}
          checked={style.halo !== undefined}
          onChange={(on) => (on ? onChange({ halo: DEFAULT_HALO }) : onResetField('halo'))}
          isDefault={unset('halo')}
          onReset={reset('halo')}
        />
        {style.halo && (
          <>
            <ColorPicker
              label={labels.labelStyleHaloColor}
              value={style.halo.color}
              onChange={(v) => onChange({ halo: { ...style.halo!, color: v } })}
              fieldId={`labelStyle-${style.id}-haloColor`}
            />
            <DimensionInput
              label={labels.labelStyleHaloWidth}
              value={style.halo.width}
              onChange={(v) => onChange({ halo: { ...style.halo!, width: v } })}
              min={0}
              step={0.25}
              units={HALO_UNITS}
            />
          </>
        )}
        <ToggleSwitch
          label={labels.labelStylePlate}
          tooltip={labels.labelStylePlateTooltip}
          checked={style.background !== undefined}
          onChange={(on) => (on ? onChange({ background: WHITE }) : onResetField('background'))}
          isDefault={unset('background')}
          onReset={reset('background')}
        />
        {style.background && (
          <ColorPicker
            label={labels.labelStylePlateColor}
            value={style.background}
            onChange={(v) => onChange({ background: v })}
            fieldId={`labelStyle-${style.id}-background`}
          />
        )}
        <DimensionInput
          label={labels.labelStylePadding}
          value={style.padding ?? DEFAULT_PADDING}
          onChange={(v) => onChange({ padding: v })}
          min={0}
          step={0.5}
          units={PLATE_UNITS}
          tooltip={labels.labelStylePaddingTooltip}
          isDefault={unset('padding')}
          onReset={reset('padding')}
        />
        <ToggleSwitch
          label={labels.labelStyleBorder}
          tooltip={labels.labelStyleBorderTooltip}
          checked={style.border !== undefined}
          onChange={(on) => (on ? onChange({ border: { color: textColor, width: DEFAULT_BORDER_WIDTH } }) : onResetField('border'))}
          isDefault={unset('border')}
          onReset={reset('border')}
        />
        {style.border && (
          <>
            <ColorPicker
              label={labels.labelStyleBorderColor}
              value={style.border.color}
              onChange={(v) => onChange({ border: { ...style.border!, color: v } })}
              fieldId={`labelStyle-${style.id}-borderColor`}
            />
            <DimensionInput
              label={labels.labelStyleBorderWidth}
              value={style.border.width}
              onChange={(v) => onChange({ border: { ...style.border!, width: v } })}
              min={0}
              step={0.25}
              units={LINE_UNITS}
            />
          </>
        )}
        <DimensionInput
          label={labels.labelStyleRadius}
          value={style.radius ?? { value: 0, unit: 'pt' }}
          onChange={(v) => onChange({ radius: v })}
          min={0}
          step={0.5}
          units={PLATE_UNITS}
          tooltip={labels.labelStyleRadiusTooltip}
          isDefault={unset('radius')}
          onReset={reset('radius')}
        />
      </CollapsibleSection>

      <CollapsibleSection title={labels.labelStyleLinesGroup} sectionId={`${sectionId}.lines`} variant="subsection">
        <SelectInput
          label={labels.labelStyleAlign}
          tooltip={labels.labelStyleAlignTooltip}
          value={style.align ?? INHERIT}
          options={alignOptions}
          onChange={(v) => (v === INHERIT ? onResetField('align') : onChange({ align: v as LabelStyle['align'] }))}
          isDefault={unset('align')}
          onReset={reset('align')}
        />
        <ToggleSwitch
          label={labels.labelStyleLegend}
          tooltip={labels.labelStyleLegendTooltip}
          checked={style.kind === 'legend'}
          onChange={(on) => (on ? onChange({ kind: 'legend' }) : onResetField('kind'))}
          isDefault={unset('kind')}
          onReset={reset('kind')}
        />
      </CollapsibleSection>

      <CollapsibleSection title={labels.labelStyleLeaderGroup} sectionId={`${sectionId}.leader`} variant="subsection">
        <ToggleSwitch
          label={labels.labelStyleLeader}
          tooltip={labels.labelStyleLeaderTooltip}
          checked={leader !== undefined}
          onChange={(on) => (on ? onChange({ leader: {} }) : onResetField('leader'))}
          isDefault={unset('leader')}
          onReset={reset('leader')}
        />
        {leader && (
          <>
            <ColorPicker
              label={labels.leaderColor}
              value={leader.color ?? textColor}
              onChange={(v) => setLeader({ color: v })}
              tooltip={labels.leaderColorTooltip}
              isDefault={leaderUnset('color')}
              onReset={() => setLeader({ color: undefined })}
              fieldId={`labelStyle-${style.id}-leaderColor`}
            />
            <NumberInput
              label={labels.connectorOpacity}
              tooltip={labels.connectorOpacityTooltip}
              value={Math.round((leader.opacity ?? 1) * 100)}
              min={0}
              max={100}
              step={5}
              suffix="%"
              onChange={(v) => {
                const o = Math.max(0, Math.min(100, v)) / 100;
                setLeader({ opacity: o >= 1 ? undefined : o });
              }}
              isDefault={leaderUnset('opacity')}
              onReset={() => setLeader({ opacity: undefined })}
            />
            <DimensionInput
              label={labels.leaderWidth}
              value={leader.width ?? { value: 0.75, unit: 'pt' }}
              onChange={(v) => setLeader({ width: v })}
              min={0.1}
              step={0.25}
              units={LINE_UNITS}
              isDefault={leaderUnset('width')}
              onReset={() => setLeader({ width: undefined })}
            />
            <SelectInput
              label={labels.leaderDash}
              value={dashName(leader.dash)}
              options={dashOptions}
              variant="segmented"
              onChange={(v) => (v === 'custom' ? undefined : setLeader({ dash: v === 'solid' ? undefined : DASHES[v as 'dashed' | 'dotted'] }))}
              isDefault={leaderUnset('dash')}
              onReset={() => setLeader({ dash: undefined })}
            />
            <SelectInput
              label={labels.leaderStartCap}
              value={leader.startCap ?? 'none'}
              options={capOptions}
              onChange={(v) => setLeader({ startCap: v as LineCap })}
              isDefault={leaderUnset('startCap')}
              onReset={() => setLeader({ startCap: undefined })}
            />
            <SelectInput
              label={labels.leaderEndCap}
              value={leader.endCap ?? 'dot'}
              options={capOptions}
              onChange={(v) => setLeader({ endCap: v as LineCap })}
              isDefault={leaderUnset('endCap')}
              onReset={() => setLeader({ endCap: undefined })}
            />
            <DimensionInput
              label={labels.leaderCapSize}
              value={leader.capSize ?? { value: 2.25, unit: 'pt' }}
              onChange={(v) => setLeader({ capSize: v })}
              min={0}
              step={0.25}
              units={LINE_UNITS}
              tooltip={labels.leaderCapSizeTooltip}
              isDefault={leaderUnset('capSize')}
              onReset={() => setLeader({ capSize: undefined })}
            />
            <SelectInput
              label={labels.leaderRouting}
              value={leader.routing ?? 'straight'}
              options={routingOptions}
              variant="segmented"
              onChange={(v) => setLeader({ routing: v as LeaderStyle['routing'] })}
              isDefault={leaderUnset('routing')}
              onReset={() => setLeader({ routing: undefined })}
            />
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection title={labels.labelStyleFitGroup} sectionId={`${sectionId}.fit`} variant="subsection">
        <NumberInput
          label={labels.labelStyleMinScale}
          value={style.minScale ?? 0.85}
          onChange={(v) => onChange({ minScale: v })}
          min={0.1}
          max={1}
          step={0.05}
          tooltip={labels.labelStyleMinScaleTooltip}
          isDefault={unset('minScale')}
          onReset={reset('minScale')}
        />
        <SelectInput
          label={labels.writingMode}
          tooltip={labels.labelStyleWritingModeTooltip}
          value={style.writingMode ?? 'horizontal-tb'}
          options={writingOptions}
          onChange={(v) => onChange({ writingMode: v as LabelStyle['writingMode'] })}
          isDefault={unset('writingMode')}
          onReset={reset('writingMode')}
        />
        <SelectInput
          label={labels.resourceLabelAnchorsOverlap}
          tooltip={labels.labelStyleOverlapTooltip}
          value={style.overlap ?? 'check'}
          options={overlapOptions}
          variant="segmented"
          onChange={(v) => onChange({ overlap: v as LabelStyle['overlap'] })}
          isDefault={unset('overlap')}
          onReset={reset('overlap')}
        />
      </CollapsibleSection>
    </ItemCard>
    </SearchScope>
  );
}
