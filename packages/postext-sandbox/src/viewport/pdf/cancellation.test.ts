import { describe, it, expect } from 'vitest';
import { isCancellation } from './cancellation.js';

describe('isCancellation (#1434)', () => {
  it('takes a disposed worker\'s AbortError as a cancellation', () => {
    expect(isCancellation(new DOMException('Worker disposed', 'AbortError'))).toBe(true);
  });

  it('takes any other failure as an error', () => {
    expect(isCancellation(new Error('PDF worker has been disposed'))).toBe(false);
    expect(isCancellation(new TypeError('bad'))).toBe(false);
    expect(isCancellation(null)).toBe(false);
    expect(isCancellation('AbortError')).toBe(false);
  });
});
