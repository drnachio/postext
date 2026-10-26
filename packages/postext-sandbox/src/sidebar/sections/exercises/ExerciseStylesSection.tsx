'use client';

import { memo } from 'react';
import { Plus } from 'lucide-react';
import { type ExerciseStyleConfig, resolveBodyTextConfig, DEFAULT_EXERCISE_STYLES, resolveExerciseStylesConfig, resolveExercisesConfig, resolveColorValue, DEFAULT_MAIN_COLOR, exerciseWords } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector, useSandboxResources } from '../../../context/SandboxContext.js';
import { openCard, moveCardState, CollapsibleSection, ItemCardListActions } from '../../../controls/index.js';
import { Button } from '../../../ui/index.js';
import { useBookTexts } from '../../../frameStyles/useBookTexts.js';
import { applyExerciseStyleRename, planExerciseStyleRename } from '../../../frameStyles/exerciseRefs.js';
import { exerciseLocaleOf } from './exerciseFields.js';
import { ExerciseStyleCard } from './ExerciseStylesSection/ExerciseStyleCard.js';
import { uniqueId } from './ExerciseStylesSection/shared.js';

/** The styles `style` may be based on: not itself, nor one based on it
 *  (directly or further down), which would close a loop. */
function parentsOf(styles: readonly ExerciseStyleConfig[], style: ExerciseStyleConfig): { id: string; name: string }[] {
  const byId = new Map(styles.map((s) => [s.id, s]));
  const leadsTo = (s: ExerciseStyleConfig): boolean => {
    const seen = new Set<string>();
    for (let p: ExerciseStyleConfig | undefined = s; p && !seen.has(p.id); p = p.extends ? byId.get(p.extends) : undefined) {
      if (p.id === style.id) return true;
      seen.add(p.id);
    }
    return false;
  };
  return styles.filter((s) => s.id !== style.id && !leadsTo(s)).map((s) => ({ id: s.id, name: s.name || s.id }));
}

/** Config-panel section for the named exercise styles picked with
 *  `:::exercise{style="…"}` (#1226, `config.exerciseStyles`). While the
 *  config has no list, the built-in `exercise` style is shown so it can be
 *  edited in place. */
export const ExerciseStylesSection = memo(function ExerciseStylesSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.exerciseStyles);
  const rawBook = useSandboxSelector((s) => s.config.exercises);
  const calloutStyles = useSandboxSelector((s) => s.config.calloutStyles);
  const palette = useSandboxSelector((s) => s.config.colorPalette);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const locale = useSandboxSelector(exerciseLocaleOf);
  const resources = useSandboxResources();
  const chapters = useBookTexts();
  const activeChapterId = useSandboxSelector((s) => s.activeChapterId);
  const iconResources = resources.filter((r) => r.kind === 'svg' || r.kind === 'bitmap');
  const bodyText = resolveBodyTextConfig(bodyTextRaw);
  const styles: ExerciseStyleConfig[] = raw ?? DEFAULT_EXERCISE_STYLES;
  const resolved = resolveExerciseStylesConfig(styles, locale, palette);
  const book = resolveExercisesConfig(rawBook, locale);
  const mainColor = resolveColorValue(DEFAULT_MAIN_COLOR, palette, DEFAULT_MAIN_COLOR);
  const word = exerciseWords(locale).exercise;

  const write = (next: ExerciseStyleConfig[]) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { exerciseStyles: next.length > 0 ? next : undefined } });
  };

  const addStyle = () => {
    const id = uniqueId('exercise', new Set(styles.map((s) => s.id)));
    openCard('exerciseStyles', id);
    write([...styles, { id, name: labels.exerciseStyleNewName }]);
  };

  const duplicateStyle = (id: string) => {
    const index = styles.findIndex((s) => s.id === id);
    const source = styles[index];
    if (!source) return;
    const copy: ExerciseStyleConfig = structuredClone({ ...source, id: uniqueId(`${source.id}-copy`, new Set(styles.map((s) => s.id))) });
    openCard('exerciseStyles', copy.id);
    const next = styles.slice();
    next.splice(index + 1, 0, copy);
    write(next);
  };

  const updateStyle = (id: string, partial: Partial<ExerciseStyleConfig>) => {
    write(styles.map((s) => (s.id === id ? { ...s, ...partial } : s)));
  };

  const resetStyleField = (id: string, field: keyof ExerciseStyleConfig) => {
    write(
      styles.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s };
        delete next[field];
        return next;
      }),
    );
  };

  /** A style based on the renamed one names it by its new id, and so does
   *  every `:::exercise{style}` fence of the book (#1244). */
  const renameStyle = (id: string, nextId: string) => {
    if (styles.some((s) => s.id === nextId)) return;
    moveCardState('exerciseStyles', id, nextId);
    applyExerciseStyleRename(dispatch, planExerciseStyleRename(styles, chapters, id, nextId), activeChapterId);
  };

  /** A style based on the removed one takes its parent instead (or none). */
  const removeStyle = (id: string) => {
    const gone = styles.find((s) => s.id === id);
    write(styles.filter((s) => s.id !== id).map((s) => {
      if (s.extends !== id) return s;
      const next = { ...s };
      if (gone?.extends) next.extends = gone.extends;
      else delete next.extends;
      return next;
    }));
  };

  return (
    <CollapsibleSection
      title={labels.exerciseStylesSection}
      sectionId="exerciseStyles"
      hasOverrides={raw !== undefined}
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { exerciseStyles: undefined } })}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.exerciseStylesResetConfirm}
    >
      <ItemCardListActions list="exerciseStyles" ids={styles.map((s) => s.id)} />
      {styles.map((style, i) => (
        <ExerciseStyleCard
          key={style.id}
          style={style}
          resolved={resolved[i]!}
          book={book}
          bodyText={bodyText}
          mainColor={mainColor}
          word={word}
          calloutStyles={calloutStyles}
          iconResources={iconResources}
          otherIds={new Set(styles.filter((s) => s.id !== style.id).map((s) => s.id))}
          parents={parentsOf(styles, style)}
          stored={raw !== undefined}
          onChange={(partial) => updateStyle(style.id, partial)}
          onResetField={(field) => resetStyleField(style.id, field)}
          onRename={(nextId) => renameStyle(style.id, nextId)}
          onDuplicate={() => duplicateStyle(style.id)}
          onRemove={() => removeStyle(style.id)}
        />
      ))}
      <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={addStyle} className="mt-1">
        {labels.exerciseStyleAdd}
      </Button>
    </CollapsibleSection>
  );
});
