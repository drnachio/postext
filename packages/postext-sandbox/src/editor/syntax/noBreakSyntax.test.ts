import { describe, it, expect } from 'vitest';
import { toggleNoBreak } from './noBreakSyntax.js';

describe('toggleNoBreak', () => {
  it('turns the spaces of a selection into no-break spaces, and back', () => {
    const kept = toggleNoBreak('LR+ = 18,29');
    expect(kept).toBe('LR+\u00A0=\u00A018,29');
    expect(toggleNoBreak(kept)).toBe('LR+ = 18,29');
  });

  it('binds a selection that mixes both kinds, and leaves line ends alone', () => {
    expect(toggleNoBreak('a\u00A0b c')).toBe('a\u00A0b\u00A0c');
    expect(toggleNoBreak('a b\nc d')).toBe('a\u00A0b\nc\u00A0d');
    expect(toggleNoBreak('palabra')).toBe('palabra');
  });
});
