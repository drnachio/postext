'use client';

import type { BodyTextConfig, ResolvedBodyTextConfig } from 'postext';
import { NestedGroup, NumberInput, ToggleSwitch } from '../../../controls';
import type { useSandboxLabels } from '../../../context/SandboxContext';

interface OrphansProps {
  bodyText: ResolvedBodyTextConfig;
  isOrphanMinLinesDefault: boolean;
  isOrphanPenaltyDefault: boolean;
  isAvoidOrphansInListsDefault: boolean;
  updateBodyText: (partial: Partial<BodyTextConfig>) => void;
  resetField: (field: keyof BodyTextConfig) => void;
  labels: ReturnType<typeof useSandboxLabels>;
}

export function OrphansSubsection({
  bodyText,
  isOrphanMinLinesDefault,
  isOrphanPenaltyDefault,
  isAvoidOrphansInListsDefault,
  updateBodyText,
  resetField,
  labels,
}: OrphansProps) {
  return (
    <NestedGroup>
      <NumberInput
        label={labels.bodyOrphanMinLines}
        value={bodyText.orphanMinLines}
        onChange={(v) => updateBodyText({ orphanMinLines: v })}
        min={1}
        max={5}
        step={1}
        tooltip={labels.bodyOrphanMinLinesTooltip}
        isDefault={isOrphanMinLinesDefault}
        onReset={() => resetField('orphanMinLines')}
      />
      <NumberInput
        label={labels.bodyOrphanPenalty}
        value={bodyText.orphanPenalty}
        onChange={(v) => updateBodyText({ orphanPenalty: v })}
        min={0}
        max={10000}
        step={100}
        tooltip={labels.bodyOrphanPenaltyTooltip}
        isDefault={isOrphanPenaltyDefault}
        onReset={() => resetField('orphanPenalty')}
      />
      <ToggleSwitch
        label={labels.bodyAvoidOrphansInLists}
        checked={bodyText.avoidOrphansInLists}
        onChange={(checked) => updateBodyText({ avoidOrphansInLists: checked })}
        tooltip={labels.bodyAvoidOrphansInListsTooltip}
        isDefault={isAvoidOrphansInListsDefault}
        onReset={() => resetField('avoidOrphansInLists')}
      />
    </NestedGroup>
  );
}

interface WidowsProps {
  bodyText: ResolvedBodyTextConfig;
  isWidowMinLinesDefault: boolean;
  isWidowPenaltyDefault: boolean;
  isAvoidWidowsInListsDefault: boolean;
  updateBodyText: (partial: Partial<BodyTextConfig>) => void;
  resetField: (field: keyof BodyTextConfig) => void;
  labels: ReturnType<typeof useSandboxLabels>;
}

export function WidowsSubsection({
  bodyText,
  isWidowMinLinesDefault,
  isWidowPenaltyDefault,
  isAvoidWidowsInListsDefault,
  updateBodyText,
  resetField,
  labels,
}: WidowsProps) {
  return (
    <NestedGroup>
      <NumberInput
        label={labels.bodyWidowMinLines}
        value={bodyText.widowMinLines}
        onChange={(v) => updateBodyText({ widowMinLines: v })}
        min={1}
        max={5}
        step={1}
        tooltip={labels.bodyWidowMinLinesTooltip}
        isDefault={isWidowMinLinesDefault}
        onReset={() => resetField('widowMinLines')}
      />
      <NumberInput
        label={labels.bodyWidowPenalty}
        value={bodyText.widowPenalty}
        onChange={(v) => updateBodyText({ widowPenalty: v })}
        min={0}
        max={10000}
        step={100}
        tooltip={labels.bodyWidowPenaltyTooltip}
        isDefault={isWidowPenaltyDefault}
        onReset={() => resetField('widowPenalty')}
      />
      <ToggleSwitch
        label={labels.bodyAvoidWidowsInLists}
        checked={bodyText.avoidWidowsInLists}
        onChange={(checked) => updateBodyText({ avoidWidowsInLists: checked })}
        tooltip={labels.bodyAvoidWidowsInListsTooltip}
        isDefault={isAvoidWidowsInListsDefault}
        onReset={() => resetField('avoidWidowsInLists')}
      />
    </NestedGroup>
  );
}

interface RuntsProps {
  bodyText: ResolvedBodyTextConfig;
  isRuntMinCharactersDefault: boolean;
  isRuntPenaltyDefault: boolean;
  isAvoidRuntsInListsDefault: boolean;
  updateBodyText: (partial: Partial<BodyTextConfig>) => void;
  resetField: (field: keyof BodyTextConfig) => void;
  labels: ReturnType<typeof useSandboxLabels>;
}

export function RuntsSubsection({
  bodyText,
  isRuntMinCharactersDefault,
  isRuntPenaltyDefault,
  isAvoidRuntsInListsDefault,
  updateBodyText,
  resetField,
  labels,
}: RuntsProps) {
  return (
    <NestedGroup>
      <NumberInput
        label={labels.bodyRuntMinCharacters}
        value={bodyText.runtMinCharacters}
        onChange={(v) => updateBodyText({ runtMinCharacters: v })}
        min={1}
        max={20}
        step={1}
        tooltip={labels.bodyRuntMinCharactersTooltip}
        isDefault={isRuntMinCharactersDefault}
        onReset={() => resetField('runtMinCharacters')}
      />
      <NumberInput
        label={labels.bodyRuntPenalty}
        value={bodyText.runtPenalty}
        onChange={(v) => updateBodyText({ runtPenalty: v })}
        min={0}
        max={10000}
        step={100}
        tooltip={labels.bodyRuntPenaltyTooltip}
        isDefault={isRuntPenaltyDefault}
        onReset={() => resetField('runtPenalty')}
      />
      <ToggleSwitch
        label={labels.bodyAvoidRuntsInLists}
        checked={bodyText.avoidRuntsInLists}
        onChange={(checked) => updateBodyText({ avoidRuntsInLists: checked })}
        tooltip={labels.bodyAvoidRuntsInListsTooltip}
        isDefault={isAvoidRuntsInListsDefault}
        onReset={() => resetField('avoidRuntsInLists')}
      />
    </NestedGroup>
  );
}
