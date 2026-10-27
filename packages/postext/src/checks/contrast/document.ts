// Checking a whole document's pairs against the thresholds and the allow list.
import type { ContrastAllowEntry } from '../../types.js';
import type { VDTDocument } from '../../vdt.js';
import { resolveContrastConfig } from '../../defaults/output/contrast.js';
import { contrastMedia } from './colours.js';
import { contrastPairs } from './pairs.js';
import type { ContrastOptions, ContrastIssue, ContrastPair, ContrastMedium, ContrastAccepted } from './types.js';

/**
 * The text of `doc` that does not read: every text and ground pair under
 * the ratio its size, its weight and `contrast.level` ask, in the
 * renditions `contrast.mode` names (`lowContrast`, one finding per pair
 * and threshold, at its first occurrence), and in print the reversed text
 * under the sizes of `contrast.reversedText` (`reversedText`). Worst
 * ratio first. Empty when `contrast.enabled` is off.
 */
export function contrastDocument(doc: VDTDocument, options: ContrastOptions = {}): ContrastIssue[] {
  const contrast = options.contrast ?? doc.config.contrast ?? resolveContrastConfig();
  if (!contrast.enabled) return [];
  const media = options.media ?? contrastMedia(doc.config, contrast);
  const screen = media.includes('screen');
  const print = media.includes('print');
  if (!screen && !print) return [];
  const pairs = options.pairs ?? contrastPairs(doc, { ...options, contrast });
  const low = new Map<string, Extract<ContrastIssue, { kind: 'lowContrast' }>>();
  const reversed = new Map<string, Extract<ContrastIssue, { kind: 'reversedText' }>>();
  const allow = contrast.allow ?? [];

  // The finding of a pair is its first occurrence, at its smallest size.
  const merge = <T extends ContrastIssue>(into: T, pair: ContrastPair): void => {
    into.count += pair.count;
    const earlier = pair.pageIndex < into.pageIndex;
    if (pair.sizePt < into.sizePt) {
      into.sizePt = pair.sizePt;
      into.weight = pair.weight;
      into.italic = pair.italic;
    }
    if (earlier) {
      into.pageIndex = pair.pageIndex;
      into.rect = pair.rect;
      into.text = pair.text;
      into.role = pair.role;
      delete into.sourceStart;
      delete into.sourceEnd;
      if (pair.sourceStart !== undefined) into.sourceStart = pair.sourceStart;
      if (pair.sourceEnd !== undefined) into.sourceEnd = pair.sourceEnd;
    }
  };
  const base = (pair: ContrastPair) => ({
    pageIndex: pair.pageIndex,
    rect: pair.rect,
    ...(pair.sourceStart !== undefined ? { sourceStart: pair.sourceStart } : {}),
    ...(pair.sourceEnd !== undefined ? { sourceEnd: pair.sourceEnd } : {}),
    color: pair.color,
    background: pair.background,
    sizePt: pair.sizePt,
    weight: pair.weight,
    italic: pair.italic,
    role: pair.role,
    text: pair.text,
    count: pair.count,
  });
  const round = (ratio: number) => Math.floor(ratio * 100) / 100;

  for (const pair of pairs) {
    const failing: ContrastMedium[] = [];
    if (screen && pair.screen < pair.required) failing.push('screen');
    if (print && pair.print !== undefined && pair.print < pair.required) failing.push('print');
    const entry = allow.length > 0 && (failing.length > 0 || pair.reversed) ? allowEntryFor(pair, allow) : undefined;
    const accepted = entry ? acceptedBy(entry) : undefined;
    const mark = accepted ? '|accepted' : '';
    if (failing.length > 0) {
      const key = `${pair.color}|${pair.background}|${pair.required}${mark}`;
      const seen = low.get(key);
      if (seen) {
        merge(seen, pair);
      } else {
        low.set(key, {
          ...base(pair),
          kind: 'lowContrast',
          level: contrast.level,
          large: pair.large,
          required: pair.required,
          ...(screen ? { screen: round(pair.screen) } : {}),
          ...(print && pair.print !== undefined ? { print: round(pair.print) } : {}),
          failing,
          ...(accepted ? { accepted } : {}),
        });
      }
    }
    if (print && contrast.reversedText.enabled && pair.reversed) {
      const key = `${pair.color}|${pair.background}${mark}`;
      const seen = reversed.get(key);
      if (seen) {
        for (const reason of pair.reversed.reasons) if (!seen.reasons.includes(reason)) seen.reasons.push(reason);
        seen.minimumPt = Math.max(seen.minimumPt, pair.reversed.minimumPt);
        merge(seen, pair);
      } else {
        reversed.set(key, { ...base(pair), kind: 'reversedText', reasons: [...pair.reversed.reasons], minimumPt: pair.reversed.minimumPt, inks: pair.reversed.inks, ...(accepted ? { accepted } : {}) });
      }
    }
  }
  const worst = (issue: Extract<ContrastIssue, { kind: 'lowContrast' }>) => Math.min(issue.screen ?? Infinity, issue.print ?? Infinity);
  const sorted = [
    ...[...low.values()].sort((a, b) => worst(a) - worst(b) || a.pageIndex - b.pageIndex),
    ...[...reversed.values()].sort((a, b) => a.sizePt - b.sizePt || a.pageIndex - b.pageIndex),
  ];
  // The accepted findings after the others, in the same order.
  return allow.length > 0 ? [...sorted.filter((i) => !i.accepted), ...sorted.filter((i) => i.accepted)] : sorted;
}

const sameHex = (a: string | undefined, b: string): boolean => a !== undefined && a.toLowerCase() === b.toLowerCase();

/** The first `contrast.allow` entry (resolved: colours `#rrggbb` in lower
 *  case) that accepts `pair`: its colours are the text's and the ground's
 *  as written or as painted, its style one the text is set in. */
export function allowEntryFor(pair: ContrastPair, allow: readonly ContrastAllowEntry[]): ContrastAllowEntry | undefined {
  return allow.find((e) =>
    (e.fg !== undefined || e.bg !== undefined || e.style !== undefined)
    && (e.fg === undefined || sameHex(e.fg, pair.textColor) || sameHex(e.fg, pair.color))
    && (e.bg === undefined || sameHex(e.bg, pair.groundColor) || sameHex(e.bg, pair.background))
    && (e.style === undefined || (pair.styles?.includes(e.style) ?? false)));
}

function acceptedBy(entry: ContrastAllowEntry): ContrastAccepted {
  return {
    reason: entry.reason,
    ...(entry.fg !== undefined ? { fg: entry.fg } : {}),
    ...(entry.bg !== undefined ? { bg: entry.bg } : {}),
    ...(entry.style !== undefined ? { style: entry.style } : {}),
  };
}
