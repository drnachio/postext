import { describe, it, expect, afterEach } from 'vitest';
import { measureRichBlock } from '../measure/rich';
import { measureBlock } from '../measure/plain';
import { setHyphenationLocale } from '../hyphenate';
import { buildDocument } from '../pipeline';
import { resolveBodyTextConfig, stripBodyTextDefaults, hyphenationEqual, DEFAULT_HYPHENATION_CONFIG } from '../defaults/bodyText';
import type { InlineSpan } from '../parse';
import type { PostextConfig, VDTDocument } from '../index';

// Deterministic text measurement stub (no DOM in the node test env): every
// character, the space included, is 7 px wide.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const FONT = '16px Test';
const span = (text: string): InlineSpan[] => [{ text, bold: false, italic: false }];
const texts = (lines: { text: string }[]): string[] => lines.map((l) => l.text);
const pt = (value: number) => ({ value, unit: 'pt' as const });
const em = (value: number) => ({ value, unit: 'em' as const });

afterEach(() => setHyphenationLocale('en-us'));

describe('hyphenation zone (measurement)', () => {
  // 20 characters per line (140 px). "de la " takes 6; "extraordinariamente"
  // (19, es: ex-tra-or-di-na-ria-men-te) does not fit after it. Sent whole to
  // the next line it leaves 15 characters (105 px) empty; "extraordina-" (12)
  // fits the 14 left.
  const TEXT = 'de la extraordinariamente';

  it('a ragged line hyphenates only when the gap it would leave is wider than the zone', () => {
    setHyphenationLocale('es');
    const at = (zone: number) => texts(measureRichBlock(span(TEXT), FONT, FONT, FONT, FONT, 140, 20, { textAlign: 'left', hyphenate: true, hyphenationZonePx: zone }).lines);
    expect(at(0)).toEqual(['de la extraordina-', 'riamente']);
    expect(at(104)).toEqual(['de la extraordina-', 'riamente']);
    expect(at(105)).toEqual(['de la', 'extraordinariamente']);
  });

  it('without the zone option a ragged block keeps hyphenating wherever a word does not fit', () => {
    setHyphenationLocale('es');
    const lines = texts(measureRichBlock(span(TEXT), FONT, FONT, FONT, FONT, 140, 20, { textAlign: 'left', hyphenate: true }).lines);
    expect(lines).toEqual(['de la extraordina-', 'riamente']);
    // And not at all without `hyphenate` (today's ragged text).
    const plain = texts(measureRichBlock(span(TEXT), FONT, FONT, FONT, FONT, 140, 20, { textAlign: 'left' }).lines);
    expect(plain).toEqual(['de la', 'extraordinariamente']);
  });

  it('the zone never blocks a hard hyphen or a word wider than the line', () => {
    setHyphenationLocale('es');
    // 12 characters: "enseñanza-" still ends the line on its own hyphen.
    const hard = texts(measureRichBlock(span('Proceso de enseñanza-aprendizaje'), FONT, FONT, FONT, FONT, 84, 20, { textAlign: 'left', hyphenate: true, hyphenationZonePx: 1000 }).lines);
    expect(hard).toEqual(['Proceso de', 'enseñanza-', 'aprendizaje']);
    // 8 characters: an overlong word is still divided.
    const long = texts(measureRichBlock(span('aprendizaje'), FONT, FONT, FONT, FONT, 56, 20, { textAlign: 'left', hyphenate: true, hyphenationZonePx: 1000 }).lines);
    expect(long).toEqual(['aprendi-', 'zaje']);
  });

  it('never ends more than two lines in a row on a syllable', () => {
    setHyphenationLocale('es');
    const text = 'La composición tipográfica editorial exige columnas alineadas y márgenes consistentes '
      + 'para que la lectura resulte agradable e ininterrumpida durante muchísimas horas seguidas.';
    // A line ending on a dictionary syllable: a letter, then the added hyphen.
    const run = (zone: number | undefined): number => {
      const lines = texts(measureRichBlock(span(text), FONT, FONT, FONT, FONT, 98, 20, { textAlign: 'left', hyphenate: true, hyphenationZonePx: zone }).lines);
      let longest = 0;
      let current = 0;
      for (const l of lines) {
        current = /\p{L}-$/u.test(l) ? current + 1 : 0;
        longest = Math.max(longest, current);
      }
      return longest;
    };
    // Unzoned (justified-style greedy) hyphenation ladders freely; the ragged
    // zone caps the ladder at two lines.
    expect(run(undefined)).toBeGreaterThan(2);
    expect(run(0)).toBe(2);
  });

  it('a soft hyphen typed in the text is the author\'s: the zone does not govern it', () => {
    setHyphenationLocale('es');
    // "aaaa aaaa aaaa " leaves 5 characters; the author's "ex-" fits. Sent
    // whole, "extraordinariamente" would leave only 42 px, under the 48 px
    // zone, so a dictionary syllable would be refused here — the author's
    // break is taken as it is with ragged hyphenation off.
    const text = 'aaaa aaaa aaaa ex\u00ADtraordinariamente';
    const zoned = texts(measureRichBlock(span(text), FONT, FONT, FONT, FONT, 140, 20, { textAlign: 'left', hyphenate: true, hyphenationZonePx: 48 }).lines);
    const off = texts(measureRichBlock(span(text), FONT, FONT, FONT, FONT, 140, 20, { textAlign: 'left' }).lines);
    expect(off).toEqual(['aaaa aaaa aaaa ex-', 'traordinariamente']);
    expect(zoned).toEqual(off);
  });

  it('author breaks neither count towards the two-line cap nor are stopped by it', () => {
    setHyphenationLocale('es');
    // 11 characters per line, zone 0: "caminante" (ca-mi-nan-te) ends each of
    // the first lines on "cami-" until the cap stops the third dictionary
    // syllable in a row.
    const at = (text: string) => texts(measureRichBlock(span(text), FONT, FONT, FONT, FONT, 77, 20, { textAlign: 'left', hyphenate: true, hyphenationZonePx: 0 }).lines).slice(0, 3);
    expect(at('aaaa caminante caminante caminante caminante')).toEqual(['aaaa cami-', 'nante cami-', 'nante']);
    // An author break first: the two dictionary syllables after it are allowed.
    expect(at('aaaa cami\u00ADnante caminante caminante caminante')).toEqual(['aaaa cami-', 'nante cami-', 'nante cami-']);
    // An author break third: taken although two syllables precede it.
    expect(at('aaaa caminante caminante cami\u00ADnante caminante')).toEqual(['aaaa cami-', 'nante cami-', 'nante cami-']);
  });

  it('the plain measurer honours the zone too', () => {
    setHyphenationLocale('es');
    const at = (zone: number) => texts(measureBlock(TEXT, FONT, 140, 20, { textAlign: 'left', hyphenate: true, hyphenationZonePx: zone }).lines);
    expect(at(0)).toEqual(['de la extraordina-', 'riamente']);
    expect(at(105)).toEqual(['de la', 'extraordinariamente']);
  });
});

/** One 140 px column (20 characters of the stub font) at 72 dpi. The body
 *  font is 8 pt, so 1 em is 8 px. */
const narrow = (bodyText: PostextConfig['bodyText'] = {}, extra: PostextConfig = {}): PostextConfig => ({
  locale: 'es',
  page: { dpi: 72, width: pt(140), height: pt(600), margins: { top: pt(0), bottom: pt(0), left: pt(0), right: pt(0) } },
  layout: { layoutType: 'single' },
  ...extra,
  bodyText: { textAlign: 'left', firstLineIndent: pt(0), ...bodyText },
});

const blockLines = (doc: VDTDocument): string[][] =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.map((b) => b.lines.map((l) => l.text))));
const hyphenatedLines = (doc: VDTDocument): string[] => blockLines(doc).flat().filter((t) => t.endsWith('-'));

const PARAGRAPH = 'de la extraordinariamente larga de la extraordinariamente larga de la extraordinariamente';

describe('ragged hyphenation (bodyText.hyphenation.ragged)', () => {
  it('ragged text is not hyphenated by default', () => {
    expect(hyphenatedLines(buildDocument({ markdown: PARAGRAPH }, narrow()))).toEqual([]);
  });

  it('opting in hyphenates ragged body text within the default zone', () => {
    const doc = buildDocument({ markdown: PARAGRAPH }, narrow({ hyphenation: { ragged: true } }));
    expect(blockLines(doc)[0]![0]).toBe('de la extraordina-');
    expect(hyphenatedLines(doc).length).toBeGreaterThan(0);
  });

  it('a zone wider than the gaps keeps every word whole', () => {
    const doc = buildDocument({ markdown: PARAGRAPH }, narrow({ hyphenation: { ragged: true, zone: em(20) } }));
    expect(hyphenatedLines(doc)).toEqual([]);
  });

  it('hyphenation.enabled: false still turns it off', () => {
    const doc = buildDocument({ markdown: PARAGRAPH }, narrow({ hyphenation: { enabled: false, ragged: true } }));
    expect(hyphenatedLines(doc)).toEqual([]);
  });

  it('justified text is unchanged by the ragged settings', () => {
    const markdown = PARAGRAPH;
    const base = blockLines(buildDocument({ markdown }, narrow({ textAlign: 'justify' })));
    const withRagged = blockLines(buildDocument({ markdown }, narrow({ textAlign: 'justify', hyphenation: { ragged: true, zone: em(20) } })));
    expect(withRagged).toEqual(base);
  });

  it('ragged paragraph styles follow the setting, and their own hyphenation flag', () => {
    const markdown = `:::paragraphs{style="ragged"}\n${PARAGRAPH}\n:::\n\n:::paragraphs{style="whole"}\n${PARAGRAPH}\n:::`;
    const styles = [
      { id: 'ragged', name: 'Ragged', textAlign: 'left' as const },
      { id: 'whole', name: 'Whole', textAlign: 'left' as const, hyphenation: false },
    ];
    const off = blockLines(buildDocument({ markdown }, narrow({ textAlign: 'justify' }, { paragraphStyles: styles })));
    expect(off.flat().filter((t) => t.endsWith('-'))).toEqual([]);
    const on = blockLines(buildDocument({ markdown }, narrow({ textAlign: 'justify', hyphenation: { ragged: true } }, { paragraphStyles: styles })));
    expect(on[0]![0]).toBe('de la extraordina-');
    expect(on[1]!.filter((t) => t.endsWith('-'))).toEqual([]);
  });
});

describe('ragged hyphenation in callout bodies', () => {
  const markdown = `:::callout{type="note"}\n${PARAGRAPH}\n:::`;
  const boxed = (hyphenation: PostextConfig['bodyText'], body: { hyphenation?: boolean } = {}) =>
    buildDocument({ markdown }, narrow({ textAlign: 'justify', ...hyphenation }, {
      calloutStyles: [{ id: 'note', body: { textAlign: 'left', ...body } }],
    }));
  const syllableEnds = (doc: VDTDocument) => hyphenatedLines(doc).filter((t) => /\p{L}-$/u.test(t));

  it('a ragged box body follows the document setting', () => {
    expect(syllableEnds(boxed({}))).toEqual([]);
    expect(syllableEnds(boxed({ hyphenation: { ragged: true } })).length).toBeGreaterThan(0);
  });

  it('and its own hyphenation switch', () => {
    expect(syllableEnds(boxed({ hyphenation: { ragged: true } }, { hyphenation: false }))).toEqual([]);
  });
});

describe('ragged hyphenation config', () => {
  it('resolves to off with a 3 em zone', () => {
    expect(DEFAULT_HYPHENATION_CONFIG).toMatchObject({ enabled: true, locale: 'en-us', ragged: false, zone: em(3) });
    expect(resolveBodyTextConfig().hyphenation).toMatchObject({ ragged: false, zone: em(3) });
    expect(resolveBodyTextConfig({ hyphenation: { ragged: true } }).hyphenation).toMatchObject({ enabled: true, ragged: true, zone: em(3) });
    expect(resolveBodyTextConfig({ hyphenation: { zone: pt(12) } }).hyphenation).toMatchObject({ ragged: false, zone: pt(12) });
  });

  it('saved presets stay minimal', () => {
    expect(stripBodyTextDefaults({ hyphenation: { enabled: true, locale: 'en-us', ragged: false, zone: em(3) } })).toBeUndefined();
    expect(stripBodyTextDefaults({ hyphenation: { ragged: true } })).toEqual({ hyphenation: { ragged: true } });
    expect(hyphenationEqual({ zone: em(3) }, {})).toBe(true);
    expect(hyphenationEqual({ zone: em(2.5) }, {})).toBe(false);
    expect(hyphenationEqual({ ragged: true }, {})).toBe(false);
  });
});
