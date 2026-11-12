import { describe, it, expect } from 'vitest';
import type { PostextConfig } from 'postext';
import { compositionOnly, holdsBodyText, holdsComposition, withoutComposition } from './compositionSlots.js';
import { sectionHasOverrides } from '../sectionOverrides.js';

// The Body text and Composition rules sections share `bodyText` (#1540):
// each marks and resets its own fields only.

const book: PostextConfig = {
  bodyText: {
    fontFamily: 'Lora',
    stacks: 'avoid',
    hyphenation: { locale: 'es', ladders: 'avoid', maxConsecutive: 1 },
  },
};

describe('composition slots', () => {
  it('tell the two sections apart', () => {
    expect(holdsComposition(book)).toBe(true);
    expect(holdsBodyText(book)).toBe(true);
    expect(holdsComposition({ bodyText: { fontFamily: 'Lora' } })).toBe(false);
    expect(holdsBodyText({ bodyText: { stacks: 'avoid', hyphenation: { leftMin: 3 } } })).toBe(false);
    expect(sectionHasOverrides({ bodyText: { stacks: 'avoid' } }, 'bodyText')).toBe(false);
    expect(sectionHasOverrides({ bodyText: { stacks: 'avoid' } }, 'composition')).toBe(true);
    expect(sectionHasOverrides({ bodyText: { fontFamily: 'Lora' } }, 'composition')).toBe(false);
  });

  it('reset each section without the other’s fields', () => {
    expect(compositionOnly(book.bodyText)).toEqual({ stacks: 'avoid', hyphenation: { ladders: 'avoid', maxConsecutive: 1 } });
    expect(withoutComposition(book.bodyText)).toEqual({ fontFamily: 'Lora', hyphenation: { locale: 'es' } });
    expect(compositionOnly({ fontFamily: 'Lora' })).toBeUndefined();
    expect(withoutComposition({ stacks: 'warn' })).toBeUndefined();
  });
});
