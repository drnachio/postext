import { afterEach, describe, expect, it, vi } from 'vitest';
import { pdfPageFragment, readPageHash, writePageHash } from './pageHash';

// Minimal window stand-in: the helpers only touch `location.hash` and
// `history.replaceState`.
function installWindow(hash: string) {
  const replaceState = vi.fn((_s: unknown, _t: string, url: string) => {
    (globalThis as { window?: unknown }).window = { ...(globalThis as { window: object }).window, location: { hash: url } };
  });
  (globalThis as { window?: unknown }).window = { location: { hash }, history: { state: null, replaceState } };
  return replaceState;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('page hash', () => {
  it('reads a 1-based #page=N as a 0-based index and rejects junk', () => {
    installWindow('#page=3');
    expect(readPageHash()).toBe(2);
    installWindow('#page=0');
    expect(readPageHash()).toBeNull();
    installWindow('#other=1');
    expect(readPageHash()).toBeNull();
    installWindow('');
    expect(readPageHash()).toBeNull();
  });

  it('writes the fragment without a history entry and skips no-op writes', () => {
    const replaceState = installWindow('#page=3');
    writePageHash(2);
    expect(replaceState).not.toHaveBeenCalled();
    writePageHash(5);
    expect(replaceState).toHaveBeenCalledWith(null, '', '#page=6');
  });

  it('builds the PDF viewer fragment', () => {
    expect(pdfPageFragment(null)).toBe('');
    expect(pdfPageFragment(2)).toBe('#page=3');
  });
});
