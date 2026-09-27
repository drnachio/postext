import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import type { DesignElement, PostextConfig } from '../types';
import type { VDTDesignSlot, VDTDesignTextBlock, VDTDocument } from '../vdt';

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

const pt = (value: number) => ({ value, unit: 'pt' as const });

const label = (content: string, textTransform: 'none' | 'uppercase' = 'none'): DesignElement => ({
  kind: 'text', id: 'label', content, fontSize: pt(8), overflow: 'ellipsis-end', textTransform,
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill', height: 'auto' } },
});

const PLACEHOLDERS = 'N={number}|D={numberDecimal}|R={numberRoman}|r={numberRomanLower}|A={numberAlpha}|a={numberAlphaLower}|C={chapterNumber}';

const page = { width: pt(360), height: pt(240), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } };

const slotText = (slot: VDTDesignSlot | undefined): string =>
  (slot?.blocks ?? []).filter((b): b is VDTDesignTextBlock => b.kind === 'text').map((b) => b.lines.map((l) => l.text).join(' ')).join(' | ');

const openerTexts = (doc: VDTDocument): string[] =>
  doc.pages.map((p) => slotText(p.openerBand)).filter((t) => t.length > 0);

describe('numeric placeholders in heading designs (EF-09)', () => {
  it('prints the heading counter in every numeral format in a chapter opener', () => {
    const config: PostextConfig = {
      page,
      headings: {
        levels: [{
          level: 1, span: 'page', numberingTemplate: '{1:I}', breakBefore: { enabled: true, parity: 'any' },
          advancedDesign: { enabled: true, slot: { elements: [label(PLACEHOLDERS)] } },
        }],
      },
    };
    const doc = buildDocument({ markdown: '# One\n\nText.\n\n# Two\n\nText.\n\n# Three\n\nText.' }, config);
    expect(openerTexts(doc)).toEqual([
      'N=I|D=1|R=I|r=i|A=A|a=a|C=I',
      'N=II|D=2|R=II|r=ii|A=B|a=b|C=II',
      'N=III|D=3|R=III|r=iii|A=C|a=c|C=III',
    ]);
  });

  it('prints the counter of an in-column heading design, without a numbering template too', () => {
    const config: PostextConfig = {
      page,
      headings: {
        levels: [
          { level: 1, breakBefore: { enabled: false } },
          { level: 2, advancedDesign: { enabled: true, slot: { elements: [label('§{numberDecimal} {numberRomanLower} {titleText}')] } } },
        ],
      },
    };
    const doc = buildDocument({ markdown: '# Part\n\n## First\n\nText.\n\n## Second\n\nText.' }, config);
    const overlays = doc.blocks.filter((b) => b.headingLevel === 2).map((b) => slotText(b.designOverlay));
    expect(overlays).toEqual(['§1 i First', '§2 ii Second']);
  });

  it('continues the counter across chapters and stays empty for unnumbered headings', () => {
    const config: PostextConfig = {
      page,
      headings: {
        levels: [{
          level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
          advancedDesign: { enabled: true, slot: { elements: [label('[{numberRoman}] {titleText}')] } },
        }],
      },
      headingStyles: [{ id: 'front', numbered: false }],
    };
    const doc = buildDocument(
      { markdown: '# Preface {style="front"}\n\nText.\n\n# Four\n\nText.', continuation: { headings: { h1: 3, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } } },
      config,
    );
    expect(openerTexts(doc)).toEqual(['[] Preface', '[IV] Four']);
  });

  it('spells the counter out with {numberWords} and {numberOrdinalWords} in the document language', () => {
    const design = (locale: string): PostextConfig => ({
      page,
      locale: locale as PostextConfig['locale'],
      headings: {
        levels: [{
          level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
          advancedDesign: {
            enabled: true,
            slot: { elements: [label('{numberWords}/{numberWordsLower}/{numberOrdinalWords}/{numberOrdinalWordsLower}')] },
          },
        }],
      },
    });
    const markdown = '# A\n\nText.\n\n# B\n\nText.';
    expect(openerTexts(buildDocument({ markdown }, design('en-us'))))
      .toEqual(['One/one/First/first', 'Two/two/Second/second']);
    expect(openerTexts(buildDocument({ markdown }, design('es'))))
      .toEqual(['Uno/uno/Primero/primero', 'Dos/dos/Segundo/segundo']);
  });

  it('sets a spelled-out ordinal in capitals with the element’s textTransform', () => {
    const config: PostextConfig = {
      page,
      locale: 'es',
      headings: {
        levels: [{
          level: 1, span: 'page', numberingTemplate: '{1}.', breakBefore: { enabled: true, parity: 'any' },
          advancedDesign: { enabled: true, slot: { elements: [label('Capítulo {numberOrdinalWordsLower}', 'uppercase')] } },
        }],
      },
    };
    expect(openerTexts(buildDocument({ markdown: '# Uno\n\nTexto.' }, config))).toEqual(['CAPÍTULO PRIMERO']);
  });
});
