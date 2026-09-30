import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadVerticalAlternates, unregisterVerticalAlternates, verticalAlternatesOf } from '../../canvas-backend/verticalText';

// A browser stand-in: `document.fonts` keeps the faces added to it, and a
// canvas measures the probe brackets with other ink in a twin face (the
// feature applied).
const added = new Set<object>();
let release: (() => void) | undefined;
class FakeFontFace {
  constructor(readonly family: string, readonly source: unknown, readonly descriptors: Record<string, string>) {}
}
class FakeCtx {
  font = '';
  measureText() {
    const twin = this.font.includes('postext-vert');
    return { actualBoundingBoxLeft: 0, actualBoundingBoxRight: twin ? 30 : 50, actualBoundingBoxAscent: 80, actualBoundingBoxDescent: 10 };
  }
}

describe('vertical alternates: a family loaded again (#188 review)', () => {
  const g = globalThis as Record<string, unknown>;
  beforeAll(() => {
    g.FontFace = FakeFontFace;
    g.OffscreenCanvas = class { getContext() { return new FakeCtx(); } };
    g.document = {
      fonts: {
        add: (f: object) => added.add(f),
        delete: (f: object) => added.delete(f),
        // Held until the test lets it go, when `release` is armed.
        load: () => (release ? new Promise<void>((r) => { const prev = release!; release = () => { prev(); r(); }; }) : Promise.resolve([])),
      },
    };
  });
  afterAll(() => {
    unregisterVerticalAlternates();
    delete g.FontFace;
    delete g.OffscreenCanvas;
    delete g.document;
  });

  it('drops the faces of a twin it forgets, and loads the new file under a fresh name', async () => {
    expect(await loadVerticalAlternates('Book Serif', [{ source: new ArrayBuffer(8) }])).toBe(true);
    expect(verticalAlternatesOf('Book Serif')).toBe('Book Serif postext-vert');
    expect(added.size).toBe(1);
    unregisterVerticalAlternates('Book Serif');
    expect(verticalAlternatesOf('Book Serif')).toBeUndefined();
    expect(added.size).toBe(0);
    expect(await loadVerticalAlternates('Book Serif', [{ source: new ArrayBuffer(16) }])).toBe(true);
    expect(verticalAlternatesOf('Book Serif')).toMatch(/^Book Serif postext-vert \d+$/);
    expect(added.size).toBe(1);
    unregisterVerticalAlternates('Book Serif');
  });

  it('keeps no twin from a load that was dropped while it waited for its faces', async () => {
    release = () => {};
    const stale = loadVerticalAlternates('Old Serif', [{ source: new ArrayBuffer(8) }]);
    unregisterVerticalAlternates('Old Serif');
    const go = release;
    release = undefined;
    go();
    expect(await stale).toBe(false);
    expect(verticalAlternatesOf('Old Serif')).toBeUndefined();
    expect([...added].some((f) => (f as FakeFontFace).family.startsWith('Old Serif'))).toBe(false);
  });
});
