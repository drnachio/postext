import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { buildFontString, primaryFontFamily, isFontStack } from '../measure/font';
import { collectConfigWarnings } from '../configWarnings';
import { renderToHtml } from '../html-backend';
import type { PostextConfig } from '../types';

// Deterministic text measurement stub (no DOM in the node test env) that
// records the fonts it was asked to measure with.
const measured = new Set<string>();
class StubCtx {
  private f = '';
  get font(): string { return this.f; }
  set font(v: string) { this.f = v; measured.add(v); }
  measureText(s: string): { width: number } {
    return { width: s.length * 5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });

// EF-13: `fontFamily: 'EB Garamond, serif'` used to become the font string
// `… "EB Garamond, serif"` — one family whose name has a comma in it, which
// no face matches, so every renderer fell back to a different font.
describe('font stacks in fontFamily', () => {
  it('set the text in the first family of the stack', () => {
    expect(buildFontString('EB Garamond, serif', 16)).toBe('16px EB Garamond');
    expect(buildFontString("'Source Serif 4', Georgia, serif", 12, '700')).toBe('700 12px "Source Serif 4"');
    expect(buildFontString('"Playfair Display",serif', 10, 'normal', 'italic')).toBe('italic 10px Playfair Display');
    expect(buildFontString('Inter,', 12)).toBe('12px Inter');
  });

  it('leave single families exactly as before', () => {
    expect(buildFontString('EB Garamond', 16)).toBe('16px EB Garamond');
    expect(buildFontString('Source Serif 4', 16)).toBe('16px "Source Serif 4"');
    // A comma inside quotes is part of the name.
    expect(buildFontString('"Foo, Bar"', 16)).toBe('16px "Foo, Bar"');
    expect(primaryFontFamily('"Foo, Bar"')).toBe('"Foo, Bar"');
    expect(isFontStack('"Foo, Bar"')).toBe(false);
    expect(isFontStack('EB Garamond')).toBe(false);
    expect(isFontStack('EB Garamond, serif')).toBe(true);
  });

  it('measure and paint with the first family, and are reported', () => {
    measured.clear();
    const config: PostextConfig = {
      page: { width: pt(300), height: pt(200), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
      bodyText: { fontFamily: 'EB Garamond, Georgia, serif' },
      headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
      chipStyles: [{ id: 'chip', fontFamily: "'Space Mono', monospace" }],
      header: {
        elements: [{
          kind: 'text', id: 'run', content: 'Running head', fontFamily: 'Inter, sans-serif', fontSize: pt(8), overflow: 'ellipsis-end',
          placement: { anchor: { to: 'container', edge: 'bottom-left' }, size: { width: 'auto', height: 'auto' } },
        }],
      },
    };
    const doc = buildDocument({ markdown: 'Body text with a :chip[key] in it.' }, config);
    const p = doc.blocks.find((b) => b.type === 'paragraph')!;
    expect(p.fontString).toMatch(/px EB Garamond$/);
    const chip = p.lines.flatMap((l) => l.segments ?? []).find((s) => s.chip)!;
    expect(chip.chip!.runs[0]!.fontString).toMatch(/px Space Mono$/);
    for (const font of measured) expect(font).not.toContain(',');
    expect(renderToHtml(doc)).not.toMatch(/font:[^;"]*"[^"]*,/);
    expect(doc.configWarnings).toEqual([
      { kind: 'fontFamilyStack', path: 'bodyText.fontFamily', value: 'EB Garamond, Georgia, serif', used: 'EB Garamond' },
      { kind: 'fontFamilyStack', path: 'chipStyles[0].fontFamily', value: "'Space Mono', monospace", used: 'Space Mono' },
      { kind: 'fontFamilyStack', path: 'header.elements[0].fontFamily', value: 'Inter, sans-serif', used: 'Inter' },
    ]);
  });

  it('reports every font-family field, nested partial configs included', () => {
    const warnings = collectConfigWarnings({
      tableStyle: { headerFontFamily: 'A, B' },
      orderedLists: { levels: [{ level: 1, separatorFontFamily: 'C, D' }] },
      htmlViewer: { overrides: { bodyText: { fontFamily: 'E, F' } } },
      bodyText: { fontFamily: 'Single Family' },
    });
    expect(warnings.map((w) => [w.path, w.used])).toEqual([
      ['tableStyle.headerFontFamily', 'A'],
      ['orderedLists.levels[0].separatorFontFamily', 'C'],
      ['htmlViewer.overrides.bodyText.fontFamily', 'E'],
    ]);
    expect(collectConfigWarnings(undefined)).toEqual([]);
    expect(collectConfigWarnings({})).toEqual([]);
  });

  it('matches the configuration docs example', () => {
    const config = { bodyText: { fontFamily: 'EB Garamond, serif' }, orderedLists: { numberFormat: 'roman' as never } };
    const expected = [
      { kind: 'fontFamilyStack', path: 'bodyText.fontFamily', value: 'EB Garamond, serif', used: 'EB Garamond' },
      { kind: 'unknownNumberFormat', path: 'orderedLists.numberFormat', value: 'roman', used: 'arabic' },
    ];
    expect(buildDocument({ markdown: 'Text.' }, config).configWarnings).toEqual(expected);
    expect(collectConfigWarnings(config)).toEqual(expected);
  });

  it('a clean config adds no configWarnings to the document', () => {
    const doc = buildDocument({ markdown: 'Text.' }, { bodyText: { fontFamily: 'EB Garamond' } });
    expect('configWarnings' in doc).toBe(false);
  });
});
