'use client';

import { memo } from 'react';
import type { ExercisesConfig, ExerciseSolutionsConfig } from 'postext';
import { resolveExercisesConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import { CollapsibleSection, NumberInput, SelectInput, ToggleSwitch } from '../../controls/index.js';
import { AssessmentFields, SolutionsFields, exerciseLocaleOf } from './exerciseFields.js';

type Digital = NonNullable<ExercisesConfig['digital']>;

/** Config-panel section for the book's exercise settings (#1226,
 *  `config.exercises`): the edition, where the solutions print, the seed
 *  the shuffles are drawn from, how the digital outputs let a reader
 *  answer and the limits of an attempt with the passing score (#1268). */
export const ExercisesSection = memo(function ExercisesSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.exercises);
  const calloutStyles = useSandboxSelector((s) => s.config.calloutStyles);
  const locale = useSandboxSelector(exerciseLocaleOf);
  const resolved = resolveExercisesConfig(raw, locale);

  const write = (next: ExercisesConfig) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { exercises: Object.keys(next).length > 0 ? next : undefined } });
  };
  const update = (partial: Partial<ExercisesConfig>) => write({ ...raw, ...partial });
  const resetField = (field: keyof ExercisesConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    write(next);
  };
  const setSolutions = (partial: Partial<ExerciseSolutionsConfig>) => update({ solutions: { ...raw?.solutions, ...partial } });
  const resetSolutions = (field: keyof ExerciseSolutionsConfig) => {
    const next = { ...raw?.solutions };
    delete next[field];
    if (Object.keys(next).length > 0) update({ solutions: next });
    else resetField('solutions');
  };
  const setDigital = (partial: Partial<Digital>) => update({ digital: { ...raw?.digital, ...partial } });
  const resetDigital = (field: keyof Digital) => {
    const next = { ...raw?.digital };
    delete next[field];
    if (Object.keys(next).length > 0) update({ digital: next });
    else resetField('digital');
  };

  return (
    <CollapsibleSection
      title={labels.exercisesSection}
      sectionId="exercises"
      hasOverrides={raw !== undefined && Object.keys(raw).length > 0}
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { exercises: undefined } })}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.exercisesResetConfirm}
    >
      <SelectInput
        label={labels.exercisesEdition}
        value={resolved.edition}
        options={[
          { value: 'student', label: labels.exercisesEditionStudent },
          { value: 'teacher', label: labels.exercisesEditionTeacher },
        ]}
        onChange={(v) => update({ edition: v as ExercisesConfig['edition'] })}
        variant="segmented"
        tooltip={labels.exercisesEditionTooltip}
        isDefault={raw?.edition === undefined}
        onReset={() => resetField('edition')}
      />
      <NumberInput
        label={labels.exercisesSeed}
        value={resolved.seed}
        onChange={(v) => update({ seed: Math.floor(v) })}
        min={1}
        max={9999}
        step={1}
        tooltip={labels.exercisesSeedTooltip}
        isDefault={raw?.seed === undefined}
        onReset={() => resetField('seed')}
      />
      <CollapsibleSection title={labels.exercisesSolutionsGroup} sectionId="exercises.solutions" variant="subsection">
        <SolutionsFields own={raw?.solutions} shown={resolved.solutions} calloutStyles={calloutStyles} set={setSolutions} reset={resetSolutions} />
      </CollapsibleSection>
      <CollapsibleSection title={labels.exercisesDigitalGroup} sectionId="exercises.digital" variant="subsection">
        <ToggleSwitch
          label={labels.exercisesDigitalInteractive}
          tooltip={labels.exercisesDigitalInteractiveTooltip}
          checked={resolved.digital.interactive}
          onChange={(v) => setDigital({ interactive: v })}
          isDefault={raw?.digital?.interactive === undefined}
          onReset={() => resetDigital('interactive')}
        />
        <ToggleSwitch
          label={labels.exercisesDigitalPersist}
          tooltip={labels.exercisesDigitalPersistTooltip}
          checked={resolved.digital.persist}
          onChange={(v) => setDigital({ persist: v })}
          isDefault={raw?.digital?.persist === undefined}
          onReset={() => resetDigital('persist')}
        />
        <SelectInput
          label={labels.exercisesDigitalCheck}
          value={resolved.digital.check}
          options={[
            { value: 'button', label: labels.exercisesDigitalCheckButton },
            { value: 'instant', label: labels.exercisesDigitalCheckInstant },
          ]}
          onChange={(v) => setDigital({ check: v as Digital['check'] })}
          variant="segmented"
          tooltip={labels.exercisesDigitalCheckTooltip}
          isDefault={raw?.digital?.check === undefined}
          onReset={() => resetDigital('check')}
        />
      </CollapsibleSection>
      <CollapsibleSection title={labels.exercisesAssessmentGroup} sectionId="exercises.assessment" variant="subsection">
        <AssessmentFields
          shown={resolved.digital}
          unset={(field) => raw?.digital?.[field] === undefined}
          set={setDigital}
          reset={resetDigital}
        />
        <NumberInput
          label={labels.exercisesPassingScore}
          value={resolved.digital.passingScore}
          onChange={(v) => setDigital({ passingScore: Math.max(0, Math.min(100, v)) })}
          min={0}
          max={100}
          step={5}
          suffix="%"
          tooltip={labels.exercisesPassingScoreTooltip}
          isDefault={raw?.digital?.passingScore === undefined}
          onReset={() => resetDigital('passingScore')}
        />
      </CollapsibleSection>
    </CollapsibleSection>
  );
});
