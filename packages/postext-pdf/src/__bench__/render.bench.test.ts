/**
 * Cost of writing a long chapter to PDF: ms per page, and the share of
 * the phases. Skipped by `pnpm test`; run with `pnpm bench` (BENCH=1).
 * Profile with `node --cpu-prof ./node_modules/vitest/vitest.mjs run
 * __bench__ --pool threads` (BENCH=1).
 */
import { describe, it } from 'vitest';
import fs from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);
const face = fontkit.create(fontBytes);

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const sizePx = parseFontString(this.font)?.sizePx ?? 16;
    const run = face.layout(s);
    return { width: (run.advanceWidth / face.unitsPerEm) * sizePx };
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

const nodeProcess = (globalThis as { process?: { env?: Record<string, string | undefined>; stdout: { write(s: string): void } } }).process;

describe.skipIf(!nodeProcess?.env?.BENCH)('pdf render bench', () => {
  it('reports ms per page and phase shares', { timeout: 600_000 }, async () => {
    const config: PostextConfig = { bodyText: { fontFamily: 'Lora', hyphenation: { locale: 'es' } } };
    const doc = buildDocument({ markdown: chapterMarkdown() }, config);
    const rounds = 3;
    const times: number[] = [];
    let phases = '';
    for (let r = 0; r < rounds; r++) {
      let lastPhase = '';
      let lastAt = performance.now();
      const marks: string[] = [];
      const t0 = performance.now();
      const bytes = await renderToPdf(doc, {
        fontProvider,
        onProgress: (p) => {
          if (p.phase !== lastPhase) {
            const now = performance.now();
            if (lastPhase) marks.push(`${lastPhase}=${Math.round(now - lastAt)}`);
            lastPhase = p.phase;
            lastAt = now;
          }
        },
      });
      const total = performance.now() - t0;
      marks.push(`${lastPhase}=${Math.round(performance.now() - lastAt)}`);
      times.push(total);
      phases = `${marks.join(' ')} kb=${Math.round(bytes.byteLength / 1024)}`;
    }
    const median = times.slice().sort((a, b) => a - b)[Math.floor(rounds / 2)]!;
    nodeProcess?.stdout.write(
      `[bench] render: ${doc.pages.length} pages, median ${Math.round(median)} ms (${Math.round(median / doc.pages.length)} ms/page); phases ${phases}\n`,
    );
  });
});
