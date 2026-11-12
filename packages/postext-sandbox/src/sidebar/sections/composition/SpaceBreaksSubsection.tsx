'use client';

import { DEFAULT_BODY_TEXT_CONFIG, type CompositionRule } from 'postext';

import type { BodyTextConfig, ResolvedBodyTextConfig } from 'postext';
import { NestedGroup, NumberInput, SelectInput } from '../../../../controls/index.js';
import type { useSandboxLabels } from '../../../../context/SandboxContext.js';

const D = DEFAULT_BODY_TEXT_CONFIG;

interface SpaceBreaksProps {
  bodyText: ResolvedBodyTextConfig;
  /** The three levels of a composition rule. */
  options: { value: string; label: string }[];
  updateBodyText: (partial: Partial<BodyTextConfig>) => void;
  resetField: (field: keyof BodyTextConfig) => void;
  labels: ReturnType<typeof useSandboxLabels>;
}

/** A line that starts with a citation, or ends or starts on a lone
 *  operator (#1519): the level of each rule, then what a break there costs
 *  the line breaker (under Avoid), as the stacks rule above it. */
export function SpaceBreaksSubsection({ bodyText, options, updateBodyText, resetField, labels }: SpaceBreaksProps) {
  return (
    <>
      <SelectInput
        label={labels.bodyCitationBreaks}
        value={bodyText.citationBreaks}
        options={options}
        onChange={(value) => updateBodyText({ citationBreaks: value as CompositionRule })}
        tooltip={labels.bodyCitationBreaksTooltip}
        isDefault={bodyText.citationBreaks === D.citationBreaks}
        onReset={() => resetField('citationBreaks')}
      />
      {bodyText.citationBreaks === 'avoid' && (
        <NestedGroup>
          <NumberInput
            label={labels.bodyCitationBreakPenalty}
            value={bodyText.citationBreakPenalty}
            onChange={(v) => updateBodyText({ citationBreakPenalty: v })}
            // Demerits: the default weighs as a line stretched to the
            // word-spacing limit.
            min={0}
            max={1000000}
            step={1000}
            widthCh={7}
            tooltip={labels.bodyCitationBreakPenaltyTooltip}
            isDefault={bodyText.citationBreakPenalty === D.citationBreakPenalty}
            onReset={() => resetField('citationBreakPenalty')}
          />
        </NestedGroup>
      )}
      <SelectInput
        label={labels.bodyOperatorBreaks}
        value={bodyText.operatorBreaks}
        options={options}
        onChange={(value) => updateBodyText({ operatorBreaks: value as CompositionRule })}
        tooltip={labels.bodyOperatorBreaksTooltip}
        isDefault={bodyText.operatorBreaks === D.operatorBreaks}
        onReset={() => resetField('operatorBreaks')}
      />
      {bodyText.operatorBreaks === 'avoid' && (
        <NestedGroup>
          <NumberInput
            label={labels.bodyOperatorBreakPenalty}
            value={bodyText.operatorBreakPenalty}
            onChange={(v) => updateBodyText({ operatorBreakPenalty: v })}
            min={0}
            max={1000000}
            step={1000}
            widthCh={7}
            tooltip={labels.bodyOperatorBreakPenaltyTooltip}
            isDefault={bodyText.operatorBreakPenalty === D.operatorBreakPenalty}
            onReset={() => resetField('operatorBreakPenalty')}
          />
        </NestedGroup>
      )}
    </>
  );
}
