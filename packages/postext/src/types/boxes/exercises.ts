import type { ColorValue, Dimension } from '../page.js';
import type { ResourceCounterFormat, ResourceCounterReset } from '../resources/resourceTypes.js';

// ---------------------------------------------------------------------------
// Exercises (#1226)
// ---------------------------------------------------------------------------

/** The shape an exercise number is set in: bare, in a disc, in a square or
 *  in a square with round corners. */
export type ExerciseNumberShape = 'none' | 'disc' | 'square' | 'rounded';

/** How an exercise's number prints (`exerciseStyles[].number`). */
export interface ExerciseNumberStyle {
  /** Print the number. Default `true`. */
  show?: boolean;
  /** A word before the number ("Exercise 3"): `true` takes the document
   *  language's word, a string is the word itself. Default `false`. */
  label?: boolean | string;
  /** Default `'none'`. */
  shape?: ExerciseNumberShape;
  /** The number's colour. Default white on a shape, else the main colour. */
  color?: ColorValue;
  /** The shape's fill. Default the main colour. */
  background?: ColorValue;
  fontFamily?: string;
  /** Size of the number, `em` being the instruction's. Default `1em`. */
  fontSize?: Dimension;
  /** Default `700`. */
  fontWeight?: number;
  /** Printed after a bare number (and its label). Default `'.'`; a shaped
   *  number takes none. */
  suffix?: string;
  /** What the number reads, `{n}` the exercise's own count, `{h1}`/`{h2}`
   *  the chapter's and section's numbers (as resource templates read them).
   *  Default `'{n}'`. */
  template?: string;
  /** Where the count starts again. Default `'h1'`: each chapter. */
  resetOn?: ResourceCounterReset;
  /** The counter the style advances; styles naming one counter share it.
   *  Default `'exercise'`. */
  counter?: string;
  /** Numerals of `{n}`. Default `'decimal'`. */
  format?: ResourceCounterFormat;
}

/** The instruction's typography (`exerciseStyles[].instruction`): the
 *  exercise's leading paragraphs. Unset fields take the text's. */
export interface ExerciseInstructionStyle {
  /** Default `true`. */
  bold?: boolean;
  italic?: boolean;
  color?: ColorValue;
  fontFamily?: string;
  fontSize?: Dimension;
}

/** The labels a question's options are counted with. */
export type ExerciseOptionLabels = ResourceCounterFormat | 'none';

/** How the options of a choice exercise print (`exerciseStyles[].options`). */
export interface ExerciseOptionsStyle {
  /** Default by language: `'alpha-lower'`, `'alpha-upper'` in Chinese,
   *  `'katakana'` in Japanese, `'abjad'` in Arabic. */
  labels?: ExerciseOptionLabels;
  /** Before the label. Default `''`. */
  prefix?: string;
  /** After the label. Default `')'` (`'.'` in Chinese, none in Japanese). */
  suffix?: string;
  /** A box or a ring to tick before each option. Default `'none'`. */
  marker?: 'none' | 'box' | 'circle';
  /** `'stack'`: one option a line, its turnover lines hung under its text;
   *  `'row'`: the options side by side, `columns` to a line. Default
   *  `'stack'`. */
  layout?: 'stack' | 'row';
  /** Options to a line in a `'row'` layout. Default: all of them. */
  columns?: number;
  /** Print the options in a shuffled order (the same in every output).
   *  Default `false`: as written. */
  shuffle?: boolean;
  /** The options' indent from the text's edge. Default `1em`. */
  indent?: Dimension;
  /** A bracket after a question's stem to write the letter in (`（　）`,
   *  Chinese and Japanese tests). Default `false`. */
  bracket?: boolean;
}

/** How a `[[…]]` prints in the pupil's text (`exerciseStyles[].blank`). */
export interface ExerciseBlankStyle {
  /** A line to write on, a dotted line, a box, or nothing. Default
   *  `'line'`. */
  look?: 'line' | 'dots' | 'box' | 'none';
  /** `'answer'`: as wide as the gap's own answer; `'longest'`: as wide as
   *  the exercise's longest answer, so no blank gives its answer away; or a
   *  length. Default `'longest'`. */
  width?: 'answer' | 'longest' | Dimension;
  /** Room added to the answer's width. Default `1.5em`. */
  extra?: Dimension;
  /** The narrowest blank. Default `3em`. */
  minWidth?: Dimension;
  /** The line's colour. Default the text's. */
  color?: ColorValue;
  /** The line's weight. Default `0.6pt`. */
  weight?: Dimension;
}

/** How a true/false statement prints (`exerciseStyles[].trueFalse`). */
export interface ExerciseTrueFalseStyle {
  /** The two answers. Default by language: T F, V F, R F, √ ×, ○ ×, ✓ ✗. */
  labels?: [string, string];
  /** `'boxes'`: a box beside each label at the line's end; `'bracket'`:
   *  one bracket to write the answer in. Default `'boxes'`. */
  look?: 'boxes' | 'bracket';
  /** Where the boxes or the bracket stand: `'end'`, flush with the line's
   *  end; `'start'`, before the statement, as a Brazilian `( ) frase`
   *  (#1244). Default `'end'`. */
  place?: 'end' | 'start';
}

/** How a match exercise prints (`exerciseStyles[].match`). */
export interface ExerciseMatchStyle {
  /** `'dots'`: two columns with a dot each side to join with a line;
   *  `'letters'`: the right column lettered, a bracket by each left item to
   *  write the letter in. Default `'dots'`. */
  look?: 'dots' | 'letters';
  /** Room between the two columns. Default `4em`. */
  gap?: Dimension;
  /** The dots' diameter. Default `0.35em`. */
  dotSize?: Dimension;
  color?: ColorValue;
}

/** The word bank of a gaps, sort or match exercise (`exerciseStyles[].bank`). */
export interface ExerciseBankStyle {
  /** A `calloutStyles` id for the bank's box. Default a box outlined in the
   *  main colour. */
  box?: string;
  /** Default `'shuffle'`. */
  order?: 'shuffle' | 'alpha' | 'written';
  /** Between two words. Default four spaces. */
  separator?: string;
}

/** A writing area (`exerciseStyles[].area`): under an open question. */
export interface ExerciseAreaStyle {
  /** Ruled lines, a row of dots, a squared grid, French Seyès ruling,
   *  田字格 squares, an empty box, or nothing. Default `'lines'`. */
  kind?: 'lines' | 'dots' | 'grid' | 'seyes' | 'tianzige' | 'box' | 'none';
  /** How many lines tall. Default `3`; a fence's `lines` overrides. */
  lines?: number;
  /** The distance between two lines. Default the text's line height. */
  spacing?: Dimension;
  /** Default a light grey. */
  color?: ColorValue;
  /** Default `0.5pt`. */
  weight?: Dimension;
}

/** The cells of a word search, a crossword and an operation in columns
 *  (`exerciseStyles[].grid`). */
export interface ExerciseGridStyle {
  /** A cell's side. Default `1.6em`. */
  cell?: Dimension;
  fontFamily?: string;
  fontSize?: Dimension;
  color?: ColorValue;
  /** The cells' rules. Default a mid grey. */
  rule?: ColorValue;
  ruleWidth?: Dimension;
  /** A crossword's blocked cells. Default the text colour. */
  blocked?: ColorValue;
  /** Letters set in capitals. Default `true`. */
  uppercase?: boolean;
}

/** Operations in columns (`exerciseStyles[].arithmetic`). */
export interface ExerciseArithmeticStyle {
  /** Long division: `'bracket'` (⟌, the English-speaking world, China,
   *  Japan, India), `'potence'` (the divisor right of the dividend under an
   *  L, the quotient under it: Spain, France, Italy, Portugal, Latin
   *  America), `'inline'` (`864 : 4 = 216` with the steps under it:
   *  Germany). Default by language. */
  division?: 'bracket' | 'potence' | 'inline';
  /** Operations to a row. Default `4`. */
  columns?: number;
  /** A multiplication by a number of two digits or more prints a row for
   *  each partial product (one per digit of the multiplier that is not
   *  zero, each a place further left) and a rule over the result (#1244).
   *  Default `true`. */
  partialProducts?: boolean;
  /** What a long division's working rows hold, and so how many it keeps:
   *  `'products'`, the product of each step and what is left (two rows a
   *  step); `'remainders'`, what is left only, the subtraction done in the
   *  head (one row a step, as Spain, Catalonia and Italy write it). A step
   *  whose quotient digit is 0 takes no row. Default `'remainders'` in
   *  Spanish, Catalan and Italian, `'products'` elsewhere (#1244). */
  working?: 'products' | 'remainders';
}

/** Difficulty marks (`exerciseStyles[].level`): `level=2` prints ●●○. */
export interface ExerciseLevelStyle {
  /** Default `'●'`. */
  glyph?: string;
  /** For the levels not reached. Default `'○'`; `''` prints none. */
  empty?: string;
  /** Default `3`. */
  max?: number;
  color?: ColorValue;
}

/** An activity icon an exercise names (`icon="oral"`). */
export interface ExerciseIcon {
  /** A bitmap or SVG resource. */
  resourceId?: string;
  /** A character, set in `fontFamily`. */
  glyph?: string;
  fontFamily?: string;
  color?: ColorValue;
  /** What it stands for, read aloud and in the tagged PDF. */
  alt?: string;
  /** Its height in ems of the instruction. Default the height of a
   *  capital (`0.75`); beside a shaped number, the shape's height. An icon
   *  beside a shaped number sits on its band, centred on it (#1248). */
  size?: number;
}

/** How answers print where they are shown: a teacher's edition and the
 *  solutions (`exerciseStyles[].answers`). */
export interface ExerciseAnswersStyle {
  /** Default a magenta red, as a teacher's book overprints them. */
  color?: ColorValue;
  fontFamily?: string;
  italic?: boolean;
}

/** Where the solutions print. */
export type ExerciseSolutionPlacement = 'none' | 'after' | 'inverted' | 'chapterEnd' | 'directive';

/** Where and how solutions print (`exercises.solutions`, a style's
 *  `solutions` over it). */
export interface ExerciseSolutionsConfig {
  /** Default `'none'`: none in print; the digital outputs have them. */
  placement?: ExerciseSolutionPlacement;
  /** A `calloutStyles` id for a solution's box. Default a frameless box in
   *  smaller type. */
  box?: string;
  /** The heading of the solutions at the end of a chapter. Default the
   *  document language's word ("Solutions"). */
  heading?: string;
  /** `'key'`: the answers alone (1 b · 2 water); `'full'`: the key, then
   *  each worked solution. Default `'full'`. */
  layout?: 'key' | 'full';
}

/** When an exercise's bar offers its solution (#1268). */
export type ExerciseShowSolution = 'always' | 'afterCheck' | 'noChecksLeft' | 'never';

/** How far a reader may go with an exercise in the digital outputs (HTML,
 *  EPUB, SCORM; #1268): the limits that turn practice into a test. Set
 *  for the book in `exercises.digital`, for a style in its `digital`. */
export interface ExerciseAssessmentConfig {
  /** Check presses an attempt allows: once they are spent, the answers
   *  lock until Try again starts a new attempt. `0`: no limit. Default
   *  `0`. Not with `check: 'instant'`, which has no Check button. */
  maxChecks?: number;
  /** Offer Try again, which clears the answers and starts a new attempt.
   *  Default `true`. */
  reset?: boolean;
  /** Try again uses allowed: `maxResets + 1` attempts in all. `0`: no
   *  limit. Default `0`. */
  maxResets?: number;
  /** When the bar offers Show solution: `'always'`; `'afterCheck'`, once
   *  the attempt has been checked; `'noChecksLeft'`, once the attempt's
   *  checks are spent or its answers checked all right; `'never'`. Showing
   *  the solution ends the attempt when checks are limited. Default
   *  `'always'`. */
  showSolution?: ExerciseShowSolution;
}

/** How an exercise behaves in the HTML and EPUB outputs
 *  (`exerciseStyles[].digital`): its colours, and limits over the book's
 *  (`exercises.digital`). */
export interface ExerciseDigitalStyle extends ExerciseAssessmentConfig {
  /** Default a green. */
  correctColor?: ColorValue;
  /** Default a red. */
  wrongColor?: ColorValue;
}

/**
 * A named exercise style (#1226), picked with `:::exercise{style="…"}`: the
 * form of a family of exercises. The first style is the default; one,
 * `exercise`, ships when none is declared. Every field is optional.
 */
export interface ExerciseStyleConfig {
  id: string;
  /** Human-readable name (editor UI only). */
  name?: string;
  /** The id of a style this one is based on. */
  extends?: string;
  /** A `calloutStyles` id for the exercise's frame. Default none: the
   *  exercise is set in the text. */
  box?: string;
  number?: ExerciseNumberStyle;
  instruction?: ExerciseInstructionStyle;
  options?: ExerciseOptionsStyle;
  blank?: ExerciseBlankStyle;
  trueFalse?: ExerciseTrueFalseStyle;
  match?: ExerciseMatchStyle;
  bank?: ExerciseBankStyle;
  area?: ExerciseAreaStyle;
  grid?: ExerciseGridStyle;
  arithmetic?: ExerciseArithmeticStyle;
  level?: ExerciseLevelStyle;
  icons?: Record<string, ExerciseIcon>;
  answers?: ExerciseAnswersStyle;
  solutions?: ExerciseSolutionsConfig;
  digital?: ExerciseDigitalStyle;
  /** Room above and below the exercise. Default `1em` / `1em`. */
  marginTop?: Dimension;
  marginBottom?: Dimension;
  /** Room between two items (options, questions, pairs). Default `0.25em`. */
  itemSpacing?: Dimension;
}

/** The book's exercise settings (#1226). */
export interface ExercisesConfig {
  /** `'teacher'` prints every answer in its slot in `answers.color`: a
   *  teacher's book from the pupil's text. Default `'student'`. */
  edition?: 'student' | 'teacher';
  solutions?: ExerciseSolutionsConfig;
  /** What shuffles are drawn from: change it for another version of a
   *  test. Default `1`. */
  seed?: number;
  /** The HTML, EPUB and SCORM outputs. */
  digital?: ExerciseAssessmentConfig & {
    /** Answerable exercises. Default `true`. */
    interactive?: boolean;
    /** Keep the reader's answers in the browser. Default `true`. */
    persist?: boolean;
    /** `'button'`: checked on demand; `'instant'`: as answered. Default
     *  `'button'`. */
    check?: 'button' | 'instant';
    /** The score that passes, a percentage of the graded slots right
     *  (#1268): a SCORM package reports passed or failed against it.
     *  `0`: none, no pass or fail. Default `0`. */
    passingScore?: number;
  };
}
