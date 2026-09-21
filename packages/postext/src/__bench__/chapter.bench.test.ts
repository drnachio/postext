/**
 * Layout cost of one textbook-sized chapter, cold (empty measurement cache)
 * and warm (second build against the same cache), with the pass count.
 * Skipped by `pnpm test`; run with `pnpm bench` (BENCH=1).
 *
 * Text measurement is stubbed (no canvas in node), so absolute numbers are
 * not the browser's — but the cold/warm ratio and the pass count are, and
 * a regression in either shows up here before it shows up in the sandbox.
 */
import { describe, it } from 'vitest';
import { buildDocument, type BuildPassInfo } from '../pipeline/build';
import { createMeasurementCache } from '../measure';
import type { PostextConfig } from '../types';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    let w = 0;
    for (let i = 0; i < s.length; i++) w += s.charCodeAt(i) % 5 + 5;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const SENTENCES = [
  'La terapia ocupacional interviene sobre las actividades de la vida diaria, el juego y la participación social de la persona.',
  'El **razonamiento clínico** combina la evaluación estandarizada con la observación directa del desempeño en el entorno real.',
  'Los marcos de referencia *biomecánico*, *rehabilitador* y *neurodesarrollo* orientan la elección de productos de apoyo.',
  'Una férula de reposo mantiene la articulación en posición funcional y reduce el dolor durante los brotes inflamatorios.',
  'La prevención primaria actúa antes de la aparición de la enfermedad; la secundaria busca el diagnóstico precoz.',
];

function paragraph(seed: number, sentences: number): string {
  const out: string[] = [];
  for (let i = 0; i < sentences; i++) out.push(SENTENCES[(seed + i) % SENTENCES.length]!);
  return out.join(' ');
}

/** A long chapter in the default two-column A4: headings, mixed paragraphs, lists. */
function chapterMarkdown(): string {
  const parts: string[] = ['# Programas de intervención en geriatría', '', paragraph(0, 5), ''];
  for (let i = 1; i <= 40; i++) {
    parts.push(`## Sección ${i}`, '', paragraph(i, 6), '', paragraph(i + 2, 4), '');
    parts.push(`### Detalle ${i}`, '', paragraph(i + 1, 5), '');
    parts.push('- Valoración inicial de la persona y de su entorno.', '- Objetivos consensuados con la persona y la familia.', '- Reevaluación periódica del plan de intervención.', '');
    parts.push(paragraph(i + 3, 3), '');
  }
  return parts.join('\n');
}

const markdown = chapterMarkdown();
const config: PostextConfig = { bodyText: { hyphenation: { locale: 'es' } } };

// No node typings in this package: reach the environment through globalThis.
const nodeProcess = (globalThis as { process?: { env?: Record<string, string | undefined>; stdout: { write(s: string): void } } }).process;

describe.skipIf(!nodeProcess?.env?.BENCH)('chapter layout bench', () => {
  const ROUNDS = 5;
  const median = (xs: number[]): number => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  const time = (fn: () => void): number => {
    const t0 = performance.now();
    fn();
    return performance.now() - t0;
  };

  it('reports cold / warm build time and passes', { timeout: 300_000 }, () => {
    const cold: number[] = [];
    for (let i = 0; i < ROUNDS; i++) cold.push(time(() => buildDocument({ markdown }, config, createMeasurementCache())));
    const warmCache = createMeasurementCache();
    buildDocument({ markdown }, config, warmCache);
    const warm: number[] = [];
    for (let i = 0; i < ROUNDS; i++) warm.push(time(() => buildDocument({ markdown }, config, warmCache)));
    const passes: BuildPassInfo[] = [];
    const doc = buildDocument({ markdown }, config, createMeasurementCache(), { onPass: (p) => passes.push(p) });
    const passMs = passes.map((p) => Math.round(p.ms)).join('/');
    // Written to the process stream: vitest hides console output of passing tests.
    nodeProcess?.stdout.write(
      `[bench] chapter: ${doc.pages.length} pages, ${passes.length} passes (${passMs} ms), iterationCount=${doc.iterationCount}; `
      + `cold median ${Math.round(median(cold))} ms, warm median ${Math.round(median(warm))} ms (${ROUNDS} rounds)\n`,
    );
  });
});
