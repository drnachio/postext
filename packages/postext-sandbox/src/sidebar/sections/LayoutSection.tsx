'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector, useSandboxStateGetter } from '../../context/SandboxContext';
import { resolveLayoutConfig, resolveBodyTextConfig, DEFAULT_LAYOUT_CONFIG, DEFAULT_COLUMN_RULE, dimensionsEqual, colorsEqual } from 'postext';
import type { LayoutConfig, Dimension, ColorValue, FloatShrinkMode, TextWrapConfig } from 'postext';
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
import { MULTIPLE_COLUMNS_MAX, MULTIPLE_COLUMNS_MIN } from '../settings/multipleColumns';
import { flowSideLabels, useRightToLeftFlow } from '../settings/flowSides';
import { applyFileResolutions, readFileResolutions } from '../../panels/resources/fileResolutions';

const D = DEFAULT_LAYOUT_CONFIG;

export const LayoutSection = memo(function LayoutSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.layout);
  const layout = resolveLayoutConfig(raw);
  const getState = useSandboxStateGetter();

  const updateLayout = (partial: Partial<LayoutConfig>) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { layout: { ...raw, ...partial } },
    });
  };

  // The writing mode lives in `layout` but is edited under Writing system:
  // resetting the columns leaves it alone.
  const resetLayout = () => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { layout: raw?.writingMode !== undefined ? { writingMode: raw.writingMode } : undefined },
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

  const resetFloatShrinkField = (field: 'mode' | 'minScale') => {
    if (!raw?.floatShrink) return;
    const next = { ...raw.floatShrink };
    delete next[field];
    if (Object.keys(next).length > 0) updateLayout({ floatShrink: next });
    else resetField('floatShrink');
  };

  const resetWrapField = (field: keyof TextWrapConfig) => {
    if (!raw?.wrap) return;
    const next = { ...raw.wrap };
    delete next[field];
    if (Object.keys(next).length > 0) updateLayout({ wrap: next });
    else resetField('wrap');
  };
  // The wrap gap's default: one body line (#627).
  const bodyText = useSandboxSelector((s) => s.config.bodyText);
  const bodyLine = resolveBodyTextConfig(bodyText).lineHeight;

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
      delete next.columnCount;
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
    { value: 'multiple', label: labels.layoutMultiple, description: labels.layoutMultipleDescription, picture: <ColumnsPicture kind="multiple" /> },
  ];

  const hasOverrides = raw !== undefined && Object.keys(raw).some((k) => k !== 'writingMode');
  const isTypeDefault = layout.layoutType === D.layoutType;
  const isGutterDefault = dimensionsEqual(layout.gutterWidth, D.gutterWidth);
  const isSideColDefault = layout.sideColumnPercent === D.sideColumnPercent;
  const isSideRoleDefault = layout.sideColumnRole === D.sideColumnRole;
  const isSideSideDefault = layout.sideColumnSide === D.sideColumnSide;
  const SIDE_ROLE_OPTIONS = [
    { value: 'text', label: labels.sideColumnRoleText },
    { value: 'floats', label: labels.sideColumnRoleFloats },
  ];
  const columnSide = flowSideLabels(useRightToLeftFlow(), labels.sideColumnSideLeft, labels.sideColumnSideRight);
  const SIDE_SIDE_OPTIONS = [
    { value: 'right', label: columnSide.right },
    { value: 'left', label: columnSide.left },
    { value: 'outer', label: labels.sideColumnSideOuter },
    { value: 'inner', label: labels.sideColumnSideInner },
  ];
  const INLINE_GAP_OPTIONS = [
    { value: 'around', label: labels.inlineResourceGapAround },
    { value: 'above', label: labels.inlineResourceGapAbove },
  ];
  const isCrEnabledDefault = layout.columnRule.enabled === DEFAULT_COLUMN_RULE.enabled;
  const isCrColorDefault = colorsEqual(layout.columnRule.color, DEFAULT_COLUMN_RULE.color);
  const isCrLineWidthDefault = dimensionsEqual(layout.columnRule.lineWidth, DEFAULT_COLUMN_RULE.lineWidth);

  const showGutter = layout.layoutType !== 'single';
  const showColumnCount = layout.layoutType === 'multiple';
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
          delete next.columnCount;
          delete next.sideColumnPercent;
          delete next.sideColumnRole;
          delete next.sideColumnSide;
          delete next.columnRule;
          dispatch({ type: 'UPDATE_CONFIG', payload: { layout: Object.keys(next).length > 0 ? next : undefined } });
        }}
      />

      {(showGutter || showSideCol) && (
        <NestedGroup>
          {showColumnCount && (
            <NumberInput
              label={labels.columnCount}
              value={layout.columnCount}
              onChange={(v) => updateLayout({ columnCount: v })}
              min={MULTIPLE_COLUMNS_MIN}
              max={MULTIPLE_COLUMNS_MAX}
              step={1}
              tooltip={labels.columnCountTooltip}
              isDefault={layout.columnCount === D.columnCount}
              onReset={() => resetField('columnCount')}
            />
          )}
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
      {/* How a bitmap without a resolution of its own takes its print
          size (#631): its pixels at the page dpi, the resolution its file
          states, or a fixed ppi. */}
      <SelectInput
        label={labels.bitmapResolution}
        value={typeof layout.bitmapResolution === 'number' ? 'fixed' : layout.bitmapResolution}
        options={[
          { value: 'document', label: labels.bitmapResolutionDocument },
          { value: 'file', label: labels.bitmapResolutionFile },
          { value: 'fixed', label: labels.bitmapResolutionFixed },
        ]}
        onChange={(v) => {
          if (v === 'fixed') {
            updateLayout({ bitmapResolution: 300 });
          } else if (v === 'file') {
            updateLayout({ bitmapResolution: 'file' });
            // Bitmaps stored before their file's resolution was kept.
            void readFileResolutions(getState().resources).then((found) => {
              const next = found.size > 0 ? applyFileResolutions(getState().resources, found) : null;
              if (next) dispatch({ type: 'SET_RESOURCES', payload: next });
            });
          } else {
            resetField('bitmapResolution');
          }
        }}
        tooltip={labels.bitmapResolutionTooltip}
        isDefault={layout.bitmapResolution === D.bitmapResolution}
        onReset={() => resetField('bitmapResolution')}
      />
      {typeof layout.bitmapResolution === 'number' && (
        <NestedGroup>
          <NumberInput
            label={labels.bitmapResolutionPpi}
            value={layout.bitmapResolution}
            onChange={(v) => updateLayout({ bitmapResolution: Math.max(1, v) })}
            min={1}
            max={4800}
            step={1}
            suffix="ppi"
            tooltip={labels.bitmapResolutionPpiTooltip}
            isDefault={false}
            onReset={() => resetField('bitmapResolution')}
          />
        </NestedGroup>
      )}
      {/* Floated pictures scaled to the room of their slot (#626): the
          default a resource type or a resource may override. */}
      <SelectInput
        label={labels.floatShrink}
        value={layout.floatShrink.mode}
        options={[
          { value: 'never', label: labels.resourceShrinkNever },
          { value: 'page', label: labels.resourceShrinkPage },
          { value: 'slot', label: labels.resourceShrinkSlot },
        ]}
        onChange={(v) => updateLayout({ floatShrink: { ...raw?.floatShrink, mode: v as FloatShrinkMode } })}
        tooltip={labels.floatShrinkTooltip}
        isDefault={layout.floatShrink.mode === D.floatShrink.mode}
        onReset={() => resetFloatShrinkField('mode')}
      />
      {layout.floatShrink.mode !== 'never' && (
        <NestedGroup>
          <NumberInput
            label={labels.floatShrinkMinScale}
            value={Math.round(layout.floatShrink.minScale * 100)}
            onChange={(v) => updateLayout({ floatShrink: { ...raw?.floatShrink, minScale: Math.min(100, Math.max(5, v)) / 100 } })}
            min={5}
            max={100}
            step={5}
            suffix="%"
            tooltip={labels.floatShrinkMinScaleTooltip}
            isDefault={layout.floatShrink.minScale === D.floatShrink.minScale}
            onReset={() => resetFloatShrinkField('minScale')}
          />
        </NestedGroup>
      )}
      {/* Text wrap round pictures and boxes (#627): the defaults a
          resource, a resource type or a box may set aside. */}
      <DimensionInput
        label={labels.textWrapGap}
        value={layout.wrap.gap ?? bodyLine}
        onChange={(v) => updateLayout({ wrap: { ...raw?.wrap, gap: v } })}
        units={['pt', 'mm', 'em']}
        tooltip={labels.textWrapGapTooltip}
        isDefault={raw?.wrap?.gap === undefined}
        onReset={() => resetWrapField('gap')}
      />
      <NestedGroup>
        {typeof layout.wrap.minTextWidth === 'number' ? (
          <NumberInput
            label={labels.textWrapMinTextWidth}
            value={Math.round(layout.wrap.minTextWidth * 100)}
            onChange={(v) => updateLayout({ wrap: { ...raw?.wrap, minTextWidth: Math.min(100, Math.max(1, v)) / 100 } })}
            min={1}
            max={100}
            step={5}
            suffix="%"
            tooltip={labels.textWrapMinTextWidthTooltip}
            isDefault={raw?.wrap?.minTextWidth === undefined}
            onReset={() => resetWrapField('minTextWidth')}
          />
        ) : (
          <DimensionInput
            label={labels.textWrapMinTextWidth}
            value={layout.wrap.minTextWidth}
            onChange={(v) => updateLayout({ wrap: { ...raw?.wrap, minTextWidth: v } })}
            units={['em', 'mm', 'pt']}
            tooltip={labels.textWrapMinTextWidthTooltip}
            isDefault={raw?.wrap?.minTextWidth === undefined}
            onReset={() => resetWrapField('minTextWidth')}
          />
        )}
        <NumberInput
          label={labels.textWrapMinLinesBeside}
          value={layout.wrap.minLinesBeside}
          onChange={(v) => updateLayout({ wrap: { ...raw?.wrap, minLinesBeside: Math.max(1, Math.round(v)) } })}
          min={1}
          max={10}
          step={1}
          tooltip={labels.textWrapMinLinesBesideTooltip}
          isDefault={layout.wrap.minLinesBeside === D.wrap.minLinesBeside}
          onReset={() => resetWrapField('minLinesBeside')}
        />
        <NumberInput
          label={labels.textWrapDefaultWidth}
          value={Math.round(layout.wrap.defaultWidth * 100)}
          onChange={(v) => updateLayout({ wrap: { ...raw?.wrap, defaultWidth: Math.min(95, Math.max(5, v)) / 100 } })}
          min={5}
          max={95}
          step={5}
          suffix="%"
          tooltip={labels.textWrapDefaultWidthTooltip}
          isDefault={layout.wrap.defaultWidth === D.wrap.defaultWidth}
          onReset={() => resetWrapField('defaultWidth')}
        />
      </NestedGroup>
      <SelectInput
        label={labels.inlineResourceGap}
        value={layout.inlineResourceGap}
        options={INLINE_GAP_OPTIONS}
        onChange={(v) => updateLayout({ inlineResourceGap: v as LayoutConfig['inlineResourceGap'] })}
        tooltip={labels.inlineResourceGapTooltip}
        isDefault={layout.inlineResourceGap === D.inlineResourceGap}
        onReset={() => resetField('inlineResourceGap')}
      />
      <ToggleSwitch
        label={labels.inlineResourceGapInBoxes}
        checked={layout.inlineResourceGapInBoxes}
        onChange={(v) => updateLayout({ inlineResourceGapInBoxes: v })}
        tooltip={labels.inlineResourceGapInBoxesTooltip}
        isDefault={layout.inlineResourceGapInBoxes === D.inlineResourceGapInBoxes}
        onReset={() => resetField('inlineResourceGapInBoxes')}
      />
      <NumberInput
        label={labels.boxChildSplitMinLines}
        value={layout.boxChildSplitMinLines}
        onChange={(v) => updateLayout({ boxChildSplitMinLines: v })}
        min={1}
        max={6}
        step={1}
        tooltip={labels.boxChildSplitMinLinesTooltip}
        isDefault={layout.boxChildSplitMinLines === D.boxChildSplitMinLines}
        onReset={() => resetField('boxChildSplitMinLines')}
      />
      <ToggleSwitch
        label={labels.hugClosingFloats}
        checked={layout.hugClosingFloats}
        onChange={(v) => updateLayout({ hugClosingFloats: v })}
        tooltip={labels.hugClosingFloatsTooltip}
        isDefault={layout.hugClosingFloats === D.hugClosingFloats}
        onReset={() => resetField('hugClosingFloats')}
      />
    </CollapsibleSection>
  );
});
