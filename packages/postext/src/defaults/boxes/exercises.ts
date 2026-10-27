/**
 * Exercise styles and settings (#1226): defaults, the words each document
 * language prints, `extends` chains, and stripping for storage.
 *
 * A configuration that names neither `exerciseStyles` nor `exercises`
 * resolves (and hashes) as before: the resolved config carries them only
 * when set, and {@link exerciseSettingsOf} gives the defaults otherwise.
 */

import type {
  ColorPaletteEntry,
  ColorValue,
  Dimension,
  ExerciseAnswersStyle,
  ExerciseArithmeticStyle,
  ExerciseAssessmentConfig,
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
  ExerciseShowSolution,
  ExercisesConfig,
  ExerciseSolutionsConfig,
  ExerciseStyleConfig,
  ExerciseTrueFalseStyle,
  PostextConfig,
} from '../../types.js';
import { DEFAULT_MAIN_COLOR, resolveColorValue } from '../shared.js';

const EM = (value: number): Dimension => ({ value, unit: 'em' });
const PT = (value: number): Dimension => ({ value, unit: 'pt' });
const HEX = (hex: string): ColorValue => ({ hex, model: 'hex' });

/** The words the engine prints for exercises, in one language. */
export interface ExerciseWords {
  exercise: string;
  trueFalse: [string, string];
  solutions: string;
  check: string;
  showSolution: string;
  hideSolution: string;
  reset: string;
  correct: string;
  wrong: string;
  hint: string;
  blank: string;
  /** "Exercise 3 · 2 of 5 right" */
  score: string;
  /** A crossword's clue lists. */
  across: string;
  down: string;
  /** The Check button while an attempt's checks are limited (#1268):
   *  `{n}` checks left. */
  checkLeft: string;
  /** The Check button once they are spent. */
  noChecksLeft: string;
  /** Try again while its uses are limited: `{n}` left. */
  resetLeft: string;
}

const WORDS: Record<string, ExerciseWords> = {
  en: { exercise: 'Exercise', trueFalse: ['T', 'F'], solutions: 'Solutions', check: 'Check', showSolution: 'Show solution', hideSolution: 'Hide solution', reset: 'Try again', correct: 'Correct!', wrong: 'Not quite', hint: 'Hint', blank: 'blank', score: '{right} of {total} right', across: 'Across', down: 'Down', checkLeft: 'Check ({n} left)', noChecksLeft: 'No checks left', resetLeft: 'Try again ({n} left)' },
  es: { exercise: 'Ejercicio', trueFalse: ['V', 'F'], solutions: 'Soluciones', check: 'Comprobar', showSolution: 'Ver la solución', hideSolution: 'Ocultar la solución', reset: 'Volver a empezar', correct: '¡Correcto!', wrong: 'Revisa la respuesta', hint: 'Pista', blank: 'hueco', score: '{right} de {total} bien', across: 'Horizontales', down: 'Verticales', checkLeft: 'Comprobar (quedan {n})', noChecksLeft: 'Sin más comprobaciones', resetLeft: 'Volver a empezar (quedan {n})' },
  ca: { exercise: 'Exercici', trueFalse: ['V', 'F'], solutions: 'Solucions', check: 'Comprova', showSolution: 'Mostra la solució', hideSolution: 'Amaga la solució', reset: 'Torna a començar', correct: 'Correcte!', wrong: 'Revisa la resposta', hint: 'Pista', blank: 'buit', score: '{right} de {total} bé', across: 'Horitzontals', down: 'Verticals', checkLeft: 'Comprova (en queden {n})', noChecksLeft: 'Sense més comprovacions', resetLeft: 'Torna a començar (en queden {n})' },
  fr: { exercise: 'Exercice', trueFalse: ['V', 'F'], solutions: 'Corrigés', check: 'Vérifier', showSolution: 'Voir la solution', hideSolution: 'Masquer la solution', reset: 'Recommencer', correct: 'Bravo !', wrong: 'Pas tout à fait', hint: 'Indice', blank: 'blanc', score: '{right} sur {total}', across: 'Horizontalement', down: 'Verticalement', checkLeft: 'Vérifier (encore {n})', noChecksLeft: 'Plus de vérifications', resetLeft: 'Recommencer (encore {n})' },
  de: { exercise: 'Übung', trueFalse: ['R', 'F'], solutions: 'Lösungen', check: 'Prüfen', showSolution: 'Lösung zeigen', hideSolution: 'Lösung ausblenden', reset: 'Neu beginnen', correct: 'Richtig!', wrong: 'Noch nicht ganz', hint: 'Tipp', blank: 'Lücke', score: '{right} von {total} richtig', across: 'Waagerecht', down: 'Senkrecht', checkLeft: 'Prüfen (noch {n})', noChecksLeft: 'Keine Prüfung mehr', resetLeft: 'Neu beginnen (noch {n})' },
  it: { exercise: 'Esercizio', trueFalse: ['V', 'F'], solutions: 'Soluzioni', check: 'Verifica', showSolution: 'Mostra la soluzione', hideSolution: 'Nascondi la soluzione', reset: 'Ricomincia', correct: 'Esatto!', wrong: 'Non proprio', hint: 'Suggerimento', blank: 'spazio', score: '{right} su {total}', across: 'Orizzontali', down: 'Verticali', checkLeft: 'Verifica (ancora {n})', noChecksLeft: 'Nessuna verifica rimasta', resetLeft: 'Ricomincia (ancora {n})' },
  pt: { exercise: 'Exercício', trueFalse: ['V', 'F'], solutions: 'Gabarito', check: 'Verificar', showSolution: 'Ver a resposta', hideSolution: 'Ocultar a resposta', reset: 'Recomeçar', correct: 'Correto!', wrong: 'Quase lá', hint: 'Dica', blank: 'lacuna', score: '{right} de {total} certas', across: 'Horizontais', down: 'Verticais', checkLeft: 'Verificar (restam {n})', noChecksLeft: 'Sem mais verificações', resetLeft: 'Recomeçar (restam {n})' },
  zh: { exercise: '练习', trueFalse: ['√', '×'], solutions: '参考答案', check: '检查', showSolution: '查看答案', hideSolution: '隐藏答案', reset: '重做', correct: '正确！', wrong: '再想想', hint: '提示', blank: '空', score: '答对 {right}/{total}', across: '横向', down: '纵向', checkLeft: '检查（还剩 {n} 次）', noChecksLeft: '检查次数已用完', resetLeft: '重做（还剩 {n} 次）' },
  ja: { exercise: '練習', trueFalse: ['○', '×'], solutions: '解答', check: '答え合わせ', showSolution: '解答を見る', hideSolution: '解答を隠す', reset: 'やり直す', correct: '正解！', wrong: 'もう一度', hint: 'ヒント', blank: '空欄', score: '{total}問中{right}問正解', across: 'ヨコのカギ', down: 'タテのカギ', checkLeft: '答え合わせ（残り{n}回）', noChecksLeft: '答え合わせは終わりです', resetLeft: 'やり直す（残り{n}回）' },
  ar: { exercise: 'تمرين', trueFalse: ['صح', 'خطأ'], solutions: 'الحلول', check: 'تحقّق', showSolution: 'اعرض الحل', hideSolution: 'أخفِ الحل', reset: 'أعد المحاولة', correct: 'صحيح!', wrong: 'ليس تمامًا', hint: 'تلميح', blank: 'فراغ', score: '{right} من {total}', across: 'أفقيًا', down: 'عموديًا', checkLeft: 'تحقّق (بقي {n})', noChecksLeft: 'لم يبقَ تحقّق', resetLeft: 'أعد المحاولة (بقي {n})' },
};

/** The primary language subtag of a locale, lower-cased. */
const languageOf = (locale: string | undefined): string => (locale ?? 'en').trim().toLowerCase().split(/[-_]/)[0] ?? 'en';

/** The words a document in `locale` prints (English for a language with
 *  none of its own). */
export function exerciseWords(locale: string | undefined): ExerciseWords {
  return WORDS[languageOf(locale)] ?? WORDS.en!;
}

export interface ResolvedExerciseNumber extends Required<Omit<ExerciseNumberStyle, 'label' | 'fontFamily' | 'color'>> {
  /** The word before the number, `''` for none. */
  label: string;
  fontFamily?: string;
  /** Unset: white on a shape, else the main colour. */
  color?: ColorValue;
}

export interface ResolvedExerciseStyle {
  id: string;
  name: string;
  box?: string;
  number: ResolvedExerciseNumber;
  instruction: ExerciseInstructionStyle & { bold: boolean };
  options: Required<Omit<ExerciseOptionsStyle, 'columns'>> & { columns?: number };
  blank: Required<Omit<ExerciseBlankStyle, 'color'>> & { color?: ColorValue };
  trueFalse: Required<ExerciseTrueFalseStyle>;
  match: Required<Omit<ExerciseMatchStyle, 'color'>> & { color: ColorValue };
  bank: Required<Omit<ExerciseBankStyle, 'box'>> & { box?: string };
  area: Required<Omit<ExerciseAreaStyle, 'spacing'>> & { spacing?: Dimension };
  grid: Required<Omit<ExerciseGridStyle, 'fontFamily' | 'fontSize' | 'color' | 'blocked'>> & Pick<ExerciseGridStyle, 'fontFamily' | 'fontSize' | 'color' | 'blocked'>;
  arithmetic: Required<ExerciseArithmeticStyle>;
  level: Required<ExerciseLevelStyle>;
  icons: Record<string, ExerciseIcon>;
  answers: ExerciseAnswersStyle & { color: ColorValue };
  /** Over `exercises.solutions` (only the fields the style sets). */
  solutions: ExerciseSolutionsConfig;
  /** Its colours, and the limits it sets over the book's (#1268). */
  digital: Required<Pick<ExerciseDigitalStyle, 'correctColor' | 'wrongColor'>> & ExerciseAssessmentConfig;
  marginTop: Dimension;
  marginBottom: Dimension;
  itemSpacing: Dimension;
}

export interface ResolvedExercisesConfig {
  edition: 'student' | 'teacher';
  solutions: Required<Omit<ExerciseSolutionsConfig, 'box'>> & { box?: string };
  seed: number;
  digital: Required<NonNullable<ExercisesConfig['digital']>>;
  words: ExerciseWords;
  /** The document language (its primary subtag). */
  language: string;
}

/** What the exercises of a document read. */
export interface ExerciseSettings {
  styles: ResolvedExerciseStyle[];
  exercises: ResolvedExercisesConfig;
}

/** The style shipped when none is declared. */
export const DEFAULT_EXERCISE_STYLES: ExerciseStyleConfig[] = [{ id: 'exercise', name: 'Exercise' }];

/** Labels, suffixes and the division layout each language prints. */
function languageDefaults(lang: string): { labels: ResolvedExerciseStyle['options']['labels']; suffix: string; division: ResolvedExerciseStyle['arithmetic']['division']; working: ResolvedExerciseStyle['arithmetic']['working'] } {
  switch (lang) {
    case 'zh': return { labels: 'alpha-upper', suffix: '.', division: 'bracket', working: 'products' };
    case 'ja': return { labels: 'katakana', suffix: '', division: 'bracket', working: 'products' };
    case 'ar': return { labels: 'abjad', suffix: ')', division: 'bracket', working: 'products' };
    // Spain, Catalonia and Italy write a division's remainders only.
    case 'es': case 'ca': case 'it': return { labels: 'alpha-lower', suffix: ')', division: 'potence', working: 'remainders' };
    case 'fr': case 'pt': return { labels: 'alpha-lower', suffix: ')', division: 'potence', working: 'products' };
    case 'de': return { labels: 'alpha-lower', suffix: ')', division: 'inline', working: 'products' };
    default: return { labels: 'alpha-lower', suffix: ')', division: 'bracket', working: 'products' };
  }
}

/** Every field a style may inherit, merged over its parent's one section at
 *  a time (`icons` by id). */
function mergeStyles(base: ExerciseStyleConfig, over: ExerciseStyleConfig): ExerciseStyleConfig {
  const out: ExerciseStyleConfig = { ...base, ...over };
  for (const key of ['number', 'instruction', 'options', 'blank', 'trueFalse', 'match', 'bank', 'area', 'grid', 'arithmetic', 'level', 'answers', 'solutions', 'digital', 'icons'] as const) {
    if (base[key] || over[key]) (out as unknown as Record<string, unknown>)[key] = { ...(base[key] ?? {}), ...(over[key] ?? {}) };
  }
  return out;
}

/** A style with its `extends` chain folded in (a cycle or an unknown id
 *  stops the chain). */
function inherit(style: ExerciseStyleConfig, byId: Map<string, ExerciseStyleConfig>): ExerciseStyleConfig {
  const chain: ExerciseStyleConfig[] = [style];
  const seen = new Set([style.id]);
  for (let parent = style.extends ? byId.get(style.extends) : undefined; parent && !seen.has(parent.id); parent = parent.extends ? byId.get(parent.extends) : undefined) {
    chain.unshift(parent);
    seen.add(parent.id);
  }
  return chain.reduce((acc, s) => mergeStyles(acc, s), { id: style.id } as ExerciseStyleConfig);
}

function resolveStyle(s: ExerciseStyleConfig, lang: string, words: ExerciseWords, palette: ColorPaletteEntry[] | undefined): ResolvedExerciseStyle {
  const L = languageDefaults(lang);
  // The main colour, as the palette has it.
  const mainColor = resolveColorValue(DEFAULT_MAIN_COLOR, palette, DEFAULT_MAIN_COLOR);
  const n = s.number ?? {};
  const label = n.label === true ? words.exercise : typeof n.label === 'string' ? n.label : '';
  const shape = n.shape ?? 'none';
  return {
    id: s.id,
    name: s.name ?? s.id,
    ...(s.box ? { box: s.box } : {}),
    number: {
      show: n.show ?? true,
      label,
      shape,
      ...(n.color ? { color: n.color } : {}),
      background: n.background ?? mainColor,
      ...(n.fontFamily ? { fontFamily: n.fontFamily } : {}),
      fontSize: n.fontSize ?? EM(1),
      fontWeight: n.fontWeight ?? 700,
      suffix: n.suffix ?? (shape === 'none' ? '.' : ''),
      template: n.template ?? '{n}',
      resetOn: n.resetOn ?? 'h1',
      counter: n.counter ?? 'exercise',
      format: n.format ?? 'decimal',
    },
    instruction: { ...(s.instruction ?? {}), bold: s.instruction?.bold ?? true },
    options: {
      labels: s.options?.labels ?? L.labels,
      prefix: s.options?.prefix ?? '',
      suffix: s.options?.suffix ?? L.suffix,
      marker: s.options?.marker ?? 'none',
      layout: s.options?.layout ?? 'stack',
      ...(s.options?.columns !== undefined ? { columns: Math.max(1, Math.floor(s.options.columns)) } : {}),
      shuffle: s.options?.shuffle ?? false,
      indent: s.options?.indent ?? EM(1),
      bracket: s.options?.bracket ?? false,
    },
    blank: {
      look: s.blank?.look ?? 'line',
      width: s.blank?.width ?? 'longest',
      extra: s.blank?.extra ?? EM(1.5),
      minWidth: s.blank?.minWidth ?? EM(3),
      ...(s.blank?.color ? { color: s.blank.color } : {}),
      weight: s.blank?.weight ?? PT(0.6),
    },
    trueFalse: { labels: s.trueFalse?.labels ?? words.trueFalse, look: s.trueFalse?.look ?? 'boxes', place: s.trueFalse?.place === 'start' ? 'start' : 'end' },
    match: { look: s.match?.look ?? 'dots', gap: s.match?.gap ?? EM(4), dotSize: s.match?.dotSize ?? EM(0.35), color: s.match?.color ?? mainColor },
    bank: { ...(s.bank?.box ? { box: s.bank.box } : {}), order: s.bank?.order ?? 'shuffle', separator: s.bank?.separator ?? '\u2003' },
    area: { kind: s.area?.kind ?? 'lines', lines: s.area?.lines ?? 3, ...(s.area?.spacing ? { spacing: s.area.spacing } : {}), color: s.area?.color ?? HEX('#b8b8b8'), weight: s.area?.weight ?? PT(0.5) },
    grid: {
      cell: s.grid?.cell ?? EM(1.6),
      ...(s.grid?.fontFamily ? { fontFamily: s.grid.fontFamily } : {}),
      ...(s.grid?.fontSize ? { fontSize: s.grid.fontSize } : {}),
      ...(s.grid?.color ? { color: s.grid.color } : {}),
      rule: s.grid?.rule ?? HEX('#8a8a8a'),
      ruleWidth: s.grid?.ruleWidth ?? PT(0.6),
      ...(s.grid?.blocked ? { blocked: s.grid.blocked } : {}),
      uppercase: s.grid?.uppercase ?? true,
    },
    arithmetic: {
      division: s.arithmetic?.division ?? L.division,
      columns: Math.max(1, Math.floor(s.arithmetic?.columns ?? 4)),
      partialProducts: s.arithmetic?.partialProducts ?? true,
      working: s.arithmetic?.working ?? L.working,
    },
    level: { glyph: s.level?.glyph ?? '●', empty: s.level?.empty ?? '○', max: Math.max(1, Math.floor(s.level?.max ?? 3)), color: s.level?.color ?? mainColor },
    icons: s.icons ?? {},
    answers: { ...(s.answers ?? {}), color: s.answers?.color ?? HEX('#d6246e') },
    solutions: s.solutions ?? {},
    digital: { correctColor: s.digital?.correctColor ?? HEX('#1e8e3e'), wrongColor: s.digital?.wrongColor ?? HEX('#c5221f'), ...assessmentOf(s.digital) },
    marginTop: s.marginTop ?? EM(1),
    marginBottom: s.marginBottom ?? EM(1),
    itemSpacing: s.itemSpacing ?? EM(0.25),
  };
}

export function resolveExerciseStylesConfig(styles: ExerciseStyleConfig[] | undefined, locale: string | undefined, palette?: ColorPaletteEntry[]): ResolvedExerciseStyle[] {
  const list = styles && styles.length > 0 ? styles : DEFAULT_EXERCISE_STYLES;
  const byId = new Map<string, ExerciseStyleConfig>();
  for (const s of list) if (!byId.has(s.id)) byId.set(s.id, s);
  const lang = languageOf(locale);
  const words = exerciseWords(locale);
  return list.map((s) => resolveStyle(inherit(s, byId), lang, words, palette));
}

export function resolveExercisesConfig(config: ExercisesConfig | undefined, locale: string | undefined): ResolvedExercisesConfig {
  const words = exerciseWords(locale);
  return {
    edition: config?.edition === 'teacher' ? 'teacher' : 'student',
    solutions: {
      placement: config?.solutions?.placement ?? 'none',
      ...(config?.solutions?.box ? { box: config.solutions.box } : {}),
      heading: config?.solutions?.heading ?? words.solutions,
      layout: config?.solutions?.layout ?? 'full',
    },
    seed: Number.isFinite(config?.seed) ? Math.floor(config!.seed!) : 1,
    digital: {
      interactive: config?.digital?.interactive ?? true,
      persist: config?.digital?.persist ?? true,
      check: config?.digital?.check ?? 'button',
      maxChecks: count(config?.digital?.maxChecks) ?? 0,
      reset: config?.digital?.reset ?? true,
      maxResets: count(config?.digital?.maxResets) ?? 0,
      showSolution: showSolutionOf(config?.digital?.showSolution) ?? 'always',
      passingScore: Number.isFinite(config?.digital?.passingScore) ? Math.max(0, Math.min(100, config!.digital!.passingScore!)) : 0,
    },
    words,
    language: languageOf(locale),
  };
}

/** A limit as a whole number of times, `undefined` when unset or not a
 *  number. */
function count(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : undefined;
}

const SHOW_SOLUTION: readonly ExerciseShowSolution[] = ['always', 'afterCheck', 'noChecksLeft', 'never'];
const showSolutionOf = (value: unknown): ExerciseShowSolution | undefined =>
  SHOW_SOLUTION.includes(value as ExerciseShowSolution) ? (value as ExerciseShowSolution) : undefined;

/** The limits a style sets over the book's: only those it names. */
function assessmentOf(d: ExerciseAssessmentConfig | undefined): ExerciseAssessmentConfig {
  if (!d) return {};
  const out: ExerciseAssessmentConfig = {};
  const checks = count(d.maxChecks);
  if (checks !== undefined) out.maxChecks = checks;
  if (typeof d.reset === 'boolean') out.reset = d.reset;
  const resets = count(d.maxResets);
  if (resets !== undefined) out.maxResets = resets;
  const show = showSolutionOf(d.showSolution);
  if (show) out.showSolution = show;
  return out;
}

/** The limits an exercise of `style` keeps to: the style's over the
 *  book's (#1268). */
export function assessmentLimitsOf(style: Pick<ResolvedExerciseStyle, 'digital'>, book: ResolvedExercisesConfig): Required<ExerciseAssessmentConfig> {
  const d = book.digital;
  const s = style.digital;
  return {
    maxChecks: s.maxChecks ?? d.maxChecks,
    reset: s.reset ?? d.reset,
    maxResets: s.maxResets ?? d.maxResets,
    showSolution: s.showSolution ?? d.showSolution,
  };
}

const settingsMemo = new WeakMap<object, ExerciseSettings>();
let defaultSettings: { locale: string | undefined; settings: ExerciseSettings }[] = [];

/** The exercise settings of a configuration (its defaults when it sets
 *  none), in the document language `locale`. Memoised per config object. */
export function exerciseSettingsOf(config: Pick<PostextConfig, 'exerciseStyles' | 'exercises' | 'colorPalette'> | undefined, locale: string | undefined): ExerciseSettings {
  if (!config || (!config.exerciseStyles && !config.exercises)) {
    const hit = defaultSettings.find((d) => d.locale === locale);
    if (hit) return hit.settings;
    const settings = { styles: resolveExerciseStylesConfig(undefined, locale), exercises: resolveExercisesConfig(undefined, locale) };
    defaultSettings = [...defaultSettings.slice(-9), { locale, settings }];
    return settings;
  }
  const hit = settingsMemo.get(config);
  if (hit && hit.exercises.language === languageOf(locale)) return hit;
  const settings = {
    styles: resolveExerciseStylesConfig(config.exerciseStyles, locale, config.colorPalette),
    exercises: resolveExercisesConfig(config.exercises, locale),
  };
  settingsMemo.set(config, settings);
  return settings;
}

/** The style an exercise picks: the matching id, else the first. */
export function pickExerciseStyle(styles: readonly ResolvedExerciseStyle[], id: string | undefined): ResolvedExerciseStyle {
  if (id) {
    const match = styles.find((s) => s.id === id);
    if (match) return match;
  }
  return styles[0]!;
}

/** The solutions settings of a style: the book's, with the style's own
 *  fields over them. */
export function solutionsOf(style: ResolvedExerciseStyle, book: ResolvedExercisesConfig): ResolvedExercisesConfig['solutions'] {
  return { ...book.solutions, ...style.solutions } as ResolvedExercisesConfig['solutions'];
}

/** `exerciseStyles` for storage: `undefined` for the built-in default. */
export function stripExerciseStylesDefaults(styles: ExerciseStyleConfig[] | undefined): ExerciseStyleConfig[] | undefined {
  if (!styles) return undefined;
  if (styles.length === 1 && styles[0]!.id === 'exercise' && Object.keys(styles[0]!).every((k) => k === 'id' || k === 'name')) return undefined;
  return styles;
}

/** `exercises` for storage: the fields at their defaults dropped (the
 *  solutions heading when it is the word of `locale`), `undefined` when
 *  none is left. */
export function stripExercisesDefaults(config: ExercisesConfig | undefined, locale?: string): ExercisesConfig | undefined {
  if (!config) return undefined;
  const out: ExercisesConfig = {};
  if (config.edition !== undefined && config.edition !== 'student') out.edition = config.edition;
  if (config.seed !== undefined && config.seed !== 1) out.seed = config.seed;
  const s = config.solutions;
  if (s) {
    const solutions: ExerciseSolutionsConfig = {};
    if (s.placement !== undefined && s.placement !== 'none') solutions.placement = s.placement;
    if (s.box !== undefined) solutions.box = s.box;
    if (s.heading !== undefined && s.heading !== exerciseWords(locale).solutions) solutions.heading = s.heading;
    if (s.layout !== undefined && s.layout !== 'full') solutions.layout = s.layout;
    if (Object.keys(solutions).length > 0) out.solutions = solutions;
  }
  const d = config.digital;
  if (d) {
    const digital: NonNullable<ExercisesConfig['digital']> = {};
    if (d.interactive !== undefined && d.interactive !== true) digital.interactive = d.interactive;
    if (d.persist !== undefined && d.persist !== true) digital.persist = d.persist;
    if (d.check !== undefined && d.check !== 'button') digital.check = d.check;
    if (d.maxChecks !== undefined && d.maxChecks !== 0) digital.maxChecks = d.maxChecks;
    if (d.reset !== undefined && d.reset !== true) digital.reset = d.reset;
    if (d.maxResets !== undefined && d.maxResets !== 0) digital.maxResets = d.maxResets;
    if (d.showSolution !== undefined && d.showSolution !== 'always') digital.showSolution = d.showSolution;
    if (d.passingScore !== undefined && d.passingScore !== 0) digital.passingScore = d.passingScore;
    if (Object.keys(digital).length > 0) out.digital = digital;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
