'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { resolveLayoutConfig, DEFAULT_LAYOUT_CONFIG, DEFAULT_COLUMN_RULE, dimensionsEqual, colorsEqual } from 'postext';
import type { LayoutConfig, Dimension, ColorValue } from 'postext';
import {
  ChoiceInput,
  CollapsibleSection,
  SelectInput,
  DimensionInput,
  NumberInput,
  NestedGroup,
  ToggleSwitch,
  ColorPicker,
} from '../../controls';
import { HighlightZone } from '../settings/previewHighlight';
import { ColumnsPicture } from '../settings/pictures';

const D = DEFAULT_LAYOUT_CONFIG;

export const LayoutSection = memo(function LayoutSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.layout);
  const layout = resolveLayoutConfig(raw);

  const updateLayout = (partial: Partial<LayoutConfig>) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { layout: { ...raw, ...partial } },
    });
  };

  const resetLayout = () => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { layout: undefined },
    });
  };

  const resetField = (field: keyof LayoutConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { layout: hasKeys ? next : undefined },
    });
  };

  const resetColumnRuleField = (field: 'enabled' | 'color' | 'lineWidth') => {
    if (!raw?.columnRule) return;
    const next = { ...raw.columnRule };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { layout: { ...raw, columnRule: hasKeys ? next : undefined } },
    });
  };

  const handleLayoutTypeChange = (value: string) => {
    const layoutType = value as LayoutConfig['layoutType'];
    if (layoutType === 'single') {
      // Remove gutter and side column when switching to single
      const next: LayoutConfig = { ...raw, layoutType };
      delete next.gutterWidth;
      delete next.sideColumnPercent;
      delete next.sideColumnRole;
      delete next.sideColumnSide;
      delete next.columnRule;
      const hasKeys = Object.keys(next).length > 0;
      dispatch({
        type: 'UPDATE_CONFIG',
        payload: { layout: hasKeys ? next : undefined },
      });
    } else {
      updateLayout({ layoutType });
    }
  };

  const LAYOUT_TYPE_OPTIONS: { value: LayoutConfig['layoutType'] & string; label: string; description: string; picture: React.ReactNode }[] = [
    { value: 'single', label: labels.layoutSingle, description: labels.layoutSingleDescription, picture: <ColumnsPicture kind="single" /> },
    { value: 'double', label: labels.layoutDouble, description: labels.layoutDoubleDescription, picture: <ColumnsPicture kind="double" /> },
    { value: 'oneAndHalf', label: labels.layoutOneAndHalf, description: labels.layoutOneAndHalfDescription, picture: <ColumnsPicture kind="oneAndHalf" /> },
  ];

  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  const isTypeDefault = layout.layoutType === D.layoutType;
  const isGutterDefault = dimensionsEqual(layout.gutterWidth, D.gutterWidth);
  const isSideColDefault = layout.sideColumnPercent === D.sideColumnPercent;
  const isSideRoleDefault = layout.sideColumnRole === D.sideColumnRole;
  const isSideSideDefault = layout.sideColumnSide === D.sideColumnSide;
  const SIDE_ROLE_OPTIONS = [
    { value: 'text', label: labels.sideColumnRoleText },
    { value: 'floats', label: labels.sideColumnRoleFloats },
  ];
  const SIDE_SIDE_OPTIONS = [
    { value: 'right', label: labels.sideColumnSideRight },
    { value: 'left', label: labels.sideColumnSideLeft },
    { value: 'outer', label: labels.sideColumnSideOuter },
    { value: 'inner', label: labels.sideColumnSideInner },
  ];
  const isCrEnabledDefault = layout.columnRule.enabled === DEFAULT_COLUMN_RULE.enabled;
  const isCrColorDefault = colorsEqual(layout.columnRule.color, DEFAULT_COLUMN_RULE.color);
  const isCrLineWidthDefault = dimensionsEqual(layout.columnRule.lineWidth, DEFAULT_COLUMN_RULE.lineWidth);

  const showGutter = layout.layoutType === 'double' || layout.layoutType === 'oneAndHalf';
  const showSideCol = layout.layoutType === 'oneAndHalf';

  return (
    <CollapsibleSection
      title={labels.layout}
      sectionId="layout"
      onReset={resetLayout}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <ChoiceInput
        label={labels.layoutType}
        value={layout.layoutType}
        options={LAYOUT_TYPE_OPTIONS}
        onChange={handleLayoutTypeChange}
        tooltip={labels.layoutTypeTooltip}
        isDefault={isTypeDefault}
        onReset={() => {
          if (!raw) return;
          const next = { ...raw };
          delete next.layoutType;
          delete next.gutterWidth;
          delete next.sideColumnPercent;
          delete next.sideColumnRole;
          delete next.sideColumnSide;
          delete next.columnRule;
          dispatch({ type: 'UPDATE_CONFIG', payload: { layout: Object.keys(next).length > 0 ? next : undefined } });
        }}
      />

      {(showGutter || showSideCol) && (
        <NestedGroup>
          {showGutter && (
            <HighlightZone part="gutter">
            <DimensionInput
              label={labels.gutterWidth}
              value={layout.gutterWidth}
              onChange={(dim: Dimension) => updateLayout({ gutterWidth: dim })}
              min={0}
              step={0.1}
              tooltip={labels.gutterWidthTooltip}
              isDefault={isGutterDefault}
              onReset={() => resetField('gutterWidth')}
            />
            </HighlightZone>
          )}
          {showSideCol && (
            <NumberInput
              label={labels.sideColumnPercent}
              value={layout.sideColumnPercent}
              onChange={(v) => updateLayout({ sideColumnPercent: v })}
              min={10}
              max={50}
              step={1}
              tooltip={labels.sideColumnPercentTooltip}
              isDefault={isSideColDefault}
              onReset={() => resetField('sideColumnPercent')}
              suffix="%"
            />
          )}
          {showSideCol && (
            <SelectInput
              label={labels.sideColumnRole}
              value={layout.sideColumnRole}
              options={SIDE_ROLE_OPTIONS}
              onChange={(v) => updateLayout({ sideColumnRole: v as LayoutConfig['sideColumnRole'] })}
              tooltip={labels.sideColumnRoleTooltip}
              isDefault={isSideRoleDefault}
              onReset={() => resetField('sideColumnRole')}
            />
          )}
          {showSideCol && (
            <SelectInput
              label={labels.sideColumnSide}
              value={layout.sideColumnSide}
              options={SIDE_SIDE_OPTIONS}
              onChange={(v) => updateLayout({ sideColumnSide: v as LayoutConfig['sideColumnSide'] })}
              tooltip={labels.sideColumnSideTooltip}
              isDefault={isSideSideDefault}
              onReset={() => resetField('sideColumnSide')}
            />
          )}

          <ToggleSwitch
            label={labels.columnRule}
            checked={layout.columnRule.enabled}
            onChange={(v) =>
              updateLayout({ columnRule: { ...raw?.columnRule, enabled: v } })
            }
            tooltip={labels.columnRuleTooltip}
            isDefault={isCrEnabledDefault}
            onReset={() => resetColumnRuleField('enabled')}
          />

          {layout.columnRule.enabled && (
            <NestedGroup>
              <ColorPicker
                label={labels.columnRuleColor}
                value={layout.columnRule.color}
                onChange={(color: ColorValue) =>
                  updateLayout({ columnRule: { ...raw?.columnRule, color } })
                }
                tooltip={labels.columnRuleColorTooltip}
                isDefault={isCrColorDefault}
                onReset={() => resetColumnRuleField('color')}
                fieldId="layout-columnRuleColor"
              />
              <DimensionInput
                label={labels.columnRuleLineWidth}
                value={layout.columnRule.lineWidth}
                onChange={(dim: Dimension) =>
                  updateLayout({ columnRule: { ...raw?.columnRule, lineWidth: dim } })
                }
                min={0.1}
                step={0.1}
                tooltip={labels.columnRuleLineWidthTooltip}
                isDefault={isCrLineWidthDefault}
                onReset={() => resetColumnRuleField('lineWidth')}
              />
            </NestedGroup>
          )}
        </NestedGroup>
      )}

      <ToggleSwitch
        label={labels.fitFiguresToPage}
        checked={layout.fitFiguresToPage}
        onChange={(v) => updateLayout({ fitFiguresToPage: v })}
        tooltip={labels.fitFiguresToPageTooltip}
        isDefault={layout.fitFiguresToPage === D.fitFiguresToPage}
        onReset={() => resetField('fitFiguresToPage')}
      />
    </CollapsibleSection>
  );
});
