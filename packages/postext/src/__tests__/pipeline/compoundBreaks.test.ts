import { describe, it, expect, afterEach } from 'vitest';
import { buildDocument } from '../../pipeline';
import { computeChapterTitles } from '../../pipeline/placeholders';
import { renderToHtml } from '../../html-backend';
import { setHyphenationLocale } from '../../hyphenate';
import { createMeasurementCache, measureBlock, measureRichBlock } from '../../measure';
import { migrateConfig, migrateBundleConfig, pinLegacyHyphenBreaks, CONFIG_VERSION } from '../../bundle/configVersion';
import { resolveBodyTextConfig, stripBodyTextDefaults } from '../../defaults/bodyText';
import type { PostextConfig } from '../../types';
import type { VDTLine } from '../../vdt';

// Compound words, a hyphen between two letters ("after-dinner", "vencer-se").
// EF-186: a justified paragraph set with Knuth–Plass broke after the
// compound's hyphen only when the paragraph had an inline mark somewhere
// (the formatted path); without one it never did. `bodyText.breakAfterHyphens`
// (default true, pinned false for configurations stored before rules 8)
// gives both paths the same break. EF-169: `bodyText.hyphenation.compounds:
// false` keeps the dictionary out of a compound, which then breaks only
// after its own hyphen (TeX's rule). EF-186: `bodyText.repeatHyphen` starts
// the line after such a break with a hyphen too (Portuguese spelling).

// Deterministic stub: every character, the space included, is 7 px wide;
// bold 8 px. Italics measure as roman, so an italic word sends a paragraph
// to the formatted path without changing any width.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: [...s].length * (/bold|700/.test(this.font) ? 8 : 7) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

afterEach(() => setHyphenationLocale('en-us'));

const mm = (value: number) => ({ value, unit: 'mm' as const });

const EN = 'The after-dinner talk of the well-known self-taught co-authors of the peer-reviewed state-of-the-art follow-up study went on about the so-called mother-in-law problem and the never-ending back-and-forth of the twenty-first century, until the long-suffering host-country delegates walked out.';
/** The same text with one word in italics, far from any compound. */
const EN_MARKED = EN.replace('talk', '*talk*');
const PT = 'Emfim, a noite parecia vencer-se a si mesma; o viúvo, cansado, deixou-se ficar à janela e disse-lhe que a vida, como a guarda-chuva velha, havia de encontrar-se aberta outra vez pela manhã, quando o sol-posto já fosse lembrança.';

function config(width: number, bodyText: PostextConfig['bodyText'] = {}, locale?: string): PostextConfig {
  return {
    page: { width: mm(width), height: mm(800), dpi: 96, margins: { top: mm(5), bottom: mm(5), left: mm(5), right: mm(5) } },
    layout: { layoutType: 'single' },
    ...(locale ? { locale } : {}),
    bodyText: { firstLineIndent: mm(0), ...bodyText, hyphenation: { enabled: true, ragged: true, ...bodyText.hyphenation } },
    header: { elements: [] },
    footer: { elements: [] },
  };
}

function linesOf(markdown: string, width: number, bodyText: PostextConfig['bodyText'] = {}, locale?: string): VDTLine[] {
  return buildDocument({ markdown }, config(width, bodyText, locale)).blocks.flatMap((b) => b.lines);
}

const texts = (ls: readonly VDTLine[]) => ls.map((l) => l.text);

/** The whitespace-delimited word of `source` a line break at source offset
 *  `at` falls in. */
function wordAt(source: string, at: number): string {
  let a = at;
  let b = at;
  while (a > 0 && !/\s/.test(source[a - 1]!)) a--;
  while (b < source.length && !/\s/.test(source[b]!)) b++;
  return source.slice(a, b);
}

describe('a break after a compound’s hyphen on both paths (EF-186)', () => {
  it('defaults to true and strips as a default', () => {
    expect(resolveBodyTextConfig().breakAfterHyphens).toBe(true);
    expect(resolveBodyTextConfig({ breakAfterHyphens: false }).breakAfterHyphens).toBe(false);
    expect(stripBodyTextDefaults({ breakAfterHyphens: true })).toBeUndefined();
    expect(stripBodyTextDefaults({ breakAfterHyphens: false })).toEqual({ breakAfterHyphens: false });
  });

  for (const hyphenate of [true, false]) {
    it(`sets a paragraph with an italic word as the one without (justified, hyphenation ${hyphenate ? 'on' : 'off'})`, () => {
      let hard = 0;
      for (let width = 30; width <= 110; width += 2) {
        const bodyText = { hyphenation: { enabled: hyphenate } };
        const plain = linesOf(EN, width, bodyText);
        const marked = linesOf(EN_MARKED, width, bodyText);
        expect(texts(plain), `${width} mm`).toEqual(texts(marked));
        hard += plain.filter((l) => l.hardHyphen).length;
        for (const line of plain.filter((l) => l.hardHyphen)) expect(line.hyphenated).toBe(true);
      }
      // The plain paragraph did break after a compound’s hyphen.
      expect(hard).toBeGreaterThan(0);
    });
  }

  it('keeps the 1.4 breaks with breakAfterHyphens: false', () => {
    // Measured directly: the plain path sets a justified paragraph with
    // Knuth–Plass, the formatted path breaks after the hyphen either way.
    const FONT = '16px Test';
    const options = { textAlign: 'justify' as const, optimal: true, maxStretchRatio: 2, minShrinkRatio: 0.6, hyphenate: true };
    const spans = [{ text: EN, bold: false, italic: false }];
    let plainOld = 0;
    let plainNew = 0;
    let rich = 0;
    for (let width = 150; width <= 420; width += 6) {
      plainOld += measureBlock(EN, FONT, width, 20, options).lines.filter((l) => l.hardHyphen).length;
      plainNew += measureBlock(EN, FONT, width, 20, { ...options, breakAfterHyphens: true }).lines.filter((l) => l.hardHyphen).length;
      rich += measureRichBlock(spans, FONT, FONT, FONT, FONT, width, 20, options).lines.filter((l) => l.hardHyphen).length;
    }
    expect(plainOld).toBe(0);
    expect(plainNew).toBeGreaterThan(0);
    expect(rich).toBeGreaterThan(0);
  });

  it('never ends a justified line on a one-letter part of a compound', () => {
    // "e-" | "mail" and "X-" | "ray" read badly: the plain path breaks
    // after a compound's hyphen only with two letters on each side of it.
    const FONT = '16px Test';
    const options = { textAlign: 'justify' as const, optimal: true, maxStretchRatio: 2, minShrinkRatio: 0.6, hyphenate: false, breakAfterHyphens: true };
    const text = 'Send the e-mail with the X-ray plates to the ward, and the e-book, the T-shirt and the long-awaited follow-up notes as well, please.';
    let lone = 0;
    let other = 0;
    for (let width = 90; width <= 420; width += 3) {
      for (const line of measureBlock(text, FONT, width, 20, options).lines.filter((l) => l.hardHyphen)) {
        if (/(?:^|\s)\p{L}-$/u.test(line.text.trimEnd())) lone++;
        else other++;
      }
    }
    expect(lone).toBe(0);
    expect(other).toBeGreaterThan(0);
  });

  it('is pinned off for configurations stored before rules 8 whose text sets a compound', () => {
    expect(CONFIG_VERSION).toBe(11);
    const stored: PostextConfig = { bodyText: { fontFamily: 'Georgia' } };
    for (const version of [undefined, 3, 6, 7]) {
      expect(migrateConfig(stored, version, { content: EN }).bodyText?.breakAfterHyphens, `${version}`).toBe(false);
    }
    // Unknown content may set one.
    expect(migrateConfig(stored, 7).bodyText?.breakAfterHyphens).toBe(false);
    // Text with no compound, today's rules, a named value, or no Knuth–Plass: as it is.
    for (const content of ['No compound here.', 'From 1914-1918, COVID-19 and -5 °C.', ['Plain.', 'Also plain.']]) {
      expect(migrateConfig(stored, 7, { content }), JSON.stringify(content)).toBe(stored);
    }
    expect(migrateConfig(stored, CONFIG_VERSION, { content: EN })).toBe(stored);
    const named: PostextConfig = { bodyText: { breakAfterHyphens: true } };
    expect(pinLegacyHyphenBreaks(named)).toBe(named);
    expect(migrateConfig(named, undefined, { content: EN })).toBe(named);
    const firstFit: PostextConfig = { bodyText: { optimalLineBreaking: false } };
    expect(migrateConfig(firstFit, 7, { content: EN })).toBe(firstFit);
    // A bundle pins the `bodyText` the layers leave in force.
    const merged = migrateBundleConfig({}, [{ bodyText: { fontFamily: 'Georgia' } }], 7, { content: [EN] });
    expect(merged.bodyText).toEqual({ fontFamily: 'Georgia', breakAfterHyphens: false });
    // The pin lays the book out as 1.4 did.
    for (const width of [40, 56, 72]) {
      const pinned = migrateConfig(config(width), 7, { content: EN });
      const old = buildDocument({ markdown: EN }, pinned).blocks.flatMap((b) => b.lines);
      expect(texts(old)).toEqual(texts(linesOf(EN, width, { breakAfterHyphens: false })));
    }
  });
});

describe('a compound kept whole but for its hyphen (EF-169)', () => {
  const modes = [
    { name: 'justified', bodyText: {} },
    { name: 'justified, formatted', bodyText: {}, marked: true },
    { name: 'ragged', bodyText: { textAlign: 'left' as const } },
    { name: 'ragged, formatted', bodyText: { textAlign: 'left' as const }, marked: true },
    { name: 'justified line by line', bodyText: { optimalLineBreaking: false } },
    { name: 'justified line by line, formatted', bodyText: { optimalLineBreaking: false }, marked: true },
    { name: 'ragged line by line', bodyText: { textAlign: 'left' as const, optimalLineBreaking: false } },
    { name: 'ragged line by line, formatted', bodyText: { textAlign: 'left' as const, optimalLineBreaking: false }, marked: true },
  ];

  it('defaults to dividing a compound at its syllables too, and strips as a default', () => {
    expect(resolveBodyTextConfig().hyphenation.compounds).toBe(true);
    expect(resolveBodyTextConfig({ hyphenation: { compounds: false } }).hyphenation.compounds).toBe(false);
    expect(stripBodyTextDefaults({ hyphenation: { compounds: true } })).toBeUndefined();
    expect(stripBodyTextDefaults({ hyphenation: { compounds: false } })).toEqual({ hyphenation: { compounds: false } });
  });

  for (const mode of modes) {
    it(`breaks a compound only after its hyphen with compounds: false (${mode.name})`, () => {
      const md = mode.marked ? EN_MARKED : EN;
      let inside = 0;
      let insideDefault = 0;
      let syllables = 0;
      for (let width = 28; width <= 100; width += 2) {
        for (const compounds of [false, true]) {
          const lines = linesOf(md, width, { ...mode.bodyText, hyphenation: { enabled: true, ragged: true, compounds } });
          for (const [i, line] of lines.entries()) {
            if (i === lines.length - 1 || !line.hyphenated || line.hardHyphen) continue;
            // A syllable break: which word does it fall in?
            const word = wordAt(md, line.sourceEnd!);
            if (/\p{L}-\p{L}/u.test(word)) {
              if (compounds) insideDefault++;
              else inside++;
            } else if (!compounds) {
              syllables++;
            }
          }
        }
      }
      expect(inside, 'syllable breaks inside a compound with compounds: false').toBe(0);
      // The option made a difference, and other words still hyphenate.
      expect(insideDefault).toBeGreaterThan(0);
      expect(syllables).toBeGreaterThan(0);
    });
  }

  for (const mode of modes.filter((m) => !m.marked)) {
    it(`divides a part of a compound wider than the line at its syllables, as the formatted path does (${mode.name})`, () => {
      // "counterrevolutionaries-" is 23 characters, 161 px: wider than the
      // measure below 53 mm. Pretext cut it between two letters with no
      // hyphen when the dictionary left the compound whole.
      const md = 'A counterrevolutionaries-internationalization word stands here.';
      const marked = md.replace('word', '*word*');
      let overwide = 0;
      for (let width = 30; width <= 60; width += 1) {
        const bodyText = { ...mode.bodyText, hyphenation: { enabled: true, ragged: true, compounds: false } };
        const plain = linesOf(md, width, bodyText);
        const trimmed = (ls: readonly VDTLine[]) => texts(ls).map((t) => t.trimEnd());
        expect(trimmed(plain), `${width} mm`).toEqual(trimmed(linesOf(marked, width, bodyText)));
        for (const [i, line] of plain.entries()) {
          if (i === plain.length - 1) continue;
          // A line that ends inside a word ends on a hyphen.
          const next = md[line.sourceEnd!];
          if (next !== undefined && !/\s/.test(next)) expect(line.text, `${width} mm`).toMatch(/-$/);
        }
        if ((width - 10) * (96 / 25.4) < 161) overwide++;
      }
      expect(overwide).toBeGreaterThan(0);
    });
  }

  it('keeps the author’s own soft hyphens in a compound', () => {
    const md = 'An extra­ordinarily-long compound stands here among much shorter words to fill the lines.';
    let at = 0;
    for (let width = 20; width <= 60; width += 1) {
      const lines = linesOf(md, width, { hyphenation: { enabled: true, compounds: false } });
      if (lines.some((l) => l.text.endsWith('extra-'))) at++;
    }
    expect(at).toBeGreaterThan(0);
  });
});

describe('a hyphen repeated at the start of the next line (EF-186, Portuguese)', () => {
  const modes = [
    { name: 'justified', bodyText: {} },
    { name: 'justified, formatted', bodyText: {}, marked: true },
    { name: 'ragged', bodyText: { textAlign: 'left' as const } },
    { name: 'justified line by line', bodyText: { optimalLineBreaking: false } },
    { name: 'ragged line by line, formatted', bodyText: { textAlign: 'left' as const, optimalLineBreaking: false }, marked: true },
  ];

  it('defaults to false and strips as a default', () => {
    expect(resolveBodyTextConfig().repeatHyphen).toBe(false);
    expect(stripBodyTextDefaults({ repeatHyphen: false })).toBeUndefined();
    expect(stripBodyTextDefaults({ repeatHyphen: true })).toEqual({ repeatHyphen: true });
  });

  for (const mode of modes) {
    it(`opens the next line with a hyphen, measured and mapped (${mode.name})`, () => {
      const md = mode.marked ? PT.replace('noite', '*noite*') : PT;
      let repeated = 0;
      for (let width = 28; width <= 90; width += 1) {
        const bodyText = { ...mode.bodyText, repeatHyphen: true };
        const justified = !('textAlign' in mode.bodyText);
        const lines = linesOf(md, width, bodyText, 'pt');
        const maxWidth = (width - 10) * (96 / 25.4);
        for (const [i, line] of lines.entries()) {
          const afterHard = i > 0 && lines[i - 1]!.hardHyphen === true;
          expect(line.repeatedHyphen === true, `${width} mm, line ${i}: ${line.text}`).toBe(afterHard);
          if (afterHard) {
            repeated++;
            expect(line.text.startsWith('-'), `${width} mm: ${line.text}`).toBe(true);
            expect(line.segments![0]!.text.startsWith('-')).toBe(true);
          }
          // The hyphen is measured: the line still fits its measure, its
          // word spaces shrunk to the limit on a justified line.
          const segs = line.segments ?? [];
          const natural = segs.reduce((sum, g) => sum + g.width, 0);
          const shrink = justified ? segs.filter((g) => g.kind === 'space').length * 7 * 0.4 : 0;
          expect(natural - shrink, `${width} mm: ${line.text}`).toBeLessThanOrEqual(maxWidth + 0.5);
          // The source holds what the line prints, less the repeated hyphen
          // and a hyphen a break added.
          const src = md.slice(line.sourceStart, line.sourceEnd).replace(/\*/g, '');
          let printed = line.repeatedHyphen ? line.text.slice(1) : line.text;
          if (line.hyphenated && !line.hardHyphen) printed = printed.replace(/-$/, '');
          expect(src, `${width} mm, line ${i}`).toBe(printed.trimEnd());
        }
      }
      expect(repeated).toBeGreaterThan(0);
    });
  }

  it('repeats nothing by default', () => {
    for (let width = 28; width <= 90; width += 2) {
      for (const line of linesOf(PT, width, {}, 'pt')) {
        expect(line.repeatedHyphen).toBeUndefined();
        expect(line.text.startsWith('-')).toBe(false);
      }
    }
  });

  it('does not repeat a hyphen in a web address', () => {
    const md = 'Read it at https://example.org/some-long-path-name-with-many-hyphens-in-it and also here-and-there.';
    for (let width = 20; width <= 60; width += 1) {
      const lines = linesOf(md, width, { repeatHyphen: true });
      for (const line of lines) {
        // Only the compound after the address repeats its hyphen.
        if (line.repeatedHyphen) expect(line.sourceStart!, `${width} mm: ${line.text}`).toBeGreaterThan(md.indexOf(' and also'));
      }
    }
  });

  it('reads a running head without the repeated hyphen', () => {
    const title = 'Quando a noite parecia vencer-se a si mesma e o guarda-chuva abrir-se';
    let seen = 0;
    for (let width = 24; width <= 80; width += 1) {
      const doc = buildDocument({ markdown: `# ${title}\n\nTexto.` }, config(width, { repeatHyphen: true }, 'pt'));
      const heading = doc.blocks.filter((b) => b.type === 'heading');
      if (heading[0]!.lines.some((l) => l.repeatedHyphen)) seen++;
      expect(computeChapterTitles(heading, 1)[0], `${width} mm`).toBe(title);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('paints the repeated hyphen in HTML', () => {
    let painted = 0;
    for (let width = 28; width <= 60; width += 4) {
      const doc = buildDocument({ markdown: PT }, config(width, { repeatHyphen: true }, 'pt'));
      const html = renderToHtml(doc);
      for (const line of doc.blocks.flatMap((b) => b.lines).filter((l) => l.repeatedHyphen)) {
        const word = line.segments![0]!.text;
        expect(html, `${width} mm: ${word}`).toContain(word);
        painted++;
      }
    }
    expect(painted).toBeGreaterThan(0);
  });

  it('keeps a link on the words after the repeated hyphen', () => {
    const md = 'Veja o [guarda-chuva](https://example.org/g) e o [homem-aranha](https://example.org/h) aqui, depois disse-lhe adeus.';
    let linked = 0;
    for (let width = 20; width <= 60; width += 1) {
      const lines = linesOf(md, width, { repeatHyphen: true }, 'pt');
      for (const line of lines) {
        if (!line.repeatedHyphen) continue;
        const first = line.segments![0]!;
        if (/^-(chuva|aranha)/.test(first.text)) {
          linked++;
          expect(first.href).toMatch(/^https:\/\/example\.org\/[gh]$/);
        }
      }
    }
    expect(linked).toBeGreaterThan(0);
  });
});

describe('the measurement cache keeps the compound options apart', () => {
  it('a cached build breaks as an uncached one, whatever the options', () => {
    const cache = createMeasurementCache();
    const variants: PostextConfig['bodyText'][] = [
      {},
      { breakAfterHyphens: false },
      { hyphenation: { enabled: true, compounds: false } },
      { repeatHyphen: true },
      { breakAfterHyphens: false, repeatHyphen: true },
    ];
    for (const width of [36, 52, 70]) {
      for (const bodyText of [...variants, ...variants]) {
        const uncached = buildDocument({ markdown: `${EN}\n\n${PT}` }, config(width, bodyText)).blocks.flatMap((b) => b.lines);
        const cached = buildDocument({ markdown: `${EN}\n\n${PT}` }, config(width, bodyText), cache).blocks.flatMap((b) => b.lines);
        expect(texts(cached), `${width} mm ${JSON.stringify(bodyText)}`).toEqual(texts(uncached));
      }
    }
  });
});
