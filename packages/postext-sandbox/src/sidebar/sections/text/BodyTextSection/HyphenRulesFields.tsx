'use client';

import { DEFAULT_HYPHENATION_CONFIG, hyphenationLanguageLimits } from 'postext';
import type { BodyTextConfig, CompositionRule, HyphenationConfig, ResolvedBodyTextConfig } from 'postext';
import { NestedGroup, NumberInput, SelectInput } from '../../../../controls/index.js';
import type { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { resetHyphenationField } from './HyphenationFields.js';

const D = DEFAULT_HYPHENATION_CONFIG;

interface HyphenRulesProps {
  bodyText: ResolvedBodyTextConfig;
  raw: BodyTextConfig | undefined;
  updateBodyText: (partial: Partial<BodyTextConfig>) => void;
  updateHyphenation: (partial: Partial<HyphenationConfig>) => void;
  labels: ReturnType<typeof useSandboxLabels>;
}

/** The dictionary's limits (#1466): unset, each shows the language's own. */
export function HyphenationLimitsFields({ bodyText, raw, updateBodyText, updateHyphenation, labels }: HyphenRulesProps) {
  const h = bodyText.hyphenation;
  const own = hyphenationLanguageLimits(h.locale);
  return (
    <>
      <NumberInput
        label={labels.bodyHyphenationMinWordLength}
        value={h.minWordLength ?? own.minWordLength}
        onChange={(v) => updateHyphenation({ minWordLength: v })}
        min={2}
        max={20}
        step={1}
        tooltip={labels.bodyHyphenationMinWordLengthTooltip}
        isDefault={raw?.hyphenation?.minWordLength === undefined}
        onReset={() => resetHyphenationField(raw, 'minWordLength', updateBodyText)}
      />
      <NumberInput
        label={labels.bodyHyphenationLeftMin}
        value={h.leftMin ?? own.leftMin}
        onChange={(v) => updateHyphenation({ leftMin: v })}
        min={1}
        max={10}
        step={1}
        tooltip={labels.bodyHyphenationLeftMinTooltip}
        isDefault={raw?.hyphenation?.leftMin === undefined}
        onReset={() => resetHyphenationField(raw, 'leftMin', updateBodyText)}
      />
      <NumberInput
        label={labels.bodyHyphenationRightMin}
        value={h.rightMin ?? own.rightMin}
        onChange={(v) => updateHyphenation({ rightMin: v })}
        min={1}
        max={10}
        step={1}
        tooltip={labels.bodyHyphenationRightMinTooltip}
        isDefault={raw?.hyphenation?.rightMin === undefined}
        onReset={() => resetHyphenationField(raw, 'rightMin', updateBodyText)}
      />
    </>
  );
}

/** A penalty in demerits, on the scale of two hyphenated lines in a row
 *  (3000). */
const PENALTY = { min: 0, max: 1000000, step: 1000, widthCh: 8 } as const;

/** Where hyphens may fall (#1466, optimal line breaking only): how dear
 *  each one is, the ladders and the last word. Each rule has its level,
 *  then what it measures (under Warn and Avoid) and what a fault costs the
 *  line breaker (under Avoid). */
export function HyphenDistributionFields({
  bodyText,
  raw,
  updateBodyText,
  updateHyphenation,
  options,
  labels,
}: HyphenRulesProps & { options: { value: string; label: string }[] }) {
  const h = bodyText.hyphenation;
  const reset = (field: keyof HyphenationConfig) => resetHyphenationField(raw, field, updateBodyText);
  return (
    <>
      <NumberInput
        label={labels.bodyFewerHyphens}
        value={h.fewerHyphens}
        onChange={(fewerHyphens) => updateHyphenation({ fewerHyphens })}
        min={0}
        max={10}
        step={1}
        tooltip={labels.bodyFewerHyphensTooltip}
        isDefault={h.fewerHyphens === D.fewerHyphens}
        onReset={() => reset('fewerHyphens')}
      />
      <SelectInput
        label={labels.bodyHyphenLadders}
        value={h.ladders}
        options={options}
        onChange={(value) => updateHyphenation({ ladders: value as CompositionRule })}
        tooltip={labels.bodyHyphenLaddersTooltip}
        isDefault={h.ladders === D.ladders}
        onReset={() => reset('ladders')}
      />
      {h.ladders !== 'allow' && (
        <NestedGroup>
          <NumberInput
            label={labels.bodyHyphenationMaxConsecutive}
            value={h.maxConsecutive}
            onChange={(maxConsecutive) => updateHyphenation({ maxConsecutive })}
            min={1}
            max={10}
            step={1}
            tooltip={labels.bodyHyphenationMaxConsecutiveTooltip}
            isDefault={h.maxConsecutive === D.maxConsecutive}
            onReset={() => reset('maxConsecutive')}
          />
          {h.ladders === 'avoid' && (
            <NumberInput
              label={labels.bodyHyphenLadderPenalty}
              value={h.ladderPenalty}
              onChange={(ladderPenalty) => updateHyphenation({ ladderPenalty })}
              {...PENALTY}
              tooltip={labels.bodyHyphenLadderPenaltyTooltip}
              isDefault={h.ladderPenalty === D.ladderPenalty}
              onReset={() => reset('ladderPenalty')}
            />
          )}
        </NestedGroup>
      )}
      <SelectInput
        label={labels.bodyHyphenationLastWord}
        value={h.lastWord}
        options={options}
        onChange={(value) => updateHyphenation({ lastWord: value as CompositionRule })}
        tooltip={labels.bodyHyphenationLastWordTooltip}
        isDefault={h.lastWord === D.lastWord}
        onReset={() => reset('lastWord')}
      />
      {h.lastWord === 'avoid' && (
        <NestedGroup>
          <NumberInput
            label={labels.bodyHyphenLastWordPenalty}
            value={h.lastWordPenalty}
            onChange={(lastWordPenalty) => updateHyphenation({ lastWordPenalty })}
            {...PENALTY}
            tooltip={labels.bodyHyphenLastWordPenaltyTooltip}
            isDefault={h.lastWordPenalty === D.lastWordPenalty}
            onReset={() => reset('lastWordPenalty')}
          />
        </NestedGroup>
      )}
    </>
  );
}
