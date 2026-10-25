'use client';

// What the exercise styles and the book's exercise settings (#1226) share:
// the box styles a field may name, and the solutions and assessment fields
// (#1268), which a style sets over the book's.

import type { CalloutStyleConfig, ExerciseAssessmentConfig, ExerciseShowSolution, ExerciseSolutionPlacement, ExerciseSolutionsConfig, PostextConfig } from 'postext';
import { DEFAULT_CALLOUT_STYLES } from 'postext';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { NumberInput, SelectInput, TextInput, ToggleSwitch } from '../../controls/index.js';

interface AssessmentFieldsProps {
  /** What each field comes to (the book's value where a style leaves it). */
  shown: Required<ExerciseAssessmentConfig>;
  /** Whether a field is unset where the fields write. */
  unset: (field: keyof ExerciseAssessmentConfig) => boolean;
  set: (partial: Partial<ExerciseAssessmentConfig>) => void;
  reset: (field: keyof ExerciseAssessmentConfig) => void;
}

/** The limits of an attempt (#1268): checks, Try again and its uses, and
 *  when the solution shows. */
export function AssessmentFields({ shown, unset, set, reset }: AssessmentFieldsProps) {
  const labels = useSandboxLabels();
  const row = (field: keyof ExerciseAssessmentConfig) => ({ isDefault: unset(field), onReset: () => reset(field) });
  return (
    <>
      <NumberInput label={labels.exercisesMaxChecks} value={shown.maxChecks} onChange={(v) => set({ maxChecks: Math.max(0, Math.floor(v)) })} min={0} max={99} step={1} tooltip={labels.exercisesMaxChecksTooltip} {...row('maxChecks')} />
      <ToggleSwitch label={labels.exercisesReset} tooltip={labels.exercisesResetTooltip} checked={shown.reset} onChange={(v) => set({ reset: v })} {...row('reset')} />
      {shown.reset && (
        <NumberInput label={labels.exercisesMaxResets} value={shown.maxResets} onChange={(v) => set({ maxResets: Math.max(0, Math.floor(v)) })} min={0} max={99} step={1} tooltip={labels.exercisesMaxResetsTooltip} {...row('maxResets')} />
      )}
      <SelectInput
        label={labels.exercisesShowSolution}
        value={shown.showSolution}
        options={[
          { value: 'always', label: labels.exercisesShowSolutionAlways },
          { value: 'afterCheck', label: labels.exercisesShowSolutionAfterCheck },
          { value: 'noChecksLeft', label: labels.exercisesShowSolutionNoChecksLeft },
          { value: 'never', label: labels.exercisesShowSolutionNever },
        ]}
        onChange={(v) => set({ showSolution: v as ExerciseShowSolution })}
        tooltip={labels.exercisesShowSolutionTooltip}
        {...row('showSolution')}
      />
    </>
  );
}

/** The document language the exercise words follow, as the engine reads
 *  it (the Sandbox's language when the book names none). */
export function exerciseLocaleOf(s: { config: PostextConfig; locale: string }): string {
  return s.config.locale ?? s.config.bodyText?.hyphenation?.locale ?? s.locale;
}

/** The box styles a setting may name, as options: the book's own (the
 *  internal styles of a build never), after `none` (the value `''`). A
 *  value no style has stays selectable until it is changed. */
export function boxStyleOptions(calloutStyles: readonly CalloutStyleConfig[] | undefined, none: string, value: string | undefined): { value: string; label: string }[] {
  const styles = (calloutStyles ?? DEFAULT_CALLOUT_STYLES).filter((s) => !s.id.startsWith('__postext-'));
  const options = [{ value: '', label: none }, ...styles.map((s) => ({ value: s.id, label: s.name || s.id }))];
  if (value && !styles.some((s) => s.id === value)) options.push({ value, label: value });
  return options;
}

interface SolutionsFieldsProps {
  /** What is set where the fields write (the book's settings or a style's). */
  own: ExerciseSolutionsConfig | undefined;
  /** What each field comes to when `own` leaves it unset. */
  shown: Required<Omit<ExerciseSolutionsConfig, 'box'>> & { box?: string };
  calloutStyles: readonly CalloutStyleConfig[] | undefined;
  set: (partial: Partial<ExerciseSolutionsConfig>) => void;
  reset: (field: keyof ExerciseSolutionsConfig) => void;
}

/** Where the solutions print, in what box, under what heading, and
 *  whether the worked solutions follow the key. */
export function SolutionsFields({ own, shown, calloutStyles, set, reset }: SolutionsFieldsProps) {
  const labels = useSandboxLabels();
  const unset = (field: keyof ExerciseSolutionsConfig) => own?.[field] === undefined;
  const placements: { value: ExerciseSolutionPlacement; label: string }[] = [
    { value: 'none', label: labels.exercisesPlacementNone },
    { value: 'after', label: labels.exercisesPlacementAfter },
    { value: 'inverted', label: labels.exercisesPlacementInverted },
    { value: 'chapterEnd', label: labels.exercisesPlacementChapterEnd },
    { value: 'directive', label: labels.exercisesPlacementDirective },
  ];
  return (
    <>
      <SelectInput
        label={labels.exercisesSolutionsPlacement}
        value={shown.placement}
        options={placements}
        onChange={(v) => set({ placement: v as ExerciseSolutionPlacement })}
        tooltip={labels.exercisesSolutionsPlacementTooltip}
        isDefault={unset('placement')}
        onReset={() => reset('placement')}
      />
      <SelectInput
        label={labels.exercisesSolutionsBox}
        value={shown.box ?? ''}
        options={boxStyleOptions(calloutStyles, labels.exercisesSolutionsBoxDefault, shown.box)}
        onChange={(v) => (v === '' ? reset('box') : set({ box: v }))}
        tooltip={labels.exercisesSolutionsBoxTooltip}
        isDefault={unset('box')}
        onReset={() => reset('box')}
      />
      <TextInput
        label={labels.exercisesSolutionsHeading}
        value={shown.heading}
        onChange={(v) => set({ heading: v })}
        tooltip={labels.exercisesSolutionsHeadingTooltip}
        isDefault={unset('heading')}
        onReset={() => reset('heading')}
      />
      <SelectInput
        label={labels.exercisesSolutionsLayout}
        value={shown.layout}
        options={[
          { value: 'key', label: labels.exercisesSolutionsLayoutKey },
          { value: 'full', label: labels.exercisesSolutionsLayoutFull },
        ]}
        onChange={(v) => set({ layout: v as 'key' | 'full' })}
        variant="segmented"
        isDefault={unset('layout')}
        onReset={() => reset('layout')}
      />
    </>
  );
}
