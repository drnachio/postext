'use client';

import { DEFAULT_BODY_TEXT_CONFIG } from 'postext';

import type { BodyTextConfig, ResolvedBodyTextConfig } from 'postext';
import { NestedGroup, NumberInput } from '../../../../controls/index.js';
import type { useSandboxLabels } from '../../../../context/SandboxContext.js';

interface StacksProps {
  bodyText: ResolvedBodyTextConfig;
  updateBodyText: (partial: Partial<BodyTextConfig>) => void;
  resetField: (field: keyof BodyTextConfig) => void;
  labels: ReturnType<typeof useSandboxLabels>;
}

/** What makes a stack and what one costs, under the «Avoid stacks» switch. */
export function StacksSubsection({ bodyText, updateBodyText, resetField, labels }: StacksProps) {
  return (
    <NestedGroup>
      <NumberInput
        label={labels.bodyStackMinCharacters}
        value={bodyText.stackMinCharacters}
        onChange={(v) => updateBodyText({ stackMinCharacters: v })}
        min={1}
        max={10}
        step={1}
        tooltip={labels.bodyStackMinCharactersTooltip}
        isDefault={bodyText.stackMinCharacters === DEFAULT_BODY_TEXT_CONFIG.stackMinCharacters}
        onReset={() => resetField('stackMinCharacters')}
      />
      <NumberInput
        label={labels.bodyStackPenalty}
        value={bodyText.stackPenalty}
        onChange={(v) => updateBodyText({ stackPenalty: v })}
        min={0}
        // Up to the default, 100000: from there a stack is a limit.
        max={100000}
        step={100}
        widthCh={7}
        tooltip={labels.bodyStackPenaltyTooltip}
        isDefault={bodyText.stackPenalty === DEFAULT_BODY_TEXT_CONFIG.stackPenalty}
        onReset={() => resetField('stackPenalty')}
      />
    </NestedGroup>
  );
}
