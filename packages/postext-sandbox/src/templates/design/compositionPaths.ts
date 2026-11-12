/**
 * The composition part of a design: a language's typesetting rules — the
 * hyphen ladders, the divided last word, the dictionary's limits, the
 * stacks, a hyphen at the foot of a column. Unlike the other parts it is a
 * list of settings inside `bodyText`, not top-level keys, so applying the
 * type does not reset the rules and applying the rules does not touch the
 * type.
 */

import { resolveBodyTextConfig, type PostextConfig } from 'postext';

/** The settings of the composition part, as dotted paths. */
export const COMPOSITION_PATHS: readonly string[] = [
  'bodyText.hyphenation.ladders',
  'bodyText.hyphenation.maxConsecutive',
  'bodyText.hyphenation.ladderPenalty',
  'bodyText.hyphenation.lastWord',
  'bodyText.hyphenation.lastWordPenalty',
  'bodyText.hyphenation.fewerHyphens',
  'bodyText.hyphenation.minWordLength',
  'bodyText.hyphenation.leftMin',
  'bodyText.hyphenation.rightMin',
  'bodyText.hyphenation.capitalized',
  'bodyText.stacks',
  'bodyText.stackMinCharacters',
  'bodyText.stackPenalty',
  'bodyText.hyphenateAcrossColumns',
];

type Node = Record<string, unknown>;

const isNode = (v: unknown): v is Node => !!v && typeof v === 'object' && !Array.isArray(v);

/** The value at `path`, or undefined. */
export function getPath(config: PostextConfig, path: string): unknown {
  let node: unknown = config;
  for (const key of path.split('.')) {
    if (!isNode(node)) return undefined;
    node = node[key];
  }
  return node;
}

/** `config` with `path` set to `value`, or removed when `value` is
 *  undefined (an object left empty goes too). The objects on the way are
 *  copied; the rest is shared. */
export function withPath(config: PostextConfig, path: string, value: unknown): PostextConfig {
  const put = (node: unknown, keys: readonly string[]): Node | undefined => {
    const [key, ...rest] = keys;
    const out: Node = isNode(node) ? { ...node } : {};
    const child = rest.length === 0 ? value : put(out[key!], rest);
    if (child === undefined) delete out[key!];
    else out[key!] = child;
    return Object.keys(out).length > 0 ? out : undefined;
  };
  if (value === undefined && getPath(config, path) === undefined) return config;
  return (put(config, path.split('.')) ?? {}) as PostextConfig;
}

/** Whether a configuration sets any composition setting. */
export function holdsComposition(config: PostextConfig): boolean {
  return COMPOSITION_PATHS.some((p) => getPath(config, p) !== undefined);
}

/** `config` without its composition settings. */
export function withoutComposition(config: PostextConfig): PostextConfig {
  return COMPOSITION_PATHS.reduce((c, p) => withPath(c, p, undefined), config);
}

/** `target` with the composition settings of `source`: each takes
 *  `source`'s value, or goes back to its default when `source` leaves it
 *  unset. */
export function withCompositionOf(target: PostextConfig, source: PostextConfig): PostextConfig {
  return COMPOSITION_PATHS.reduce((c, p) => {
    const v = getPath(source, p);
    return withPath(c, p, v === undefined ? undefined : structuredClone(v));
  }, target);
}

/** Whether two configurations set the same composition (unset on both, or
 *  the same value). */
export function sameComposition(a: PostextConfig, b: PostextConfig): boolean {
  return COMPOSITION_PATHS.every((p) => JSON.stringify(getPath(a, p)) === JSON.stringify(getPath(b, p)));
}

/** Whether `config` is set by the composition `rules` already: each rule
 *  resolves to the same value with the book's settings as with the rules'
 *  (a value written out that is the default counts as unset). */
export function followsComposition(config: PostextConfig, rules: PostextConfig): boolean {
  const resolved = (c: PostextConfig): PostextConfig => ({ bodyText: resolveBodyTextConfig(c.bodyText, c.locale) as PostextConfig['bodyText'] });
  return sameComposition(resolved(config), resolved(withCompositionOf(config, rules)));
}
