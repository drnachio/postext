// Arabic body text options: emphasis style, tashkil and kashida
// (#1278: split out of bodyText.ts).
import type { EmphasisStyle, TashkilMode, BodyTextConfig, ResolvedBodyTextConfig, ResolvedKashidaConfig, KashidaPatterns, LocaleTag } from '../../../types.js';
import { localeScript } from '../../../hyphenation/locale.js';

/** Whether a document in `locale` is written in Arabic script (`ar`,
 *  `fa`, `ur`…): its type has no italics. */
export function arabicScript(locale: unknown): boolean {
  return localeScript(locale) === 'Arab';
}

const EMPHASES: readonly EmphasisStyle[] = ['italic', 'bold', 'color', 'overline'];
const TASHKIL_MODES: readonly TashkilMode[] = ['keep', 'strip', 'strip-vowels'];

/** Whether `value` names an emphasis style. */
export function isEmphasisStyle(value: unknown): value is EmphasisStyle {
  return EMPHASES.includes(value as EmphasisStyle);
}

/** Whether `value` names a tashkīl mode. */
export function isTashkilMode(value: unknown): value is TashkilMode {
  return TASHKIL_MODES.includes(value as TashkilMode);
}

/** How `*…*` is set by default in a document in `locale`: in bold when
 *  it is written in Arabic script, in italics otherwise (#376). */
export function defaultEmphasisFor(locale: unknown): EmphasisStyle {
  return arabicScript(locale) ? 'bold' : 'italic';
}

/** `bodyText.emphasis` resolved: `'auto'`, unset or an unknown value
 *  follow the language. */
export function resolveEmphasis(value: unknown, locale: unknown): EmphasisStyle {
  return isEmphasisStyle(value) ? value : defaultEmphasisFor(locale);
}

/** The fields `emphasis` and `tashkil` add to a resolved body config:
 *  each only when it is not the plain default (italics, marks kept), so a
 *  document that uses neither resolves exactly as before. */
export function emphasisAndTashkil(partial: BodyTextConfig | undefined, locale: unknown): Pick<ResolvedBodyTextConfig, 'emphasis' | 'tashkil'> {
  const emphasis = resolveEmphasis(partial?.emphasis, locale);
  const tashkil = partial?.tashkil;
  return {
    ...(emphasis !== 'italic' ? { emphasis } : {}),
    ...(tashkil === 'strip' || tashkil === 'strip-vowels' ? { tashkil } : {}),
  };
}

/** The defaults of kashida justification once it is on (see
 *  `BodyTextConfig.kashida`). */
export const DEFAULT_KASHIDA_CONFIG: ResolvedKashidaConfig = {
  patterns: 'auto',
  perWord: 1,
  maxLength: 0.6,
};

/** Whether `tag` names a language written in the Arabic script (`ar`,
 *  `fa`, `ur`, `ps`, `ks-Arab`…): its justified text takes kashidas unless
 *  the config says `kashida: 'none'`. */
export function isArabicScriptLanguage(tag: unknown): boolean {
  const script = localeScript(tag);
  return script === 'Arab' || script === 'Aran';
}

const KASHIDA_PATTERNS: readonly KashidaPatterns[] = ['auto', 'naskh', 'simple', 'nastaliq'];

/** Kashida justification as resolved: `undefined` when it is off — unset
 *  outside an Arabic-script document, `'none'` — so a document without it
 *  resolves as before (#375). An unknown `kashida` value reads as unset (and
 *  `collectConfigWarnings` reports it); unknown or out-of-range details
 *  read as their defaults. */
export function resolveKashida(partial: BodyTextConfig | undefined, documentLocale: LocaleTag | undefined): Pick<ResolvedBodyTextConfig, 'kashida' | 'kashidaPatterns' | 'kashidaPerWord' | 'kashidaMaxLength'> {
  const setting: unknown = partial?.kashida;
  const on = setting === 'auto' || (setting !== 'none' && isArabicScriptLanguage(documentLocale));
  if (!on) return {};
  const D = DEFAULT_KASHIDA_CONFIG;
  const perWord = partial?.kashidaPerWord;
  const maxLength = partial?.kashidaMaxLength;
  return {
    kashida: 'auto',
    kashidaPatterns: KASHIDA_PATTERNS.includes(partial?.kashidaPatterns as KashidaPatterns) ? partial!.kashidaPatterns! : D.patterns,
    kashidaPerWord: typeof perWord === 'number' && perWord >= 1 ? Math.floor(perWord) : D.perWord,
    kashidaMaxLength: typeof maxLength === 'number' && maxLength >= 0 ? maxLength : D.maxLength,
  };
}

/** Kashida justification of a resolved body text, or `undefined` when it
 *  is off. */
export function resolvedKashida(bodyText: Pick<ResolvedBodyTextConfig, 'kashida' | 'kashidaPatterns' | 'kashidaPerWord' | 'kashidaMaxLength'>): ResolvedKashidaConfig | undefined {
  if (bodyText.kashida !== 'auto') return undefined;
  const D = DEFAULT_KASHIDA_CONFIG;
  return {
    patterns: bodyText.kashidaPatterns ?? D.patterns,
    perWord: bodyText.kashidaPerWord ?? D.perWord,
    maxLength: bodyText.kashidaMaxLength ?? D.maxLength,
  };
}
