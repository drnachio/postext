// The contentInConfig check (#849): design texts that hold the book's
// words instead of placeholders (#1276: split out of configWarnings.ts).
import type { DocumentMetadata, PostextConfig } from '../../types.js';
import type { ConfigWarning } from '../../vdt.js';
import { resolveContentInConfigCheck } from '../../defaults/output/checks.js';
import { stripPlaceholders } from '../../pipeline/pages/placeholders.js';
import { configDesignSlots } from '../../design/slots.js';
import { metadataText } from '../../parse/frontmatter.js';
import type { ConfigWarningOptions } from './collect.js';

/** Most element paths a `contentInConfig` warning lists. */
const CONTENT_IN_CONFIG_MAX_PATHS = 20;
/** Longest sample of the first literal a `contentInConfig` warning quotes. */
const CONTENT_IN_CONFIG_SAMPLE = 40;
/** What a character of a script written without spaces (Chinese,
 *  Japanese, Korean, Thai) counts toward `maxChars`: such a text has no
 *  words to count, and one of its characters says about as much as a short
 *  Latin word, so the default limit of 24 lets eight of them through
 *  (`第{number}章`, `こころ`, `夏目漱石`). */
const UNSPACED_CHAR_WEIGHT = 3;

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const LETTERS_OR_DIGITS = /[\p{L}\p{N}]/gu;
const UNSPACED_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;
const UNSPACED_LETTERS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/gu;

/** A literal as the allow list compares it: no case, the words it holds
 *  between spaces with the punctuation around them dropped (`·`, a comma,
 *  quotes), one space between them. Punctuation inside a word stays, so an
 *  address (`postext.dev`) or a version (`4.0`) is one word. */
function comparableLiteral(text: string): string {
  return text.normalize('NFKC').toLowerCase().split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}\p{M}]+$/gu, ''))
    .filter(Boolean).join(' ');
}

/** `text` with every occurrence of the allowed phrase `phrase` taken out
 *  (both comparable): between spaces, or anywhere in text written without
 *  them. */
function withoutPhrase(text: string, phrase: string): string {
  if (!phrase || !text) return text;
  if (UNSPACED_SCRIPT.test(phrase)) return text.split(phrase).join(' ').replace(/\s+/g, ' ').trim();
  return ` ${text} `.split(` ${phrase} `).join('  ').replace(/\s+/g, ' ').trim();
}

/** The literal text a design text prints whatever the document: its
 *  content with every placeholder removed, on one line (#849). */
export function designTextLiteral(content: string): string {
  return stripPlaceholders(content).replace(/\s+/g, ' ').trim();
}

/** What {@link collectConfigWarnings} may read besides the config. */
/** The phrases of the metadata a design may repeat. */
function metadataPhrases(metadata: DocumentMetadata | undefined): string[] {
  if (!metadata) return [];
  const out: string[] = [];
  for (const key of ['title', 'subtitle', 'author', 'publisher']) {
    const v = metadata[key];
    const values = Array.isArray(v) ? v : [v];
    for (const one of values) {
      const text = metadataText(one);
      if (text) out.push(text);
    }
  }
  return out;
}

/** How the `contentInConfig` check reads one design text: its literal
 *  (placeholders removed), what is left once the allowed phrases are taken
 *  out (`rest`, compared without case), the letters and digits of `rest`,
 *  and whether the text counts as content. */
export interface DesignTextVerdict {
  literal: string;
  rest: string;
  chars: number;
  content: boolean;
}

/** The `contentInConfig` rule of a configuration (#849), as a function of a
 *  design text's `content`: the check's settings and allowed phrases (and
 *  the metadata's) read once. Disabled checks still answer, as if enabled:
 *  the migration of #874 asks what the check would say. Pure. */
export function contentInConfigRule(config: PostextConfig | undefined, options: ConfigWarningOptions = {}): (content: string) => DesignTextVerdict {
  const check = resolveContentInConfigCheck(config?.checks?.contentInConfig);
  const allow = [...new Set([...check.allow, ...metadataPhrases(options.metadata)].map(comparableLiteral).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  return (content: string): DesignTextVerdict => {
    const literal = designTextLiteral(content);
    if (!LETTER_OR_DIGIT.test(literal)) return { literal, rest: '', chars: 0, content: false };
    let rest = comparableLiteral(literal);
    for (const phrase of allow) rest = withoutPhrase(rest, phrase);
    const chars = rest.match(LETTERS_OR_DIGITS)?.length ?? 0;
    if (chars === 0) return { literal, rest, chars, content: false };
    const unspaced = rest.match(UNSPACED_LETTERS)?.length ?? 0;
    const weight = chars + unspaced * (UNSPACED_CHAR_WEIGHT - 1);
    // A run of unspaced script is no word count: its characters are weighed.
    const words = rest.split(' ').filter((w) => LETTER_OR_DIGIT.test(w) && !UNSPACED_SCRIPT.test(w)).length;
    return { literal, rest, chars, content: words > check.maxWords || weight > check.maxChars };
  };
}

/** Content held in the configuration (#849): design text elements whose
 *  literal text — their content with every placeholder removed, and the
 *  phrases of `checks.contentInConfig.allow` (and of the metadata) taken
 *  out — is longer than `maxWords` words or `maxChars` letters and digits.
 *  One warning per owner (a heading style, a heading level, the page
 *  header, a part design…): `path` is the owner, `count` the texts at
 *  fault, `chars` their letters and digits, `elements` the path of each
 *  (the first 20), `value` the start of the first one's literal. */
export function collectContentInConfigWarnings(config: PostextConfig, options: ConfigWarningOptions): ConfigWarning[] {
  const check = resolveContentInConfigCheck(config.checks?.contentInConfig);
  if (!check.enabled) return [];
  const verdict = contentInConfigRule(config, options);
  const groups = new Map<string, { ownerId?: string; elements: string[]; count: number; chars: number; sample: string }>();
  for (const slot of configDesignSlots(config)) {
    slot.slot.elements.forEach((el, i) => {
      const e = el as { kind?: unknown; content?: unknown } | null;
      if (!e || typeof e !== 'object' || e.kind !== 'text' || typeof e.content !== 'string') return;
      const { literal, chars, content } = verdict(e.content);
      if (!content) return;
      let g = groups.get(slot.owner);
      if (!g) {
        const points = Array.from(literal);
        const sample = points.length > CONTENT_IN_CONFIG_SAMPLE ? `${points.slice(0, CONTENT_IN_CONFIG_SAMPLE - 1).join('').trimEnd()}…` : literal;
        g = { ...(slot.ownerId !== undefined ? { ownerId: slot.ownerId } : {}), elements: [], count: 0, chars: 0, sample };
        groups.set(slot.owner, g);
      }
      g.count++;
      g.chars += chars;
      if (g.elements.length < CONTENT_IN_CONFIG_MAX_PATHS) g.elements.push(`${slot.path}.elements[${i}]`);
    });
  }
  return [...groups].map(([owner, g]) => ({
    kind: 'contentInConfig' as const,
    path: owner,
    value: g.sample,
    used: '',
    count: g.count,
    chars: g.chars,
    elements: g.elements,
    ...(g.ownerId !== undefined ? { ownerId: g.ownerId } : {}),
  }));
}
