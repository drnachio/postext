/**
 * The checks of the exercise settings (#1226): a key an exercise style, one
 * of its parts or the book's `exercises` do not have (`unknownConfigKey`),
 * a word outside a setting's choices (`unknownConfigValue`, `used` the
 * default the engine reads instead) and a numbering style it does not know
 * (`unknownNumberFormat`).
 */

import type {
  ExerciseAnswersStyle,
  ExerciseArithmeticStyle,
  ExerciseAreaStyle,
  ExerciseBankStyle,
  ExerciseBlankStyle,
  ExerciseDigitalStyle,
  ExerciseGridStyle,
  ExerciseIcon,
  ExerciseInstructionStyle,
  ExerciseLevelStyle,
  ExerciseMatchStyle,
  ExerciseNumberStyle,
  ExerciseOptionsStyle,
  ExercisesConfig,
  ExerciseSolutionsConfig,
  ExerciseStyleConfig,
  ExerciseTrueFalseStyle,
  PostextConfig,
} from '../types.js';
import type { ConfigWarning } from '../vdt.js';
import { closestKey } from '../util/closestKey.js';
import { isCounterStyle } from '../numerals/numbering.js';
import { isResourceCounterReset } from '../defaults/resources/resourceTypes.js';

// The keys of each part, checked against its type: a key added to a type
// fails to compile until it is listed here.
const STYLE_KEYS = {
  id: true, name: true, extends: true, box: true, number: true, instruction: true, options: true, blank: true,
  trueFalse: true, match: true, bank: true, area: true, grid: true, arithmetic: true, level: true, icons: true,
  answers: true, solutions: true, digital: true, marginTop: true, marginBottom: true, itemSpacing: true,
} satisfies Record<keyof ExerciseStyleConfig, true>;
const NUMBER_KEYS = {
  show: true, label: true, shape: true, color: true, background: true, fontFamily: true, fontSize: true,
  fontWeight: true, suffix: true, template: true, resetOn: true, counter: true, format: true,
} satisfies Record<keyof ExerciseNumberStyle, true>;
const INSTRUCTION_KEYS = { bold: true, italic: true, color: true, fontFamily: true, fontSize: true } satisfies Record<keyof ExerciseInstructionStyle, true>;
const OPTIONS_KEYS = {
  labels: true, prefix: true, suffix: true, marker: true, layout: true, columns: true, shuffle: true, indent: true, bracket: true,
} satisfies Record<keyof ExerciseOptionsStyle, true>;
const BLANK_KEYS = { look: true, width: true, extra: true, minWidth: true, color: true, weight: true } satisfies Record<keyof ExerciseBlankStyle, true>;
const TRUE_FALSE_KEYS = { labels: true, look: true, place: true } satisfies Record<keyof ExerciseTrueFalseStyle, true>;
const MATCH_KEYS = { look: true, gap: true, dotSize: true, color: true } satisfies Record<keyof ExerciseMatchStyle, true>;
const BANK_KEYS = { box: true, order: true, separator: true } satisfies Record<keyof ExerciseBankStyle, true>;
const AREA_KEYS = { kind: true, lines: true, spacing: true, color: true, weight: true } satisfies Record<keyof ExerciseAreaStyle, true>;
const GRID_KEYS = {
  cell: true, fontFamily: true, fontSize: true, color: true, rule: true, ruleWidth: true, blocked: true, uppercase: true,
} satisfies Record<keyof ExerciseGridStyle, true>;
const ARITHMETIC_KEYS = { division: true, columns: true, partialProducts: true, working: true } satisfies Record<keyof ExerciseArithmeticStyle, true>;
const LEVEL_KEYS = { glyph: true, empty: true, max: true, color: true } satisfies Record<keyof ExerciseLevelStyle, true>;
const ICON_KEYS = { resourceId: true, glyph: true, fontFamily: true, color: true, alt: true, size: true } satisfies Record<keyof ExerciseIcon, true>;
const ANSWERS_KEYS = { color: true, fontFamily: true, italic: true } satisfies Record<keyof ExerciseAnswersStyle, true>;
const SOLUTIONS_KEYS = { placement: true, box: true, heading: true, layout: true } satisfies Record<keyof ExerciseSolutionsConfig, true>;
const ASSESSMENT_KEYS = { maxChecks: true, reset: true, maxResets: true, showSolution: true } as const;
const DIGITAL_KEYS = { correctColor: true, wrongColor: true, ...ASSESSMENT_KEYS } satisfies Record<keyof ExerciseDigitalStyle, true>;
const EXERCISES_KEYS = { edition: true, solutions: true, seed: true, digital: true } satisfies Record<keyof ExercisesConfig, true>;
const EXERCISES_DIGITAL_KEYS = { interactive: true, persist: true, check: true, passingScore: true, ...ASSESSMENT_KEYS } satisfies Record<keyof NonNullable<ExercisesConfig['digital']>, true>;

/** The words each setting takes, and the one read in place of another. */
const CHOICES = {
  shape: [['none', 'disc', 'square', 'rounded'], 'none'],
  marker: [['none', 'box', 'circle'], 'none'],
  layout: [['stack', 'row'], 'stack'],
  blankLook: [['line', 'dots', 'box', 'none'], 'line'],
  blankWidth: [['answer', 'longest'], 'longest'],
  trueFalseLook: [['boxes', 'bracket'], 'boxes'],
  trueFalsePlace: [['end', 'start'], 'end'],
  matchLook: [['dots', 'letters'], 'dots'],
  order: [['shuffle', 'alpha', 'written'], 'shuffle'],
  area: [['lines', 'dots', 'grid', 'seyes', 'tianzige', 'box', 'none'], 'lines'],
  division: [['bracket', 'potence', 'inline'], 'bracket'],
  working: [['products', 'remainders'], 'products'],
  placement: [['none', 'after', 'inverted', 'chapterEnd', 'directive'], 'none'],
  solutionsLayout: [['key', 'full'], 'full'],
  edition: [['student', 'teacher'], 'student'],
  check: [['button', 'instant'], 'button'],
  showSolution: [['always', 'afterCheck', 'noChecksLeft', 'never'], 'always'],
} as const satisfies Record<string, readonly [readonly string[], string]>;

const record = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined;

export function exerciseConfigWarnings(config: Pick<PostextConfig, 'exerciseStyles' | 'exercises'>): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  const keys = (node: unknown, known: Record<string, true>, path: string): void => {
    const r = record(node);
    if (!r) return;
    const names = Object.keys(known);
    for (const [key, value] of Object.entries(r)) {
      if (value === undefined || Object.prototype.hasOwnProperty.call(known, key)) continue;
      const suggestion = closestKey(key, names);
      out.push({ kind: 'unknownConfigKey', path: `${path}.${key}`, value: key, used: '', ...(suggestion ? { suggestion } : {}) });
    }
  };
  const choice = (value: unknown, [choices, used]: readonly [readonly string[], string], path: string): void => {
    if (value === undefined || (typeof value === 'string' && choices.includes(value))) return;
    const written = String(value);
    const suggestion = closestKey(written, [...choices]);
    out.push({ kind: 'unknownConfigValue', path, value: written, used, ...(suggestion ? { suggestion } : {}) });
  };
  const format = (value: unknown, path: string, none: boolean): void => {
    if (value === undefined || (none && value === 'none') || (typeof value === 'string' && isCounterStyle(value))) return;
    out.push({ kind: 'unknownNumberFormat', path, value: String(value), used: 'decimal' });
  };
  const solutions = (node: unknown, path: string): void => {
    const s = record(node);
    if (!s) return;
    keys(s, SOLUTIONS_KEYS, path);
    choice(s.placement, CHOICES.placement, `${path}.placement`);
    choice(s.layout, CHOICES.solutionsLayout, `${path}.layout`);
  };

  if (Array.isArray(config.exerciseStyles)) {
    config.exerciseStyles.forEach((raw, i) => {
      const s = record(raw);
      if (!s) return;
      const at = `exerciseStyles[${i}]`;
      keys(s, STYLE_KEYS, at);
      const number = record(s.number);
      if (number) {
        keys(number, NUMBER_KEYS, `${at}.number`);
        choice(number.shape, CHOICES.shape, `${at}.number.shape`);
        if (number.resetOn !== undefined && !isResourceCounterReset(number.resetOn)) {
          out.push({ kind: 'unknownConfigValue', path: `${at}.number.resetOn`, value: String(number.resetOn), used: 'h1' });
        }
        format(number.format, `${at}.number.format`, false);
      }
      keys(s.instruction, INSTRUCTION_KEYS, `${at}.instruction`);
      const options = record(s.options);
      if (options) {
        keys(options, OPTIONS_KEYS, `${at}.options`);
        format(options.labels, `${at}.options.labels`, true);
        choice(options.marker, CHOICES.marker, `${at}.options.marker`);
        choice(options.layout, CHOICES.layout, `${at}.options.layout`);
      }
      const blank = record(s.blank);
      if (blank) {
        keys(blank, BLANK_KEYS, `${at}.blank`);
        choice(blank.look, CHOICES.blankLook, `${at}.blank.look`);
        // A length, or one of two words.
        if (typeof blank.width === 'string') choice(blank.width, CHOICES.blankWidth, `${at}.blank.width`);
      }
      const trueFalse = record(s.trueFalse);
      if (trueFalse) {
        keys(trueFalse, TRUE_FALSE_KEYS, `${at}.trueFalse`);
        choice(trueFalse.look, CHOICES.trueFalseLook, `${at}.trueFalse.look`);
        choice(trueFalse.place, CHOICES.trueFalsePlace, `${at}.trueFalse.place`);
      }
      const match = record(s.match);
      if (match) {
        keys(match, MATCH_KEYS, `${at}.match`);
        choice(match.look, CHOICES.matchLook, `${at}.match.look`);
      }
      const bank = record(s.bank);
      if (bank) {
        keys(bank, BANK_KEYS, `${at}.bank`);
        choice(bank.order, CHOICES.order, `${at}.bank.order`);
      }
      const area = record(s.area);
      if (area) {
        keys(area, AREA_KEYS, `${at}.area`);
        choice(area.kind, CHOICES.area, `${at}.area.kind`);
      }
      keys(s.grid, GRID_KEYS, `${at}.grid`);
      const arithmetic = record(s.arithmetic);
      if (arithmetic) {
        keys(arithmetic, ARITHMETIC_KEYS, `${at}.arithmetic`);
        choice(arithmetic.division, CHOICES.division, `${at}.arithmetic.division`);
        choice(arithmetic.working, CHOICES.working, `${at}.arithmetic.working`);
      }
      keys(s.level, LEVEL_KEYS, `${at}.level`);
      const icons = record(s.icons);
      if (icons) for (const [id, icon] of Object.entries(icons)) keys(icon, ICON_KEYS, `${at}.icons.${id}`);
      keys(s.answers, ANSWERS_KEYS, `${at}.answers`);
      solutions(s.solutions, `${at}.solutions`);
      keys(s.digital, DIGITAL_KEYS, `${at}.digital`);
      choice(record(s.digital)?.showSolution, CHOICES.showSolution, `${at}.digital.showSolution`);
    });
  }

  const book = record(config.exercises);
  if (book) {
    keys(book, EXERCISES_KEYS, 'exercises');
    choice(book.edition, CHOICES.edition, 'exercises.edition');
    solutions(book.solutions, 'exercises.solutions');
    const digital = record(book.digital);
    if (digital) {
      keys(digital, EXERCISES_DIGITAL_KEYS, 'exercises.digital');
      choice(digital.check, CHOICES.check, 'exercises.digital.check');
      choice(digital.showSolution, CHOICES.showSolution, 'exercises.digital.showSolution');
    }
  }
  return out;
}
