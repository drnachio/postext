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

// A browser stand-in that matches a font shorthand to the faces of its
// family in `document.fonts` (the nearest weight, as CSS does) and draws
// the probe brackets with the ink of the face it picked: a bold face's ink
// is wider, and a face with `"vert" 1` in its `featureSettings` has the
// vertical forms only when the browser applies the feature (Chrome 140 and
// later) — Chrome 131 ignores it.
describe('vertical alternates: the probe compares faces of one weight (#220)', () => {
  const g = globalThis as Record<string, unknown>;
  let applies = false;
  const fonts = new Set<WeightedFace>();
  class WeightedFace {
    constructor(readonly family: string, readonly source: unknown, readonly descriptors: Record<string, string>) {}
  }
  const weightOf = (f: WeightedFace) => Number(f.descriptors.weight ?? 400);
  class MatchingCtx {
    font = '';
    measureText() {
      const m = /^(?:(italic|oblique) )?(?:(\d+) )?(\d+)px "(.+)"$/.exec(this.font);
      const weight = Number(m?.[2] ?? 400);
      const family = m?.[4] ?? '';
      const faces = [...fonts].filter((f) => f.family === family);
      // No face of the family: the fallback font.
      if (faces.length === 0) return { actualBoundingBoxLeft: 0, actualBoundingBoxRight: 10, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 5 };
      const face = faces.reduce((a, b) => (Math.abs(weightOf(b) - weight) < Math.abs(weightOf(a) - weight) ? b : a));
      const vertical = applies && /"vert" 1/.test(face.descriptors.featureSettings ?? '');
      const bold = weightOf(face) >= 600 ? 8 : 0;
      return { actualBoundingBoxLeft: 0, actualBoundingBoxRight: (vertical ? 30 : 50) + bold, actualBoundingBoxAscent: vertical ? 90 : 80, actualBoundingBoxDescent: 10 };
    }
  }
  // The host's own faces of the family (as the Cookbook kit adds them):
  // regular and bold, each one file.
  const hostFaces = () => {
    for (const weight of ['400', '700']) fonts.add(new WeightedFace('Book Serif TC', `https://fonts.example/tc-${weight}.woff2`, { weight }));
  };
  beforeAll(() => {
    g.FontFace = WeightedFace;
    g.OffscreenCanvas = class { getContext() { return new MatchingCtx(); } };
    g.document = {
      fonts: {
        add: (f: WeightedFace) => fonts.add(f),
        delete: (f: WeightedFace) => fonts.delete(f),
        load: () => Promise.resolve([]),
      },
    };
  });
  afterAll(() => {
    unregisterVerticalAlternates();
    delete g.FontFace;
    delete g.OffscreenCanvas;
    delete g.document;
  });

  it('registers no twin of the bold faces when the browser ignores the feature', async () => {
    applies = false;
    fonts.clear();
    hostFaces();
    const bold = [{ source: 'https://fonts.example/tc-700.woff2', weight: '700', style: 'normal' }];
    expect(await loadVerticalAlternates('Book Serif TC', bold)).toBe(false);
    expect(verticalAlternatesOf('Book Serif TC')).toBeUndefined();
    // Neither the twin's faces nor the probe's copy stay behind.
    expect([...fonts].map((f) => f.family)).toEqual(['Book Serif TC', 'Book Serif TC']);
    unregisterVerticalAlternates('Book Serif TC');
  });

  it('registers the twin of the bold faces when the browser applies the feature', async () => {
    applies = true;
    fonts.clear();
    hostFaces();
    const bold = [{ source: 'https://fonts.example/tc-700.woff2', weight: '700', style: 'normal' }];
    expect(await loadVerticalAlternates('Book Serif TC', bold)).toBe(true);
    expect(verticalAlternatesOf('Book Serif TC')).toMatch(/^Book Serif TC postext-vert/);
    expect([...fonts].filter((f) => f.family.includes('postext-probe'))).toEqual([]);
    unregisterVerticalAlternates('Book Serif TC');
  });

  // The Cookbook kit loads a book's voices one call at a time: the regular
  // face for the text, then the bold for the headings.
  it('probes each call for another weight with its own faces', async () => {
    const regular = [{ source: 'https://fonts.example/tc-400.woff2', weight: '400', style: 'normal' }];
    const bold = [{ source: 'https://fonts.example/tc-700.woff2', weight: '700', style: 'normal' }];
    applies = false;
    fonts.clear();
    hostFaces();
    expect(await loadVerticalAlternates('Book Serif TC', regular)).toBe(false);
    expect(await loadVerticalAlternates('Book Serif TC', bold)).toBe(false);
    expect(verticalAlternatesOf('Book Serif TC')).toBeUndefined();
    unregisterVerticalAlternates('Book Serif TC');

    applies = true;
    fonts.clear();
    hostFaces();
    expect(await loadVerticalAlternates('Book Serif TC', regular)).toBe(true);
    const twin = verticalAlternatesOf('Book Serif TC')!;
    // The bold faces join the registered twin, with the feature on.
    expect(await loadVerticalAlternates('Book Serif TC', bold)).toBe(true);
    expect(verticalAlternatesOf('Book Serif TC')).toBe(twin);
    const twinFaces = [...fonts].filter((f) => f.family === twin);
    expect(twinFaces.map((f) => f.descriptors.weight).sort()).toEqual(['400', '700']);
    expect(twinFaces.every((f) => /"vert" 1/.test(f.descriptors.featureSettings ?? ''))).toBe(true);
    // Asked again, nothing is added twice; forgotten, every face goes.
    expect(await loadVerticalAlternates('Book Serif TC', [...regular, ...bold])).toBe(true);
    expect([...fonts].filter((f) => f.family === twin)).toHaveLength(2);
    unregisterVerticalAlternates('Book Serif TC');
    expect([...fonts].filter((f) => f.family === twin)).toHaveLength(0);
  });

  it('probes a twin of every weight with the regular face, and a variable face at 400', async () => {
    for (const on of [false, true]) {
      applies = on;
      fonts.clear();
      hostFaces();
      const both = [
        { source: 'https://fonts.example/tc-700.woff2', weight: '700', style: 'normal' },
        { source: 'https://fonts.example/tc-400.woff2', weight: '400', style: 'normal' },
      ];
      expect(await loadVerticalAlternates('Book Serif TC', both)).toBe(on);
      unregisterVerticalAlternates('Book Serif TC');
      fonts.clear();
      expect(await loadVerticalAlternates('Book Sans TC', [{ source: 'https://fonts.example/sans.woff2', weight: '100 900' }])).toBe(on);
      unregisterVerticalAlternates('Book Sans TC');
    }
  });
});
