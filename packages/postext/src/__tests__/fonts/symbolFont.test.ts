import { describe, it, expect, afterEach } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache, buildFontString, setSymbolFont } from '../../measure/index.js';
import { registerFontCoverage, forgetFontCoverage } from '../../fonts/glyphFallback.js';
import { fontStringFamilies } from '../../measure/fontString.js';
import { quoteFontString } from '../../html-backend/styles.js';
import type { ContentWarning, PostextConfig, VDTDocument } from '../../index.js';

// The symbol font (`symbolFont`): every font string lists it
// after its own family, and the paragraphs that set characters the text
// face lacks are reported where they are (`glyphFallbackAt`).

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
const base: PostextConfig = {
  page: { dpi: 72, width: pt(300), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Texto', hyphenation: { enabled: false } },
};
const MD = 'Si la hipótesis nula incluye A, la alternativa incluye ℵ; obsérvese que A ∪ ℵ = U.\n\nUn párrafo sin símbolos.';

const build = (config: PostextConfig): VDTDocument => buildDocument({ markdown: MD }, config, createMeasurementCache());
const at = (doc: VDTDocument) => (doc.contentWarnings ?? []).filter((w): w is Extract<ContentWarning, { kind: 'glyphFallbackAt' }> => w.kind === 'glyphFallbackAt');

describe('the symbol font', () => {
  afterEach(() => {
    forgetFontCoverage();
    setSymbolFont(undefined);
  });

  it('is listed after the family in every font string built while it is set', () => {
    setSymbolFont('STIX Two Math');
    expect(buildFontString('Minion Pro', 12)).toBe('12px Minion Pro, STIX Two Math');
    expect(fontStringFamilies(buildFontString('Minion Pro', 12, '700'))).toEqual(['Minion Pro', 'STIX Two Math']);
    setSymbolFont(undefined);
    expect(buildFontString('Minion Pro', 12)).toBe('12px Minion Pro');
  });

  it('is quoted family by family in HTML', () => {
    expect(quoteFontString('700 12px Minion Pro, "STIX Two Math"')).toBe("700 12px 'Minion Pro', 'STIX Two Math'");
    expect(quoteFontString('12px Lora, Simbolos')).toBe("12px 'Lora', 'Simbolos'");
    expect(quoteFontString('12px Minion Pro')).toBe("12px 'Minion Pro'");
  });

  it('reaches the text of a build that names it, and is cleared by one that does not', () => {
    const doc = build({ ...base, symbolFont: 'Simbolos' });
    expect(doc.blocks[0]!.fontString).toContain(', Simbolos');
    expect(build(base).blocks[0]!.fontString).not.toContain('Simbolos');
  });

  it('reports the paragraph that sets characters the face lacks, and who draws them', () => {
    registerFontCoverage('Texto', 400, 'normal', [[0x20, 0x7e], [0xa0, 0x24f]]);
    registerFontCoverage('Simbolos', 400, 'normal', [[0x20, 0x7e], [0x2135, 0x2135], [0x222a, 0x222a]]);
    const plain = at(build(base));
    expect(plain).toHaveLength(1);
    expect(plain[0]!.characters).toEqual(['ℵ', '∪']);
    expect(plain[0]!.supplier).toBeUndefined();
    expect(plain[0]!.pageIndex).toBe(0);
    expect(MD.slice(plain[0]!.sourceStart, plain[0]!.sourceEnd)).toContain('A ∪ ℵ = U');
    const withSymbols = at(build({ ...base, symbolFont: 'Simbolos' }));
    expect(withSymbols).toHaveLength(1);
    expect(withSymbols[0]!.supplier).toBe('Simbolos');
  });

  it('keeps apart what the symbol font draws and what no family has', () => {
    registerFontCoverage('Texto', 400, 'normal', [[0x20, 0x7e], [0xa0, 0x24f]]);
    registerFontCoverage('Simbolos', 400, 'normal', [[0x20, 0x7e], [0x222a, 0x222a]]);
    const found = at(build({ ...base, symbolFont: 'Simbolos' }));
    expect(found.map((w) => [w.characters, w.supplier])).toEqual([[['ℵ'], undefined], [['∪'], 'Simbolos']]);
  });
});
