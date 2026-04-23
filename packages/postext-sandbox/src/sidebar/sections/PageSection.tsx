'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { resolvePageConfig, PAGE_SIZE_PRESETS, DEFAULT_PAGE_CONFIG, DEFAULT_CUT_LINES, DEFAULT_PAGE_NUMBERING, dimensionsEqual, colorsEqual } from 'postext';
import type { PageConfig, PageNumberingConfig, PageSizePreset, PageNumberFormat, Dimension } from 'postext';
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

export const PageSection = memo(function PageSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.page);
  const page = resolvePageConfig(raw);

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

  const updatePageNumbering = (partial: Partial<PageNumberingConfig>) => {
    updatePage({ pageNumbering: { ...raw?.pageNumbering, ...partial } });
  };

  const resetPageNumberingField = (field: keyof PageNumberingConfig) => {
    if (!raw?.pageNumbering) return;
    const next = { ...raw.pageNumbering };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    if (hasKeys) {
      updatePage({ pageNumbering: next });
    } else {
      const r = { ...raw };
      delete r.pageNumbering;
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
  const isNumberingFormatDefault = page.pageNumbering.format === DEFAULT_PAGE_NUMBERING.format;
  const isNumberingStartAtDefault = page.pageNumbering.startAt === DEFAULT_PAGE_NUMBERING.startAt;

  const PAGE_NUMBER_FORMAT_OPTIONS = [
    { value: 'decimal', label: labels.pageNumberingFormatDecimal },
    { value: 'lower-roman', label: labels.pageNumberingFormatLowerRoman },
    { value: 'upper-roman', label: labels.pageNumberingFormatUpperRoman },
    { value: 'lower-alpha', label: labels.pageNumberingFormatLowerAlpha },
    { value: 'upper-alpha', label: labels.pageNumberingFormatUpperAlpha },
  ];

  return (
    <CollapsibleSection
      title={labels.page}
      sectionId="page"
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

      <CollapsibleSection
        title={labels.pageNumbering}
        sectionId="page-numbering"
        variant="subsection"
      >
        <NestedGroup>
          <SelectInput
            label={labels.pageNumberingFormat}
            value={page.pageNumbering.format}
            options={PAGE_NUMBER_FORMAT_OPTIONS}
            onChange={(v) => updatePageNumbering({ format: v as PageNumberFormat })}
            tooltip={labels.pageNumberingFormatTooltip}
            isDefault={isNumberingFormatDefault}
            onReset={() => resetPageNumberingField('format')}
          />
          <NumberInput
            label={labels.pageNumberingStartAt}
            value={page.pageNumbering.startAt}
            onChange={(v) => updatePageNumbering({ startAt: v })}
            min={1}
            step={1}
            tooltip={labels.pageNumberingStartAtTooltip}
            isDefault={isNumberingStartAtDefault}
            onReset={() => resetPageNumberingField('startAt')}
          />
        </NestedGroup>
      </CollapsibleSection>

    </CollapsibleSection>
  );
});
