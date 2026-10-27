'use client';

import { memo } from 'react';
import {
  CONTRAST_LEVELS,
  DEFAULT_CONTRAST_CONFIG,
  dimensionsEqual,
  resolveContrastConfig,
} from 'postext';
import type { ContrastConfig, ContrastReversedTextConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { CollapsibleSection, DimensionInput, NumberInput, SelectInput, ToggleSwitch } from '../../../controls/index.js';
import { ContrastAllowField } from '../../settings/ContrastAllowField.js';

/** The contrast check (#748): whether it runs, the level its ratios are
 *  held to, the renditions it reads, the sizes under which reversed
 *  text is reported and the pairs it accepts (#1124). Writes `contrast`;
 *  no page is laid out again. */
export const ContrastSection = memo(function ContrastSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.contrast);
  const cfg = resolveContrastConfig(raw);
  const D = DEFAULT_CONTRAST_CONFIG;
  const R = D.reversedText;

  const without = <T extends object>(obj: T | undefined, key: keyof T): T | undefined => {
    if (!obj) return undefined;
    const next = { ...obj };
    delete next[key];
    return Object.keys(next).length > 0 ? next : undefined;
  };
  const update = (partial: Partial<ContrastConfig>) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { contrast: { ...raw, ...partial } } });
  };
  const resetField = (key: keyof ContrastConfig) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { contrast: without(raw, key) } });
  };
  const updateReversed = (partial: Partial<ContrastReversedTextConfig>) => update({ reversedText: { ...raw?.reversedText, ...partial } });
  const resetReversed = (key: keyof ContrastReversedTextConfig) => {
    const reversedText = without(raw?.reversedText, key);
    const next = { ...raw, reversedText };
    if (!reversedText) delete next.reversedText;
    dispatch({ type: 'UPDATE_CONFIG', payload: { contrast: Object.keys(next).length > 0 ? next : undefined } });
  };

  const levelOptions = CONTRAST_LEVELS.map((level) => ({ value: level, label: level }));
  const modeOptions = [
    { value: 'auto', label: labels.contrastModeAuto },
    { value: 'screen', label: labels.contrastModeScreen },
    { value: 'print', label: labels.contrastModePrint },
    { value: 'both', label: labels.contrastModeBoth },
  ];

  return (
    <CollapsibleSection
      title={labels.contrastSection}
      sectionId="contrast"
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { contrast: undefined } })}
      hasOverrides={raw !== undefined && Object.keys(raw).length > 0}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <ToggleSwitch label={labels.contrastEnabled} checked={cfg.enabled} onChange={(v) => update({ enabled: v })}
        tooltip={labels.contrastEnabledTooltip} isDefault={cfg.enabled === D.enabled} onReset={() => resetField('enabled')} />
      {cfg.enabled && (
        <>
          <SelectInput label={labels.contrastLevel} value={cfg.level} options={levelOptions} variant="segmented" stacked={false}
            onChange={(v) => update({ level: v as ContrastConfig['level'] })} tooltip={labels.contrastLevelTooltip}
            isDefault={cfg.level === D.level} onReset={() => resetField('level')} />
          <SelectInput stacked label={labels.contrastMode} value={cfg.mode} options={modeOptions}
            onChange={(v) => update({ mode: v as ContrastConfig['mode'] })} tooltip={labels.contrastModeTooltip}
            isDefault={cfg.mode === D.mode} onReset={() => resetField('mode')} />
          <CollapsibleSection title={labels.contrastReversedGroup} sectionId="contrast-reversed" variant="subsection">
            <ToggleSwitch label={labels.contrastReversedEnabled} checked={cfg.reversedText.enabled} onChange={(v) => updateReversed({ enabled: v })}
              tooltip={labels.contrastReversedEnabledTooltip} isDefault={cfg.reversedText.enabled === R.enabled} onReset={() => resetReversed('enabled')} />
            {cfg.reversedText.enabled && (
              <>
                <DimensionInput label={labels.contrastReversedMinSize} value={cfg.reversedText.minSize} onChange={(d) => updateReversed({ minSize: d })} min={0} step={0.5}
                  tooltip={labels.contrastReversedMinSizeTooltip} isDefault={dimensionsEqual(cfg.reversedText.minSize, R.minSize)} onReset={() => resetReversed('minSize')} />
                <DimensionInput label={labels.contrastReversedMinFineSize} value={cfg.reversedText.minFineSize} onChange={(d) => updateReversed({ minFineSize: d })} min={0} step={0.5}
                  tooltip={labels.contrastReversedMinFineSizeTooltip} isDefault={dimensionsEqual(cfg.reversedText.minFineSize, R.minFineSize)} onReset={() => resetReversed('minFineSize')} />
                <NumberInput label={labels.contrastReversedLightWeight} value={cfg.reversedText.lightWeight} onChange={(v) => updateReversed({ lightWeight: v })} min={100} max={900} step={100}
                  tooltip={labels.contrastReversedLightWeightTooltip} isDefault={cfg.reversedText.lightWeight === R.lightWeight} onReset={() => resetReversed('lightWeight')} />
              </>
            )}
          </CollapsibleSection>
          <CollapsibleSection title={labels.contrastAllowGroup} sectionId="contrast-allow" variant="subsection">
            <ContrastAllowField value={raw?.allow} onChange={(allow) => (allow ? update({ allow }) : resetField('allow'))} />
          </CollapsibleSection>
        </>
      )}
    </CollapsibleSection>
  );
});
