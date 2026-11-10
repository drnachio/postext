'use client';

import { DEFAULT_BODY_TEXT_CONFIG, DEFAULT_HYPHENATION_CONFIG, hyphenationLanguageLimits } from 'postext';
import type { BodyTextConfig, HyphenationConfig, ResolvedBodyTextConfig } from 'postext';
import { NestedGroup, NumberInput, ToggleSwitch } from '../../../../controls/index.js';
import type { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { resetHyphenationField } from './HyphenationFields.js';

interface HyphenRulesProps {
  bodyText: ResolvedBodyTextConfig;
  raw: BodyTextConfig | undefined;
  updateBodyText: (partial: Partial<BodyTextConfig>) => void;
  updateHyphenation: (partial: Partial<HyphenationConfig>) => void;
  resetField: (field: keyof BodyTextConfig) => void;
  labels: ReturnType<typeof useSandboxLabels>;
}

/** The dictionary's limits, as InDesign's hyphenation settings: unset,
 *  each shows the language's own. */
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

/** Where hyphens may fall on the page (optimal line breaking only): how
 *  dear each one is, how many in a row, the last word, the strict rule and
 *  the lines between them. All off by default. */
export function HyphenDistributionFields({ bodyText, raw, updateBodyText, updateHyphenation, resetField, labels }: HyphenRulesProps) {
  const D = DEFAULT_BODY_TEXT_CONFIG;
  const h = bodyText.hyphenation;
  return (
    <>
      <NumberInput
        label={labels.bodyFewerHyphens}
        value={bodyText.fewerHyphens}
        onChange={(v) => updateBodyText({ fewerHyphens: v })}
        min={0}
        max={10}
        step={1}
        tooltip={labels.bodyFewerHyphensTooltip}
        isDefault={bodyText.fewerHyphens === D.fewerHyphens}
        onReset={() => resetField('fewerHyphens')}
      />
      <NumberInput
        label={labels.bodyHyphenationMaxConsecutive}
        value={h.maxConsecutive}
        onChange={(maxConsecutive) => updateHyphenation({ maxConsecutive })}
        min={0}
        max={10}
        step={1}
        tooltip={labels.bodyHyphenationMaxConsecutiveTooltip}
        isDefault={raw?.hyphenation?.maxConsecutive === undefined}
        onReset={() => resetHyphenationField(raw, 'maxConsecutive', updateBodyText)}
      />
      <ToggleSwitch
        label={labels.bodyHyphenationLastWord}
        checked={h.lastWord}
        onChange={(lastWord) => updateHyphenation({ lastWord })}
        tooltip={labels.bodyHyphenationLastWordTooltip}
        isDefault={h.lastWord === DEFAULT_HYPHENATION_CONFIG.lastWord}
        onReset={() => resetHyphenationField(raw, 'lastWord', updateBodyText)}
      />
      <ToggleSwitch
        label={labels.bodyStrictHyphenation}
        checked={bodyText.strictHyphenation}
        onChange={(checked) => updateBodyText({ strictHyphenation: checked })}
        tooltip={labels.bodyStrictHyphenationTooltip}
        isDefault={bodyText.strictHyphenation === D.strictHyphenation}
        onReset={() => resetField('strictHyphenation')}
      />
      <NumberInput
        label={labels.bodyMinLinesBetweenHyphens}
        value={bodyText.minLinesBetweenHyphens}
        onChange={(v) => updateBodyText({ minLinesBetweenHyphens: v })}
        min={0}
        max={4}
        step={1}
        tooltip={labels.bodyMinLinesBetweenHyphensTooltip}
        isDefault={bodyText.minLinesBetweenHyphens === D.minLinesBetweenHyphens}
        onReset={() => resetField('minLinesBetweenHyphens')}
      />
      {bodyText.minLinesBetweenHyphens > 0 && (
        <NestedGroup>
          <NumberInput
            label={labels.bodyHyphenSpacingPenalty}
            value={bodyText.hyphenSpacingPenalty}
            onChange={(v) => updateBodyText({ hyphenSpacingPenalty: v })}
            min={0}
            max={5000}
            step={50}
            tooltip={labels.bodyHyphenSpacingPenaltyTooltip}
            isDefault={bodyText.hyphenSpacingPenalty === D.hyphenSpacingPenalty}
            onReset={() => resetField('hyphenSpacingPenalty')}
          />
        </NestedGroup>
      )}
    </>
  );
}
