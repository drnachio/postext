import { describe, expect, it } from 'vitest';
import { raggedUrlLines } from '../../pipeline/raggedUrl';
import type { VDTLine } from '../../vdt';

const line = (text: string, ratio?: number, isLastLine = false): VDTLine =>
  ({ text, bbox: { x: 0, y: 0, width: 100, height: 12 }, baseline: 10, isLastLine, ...(ratio !== undefined ? { justifiedSpaceRatio: ratio } : {}) }) as VDTLine;

describe('raggedUrlLines', () => {
  const text = 'Ministerio (2014). Estrategia. https://www.sanidad.gob.es/profesionales/docs/Estrategia.pdf';

  it('sets the over-stretched lines of a URL-bearing justified paragraph ragged', () => {
    const lines = [line('Ministerio (2014). Estrategia.', 1.2), line('https://www.sanidad.gob.es/profesionales/', 3.4), line('docs/Estrategia.pdf', undefined, true)];
    const out = raggedUrlLines(lines, 'justify', text);
    expect(out[0]).toBe(lines[0]);
    expect(out[1]!.ragged).toBe(true);
    expect(out[1]!.justifiedSpaceRatio).toBeUndefined();
    expect(out[2]).toBe(lines[2]);
  });

  it('leaves paragraphs without a URL, ragged paragraphs and mild lines alone', () => {
    const lines = [line('a b', 3.4), line('c', undefined, true)];
    expect(raggedUrlLines(lines, 'justify', 'plain words only')).toBe(lines);
    expect(raggedUrlLines(lines, 'left', text)).toBe(lines);
    const mild = [line('a b', 2.0), line('c', undefined, true)];
    expect(raggedUrlLines(mild, 'justify', text)).toBe(mild);
  });
});
