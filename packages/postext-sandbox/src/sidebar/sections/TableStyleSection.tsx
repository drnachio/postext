'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { resolveBodyTextConfig, resolveTableStyleConfig } from 'postext';
import type { TableStyleConfig, DimensionUnit } from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  ToggleSwitch,
} from '../../controls';

const FONT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em'];
const BORDER_UNITS: DimensionUnit[] = ['pt', 'px'];
const SPACING_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];

/** Config-panel section for styling embedded table resources: body and header
 *  typography, fills, borders, and cell padding. Unset fields inherit the body
 *  text, so this section is purely additive overrides. */
export const TableStyleSection = memo(function TableStyleSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.tableStyle);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const bodyText = resolveBodyTextConfig(bodyTextRaw);
  const ts = resolveTableStyleConfig(raw, bodyText);

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
  const unset = (field: keyof TableStyleConfig) => raw?.[field] === undefined;

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
      <CollapsibleSection title={labels.tableBodyGroup} sectionId="tableStyle.body" variant="subsection">
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
          fieldId="tableStyle-bodyColor"
        />
        <ToggleSwitch
          label={labels.tableBodyFill}
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
            fieldId="tableStyle-bodyBackground"
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection title={labels.tableHeaderGroup} sectionId="tableStyle.header" variant="subsection">
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
          fieldId="tableStyle-headerColor"
        />
        <ToggleSwitch
          label={labels.bold ?? 'Bold'}
          checked={ts.headerBold}
          onChange={(v) => update({ headerBold: v })}
          isDefault={unset('headerBold')}
          onReset={() => resetField('headerBold')}
        />
        <ToggleSwitch
          label={labels.italic ?? 'Italic'}
          checked={ts.headerItalic}
          onChange={(v) => update({ headerItalic: v })}
          isDefault={unset('headerItalic')}
          onReset={() => resetField('headerItalic')}
        />
        <ToggleSwitch
          label={labels.tableHeaderFill}
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
            fieldId="tableStyle-headerBackground"
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection title={labels.tableBordersGroup} sectionId="tableStyle.borders" variant="subsection">
        <ToggleSwitch
          label={labels.tableBorders}
          checked={ts.borders}
          onChange={(v) => update({ borders: v })}
          isDefault={unset('borders')}
          onReset={() => resetField('borders')}
        />
        {ts.borders && (
          <>
            <ColorPicker
              label={labels.tableBorderColor}
              value={ts.borderColor}
              onChange={(v) => update({ borderColor: v })}
              isDefault={unset('borderColor')}
              onReset={() => resetField('borderColor')}
              fieldId="tableStyle-borderColor"
            />
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
          </>
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
    </CollapsibleSection>
  );
});
