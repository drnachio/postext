import type { CrossRefsConfig, ResolvedCrossRefsConfig } from '../types';
import { defaultCrossRefStrings } from '../pipeline/crossRefs';

const STYLES: ReadonlySet<string> = new Set(['default', 'number', 'title', 'page']);

/** A template as a cross-reference fills it: with `{n}`, else the text
 *  followed by a no-break space and the number. Blank: undefined. */
function template(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  return value.includes('{n}') ? value : `${value.trimEnd()}\u00a0{n}`;
}

/** `locale`: the document language, whose words fill the unset templates. */
export function resolveCrossRefsConfig(partial?: CrossRefsConfig, locale?: string): ResolvedCrossRefsConfig {
  const words = defaultCrossRefStrings(locale);
  return {
    chapter: template(partial?.chapter) ?? words.chapter,
    section: template(partial?.section) ?? words.section,
    page: template(partial?.page) ?? words.page,
    defaultStyle: typeof partial?.defaultStyle === 'string' && STYLES.has(partial.defaultStyle) ? partial.defaultStyle : 'default',
  };
}

/** The values a config sets on purpose: non-blank templates, a style other
 *  than `'default'`. */
export function stripCrossRefsDefaults(crossRefs?: CrossRefsConfig): CrossRefsConfig | undefined {
  if (!crossRefs) return undefined;
  const result: CrossRefsConfig = {};
  for (const key of ['chapter', 'section', 'page'] as const) {
    const v = crossRefs[key];
    if (typeof v === 'string' && v.trim().length > 0) result[key] = v;
  }
  if (crossRefs.defaultStyle !== undefined && crossRefs.defaultStyle !== 'default') result.defaultStyle = crossRefs.defaultStyle;
  return Object.keys(result).length > 0 ? result : undefined;
}
