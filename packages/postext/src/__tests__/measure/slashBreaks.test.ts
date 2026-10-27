import { describe, it, expect } from 'vitest';
import { emergencySplit, measureRichSnippet, type RichToken } from '../../measure/rich.js';
import { getSlashBreaks, setSlashBreaks, slashBreakIndices, withoutZeroWidthSpaces } from '../../measure/breakRules.js';
import { initHyphenator } from '../../measure/font.js';
import { buildDocument } from '../../pipeline/index.js';
import { CONFIG_VERSION, migrateBundleConfig, migrateConfig, pinLegacySlashBreaks } from '../../bundle/configVersion.js';
import { resolveBodyTextConfig, stripBodyTextDefaults } from '../../defaults/text/bodyText.js';
import type { PostextConfig } from '../../types.js';

// #1164: the rich breaker ends a line after a slash between two words and
// at a zero-width space the author typed, adding nothing; a word wider than
// its whole line is divided after a slash before it is cut between letters.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: [...s.replace(/​/g, '')].length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const FONT = '10px serif';
const GUIDELINE = 'ACC/AHA/AAPA/ABC/ACPM/AGS/APhA/ASH/ASPC/NMA/PCNA';

const texts = (text: string, width: number, options: { optimal?: boolean; hyphenate?: boolean } = {}) =>
  measureRichSnippet([{ text, bold: false, italic: false }], FONT, FONT, FONT, FONT, width, 12, {
    textAlign: options.optimal ? 'justify' : 'left',
    hyphenate: options.hyphenate ?? true,
    ...(options.optimal ? { optimal: true, maxStretchRatio: 3, minShrinkRatio: 0.6 } : {}),
  }).lines;

describe('slashBreakIndices', () => {
  const pieces = (text: string) => slashBreakIndices(text).map((i) => text.slice(0, i));

  it('breaks after a slash between two words', () => {
    expect(pieces('entrada/salida')).toEqual(['entrada/']);
    expect(pieces('ACC/AHA/AAPA')).toEqual(['ACC/', 'ACC/AHA/']);
    expect(pieces('COVID-19/SARS')).toEqual([]);
    expect(pieces('COVID/SARS')).toEqual(['COVID/']);
    expect(pieces('2020/SARS')).toEqual(['2020/']);
  });

  it('keeps units, short pairs, fractions and dates whole', () => {
    for (const word of ['1/2', '10/03/2026', '2020/2021', 'km/h', 'm/s', 'kg/m³', 'km/min', 'mg/dL', 'and/or', 'y/o', 'c/Mayor', 'a/b', 'and//orr'])
      expect(pieces(word), word).toEqual([]);
  });
});

describe('withoutZeroWidthSpaces', () => {
  it('takes the character out and keeps where it stood', () => {
    expect(withoutZeroWidthSpaces('foo​bar')).toEqual({ text: 'foobar', breaks: [3] });
    expect(withoutZeroWidthSpaces('a​​b​c')).toEqual({ text: 'abc', breaks: [1, 2] });
    expect(withoutZeroWidthSpaces('​foo​')).toEqual({ text: 'foo', breaks: [] });
    expect(withoutZeroWidthSpaces('​')).toEqual({ text: '​', breaks: [] });
    expect(withoutZeroWidthSpaces('plain')).toEqual({ text: 'plain', breaks: [] });
  });
});

describe('#1164: the rich breaker', () => {
  it('ends a line after a slash between two words, with no hyphen', () => {
    for (const optimal of [false, true]) {
      // "entrada/" is 8 characters (56 px): the line takes it and the rest
      // goes down.
      const ls = texts('entrada/salida', 70, { optimal, hyphenate: false });
      expect(ls.map((l) => l.text)).toEqual(['entrada/', 'salida']);
    }
  });

  it('breaks the guideline title after its slashes, never between letters', () => {
    initHyphenator('en');
    for (const optimal of [false, true]) {
      const ls = texts(GUIDELINE, 140, { optimal });
      expect(ls.length).toBeGreaterThan(1);
      expect(ls.map((l) => l.text).join('')).toBe(GUIDELINE);
      for (const l of ls.slice(0, -1)) expect(l.text.endsWith('/')).toBe(true);
      expect(ls.every((l) => l.wordDivided === undefined)).toBe(true);
    }
  });

  it('keeps a unit whole and sends it down', () => {
    const ls = texts('density 10³ kg/m³', 98, { hyphenate: false });
    expect(ls.map((l) => l.text.trim())).toEqual(['density 10³', 'kg/m³']);
  });

  it('breaks at a zero-width space, adds nothing and drops the character', () => {
    for (const optimal of [false, true]) {
      const ls = texts('Donau​dampfschiff', 84, { optimal, hyphenate: false });
      expect(ls.map((l) => l.text)).toEqual(['Donau', 'dampfschiff']);
      expect(ls.some((l) => (l.segments ?? []).some((s) => s.text.includes('​')))).toBe(false);
    }
  });
});

describe('#1164: emergencySplit', () => {
  const token = (text: string): RichToken => ({ text, bold: false, italic: false, kind: 'text', width: text.length * 7 });

  it('prefers the point after a slash to a cut between letters', () => {
    // A token with no break point of its own: the slash is still found.
    const split = emergencySplit(token('kilometres/hour'), FONT, 0, 84)!;
    expect(split.head.text).toBe('kilometres/');
    expect(split.tail.text).toBe('hour');
    expect(split.divided).toBeUndefined();
  });

  it('cuts after a slash in a date rather than inside a number', () => {
    const split = emergencySplit(token('10/03/2026'), FONT, 0, 49)!;
    expect(split.head.text).toBe('10/03/');
    expect(split.divided).toBeUndefined();
  });

  it('never inside the double slash of an address', () => {
    const split = emergencySplit(token('ab//cdefghij'), FONT, 0, 28, false)!;
    expect(split.head.text).not.toBe('ab//');
    expect(split.head.text).not.toBe('ab/');
  });
});

describe('#1164: bodyText.breakAfterSlashes', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  // A 40 px measure: five characters of the stub's 7 px.
  const narrow = (bodyText: PostextConfig['bodyText'] = {}): PostextConfig => ({
    page: { dpi: 72, width: pt(60), margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
    layout: { layoutType: 'single' },
    bodyText: { firstLineIndent: pt(0), ...bodyText },
  });
  const characterCuts = (config: PostextConfig) =>
    (buildDocument({ markdown: `*See* ${GUIDELINE}` }, config).contentWarnings ?? []).filter((w) => w.kind === 'wordDividedByCharacter');

  it('is on by default and resolved only when off', () => {
    expect(resolveBodyTextConfig(undefined).breakAfterSlashes).toBeUndefined();
    expect(resolveBodyTextConfig({ breakAfterSlashes: true }).breakAfterSlashes).toBeUndefined();
    expect(resolveBodyTextConfig({ breakAfterSlashes: false }).breakAfterSlashes).toBe(false);
    expect(stripBodyTextDefaults({ breakAfterSlashes: true })).toBeUndefined();
    expect(stripBodyTextDefaults({ breakAfterSlashes: false })).toEqual({ breakAfterSlashes: false });
  });

  it('divides the guideline title after its slashes, and between letters when off', () => {
    expect(characterCuts(narrow())).toEqual([]);
    expect(characterCuts(narrow({ breakAfterSlashes: false })).length).toBeGreaterThan(0);
  });

  it('is set for a build and put back after it', () => {
    expect(getSlashBreaks()).toBe(true);
    buildDocument({ markdown: 'Words.' }, narrow({ breakAfterSlashes: false }));
    expect(getSlashBreaks()).toBe(true);
    setSlashBreaks(false);
    expect(slashBreakIndices('entrada/salida')).toEqual([]);
    setSlashBreaks(true);
  });
});

describe('pinLegacySlashBreaks (#1164)', () => {
  it('writes the old breaks unless the configuration names the setting', () => {
    expect(pinLegacySlashBreaks<PostextConfig>({}).bodyText).toEqual({ breakAfterSlashes: false });
    const own: PostextConfig = { bodyText: { fontFamily: 'Georgia' } };
    expect(pinLegacySlashBreaks(own).bodyText).toEqual({ fontFamily: 'Georgia', breakAfterSlashes: false });
    expect(own.bodyText).toEqual({ fontFamily: 'Georgia' });
    for (const named of [true, false]) {
      const config: PostextConfig = { bodyText: { breakAfterSlashes: named } };
      expect(pinLegacySlashBreaks(config)).toBe(config);
    }
  });

  it('pins every version before 19, whatever the chapters hold, and none from 19', () => {
    expect(CONFIG_VERSION).toBe(21);
    for (const v of [undefined, 1, 8, 12, 15, 16, 17, 18]) {
      expect(migrateConfig<PostextConfig>({}, v, { content: 'Words.' }).bodyText?.breakAfterSlashes, String(v)).toBe(false);
    }
    for (const v of [19, CONFIG_VERSION, 99]) {
      const config: PostextConfig = {};
      expect(migrateConfig(config, v, { content: 'entrada/salida' }), String(v)).toBe(config);
    }
  });

  it('pins the bodyText in force in a bundle', () => {
    const layers: PostextConfig[] = [{ bodyText: { fontFamily: 'Georgia' } }, { locale: 'es' }];
    expect(migrateBundleConfig({}, layers, 18).bodyText).toEqual({ fontFamily: 'Georgia', breakAfterSlashes: false });
    expect(migrateBundleConfig({}, layers, 19).bodyText).toEqual({ fontFamily: 'Georgia' });
  });
});
