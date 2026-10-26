import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { configFontFaces, parseFontString, type FontFaceLike, type PostextConfig } from 'postext';
import { createFontGate, ensureConfigFontsLoaded, missingConfigFontSpecs } from './fontLoader.js';

// The hold of the previews on their first build (#659), against a font set
// that does what Chrome does when a font style sheet lands: the faces of
// every style sheet are made anew, unloaded, and the ones loaded so far
// are left out of the set.

interface Rule {
  family: string;
  /** `'400'`, or a variable range `'100 900'`. */
  weight: string;
  style: 'normal' | 'italic';
}

class Face implements FontFaceLike {
  status = 'unloaded';
  constructor(readonly family: string, readonly weight: string, readonly style: string) {}
}

type Listener = (event: { fontfaces?: readonly FontFaceLike[] }) => void;

class StyleSheetFontSet {
  private sheets: Rule[][] = [];
  private faces: Face[] = [];
  private listeners = new Set<Listener>();
  /** Families whose files never arrive. */
  broken = new Set<string>();
  /** Every `load` asked of the set. */
  loads: string[] = [];
  /** `load` throws instead of answering (a font set torn down mid-wait). */
  throws = false;
  readonly status = 'loaded';
  readonly ready = Promise.resolve();

  get size(): number {
    return this.faces.length;
  }
  [Symbol.iterator](): Iterator<FontFaceLike> {
    return this.faces[Symbol.iterator]();
  }
  add(): this {
    return this;
  }
  addEventListener(_type: string, listener: Listener): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: string, listener: Listener): void {
    this.listeners.delete(listener);
  }

  /** A font style sheet lands. */
  land(rules: Rule[]): void {
    this.sheets.push(rules);
    this.faces = this.sheets.flat().map((r) => new Face(r.family, r.weight, r.style));
  }

  /** The face CSS matching settles on: the slant asked when the family
   *  has it, then the nearest weight. */
  private match(font: string): Face | undefined {
    const want = parseFontString(font);
    if (!want) return undefined;
    const family = this.faces.filter((f) => f.family.toLowerCase() === want.family.toLowerCase());
    const slant = family.filter((f) => f.style === want.style);
    const pool = slant.length > 0 ? slant : family;
    const distance = (f: Face): number => {
      const [lo, hi = lo] = f.weight.split(' ').map(Number) as [number, number?];
      return want.weight < lo ? lo - want.weight : want.weight > hi ? want.weight - hi : 0;
    };
    return [...pool].sort((a, b) => distance(a) - distance(b))[0];
  }

  /** True for a family nothing declares, as in Chrome. */
  check(font: string): boolean {
    const face = this.match(font);
    return !face || face.status === 'loaded';
  }

  load(font: string): Promise<FontFaceLike[]> {
    if (this.throws) throw new Error('font set gone');
    return this.loadFace(font);
  }

  private async loadFace(font: string): Promise<FontFaceLike[]> {
    this.loads.push(font);
    const face = this.match(font);
    if (!face) return [];
    if (this.broken.has(face.family)) {
      face.status = 'error';
      throw new Error(`no file for ${face.family}`);
    }
    if (face.status !== 'loaded') {
      face.status = 'loaded';
      for (const l of this.listeners) l({ fontfaces: [face] });
    }
    return [face];
  }

  loaded(family: string): string[] {
    return this.faces.filter((f) => f.family === family && f.status === 'loaded').map((f) => `${f.weight} ${f.style}`).sort();
  }
}

const upright = (family: string, weight: string): Rule => ({ family, weight, style: 'normal' });
const italic = (family: string, weight: string): Rule => ({ family, weight, style: 'italic' });

// Google's style sheets for the faces of the recipe the issue was reported on.
const CHARIS = [upright('Charis SIL', '400'), italic('Charis SIL', '400'), upright('Charis SIL', '700'), italic('Charis SIL', '700')];
const CHIVO = [upright('Chivo', '100 900'), italic('Chivo', '100 900')];
const MONO = [upright('Fragment Mono', '400'), italic('Fragment Mono', '400')];

// Body with its emphasis, headings never set in italic, a caption face
// set upright only.
const CONFIG: PostextConfig = {
  bodyText: { fontFamily: 'Charis SIL' },
  headings: { fontFamily: 'Chivo' },
  captionStyle: { fontFamily: 'Fragment Mono' },
};
const TEXT = '# Night ferry\n\nThe *Chilco* sails **after** the ***last*** bus.';

let fonts: StyleSheetFontSet;
const globals = globalThis as { document?: unknown };
let previousDocument: unknown;

/** What `loadFont` does once per family, when its style sheet has landed:
 *  every weight, upright and italic. */
async function loadEveryFace(rules: Rule[]): Promise<void> {
  for (const r of rules) {
    const weight = r.weight.split(' ')[0];
    await fonts.load(`${r.style === 'italic' ? 'italic ' : ''}${weight} 16px "${r.family}"`);
  }
}

/** The style sheets of #659 in the order that left the preview without a
 *  build: each family loaded as its sheet landed, the body's sheet last. */
async function landInTheStuckOrder(): Promise<void> {
  fonts.land(CHIVO);
  await loadEveryFace(CHIVO);
  fonts.land(MONO);
  await loadEveryFace(MONO);
  fonts.land(CHARIS);
  await loadEveryFace(CHARIS);
}

beforeEach(() => {
  fonts = new StyleSheetFontSet();
  previousDocument = globals.document;
  globals.document = { fonts };
});

afterEach(() => {
  globals.document = previousDocument;
});

describe('the faces a build is held for', () => {
  it('the configuration sets fewer faces than the hold checks', () => {
    const set = configFontFaces(CONFIG, [TEXT]).map((f) => `${f.family} ${f.style}`);
    expect(set).toContain('Charis SIL italic');
    expect(set).not.toContain('Chivo italic');
    expect(set).not.toContain('Fragment Mono italic');
    expect(missingConfigFontSpecs(CONFIG, TEXT)).toEqual([]);
    fonts.land(CHIVO);
    expect(missingConfigFontSpecs(CONFIG, TEXT)).toEqual(expect.arrayContaining(['400 16px "Chivo"', 'italic 400 16px "Chivo"']));
  });

  it('a style sheet that lands after a family was loaded leaves its faces unloaded', async () => {
    await landInTheStuckOrder();
    expect(fonts.loaded('Chivo')).toEqual([]);
    expect(fonts.loaded('Fragment Mono')).toEqual([]);
    expect(fonts.loaded('Charis SIL')).toHaveLength(4);
    expect(missingConfigFontSpecs(CONFIG, TEXT)).toEqual([
      '400 16px "Chivo"', '700 16px "Chivo"', 'italic 400 16px "Chivo"', 'italic 700 16px "Chivo"',
      '400 16px "Fragment Mono"', '700 16px "Fragment Mono"', 'italic 400 16px "Fragment Mono"', 'italic 700 16px "Fragment Mono"',
    ]);
  });

  it('the wait loads every face the hold checks, the ones the configuration does not set included', async () => {
    await landInTheStuckOrder();
    await ensureConfigFontsLoaded(CONFIG, TEXT);
    expect(missingConfigFontSpecs(CONFIG, TEXT)).toEqual([]);
    expect(fonts.loaded('Chivo')).toEqual(['100 900 italic', '100 900 normal']);
    expect(fonts.loaded('Fragment Mono')).toEqual(['400 italic', '400 normal']);
  });
});

/** The BUILD effect of the canvas and Folio previews: hold while the gate
 *  has something pending, wait, look again. Resolves with the waits it
 *  took to reach the build. */
async function waitsUntilBuild(gate: ReturnType<typeof createFontGate>, limit = 8): Promise<number> {
  let waits = 0;
  while (gate.pending(CONFIG, TEXT).length > 0) {
    if (waits === limit) throw new Error(`no build after ${limit} waits: ${gate.pending(CONFIG, TEXT).join(', ')}`);
    await gate.wait(CONFIG, TEXT);
    waits++;
  }
  return waits;
}

describe('createFontGate', () => {
  it('asks for nothing when every face is loaded', async () => {
    fonts.land([...CHIVO, ...MONO, ...CHARIS]);
    await loadEveryFace([...CHIVO, ...MONO, ...CHARIS]);
    const gate = createFontGate();
    expect(gate.pending(CONFIG, TEXT)).toEqual([]);
    expect(await waitsUntilBuild(gate)).toBe(0);
  });

  it('reaches the build in one wait when the style sheets landed in the stuck order', async () => {
    await landInTheStuckOrder();
    const gate = createFontGate();
    expect(gate.pending(CONFIG, TEXT)).not.toEqual([]);
    expect(await waitsUntilBuild(gate)).toBe(1);
    expect(missingConfigFontSpecs(CONFIG, TEXT)).toEqual([]);
  });

  it('gives up on a face that does not load, and builds', async () => {
    fonts.land([...CHIVO, ...MONO, ...CHARIS]);
    fonts.broken.add('Fragment Mono');
    const gate = createFontGate();
    expect(await waitsUntilBuild(gate)).toBe(1);
    // Still missing, no longer waited for: the effect that looks again builds.
    expect(missingConfigFontSpecs(CONFIG, TEXT)).toEqual(expect.arrayContaining(['400 16px "Fragment Mono"']));
    expect(gate.pending(CONFIG, TEXT)).toEqual([]);
    const asked = fonts.loads.length;
    expect(await waitsUntilBuild(gate)).toBe(0);
    expect(fonts.loads).toHaveLength(asked);
  });

  it('waits again for a face that loaded and was made anew by a later style sheet', async () => {
    fonts.land([...CHIVO, ...CHARIS]);
    const gate = createFontGate();
    expect(await waitsUntilBuild(gate)).toBe(1);
    expect(gate.pending(CONFIG, TEXT)).toEqual([]);
    fonts.land(MONO);
    expect(gate.pending(CONFIG, TEXT)).toEqual(expect.arrayContaining(['italic 400 16px "Chivo"', '400 16px "Fragment Mono"']));
    expect(await waitsUntilBuild(gate)).toBe(1);
    expect(missingConfigFontSpecs(CONFIG, TEXT)).toEqual([]);
  });

  it('waits for a face it gave up on once the face has loaded and gone again', async () => {
    fonts.land([...CHIVO, ...MONO, ...CHARIS]);
    fonts.broken.add('Fragment Mono');
    const gate = createFontGate();
    expect(await waitsUntilBuild(gate)).toBe(1);
    // The file arrives after all (the browser asked again for the text on screen).
    fonts.broken.clear();
    await loadEveryFace(MONO);
    expect(gate.pending(CONFIG, TEXT)).toEqual([]);
    fonts.land([]);
    expect(gate.pending(CONFIG, TEXT)).toEqual(expect.arrayContaining(['400 16px "Fragment Mono"']));
    expect(await waitsUntilBuild(gate)).toBe(1);
  });

  it('ends the wait when the preparation throws, and builds', async () => {
    fonts.land([...CHIVO, ...MONO, ...CHARIS]);
    fonts.throws = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await waitsUntilBuild(createFontGate())).toBe(1);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('one gate per preview: what one gave up on, another still waits for once', async () => {
    fonts.land([...CHIVO, ...MONO, ...CHARIS]);
    fonts.broken.add('Chivo');
    expect(await waitsUntilBuild(createFontGate())).toBe(1);
    expect(await waitsUntilBuild(createFontGate())).toBe(1);
  });
});
