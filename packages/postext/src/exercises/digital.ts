/**
 * What the digital outputs (#1230, #1231) need beside the records: the
 * words of the exercise bar, how answers are checked and kept, and each
 * style's colours. The layout carries it on `VDTDocument.exerciseDigital`;
 * `exerciseDataOf` joins it with the records into the JSON the HTML output
 * writes for the exercise script (`attachExercises`, `EXERCISE_SCRIPT`).
 */

import { assessmentLimitsOf, type ExerciseSettings, type ExerciseWords } from '../defaults/boxes/exercises.js';
import type { ExerciseRecord } from './record.js';
import type { Dimension, ExerciseAssessmentConfig } from '../types.js';
import { dimensionToPx } from '../units.js';

/** The words of the digital outputs, in the document language. */
export type ExerciseDigitalWords = Pick<ExerciseWords,
  'exercise' | 'trueFalse' | 'check' | 'showSolution' | 'hideSolution' | 'reset' | 'correct' | 'wrong' | 'hint' | 'blank' | 'score'
  | 'checkLeft' | 'noChecksLeft' | 'resetLeft'>;

/** How one exercise style looks answered. */
export interface ExerciseDigitalStyleInfo {
  /** Right and wrong feedback, and the answers a solution shows. */
  correct: string;
  wrong: string;
  answer: string;
  /** The option marker (`options.marker`): a box or a ring is ticked, a
   *  bare label is ringed. */
  marker: 'none' | 'box' | 'circle';
  /** The true and false labels (`trueFalse.labels`). */
  trueFalse: [string, string];
  /** The matching dots' colour (`match.color`): the lines a reader draws. */
  ink: string;
  /** The limits its exercises keep to (#1268), when any is set: the
   *  style's over the book's. */
  limits?: Required<ExerciseAssessmentConfig>;
}

export interface ExerciseDigital {
  words: ExerciseDigitalWords;
  /** `exercises.digital`. */
  interactive: boolean;
  persist: boolean;
  check: 'button' | 'instant';
  /** `exercises.digital.passingScore`, when set (#1268). */
  passingScore?: number;
  styles: Record<string, ExerciseDigitalStyleInfo>;
}

/** The digital part of a document's exercise settings. */
export function exerciseDigitalOf(settings: ExerciseSettings): ExerciseDigital {
  const w = settings.exercises.words;
  const styles: Record<string, ExerciseDigitalStyleInfo> = {};
  for (const s of settings.styles) {
    if (styles[s.id]) continue;
    styles[s.id] = {
      correct: s.digital.correctColor.hex,
      wrong: s.digital.wrongColor.hex,
      answer: s.answers.color.hex,
      marker: s.options.marker === 'box' || s.options.marker === 'circle' ? s.options.marker : 'none',
      trueFalse: [s.trueFalse.labels[0], s.trueFalse.labels[1]],
      ink: s.match.color.hex,
    };
    const limits = assessmentLimitsOf(s, settings.exercises);
    if (limits.maxChecks > 0 || !limits.reset || limits.maxResets > 0 || limits.showSolution !== 'always') styles[s.id]!.limits = limits;
  }
  return {
    words: {
      exercise: w.exercise, trueFalse: w.trueFalse, check: w.check, showSolution: w.showSolution, hideSolution: w.hideSolution,
      reset: w.reset, correct: w.correct, wrong: w.wrong, hint: w.hint, blank: w.blank, score: w.score,
      checkLeft: w.checkLeft, noChecksLeft: w.noChecksLeft, resetLeft: w.resetLeft,
    },
    interactive: settings.exercises.digital.interactive,
    persist: settings.exercises.digital.persist,
    check: settings.exercises.digital.check,
    ...(settings.exercises.digital.passingScore > 0 ? { passingScore: settings.exercises.digital.passingScore } : {}),
    styles,
  };
}

/** The JSON an HTML output writes for the exercise script
 *  (`<script type="application/json" class="pt-exercises">`). */
export interface ExerciseData extends ExerciseDigital {
  /** Page pixels to a point: grid geometry in the records is in points
   *  from a drawn box's top left. */
  pxPerPt: number;
  /** The body text's size, page pixels: the size of the exercise bar. */
  bodyPx: number;
  /** The body text's colour: what a reader types is set in it. */
  text?: string;
  /** The boxes stand in the text's flow (a reflowable book) rather than
   *  on a positioned page: the bar and the solution follow the box, sized
   *  in ems of its text. */
  flow?: boolean;
  exercises: ExerciseRecord[];
}

/** The exercise data of a laid-out document, or `undefined` when it has
 *  no exercises (or its exercises are not answerable,
 *  `exercises.digital.interactive: false`). */
export function exerciseDataOf(doc: {
  exercises?: ExerciseRecord[];
  exerciseDigital?: ExerciseDigital;
  config: { page: { dpi: number }; bodyText: { fontSize: Dimension; color?: { hex: string } } };
}): ExerciseData | undefined {
  const records = doc.exercises;
  const digital = doc.exerciseDigital;
  if (!records || records.length === 0 || !digital || !digital.interactive) return undefined;
  const pxPerPt = doc.config.page.dpi / 72;
  return {
    ...digital,
    pxPerPt,
    bodyPx: dimensionToPx(doc.config.bodyText.fontSize, doc.config.page.dpi),
    ...(doc.config.bodyText.color ? { text: doc.config.bodyText.color.hex } : {}),
    exercises: records,
  };
}

/** `data` as the text of a `<script type="application/json">`, in HTML
 *  or XHTML: no `<` that would close the element early, no `&` an XML
 *  parser would read as a reference, no line separators a reader might
 *  trip on. */
export function exerciseDataJson(data: ExerciseData): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
