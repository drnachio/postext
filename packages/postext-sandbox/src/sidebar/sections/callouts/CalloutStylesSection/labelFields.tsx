'use client';

// The label and title fields of a box style, shared with the code style
// section through tab hosts (#1276: split out of CalloutStylesSection.tsx).
import { type Resource, type CalloutLabelConfig, uniformRadius, type CalloutLabelIconKind } from 'postext';
import { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { CollapsibleSection, ToggleSwitch, FontPicker, DimensionInput, NumberInput, ColorPicker, SelectInput, TextInput } from '../../../../controls/index.js';
import { CornerRadiusFields } from '../../running/HeaderFooterSection/shapeFields.js';
import { useRightToLeftFlow, flowSideLabels } from '../../../settings/flowSides.js';
import { joinedTabPatch, labelIconKindPatch, GlyphPicker, ShapeFields, TintFields } from './iconFields.js';
import { iconLabel, FONT_SIZE_UNITS, SPACING_UNITS, STROKE_UNITS } from './shared.js';
import { type CalloutGroupFieldsProps, tabHostEdits, type TabHost } from './labelFields/tabHost.js';

export { CalloutTitleStyleFields } from './labelFields/CalloutTitleStyleFields.js';

/** The label tab group: on/off, face, colours, corner, joined outline,
 *  icon and top-edge rule. */
export function CalloutLabelFields({ style, resolved, onChange, onResetField, sectionId, fieldId, iconResources }: CalloutGroupFieldsProps & { iconResources: Resource[] }) {
  const labels = useSandboxLabels();
  const rtl = useRightToLeftFlow();
  const labelSide = flowSideLabels(rtl, labels.calloutStyleLabelPositionTopLeft, labels.calloutStyleLabelPositionTopRight);
  const { updateGroup, resetGroupField, groupUnset } = tabHostEdits({ style, onChange, onResetField });
  const unset = (field: keyof TabHost) => style[field] === undefined;
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
  const labelBottomSide = flowSideLabels(rtl, labels.calloutStyleLabelPositionBottomLeft, labels.calloutStyleLabelPositionBottomRight);
  const labelPositionOptions = [
    { value: 'top-right', label: labelSide.right },
    { value: 'top-left', label: labelSide.left },
    { value: 'top-start', label: labels.calloutStyleLabelPositionTopStart },
    { value: 'top-end', label: labels.calloutStyleLabelPositionTopEnd },
    // Tabs hanging from the box's foot (#1059).
    { value: 'bottom-right', label: labelBottomSide.right },
    { value: 'bottom-left', label: labelBottomSide.left },
    { value: 'bottom-start', label: labels.calloutStyleLabelPositionBottomStart },
    { value: 'bottom-end', label: labels.calloutStyleLabelPositionBottomEnd },
  ];

  return (
    <>
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
            {/* The tab and the box as one outline (#1059). */}
            <ToggleSwitch
              label={labels.calloutStyleLabelJoined}
              tooltip={labels.calloutStyleLabelJoinedTooltip}
              checked={resolved.label.joined}
              onChange={(v) => label(joinedTabPatch(v))}
              isDefault={groupUnset('label', 'joined')}
              onReset={() => resetGroupField('label', 'joined')}
            />
            {resolved.label.joined && (
              <ToggleSwitch
                label={labels.calloutStyleLabelOwnBackground}
                tooltip={labels.calloutStyleLabelOwnBackgroundTooltip}
                checked={resolved.label.ownBackground === true}
                onChange={(v) => label({ ownBackground: v })}
                isDefault={groupUnset('label', 'ownBackground')}
                onReset={() => resetGroupField('label', 'ownBackground')}
              />
            )}
            {resolved.label.joined && (
              <DimensionInput
                label={labels.calloutStyleLabelFillet}
                tooltip={labels.calloutStyleLabelFilletTooltip}
                value={resolved.label.fillet ?? uniformRadius(resolved.borderRadius) ?? { value: 0, unit: 'pt' }}
                onChange={(v) => label({ fillet: v })}
                min={0}
                step={0.05}
                units={SPACING_UNITS}
                isDefault={groupUnset('label', 'fillet')}
                onReset={() => resetGroupField('label', 'fillet')}
              />
            )}
            {/* The tab's own corners (#1102): square apart from the box,
                the box's corner on a joined tab, unless set. */}
            <CornerRadiusFields
              label={labels.calloutStyleLabelBorderRadius}
              tooltip={labels.calloutStyleLabelBorderRadiusTooltip}
              value={resolved.label.borderRadius}
              fallback={(resolved.label.joined ? uniformRadius(resolved.borderRadius) : undefined) ?? { value: 0, unit: 'pt' }}
              step={0.05}
              units={SPACING_UNITS}
              isDefault={groupUnset('label', 'borderRadius')}
              onReset={() => resetGroupField('label', 'borderRadius')}
              onChange={(v) => label({ borderRadius: v })}
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
            {!resolved.label.joined && <DimensionInput
              label={labels.calloutStyleLabelOffset}
              value={resolved.label.offset}
              onChange={(v) => label({ offset: v })}
              min={0}
              step={0.05}
              units={SPACING_UNITS}
              tooltip={labels.calloutStyleLabelOffsetTooltip}
              isDefault={groupUnset('label', 'offset')}
              onReset={() => resetGroupField('label', 'offset')}
            />}
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
              label={labels.calloutStyleLabelIconKind}
              value={resolved.label.icon.kind}
              options={[
                { value: 'resource', label: labels.calloutStyleLabelIconKindPicture },
                { value: 'glyph', label: labels.calloutStyleIconKindGlyph },
                { value: 'shape', label: labels.calloutStyleIconKindShape },
              ]}
              onChange={(v) => updateLabelIcon(labelIconKindPatch(style.label?.icon, v as CalloutLabelIconKind))}
              tooltip={labels.calloutStyleLabelIconKindTooltip}
              isDefault={labelIconUnset('kind')}
              onReset={() => resetLabelIconField('kind')}
            />
            {resolved.label.icon.kind === 'glyph' && (
              <>
                <TextInput
                  label={labels.calloutStyleLabelIconGlyph}
                  value={resolved.label.icon.glyph}
                  onChange={(v) => updateLabelIcon({ glyph: v })}
                  tooltip={labels.calloutStyleLabelIconGlyphTooltip}
                  widthCh={6}
                  isDefault={labelIconUnset('glyph')}
                  onReset={() => resetLabelIconField('glyph')}
                />
                <GlyphPicker
                  label={labels.calloutStyleLabelIconGlyphCommon}
                  useLabel={labels.calloutStyleLabelIconGlyphUse}
                  value={resolved.label.icon.glyph}
                  onPick={(glyph) => updateLabelIcon({ glyph })}
                />
                <FontPicker
                  label={labels.calloutStyleIconFont}
                  value={resolved.label.icon.fontFamily}
                  onChange={(v) => updateLabelIcon({ fontFamily: v })}
                  isDefault={labelIconUnset('fontFamily')}
                  onReset={() => resetLabelIconField('fontFamily')}
                  searchPlaceholder={labels.bodyFontSearch}
                  noResultsLabel={labels.bodyFontNoResults}
                />
                <NumberInput
                  label={labels.calloutStyleIconWeight}
                  value={resolved.label.icon.fontWeight}
                  onChange={(v) => updateLabelIcon({ fontWeight: v })}
                  min={100}
                  max={900}
                  step={10}
                  isDefault={labelIconUnset('fontWeight')}
                  onReset={() => resetLabelIconField('fontWeight')}
                />
                <NumberInput
                  label={labels.calloutStyleLabelIconScale}
                  value={resolved.label.icon.scale}
                  onChange={(v) => updateLabelIcon({ scale: v })}
                  min={0.1}
                  max={4}
                  step={0.05}
                  tooltip={labels.calloutStyleLabelIconScaleTooltip}
                  isDefault={labelIconUnset('scale')}
                  onReset={() => resetLabelIconField('scale')}
                />
                <ColorPicker
                  label={labels.calloutStyleIconColor}
                  // Unset, the glyph takes the tab's words' colour.
                  value={resolved.label.icon.color ?? resolved.label.color}
                  onChange={(v) => updateLabelIcon({ color: v })}
                  isDefault={labelIconUnset('color')}
                  onReset={() => resetLabelIconField('color')}
                  fieldId={`${fieldId}-label-glyph`}
                />
                <SelectInput
                  label={labels.calloutStyleLabelIconGlyphPlacement}
                  value={resolved.label.icon.placement}
                  options={[
                    { value: 'beside', label: labels.calloutStyleLabelIconBeside },
                    { value: 'inside', label: labels.calloutStyleLabelIconInside },
                  ]}
                  onChange={(v) => updateLabelIcon({ placement: v as 'beside' | 'inside' })}
                  isDefault={labelIconUnset('placement')}
                  onReset={() => resetLabelIconField('placement')}
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
            {resolved.label.icon.kind === 'shape' && (
              <>
                <ShapeFields
                  shape={resolved.label.icon.shape ?? 'ring'}
                  strokeWidth={resolved.label.icon.strokeWidth}
                  sizeForDefault={{ value: resolved.label.icon.scale, unit: 'em' }}
                  update={(partial) => updateLabelIcon(partial)}
                  isDefault={(field) => labelIconUnset(field)}
                  onReset={(field) => resetLabelIconField(field)}
                />
                <NumberInput
                  label={labels.calloutStyleLabelIconScale}
                  value={resolved.label.icon.scale}
                  onChange={(v) => updateLabelIcon({ scale: v })}
                  min={0.1}
                  max={4}
                  step={0.05}
                  tooltip={labels.calloutStyleLabelIconScaleTooltip}
                  isDefault={labelIconUnset('scale')}
                  onReset={() => resetLabelIconField('scale')}
                />
                <ColorPicker
                  label={labels.calloutStyleIconColor}
                  value={resolved.label.icon.color ?? resolved.label.color}
                  onChange={(v) => updateLabelIcon({ color: v })}
                  isDefault={labelIconUnset('color')}
                  onReset={() => resetLabelIconField('color')}
                  fieldId={`${fieldId}-label-shape`}
                />
                <SelectInput
                  label={labels.calloutStyleLabelIconGlyphPlacement}
                  value={resolved.label.icon.placement}
                  options={[
                    { value: 'beside', label: labels.calloutStyleLabelIconBeside },
                    { value: 'inside', label: labels.calloutStyleLabelIconInside },
                  ]}
                  onChange={(v) => updateLabelIcon({ placement: v as 'beside' | 'inside' })}
                  isDefault={labelIconUnset('placement')}
                  onReset={() => resetLabelIconField('placement')}
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
            {resolved.label.icon.kind === 'resource' && (
            <SelectInput
              label={labels.calloutStyleLabelIcon}
              value={resolved.label.icon.resourceId}
              options={labelResourceOptions}
              onChange={(v) => updateLabelIcon({ resourceId: v })}
              tooltip={labels.calloutStyleLabelIconTooltip}
              isDefault={labelIconUnset('resourceId')}
              onReset={() => resetLabelIconField('resourceId')}
            />
            )}
            {resolved.label.icon.kind === 'resource' && resolved.label.icon.resourceId && (
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
                <SelectInput
                  label={labels.calloutStyleLabelIconPlacement}
                  value={resolved.label.icon.placement}
                  options={[
                    { value: 'beside', label: labels.calloutStyleLabelIconBeside },
                    { value: 'inside', label: labels.calloutStyleLabelIconInside },
                  ]}
                  onChange={(v) => updateLabelIcon({ placement: v as 'beside' | 'inside' })}
                  tooltip={labels.calloutStyleLabelIconPlacementTooltip}
                  isDefault={labelIconUnset('placement')}
                  onReset={() => resetLabelIconField('placement')}
                />
                <TintFields
                  tint={resolved.label.icon.tint}
                  ownColor={resolved.label.color}
                  update={(tint) => updateLabelIcon({ tint })}
                  isDefault={labelIconUnset('tint')}
                  onReset={() => resetLabelIconField('tint')}
                  fieldId={`${fieldId}-label-tint`}
                  toggleLabel={labels.calloutStyleLabelIconTint}
                  toggleTooltip={labels.calloutStyleLabelIconTintTooltip}
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
    </>
  );
}
