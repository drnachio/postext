import { describe, expect, it } from 'vitest';
import { fontWeightName } from './fontWeightName.js';

describe('fontWeightName', () => {
  it('names the hundreds and nothing between', () => {
    expect(fontWeightName(400)).toBe('Regular');
    expect(fontWeightName(700)).toBe('Bold');
    expect(fontWeightName(450)).toBeUndefined();
  });
});
