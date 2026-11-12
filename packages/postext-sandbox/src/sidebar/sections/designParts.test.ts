import { describe, it, expect } from 'vitest';
import { BOOK_OWN_KEYS, DESIGN_PARTS, DESIGN_PART_SLOTS, designPartOf } from 'postext';
import { SETTINGS_GROUPS, SETTINGS_SECTIONS } from './registry.js';

// The parts of a design (#1523) are the Design panel's groups: the table
// lives in the engine (the CLI reads it too), and must say what the panel
// shows.

const OWN = new Set<string>(BOOK_OWN_KEYS);
/** Settings a section edits that its registry entry does not list: the
 *  symbol font is a field of the Body text section. */
const UNLISTED: Record<string, string> = { symbolFont: 'text' };

describe('design parts and the Design panel', () => {
  it('has one part per settings group, in the same order', () => {
    expect([...DESIGN_PARTS]).toEqual(SETTINGS_GROUPS.map((g) => g.id));
  });

  it('puts every setting a group edits in that group’s part', () => {
    for (const s of SETTINGS_SECTIONS) {
      for (const key of s.configKeys) {
        if (OWN.has(key)) continue;
        const parts = DESIGN_PART_SLOTS.filter((slot) => slot.key === key).map((slot) => slot.part);
        expect(parts, `${s.id} edits ${key}`).toContain(s.group);
      }
    }
  });

  it('shows every setting of a part in that part’s group', () => {
    for (const slot of DESIGN_PART_SLOTS) {
      if (UNLISTED[slot.key] === slot.part) continue;
      const groups = SETTINGS_SECTIONS.filter((s) => (s.configKeys as readonly string[]).includes(slot.key)).map((s) => s.group);
      expect(groups, `${slot.part} holds ${slot.key}${slot.field ? `.${slot.field}` : ''}`).toContain(slot.part);
    }
  });

  it('splits the shared settings as the sections do', () => {
    // As sectionOverrides.ts reads them.
    expect(designPartOf('page', 'binding')).toBe('writing');
    expect(designPartOf('page', 'cutLines')).toBe('output');
    expect(designPartOf('page', 'baselineGrid')).toBe('advanced');
    expect(designPartOf('page', 'margins')).toBe('page');
    expect(designPartOf('layout', 'writingMode')).toBe('writing');
    expect(designPartOf('layout', 'gutterWidth')).toBe('page');
    // The composition rules (#1540) are the Composition group's.
    expect(designPartOf('bodyText')).toBe('text');
    expect(designPartOf('bodyText', 'stacks')).toBe('composition');
    expect(designPartOf('bodyText', 'hyphenation.ladders')).toBe('composition');
  });
});
