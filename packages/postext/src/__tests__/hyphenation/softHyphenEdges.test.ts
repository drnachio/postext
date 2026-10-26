import { describe, it, expect, afterEach } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { createMeasurementCache } from '../../measure/index.js';
import { measureBlock } from '../../measure/plain.js';
import { measureRichBlock } from '../../measure/rich.js';
import { hyphenateText, setHyphenationLocale, softHyphenBreaks, withoutEdgeSoftHyphens } from '../../hyphenation/hyphenate.js';
import { layoutDesignSlot, type ResolvedTextPrimitive } from '../../design/layout.js';
import { resolveDesignSlot } from '../../defaults/structure/headerFooter.js';
import type { DesignPlaceholderContext } from '../../design/placeholders.js';
import type { DesignElement } from '../../types.js';
import type { InlineSpan } from '../../parse/index.js';
import type { PostextConfig, VDTDocument, VDTLine } from '../../index.js';
import type { VDTPage } from '../../vdt.js';

// Deterministic text measurement stub (no DOM in the node test env): every
// printed character, the space included, is 7 px wide; a soft hyphen, a word
// joiner and a zero-width space are 0, as a font sets them.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: [...s].filter((c) => c !== '­' && c !== '⁠' && c !== '​').length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const SHY = '­';
const FONT = '16px Test';
const pt = (value: number) => ({ value, unit: 'pt' as const });
const span = (text: string): InlineSpan[] => [{ text, bold: false, italic: false }];
const show = (s: string): string => s.split(SHY).join('|');

const config = (widthPt: number, body: Record<string, unknown> = {}): PostextConfig => ({
  page: { dpi: 96, width: pt(widthPt), height: pt(900), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  bodyText: { textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: true, locale: 'en-us' }, ...body },
  headings: { levels: [] },
}) as unknown as PostextConfig;

const linesOf = (doc: VDTDocument): VDTLine[] => doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines)));
const layout = (markdown: string, widthPt: number, body?: Record<string, unknown>): VDTLine[] =>
  linesOf(buildDocument({ markdown }, config(widthPt, body), createMeasurementCache()));

afterEach(() => setHyphenationLocale('en-us'));

describe('a typed soft hyphen is a break only between two letters or digits (#700)', () => {
  it('reads the characters on either side of it', () => {
    const at = (text: string): boolean => softHyphenBreaks(text, text.indexOf(SHY));
    expect(at(`to${SHY}gether`)).toBe(true);
    expect(at(`B${SHY}12`)).toBe(true);
    expect(at(`12${SHY}b`)).toBe(true);
    expect(at(`é${SHY}a`)).toBe(true);
    expect(at(`\u{1D49C}${SHY}\u{1D49E}`)).toBe(true);
    expect(at(`${SHY}Alice`)).toBe(false);
    expect(at(`Alice${SHY}`)).toBe(false);
    expect(at(`(${SHY}Alice)`)).toBe(false);
    expect(at(`Alice${SHY},`)).toBe(false);
    expect(at(`“${SHY}Alice”`)).toBe(false);
    expect(at(`well-${SHY}known`)).toBe(false);
    // Typed twice in a row: one break.
    expect(softHyphenBreaks(`to${SHY}${SHY}gether`, 2)).toBe(true);
    expect(softHyphenBreaks(`to${SHY}${SHY}gether`, 3)).toBe(false);
  });

  it('leaves out the ones that are no break and keeps the dictionary\'s points', () => {
    expect(withoutEdgeSoftHyphens(`${SHY}Alice and (${SHY}Alice) to${SHY}gether Alice${SHY}, x`)).toBe(`Alice and (Alice) to${SHY}gether Alice, x`);
    const source = `${SHY}Alice sat indignantly`;
    expect(show(withoutEdgeSoftHyphens(source, hyphenateText(source, 'en-us')))).toBe('Alice sat in|dig|nantly');
    expect(withoutEdgeSoftHyphens('plain', 'pla­in')).toBe('pla­in');
  });

  it('a word with a typed soft hyphen gets no dictionary point, in Catalan as elsewhere', () => {
    expect(show(hyphenateText('Barcelona', 'ca'))).toBe('Bar|ce|lo|na');
    expect(show(hyphenateText(`${SHY}Barcelona`, 'ca'))).toBe('|Barcelona');
    expect(show(hyphenateText(`${SHY}Barcelona`, 'es'))).toBe('|Barcelona');
    expect(show(hyphenateText(`desenvolu${SHY}pament`, 'ca'))).toBe('desenvolu|pament');
    expect(show(hyphenateText(`Barcelona${SHY}`, 'ca'))).toBe('Barcelona|');
    // The other words of the text keep theirs, and an ela geminada its break.
    expect(show(hyphenateText(`${SHY}Barcelona desenvolupament il·lusió`, 'ca'))).toBe('|Barcelona desen|vo|lu|pa|ment il·|lu|sió');
    expect(show(hyphenateText(`to${SHY}gether`, 'en-us'))).toBe('to|gether');
    expect(show(hyphenateText(`${SHY}Alice`, 'en-us'))).toBe('|Alice');
  });

  // Both breakers, straight: 12 characters to a line.
  const breakers: Array<[string, (text: string, opts: Record<string, unknown>) => VDTLine[]]> = [
    ['plain', (text, opts) => measureBlock(text, FONT, 84, 20, opts).lines],
    ['word by word', (text, opts) => measureRichBlock(span(text), FONT, FONT, FONT, FONT, 84, 20, opts).lines],
  ];
  for (const [name, measure] of breakers) {
    it(`${name} breaker: together breaks only at the typed point`, () => {
      for (const opts of [{ hyphenate: true }, { hyphenate: false }, { hyphenate: true, textAlign: 'justify', optimal: true }]) {
        const lines = measure(`we were all to${SHY}gether`, opts).map((l) => l.text.trimEnd());
        expect(lines).toEqual(['we were all', 'together']);
        const tight = measure(`we were to${SHY}gether`, opts).map((l) => l.text.trimEnd());
        expect(tight).toEqual(['we were to-', 'gether']);
      }
    });

    it(`${name} breaker: a soft hyphen between a digit and a letter still breaks`, () => {
      expect(measure(`she is at B${SHY}12 vitamin`, { hyphenate: true }).map((l) => l.text.trimEnd())).toEqual(['she is at B-', '12 vitamin']);
    });

    it(`${name} breaker: a soft hyphen at a word's edge or next to punctuation breaks nothing`, () => {
      for (const word of [`${SHY}Alice`, `Alice${SHY}`, `(${SHY}Alice)`, `(Alice${SHY})`, `Alice${SHY},`, `“${SHY}Alice”`, `“Alice${SHY}”`]) {
        for (const opts of [{ hyphenate: true }, { hyphenate: false }, { hyphenate: true, textAlign: 'justify', optimal: true }]) {
          for (let lead = 1; lead <= 9; lead++) {
            const lines = measure(`${'x'.repeat(lead)} ${word} sat`, opts);
            const clean = word.split(SHY).join('');
            const where = `${show(word)} after ${lead}: ${JSON.stringify(lines.map((l) => l.text))}`;
            expect(lines.some((l) => l.hyphenated), where).toBe(false);
            expect(lines.some((l) => l.text.includes(SHY)), where).toBe(false);
            expect(lines.filter((l) => l.text.includes(clean)).length, where).toBe(1);
          }
        }
      }
    });
  }

  it('the word-by-word breaker reads a word cut by formatting piece by piece', () => {
    const spans: InlineSpan[] = [
      { text: 'xxxxxx (', bold: false, italic: false },
      { text: `${SHY}Alice${SHY}`, bold: false, italic: true },
      { text: ') sat', bold: false, italic: false },
    ];
    const lines = measureRichBlock(spans, FONT, FONT, FONT, FONT, 84, 20, { hyphenate: true }).lines;
    expect(lines.map((l) => l.text)).toEqual(['xxxxxx', '(Alice) sat']);
    expect(lines.some((l) => l.hyphenated)).toBe(false);
  });

  const sentence = (name: string): string =>
    `The table was a large one, but ${name} and the three were all crowded at one corner of it. There is plenty of room said ${name} indignantly, and ${name} sat down in a large chair at one end of the table with ${name}.`;
  const punctuated = (name: string): string =>
    `The table was a large one, but (${name}) and the three were all crowded at one corner of it. There is plenty of room said “${name}” indignantly, and ${name}, sat down in a large chair at one end of the table with ${name}.`;
  const MODES: Array<[string, Record<string, unknown>]> = [
    ['justified, optimal', {}],
    ['justified, greedy', { optimalLineBreaking: false }],
    ['ragged, optimal', { textAlign: 'left' }],
    ['ragged, greedy', { textAlign: 'left', optimalRagged: false }],
    ['ragged, hyphenated', { textAlign: 'left', hyphenation: { enabled: true, locale: 'en-us', ragged: true } }],
  ];

  for (const [mode, body] of MODES) {
    it(`${mode}: over a sweep of measures no line ends on a hyphen Alice does not have`, () => {
      const bad: string[] = [];
      // From 17 characters to a line: no word of the text is wider.
      for (let w = 130; w <= 400; w += 7) {
        for (const rich of [false, true]) {
          for (const name of [`${SHY}Alice`, `Alice${SHY}`]) {
            for (const make of [sentence, punctuated]) {
              const md = rich ? make(name).replace('plenty', '*plenty*') : make(name);
              const lines = layout(md, w, body);
              for (let i = 0; i < lines.length; i++) {
                const t = lines[i]!.text;
                const next = lines[i + 1]?.text ?? '';
                const wrong = t.includes(SHY)
                  // A hyphen after the whole word, or after its bracket.
                  || /Alice-$/.test(t) || /[(“]-$/.test(t)
                  // The word divided by the dictionary.
                  || /Al-$/.test(t)
                  // A hyphenated break before the word or its punctuation.
                  || (lines[i]!.hyphenated && /^(?:Alice|[)”,.])/.test(next))
                  // A line that opens with the space or the punctuation the
                  // break parted from the word.
                  || /^[\s)”,.]/.test(t);
                if (wrong) bad.push(`${w}pt ${rich ? 'formatted' : 'plain'} ${show(name)}: ${JSON.stringify(t)} | ${JSON.stringify(next)}`);
              }
            }
          }
        }
      }
      expect(bad).toEqual([]);
    }, 120_000);
  }

  it('Alice is divided where the measure asks for it, and never with a soft hyphen before it', () => {
    let divided = 0;
    for (let w = 100; w <= 400; w += 1) {
      for (const rich of [false, true]) {
        const md = (name: string): string => (rich ? sentence(name).replace('plenty', '*plenty*') : sentence(name));
        if (!layout(md('Alice'), w).some((l) => /\bAl-$/.test(l.text))) continue;
        divided++;
        const kept = layout(md(`${SHY}Alice`), w);
        expect(kept.some((l) => /\bAl-$/.test(l.text)), `${w}pt`).toBe(false);
        expect(kept.some((l) => /Alice-$/.test(l.text)), `${w}pt`).toBe(false);
      }
    }
    expect(divided).toBeGreaterThan(0);
  }, 120_000);

  it('a line keeps its source range over a soft hyphen that was dropped', () => {
    const md = `The table was a large one, but (${SHY}Alice${SHY}) and the three were all crowded at one corner of it.`;
    for (const rich of [false, true]) {
      const source = rich ? md.replace('large', '*large*') : md;
      for (const w of [130, 160, 200]) {
        const doc = buildDocument({ markdown: source }, config(w), createMeasurementCache());
        const lines = linesOf(doc);
        expect(lines.length).toBeGreaterThan(1);
        // The lines tile the source, and each prints what its range holds.
        expect(lines[0]!.sourceStart).toBe(0);
        expect(lines[lines.length - 1]!.sourceEnd).toBe(source.length);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          const written = source.slice(line.sourceStart, line.sourceEnd).split(SHY).join('').replace(/\*/g, '').trim();
          const printed = line.hyphenated ? line.text.replace(/-$/, '') : line.text;
          expect(written, `${w}pt line ${i}`).toBe(printed);
          if (i > 0) expect(line.sourceStart, `${w}pt line ${i}`).toBeGreaterThanOrEqual(lines[i - 1]!.sourceEnd!);
        }
      }
    }
  });

  it('a word of a joining script is never divided, with or without a soft hyphen', () => {
    const word = `كتا${SHY}بكتاب`;
    for (const measure of [measureBlock(`xx ${word} xx`, FONT, 42, 20, { hyphenate: true }).lines, measureRichBlock(span(`xx ${word} xx`), FONT, FONT, FONT, FONT, 42, 20, { hyphenate: true }).lines]) {
      expect(measure.some((l) => l.hyphenated)).toBe(false);
    }
  });

  it('design text: a word wider than its box is not cut at a soft hyphen typed at its edge', () => {
    const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
    const placeholders: DesignPlaceholderContext = { kind: 'header', page: stubPage, allPages: [stubPage], metadata: {}, chapterTitleByPageIndex: [] };
    const linesFor = (content: string): string[] => {
      const el = { kind: 'text', id: 't', content, fontSize: pt(10), overflow: 'wrap', hyphenate: true, placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(70) } } } as unknown as DesignElement;
      const p = layoutDesignSlot(resolveDesignSlot({ elements: [el] }), { container: { x: 0, y: 0, width: 300, height: 200 }, dpi: 72, placeholders }, 0).primitives[0] as ResolvedTextPrimitive;
      return p.lines.map((l) => l.text.split(SHY).join(''));
    };
    // Ten characters to a line: the word is cut at its syllables.
    expect(linesFor('extraordinarily')).toEqual(['extraordi-', 'narily']);
    // A soft hyphen before it: no line of a hyphen alone, no dictionary point.
    const kept = linesFor(`${SHY}extraordinarily`);
    expect(kept[0]).not.toBe('-');
    expect(kept.join('')).toBe('extraordinarily');
    // One typed inside the word is its one syllable break.
    expect(linesFor(`extra${SHY}ordinarily`)).toEqual(['extra-', 'ordinarily']);
  });
});
