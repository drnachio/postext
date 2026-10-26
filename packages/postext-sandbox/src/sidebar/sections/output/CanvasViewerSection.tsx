'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { CANVAS_VIEWER_MAX_GAP, DEFAULT_CANVAS_VIEWER_CONFIG, resolveCanvasViewerConfig } from 'postext';
import type { CanvasViewerConfig } from 'postext';
import { CollapsibleSection, NumberInput } from '../../../controls/index.js';

/** The space between the pages in the Canvas (#1002): between the two pages
 *  of a pair, and between one row and the next. Screen pixels; they never
 *  relay the book out. */
export const CanvasViewerSection = memo(function CanvasViewerSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.canvasViewer);
  const canvasViewer = resolveCanvasViewerConfig(raw);
  const D = DEFAULT_CANVAS_VIEWER_CONFIG;

  const update = (partial: Partial<CanvasViewerConfig>) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { canvasViewer: { ...raw, ...partial } } });
  };
  const resetField = (field: keyof CanvasViewerConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    dispatch({ type: 'UPDATE_CONFIG', payload: { canvasViewer: Object.keys(next).length > 0 ? next : undefined } });
  };
  const resetSection = () => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { canvasViewer: undefined } });
  };
  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;

  return (
    <CollapsibleSection
      title={labels.canvasViewerSection}
      sectionId="canvasViewer"
      onReset={resetSection}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <NumberInput
        label={labels.canvasViewerPageGap}
        value={canvasViewer.pageGap}
        onChange={(v) => update({ pageGap: v })}
        min={0}
        max={CANVAS_VIEWER_MAX_GAP}
        step={1}
        tooltip={labels.canvasViewerPageGapTooltip}
        isDefault={canvasViewer.pageGap === D.pageGap}
        onReset={() => resetField('pageGap')}
        suffix="px"
      />
      <NumberInput
        label={labels.canvasViewerRowGap}
        value={canvasViewer.rowGap}
        onChange={(v) => update({ rowGap: v })}
        min={0}
        max={CANVAS_VIEWER_MAX_GAP}
        step={1}
        tooltip={labels.canvasViewerRowGapTooltip}
        isDefault={canvasViewer.rowGap === D.rowGap}
        onReset={() => resetField('rowGap')}
        suffix="px"
      />
    </CollapsibleSection>
  );
});
