import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import fontkit from '@pdf-lib/fontkit';
import { freezeFontFeatures } from 'postext';
import { resolveFonts, wantedVariants } from '../fonts';
import type { Book } from '../input';
import type { Reporter } from '../log';

// A style's figures (#1237) in Node: Skia sets no OpenType features, so a
// feature family (`Probe Serif@onum+pnum`) is registered as a copy of the
// base family's file whose `cmap` maps the digits to the glyphs the
// features give them (`freezeFontFeatures`). Source Serif 4 sets tabular
// lining figures by default (539 units); old-style proportional ones have
// widths of their own.

const SOURCE_SERIF = new Uint8Array(readFileSync(new URL('../../../../apps/web/public/presets/openstax-fisica/fonts/SourceSerif4-Regular.ttf', import.meta.url)));

interface Face {
  unitsPerEm: number;
  glyphForCodePoint(cp: number): { id: number };
  layout(text: string, features?: unknown): { glyphs: { id: number }[]; positions: { xAdvance: number }[] };
}
const open = (bytes: Uint8Array) => fontkit.create(bytes) as unknown as Face;
const ids = (face: Face, text: string, features?: string[]) => face.layout(text, features).glyphs.map((g) => g.id);

describe('freezeFontFeatures (#1237)', () => {
  it('maps the characters to the glyphs the features give them, and nothing else', () => {
    const frozen = freezeFontFeatures(SOURCE_SERIF, ['onum', 'pnum'])!;
    expect(frozen).not.toBe(SOURCE_SERIF);
    const before = open(SOURCE_SERIF);
    const after = open(frozen);
    expect(ids(after, '0123456789')).toEqual(ids(before, '0123456789', ['onum', 'pnum']));
    expect(ids(after, '0123456789')).not.toEqual(ids(before, '0123456789'));
    // Letters, and characters past the BMP's start, keep their glyphs.
    for (const ch of 'AZaz.,;ÁñŒ€') expect(after.glyphForCodePoint(ch.codePointAt(0)!).id).toBe(before.glyphForCodePoint(ch.codePointAt(0)!).id);
    // A feature that substitutes nothing hands the file back.
    expect(freezeFontFeatures(SOURCE_SERIF, ['tnum'])).toBe(SOURCE_SERIF);
    expect(freezeFontFeatures(new Uint8Array([1, 2, 3]), ['onum'])).toBeNull();
  });

  it('a book whose body sets old-style proportional figures is measured with them', async () => {
    const family = 'Probe Serif';
    const book = {
      kind: 'folder', name: 'figures', id: 'figures', locale: 'en', resources: [], files: new Map(), watchPaths: [],
      config: { bodyText: { fontFamily: family, figureStyle: 'oldstyle-proportional' }, headings: { fontFamily: family } },
      chapters: [{ title: 'One', markdown: 'In 1111.' }],
      fonts: [{ family, weight: 400, style: 'normal', file: 'probe.ttf', bytes: SOURCE_SERIF }],
    } as unknown as Book;
    // The base family is looked for; the feature family is no family to fetch.
    const wanted = [...wantedVariants(book).keys()];
    expect(wanted).toContain(family);
    expect(wanted.filter((f) => f.includes('@'))).toEqual([]);
    const silent = { info: () => {}, warn: () => {}, time: async <T>(_name: string, run: () => T | Promise<T>) => run() } as unknown as Reporter;
    const fonts = await resolveFonts(book, { fontDirs: [], offline: true }, silent);
    expect(fonts.familyFaces(`${family}@onum+pnum`)).toEqual([]);
    const width = (name: string) => {
      const ctx = createCanvas(10, 10).getContext('2d');
      ctx.font = `1000px "${name}"`;
      return ctx.measureText('1111').width;
    };
    const face = open(SOURCE_SERIF);
    const advance = face.layout('1111', ['onum', 'pnum']).positions.reduce((sum, p) => sum + p.xAdvance, 0) * 1000 / face.unitsPerEm;
    expect(width(family)).toBeCloseTo(4 * 539, 0);
    expect(width(`${family}@onum+pnum`)).toBeCloseTo(advance, 0);
    expect(advance).toBeLessThan(4 * 539);
  });
});
