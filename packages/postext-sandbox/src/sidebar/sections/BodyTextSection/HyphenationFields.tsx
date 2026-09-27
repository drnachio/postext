'use client';

import { DEFAULT_HYPHENATION_CONFIG, dimensionsEqual } from 'postext';
import type { BodyTextConfig, HyphenationConfig, ResolvedBodyTextConfig } from 'postext';
import { DimensionInput, NestedGroup, SelectInput, ToggleSwitch } from '../../../controls';
import type { useSandboxLabels } from '../../../context/SandboxContext';
import { localeOptionsFor, HYPHENATION_ZONE_UNITS } from './constants';

interface HyphenationFieldProps {
  bodyText: ResolvedBodyTextConfig;
  raw: BodyTextConfig | undefined;
  updateBodyText: (partial: Partial<BodyTextConfig>) => void;
  updateHyphenation: (partial: Partial<HyphenationConfig>) => void;
  labels: ReturnType<typeof useSandboxLabels>;
}

/** Drop one field from the stored hyphenation settings. */
function resetHyphenationField(
  raw: BodyTextConfig | undefined,
  field: keyof HyphenationConfig,
  updateBodyText: (partial: Partial<BodyTextConfig>) => void,
): void {
  if (!raw?.hyphenation) return;
  const next = { ...raw.hyphenation };
  delete next[field];
  updateBodyText({ hyphenation: Object.keys(next).length > 0 ? next : undefined });
}

/** The hyphenation dictionary. */
export function HyphenationLocaleField({
  raw,
  updateBodyText,
  updateHyphenation,
  labels,
  effectiveHyphenationLocale,
  isHyphenationLocaleDefault,
}: Omit<HyphenationFieldProps, 'bodyText'> & { effectiveHyphenationLocale: string; isHyphenationLocaleDefault: boolean }) {
  return (
    <SelectInput
      label={labels.bodyHyphenationLocale}
      value={effectiveHyphenationLocale}
      options={localeOptionsFor(effectiveHyphenationLocale)}
      onChange={(locale) => updateHyphenation({ locale: locale as HyphenationConfig['locale'] })}
      tooltip={labels.bodyHyphenationLocaleTooltip}
      isDefault={isHyphenationLocaleDefault}
      onReset={() => resetHyphenationField(raw, 'locale', updateBodyText)}
    />
  );
}

/** The hyphenation zone of ragged text. */
function HyphenationZoneField({ bodyText, raw, updateBodyText, updateHyphenation, labels }: HyphenationFieldProps) {
  return (
    <DimensionInput
      label={labels.bodyHyphenationZone}
      value={bodyText.hyphenation.zone}
      onChange={(zone) => updateHyphenation({ zone })}
      min={0}
      step={0.25}
      tooltip={labels.bodyHyphenationZoneTooltip}
      isDefault={dimensionsEqual(bodyText.hyphenation.zone, DEFAULT_HYPHENATION_CONFIG.zone)}
      onReset={() => resetHyphenationField(raw, 'zone', updateBodyText)}
      units={HYPHENATION_ZONE_UNITS}
    />
  );
}

/** Whether the dictionary divides the words of a compound (a word with a
 *  hyphen between two letters) or leaves them whole but for that hyphen. */
export function HyphenateCompoundsField({ bodyText, raw, updateBodyText, updateHyphenation, labels }: HyphenationFieldProps) {
  return (
    <ToggleSwitch
      label={labels.bodyHyphenateCompounds}
      checked={bodyText.hyphenation.compounds}
      onChange={(compounds) => updateHyphenation({ compounds })}
      tooltip={labels.bodyHyphenateCompoundsTooltip}
      isDefault={bodyText.hyphenation.compounds === DEFAULT_HYPHENATION_CONFIG.compounds}
      onReset={() => resetHyphenationField(raw, 'compounds', updateBodyText)}
    />
  );
}

/** "Hyphenate ragged text" and its zone, under a justified body: the
 *  setting then reaches the ragged paragraph styles and boxes. */
export function RaggedHyphenationFields(props: HyphenationFieldProps) {
  const { bodyText, raw, updateBodyText, updateHyphenation, labels } = props;
  return (
    <>
      <ToggleSwitch
        label={labels.bodyHyphenationRagged}
        checked={bodyText.hyphenation.ragged}
        onChange={(ragged) => updateHyphenation({ ragged })}
        tooltip={labels.bodyHyphenationRaggedTooltip}
        isDefault={bodyText.hyphenation.ragged === DEFAULT_HYPHENATION_CONFIG.ragged}
        onReset={() => resetHyphenationField(raw, 'ragged', updateBodyText)}
      />
      {bodyText.hyphenation.ragged && <HyphenationZoneField {...props} />}
    </>
  );
}

/** Hyphenation of a ragged body: off unless asked for, then its dictionary
 *  and zone. */
export function RaggedHyphenationSubsection(
  props: HyphenationFieldProps & { effectiveHyphenationLocale: string; isHyphenationLocaleDefault: boolean },
) {
  const { bodyText, raw, updateBodyText, updateHyphenation, labels } = props;
  const on = bodyText.hyphenation.enabled && bodyText.hyphenation.ragged;
  return (
    <NestedGroup>
      <ToggleSwitch
        label={labels.bodyHyphenationRagged}
        checked={on}
        // Turning it on also lifts a hyphenation switched off while justified.
        onChange={(ragged) => updateHyphenation(ragged && !bodyText.hyphenation.enabled ? { ragged, enabled: true } : { ragged })}
        tooltip={labels.bodyHyphenationRaggedTooltip}
        isDefault={bodyText.hyphenation.ragged === DEFAULT_HYPHENATION_CONFIG.ragged}
        onReset={() => resetHyphenationField(raw, 'ragged', updateBodyText)}
      />
      {on && (
        <>
          <HyphenationLocaleField {...props} />
          <HyphenationZoneField {...props} />
          <HyphenateCompoundsField {...props} />
        </>
      )}
    </NestedGroup>
  );
}
