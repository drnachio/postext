import { afterEach, describe, expect, it } from 'vitest';
import { buildDocument, forgetFontCoverage, registerFontCoverage } from 'postext';
import type { PostextConfig, Resource } from 'postext';
import { computeWarnings } from './compute.js';
import { warningCategory } from './categories.js';
import type { WarningPayload } from './types.js';
import { glyphMarks, MISSING_GLYPH_FILL, SUPPLIED_GLYPH_FILL } from '../viewport/canvas/CanvasPreview/glyphMarks.js';

// the paragraph that sets characters its face lacks
// (`glyphFallbackAt`) is listed under Fonts with its place, apart for what
// the symbol font draws and what nothing draws, and those characters are
// marked on the page.

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

afterEach(() => forgetFontCoverage());

const base: PostextConfig = { header: { elements: [] }, footer: { elements: [] }, bodyText: { fontFamily: 'Subset Sans' }, headings: { fontFamily: 'Subset Sans' }, symbolFont: 'Simbolos' };
const MD = 'Texto previo.\n\nObsérvese que A ∪ ℵ = U.';

describe('glyphFallbackAt in the Checks panel', () => {
  it('points at the paragraph, the symbol font\'s characters apart', () => {
    registerFontCoverage('Subset Sans', 400, 'normal', [[0x20, 0x7e], [0xa0, 0xff]]);
    registerFontCoverage('Simbolos', 400, 'normal', [[0x20, 0x7e], [0x222a, 0x222a]]);
    const doc = buildDocument({ markdown: MD }, base);
    const found = computeWarnings({ markdown: MD, config: base, doc })
      .filter((w): w is typeof w & { payload: Extract<WarningPayload, { kind: 'glyphFallbackAt' }> } => w.payload.kind === 'glyphFallbackAt');
    expect(found.map((w) => [w.payload.characters, w.payload.supplier])).toEqual([[['∪'], 'Simbolos'], [['ℵ'], undefined]]);
    expect(found[0]!.line).toBe(3);
    expect(MD.slice(found[0]!.sourceStart, found[0]!.sourceEnd)).toContain('A ∪ ℵ = U');
    expect(new Set(found.map((w) => w.id)).size).toBe(2);
    expect(warningCategory('glyphFallbackAt')).toBe('fonts');
    // On the page: one band per character, red where nothing draws it.
    const marks = glyphMarks(doc, 0, false);
    expect(marks.map((m) => m.fill)).toEqual([SUPPLIED_GLYPH_FILL, MISSING_GLYPH_FILL]);
    expect(marks[0]!.x).toBeLessThan(marks[1]!.x);
    // Each names its block (#1460), and marks only that block.
    expect(found.every((w) => w.payload.blockId !== undefined)).toBe(true);
    expect(new Set(marks.map((m) => m.block.id))).toEqual(new Set(found.map((w) => w.payload.blockId)));
  });

  it('tells apart two cells with no source range of their own, and marks the characters in them', () => {
    registerFontCoverage('Subset Sans', 400, 'normal', [[0x20, 0x7e], [0xa0, 0xff]]);
    registerFontCoverage('Subset Sans', 700, 'normal', [[0x20, 0x7e], [0xa0, 0xff]]);
    registerFontCoverage('Simbolos', 400, 'normal', [[0x20, 0x7e], [0x222a, 0x222a]]);
    const table = (id: string): Resource => ({
      id, typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
      table: { model: { headerRowCount: 0, rows: [[{ content: 'A ∪ B' }, { content: 'C' }]] } },
    } as Resource);
    const md = 'Antes.\n\n::resource{id="t1"}\n\n::resource{id="t2"}\n\nDespués.';
    const doc = buildDocument({ markdown: md, resources: [table('t1'), table('t2')] }, base);
    const found = computeWarnings({ markdown: md, config: base, doc, resources: [table("t1"), table("t2")] })
      .filter((w) => w.payload.kind === 'glyphFallbackAt');
    expect(found).toHaveLength(2);
    expect(new Set(found.map((w) => w.id)).size).toBe(2);
    const marks = doc.pages.flatMap((_, i) => glyphMarks(doc, i, false));
    expect(marks).toHaveLength(2);
    expect(marks.every((m) => m.block.resourceBlock !== undefined && m.fill === SUPPLIED_GLYPH_FILL)).toBe(true);
  });
});
