import { describe, expect, it } from 'vitest';
import { buildDocument, mapInlineSnippet } from 'postext';
import type { PostextConfig, Resource, VDTDocument } from 'postext';
import { resourceBlocksOnPage } from './geometry';
import { resolveResourceRun, resourceTextAtPixel, xForPlainInResourceLine } from './resourceHit';

// EF-95: a caption or a note broken with `\\` (or a backslash ending a line)
// still maps every painted glyph back to its own char of the snippet, so
// click-to-edit lands where the author clicked, on every line.

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

const CAPTION = 'First *line* here \\\\ Second line';
const NOTE = '¹ One note.\\\n² Two **notes**.';
const figure: Resource = {
  id: 'fig', typeId: 'figure', kind: 'bitmap', caption: CAPTION, note: NOTE, createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'a.png', format: 'png', width: 100, height: 80 },
  placement: { position: 'here' },
};
const config: PostextConfig = { page: { width: { value: 160, unit: 'mm' }, height: { value: 200, unit: 'mm' } } };

describe('click-to-edit on a caption and a note with forced breaks', () => {
  const doc: VDTDocument = buildDocument({ markdown: 'Text.\n\n::resource{id="fig"}\n\nMore.', resources: [figure] }, config);
  const page = doc.pages.find((p) => resourceBlocksOnPage(doc, p.index).length > 0)!;
  const rb = resourceBlocksOnPage(doc, page.index)[0]!.resourceBlock!;

  it('lays the caption and the note out on two lines each', () => {
    expect(rb.captionLines).toHaveLength(2);
    expect(rb.noteLines).toHaveLength(2);
  });

  for (const kind of ['caption', 'note'] as const) {
    it(`maps every glyph of the ${kind} to its own snippet char`, () => {
      const snippet = kind === 'caption' ? CAPTION : NOTE;
      const { text: plain, sourceMap } = mapInlineSnippet(snippet);
      const run = resolveResourceRun(rb, { kind })!;
      const mismatches: string[] = [];
      for (let li = 0; li < run.lines.length; li++) {
        const line = run.lines[li]!;
        const st = run.stamped[li]!;
        const yMid = line.bbox.y + line.bbox.height / 2;
        for (let p = st.plainStart; p < st.plainEnd; p++) {
          const x0 = xForPlainInResourceLine(line, st, p);
          const x1 = xForPlainInResourceLine(line, st, p + 1);
          if (x1 - x0 < 1e-6) continue; // the caption label consumes no char
          const hit = resourceTextAtPixel(doc, page.index, x0 + (x1 - x0) * 0.25, yMid);
          if (!hit || hit.target.kind !== kind || hit.offset !== sourceMap[p]) {
            mismatches.push(`${kind} line ${li} plain ${p} (${JSON.stringify(plain[p])}) → ${JSON.stringify(hit)} expected ${sourceMap[p]}`);
          }
        }
      }
      expect(mismatches).toEqual([]);
      // The second line starts right after the break in the snippet.
      const second = run.stamped[1]!;
      const firstChar = snippet.slice(sourceMap[second.plainStart]!).trimStart()[0];
      expect(firstChar).toBe(kind === 'caption' ? 'S' : '²');
    });
  }
});
