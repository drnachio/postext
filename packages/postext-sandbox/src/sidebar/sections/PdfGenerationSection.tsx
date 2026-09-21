'use client';

import { memo } from 'react';
import {
  DEFAULT_PDF_GENERATION_CONFIG,
  resolvePdfGenerationConfig,
} from 'postext';
import type { PdfColorSpace, PdfGenerationConfig } from 'postext';
import {
  useSandboxDispatch,
  useSandboxLabels,
  useSandboxSelector,
} from '../../context/SandboxContext';
import {
  CollapsibleSection,
  NestedGroup,
  SelectInput,
  ToggleSwitch,
} from '../../controls';

const D = DEFAULT_PDF_GENERATION_CONFIG;

export const PdfGenerationSection = memo(function PdfGenerationSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.pdfGeneration);
  const cfg = resolvePdfGenerationConfig(raw);

  const colorSpaceOptions = [
    { value: 'cmyk', label: labels.pdfColorSpaceCmyk },
    { value: 'rgb', label: labels.pdfColorSpaceRgb },
    { value: 'grayscale', label: labels.pdfColorSpaceGrayscale },
  ];

  const update = (partial: Partial<PdfGenerationConfig>) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { pdfGeneration: { ...raw, ...partial } },
    });
  };

  const resetSection = () => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { pdfGeneration: undefined } });
  };

  const resetField = (field: keyof PdfGenerationConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { pdfGeneration: hasKeys ? next : undefined },
    });
  };

  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  const isOutlinesDefault = cfg.outlines === D.outlines;
  const isAccessibleDefault = cfg.accessible === D.accessible;
  const isForceDefault = cfg.forceColorSpace === D.forceColorSpace;
  const isColorSpaceDefault = cfg.colorSpace === D.colorSpace;

  return (
    <CollapsibleSection
      title={labels.pdfGenerationSection}
      sectionId="pdfGeneration"
      onReset={resetSection}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <ToggleSwitch
        label={labels.pdfOutlines}
        checked={cfg.outlines}
        onChange={(v) => update({ outlines: v })}
        tooltip={
          labels.pdfOutlinesTooltip ??
          'Emit PDF outlines (bookmarks) so readers can jump between headings'
        }
        isDefault={isOutlinesDefault}
        onReset={() => resetField('outlines')}
      />

      <ToggleSwitch
        label={labels.pdfAccessible}
        checked={cfg.accessible}
        onChange={(v) => update({ accessible: v })}
        tooltip={
          labels.pdfAccessibleTooltip ??
          'Tag the PDF for assistive technology (PDF/UA): reading order, headings, lists, tables, figure alt text and language'
        }
        isDefault={isAccessibleDefault}
        onReset={() => resetField('accessible')}
      />

      <ToggleSwitch
        label={labels.pdfForceColorSpace}
        checked={cfg.forceColorSpace}
        onChange={(v) => update({ forceColorSpace: v })}
        tooltip={
          labels.pdfForceColorSpaceTooltip ??
          'Convert every colour in the generated PDF to the selected colour space'
        }
        isDefault={isForceDefault}
        onReset={() => resetField('forceColorSpace')}
      />

      {cfg.forceColorSpace && (
        <NestedGroup>
          <SelectInput
            label={labels.pdfColorSpace}
            value={cfg.colorSpace}
            options={colorSpaceOptions}
            onChange={(v) => update({ colorSpace: v as PdfColorSpace })}
            tooltip={
              labels.pdfColorSpaceTooltip ??
              'Target colour space applied to every colour in the PDF'
            }
            isDefault={isColorSpaceDefault}
            onReset={() => resetField('colorSpace')}
          />
        </NestedGroup>
      )}
    </CollapsibleSection>
  );
});
