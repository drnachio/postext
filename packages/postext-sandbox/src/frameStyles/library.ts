/**
 * The frame-style library of a book (#873): its callout styles as the
 * engine resolves them, where each is used and the merges it suggests.
 * The Design panel's Frame styles section and the agent tools read the
 * same answer.
 */

import {
  DEFAULT_CALLOUT_STYLES,
  resolveBodyTextConfig,
  resolveCalloutStylesConfig,
  resolveHeadingsConfig,
  resolveUnorderedListsConfig,
  type CalloutStyleConfig,
  type PostextConfig,
  type ResolvedCalloutStyleConfig,
} from 'postext';
import { mergeSuggestions, styleKinds, type CompareOptions, type MergeSuggestion, type StyleKind } from './styleCompare.js';
import { bookCalloutStyles, styleUsage, type StyleUsage, type UsageChapter } from './styleUsage.js';
import { toPt } from '../controls/inputs/units.js';

export interface FrameStyleLibrary {
  /** The styles as the book stores them (the built-in list while it
   *  stores none: `stored` is then false). */
  styles: readonly CalloutStyleConfig[];
  stored: boolean;
  resolved: ResolvedCalloutStyleConfig[];
  usage: Map<string, StyleUsage>;
  suggestions: MergeSuggestion[];
  /** Styles that extend another or differ from it in colours only (#976). */
  kinds: StyleKind[];
}

/** The document language the engine resolves continuation strings in. */
export function styleLocale(config: PostextConfig, fallback?: string): string | undefined {
  return config.locale ?? config.bodyText?.hyphenation?.locale ?? fallback;
}

/** `config`'s callout styles resolved as a build resolves them. */
export function resolveBookStyles(config: PostextConfig, styles: readonly CalloutStyleConfig[], locale?: string): ResolvedCalloutStyleConfig[] {
  const bodyText = resolveBodyTextConfig(config.bodyText);
  const headings = resolveHeadingsConfig(config.headings);
  const lists = resolveUnorderedListsConfig(config.unorderedLists, bodyText);
  return resolveCalloutStylesConfig([...styles], bodyText, headings, lists, styleLocale(config, locale));
}

/** The comparison settings that follow from the book: its page `dpi` and
 *  the size of an `em` of its body text. */
export function bookCompareOptions(config: PostextConfig, options: CompareOptions = {}): CompareOptions {
  const body = resolveBodyTextConfig(config.bodyText);
  const emPt = toPt(body.fontSize);
  return { dpi: config.page?.dpi ?? 96, ...(emPt > 0 ? { emPt } : {}), ...options };
}

export function frameStyleLibrary(
  config: PostextConfig,
  chapters: readonly UsageChapter[],
  options: CompareOptions = {},
  locale?: string,
): FrameStyleLibrary {
  const styles = bookCalloutStyles(config, DEFAULT_CALLOUT_STYLES);
  const resolved = resolveBookStyles(config, styles, locale);
  const usage = styleUsage(config, styles, chapters);
  const suggestions = config.calloutStyles ? mergeSuggestions(styles, resolved, usage, bookCompareOptions(config, options)) : [];
  const kinds = config.calloutStyles ? styleKinds(styles, resolved, usage, bookCompareOptions(config, options)) : [];
  return { styles, stored: config.calloutStyles !== undefined, resolved, usage, suggestions, kinds };
}
