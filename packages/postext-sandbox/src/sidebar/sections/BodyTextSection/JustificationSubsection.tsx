'use client';

import { DEFAULT_BODY_TEXT_CONFIG } from 'postext';
import type { BodyTextConfig, HyphenationConfig, KashidaPatterns, ResolvedBodyTextConfig } from 'postext';
import { NestedGroup, NumberInput, SelectInput, ToggleSwitch } from '../../../controls';
import type { useSandboxLabels } from '../../../context/SandboxContext';
import { HyphenateCompoundsField, HyphenationLocaleField, RaggedHyphenationFields } from './HyphenationFields';

interface Props {
  bodyText: ResolvedBodyTextConfig;
  raw: BodyTextConfig | undefined;
  effectiveHyphenationLocale: string;
  isHyphenationEnabledDefault: boolean;
  isHyphenationLocaleDefault: boolean;
  isMaxWordSpacingDefault: boolean;
  isMinWordSpacingDefault: boolean;
  isOptimalLineBreakingDefault: boolean;
  updateBodyText: (partial: Partial<BodyTextConfig>) => void;
  updateHyphenation: (partial: Partial<HyphenationConfig>) => void;
  resetField: (field: keyof BodyTextConfig) => void;
  labels: ReturnType<typeof useSandboxLabels>;
}

/** "Optimal breaking of ragged text" (`bodyText.optimalRagged`). */
export function OptimalRaggedSwitch({
  bodyText,
  updateBodyText,
  resetField,
  labels,
}: Pick<Props, 'bodyText' | 'updateBodyText' | 'resetField' | 'labels'>) {
  return (
    <ToggleSwitch
      label={labels.bodyOptimalRagged}
      checked={bodyText.optimalRagged}
      onChange={(checked) => updateBodyText({ optimalRagged: checked })}
      tooltip={labels.bodyOptimalRaggedTooltip}
      isDefault={bodyText.optimalRagged === DEFAULT_BODY_TEXT_CONFIG.optimalRagged}
      onReset={() => resetField('optimalRagged')}
    />
  );
}

/** "Hyphenate across columns" (`bodyText.hyphenateAcrossColumns`): under
 *  hyphenation for a justified body, under optimal ragged breaking for a
 *  ragged one, since that is when the engine re-breaks ragged text. */
function HyphenateAcrossColumnsSwitch({
  bodyText,
  updateBodyText,
  resetField,
  labels,
}: Pick<Props, 'bodyText' | 'updateBodyText' | 'resetField' | 'labels'>) {
  return (
    <ToggleSwitch
      label={labels.bodyHyphenateAcrossColumns}
      checked={bodyText.hyphenateAcrossColumns}
      onChange={(checked) => updateBodyText({ hyphenateAcrossColumns: checked })}
      tooltip={labels.bodyHyphenateAcrossColumnsTooltip}
      isDefault={bodyText.hyphenateAcrossColumns === DEFAULT_BODY_TEXT_CONFIG.hyphenateAcrossColumns}
      onReset={() => resetField('hyphenateAcrossColumns')}
    />
  );
}

/** Line breaking of a ragged body: optimal breaking, whether ragged text
 *  takes it, and, when it does, whether a column may end on a hyphen. */
export function RaggedBreakingSubsection({
  bodyText,
  updateBodyText,
  resetField,
  labels,
}: Pick<Props, 'bodyText' | 'updateBodyText' | 'resetField' | 'labels'>) {
  return (
    <NestedGroup>
      <ToggleSwitch
        label={labels.bodyOptimalLineBreaking}
        checked={bodyText.optimalLineBreaking}
        onChange={(checked) => updateBodyText({ optimalLineBreaking: checked })}
        tooltip={labels.bodyOptimalLineBreakingTooltip}
        isDefault={bodyText.optimalLineBreaking === DEFAULT_BODY_TEXT_CONFIG.optimalLineBreaking}
        onReset={() => resetField('optimalLineBreaking')}
      />
      {bodyText.optimalLineBreaking && (
        <OptimalRaggedSwitch bodyText={bodyText} updateBodyText={updateBodyText} resetField={resetField} labels={labels} />
      )}
      {bodyText.optimalLineBreaking && bodyText.optimalRagged && (
        <HyphenateAcrossColumnsSwitch bodyText={bodyText} updateBodyText={updateBodyText} resetField={resetField} labels={labels} />
      )}
    </NestedGroup>
  );
}

export function JustificationSubsection({
  bodyText,
  raw,
  effectiveHyphenationLocale,
  isHyphenationEnabledDefault,
  isHyphenationLocaleDefault,
  isMaxWordSpacingDefault,
  isMinWordSpacingDefault,
  isOptimalLineBreakingDefault,
  updateBodyText,
  updateHyphenation,
  resetField,
  labels,
}: Props) {
  return (
    <NestedGroup>
      <ToggleSwitch
        label={labels.bodyHyphenation}
        checked={bodyText.hyphenation.enabled}
        onChange={(enabled) => updateHyphenation({ enabled })}
        tooltip={labels.bodyHyphenationTooltip}
        isDefault={isHyphenationEnabledDefault}
        onReset={() => {
          if (!raw?.hyphenation) return;
          const next = { ...raw.hyphenation };
          delete next.enabled;
          updateBodyText({ hyphenation: Object.keys(next).length > 0 ? next : undefined });
        }}
      />

      {bodyText.hyphenation.enabled && (
        <>
          <HyphenationLocaleField
            raw={raw}
            updateBodyText={updateBodyText}
            updateHyphenation={updateHyphenation}
            labels={labels}
            effectiveHyphenationLocale={effectiveHyphenationLocale}
            isHyphenationLocaleDefault={isHyphenationLocaleDefault}
          />
          <HyphenateCompoundsField
            bodyText={bodyText}
            raw={raw}
            updateBodyText={updateBodyText}
            updateHyphenation={updateHyphenation}
            labels={labels}
          />
          <RaggedHyphenationFields
            bodyText={bodyText}
            raw={raw}
            updateBodyText={updateBodyText}
            updateHyphenation={updateHyphenation}
            labels={labels}
          />
          <HyphenateAcrossColumnsSwitch bodyText={bodyText} updateBodyText={updateBodyText} resetField={resetField} labels={labels} />
        </>
      )}

      <NumberInput
        label={labels.bodyMaxWordSpacing}
        value={bodyText.maxWordSpacing}
        onChange={(v) => updateBodyText({ maxWordSpacing: v })}
        min={1}
        max={3}
        step={0.05}
        tooltip={labels.bodyMaxWordSpacingTooltip}
        isDefault={isMaxWordSpacingDefault}
        onReset={() => resetField('maxWordSpacing')}
      />

      <NumberInput
        label={labels.bodyMinWordSpacing}
        value={bodyText.minWordSpacing}
        onChange={(v) => updateBodyText({ minWordSpacing: v })}
        min={0.5}
        max={1}
        step={0.05}
        tooltip={labels.bodyMinWordSpacingTooltip}
        isDefault={isMinWordSpacingDefault}
        onReset={() => resetField('minWordSpacing')}
      />

      <NumberInput
        label={labels.bodyMaxJustifyTracking}
        value={bodyText.maxJustifyTracking}
        onChange={(v) => updateBodyText({ maxJustifyTracking: v })}
        min={0}
        max={50}
        step={1}
        suffix="‰"
        tooltip={labels.bodyMaxJustifyTrackingTooltip}
        isDefault={bodyText.maxJustifyTracking === DEFAULT_BODY_TEXT_CONFIG.maxJustifyTracking}
        onReset={() => resetField('maxJustifyTracking')}
      />

      <ToggleSwitch
        label={labels.bodyOptimalLineBreaking}
        checked={bodyText.optimalLineBreaking}
        onChange={(checked) => updateBodyText({ optimalLineBreaking: checked })}
        tooltip={labels.bodyOptimalLineBreakingTooltip}
        isDefault={isOptimalLineBreakingDefault}
        onReset={() => resetField('optimalLineBreaking')}
      />
      {/* Under a justified body it reaches the ragged paragraph styles and
          boxes. */}
      {bodyText.optimalLineBreaking && (
        <OptimalRaggedSwitch bodyText={bodyText} updateBodyText={updateBodyText} resetField={resetField} labels={labels} />
      )}
    </NestedGroup>
  );
}

/**
 * Kashida justification (`bodyText.kashida` and its details, #375): a
 * justified line of Arabic-script text elongates letter joins with
 * tatweels. On by default in a book written in Arabic script
 * (`arabicScript`), so the switch shows there, or wherever the author set
 * it; the details show while it is on.
 */
export function KashidaFields({
  bodyText,
  raw,
  arabicScript,
  updateBodyText,
  resetField,
  labels,
}: Pick<Props, 'bodyText' | 'raw' | 'updateBodyText' | 'resetField' | 'labels'> & { arabicScript: boolean }) {
  if (!arabicScript && raw?.kashida === undefined) return null;
  const on = bodyText.kashida === 'auto';
  const D = DEFAULT_KASHIDA;
  const patterns = bodyText.kashidaPatterns ?? D.patterns;
  return (
    <>
      <ToggleSwitch
        label={labels.bodyKashida}
        checked={on}
        // The language's default is written as unset, the other as itself.
        onChange={(checked) => (checked === arabicScript ? resetField('kashida') : updateBodyText({ kashida: checked ? 'auto' : 'none' }))}
        tooltip={labels.bodyKashidaTooltip}
        isDefault={on === arabicScript}
        onReset={() => resetField('kashida')}
      />
      {on && (
        <NestedGroup>
          <SelectInput
            label={labels.bodyKashidaPatterns}
            value={patterns}
            options={[
              { value: 'auto', label: labels.bodyKashidaPatternsAuto },
              { value: 'naskh', label: labels.bodyKashidaPatternsNaskh },
              { value: 'simple', label: labels.bodyKashidaPatternsSimple },
              { value: 'nastaliq', label: labels.bodyKashidaPatternsNastaliq },
            ]}
            onChange={(v) => (v === 'auto' ? resetField('kashidaPatterns') : updateBodyText({ kashidaPatterns: v as KashidaPatterns }))}
            tooltip={labels.bodyKashidaPatternsTooltip}
            isDefault={patterns === D.patterns}
            onReset={() => resetField('kashidaPatterns')}
          />
          <NumberInput
            label={labels.bodyKashidaPerWord}
            value={bodyText.kashidaPerWord ?? D.perWord}
            onChange={(v) => updateBodyText({ kashidaPerWord: v })}
            min={1}
            max={6}
            step={1}
            tooltip={labels.bodyKashidaPerWordTooltip}
            isDefault={(bodyText.kashidaPerWord ?? D.perWord) === D.perWord}
            onReset={() => resetField('kashidaPerWord')}
          />
          <NumberInput
            label={labels.bodyKashidaMaxLength}
            value={bodyText.kashidaMaxLength ?? D.maxLength}
            onChange={(v) => updateBodyText({ kashidaMaxLength: v })}
            min={0}
            max={3}
            step={0.1}
            suffix="em"
            tooltip={labels.bodyKashidaMaxLengthTooltip}
            isDefault={(bodyText.kashidaMaxLength ?? D.maxLength) === D.maxLength}
            onReset={() => resetField('kashidaMaxLength')}
          />
        </NestedGroup>
      )}
    </>
  );
}

/** The engine's kashida defaults once it is on (`DEFAULT_KASHIDA_CONFIG`,
 *  not exported from `postext`). */
const DEFAULT_KASHIDA = { patterns: 'auto' as KashidaPatterns, perWord: 1, maxLength: 0.6 };
