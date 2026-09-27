import { describe, it, expect, vi } from 'vitest';

// Any import of React from the main entry's module graph fails this file.
vi.mock('react', () => {
  throw new Error('the main entry imported react');
});

describe('postext main entry', () => {
  it('does not load React: only `postext/react` (and the deprecated createLayout, lazily) needs it', async () => {
    const postext = await import('../index');
    expect(typeof postext.buildDocument).toBe('function');
    expect(typeof postext.createLayout).toBe('function');
  });
});
