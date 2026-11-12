'use client';

import { DEFAULT_BODY_TEXT_CONFIG, type CompositionRule } from 'postext';

import type { BodyTextConfig, ResolvedBodyTextConfig } from 'postext';
import { NestedGroup, NumberInput, SelectInput } from '../../../controls/index.js';
import type { useSandboxLabels } from '../../../context/SandboxContext.js';

const D = DEFAULT_BODY_TEXT_CONFIG;

interface StacksProps {
  bodyText: ResolvedBodyTextConfig;
  /** The three levels of a composition rule. */
  options: { value: string; label: string }[];
  updateBodyText: (partial: Partial<BodyTextConfig>) => void;
  resetField: (field: keyof BodyTextConfig) => void;
  labels: ReturnType<typeof useSandboxLabels>;
}

/** Stacks (#1463): the level of the rule, then what makes a stack (under
 *  Warn and Avoid) and what one costs the line breaker (under Avoid). */
export function StacksSubsection({ bodyText, options, updateBodyText, resetField, labels }: StacksProps) {
  return (
    <>
      <SelectInput
        label={labels.bodyStacks}
        value={bodyText.stacks}
        options={options}
        onChange={(value) => updateBodyText({ stacks: value as CompositionRule })}
        tooltip={labels.bodyStacksTooltip}
        isDefault={bodyText.stacks === D.stacks}
        onReset={() => resetField('stacks')}
      />
      {bodyText.stacks !== 'allow' && (
        <NestedGroup>
          <NumberInput
            label={labels.bodyStackMinCharacters}
            value={bodyText.stackMinCharacters}
            onChange={(v) => updateBodyText({ stackMinCharacters: v })}
            min={1}
            max={10}
            step={1}
            tooltip={labels.bodyStackMinCharactersTooltip}
            isDefault={bodyText.stackMinCharacters === D.stackMinCharacters}
            onReset={() => resetField('stackMinCharacters')}
          />
          {bodyText.stacks === 'avoid' && (
            <NumberInput
              label={labels.bodyStackPenalty}
              value={bodyText.stackPenalty}
              onChange={(v) => updateBodyText({ stackPenalty: v })}
              // Demerits, on the scale of two hyphenated lines in a row
              // (3000).
              min={0}
              max={100000}
              step={100}
              widthCh={7}
              tooltip={labels.bodyStackPenaltyTooltip}
              isDefault={bodyText.stackPenalty === D.stackPenalty}
              onReset={() => resetField('stackPenalty')}
            />
          )}
        </NestedGroup>
      )}
    </>
  );
}
