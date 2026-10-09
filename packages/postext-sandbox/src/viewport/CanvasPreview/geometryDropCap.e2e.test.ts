import { describe, expect, it } from 'vitest';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import { pixelToSourceOffset } from './geometry';

// Every glyph half an em wide, so the initial is wide enough to click.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
    return { width: s.length * size * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx { return new StubCtx(); }
};

const config: PostextConfig = {
  page: { width: { value: 120, unit: 'mm' }, height: { value: 200, unit: 'mm' } },
  bodyText: { textAlign: 'justify', firstLineIndent: { value: 0, unit: 'mm' } },
  headings: { levels: [{ level: 1, dropCap: { lines: 3 } }] },
  locale: 'en',
};

type Block = VDTDocument['blocks'][number];

describe('clicks on a drop cap (#623)', () => {
  const md = '# One\n\nLong before there were title pages there were readers of the scrolls who kept their place with a finger and a lamp.';
  const doc = buildDocument({ markdown: md }, config);
  const block = doc.blocks.find((b): b is Block => b.type === 'paragraph')!;
  const cap = block.dropCap!;

  it('lands before the initial on its left half, after it on its right half', () => {
    const y = cap.baselineY - cap.fontSizePx * 0.3;
    expect(pixelToSourceOffset(doc, block.pageIndex, cap.x + cap.width * 0.25, y)).toBe(md.indexOf('Long'));
    expect(pixelToSourceOffset(doc, block.pageIndex, cap.x + cap.width * 0.75, y)).toBe(md.indexOf('ong'));
  });

  it('a click on the first line still lands on its word', () => {
    const line = block.lines[0]!;
    expect(pixelToSourceOffset(doc, block.pageIndex, line.bbox.x + 1, line.bbox.y + line.bbox.height / 2)).toBe(md.indexOf('ong'));
  });
});
