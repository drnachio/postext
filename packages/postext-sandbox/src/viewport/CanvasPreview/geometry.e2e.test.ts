import { describe, expect, it } from 'vitest';
import { buildDocument } from 'postext';
import type { PostextConfig, PostextContent, Resource, VDTDocument } from 'postext';
import { pixelToSourceOffset, xForPlainInLine } from './geometry';

// Font-aware width stub: bold glyphs wider than regular so justified space
// widths are not uniform across a line (as with real fonts).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const per = /bold|700/.test(this.font) ? 9 : 7;
    return { width: s.length * per };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx { return new StubCtx(); }
};

const figure: Resource = {
  id: 'tabla-1-1', typeId: 'figure', kind: 'bitmap', caption: 'x', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'a.png', format: 'png', width: 100, height: 80 },
};

const PARA = 'En la :ref{id="tabla-1-1" case="lower"} se comprueba cómo el concepto de salud ha pasado de ser una condición meramente física y estática a una construcción compleja, dinámica y socialmente determinada. Para comprender la propuesta de la terapia ocupacional comunitaria, es esencial considerar cómo esta disciplina ha ido integrando en su teoría y práctica las distintas concepciones sobre la **salud** y la **discapacidad**.';

const content: PostextContent = {
  markdown: `# Título\n\n${PARA}`,
  resources: [figure],
};
const config: PostextConfig = {
    page: { width: { value: 90, unit: 'mm' }, height: { value: 200, unit: 'mm' } },
    bodyText: {
      textAlign: 'justify',
      firstLineIndent: { value: 4, unit: 'mm' },
      optimalLineBreaking: true,
    },
    locale: 'es',
};

type Block = VDTDocument['blocks'][number];

/** Mirror `renderLine` from the canvas backend: absolute x of every segment. */
function renderedSegmentXs(block: Block, line: Block['lines'][number]): number[] {
  const segs = line.segments ?? [];
  const effectiveWidth = block.bbox.width - (line.bbox.x - block.bbox.x);
  let wordWidth = 0, naturalWidth = 0, spaceCount = 0;
  for (const s of segs) { if (s.kind === 'space') spaceCount++; else wordWidth += s.width; naturalWidth += s.width; }
  const justified = block.textAlign === 'justify' && spaceCount > 0 && (!line.isLastLine || naturalWidth > effectiveWidth);
  const spaceW = justified ? (effectiveWidth - wordWidth) / spaceCount : undefined;
  const xs: number[] = [];
  let x = line.bbox.x;
  for (const s of segs) { xs.push(x); x += s.kind === 'space' ? (spaceW ?? s.width) : s.width; }
  return xs;
}

describe('click → source offset matches the rendered glyph (real pipeline)', () => {
  const doc = buildDocument(content, config);
  const block = doc.blocks.find((b) => b.type === 'paragraph' && b.lines.some((l) => l.segments?.some((s) => s.refResourceId)))!;

  it('lays the paragraph out over several justified lines with the ref on line 1', () => {
    expect(block).toBeDefined();
    expect(block.lines.length).toBeGreaterThan(3);
    expect(block.lines[0]!.segments!.find((s) => s.refResourceId)!.text).toBe('fig.\u00A01.1');
  });

  it('every glyph maps to its own source char, and back to the same x', () => {
    const prefix = block.plainPrefixLen ?? 0;
    const mismatches: string[] = [];
    for (const line of block.lines) {
      const xs = renderedSegmentXs(block, line);
      const segs = line.segments!;
      let cum = 0;
      const yMid = line.bbox.y + line.bbox.height / 2;
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i]!;
        const isLast = i === segs.length - 1;
        const plainLen = seg.refResourceId !== undefined ? 1
          : (isLast && line.hyphenated && seg.text.endsWith('-')) ? seg.text.length - 1 : seg.text.length;
        for (let k = 0; k < plainLen; k++) {
          const plainIdx = line.plainStart! + cum + k;
          const expected = block.sourceMap![plainIdx - prefix];
          const xc = xs[i]! + ((k + 0.25) / plainLen) * seg.width; // left half of the glyph → caret before it
          const got = pixelToSourceOffset(doc, block.pageIndex, xc, yMid);
          const xBack = xForPlainInLine(block, line, cum + k);
          const xExpected = xs[i]! + (k / plainLen) * seg.width;
          if (got !== expected || Math.abs(xBack - xExpected) > 0.5) {
            mismatches.push(`line "${line.text}" seg "${seg.text}" k=${k}: src got ${got} want ${expected} (${JSON.stringify(content.markdown.slice(got ?? 0, (got ?? 0) + 6))} vs ${JSON.stringify(content.markdown.slice(expected!, expected! + 6))}); x back ${xBack.toFixed(1)} want ${xExpected.toFixed(1)}`);
          }
        }
        cum += plainLen;
      }
    }
    expect(mismatches).toEqual([]);
  });
});
