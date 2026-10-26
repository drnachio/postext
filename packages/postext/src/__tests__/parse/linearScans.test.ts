import { describe, expect, it } from 'vitest';
import { findPxSize, splitAtFontSize, withPxSize, fontStringFamily } from '../../measure/fontString.js';
import { quoteFamily } from '../../measure/font.js';
import { directiveAttrRanges, replaceTitleBreaks } from '../../parse/inlineFormatting.js';
import { texLabelMatches } from '../../parse/equationLabels.js';
import { extractFrontmatter } from '../../parse/frontmatter.js';
import { parseComicFence } from '../../comics/index.js';

// The scans that replace regular expressions CodeQL found slow on long
// runs (#808) read what the expressions read: checked against them on
// random strings, and timed on the runs that made them slow.

let seed = 808;
const random = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const text = (alphabet: readonly string[], max: number): string => {
  let s = '';
  for (let n = Math.floor(random() * max); n > 0; n--) s += alphabet[Math.floor(random() * alphabet.length)];
  return s;
};
const ROUNDS = 4000;

describe('font size scans', () => {
  const alphabet = ['0', '1', '9', '.', 'p', 'x', 'px', ' ', '\t', '\n', '/', 'a', '"', ',', '12px', '.5px', ' ', 'italic ', 'Serif'];

  it('find the size the expressions find', () => {
    for (let r = 0; r < ROUNDS; r++) {
      const f = text(alphabet, 18);
      const size = /(\d*\.?\d+)px/.exec(f);
      const found = findPxSize(f);
      expect(found && [found.start, found.end, found.value], JSON.stringify(f)).toEqual(size && [size.index, size.index + size[0].length, size[1]]);
      const leading = /(\d+(?:\.\d+)?)px/.exec(f);
      const foundLeading = findPxSize(f, 0, true);
      expect(foundLeading && [foundLeading.start, foundLeading.value], JSON.stringify(f)).toEqual(leading && [leading.index, leading[1]]);
      expect(withPxSize(f, (v) => parseFloat(v) * 0.5), JSON.stringify(f)).toBe(size ? f.replace(/(\d*\.?\d+)px/, `${parseFloat(size[1]!) * 0.5}px`) : f);
    }
  });

  it('split a shorthand where the expressions split it', () => {
    for (let r = 0; r < ROUNDS; r++) {
      const f = text(alphabet, 18);
      const plain = /^(.*?)(\d*\.?\d+)px\s+(.+)$/.exec(f);
      const split = splitAtFontSize(f);
      expect(split && [split.prefix, split.family], JSON.stringify(f)).toEqual(plain && [plain[1], plain[3]]);
      const spaced = /^(.*?)(\d*\.?\d+)px(\s*\/\s*[^\s]+)?\s+(.+)$/.exec(f);
      const splitSpaced = splitAtFontSize(f, true);
      expect(splitSpaced && [splitSpaced.prefix, splitSpaced.family], JSON.stringify(f)).toEqual(spaced && [spaced[1], spaced[4]]);
    }
  });

  it('read a long run of digits or spaces at once', () => {
    const digits = '1'.repeat(200_000);
    const spaces = `12px${' '.repeat(200_000)}\n`;
    const t = performance.now();
    expect(findPxSize(digits)).toBeNull();
    expect(splitAtFontSize(`${digits} x`)).toBeNull();
    expect(splitAtFontSize(spaces, true)).toBeNull();
    expect(fontStringFamily(`${'1 '.repeat(50_000)}`)).toBeNull();
    expect(performance.now() - t).toBeLessThan(1000);
  });

  it('escapes a backslash in a quoted family, and reads it back', () => {
    expect(quoteFamily('Optima 105')).toBe('"Optima 105"');
    expect(quoteFamily('A\\B "C"')).toBe('"A\\\\B \\"C\\""');
    expect(fontStringFamily(`12px ${quoteFamily('A\\B "C"')}`)).toBe('A\\B "C"');
  });
});

describe('inline directive scans', () => {
  it('replace title breaks as the expression does', () => {
    const alphabet = ['\\', '\\\\', ' ', '\t', 'a', '\n'];
    for (let r = 0; r < ROUNDS; r++) {
      const s = text(alphabet, 16);
      expect(replaceTitleBreaks(s, '|'), JSON.stringify(s)).toBe(s.replace(/[ \t]*\\\\[ \t]*/g, '|'));
    }
  });

  it('find the attributes the expression finds', () => {
    const alphabet = ['\\', ' ', '\n', 'a', ':ref{', ':swatch{', ':chip[', ':index[', ':index{', '}', '{', ']', '[', 'id=x', ':'];
    for (let r = 0; r < ROUNDS; r++) {
      const s = text(alphabet, 20);
      const re = /:(?:ref|swatch|index)\{([^}\n]*)\}|:(?:chip|index)\[(?:\\.|[^\]\\\n])*\]\{([^}\n]*)\}/g;
      const expected: Array<[string, number]> = [];
      for (let m = re.exec(s); m; m = re.exec(s)) {
        const blob = m[1] ?? m[2]!;
        expected.push([blob, m.index + m[0].length - 1 - blob.length]);
      }
      const found = directiveAttrRanges(s, ['ref', 'swatch', 'index'], ['chip', 'index'], true);
      expect(found.map(([a, b]) => [s.slice(a, b), a]), JSON.stringify(s)).toEqual(expected);
    }
  });

  it('read TeX labels as the expression does', () => {
    const alphabet = ['\\label{', '{', '}', ' ', 'eq:x', '\t', '\\'];
    for (let r = 0; r < ROUNDS; r++) {
      const s = text(alphabet, 12);
      const re = /\\label\{\s*([^{}]*?)\s*\}/g;
      const expected: Array<[string, number, number]> = [];
      for (let m = re.exec(s); m; m = re.exec(s)) expected.push([m[1]!, m.index, m.index + m[0].length]);
      expect(texLabelMatches(s).map((l) => [l.label, l.start, l.end]), JSON.stringify(s)).toEqual(expected);
    }
  });

  it('read long unclosed runs at once', () => {
    const t = performance.now();
    expect(replaceTitleBreaks('\t'.repeat(200_000), ' ')).toHaveLength(200_000);
    expect(directiveAttrRanges(':ref{'.repeat(40_000), ['ref'], ['chip'])).toEqual([]);
    expect(directiveAttrRanges(':chip['.repeat(40_000), ['ref'], ['chip'])).toEqual([]);
    expect(texLabelMatches(`\\label{${' '.repeat(200_000)}`)).toEqual([]);
    expect(performance.now() - t).toBeLessThan(1000);
  });
});

describe('directive lines', () => {
  // `::panel\s*(?:{…})?\s*$` let both runs share the spaces (#1220): the
  // leading run now belongs to the attribute group.
  const alphabet = ['::panel', ' ', '\t', '{', '}', 'a', '=', '"', 'x'];

  it('read the lines the old expression read', () => {
    const before = /^::panel\s*(?:\{([^}]*)\})?\s*$/;
    const after = /^::panel(?:\s*\{([^}]*)\})?\s*$/;
    for (let r = 0; r < ROUNDS; r++) {
      const s = `::panel${text(alphabet, 12)}`;
      expect(after.exec(s)?.slice(), JSON.stringify(s)).toEqual(before.exec(s)?.slice());
    }
  });

  it('read a panel line with a long space run at once', () => {
    const t = performance.now();
    const source = parseComicFence(`:::page\n::panel${'\t'.repeat(100_000)}x\n::panel  {shape=round}\t\n:::`, 0)!.source;
    expect(source.panels).toHaveLength(1);
    expect(source.panels[0]!.attrs).toEqual({ shape: 'round' });
    expect(performance.now() - t).toBeLessThan(1000);
  });
});

describe('front matter', () => {
  it('never runs a JavaScript block', () => {
    const g = globalThis as { __postextFrontmatterRan?: boolean };
    const fm = extractFrontmatter('---js\n{ title: (globalThis.__postextFrontmatterRan = true, "x") }\n---\nBody.');
    expect(g.__postextFrontmatterRan).toBeUndefined();
    expect(fm.metadata).toEqual({});
    expect(fm.error).toBeDefined();
    expect(fm.content).toBe('Body.');
  });
});
