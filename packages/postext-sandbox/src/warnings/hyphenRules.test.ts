import { describe, expect, it } from 'vitest';
import { buildDocument, findHyphenFaults } from 'postext';
import type { HyphenationConfig, PostextConfig } from 'postext';
import { computeWarnings } from './compute.js';
import { warningCategory } from './categories.js';
import { detailFor, titleFor } from '../sidebar/WarningsPanel.js';
import { DEFAULT_LABELS } from '../types/defaultLabels.js';

// #1466: under `hyphenation.ladders` and `hyphenation.lastWord` on 'warn'
// each hyphen ladder and each divided last word is a row of the Review
// panel, by its page.

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
const config = (width: number, hyphenation: HyphenationConfig): PostextConfig => ({
  locale: 'es',
  page: { width: pt(width), height: pt(20000), dpi: 72, margins: { top: pt(0), bottom: pt(0), left: pt(0), right: pt(0) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { firstLineIndent: pt(0), textAlign: 'justify', hyphenation },
});
const markdown =
  'Diversos estudios han demostrado que la intervención multidisciplinaria, coordinada entre el médico de atención primaria, el fisioterapeuta y el psicólogo, mejora significativamente la calidad de vida y reduce el consumo de analgésicos.';

describe('hyphen rules in the warnings panel (#1466)', () => {
  it('lists every ladder and divided last word the layout finds, by page', () => {
    let ladders = 0;
    let lastWords = 0;
    for (let w = 100; w <= 300; w += 4) {
      const c = config(w, { ladders: 'warn', lastWord: 'warn' });
      const doc = buildDocument({ markdown }, c);
      const rows = computeWarnings({ markdown, config: c, doc });
      const ladderRows = rows.filter((r) => r.payload.kind === 'hyphenLadder');
      const lastRows = rows.filter((r) => r.payload.kind === 'lastWordDivided');
      const faults = findHyphenFaults(doc);
      expect(ladderRows.length, `${w}`).toBe(faults.filter((f) => f.kind === 'ladder').length);
      expect(lastRows.length, `${w}`).toBe(faults.filter((f) => f.kind === 'lastWord').length);
      for (const r of [...ladderRows, ...lastRows]) expect(r.payload).toMatchObject({ page: 1 });
      ladders += ladderRows.length;
      lastWords += lastRows.length;
    }
    expect(ladders).toBeGreaterThan(0);
    expect(lastWords).toBeGreaterThan(0);
  });

  it('lists nothing while the rules allow them', () => {
    const c = config(150, {});
    const doc = buildDocument({ markdown }, c);
    expect(computeWarnings({ markdown, config: c, doc }).filter((r) => r.payload.kind === 'hyphenLadder' || r.payload.kind === 'lastWordDivided')).toEqual([]);
  });

  it('files them with the typesetting rules and prints their titles and details', () => {
    expect(warningCategory('hyphenLadder')).toBe(warningCategory('stack'));
    expect(warningCategory('lastWordDivided')).toBe(warningCategory('stack'));
    const ladder = { kind: 'hyphenLadder' as const, page: 3, lines: 3, max: 1 };
    expect(titleFor(ladder, DEFAULT_LABELS)).toBe('Hyphen ladder');
    expect(detailFor(ladder, DEFAULT_LABELS)).toContain('page 3 · 3 lines in a row end on a hyphen, more than 1');
    const last = { kind: 'lastWordDivided' as const, page: 2, word: 'analgé-sicos' };
    expect(titleFor(last, DEFAULT_LABELS)).toBe('Last word divided');
    expect(detailFor(last, DEFAULT_LABELS)).toContain('page 2 · the paragraph ends on “analgé-sicos”');
  });
});
