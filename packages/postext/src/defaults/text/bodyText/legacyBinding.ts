// The line binding of postext 1.78 (#1519, #1532): `bodyText.bindCitations`
// and `bindOperators: true` bound the space before a citation and around
// a lone operator. 1.79 prices those breaks instead (`citationBreaks`,
// `operatorBreaks`); a configuration written by 1.78 reads `true` as
// `'avoid'`. The two keys are no setting of the configuration type: they
// are read here, from configurations stored or written for 1.78, and
// nowhere else.
import type { BodyTextConfig, CompositionRule, PostextConfig } from '../../../types.js';

/** Each 1.78 key, with the setting that took its place. */
const LEGACY_BINDING = [['bindCitations', 'citationBreaks'], ['bindOperators', 'operatorBreaks']] as const;

type Json = Record<string, unknown>;

const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

const hasLegacyKey = (body: unknown): body is Json => isRecord(body) && ('bindCitations' in body || 'bindOperators' in body);

/**
 * The rule a 1.78 `bindCitations` (for `citationBreaks`) or `bindOperators`
 * (for `operatorBreaks`) stands for: `'avoid'` when it is `true`, else
 * undefined. The new setting, when set, wins: the caller reads it first.
 */
export function legacyBindingRule(bodyText: BodyTextConfig | undefined, setting: 'citationBreaks' | 'operatorBreaks'): CompositionRule | undefined {
  const old = setting === 'citationBreaks' ? 'bindCitations' : 'bindOperators';
  return isRecord(bodyText) && (bodyText as Json)[old] === true ? 'avoid' : undefined;
}

/** `body` with its 1.78 keys renamed (see {@link renameLegacyLineBinding}). */
function renamed(body: Json): Json {
  const next: Json = { ...body };
  for (const [old, setting] of LEGACY_BINDING) {
    if (!(old in next)) continue;
    if (next[old] === true && next[setting] === undefined) next[setting] = 'avoid';
    delete next[old];
  }
  return next;
}

/**
 * A configuration written by postext 1.78 in today's terms:
 * `bodyText.bindCitations: true` becomes `citationBreaks: 'avoid'` and
 * `bindOperators: true` `operatorBreaks: 'avoid'`, unless the new setting
 * is set already; the old keys are dropped (`false` was the default). The
 * chapter styles' body text is renamed the same way. Configurations stored
 * by 1.78 carry the current `configVersion`, so this runs whatever the
 * version: a configuration without the old keys is returned as it is (the
 * same object), and running it twice changes nothing more.
 */
export function renameLegacyLineBinding<T extends Partial<PostextConfig>>(config: T): T {
  const body = hasLegacyKey(config.bodyText);
  const styles = Array.isArray(config.chapterStyles) && config.chapterStyles.some((s) => isRecord(s) && isRecord(s.config) && hasLegacyKey(s.config.bodyText));
  if (!body && !styles) return config;
  const out: Json = { ...config };
  if (body) out.bodyText = renamed(config.bodyText as Json);
  if (styles) {
    out.chapterStyles = config.chapterStyles!.map((s) => (isRecord(s) && isRecord(s.config) && hasLegacyKey(s.config.bodyText)
      ? { ...s, config: { ...s.config, bodyText: renamed(s.config.bodyText as Json) } }
      : s));
  }
  return out as T;
}
