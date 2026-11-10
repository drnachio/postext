import { describe, it, expect } from 'vitest';
import { edgesStack } from '../../knuthPlass/breakpoints.js';
import { resolveBodyTextConfig } from '../../defaults/text/bodyText.js';
import { buildDocument } from '../../pipeline/index.js';
import type { PostextConfig, VDTDocument } from '../../index.js';

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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const column = (width: number, bodyText: PostextConfig['bodyText'] = {}): PostextConfig => ({
  locale: 'es',
  page: { dpi: 72, width: pt(width), height: pt(2000), margins: { top: pt(0), bottom: pt(0), left: pt(0), right: pt(0) } },
  layout: { layoutType: 'single' },
  bodyText: { firstLineIndent: pt(0), ...bodyText },
});
const ON: PostextConfig['bodyText'] = { strictHyphenation: true };
const lineTexts = (doc: VDTDocument): string[] =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines.map((l) => l.text))));

const MD = 'Lo dijo lentamente y luego, tranquilamente, lo repitió de nuevo para que lo entendiera claramente '
  + 'la gente que estaba allí sentada, y la gente que lo oyó lo repitió de nuevo a la gente que no estaba, '
  + 'que la gente siempre repite lo que oye de la gente.';

const edge = (line: string, end: boolean): string => {
  const words = line.replace(/-$/, '').trim().split(/\s+/);
  return (end ? words[words.length - 1]! : words[0]!).replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').toLowerCase();
};
const hyphenPairs = (lines: string[]): number => lines.slice(1).filter((l, k) => l.endsWith('-') && lines[k]!.endsWith('-')).length;
/** A line's first three characters, spaces included. */
const head = (line: string): string => line.trim().replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 3).toLowerCase();
const startStacks = (lines: string[]): number => lines.slice(1).filter((l, k) => edgesStack(edge(l, false), edge(lines[k]!, false), head(l), head(lines[k]!))).length;

describe('strict hyphenation in justified text', () => {
  it('is off by default, as are the other hyphen rules, so documents keep their lines', () => {
    const b = resolveBodyTextConfig();
    expect(b).toMatchObject({ strictHyphenation: false, minLinesBetweenHyphens: 0, fewerHyphens: 0 });
    expect(b.hyphenation).toMatchObject({ maxConsecutive: 0, lastWord: true });
    expect(b.hyphenation.minWordLength).toBeUndefined();
    // Off by default and off by hand set the paragraph alike.
    const plain = lineTexts(buildDocument({ markdown: MD }, column(189)));
    const off = lineTexts(buildDocument({ markdown: MD }, column(189, {
      strictHyphenation: false, minLinesBetweenHyphens: 0, fewerHyphens: 0, hyphenation: { maxConsecutive: 0, lastWord: true },
    })));
    expect(off).toEqual(plain);
  });

  it('avoids two hyphenated lines in a row where the spacing allows', () => {
    const off = lineTexts(buildDocument({ markdown: MD }, column(189)));
    const on = lineTexts(buildDocument({ markdown: MD }, column(189, ON)));
    expect(hyphenPairs(off)).toBeGreaterThan(0);
    expect(hyphenPairs(on)).toBe(0);
  });

  it('avoids dividing the last word of a paragraph', () => {
    const off = lineTexts(buildDocument({ markdown: MD }, column(127)));
    const on = lineTexts(buildDocument({ markdown: MD }, column(127, ON)));
    expect(off[off.length - 2]!.endsWith('-')).toBe(true);
    expect(on[on.length - 2]!.endsWith('-')).toBe(false);
  });
});

describe('the hyphen limit and stacks are limits, not preferences', () => {
  // A medical paragraph in a narrow justified column: as preferences, a
  // limit of one hyphen gave way to keep the spacing, and the breaker's
  // node merging, or a setting one line shorter (`looseness`), could break
  // it where another setting kept it.
  const TEXT = 'El término hombro congelado debería reservarse para la capsulitis adhesiva idiopática, en la que la rigidez sigue un curso natural conocido. El término hombro rígido puede utilizarse si se conoce la causa: hombro rígido postraumático, hombro rígido secundario a causas intraarticulares (lesiones condrales o labrales), capsulares (contracturas tras cirugía o inmovilización prolongada), extraarticulares (adherencias subacromiales, osificación heterotópica, malunión de fracturas) o causas neurológicas (lesiones del plexo braquial). La exploración de la movilidad pasiva y activa permite distinguir entre la debilidad y la rigidez, y la palpación de la cápsula orienta el diagnóstico de la lesión.';
  /** A line's last three characters, spaces included. */
  const tail = (line: string): string => line.replace(/-$/, '').trimEnd().replace(/[^\p{L}\p{N}]+$/u, '').slice(-3).toLowerCase();
  const endStacks = (lines: string[]): number => lines.slice(1).filter((l, k) => edgesStack(edge(l, true), edge(lines[k]!, true), tail(l), tail(lines[k]!))).length;

  it('never sets two hyphenated lines in a row, nor a stack, where a setting avoids them', () => {
    for (let w = 240; w <= 360; w += 7) {
      const lines = lineTexts(buildDocument({ markdown: TEXT }, column(w, {
        textAlign: 'justify',
        strictHyphenation: true,
        avoidStacks: true,
        hyphenation: { enabled: true, minWordLength: 7, leftMin: 3, rightMin: 3, maxConsecutive: 1, capitalized: false },
      })));
      expect(hyphenPairs(lines), `${w}`).toBe(0);
      expect(endStacks(lines), `${w}`).toBe(0);
      expect(startStacks(lines), `${w}`).toBe(0);
    }
  });
});
