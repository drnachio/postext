'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { resolveBodyTextConfig, resolveTableStyleConfig } from 'postext';
import type { TableStyleConfig, ResolvedTableStyleConfig, TableRules, TableOverflow, TableTextTransform, TableSpanRules, TableContinuedFootRule, DimensionUnit } from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  SelectInput,
  TextInput,
  ToggleSwitch,
} from '../../controls';

const FONT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em'];
const BORDER_UNITS: DimensionUnit[] = ['pt', 'px'];
const RULE_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const RADIUS_UNITS: DimensionUnit[] = ['pt', 'px', 'mm'];
const SPACING_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const TRACKING_UNITS: DimensionUnit[] = ['pt', 'em', 'px'];

export interface TableStyleFieldsProps {
  /** The stored (partial) style being edited. */
  raw: TableStyleConfig | undefined;
  /** The same style resolved — what each control shows. */
  resolved: ResolvedTableStyleConfig;
  onChange: (partial: Partial<TableStyleConfig>) => void;
  onResetField: (field: keyof TableStyleConfig) => void;
  /** Prefix of the subsections' remembered open state. */
  sectionIdPrefix: string;
  /** Prefix of the colour pickers' field ids. */
  fieldIdPrefix: string;
}

/** The table style controls — body and header typography, fills, borders,
 *  padding and continuation — shared by the document's table style and
 *  every named style. A control shows the resolved value and offers a reset
 *  while its key is set. */
export function TableStyleFields({
  raw,
  resolved: ts,
  onChange: update,
  onResetField: resetField,
  sectionIdPrefix,
  fieldIdPrefix,
}: TableStyleFieldsProps) {
  const labels = useSandboxLabels();
  const unset = (field: keyof TableStyleConfig) => raw?.[field] === undefined;

  const rulesOptions = [
    { value: 'grid', label: labels.tableRulesGrid },
    { value: 'horizontal', label: labels.tableRulesHorizontal },
    { value: 'outer', label: labels.tableRulesOuter },
    { value: 'none', label: labels.tableRulesNone },
    { value: 'booktabs', label: labels.tableRulesBooktabs },
  ];
  // Booktabs (#625) strokes its own widths and has no frame to round:
  // `borderWidth` and `borderRadius` do not apply to it.
  const booktabs = ts.borders && ts.rules === 'booktabs';
  const overflowOptions = [
    { value: 'split', label: labels.tableOverflowSplit },
    { value: 'clip', label: labels.tableOverflowClip },
    { value: 'hide', label: labels.tableOverflowHide },
  ];

  return (
    <>
      <CollapsibleSection title={labels.tableBodyGroup} sectionId={`${sectionIdPrefix}.body`} variant="subsection">
        <FontPicker
          label={labels.fontLabel}
          value={ts.bodyFontFamily}
          onChange={(v) => update({ bodyFontFamily: v })}
          isDefault={unset('bodyFontFamily')}
          onReset={() => resetField('bodyFontFamily')}
        />
        <DimensionInput
          label={labels.sizeLabel}
          value={ts.bodyFontSize}
          onChange={(v) => update({ bodyFontSize: v })}
          min={1}
          units={FONT_SIZE_UNITS}
          isDefault={unset('bodyFontSize')}
          onReset={() => resetField('bodyFontSize')}
        />
        <ColorPicker
          label={labels.colorLabel}
          value={ts.bodyColor}
          onChange={(v) => update({ bodyColor: v })}
          isDefault={unset('bodyColor')}
          onReset={() => resetField('bodyColor')}
          fieldId={`${fieldIdPrefix}-bodyColor`}
        />
        <ToggleSwitch
          label={labels.tableBodyFill} tooltip={labels.tableBodyFillTooltip}
          checked={ts.bodyBackgroundEnabled}
          onChange={(v) => update({ bodyBackgroundEnabled: v })}
          isDefault={unset('bodyBackgroundEnabled')}
          onReset={() => resetField('bodyBackgroundEnabled')}
        />
        {ts.bodyBackgroundEnabled && (
          <ColorPicker
            label={labels.backgroundColorLabel}
            value={ts.bodyBackground}
            onChange={(v) => update({ bodyBackground: v })}
            isDefault={unset('bodyBackground')}
            onReset={() => resetField('bodyBackground')}
            fieldId={`${fieldIdPrefix}-bodyBackground`}
          />
        )}
        <ToggleSwitch
          label={labels.tableBodyAlternateFill}
          checked={ts.bodyAlternateBackgroundEnabled}
          onChange={(v) => update({ bodyAlternateBackgroundEnabled: v })}
          tooltip={labels.tableBodyAlternateFillTooltip}
          isDefault={unset('bodyAlternateBackgroundEnabled')}
          onReset={() => resetField('bodyAlternateBackgroundEnabled')}
        />
        {ts.bodyAlternateBackgroundEnabled && (
          <ColorPicker
            label={labels.tableBodyAlternateColor}
            value={ts.bodyAlternateBackground}
            onChange={(v) => update({ bodyAlternateBackground: v })}
            isDefault={unset('bodyAlternateBackground')}
            onReset={() => resetField('bodyAlternateBackground')}
            fieldId={`${fieldIdPrefix}-bodyAlternateBackground`}
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection title={labels.tableHeaderGroup} sectionId={`${sectionIdPrefix}.header`} variant="subsection">
        <FontPicker
          label={labels.fontLabel}
          value={ts.headerFontFamily}
          onChange={(v) => update({ headerFontFamily: v })}
          isDefault={unset('headerFontFamily')}
          onReset={() => resetField('headerFontFamily')}
        />
        <DimensionInput
          label={labels.sizeLabel}
          value={ts.headerFontSize}
          onChange={(v) => update({ headerFontSize: v })}
          min={1}
          units={FONT_SIZE_UNITS}
          isDefault={unset('headerFontSize')}
          onReset={() => resetField('headerFontSize')}
        />
        <ColorPicker
          label={labels.colorLabel}
          value={ts.headerColor}
          onChange={(v) => update({ headerColor: v })}
          isDefault={unset('headerColor')}
          onReset={() => resetField('headerColor')}
          fieldId={`${fieldIdPrefix}-headerColor`}
        />
        <ToggleSwitch
          label={labels.bold} tooltip={labels.boldHelp}
          checked={ts.headerBold}
          onChange={(v) => update({ headerBold: v })}
          isDefault={unset('headerBold')}
          onReset={() => resetField('headerBold')}
        />
        <ToggleSwitch
          label={labels.italic} tooltip={labels.italicHelp}
          checked={ts.headerItalic}
          onChange={(v) => update({ headerItalic: v })}
          isDefault={unset('headerItalic')}
          onReset={() => resetField('headerItalic')}
        />
        <SelectInput
          label={labels.tableHeaderTextTransform}
          value={ts.headerTextTransform}
          options={[
            { value: 'none', label: labels.headingTextTransformNone },
            { value: 'uppercase', label: labels.headingTextTransformUppercase },
          ]}
          onChange={(v) => update({ headerTextTransform: v as TableTextTransform })}
          tooltip={labels.tableHeaderTextTransformTooltip}
          isDefault={unset('headerTextTransform')}
          onReset={() => resetField('headerTextTransform')}
        />
        <DimensionInput
          label={labels.tableHeaderLetterSpacing}
          value={ts.headerLetterSpacing}
          onChange={(v) => update({ headerLetterSpacing: v })}
          min={-5}
          step={0.1}
          units={TRACKING_UNITS}
          tooltip={labels.tableHeaderLetterSpacingTooltip}
          isDefault={unset('headerLetterSpacing')}
          onReset={() => resetField('headerLetterSpacing')}
        />
        <ToggleSwitch
          label={labels.tableHeaderFill} tooltip={labels.tableHeaderFillTooltip}
          checked={ts.headerBackgroundEnabled}
          onChange={(v) => update({ headerBackgroundEnabled: v })}
          isDefault={unset('headerBackgroundEnabled')}
          onReset={() => resetField('headerBackgroundEnabled')}
        />
        {ts.headerBackgroundEnabled && (
          <ColorPicker
            label={labels.backgroundColorLabel}
            value={ts.headerBackground}
            onChange={(v) => update({ headerBackground: v })}
            isDefault={unset('headerBackground')}
            onReset={() => resetField('headerBackground')}
            fieldId={`${fieldIdPrefix}-headerBackground`}
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection title={labels.tableBordersGroup} sectionId={`${sectionIdPrefix}.borders`} variant="subsection">
        <ToggleSwitch
          label={labels.tableBorders} tooltip={labels.tableBordersTooltip}
          checked={ts.borders}
          onChange={(v) => update({ borders: v })}
          isDefault={unset('borders')}
          onReset={() => resetField('borders')}
        />
        {ts.borders && (
          <>
            <SelectInput
              label={labels.tableRules}
              value={ts.rules}
              options={rulesOptions}
              onChange={(v) => update({ rules: v as TableRules })}
              tooltip={labels.tableRulesTooltip}
              isDefault={unset('rules')}
              onReset={() => resetField('rules')}
            />
            <ColorPicker
              label={labels.tableBorderColor}
              value={ts.borderColor}
              onChange={(v) => update({ borderColor: v })}
              isDefault={unset('borderColor')}
              onReset={() => resetField('borderColor')}
              fieldId={`${fieldIdPrefix}-borderColor`}
            />
            {!booktabs && (
              <DimensionInput
                label={labels.tableBorderWidth}
                value={ts.borderWidth}
                onChange={(v) => update({ borderWidth: v })}
                min={0}
                step={0.25}
                units={BORDER_UNITS}
                isDefault={unset('borderWidth')}
                onReset={() => resetField('borderWidth')}
              />
            )}
            {booktabs && (
              <>
                <DimensionInput
                  label={labels.tableHeavyRuleWidth}
                  value={ts.heavyRuleWidth}
                  onChange={(v) => update({ heavyRuleWidth: v })}
                  min={0}
                  step={0.01}
                  units={RULE_UNITS}
                  tooltip={labels.tableHeavyRuleWidthTooltip}
                  isDefault={unset('heavyRuleWidth')}
                  onReset={() => resetField('heavyRuleWidth')}
                />
                <DimensionInput
                  label={labels.tableLightRuleWidth}
                  value={ts.lightRuleWidth}
                  onChange={(v) => update({ lightRuleWidth: v })}
                  min={0}
                  step={0.01}
                  units={RULE_UNITS}
                  tooltip={labels.tableLightRuleWidthTooltip}
                  isDefault={unset('lightRuleWidth')}
                  onReset={() => resetField('lightRuleWidth')}
                />
                <SelectInput
                  label={labels.tableSpanRules}
                  value={ts.spanRules}
                  options={[
                    { value: 'trimmed', label: labels.tableSpanRulesTrimmed },
                    { value: 'full', label: labels.tableSpanRulesFull },
                    { value: 'none', label: labels.tableSpanRulesNone },
                  ]}
                  onChange={(v) => update({ spanRules: v as TableSpanRules })}
                  tooltip={labels.tableSpanRulesTooltip}
                  isDefault={unset('spanRules')}
                  onReset={() => resetField('spanRules')}
                />
                {ts.spanRules !== 'none' && (
                  <DimensionInput
                    label={labels.tableSpanRuleWidth}
                    value={ts.spanRuleWidth}
                    onChange={(v) => update({ spanRuleWidth: v })}
                    min={0}
                    step={0.01}
                    units={RULE_UNITS}
                    tooltip={labels.tableSpanRuleWidthTooltip}
                    isDefault={unset('spanRuleWidth')}
                    onReset={() => resetField('spanRuleWidth')}
                  />
                )}
                {ts.spanRules === 'trimmed' && (
                  <DimensionInput
                    label={labels.tableSpanRuleTrim}
                    value={ts.spanRuleTrim}
                    onChange={(v) => update({ spanRuleTrim: v })}
                    min={0}
                    step={0.05}
                    units={SPACING_UNITS}
                    tooltip={labels.tableSpanRuleTrimTooltip}
                    isDefault={unset('spanRuleTrim')}
                    onReset={() => resetField('spanRuleTrim')}
                  />
                )}
                <ToggleSwitch
                  label={labels.tableGroupRules} tooltip={labels.tableGroupRulesTooltip}
                  checked={ts.groupRules}
                  onChange={(v) => update({ groupRules: v })}
                  isDefault={unset('groupRules')}
                  onReset={() => resetField('groupRules')}
                />
              </>
            )}
          </>
        )}
        {!booktabs && (
          <DimensionInput
            label={labels.tableBorderRadius}
            value={ts.borderRadius}
            onChange={(v) => update({ borderRadius: v })}
            min={0}
            step={0.5}
            units={RADIUS_UNITS}
            tooltip={labels.tableBorderRadiusTooltip}
            isDefault={unset('borderRadius')}
            onReset={() => resetField('borderRadius')}
          />
        )}
        <DimensionInput
          label={labels.tableCellPadding}
          value={ts.cellPadding}
          onChange={(v) => update({ cellPadding: v })}
          min={0}
          step={0.05}
          units={SPACING_UNITS}
          isDefault={unset('cellPadding')}
          onReset={() => resetField('cellPadding')}
        />
      </CollapsibleSection>

      <CollapsibleSection title={labels.tableContinuationGroup} sectionId={`${sectionIdPrefix}.continuation`} variant="subsection">
        <SelectInput
          label={labels.tableOverflow}
          value={ts.overflow}
          options={overflowOptions}
          onChange={(v) => update({ overflow: v as TableOverflow })}
          tooltip={labels.tableOverflowTooltip}
          isDefault={unset('overflow')}
          onReset={() => resetField('overflow')}
        />
        <ToggleSwitch
          label={labels.tableSplitInline} tooltip={labels.tableSplitInlineTooltip}
          checked={ts.splitInline}
          onChange={(v) => update({ splitInline: v })}
          isDefault={unset('splitInline')}
          onReset={() => resetField('splitInline')}
        />
        {ts.overflow === 'split' && (
          <>
            {booktabs && (
              <SelectInput
                label={labels.tableContinuedFootRule}
                value={ts.continuedFootRule}
                options={[
                  { value: 'bottom', label: labels.tableContinuedFootRuleBottom },
                  { value: 'light', label: labels.tableContinuedFootRuleLight },
                  { value: 'none', label: labels.tableContinuedFootRuleNone },
                ]}
                onChange={(v) => update({ continuedFootRule: v as TableContinuedFootRule })}
                tooltip={labels.tableContinuedFootRuleTooltip}
                isDefault={unset('continuedFootRule')}
                onReset={() => resetField('continuedFootRule')}
              />
            )}
            <TextInput
              label={labels.tableContinuedSuffix}
              value={ts.continuedSuffix}
              onChange={(v) => update({ continuedSuffix: v })}
              tooltip={labels.tableContinuedSuffixTooltip}
              isDefault={unset('continuedSuffix')}
              onReset={() => resetField('continuedSuffix')}
            />
            <ToggleSwitch
              label={labels.tableContinuesMarkerEnabled} tooltip={labels.tableContinuesMarkerEnabledTooltip}
              checked={ts.continuesMarkerEnabled}
              onChange={(v) => update({ continuesMarkerEnabled: v })}
              isDefault={unset('continuesMarkerEnabled')}
              onReset={() => resetField('continuesMarkerEnabled')}
            />
            {ts.continuesMarkerEnabled && (
              <TextInput
                label={labels.tableContinuesMarker} tooltip={labels.tableContinuesMarkerTooltip}
                value={ts.continuesMarker}
                onChange={(v) => update({ continuesMarker: v })}
                isDefault={unset('continuesMarker')}
                onReset={() => resetField('continuesMarker')}
              />
            )}
          </>
        )}
      </CollapsibleSection>
    </>
  );
}

/** Config-panel section for styling embedded table resources: body and header
 *  typography, fills, borders, and cell padding. Unset fields inherit the body
 *  text, so this section is purely additive overrides. Named styles
 *  (`tableStyles`) inherit it in turn. */
export const TableStyleSection = memo(function TableStyleSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.tableStyle);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  // Continuation strings default per document language, the way the engine
  // resolves them: the config locale, else the hyphenation locale (which the
  // preview derives from the app locale when unset).
  const docLocale = useSandboxSelector((s) => s.config.locale ?? s.config.bodyText?.hyphenation?.locale ?? s.locale);
  const bodyText = resolveBodyTextConfig(bodyTextRaw);
  const ts = resolveTableStyleConfig(raw, bodyText, docLocale);

  const update = (partial: Partial<TableStyleConfig>) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { tableStyle: { ...raw, ...partial } } });
  };
  const resetSection = () => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { tableStyle: undefined } });
  };
  const resetField = (field: keyof TableStyleConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { tableStyle: Object.keys(next).length > 0 ? next : undefined },
    });
  };

  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;

  return (
    <CollapsibleSection
      title={labels.tableStyleSection}
      sectionId="tableStyle"
      onReset={resetSection}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <TableStyleFields
        raw={raw}
        resolved={ts}
        onChange={update}
        onResetField={resetField}
        sectionIdPrefix="tableStyle"
        fieldIdPrefix="tableStyle"
      />
    </CollapsibleSection>
  );
});
