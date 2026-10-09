import type { ResolvedVerseConfig, VerseConfig } from '../types';
import { dimensionsEqual } from './shared';

/** Poems in the line layout (#620): two leading spaces indent a line one
 *  em, a turnover hangs two ems, a line of space between stanzas, a line
 *  a little too wide tightens its word spaces before it turns over. */
export const DEFAULT_VERSE_CONFIG: ResolvedVerseConfig = {
  layout: 'auto',
  indentStep: { value: 0.5, unit: 'em' },
  turnover: 'hang',
  hang: { value: 2, unit: 'em' },
  turnoverMark: '[',
  stanzaSpace: 1,
  keepStanzas: 0,
  tighten: true,
};

/** `bodyText.verse` in full (see {@link DEFAULT_VERSE_CONFIG}). */
export function resolveVerseConfig(partial?: VerseConfig): ResolvedVerseConfig {
  const D = DEFAULT_VERSE_CONFIG;
  if (!partial) return D;
  const count = (v: number | undefined, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
  return {
    layout: partial.layout === 'bayt' ? 'bayt' : 'auto',
    indentStep: partial.indentStep ?? D.indentStep,
    turnover: partial.turnover === 'right' ? 'right' : 'hang',
    hang: partial.hang ?? D.hang,
    turnoverMark: partial.turnoverMark ?? D.turnoverMark,
    stanzaSpace: count(partial.stanzaSpace, D.stanzaSpace),
    keepStanzas: Math.floor(count(partial.keepStanzas, D.keepStanzas)),
    tighten: partial.tighten === false ? false : D.tighten,
  };
}

/** `bodyText.verse` without the fields that hold their default; undefined
 *  when none is left. */
export function stripVerseDefaults(verse?: VerseConfig): VerseConfig | undefined {
  if (!verse) return undefined;
  const D = DEFAULT_VERSE_CONFIG;
  const out: VerseConfig = {};
  if (verse.layout !== undefined && verse.layout !== D.layout) out.layout = verse.layout;
  if (verse.indentStep !== undefined && !dimensionsEqual(verse.indentStep, D.indentStep)) out.indentStep = verse.indentStep;
  if (verse.turnover !== undefined && verse.turnover !== D.turnover) out.turnover = verse.turnover;
  if (verse.hang !== undefined && !dimensionsEqual(verse.hang, D.hang)) out.hang = verse.hang;
  if (verse.turnoverMark !== undefined && verse.turnoverMark !== D.turnoverMark) out.turnoverMark = verse.turnoverMark;
  if (verse.stanzaSpace !== undefined && verse.stanzaSpace !== D.stanzaSpace) out.stanzaSpace = verse.stanzaSpace;
  if (verse.keepStanzas !== undefined && verse.keepStanzas !== D.keepStanzas) out.keepStanzas = verse.keepStanzas;
  if (verse.tighten !== undefined && verse.tighten !== D.tighten) out.tighten = verse.tighten;
  return Object.keys(out).length > 0 ? out : undefined;
}
