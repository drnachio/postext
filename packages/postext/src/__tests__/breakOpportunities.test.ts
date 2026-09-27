import { describe, it, expect, afterEach } from 'vitest';
import { measureRichBlock } from '../measure/rich';
import { measureBlock } from '../measure/plain';
import { hyphenateText, setHyphenationLocale } from '../hyphenate';
import { layoutSlotToVdt } from '../pipeline/headerFooter';
import { resolveDesignSlot } from '../defaults/headerFooter';
import type { InlineSpan } from '../parse';
import type { DesignElement } from '../types';
import type { VDTDesignTextBlock, VDTPage } from '../vdt';

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
const ZWSP = '\u200B';
const pt = (value: number) => ({ value, unit: 'pt' as const });
const run = (text: string, bold = false): InlineSpan => ({ text, bold, italic: false });
const span = (text: string): InlineSpan[] => [run(text)];
type Lines = ReturnType<typeof measureRichBlock>['lines'];
const texts = (lines: Lines): string[] => lines.map((l) => l.text);
const widths = (lines: Lines): number[] => lines.map((l) => l.segments!.reduce((s, seg) => s + seg.width, 0));

afterEach(() => setHyphenationLocale('en-us'));

describe('the joint after a slash', () => {
  // The dictionary (Hypher) marks "entrada/salida" with a U+200B after the
  // slash. The plain breaker takes it as a break opportunity; text laid out
  // word by word must not carry the character into its lines.
  it('the dictionary marks it', () => {
    expect(hyphenateText('entrada/salida', 'es')).toContain(ZWSP);
  });

  it('never reaches the line text or its segments on the rich path', () => {
    setHyphenationLocale('es');
    const text = 'Cumple la norma PDF/UA-1 y la velocidad en km/h de la entrada/salida, en https://example.org/path/to/page.';
    for (const options of [
      { textAlign: 'justify' as const, hyphenate: true, optimal: true },
      { textAlign: 'justify' as const, hyphenate: true },
      { textAlign: 'left' as const, hyphenate: true, hyphenationZonePx: 0 },
    ]) {
      const lines = measureRichBlock([run('Cumple', true), run(text.slice(6))], FONT, FONT, FONT, FONT, 98, 20, options).lines;
      for (const line of lines) {
        expect(line.text).not.toContain(ZWSP);
        for (const seg of line.segments!) expect(seg.text).not.toContain(ZWSP);
      }
    }
  });

  it('the plain breaker still breaks there, and leaves the character out of the line', () => {
    // 12 characters per line: "abc lectura/" ends on the slash.
    setHyphenationLocale('es');
    const text = 'abc lectura/escritura cliente/servidor';
    for (const optimal of [false, true]) {
      const lines = measureBlock(text, FONT, 84, 20, { textAlign: 'justify', hyphenate: true, optimal }).lines;
      expect(lines.some((l) => /\/\s*$/.test(l.text)), `optimal ${optimal}`).toBe(true);
      for (const line of lines) {
        expect(line.text).not.toContain(ZWSP);
        for (const seg of line.segments!) expect(seg.text).not.toContain(ZWSP);
      }
    }
  });

  it('a zero-width space typed in the text stays', () => {
    const lines = measureRichBlock([run('a', true), run(`b long${ZWSP}word`)], FONT, FONT, FONT, FONT, 140, 20, { textAlign: 'left', hyphenate: true }).lines;
    expect(lines.map((l) => l.text).join('')).toContain(ZWSP);
  });

  it('never reaches design text either', () => {
    setHyphenationLocale('es');
    // 14 characters: "entrada/sali-" fits, and the head used to carry the
    // U+200B after the slash.
    const el: DesignElement = {
      kind: 'text',
      id: 't',
      placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: pt(0), y: pt(0) }, size: { width: 'fill', height: 'auto' } },
      content: 'entrada/salidaextraordinaria',
      fontSize: pt(12),
      overflow: 'wrap',
      hyphenate: true,
    };
    const page = { index: 0, pageLabel: '1' } as unknown as VDTPage;
    const context = { kind: 'header' as const, page, allPages: [page], metadata: {}, chapterTitleByPageIndex: [] };
    const slot = layoutSlotToVdt(resolveDesignSlot({ elements: [el] }), { x: 0, y: 0, width: 98, height: 300 }, 0, context, 72);
    const block = slot?.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text');
    expect(block?.lines.length).toBeGreaterThan(1);
    for (const line of block!.lines) expect(line.text).not.toContain(ZWSP);
  });
});

describe('an overlong word divided at its syllables', () => {
  it('finds the syllables after a slash where the dictionary puts them', () => {
    // 8 characters per line. Spanish "ex-tra-or-di-na-ria-men-te": the first
    // line ends "x:y/ex-". The U+200B the dictionary put after the slash used
    // to shift every syllable after it by one character ("x:y/ext-").
    setHyphenationLocale('es');
    const lines = texts(measureRichBlock(span('x:y/extraordinariamente'), FONT, FONT, FONT, FONT, 56, 20, { textAlign: 'left' }).lines);
    expect(lines[0]).toBe('x:y/ex-');
    expect(lines.join('').replace(/-/g, '')).toBe('x:y/extraordinariamente');
  });
});

describe('a word wider than a justified column', () => {
  // 12 characters per line; a 20-character word fits no line. Knuth–Plass
  // found no feasible break around it and set everything before it on one
  // line, far past the column.
  const TEXT = 'aaa bbb ccc dddd eee fff ' + 'x'.repeat(20) + ' ggg hhh iii jjj kkk';
  const contentWidth = (l: Lines[number]): number => l.segments!.filter((s) => s.kind !== 'space').reduce((sum, s) => sum + s.width, 0);

  it('is divided instead, and no line runs past the column', () => {
    const plain = measureBlock(TEXT, FONT, 84, 20, { textAlign: 'justify', optimal: true }).lines;
    const rich = measureRichBlock([run('a', true), run(TEXT.slice(1))], FONT, FONT, FONT, FONT, 84, 20, { textAlign: 'justify', optimal: true }).lines;
    for (const lines of [plain, rich]) {
      expect(lines[0]!.text.trim()).toBe('aaa bbb ccc');
      for (const l of lines) expect(contentWidth(l)).toBeLessThanOrEqual(84);
      expect(lines.map((l) => l.text).join('').replace(/[\s-]/g, '')).toBe(TEXT.replace(/\s/g, ''));
    }
  });

  it('the plain breaker cuts it between characters, and each line keeps only its part', () => {
    // The segments of a line cut inside a word used to be the whole word on
    // the next line and nothing on this one; justified lines paint segments.
    const lines = measureBlock(TEXT, FONT, 84, 20, { textAlign: 'justify' }).lines;
    for (const l of lines) {
      expect(l.segments!.map((s) => s.text).join('')).toBe(l.text.trimEnd());
      expect(contentWidth(l)).toBeLessThanOrEqual(84);
    }
  });
});

describe('where two runs meet without a space', () => {
  it('a ragged line does not break between them', () => {
    // 12 characters per line. "aaaa aaaa (" fits, "véase" (bold) does not:
    // the line used to end on the opening parenthesis.
    const spans = [run('aaaa aaaa ('), run('véase', true), run(' bbb')];
    const lines = texts(measureRichBlock(spans, FONT, FONT, FONT, FONT, 84, 20, { textAlign: 'left' }).lines);
    expect(lines).toEqual(['aaaa aaaa', '(véase bbb']);
    // A trailing mark stays with its word too.
    const comma = texts(measureRichBlock([run('aaaa bbbb '), run('cc', true), run(', dd')], FONT, FONT, FONT, FONT, 84, 20, { textAlign: 'left' }).lines);
    expect(comma).toEqual(['aaaa bbbb', 'cc, dd']);
  });

  it('a word that opens the line and does not fit is divided, not split at the run boundary', () => {
    setHyphenationLocale('es');
    // 8 characters per line: "x" + "extraordinariamente" (bold) used to set
    // the lone "x" on the first line.
    const lines = texts(measureRichBlock([run('x'), run('extraordinariamente', true)], FONT, FONT, FONT, FONT, 56, 20, { textAlign: 'left' }).lines);
    expect(lines[0]).toBe('xextra-');
    expect(lines.join('').replace(/-/g, '')).toBe('xextraordinariamente');
  });
});

describe('Chinese, Japanese and Korean', () => {
  // 20 ideographs fill a 140 px line exactly; the 21st is 。, which may not
  // start a line (kinsoku), so the first line gives up its last ideograph.
  const TEXT = '一二三四五六七八九十一二三四五六七八九十。次の文はここから始まります。';
  const EXPECTED = ['一二三四五六七八九十一二三四五六七八九', '十。次の文はここから始まります。'];

  it('plain ragged text breaks between ideographs with kinsoku (pretext)', () => {
    expect(texts(measureBlock(TEXT, FONT, 140, 20, { textAlign: 'left' }).lines)).toEqual(EXPECTED);
  });

  it('text with inline formatting breaks the same way, with no hyphen', () => {
    const spans = [run('一', true), run(TEXT.slice(1))];
    for (const options of [{ textAlign: 'left' as const }, { textAlign: 'left' as const, hyphenate: true, hyphenationZonePx: 0 }, { textAlign: 'justify' as const }]) {
      const block = measureRichBlock(spans, FONT, FONT, FONT, FONT, 140, 20, options);
      expect(texts(block.lines)).toEqual(EXPECTED);
    }
  });

  it('justified text no longer runs past its column', () => {
    const plain = measureBlock(TEXT, FONT, 140, 20, { textAlign: 'justify', optimal: true, hyphenate: true });
    expect(texts(plain.lines)).toEqual(EXPECTED);
    const rich = measureRichBlock([run('一', true), run(TEXT.slice(1))], FONT, FONT, FONT, FONT, 140, 20, { textAlign: 'justify', optimal: true, hyphenate: true });
    expect(texts(rich.lines)).toEqual(EXPECTED);
    for (const w of widths(rich.lines)) expect(w).toBeLessThanOrEqual(140);
  });

  it('a CJK bracket, dot or fullwidth sign in a Latin paragraph keeps optimal breaking', () => {
    // Only words set without spaces need first-fit breaking: one quoted
    // grapheme or symbol leaves the paragraph to Knuth–Plass (runt handling
    // included), laid out as with an ASCII stand-in of the same width.
    const words = 'La letra que escribimos entre corchetes angulares representa un grafema y no un sonido concreto de la lengua hablada en ninguna de sus variedades regionales ni sociales conocidas hasta hoy';
    const options = { textAlign: 'justify' as const, optimal: true, runtPenalty: 1000, runtMinCharacters: 20 };
    for (const [ascii, cjk] of [['<h>', '〈h〉'], ['<h>', '「h」'], ['%', '％'], ['.', '・']]) {
      const latin = words.replace('grafema', `grafema ${ascii}`);
      const mixed = words.replace('grafema', `grafema ${cjk}`);
      const same = (t: string) => t.replace(cjk!, ascii!);
      for (const width of [200, 230, 260, 300, 330]) {
        const plainA = measureBlock(latin, FONT, width, 20, options);
        const plainB = measureBlock(mixed, FONT, width, 20, options);
        expect(plainB.lines.map((l) => same(l.text))).toEqual(plainA.lines.map((l) => l.text));
        expect(plainB.lastLineRunt).toBe(plainA.lastLineRunt);
        const richA = measureRichBlock(span(latin), FONT, FONT, FONT, FONT, width, 20, options);
        const richB = measureRichBlock(span(mixed), FONT, FONT, FONT, FONT, width, 20, options);
        expect(texts(richB.lines).map(same)).toEqual(texts(richA.lines));
        expect(richB.lastLineRunt).toBe(richA.lastLineRunt);
      }
    }
  });

  it('two runs of ideographs may break where they meet, unless kinsoku forbids it', () => {
    // 19 ideographs, then a bold run that does not fit: the line breaks
    // between the runs, which is a break between two ideographs.
    const head = '一二三四五六七八九十一二三四五六七八九';
    const lines = texts(measureRichBlock([run(head), run('十一', true)], FONT, FONT, FONT, FONT, 140, 20, { textAlign: 'left' }).lines);
    expect(lines).toEqual([head + '十', '一']);
    // 。 never opens a line: it stays with the ideograph before it.
    const kinsoku = texts(measureRichBlock([run(head + '十'), run('。次', true)], FONT, FONT, FONT, FONT, 140, 20, { textAlign: 'left' }).lines);
    expect(kinsoku).toEqual([head, '十。次']);
  });
});
