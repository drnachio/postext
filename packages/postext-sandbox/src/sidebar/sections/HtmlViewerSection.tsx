'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import {
  resolveHtmlViewerConfig,
  DEFAULT_HTML_VIEWER_CONFIG,
} from 'postext';
import type { HtmlViewerConfig } from 'postext';
import {
  CollapsibleSection,
  NumberInput,
  ToggleSwitch,
} from '../../controls';

export const HtmlViewerSection = memo(function HtmlViewerSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const rawHtmlViewer = useSandboxSelector((s) => s.config.htmlViewer);
  const htmlViewer = resolveHtmlViewerConfig(rawHtmlViewer);

  const updateHtmlViewer = (partial: Partial<HtmlViewerConfig>) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { htmlViewer: { ...rawHtmlViewer, ...partial } },
    });
  };

  const resetField = (field: keyof HtmlViewerConfig) => {
    if (!rawHtmlViewer) return;
    const next = { ...rawHtmlViewer };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { htmlViewer: hasKeys ? next : undefined },
    });
  };

  const resetSection = () => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { htmlViewer: undefined } });
  };

  const D = DEFAULT_HTML_VIEWER_CONFIG;
  const isMaxCharsDefault = htmlViewer.maxCharsPerLine === D.maxCharsPerLine;
  const isColumnGapDefault = htmlViewer.columnGap === D.columnGap;
  const isOptimalLineBreakingDefault =
    htmlViewer.optimalLineBreaking === D.optimalLineBreaking;

  const hasOverrides =
    rawHtmlViewer !== undefined && Object.keys(rawHtmlViewer).length > 0;

  return (
    <CollapsibleSection
      title={labels.htmlViewer}
      sectionId="htmlViewer"
      onReset={resetSection}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <NumberInput
        label={labels.htmlViewerMaxCharsPerLine}
        value={htmlViewer.maxCharsPerLine}
        onChange={(v) => updateHtmlViewer({ maxCharsPerLine: v })}
        min={20}
        max={200}
        step={1}
        tooltip={labels.htmlViewerMaxCharsPerLineTooltip}
        isDefault={isMaxCharsDefault}
        onReset={() => resetField('maxCharsPerLine')}
      />
      <NumberInput
        label={labels.htmlViewerColumnGap}
        value={htmlViewer.columnGap}
        onChange={(v) => updateHtmlViewer({ columnGap: v })}
        min={0}
        max={200}
        step={1}
        tooltip={labels.htmlViewerColumnGapTooltip}
        isDefault={isColumnGapDefault}
        onReset={() => resetField('columnGap')}
        suffix="px"
      />
      <ToggleSwitch
        label={labels.htmlViewerOptimalLineBreaking}
        checked={htmlViewer.optimalLineBreaking}
        onChange={(checked) =>
          updateHtmlViewer({ optimalLineBreaking: checked })
        }
        tooltip={labels.htmlViewerOptimalLineBreakingTooltip}
        isDefault={isOptimalLineBreakingDefault}
        onReset={() => resetField('optimalLineBreaking')}
      />
    </CollapsibleSection>
  );
});
