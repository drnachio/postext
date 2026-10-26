'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { resolveBodyTextConfig, resolveScoreStyleConfig } from 'postext';
import type { DimensionUnit, ResolvedScoreStyleConfig, ScoreMusicFont, ScoreStyleConfig } from 'postext';
import { CollapsibleSection, ColorPicker, DimensionInput, FontPicker, NumberInput, SelectInput, ToggleSwitch } from '../../../controls/index.js';

const STAFF_UNITS: DimensionUnit[] = ['mm', 'pt', 'px'];
const GAP_UNITS: DimensionUnit[] = ['mm', 'pt', 'px', 'em'];
/** The SMuFL fonts the engraver carries, by name. */
const MUSIC_FONT_OPTIONS: { value: ScoreMusicFont; label: string }[] = [
  { value: 'Bravura', label: 'Bravura' },
  { value: 'Leland', label: 'Leland' },
  { value: 'Petaluma', label: 'Petaluma' },
  { value: 'Leipzig', label: 'Leipzig' },
  { value: 'Gootville', label: 'Gootville' },
];

export interface ScoreStyleFieldsProps {
  /** The stored (partial) style being edited. */
  raw: ScoreStyleConfig | undefined;
  /** The same style resolved: what each control shows. */
  resolved: ResolvedScoreStyleConfig;
  onChange: (partial: Partial<ScoreStyleConfig>) => void;
  onResetField: (field: keyof ScoreStyleConfig) => void;
  /** Prefix of the colour picker's field id. */
  fieldIdPrefix: string;
}

/** The controls of a score style (#1173), shared by the document's
 *  `scoreStyle` and each named style. */
export function ScoreStyleFields({ raw, resolved: ss, onChange: update, onResetField: resetField, fieldIdPrefix }: ScoreStyleFieldsProps) {
  const labels = useSandboxLabels();
  const unset = (field: keyof ScoreStyleConfig) => raw?.[field] === undefined;
  return (
    <>
      <DimensionInput
        label={labels.scoreStaffSize}
        value={ss.staffSize}
        onChange={(v) => update({ staffSize: v })}
        min={1}
        step={0.1}
        units={STAFF_UNITS}
        tooltip={labels.scoreStaffSizeTooltip}
        isDefault={unset('staffSize')}
        onReset={() => resetField('staffSize')}
      />
      <SelectInput
        label={labels.scoreMusicFont}
        value={ss.musicFont}
        options={MUSIC_FONT_OPTIONS}
        onChange={(v) => update({ musicFont: v as ScoreMusicFont })}
        tooltip={labels.scoreMusicFontTooltip}
        isDefault={unset('musicFont')}
        onReset={() => resetField('musicFont')}
      />
      <FontPicker
        label={labels.scoreTextFont}
        value={ss.textFont}
        onChange={(v) => update({ textFont: v })}
        tooltip={labels.scoreTextFontTooltip}
        isDefault={unset('textFont')}
        onReset={() => resetField('textFont')}
      />
      <NumberInput
        label={labels.scoreSpacing}
        value={ss.spacing}
        onChange={(v) => update({ spacing: v })}
        min={0.25}
        max={4}
        step={0.05}
        tooltip={labels.scoreSpacingTooltip}
        isDefault={unset('spacing')}
        onReset={() => resetField('spacing')}
      />
      <SelectInput
        label={labels.scoreBarNumbers}
        value={ss.barNumbers}
        variant="segmented"
        options={[
          { value: 'none', label: labels.scoreBarNumbersNone },
          { value: 'system', label: labels.scoreBarNumbersSystem },
          { value: 'every', label: labels.scoreBarNumbersEvery },
        ]}
        onChange={(v) => update({ barNumbers: v as ScoreStyleConfig['barNumbers'] })}
        tooltip={labels.scoreBarNumbersTooltip}
        isDefault={unset('barNumbers')}
        onReset={() => resetField('barNumbers')}
      />
      <DimensionInput
        label={labels.scoreSystemGap}
        value={ss.systemGap}
        onChange={(v) => update({ systemGap: v })}
        min={0}
        step={0.5}
        units={GAP_UNITS}
        tooltip={labels.scoreSystemGapTooltip}
        isDefault={unset('systemGap')}
        onReset={() => resetField('systemGap')}
      />
      <DimensionInput
        label={labels.marginTop}
        value={ss.marginTop}
        onChange={(v) => update({ marginTop: v })}
        min={0}
        step={0.5}
        units={GAP_UNITS}
        isDefault={unset('marginTop')}
        onReset={() => resetField('marginTop')}
      />
      <DimensionInput
        label={labels.marginBottom}
        value={ss.marginBottom}
        onChange={(v) => update({ marginBottom: v })}
        min={0}
        step={0.5}
        units={GAP_UNITS}
        isDefault={unset('marginBottom')}
        onReset={() => resetField('marginBottom')}
      />
      <ColorPicker
        label={labels.scoreColor}
        value={ss.color}
        onChange={(v) => update({ color: v })}
        tooltip={labels.scoreColorTooltip}
        isDefault={unset('color')}
        onReset={() => resetField('color')}
        fieldId={`${fieldIdPrefix}-color`}
      />
      <NumberInput
        label={labels.scoreMinSystemsAtBreak}
        value={ss.minSystemsAtBreak}
        onChange={(v) => update({ minSystemsAtBreak: v })}
        min={1}
        max={8}
        step={1}
        tooltip={labels.scoreMinSystemsAtBreakTooltip}
        isDefault={unset('minSystemsAtBreak')}
        onReset={() => resetField('minSystemsAtBreak')}
      />
    </>
  );
}

/** Config-panel section for music scores (#1173): whether notation fences
 *  are scores, and the document's score style. */
export const ScoreStyleSection = memo(function ScoreStyleSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.scoreStyle);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const ss = resolveScoreStyleConfig(raw, resolveBodyTextConfig(bodyTextRaw));

  const update = (partial: Partial<ScoreStyleConfig>) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { scoreStyle: { ...raw, ...partial } } });
  };
  const resetField = (field: keyof ScoreStyleConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    dispatch({ type: 'UPDATE_CONFIG', payload: { scoreStyle: Object.keys(next).length > 0 ? next : undefined } });
  };

  return (
    <CollapsibleSection
      title={labels.scoreStyleSection}
      sectionId="scoreStyle"
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { scoreStyle: undefined } })}
      hasOverrides={raw !== undefined && Object.keys(raw).length > 0}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <ToggleSwitch
        label={labels.scoreEnabled}
        checked={ss.enabled}
        onChange={(v) => update({ enabled: v })}
        tooltip={labels.scoreEnabledTooltip}
        isDefault={raw?.enabled === undefined}
        onReset={() => resetField('enabled')}
      />
      <ScoreStyleFields raw={raw} resolved={ss} onChange={update} onResetField={resetField} fieldIdPrefix="scoreStyle" />
    </CollapsibleSection>
  );
});
