import { describe, it, expect } from 'vitest';
import Hypher from 'hypher';
import es from 'hyphenation.es';
import { hyphenateText } from '../hyphenate';

describe('hyphenateText', () => {
  it('matches the dictionary applied to the whole text', () => {
    const reference = new Hypher(es);
    const texts = [
      'La composición tipográfica editorial exige columnas alineadas y márgenes consistentes.',
      'Reevaluación   periódica\tdel plan; intervención (geriátrica) — enseñanza-aprendizaje.',
      'Visita https://ejemplo.org/ruta/larga y a/b y termina/',
      '  espacios al principio y al final  ',
    ];
    for (const text of texts) {
      expect(hyphenateText(text, 'es')).toBe(reference.hyphenateText(text));
      // Second call: from the memo.
      expect(hyphenateText(text, 'es')).toBe(reference.hyphenateText(text));
    }
  });
});
