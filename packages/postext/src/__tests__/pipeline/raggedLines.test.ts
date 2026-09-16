import { describe, expect, it } from 'vitest';
import { raggedLooseLines } from '../../pipeline/raggedLines';
import type { VDTLine } from '../../vdt';

const line = (text: string, ratio?: number, isLastLine = false): VDTLine =>
  ({ text, bbox: { x: 0, y: 0, width: 100, height: 12 }, baseline: 10, isLastLine, ...(ratio !== undefined ? { justifiedSpaceRatio: ratio } : {}) }) as VDTLine;

describe('raggedLooseLines', () => {
  it('sets the over-stretched lines of a justified paragraph ragged', () => {
    // A URL breaking at its joints, or a list item whose last word cannot
    // come up: the line the breaker could not fill goes ragged.
    const lines = [line('Ministerio (2014). Estrategia.', 1.2), line('https://www.sanidad.gob.es/profesionales/', 3.4), line('docs/Estrategia.pdf', undefined, true)];
    const out = raggedLooseLines(lines, 'justify');
    expect(out[0]).toBe(lines[0]);
    expect(out[1]!.ragged).toBe(true);
    expect(out[1]!.justifiedSpaceRatio).toBeUndefined();
    expect(out[2]).toBe(lines[2]);
    const item = [line('Aparato musculoesquelético (huesos, articulaciones,', 3.8), line('músculos).', undefined, true)];
    expect(raggedLooseLines(item, 'justify')[0]!.ragged).toBe(true);
  });

  it('leaves ragged paragraphs, last lines and lines within the threshold alone', () => {
    const lines = [line('a b', 3.4), line('c', undefined, true)];
    expect(raggedLooseLines(lines, 'left')).toBe(lines);
    const mild = [line('a b', 2.0), line('c', undefined, true)];
    expect(raggedLooseLines(mild, 'justify')).toBe(mild);
    const edge = [line('a b', 3.0), line('c', undefined, true)];
    expect(raggedLooseLines(edge, 'justify')).toBe(edge);
  });
});
