'use client';

import type { BodyTextConfig, HyphenationConfig, ResolvedBodyTextConfig } from 'postext';
import { NestedGroup, NumberInput, SelectInput, ToggleSwitch } from '../../../controls';
import type { useSandboxLabels } from '../../../context/SandboxContext';
import { LOCALE_OPTIONS } from './constants';

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
        <SelectInput
          label={labels.bodyHyphenationLocale}
          value={effectiveHyphenationLocale}
          options={LOCALE_OPTIONS}
          onChange={(locale) => updateHyphenation({ locale: locale as HyphenationConfig['locale'] })}
          tooltip={labels.bodyHyphenationLocaleTooltip}
          isDefault={isHyphenationLocaleDefault}
          onReset={() => {
            if (!raw?.hyphenation) return;
            const next = { ...raw.hyphenation };
            delete next.locale;
            updateBodyText({ hyphenation: Object.keys(next).length > 0 ? next : undefined });
          }}
        />
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

      <ToggleSwitch
        label={labels.bodyOptimalLineBreaking}
        checked={bodyText.optimalLineBreaking}
        onChange={(checked) => updateBodyText({ optimalLineBreaking: checked })}
        tooltip={labels.bodyOptimalLineBreakingTooltip}
        isDefault={isOptimalLineBreakingDefault}
        onReset={() => resetField('optimalLineBreaking')}
      />
    </NestedGroup>
  );
}
