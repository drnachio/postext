'use client';

// The Line control group of the Body text section: orphans, widows, runts,
// the slack weight and the composition rules of lists (#1463: split out of
// index.tsx). The stacks and the citation and operator breaks are edited in
// the Composition rules section (#1540).
import { DEFAULT_BODY_TEXT_CONFIG, type BodyTextConfig, type ResolvedBodyTextConfig, type ColonListRoom, type CompositionRule } from 'postext';
import { CollapsibleSection, NumberInput, SelectInput, ToggleSwitch } from '../../../../controls/index.js';
import type { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { OrphansSubsection, WidowsSubsection, RuntsSubsection } from './OrphansWidowsRuntsSubsections.js';

const D = DEFAULT_BODY_TEXT_CONFIG;

interface LineControlProps {
  bodyText: ResolvedBodyTextConfig;
  /** The orphan and widow switches' defaults for this document (off on a
   *  character grid, #717). */
  avoidOrphansDefault: boolean;
  avoidWidowsDefault: boolean;
  updateBodyText: (partial: Partial<BodyTextConfig>) => void;
  resetField: (field: keyof BodyTextConfig) => void;
  labels: ReturnType<typeof useSandboxLabels>;
}

export function LineControlSubsection({ bodyText, avoidOrphansDefault, avoidWidowsDefault, updateBodyText, resetField, labels }: LineControlProps) {
  const isAvoidOrphansDefault = bodyText.avoidOrphans === avoidOrphansDefault;
  const isOrphanMinLinesDefault = bodyText.orphanMinLines === D.orphanMinLines;
  const isOrphanPenaltyDefault = bodyText.orphanPenalty === D.orphanPenalty;
  const isAvoidOrphansInListsDefault = bodyText.avoidOrphansInLists === D.avoidOrphansInLists;
  const isAvoidWidowsDefault = bodyText.avoidWidows === avoidWidowsDefault;
  const isWidowMinLinesDefault = bodyText.widowMinLines === D.widowMinLines;
  const isWidowPenaltyDefault = bodyText.widowPenalty === D.widowPenalty;
  const isAvoidWidowsInListsDefault = bodyText.avoidWidowsInLists === D.avoidWidowsInLists;
  const isSlackWeightDefault = bodyText.slackWeight === D.slackWeight;
  const isAvoidRuntsDefault = bodyText.avoidRunts === D.avoidRunts;
  const isRuntMinCharactersDefault = bodyText.runtMinCharacters === D.runtMinCharacters;
  const isRuntPenaltyDefault = bodyText.runtPenalty === D.runtPenalty;
  const isAvoidRuntsInListsDefault = bodyText.avoidRuntsInLists === D.avoidRuntsInLists;
  const isKeepColonWithListDefault = bodyText.keepColonWithList === D.keepColonWithList;
  const isColonListRoomDefault = bodyText.colonListRoom === D.colonListRoom;
  const isShortListSplitDefault = bodyText.shortListSplit === D.shortListSplit;
  const isShortListMaxItemsDefault = bodyText.shortListMaxItems === D.shortListMaxItems;

  const COLON_LIST_ROOM_OPTIONS = [
    { value: 'item', label: labels.bodyColonListRoomItem },
    { value: 'line', label: labels.bodyColonListRoomLine },
  ];

  // The three levels of a composition rule (#749).
  const COMPOSITION_RULE_OPTIONS = [
    { value: 'allow', label: labels.compositionRuleAllow },
    { value: 'warn', label: labels.compositionRuleWarn },
    { value: 'avoid', label: labels.compositionRuleAvoid },
  ];

  return (
    <CollapsibleSection title={labels.bodyGroupLineControl} sectionId="bodyText-lineControl" variant="subsection">
      <ToggleSwitch
        label={labels.bodyAvoidOrphans}
        checked={bodyText.avoidOrphans}
        onChange={(checked) => updateBodyText({ avoidOrphans: checked })}
        tooltip={labels.bodyAvoidOrphansTooltip}
        isDefault={isAvoidOrphansDefault}
        onReset={() => resetField('avoidOrphans')}
      />
      {bodyText.avoidOrphans && (
        <OrphansSubsection
          bodyText={bodyText}
          isOrphanMinLinesDefault={isOrphanMinLinesDefault}
          isOrphanPenaltyDefault={isOrphanPenaltyDefault}
          isAvoidOrphansInListsDefault={isAvoidOrphansInListsDefault}
          updateBodyText={updateBodyText}
          resetField={resetField}
          labels={labels}
        />
      )}
      <ToggleSwitch
        label={labels.bodyAvoidWidows}
        checked={bodyText.avoidWidows}
        onChange={(checked) => updateBodyText({ avoidWidows: checked })}
        tooltip={labels.bodyAvoidWidowsTooltip}
        isDefault={isAvoidWidowsDefault}
        onReset={() => resetField('avoidWidows')}
      />
      {bodyText.avoidWidows && (
        <WidowsSubsection
          bodyText={bodyText}
          isWidowMinLinesDefault={isWidowMinLinesDefault}
          isWidowPenaltyDefault={isWidowPenaltyDefault}
          isAvoidWidowsInListsDefault={isAvoidWidowsInListsDefault}
          updateBodyText={updateBodyText}
          resetField={resetField}
          labels={labels}
        />
      )}
      <ToggleSwitch
        label={labels.bodyAvoidRunts}
        checked={bodyText.avoidRunts}
        onChange={(checked) => updateBodyText({ avoidRunts: checked })}
        tooltip={labels.bodyAvoidRuntsTooltip}
        isDefault={isAvoidRuntsDefault}
        onReset={() => resetField('avoidRunts')}
      />
      {bodyText.avoidRunts && (
        <RuntsSubsection
          bodyText={bodyText}
          isRuntMinCharactersDefault={isRuntMinCharactersDefault}
          isRuntPenaltyDefault={isRuntPenaltyDefault}
          isAvoidRuntsInListsDefault={isAvoidRuntsInListsDefault}
          updateBodyText={updateBodyText}
          resetField={resetField}
          labels={labels}
        />
      )}
      <NumberInput
        label={labels.bodySlackWeight}
        value={bodyText.slackWeight}
        onChange={(v) => updateBodyText({ slackWeight: v })}
        min={0}
        max={1000}
        step={1}
        tooltip={labels.bodySlackWeightTooltip}
        isDefault={isSlackWeightDefault}
        onReset={() => resetField('slackWeight')}
      />
      <ToggleSwitch
        label={labels.bodyKeepColonWithList}
        checked={bodyText.keepColonWithList}
        onChange={(checked) => updateBodyText({ keepColonWithList: checked })}
        tooltip={labels.bodyKeepColonWithListTooltip}
        isDefault={isKeepColonWithListDefault}
        onReset={() => resetField('keepColonWithList')}
      />
      {bodyText.keepColonWithList && (
        <SelectInput
          label={labels.bodyColonListRoom}
          value={bodyText.colonListRoom}
          options={COLON_LIST_ROOM_OPTIONS}
          onChange={(value) => updateBodyText({ colonListRoom: value as ColonListRoom })}
          tooltip={labels.bodyColonListRoomTooltip}
          isDefault={isColonListRoomDefault}
          onReset={() => resetField('colonListRoom')}
        />
      )}
      {/* A short list kept whole (#749): off, reported, or applied. */}
      <SelectInput
        label={labels.bodyShortListSplit}
        value={bodyText.shortListSplit}
        options={COMPOSITION_RULE_OPTIONS}
        onChange={(value) => updateBodyText({ shortListSplit: value as CompositionRule })}
        tooltip={labels.bodyShortListSplitTooltip}
        isDefault={isShortListSplitDefault}
        onReset={() => resetField('shortListSplit')}
      />
      {bodyText.shortListSplit !== 'allow' && (
        <NumberInput
          label={labels.bodyShortListMaxItems}
          value={bodyText.shortListMaxItems}
          onChange={(v) => updateBodyText({ shortListMaxItems: Math.max(1, Math.round(v)) })}
          min={1}
          max={20}
          step={1}
          tooltip={labels.bodyShortListMaxItemsTooltip}
          isDefault={isShortListMaxItemsDefault}
          onReset={() => resetField('shortListMaxItems')}
        />
      )}
    </CollapsibleSection>
  );
}
