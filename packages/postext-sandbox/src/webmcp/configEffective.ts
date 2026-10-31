// What a configuration comes to once the engine has filled every default
// in — the value each setting has when the book does not set it, and the
// shape each setting takes. The tools read settings from it and check
// every write against it.

import {
  buildDocument,
  cloneDefaultColorPalette,
  effectiveResourceTypes,
  FIGURE_STYLES,
  isFigureStyle,
  resolveCodeStyleConfig,
  resolveComicsConfig,
  resolveChecksConfig,
  resolveContrastConfig,
  resolveDebugConfig,
  resolveExerciseStylesConfig,
  resolveExercisesConfig,
  resolveFolioConfig,
  resolveCanvasViewerConfig,
  resolveHtmlViewerConfig,
  resolveLineNumbersConfig,
  resolveLinksConfig,
  resolvePdfGenerationConfig,
  resolvePrintConfig,
} from 'postext';
import type { PostextConfig, Resource } from 'postext';
import { withHyphenationLocale } from '../controls/language/hyphenation.js';
import { ToolError } from './modelContext.js';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `config` as the engine resolves it for a book read in `locale`, with
 *  the sections the engine only resolves when a book sets them (print,
 *  the PDF, the Folio, line numbers, code, links in print, comics, the
 *  contrast check,
 *  the checks of the configuration, page templates, label styles and the
 *  exercise settings)
 *  and the ones the Sandbox reads itself (the guides, the HTML reader).
 *  Throws when the engine cannot resolve the configuration. */
export function resolveEffectiveConfig(config: PostextConfig, locale: string, resources: readonly Resource[] = []): Record<string, unknown> {
  // An empty document resolves the whole configuration and lays out its
  // running heads, in a millisecond or two.
  const resolved = buildDocument({ markdown: '' }, withHyphenationLocale(config, locale)).config;
  const documentLocale = resolved.locale ?? resolved.bodyText.hyphenation.tag ?? resolved.bodyText.hyphenation.locale;
  // The engine's own resolution of the exercise settings (only once the
  // book sets them) is no setting: `exerciseStyles` and `exercises` below
  // are.
  const { exerciseSettings: _resolvedExercises, ...rest } = resolved;
  void _resolvedExercises;
  return {
    ...(rest as unknown as Record<string, unknown>),
    direction: resolved.direction ?? 'ltr',
    numerals: resolved.numerals ?? 'latn',
    colorPalette: resolved.colorPalette ?? cloneDefaultColorPalette(),
    pdfGeneration: resolved.pdfGeneration ?? resolvePdfGenerationConfig(config.pdfGeneration),
    print: resolved.print ?? resolvePrintConfig(config.print),
    contrast: resolved.contrast ?? resolveContrastConfig(config.contrast),
    checks: resolved.checks ?? resolveChecksConfig(config.checks),
    folio: resolved.folio ?? resolveFolioConfig(config.folio, resolved.page.sizePreset),
    lineNumbers: resolved.lineNumbers ?? resolveLineNumbersConfig(config.lineNumbers, resolved.bodyText),
    codeStyle: resolved.codeStyle ?? resolveCodeStyleConfig(config.codeStyle, resolved.bodyText),
    links: resolved.links ?? resolveLinksConfig(config.links),
    comics: resolved.comics ?? resolveComicsConfig(config.comics, documentLocale),
    debug: resolveDebugConfig(config.debug),
    htmlViewer: resolveHtmlViewerConfig(config.htmlViewer),
    canvasViewer: resolveCanvasViewerConfig(config.canvasViewer),
    resourceTypes: effectiveResourceTypes(config, resources),
    // Composed pages (#853): lists the engine resolves only when set.
    pageTemplates: resolved.pageTemplates ?? [],
    labelStyles: resolved.labelStyles ?? [],
    frameLooks: resolved.frameLooks ?? [],
    // Exercises (#1226): resolved apart from the layout, in the document
    // language; the words the engine prints are no setting.
    exerciseStyles: resolveExerciseStylesConfig(config.exerciseStyles, documentLocale, resolved.colorPalette),
    exercises: exerciseSettings(config, documentLocale),
    ...(config.customFonts ? { customFonts: config.customFonts } : {}),
  };
}

/** The book's exercise settings as the engine reads them, without the
 *  words and language the resolution carries along. */
function exerciseSettings(config: PostextConfig, locale: string | undefined): Record<string, unknown> {
  const settings: Partial<ReturnType<typeof resolveExercisesConfig>> = { ...resolveExercisesConfig(config.exercises, locale) };
  delete settings.words;
  delete settings.language;
  return settings;
}

const UNITS = ['cm', 'mm', 'in', 'pt', 'px', 'em', 'rem'] as const;
/** The corners a per-corner radius names. */
const CORNER_KEYS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;

/** A length: `{ value, unit }`. */
export function isDimension(v: unknown): v is { value: number; unit: string } {
  return isRecord(v) && typeof v.value === 'number' && typeof v.unit === 'string' && Object.keys(v).every((k) => k === 'value' || k === 'unit');
}

/** A colour: `{ hex, model }`, with the palette entry it follows or its
 *  CMYK values when it has them. */
export function isColor(v: unknown): v is { hex: string; model: string; paletteId?: string } {
  return isRecord(v) && typeof v.hex === 'string' && typeof v.model === 'string';
}

/** A value whose members only make sense together: writing one of them
 *  into a book that does not store the value takes the others along. */
export const isWholeValue = (v: unknown): boolean => isDimension(v) || isColor(v);

/** The switches that also take a keyword, by the setting's name. */
const SWITCH_KEYWORDS: Record<string, readonly string[]> = {
  hyphenateAcrossColumns: ['withinPage'],
  compressAdjacent: ['auto'],
  trimLineStart: ['auto'],
  spaceAfterQuestion: ['auto'],
  dropFinalStop: ['auto'],
};

/** The switches that also take a length (#1115), by the setting's name:
 *  a length given to one of them is read as a length (in mm when it names
 *  no unit), and `true` or `false` given to one set as a length passes. */
const SWITCH_LENGTHS: readonly string[] = ['paragraphSpacing'];

const kindOf = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'a list' : isRecord(v) ? 'an object' : `a ${typeof v}`);

/**
 * `value` as the setting at `path` stores it, given what the setting
 * resolves to today (`current`; undefined for a setting the engine has no
 * value for, which takes anything): a number or `"11pt"` for a length, a
 * `#rrggbb` text for a colour, and the value itself otherwise. Refuses a
 * value of another shape than the setting's, saying what it takes.
 */
export function coerceSetting(path: string, value: unknown, current: unknown): unknown {
  // A style's figures (#1237) live in the stored configuration only (the
  // resolved one names them in its family), so no current value tells
  // what the setting takes.
  if (path.endsWith('.figureStyle') && !isFigureStyle(value)) {
    throw new ToolError(`${path} takes one of ${FIGURE_STYLES.map((s) => `"${s}"`).join(', ')}; null leaves it unset, so the style takes the figures of the family it inherits.`);
  }
  if (current === undefined || current === null) return value;
  if (SWITCH_LENGTHS.includes(path.slice(path.lastIndexOf('.') + 1))) {
    if (typeof value === 'boolean') return value;
    if (typeof current === 'boolean') {
      if (typeof value === 'number') return { value, unit: 'mm' };
      return coerceSetting(path, value, { value: 1, unit: 'mm' });
    }
  }
  if (isDimension(current)) {
    if (typeof value === 'number') return { value, unit: current.unit };
    if (typeof value === 'string') {
      const match = /^\s*(-?\d*\.?\d+)\s*([a-z]+)\s*$/i.exec(value);
      const unit = match?.[2]!.toLowerCase();
      if (match && (UNITS as readonly string[]).includes(unit!)) return { value: Number(match[1]), unit };
    }
    if (isRecord(value) && typeof value.value === 'number' && (value.unit === undefined || (UNITS as readonly unknown[]).includes(value.unit))) {
      return { value: value.value, unit: value.unit ?? current.unit };
    }
    // A corner radius may be given per corner (#1059/#1063): each a length.
    if (path.endsWith('borderRadius') && isRecord(value) && Object.keys(value).length > 0 && Object.keys(value).every((k) => (CORNER_KEYS as readonly string[]).includes(k))) {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, coerceSetting(`${path}.${k}`, v, current)]));
    }
    throw new ToolError(`${path} is a length: give { "value": ${current.value}, "unit": "${current.unit}" }, a number (in ${current.unit}) or a text such as "${current.value}${current.unit}". The units: ${UNITS.join(', ')}.`);
  }
  if (isColor(current)) {
    if (typeof value === 'string') {
      const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())?.[1];
      if (!hex) throw new ToolError(`${path} is a colour: give a hex text such as "#1f3a5f", or { "hex": "#1f3a5f", "model": "hex" }.`);
      const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
      return { hex: `#${full.toLowerCase()}`, model: 'hex' };
    }
    if (isRecord(value) && typeof value.hex === 'string') return { model: 'hex', ...value };
    throw new ToolError(`${path} is a colour: give a hex text such as "#1f3a5f", or { "hex": "#1f3a5f", "model": "hex" } (with "paletteId" to follow an entry of colorPalette).`);
  }
  const wrong = (takes: string): never => {
    throw new ToolError(`${path} takes ${takes}, and the value given is ${kindOf(value)}. It is ${JSON.stringify(current)} now.`);
  };
  if (typeof current === 'boolean' && typeof value !== 'boolean') {
    const keywords = SWITCH_KEYWORDS[path.slice(path.lastIndexOf('.') + 1)];
    if (typeof value !== 'string' || !keywords?.includes(value)) wrong(keywords ? `true, false or ${keywords.map((k) => `"${k}"`).join(', ')}` : 'true or false');
  }
  // A number may also be given as a keyword (`words: 'line'`,
  // `bitmapResolution: 'file'`) or, for a few, as a length: those pass,
  // and the answer says what the engine made of them.
  if (typeof current === 'number' && typeof value !== 'number' && typeof value !== 'string' && !isDimension(value)) wrong('a number');
  if (typeof current === 'string' && (isRecord(value) || Array.isArray(value))) wrong('a text');
  if (Array.isArray(current) && !Array.isArray(value)) wrong('a list');
  if (isRecord(current) && !isRecord(value) && typeof value !== 'boolean') wrong(`an object (its members: ${Object.keys(current).slice(0, 24).join(', ')})`);
  return value;
}
