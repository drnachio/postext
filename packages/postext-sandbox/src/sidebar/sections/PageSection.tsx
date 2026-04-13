'use client';

import { useSandbox } from '../../context/SandboxContext';
import { resolvePageConfig, PAGE_SIZE_PRESETS, DEFAULT_PAGE_CONFIG, DEFAULT_CUT_LINES, dimensionsEqual, colorsEqual } from 'postext';
import type { PageConfig, PageSizePreset, Dimension } from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  SelectInput,
  DimensionInput,
  NumberInput,
  ToggleSwitch,
  NestedGroup,
} from '../../controls';

const PAGE_SIZE_OPTIONS = [
  { value: '11x17', label: '11 \u00d7 17 cm' },
  { value: '12x19', label: '12 \u00d7 19 cm' },
  { value: '17x24', label: '17 \u00d7 24 cm' },
  { value: '21x28', label: '21 \u00d7 28 cm' },
  { value: 'custom', label: 'Custom' },
];

const D = DEFAULT_PAGE_CONFIG;

export function PageSection() {
  const { state, dispatch } = useSandbox();
  const raw = state.config.page;
  const page = resolvePageConfig(raw);
  const { labels } = state;

  const updatePage = (partial: Partial<PageConfig>) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { page: { ...raw, ...partial } },
    });
  };

  const resetPage = () => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { page: undefined },
    });
  };

  const resetField = (field: keyof PageConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { page: hasKeys ? next : undefined },
    });
  };

  const resetMargin = (side: 'top' | 'bottom' | 'left' | 'right') => {
    if (!raw?.margins) return;
    const next = { ...raw.margins };
    delete next[side];
    const hasOverrides = Object.keys(next).length > 0;
    if (hasOverrides) {
      updatePage({ margins: next });
    } else {
      const r = { ...raw };
      delete r.margins;
      dispatch({ type: 'UPDATE_CONFIG', payload: { page: Object.keys(r).length > 0 ? r : undefined } });
    }
  };

  const resetCutLinesField = (field: 'enabled' | 'bleed' | 'markLength' | 'markOffset' | 'markWidth' | 'color') => {
    if (!raw?.cutLines || typeof raw.cutLines === 'boolean') return;
    const next = { ...raw.cutLines };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    if (hasKeys) {
      updatePage({ cutLines: next });
    } else {
      const r = { ...raw };
      delete r.cutLines;
      dispatch({ type: 'UPDATE_CONFIG', payload: { page: Object.keys(r).length > 0 ? r : undefined } });
    }
  };

  const resetBaselineGridField = (field: 'enabled' | 'color' | 'lineWidth') => {
    if (!raw?.baselineGrid) return;
    const next = { ...raw.baselineGrid };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    if (hasKeys) {
      updatePage({ baselineGrid: next });
    } else {
      const r = { ...raw };
      delete r.baselineGrid;
      dispatch({ type: 'UPDATE_CONFIG', payload: { page: Object.keys(r).length > 0 ? r : undefined } });
    }
  };

  const handlePresetChange = (preset: string) => {
    if (preset === 'custom') {
      updatePage({ sizePreset: 'custom' });
    } else {
      const key = preset as Exclude<PageSizePreset, 'custom'>;
      const size = PAGE_SIZE_PRESETS[key];
      updatePage({
        sizePreset: key,
        width: size.width,
        height: size.height,
      });
    }
  };

  const handleMarginChange = (side: 'top' | 'bottom' | 'left' | 'right', dim: Dimension) => {
    updatePage({
      margins: { ...raw?.margins, [side]: dim },
    });
  };

  // Check which fields differ from defaults
  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  const isBgDefault = colorsEqual(page.backgroundColor, D.backgroundColor);
  const isPresetDefault = page.sizePreset === D.sizePreset;
  const isWidthDefault = dimensionsEqual(page.width, D.width);
  const isHeightDefault = dimensionsEqual(page.height, D.height);
  const isMarginTopDefault = dimensionsEqual(page.margins.top, D.margins.top);
  const isMarginBottomDefault = dimensionsEqual(page.margins.bottom, D.margins.bottom);
  const isMarginLeftDefault = dimensionsEqual(page.margins.left, D.margins.left);
  const isMarginRightDefault = dimensionsEqual(page.margins.right, D.margins.right);
  const isDpiDefault = page.dpi === D.dpi;
  const isCutLinesEnabledDefault = page.cutLines.enabled === D.cutLines.enabled;
  const isCutLinesBleedDefault = dimensionsEqual(page.cutLines.bleed, DEFAULT_CUT_LINES.bleed);
  const isCutLinesMarkLengthDefault = dimensionsEqual(page.cutLines.markLength, DEFAULT_CUT_LINES.markLength);
  const isCutLinesMarkOffsetDefault = dimensionsEqual(page.cutLines.markOffset, DEFAULT_CUT_LINES.markOffset);
  const isCutLinesMarkWidthDefault = dimensionsEqual(page.cutLines.markWidth, DEFAULT_CUT_LINES.markWidth);
  const isCutLinesColorDefault = colorsEqual(page.cutLines.color, DEFAULT_CUT_LINES.color);
  const isGridEnabledDefault = page.baselineGrid.enabled === D.baselineGrid.enabled;
  const isGridColorDefault = colorsEqual(page.baselineGrid.color, D.baselineGrid.color);
  const isGridLineWidthDefault = dimensionsEqual(page.baselineGrid.lineWidth, D.baselineGrid.lineWidth);

  return (
    <CollapsibleSection
      title={labels.page}
      sectionId="page"
      defaultOpen
      onReset={resetPage}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <ColorPicker
        label={labels.pageBackgroundColor}
        value={page.backgroundColor}
        onChange={(color) => updatePage({ backgroundColor: color })}
        tooltip={labels.pageBackgroundColorTooltip}
        isDefault={isBgDefault}
        onReset={() => resetField('backgroundColor')}
        fieldId="page-backgroundColor"
      />

      <SelectInput
        label={labels.pageSize}
        value={page.sizePreset}
        options={PAGE_SIZE_OPTIONS.map((o) => ({
          ...o,
          label: o.value === 'custom' ? labels.custom : o.label,
        }))}
        onChange={handlePresetChange}
        tooltip={labels.pageSizeTooltip}
        isDefault={isPresetDefault}
        onReset={() => {
          if (!raw) return;
          const next = { ...raw };
          delete next.sizePreset;
          delete next.width;
          delete next.height;
          dispatch({ type: 'UPDATE_CONFIG', payload: { page: Object.keys(next).length > 0 ? next : undefined } });
        }}
      />

      {page.sizePreset === 'custom' && (
        <NestedGroup>
          <DimensionInput
            label={labels.width}
            value={page.width}
            onChange={(dim) => updatePage({ width: dim })}
            min={1}
            tooltip={labels.widthTooltip}
            isDefault={isWidthDefault}
            onReset={() => resetField('width')}
          />
          <DimensionInput
            label={labels.height}
            value={page.height}
            onChange={(dim) => updatePage({ height: dim })}
            min={1}
            tooltip={labels.heightTooltip}
            isDefault={isHeightDefault}
            onReset={() => resetField('height')}
          />
        </NestedGroup>
      )}

      <DimensionInput
        label={labels.marginTop}
        value={page.margins.top}
        onChange={(dim) => handleMarginChange('top', dim)}
        min={0}
        tooltip={labels.marginsTooltip}
        isDefault={isMarginTopDefault}
        onReset={() => resetMargin('top')}
      />
      <DimensionInput
        label={labels.marginBottom}
        value={page.margins.bottom}
        onChange={(dim) => handleMarginChange('bottom', dim)}
        min={0}
        tooltip={labels.marginsTooltip}
        isDefault={isMarginBottomDefault}
        onReset={() => resetMargin('bottom')}
      />
      <DimensionInput
        label={labels.marginLeft}
        value={page.margins.left}
        onChange={(dim) => handleMarginChange('left', dim)}
        min={0}
        tooltip={labels.marginsTooltip}
        isDefault={isMarginLeftDefault}
        onReset={() => resetMargin('left')}
      />
      <DimensionInput
        label={labels.marginRight}
        value={page.margins.right}
        onChange={(dim) => handleMarginChange('right', dim)}
        min={0}
        tooltip={labels.marginsTooltip}
        isDefault={isMarginRightDefault}
        onReset={() => resetMargin('right')}
      />

      <NumberInput
        label={labels.dpi}
        value={page.dpi}
        onChange={(v) => updatePage({ dpi: v })}
        min={72}
        max={1200}
        step={1}
        tooltip={labels.dpiTooltip}
        isDefault={isDpiDefault}
        onReset={() => resetField('dpi')}
      />

      <ToggleSwitch
        label={labels.cutLines}
        checked={page.cutLines.enabled}
        onChange={(v) =>
          updatePage({ cutLines: { ...page.cutLines, enabled: v } })
        }
        tooltip={labels.cutLinesTooltip}
        isDefault={isCutLinesEnabledDefault}
        onReset={() => resetCutLinesField('enabled')}
      />

      {page.cutLines.enabled && (
        <NestedGroup>
          <DimensionInput
            label={labels.cutLinesBleed}
            value={page.cutLines.bleed}
            onChange={(dim) =>
              updatePage({ cutLines: { ...page.cutLines, bleed: dim } })
            }
            min={0}
            step={0.5}
            tooltip={labels.cutLinesBleedTooltip}
            isDefault={isCutLinesBleedDefault}
            onReset={() => resetCutLinesField('bleed')}
          />
          <DimensionInput
            label={labels.cutLinesMarkLength}
            value={page.cutLines.markLength}
            onChange={(dim) =>
              updatePage({ cutLines: { ...page.cutLines, markLength: dim } })
            }
            min={0}
            step={0.5}
            tooltip={labels.cutLinesMarkLengthTooltip}
            isDefault={isCutLinesMarkLengthDefault}
            onReset={() => resetCutLinesField('markLength')}
          />
          <DimensionInput
            label={labels.cutLinesMarkOffset}
            value={page.cutLines.markOffset}
            onChange={(dim) =>
              updatePage({ cutLines: { ...page.cutLines, markOffset: dim } })
            }
            min={0}
            step={0.5}
            tooltip={labels.cutLinesMarkOffsetTooltip}
            isDefault={isCutLinesMarkOffsetDefault}
            onReset={() => resetCutLinesField('markOffset')}
          />
          <DimensionInput
            label={labels.cutLinesMarkWidth}
            value={page.cutLines.markWidth}
            onChange={(dim) =>
              updatePage({ cutLines: { ...page.cutLines, markWidth: dim } })
            }
            min={0.1}
            step={0.05}
            tooltip={labels.cutLinesMarkWidthTooltip}
            isDefault={isCutLinesMarkWidthDefault}
            onReset={() => resetCutLinesField('markWidth')}
          />
          <ColorPicker
            label={labels.cutLinesColor}
            value={page.cutLines.color}
            onChange={(color) =>
              updatePage({ cutLines: { ...page.cutLines, color } })
            }
            tooltip={labels.cutLinesColorTooltip}
            isDefault={isCutLinesColorDefault}
            onReset={() => resetCutLinesField('color')}
            fieldId="page-cutLinesColor"
          />
        </NestedGroup>
      )}

      <ToggleSwitch
        label={labels.baselineGrid}
        checked={page.baselineGrid.enabled}
        onChange={(v) =>
          updatePage({ baselineGrid: { ...page.baselineGrid, enabled: v } })
        }
        tooltip={labels.baselineGridTooltip}
        isDefault={isGridEnabledDefault}
        onReset={() => resetBaselineGridField('enabled')}
      />

      {page.baselineGrid.enabled && (
        <NestedGroup>
          <ColorPicker
            label={labels.baselineGridColor}
            value={page.baselineGrid.color}
            onChange={(color) =>
              updatePage({ baselineGrid: { ...page.baselineGrid, color } })
            }
            tooltip={labels.baselineGridColorTooltip}
            isDefault={isGridColorDefault}
            onReset={() => resetBaselineGridField('color')}
            fieldId="page-baselineGridColor"
          />
          <DimensionInput
            label={labels.baselineGridLineWidth}
            value={page.baselineGrid.lineWidth}
            onChange={(dim) =>
              updatePage({ baselineGrid: { ...page.baselineGrid, lineWidth: dim } })
            }
            min={0.1}
            step={0.1}
            tooltip={labels.baselineGridLineWidthTooltip}
            isDefault={isGridLineWidthDefault}
            onReset={() => resetBaselineGridField('lineWidth')}
          />
        </NestedGroup>
      )}
    </CollapsibleSection>
  );
}
