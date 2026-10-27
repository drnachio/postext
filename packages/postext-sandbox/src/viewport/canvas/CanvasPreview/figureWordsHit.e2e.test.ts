/**
 * A caption a `:::figure` gives in its own words (#935) is selected in the
 * Markdown, where it is written, not in the resource's caption field.
 */
import { describe, expect, it } from 'vitest';
import { buildDocument } from 'postext';
import type { PostextContent, Resource } from 'postext';
import { resourceBlocksOnPage } from './geometry.js';
import { figureWordsSource, resourceTextAtPixel } from './resourceHit.js';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx { return new StubCtx(); }
};

const picture = (caption: string): Resource => ({
  id: 'spring', typeId: 'figure', kind: 'bitmap', caption, createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'spring.png', format: 'png', width: 100, height: 80 },
});

const CAPTION = 'A spring. The water has been underground for months.';
const FIGURE = `# River\n\nSome text.\n\n:::figure{resource="spring"}\n::alt[Clear water among mossy rocks.]\n::caption[${CAPTION}]\n:::\n\nMore text.\n`;

function captionHit(content: PostextContent) {
  const doc = buildDocument(content, {});
  const pageIndex = doc.pages.findIndex((_, i) => resourceBlocksOnPage(doc, i).length > 0);
  const block = resourceBlocksOnPage(doc, pageIndex)[0]!;
  // Past the caption's label ("Figure 1. "), three letters in.
  const line = block.resourceBlock!.captionLines[0]!;
  const segments = line.segments ?? [];
  const first = segments.findIndex((seg) => !seg.captionLabel && seg.kind === 'text');
  const before = segments.slice(0, first).reduce((w, seg) => w + seg.width, 0);
  const x = line.bbox.x + before + 3 * 7 + 2;
  const y = line.bbox.y + line.bbox.height / 2;
  return { block, hit: resourceTextAtPixel(doc, pageIndex, x, y, undefined, content.markdown) };
}

describe('a figure\'s own caption maps to the Markdown (#935)', () => {
  it('a click on the caption gives its place in the ::caption line', () => {
    const { hit } = captionHit({ markdown: FIGURE, resources: [picture('')] });
    expect(hit?.target).toEqual({ kind: 'caption' });
    expect(hit?.source).toBe(FIGURE.indexOf(CAPTION));
    expect(FIGURE.slice(hit!.source! + hit!.offset)).toMatch(/^pring\. The water/);
  });

  it('a resource whose caption is its own stays in the Resources panel', () => {
    const markdown = '# River\n\nSome text.\n\n:::figure{resource="spring"}\n:::\n\nMore text.\n';
    const { block, hit } = captionHit({ markdown, resources: [picture(CAPTION)] });
    expect(hit?.target).toEqual({ kind: 'caption' });
    expect(hit?.source).toBeUndefined();
    expect(figureWordsSource(markdown, block, 'caption')).toBeNull();
  });
});
