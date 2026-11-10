import { describe, it, expect, afterEach } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache, buildFontString, setSymbolFont, symbolFont, withSymbolFont, evictFontFamilies } from '../../measure/index.js';
import { measureTextWidth } from '../../measure/canvas.js';
import { registerFontCoverage, forgetFontCoverage, glyphFallbacks } from '../../fonts/glyphFallback.js';
import { glyphFallbackPlaces } from '../../fonts/glyphPlaces.js';
import { quoteFontString, quoteCssFamily } from '../../html-backend/styles.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import { stableStringify } from '../../util/stableHash.js';
import type { PostextConfig, VDTDocument } from '../../index.js';

// #1460: the symbol font is a measuring setting of a build, saved and put
// back like the others; a config without one lays out as before; HTML
// quotes every family; the width cache drops a font string when any family
// it lists changes; warnings know what the symbol font draws.

let measured = 0;
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    measured++;
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
const MD = '# Título\n\nSi la hipótesis nula incluye A, la alternativa incluye ℵ; obsérvese que A ∪ ℵ = U.\n\n- Un punto con *énfasis* y **fuerza**.';
const build = (config: PostextConfig): VDTDocument => buildDocument({ markdown: MD }, config, createMeasurementCache());

afterEach(() => {
  forgetFontCoverage();
  setSymbolFont(undefined);
});

describe('the symbol font as a setting of the build', () => {
  it('is put back after a build, as the build found it', () => {
    setSymbolFont('Antes');
    build({ ...base, symbolFont: 'Simbolos' });
    expect(symbolFont()).toBe('Antes');
    expect(buildFontString('Minion Pro', 12)).toBe('12px Minion Pro, Antes');
    build(base);
    expect(symbolFont()).toBe('Antes');
    setSymbolFont(undefined);
    build({ ...base, symbolFont: 'Simbolos' });
    expect(symbolFont()).toBeUndefined();
    expect(buildFontString('Minion Pro', 12)).toBe('12px Minion Pro');
  });

  it('is set for a font string made outside a build by withSymbolFont, and put back', () => {
    expect(withSymbolFont('STIX Two Math', () => buildFontString('Lora', 10))).toBe('10px Lora, STIX Two Math');
    expect(symbolFont()).toBeUndefined();
    setSymbolFont('Antes');
    expect(() => withSymbolFont('Otra', () => { throw new Error('x'); })).toThrow('x');
    expect(symbolFont()).toBe('Antes');
    expect(withSymbolFont(undefined, () => buildFontString('Lora', 10))).toBe('10px Lora');
  });

  it('changes nothing when unset: the same resolved config and the same pages', () => {
    const plain = build(base);
    // An empty name is no symbol font, and one left by an earlier caller
    // does not reach a build that names none.
    const blank = build({ ...base, symbolFont: '  ' });
    setSymbolFont('Fuga');
    const leaked = build(base);
    setSymbolFont(undefined);
    expect('symbolFont' in resolveAllConfig(base)).toBe(false);
    expect(stableStringify(resolveAllConfig({ ...base, symbolFont: '' }))).toBe(stableStringify(resolveAllConfig(base)));
    const pages = (d: VDTDocument) => stableStringify(d.pages);
    expect(pages(blank)).toBe(pages(plain));
    expect(pages(leaked)).toBe(pages(plain));
    // No font string of the document lists a second family.
    expect(JSON.stringify(plain.pages)).not.toMatch(/px [^"]*?, /);
    expect(plain.blocks.every((b) => !b.fontString.includes(','))).toBe(true);
  });
});

describe('the width cache and a font string that lists several families', () => {
  it('drops the widths of a string when its symbol font changes', () => {
    const font = '12px Texto, Simbolos';
    measureTextWidth('ℵ∪', font);
    const before = measured;
    measureTextWidth('ℵ∪', font);
    expect(measured).toBe(before);
    evictFontFamilies(['Simbolos']);
    measureTextWidth('ℵ∪', font);
    expect(measured).toBe(before + 1);
    // A string that does not list it keeps its widths.
    measureTextWidth('ab', '12px Texto');
    const kept = measured;
    evictFontFamilies(['Simbolos']);
    measureTextWidth('ab', '12px Texto');
    expect(measured).toBe(kept);
  });
});

describe('every family quoted in HTML', () => {
  it('quotes a figure-style family, a dotted name and a generic one bare', () => {
    expect(quoteFontString('12px Lora@onum')).toBe("12px 'Lora@onum'");
    expect(quoteFontString('italic 700 12px "Optima 105", serif')).toBe("italic 700 12px 'Optima 105', serif");
    expect(quoteFontString('12px Font.Sans')).toBe("12px 'Font.Sans'");
    expect(quoteCssFamily('math')).toBe('math');
  });

  it('escapes what a CSS string and a double-quoted attribute cannot hold', () => {
    expect(quoteCssFamily("Bob's Serif")).toBe("'Bob\\'s Serif'");
    expect(quoteCssFamily('Back\\slash')).toBe("'Back\\\\slash'");
    expect(quoteCssFamily('A "B"')).toBe("'A \\22 B\\22 '");
    expect(quoteCssFamily('<script>&')).toBe("'\\3c script\\3e \\26 '");
    // Nothing that ends the attribute or opens a tag gets through.
    const font = quoteFontString(buildFontString('Evil" onmouseover="x <b>', 12));
    expect(font).not.toMatch(/["<>&]/);
    expect(quoteFontString('12px "Ho\\"me", <x>')).not.toMatch(/["<>&]/);
  });
});

describe('the warnings and the symbol font', () => {
  it('advises no family for what the symbol font draws, and names what nothing draws', () => {
    registerFontCoverage('Texto', 400, 'normal', [[0x20, 0x7e], [0xa0, 0x24f]]);
    registerFontCoverage('Simbolos', 400, 'normal', [[0x20, 0x7e], [0x222a, 0x222a]]);
    const doc = build({ ...base, symbolFont: 'Simbolos' });
    const g = glyphFallbacks(doc, { symbolFont: 'Simbolos' });
    expect(g.flatMap((w) => w.characters)).toEqual(['ℵ']);
    expect(glyphFallbacks(doc).flatMap((w) => w.characters).sort()).toEqual(['ℵ', '∪'].sort());
    // The build's own warnings do the same.
    const own = (doc.contentWarnings ?? []).filter((w) => w.kind === 'glyphFallback');
    expect(own.flatMap((w) => (w.kind === 'glyphFallback' ? w.characters : []))).toEqual(['ℵ']);
  });

  it('finds the symbol font in its regular face for bold text, and names each block', () => {
    registerFontCoverage('Texto', 400, 'normal', [[0x20, 0x7e], [0xa0, 0x24f]]);
    registerFontCoverage('Texto', 700, 'normal', [[0x20, 0x7e], [0xa0, 0x24f]]);
    registerFontCoverage('Simbolos', 400, 'normal', [[0x20, 0x7e], [0x2135, 0x2135], [0x222a, 0x222a]]);
    const md = 'Uno **A ∪ B**.\n\nDos ℵ.';
    const doc = buildDocument({ markdown: md }, { ...base, symbolFont: 'Simbolos' }, createMeasurementCache());
    const places = glyphFallbackPlaces(doc, { symbolFont: 'Simbolos' });
    expect(places.map((p) => [p.weight, p.characters, p.supplier])).toEqual([[700, ['∪'], 'Simbolos'], [400, ['ℵ'], 'Simbolos']]);
    expect(new Set(places.map((p) => p.blockId)).size).toBe(2);
    expect(places.every((p) => doc.blocks.some((b) => b.id === p.blockId))).toBe(true);
  });
});
