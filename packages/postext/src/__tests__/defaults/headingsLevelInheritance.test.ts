import { describe, it, expect } from 'vitest';
import { DEFAULT_HEADINGS_CONFIG, resolveHeadingsConfig, stripHeadingsDefaults } from '../../defaults/structure/headings.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import type { HeadingsConfig } from '../../types.js';

// A level inherits the headings-wide face, colour, leading, weight and
// margins (#691): set back to the level default under headings that say
// otherwise, it is an override, and stripping must keep it.

const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

/** The headings of the recipe the defect was found on: 800 throughout,
 *  two levels at the default 700. */
const HEADINGS: HeadingsConfig = {
  fontFamily: 'Nunito Sans',
  fontWeight: 800,
  levels: [
    { level: 2, fontSize: pt(11.5), fontFamily: 'Nunito Sans', fontWeight: 800 },
    { level: 3, fontSize: pt(9.4), fontFamily: 'Nunito Sans', fontWeight: 700 },
    { level: 4, fontSize: pt(9.4), fontFamily: 'Lora', fontWeight: 700, italic: true },
  ],
};

describe('stripHeadingsDefaults: what a level inherits from the headings', () => {
  it('keeps a level weight that restates the level default under another headings-wide weight', () => {
    const stripped = stripHeadingsDefaults(HEADINGS)!;
    expect(stripped.levels!.find((l) => l.level === 3)!.fontWeight).toBe(700);
    expect(stripped.levels!.find((l) => l.level === 4)!.fontWeight).toBe(700);
    expect(resolveHeadingsConfig(stripped).levels).toEqual(resolveHeadingsConfig(HEADINGS).levels);
  });

  it('resolves the same after stripping for every value a level inherits', () => {
    const d = DEFAULT_HEADINGS_CONFIG;
    const headings: HeadingsConfig = {
      fontFamily: 'Oswald',
      color: hex('#aa0000'),
      lineHeight: pt(20),
      fontWeight: 300,
      marginTop: pt(30),
      marginBottom: pt(9),
      // Level 5 is set back to every default the headings moved away from.
      levels: [{ level: 5, fontFamily: d.fontFamily, color: d.color, lineHeight: d.lineHeight, fontWeight: d.fontWeight, marginTop: d.marginTop, marginBottom: d.marginBottom }],
    };
    const stripped = stripHeadingsDefaults(headings)!;
    expect(stripped.levels).toEqual(headings.levels);
    expect(resolveHeadingsConfig(stripped)).toEqual(resolveHeadingsConfig(headings));
    const config = stripConfigDefaults({ headings });
    expect(resolveHeadingsConfig(config.headings)).toEqual(resolveHeadingsConfig(headings));
  });

  it('still drops a level value that restates the default the headings keep', () => {
    const d = DEFAULT_HEADINGS_CONFIG;
    expect(stripHeadingsDefaults({ levels: [{ level: 3, fontWeight: d.fontWeight, fontFamily: d.fontFamily, color: d.color, lineHeight: d.lineHeight, marginTop: d.marginTop, marginBottom: d.marginBottom }] })).toBeUndefined();
    // Headings that move one value leave the others dropped.
    expect(stripHeadingsDefaults({ fontWeight: 800, levels: [{ level: 3, fontFamily: d.fontFamily, marginTop: d.marginTop }] })).toEqual({ fontWeight: 800 });
  });

  it('strips as before a level that restates the headings-wide value', () => {
    // Kept, as it always was: a configuration stripped by an earlier
    // release hashes the same.
    const stripped = stripHeadingsDefaults(HEADINGS)!;
    expect(stripped.levels!.find((l) => l.level === 2)).toEqual({ level: 2, fontSize: pt(11.5), fontFamily: 'Nunito Sans', fontWeight: 800 });
  });
});
