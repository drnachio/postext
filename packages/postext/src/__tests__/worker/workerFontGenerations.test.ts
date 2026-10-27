import { describe, expect, it } from 'vitest';
import { createFontGenerations, installFontGenerations } from '../../worker/fontGenerations.js';

// #760: a worker's canvas resolves a font the first time a shorthand is set
// and never looks at the font set again for it (Chrome 131 and 154). A face
// registered after a build (another weight, an italic, another slice of a
// cut, a file uploaded again under the same name) was not measured with:
// the build after `registerFonts` kept the widths of the fallback or of
// the old file, and reported no fallback. Another family list makes the
// canvas resolve again, and the family named twice is the same font.

describe('the generations of a family in a layout worker (#760)', () => {
  it('leaves a shorthand as the engine wrote it while no face of its family arrives late', () => {
    const generations = createFontGenerations();
    expect(generations.resolve('400 58.33px Geist')).toBe('400 58.33px Geist');
    expect(generations.resolve('italic 700 12.5px "Optima 105"')).toBe('italic 700 12.5px "Optima 105"');
    // The same string, not a copy the canvas would parse as another one.
    expect(generations.resolve('400 58.33px Geist')).toBe('400 58.33px Geist');
  });

  it('names the family once more after a face of it arrives for a shorthand already set', () => {
    const generations = createFontGenerations();
    generations.resolve('400 20px Geist');
    expect(generations.changed(['Geist'])).toEqual(['geist']);
    // Every weight, slant and size of the family: the canvas held each of them.
    expect(generations.resolve('400 20px Geist')).toBe('400 20px Geist, Geist');
    expect(generations.resolve('italic 700 31px Geist')).toBe('italic 700 31px Geist, Geist');
    // And again for the face after that: the doubled name is held too.
    expect(generations.changed(['geist'])).toEqual(['geist']);
    expect(generations.resolve('400 20px Geist')).toBe('400 20px Geist, Geist, Geist');
  });

  it('keeps the shorthands of a family whose faces came before it was measured with', () => {
    const generations = createFontGenerations();
    // A book that gets its faces before its first build: nothing to resolve again.
    expect(generations.changed(['Lora', 'Geist'])).toEqual([]);
    expect(generations.resolve('400 20px Lora')).toBe('400 20px Lora');
    // Its stand-ins and the faces of another family, before any build, too.
    expect(generations.changed(['Fraunces'])).toEqual([]);
    expect(generations.resolve('400 20px Lora')).toBe('400 20px Lora');
    expect(generations.resolve('900 40px Fraunces')).toBe('900 40px Fraunces');
  });

  it('moves the family that changed and no other', () => {
    const generations = createFontGenerations();
    generations.resolve('400 20px Lora');
    generations.resolve('400 20px Geist');
    expect(generations.changed(['Geist', 'Geist', 'Bangers'])).toEqual(['geist']);
    expect(generations.resolve('400 20px Lora')).toBe('400 20px Lora');
    expect(generations.resolve('400 20px Geist')).toBe('400 20px Geist, Geist');
    expect(generations.resolve('400 20px Bangers')).toBe('400 20px Bangers');
  });

  it('reads a family whatever its quotes and its case, and writes it as the shorthand does', () => {
    const generations = createFontGenerations();
    generations.resolve('12px "Source Serif 4"');
    expect(generations.changed(['source serif 4'])).toEqual(['source serif 4']);
    expect(generations.resolve('12px "Source Serif 4"')).toBe('12px "Source Serif 4", "Source Serif 4"');
    expect(generations.resolve("12px 'Source Serif 4'")).toBe("12px 'Source Serif 4', 'Source Serif 4'");
    // A name with a comma in its quotes is one family.
    generations.resolve('12px "Brand, Text"');
    generations.changed(['Brand, Text']);
    expect(generations.resolve('12px "Brand, Text"')).toBe('12px "Brand, Text", "Brand, Text"');
  });

  it('resolves the probe of a missing family again: each family of a list by its own generation', () => {
    const generations = createFontGenerations();
    // What the worker measures to tell a family that is there from one that is not.
    expect(generations.resolve('72px Geist, serif')).toBe('72px Geist, serif');
    generations.changed(['Geist']);
    expect(generations.resolve('72px Geist, serif')).toBe('72px Geist, Geist, serif');
    expect(generations.resolve('72px serif')).toBe('72px serif');
  });

  it('keeps what stands before the families: slant, weight, size and line height', () => {
    const generations = createFontGenerations();
    generations.resolve('italic 600 13.5px/18px Geist');
    generations.changed(['Geist']);
    expect(generations.resolve('italic 600 13.5px/18px Geist')).toBe('italic 600 13.5px/18px Geist, Geist');
  });

  it('leaves a value it cannot read as it is', () => {
    const generations = createFontGenerations();
    for (const font of ['', 'caption', '1.2em Geist', 'Geist']) {
      generations.resolve(font);
      generations.changed(['Geist']);
      expect(generations.resolve(font)).toBe(font);
    }
  });
});

describe('the generations in front of a canvas (#760)', () => {
  /** A context class with `font` as an accessor of its prototype, as the
   *  browsers define it. */
  function contextClass() {
    const sets: string[] = [];
    class Context {
      private value = '10px sans-serif';
      get font(): string {
        return this.value;
      }
      set font(v: string) {
        sets.push(v);
        this.value = v;
      }
    }
    return { Context, sets };
  }

  it('sets every font of the class through them, on contexts made before and after', () => {
    const { Context, sets } = contextClass();
    const before = new Context();
    const generations = createFontGenerations();
    expect(installFontGenerations(generations, [Context])).toBe(1);
    const after = new Context();
    before.font = '400 20px Geist';
    expect(sets).toEqual(['400 20px Geist']);
    // What `registerFonts` does when faces of a family land.
    generations.changed(['Geist']);
    before.font = '400 20px Geist';
    after.font = 'italic 400 20px Geist';
    expect(sets.slice(1)).toEqual(['400 20px Geist, Geist', 'italic 400 20px Geist, Geist']);
    expect(after.font).toBe('italic 400 20px Geist, Geist');
  });

  it('covers nothing where there is no such class, or its font is not an accessor it can redefine', () => {
    const generations = createFontGenerations();
    expect(installFontGenerations(generations, [undefined])).toBe(0);
    expect(installFontGenerations(generations, [class { font = '' }])).toBe(0);
    class Frozen {
      get font(): string { return ''; }
      set font(_v: string) {}
    }
    Object.defineProperty(Frozen.prototype, 'font', { ...Object.getOwnPropertyDescriptor(Frozen.prototype, 'font'), configurable: false });
    expect(installFontGenerations(generations, [Frozen])).toBe(0);
    // Node has no OffscreenCanvasRenderingContext2D: the default covers nothing and throws nothing.
    expect(installFontGenerations(generations)).toBe(0);
  });
});
