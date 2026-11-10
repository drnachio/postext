import { describe, it, expect } from 'vitest';
import { computeBreakpoints } from '../../knuthPlass/breakpoints.js';
import type { KPItem } from '../../knuthPlass/types.js';
import { resolveBodyTextConfig, stripBodyTextDefaults } from '../../defaults/text/bodyText.js';
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
  page: { dpi: 72, width: pt(width), height: pt(20000), margins: { top: pt(0), bottom: pt(0), left: pt(0), right: pt(0) } },
  layout: { layoutType: 'single' },
  // Strict hyphenation on, as the rule is meant to be used with it.
  bodyText: { firstLineIndent: pt(0), strictHyphenation: true, ...bodyText },
});

const MD = [
  'Los pacientes con enfermedades musculoesqueléticas crónicas presentan con frecuencia síntomas psicológicos que condicionan la evolución del cuadro clínico. La valoración inicial debe incluir una anamnesis detallada, una exploración física sistemática y la identificación de los factores sociales que pueden influir en la adherencia al tratamiento farmacológico y rehabilitador.',
  'Diversos estudios han demostrado que la intervención multidisciplinaria, coordinada entre el médico de atención primaria, el fisioterapeuta y el psicólogo, mejora significativamente la calidad de vida y reduce el consumo de analgésicos. Sin embargo, todavía existen importantes diferencias entre los distintos sistemas sanitarios en cuanto a la disponibilidad de estos recursos y a los tiempos de espera.',
  'El abordaje del dolor crónico exige considerar tanto los mecanismos fisiopatológicos subyacentes como las características psicosociales del paciente. La educación terapéutica, el ejercicio supervisado y las técnicas cognitivo-conductuales constituyen los pilares fundamentales del tratamiento, mientras que la farmacoterapia debe individualizarse según la intensidad del dolor y las comorbilidades asociadas.',
  'Entre las complicaciones más frecuentes destacan la desmineralización ósea, la sarcopenia, las alteraciones del sueño y los trastornos depresivos, que a su vez empeoran la percepción del dolor y favorecen la discapacidad. Por ello, la detección precoz de estas alteraciones y su tratamiento específico deberían formar parte de cualquier protocolo asistencial actualizado.',
].join('\n\n');

/** Each paragraph's lines, as whether they end on a hyphen. */
const hyphenated = (doc: VDTDocument): boolean[][] =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.map((b) => b.lines.map((l) => l.text.trimEnd().endsWith('-')))));
/** Hyphens one line apart: yes, no, yes. */
const alternations = (doc: VDTDocument): number =>
  hyphenated(doc).reduce((n, h) => n + h.filter((x, k) => x && k > 1 && h[k - 2] && !h[k - 1]).length, 0);
/** Hyphens in consecutive lines. */
const pairs = (doc: VDTDocument): number =>
  hyphenated(doc).reduce((n, h) => n + h.filter((x, k) => x && k > 0 && h[k - 1]).length, 0);
const lineTexts = (doc: VDTDocument): string[] =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines.map((l) => l.text))));

describe('hyphen spacing', () => {
  it('is off by default (0 lines), at a cost of 300 when on', () => {
    expect(resolveBodyTextConfig()).toMatchObject({ minLinesBetweenHyphens: 0, hyphenSpacingPenalty: 300 });
    expect(stripBodyTextDefaults({ minLinesBetweenHyphens: 0, hyphenSpacingPenalty: 300 })).toBeUndefined();
    expect(stripBodyTextDefaults({ minLinesBetweenHyphens: 2 })).toEqual({ minLinesBetweenHyphens: 2 });
  });

  it('clamps the window to 0–4 lines and the penalty to 0 or more', () => {
    expect(resolveBodyTextConfig({ minLinesBetweenHyphens: 9 }).minLinesBetweenHyphens).toBe(4);
    expect(resolveBodyTextConfig({ minLinesBetweenHyphens: -1 }).minLinesBetweenHyphens).toBe(0);
    expect(resolveBodyTextConfig({ hyphenSpacingPenalty: -5 }).hyphenSpacingPenalty).toBe(0);
  });

  it('breaks the yes-no-yes rhythm of hyphens where the spacing allows', () => {
    const off = buildDocument({ markdown: MD }, column(210));
    const on = buildDocument({ markdown: MD }, column(210, { minLinesBetweenHyphens: 2 }));
    expect(alternations(off)).toBeGreaterThan(0);
    expect(alternations(on)).toBeLessThan(alternations(off));
  });

  it('with a high penalty, leaves no hyphen within two lines of another where it can', () => {
    const doc = buildDocument({ markdown: MD }, column(252, { minLinesBetweenHyphens: 2, hyphenSpacingPenalty: 9000 }));
    expect(alternations(doc)).toBe(0);
    expect(pairs(doc)).toBe(0);
  });

  it('turned off, by its window or by its penalty, sets the paragraphs alike', () => {
    const byLines = lineTexts(buildDocument({ markdown: MD }, column(210, { minLinesBetweenHyphens: 0 })));
    const byPenalty = lineTexts(buildDocument({ markdown: MD }, column(210, { minLinesBetweenHyphens: 2, hyphenSpacingPenalty: 0 })));
    expect(byPenalty).toEqual(byLines);
  });
});

describe('computeBreakpoints: hyphen history', () => {
  // Fourteen words of 30–44 px, each with a hyphen point (5 px) in the
  // middle, and spaces of 10 px (stretch 10, shrink 3), set on 115 px.
  const items: KPItem[] = [];
  for (let w = 0; w < 14; w++) {
    items.push({ type: 'box', width: 15 + (w % 3) * 4, sourceIndex: w });
    items.push({ type: 'penalty', width: 5, penalty: 50, flagged: true, sourceIndex: w });
    items.push({ type: 'box', width: 15 + (w % 2) * 6, sourceIndex: w });
    if (w < 13) items.push({ type: 'glue', width: 10, stretch: 10, shrink: 3, sourceIndex: w });
  }
  items.push({ type: 'glue', width: 0, stretch: 1e6, shrink: 0, sourceIndex: -1 });
  items.push({ type: 'penalty', width: 0, penalty: -10000, flagged: false, sourceIndex: -1 });
  const base = { lineWidth: () => 115, normalSpaceWidth: 10, maxStretchRatio: 2, minShrinkRatio: 0.7 };
  /** The lines' ends: H a hyphen, . a whole word. */
  const ends = (breaks: number[]) => breaks.map((b) => (items[b]!.type === 'penalty' && (items[b] as { flagged: boolean }).flagged ? 'H' : '.')).join('');

  it('costs a hyphen within the window, so a dear enough rule keeps them apart', () => {
    expect(ends(computeBreakpoints(items, base))).toBe('H.H.H.');
    expect(ends(computeBreakpoints(items, { ...base, hyphenSpacing: { lines: 2, badness: 100000 } }))).toBe('H..H..');
  });

  it('changes nothing when off', () => {
    expect(computeBreakpoints(items, { ...base, hyphenSpacing: { lines: 2, badness: 0 } })).toEqual(computeBreakpoints(items, base));
  });
});
