'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { resolveDiagramStyleConfig } from 'postext';
import type { DiagramStyleConfig } from 'postext';
import { CollapsibleSection, ColorPicker, ToggleSwitch } from '../../controls';

/** Config-panel section for SVG diagram reproduction: the single-ink toggle
 *  plus the ink colour, which defaults to the palette's main colour so
 *  single-ink printing works out of the box. */
export const DiagramStyleSection = memo(function DiagramStyleSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.diagramStyle);
  const ds = resolveDiagramStyleConfig(raw);

  const update = (partial: Partial<DiagramStyleConfig>) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { diagramStyle: { ...raw, ...partial } } });
  };
  const resetSection = () => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { diagramStyle: undefined } });
  };
  const resetField = (field: keyof DiagramStyleConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { diagramStyle: Object.keys(next).length > 0 ? next : undefined },
    });
  };
  const unset = (field: keyof DiagramStyleConfig) => raw?.[field] === undefined;

  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;

  return (
    <CollapsibleSection
      title={labels.diagramStyleSection}
      sectionId="diagramStyle"
      onReset={resetSection}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <ToggleSwitch
        label={labels.diagramSingleInk}
        checked={ds.singleInk}
        onChange={(v) => update({ singleInk: v })}
        tooltip={labels.diagramSingleInkTooltip}
        isDefault={unset('singleInk')}
        onReset={() => resetField('singleInk')}
      />
      {ds.singleInk && (
        <ColorPicker
          label={labels.diagramInkColor}
          value={ds.inkColor}
          onChange={(v) => update({ inkColor: v })}
          tooltip={labels.diagramInkColorTooltip}
          isDefault={unset('inkColor')}
          onReset={() => resetField('inkColor')}
          fieldId="diagramStyle-inkColor"
        />
      )}
    </CollapsibleSection>
  );
});
