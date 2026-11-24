'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { resolvePageConfig, PAGE_SIZE_PRESETS, DEFAULT_PAGE_CONFIG, DEFAULT_PAGE_NUMBERING, dimensionsEqual, colorsEqual } from 'postext';
import type { PageConfig, PageNumberingConfig, PageSizePreset, PageNumberFormat, Dimension } from 'postext';
import {
  CollapsibleSection,
  FieldGroup,
  ColorPicker,
  SelectInput,
  DimensionInput,
  NumberInput,
  ToggleSwitch,
  NestedGroup,
} from '../../../controls/index.js';
import { HighlightZone } from '../../settings/previewHighlight.js';
import { PageFormatField } from '../../editors/PageFormatField.js';
import { arabicNumberFormatOptions, eastAsianNumberFormatOptions } from '../../settings/eastAsianOptions.js';
import { gridMarginsText, useCjkGrid } from '../writing/cjkGridReadout.js';

const D = DEFAULT_PAGE_CONFIG;

export const PageSection = memo(function PageSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.page);
  const page = resolvePageConfig(raw);
  // The character grid sets the margins the pages use; the ones here are
  // its minimums.
  const grid = useCjkGrid();
  const uiLocale = useSandboxSelector((s) => s.locale);

  const updatePage = (partial: Partial<PageConfig>) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { page: { ...raw, ...partial } },
    });
  };

  // The baseline grid lives in `page` but is edited under Advanced → Debug,
  // the binding under Writing system: resetting the page leaves them alone.
  const resetPage = () => {
    const kept: PageConfig = {};
    if (raw?.baselineGrid) kept.baselineGrid = raw.baselineGrid;
    if (raw?.binding !== undefined) kept.binding = raw.binding;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { page: Object.keys(kept).length > 0 ? kept : undefined },
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

  const resetMargin = (side: 'top' | 'bottom' | 'left' | 'right' | 'mirror') => {
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


  const handlePresetChange = (preset: PageSizePreset) => {
    if (preset === 'custom') {
      updatePage({ sizePreset: 'custom' });
    } else {
      const key = preset;
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
  const hasOverrides = raw !== undefined && Object.keys(raw).some((k) => k !== 'baselineGrid' && k !== 'binding');
  const isBgDefault = colorsEqual(page.backgroundColor, D.backgroundColor);
  const isPresetDefault = page.sizePreset === D.sizePreset;
  const isWidthDefault = dimensionsEqual(page.width, D.width);
  const isHeightDefault = dimensionsEqual(page.height, D.height);
  const isMarginTopDefault = dimensionsEqual(page.margins.top, D.margins.top);
  const isMarginBottomDefault = dimensionsEqual(page.margins.bottom, D.margins.bottom);
  const isMarginLeftDefault = dimensionsEqual(page.margins.left, D.margins.left);
  const isMarginRightDefault = dimensionsEqual(page.margins.right, D.margins.right);
  const marginsMirror = page.margins.mirror ?? false;
  const isMarginsMirrorDefault = marginsMirror === (D.margins.mirror ?? false);
  const isDpiDefault = page.dpi === D.dpi;
  const isNumberingFormatDefault = page.pageNumbering.format === DEFAULT_PAGE_NUMBERING.format;
  const isNumberingStartAtDefault = page.pageNumbering.startAt === DEFAULT_PAGE_NUMBERING.startAt;

  const PAGE_NUMBER_FORMAT_OPTIONS = [
    { value: 'decimal', label: labels.pageNumberingFormatDecimal },
    { value: 'lower-roman', label: labels.pageNumberingFormatLowerRoman },
    { value: 'upper-roman', label: labels.pageNumberingFormatUpperRoman },
    { value: 'lower-alpha', label: labels.pageNumberingFormatLowerAlpha },
    { value: 'upper-alpha', label: labels.pageNumberingFormatUpperAlpha },
    ...eastAsianNumberFormatOptions(labels),
    ...arabicNumberFormatOptions(labels),
  ];

  const sizeReset = () => {
    if (!raw) return;
    const next = { ...raw };
    delete next.sizePreset;
    delete next.width;
    delete next.height;
    dispatch({ type: 'UPDATE_CONFIG', payload: { page: Object.keys(next).length > 0 ? next : undefined } });
  };

  return (
    <CollapsibleSection
      title={labels.page}
      sectionId="page"
      onReset={resetPage}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <FieldGroup title={labels.pageGroupSize}>
        <PageFormatField
          value={page.sizePreset}
          onChange={handlePresetChange}
          isDefault={isPresetDefault}
          onReset={sizeReset}
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
        {/* The layout's px per inch: not the resolution of pictures (the
            print section's preflight checks that). */}
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
      </FieldGroup>

      <FieldGroup title={labels.pageGroupMargins}>
        <ToggleSwitch
          label={labels.pageMarginsMirror}
          checked={marginsMirror}
          onChange={(v) => updatePage({ margins: { ...raw?.margins, mirror: v } })}
          tooltip={labels.pageMarginsMirrorTooltip}
          isDefault={isMarginsMirrorDefault}
          onReset={() => resetMargin('mirror')}
        />
        <HighlightZone part="top">
          <DimensionInput
            label={labels.marginTop}
            value={page.margins.top}
            onChange={(dim) => handleMarginChange('top', dim)}
            min={0}
            tooltip={labels.marginsTooltip}
            isDefault={isMarginTopDefault}
            onReset={() => resetMargin('top')}
          />
        </HighlightZone>
        <HighlightZone part="bottom">
          <DimensionInput
            label={labels.marginBottom}
            value={page.margins.bottom}
            onChange={(dim) => handleMarginChange('bottom', dim)}
            min={0}
            tooltip={labels.marginsTooltip}
            isDefault={isMarginBottomDefault}
            onReset={() => resetMargin('bottom')}
          />
        </HighlightZone>
        <HighlightZone part="inner">
          <DimensionInput
            label={marginsMirror ? labels.pageMarginsInner : labels.marginLeft}
            value={page.margins.left}
            onChange={(dim) => handleMarginChange('left', dim)}
            min={0}
            tooltip={marginsMirror ? labels.pageMarginsInnerTooltip : labels.marginsTooltip}
            isDefault={isMarginLeftDefault}
            onReset={() => resetMargin('left')}
          />
        </HighlightZone>
        <HighlightZone part="outer">
          <DimensionInput
            label={marginsMirror ? labels.pageMarginsOuter : labels.marginRight}
            value={page.margins.right}
            onChange={(dim) => handleMarginChange('right', dim)}
            min={0}
            tooltip={marginsMirror ? labels.pageMarginsOuterTooltip : labels.marginsTooltip}
            isDefault={isMarginRightDefault}
            onReset={() => resetMargin('right')}
          />
        </HighlightZone>
        {grid && (
          <p className="mt-1 text-[0.66rem] leading-[1.35] text-(--slate) [text-wrap:pretty]">
            {gridMarginsText(labels.pageMarginsFromGrid, grid, uiLocale)}
          </p>
        )}
      </FieldGroup>

      <FieldGroup title={labels.pageGroupPaper}>
        <ColorPicker
          label={labels.pageBackgroundColor}
          value={page.backgroundColor}
          onChange={(color) => updatePage({ backgroundColor: color })}
          tooltip={labels.pageBackgroundColorTooltip}
          isDefault={isBgDefault}
          onReset={() => resetField('backgroundColor')}
          fieldId="page-backgroundColor"
        />
      </FieldGroup>

      <CollapsibleSection
        title={labels.pageNumbering}
        sectionId="page-numbering"
        variant="subsection"
      >
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
          max={9999}
          step={1}
          tooltip={labels.pageNumberingStartAtTooltip}
          isDefault={isNumberingStartAtDefault}
          onReset={() => resetPageNumberingField('startAt')}
        />
      </CollapsibleSection>

    </CollapsibleSection>
  );
});
