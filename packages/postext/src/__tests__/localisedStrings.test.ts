import { describe, it, expect } from 'vitest';
import { defaultResourceTypes } from '../defaults/resourceTypes';
import { defaultTableContinuationStrings, resolveTableStyleConfig } from '../defaults/tableStyle';
import { resolveBodyTextConfig } from '../defaults/bodyText';
import { buildDocument } from '../pipeline';
import type { PostextConfig, Resource } from '../types';

// Deterministic text measurement stub (no DOM in the node test env).
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

/** [figure name, plural, short label, caption prefix], then the table's. */
const EXPECTED: Record<string, [string, string, string, string, string, string, string, string]> = {
  en: ['Figure', 'Figures', 'Fig.', 'Figure', 'Table', 'Tables', 'Tab.', 'Table'],
  es: ['Figura', 'Figuras', 'Fig.', 'Figura', 'Tabla', 'Tablas', 'Tabla', 'Tabla'],
  fr: ['Figure', 'Figures', 'Fig.', 'Figure', 'Tableau', 'Tableaux', 'Tabl.', 'Tableau'],
  de: ['Abbildung', 'Abbildungen', 'Abb.', 'Abbildung', 'Tabelle', 'Tabellen', 'Tab.', 'Tabelle'],
  it: ['Figura', 'Figure', 'Fig.', 'Figura', 'Tabella', 'Tabelle', 'Tab.', 'Tabella'],
  pt: ['Figura', 'Figuras', 'Fig.', 'Figura', 'Tabela', 'Tabelas', 'Tab.', 'Tabela'],
  ca: ['Figura', 'Figures', 'Fig.', 'Figura', 'Taula', 'Taules', 'Taula', 'Taula'],
  nl: ['Figuur', 'Figuren', 'Fig.', 'Figuur', 'Tabel', 'Tabellen', 'Tab.', 'Tabel'],
};

const CONTINUATION: Record<string, [string, string]> = {
  en: ['(cont.)', 'Continued'],
  es: ['(cont.)', 'Continúa'],
  fr: ['(suite)', 'À suivre'],
  de: ['(Forts.)', 'Wird fortgesetzt'],
  it: ['(segue)', 'Continua'],
  pt: ['(cont.)', 'Continua'],
  ca: ['(cont.)', 'Continua'],
  nl: ['(vervolg)', 'Wordt vervolgd'],
};

describe('built-in strings in every bundled language', () => {
  it('resource types', () => {
    for (const [lang, e] of Object.entries(EXPECTED)) {
      const [figure, table] = defaultResourceTypes(lang);
      expect([figure!.name, figure!.namePlural, figure!.shortLabel, figure!.captionPrefix], lang).toEqual(e.slice(0, 4));
      expect([table!.name, table!.namePlural, table!.shortLabel, table!.captionPrefix], lang).toEqual(e.slice(4));
      // Numbering does not depend on the language.
      expect(figure!.numberingTemplate).toBe('{h1}.{n}');
      expect(table!.resetOn).toBe('h1');
    }
  });

  it('table continuation strings', () => {
    for (const [lang, [suffix, marker]] of Object.entries(CONTINUATION)) {
      expect(defaultTableContinuationStrings(lang), lang).toEqual({ continuedSuffix: suffix, continuesMarker: marker });
    }
  });

  it('region-tagged locales use their language; others fall back to English', () => {
    expect(defaultResourceTypes('de-AT')[0]!.name).toBe('Abbildung');
    expect(defaultResourceTypes('pt_BR')[1]!.name).toBe('Tabela');
    expect(defaultResourceTypes('en-us')[0]!.name).toBe('Figure');
    expect(defaultResourceTypes('sv')[0]!.name).toBe('Figure');
    expect(defaultTableContinuationStrings('nl-BE').continuesMarker).toBe('Wordt vervolgd');
    expect(defaultTableContinuationStrings('fr_CA').continuedSuffix).toBe('(suite)');
    expect(defaultTableContinuationStrings('sv').continuesMarker).toBe('Continued');
  });

  it('table continuation strings follow the document locale when unset', () => {
    const body = resolveBodyTextConfig(undefined, 'de');
    expect(resolveTableStyleConfig(undefined, body, 'de').continuesMarker).toBe('Wird fortgesetzt');
    expect(resolveTableStyleConfig(undefined, resolveBodyTextConfig(undefined, 'it')).continuedSuffix).toBe('(segue)');
  });
});

const figure = (id: string): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'A test figure.',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 100, height: 80 },
});

/** The label of the first `:ref` in the document, with the no-break space
 *  between label and number read as a plain space. */
const refLabel = (config?: PostextConfig, markdown = 'See :ref{id="fig-a" style="full"}.'): string | undefined => {
  const doc = buildDocument({ markdown, resources: [figure('fig-a')] }, config);
  for (const block of doc.blocks) {
    for (const line of block.lines) {
      const seg = (line.segments ?? []).find((s) => s.refResourceId === 'fig-a');
      if (seg) return seg.text.replace(/\u00A0/g, ' ');
    }
  }
  return undefined;
};

describe('buildDocument localises the built-in resource types', () => {
  it('from config.locale when resourceTypes is not given', () => {
    expect(refLabel()).toBe('Figure 1');
    expect(refLabel({ locale: 'es' })).toBe('Figura 1');
    expect(refLabel({ locale: 'de' })).toBe('Abbildung 1');
    expect(refLabel({ locale: 'nl' }, 'See :ref{id="fig-a"}.')).toBe('Fig. 1');
    expect(refLabel({ locale: 'pt-BR' })).toBe('Figura 1');
  });

  it('else from the hyphenation locale, like the table continuation strings', () => {
    expect(refLabel({ bodyText: { hyphenation: { locale: 'fr' } } })).toBe('Figure 1');
    expect(refLabel({ bodyText: { hyphenation: { locale: 'it' } } })).toBe('Figura 1');
    // config.locale is the document language and wins.
    expect(refLabel({ locale: 'de', bodyText: { hyphenation: { locale: 'it' } } })).toBe('Abbildung 1');
  });

  it('explicit resourceTypes always win', () => {
    expect(refLabel({ locale: 'es', resourceTypes: defaultResourceTypes('en') })).toBe('Figure 1');
  });

  it('the caption prefix follows too', () => {
    const doc = buildDocument(
      { markdown: 'See :ref{id="fig-a"}.\n\n::resource{id="fig-a"}\n', resources: [figure('fig-a')] },
      { locale: 'de' },
    );
    const texts = doc.pages.flatMap((p) => [
      ...p.columns.flatMap((c) => c.blocks),
      ...(p.floats ?? []),
    ]).flatMap((b) => (b.resourceBlock?.captionLines ?? []).map((l) => l.text));
    expect(texts.join(' ').replace(/\u00A0/g, ' ')).toContain('Abbildung 1.');
  });
});
