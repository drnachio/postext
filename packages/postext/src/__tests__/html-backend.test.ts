import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { renderToHtmlIndexed } from '../html-backend';
import type { PostextConfig } from '../types';

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

const config: PostextConfig = {
  page: {
    width: pt(360),
    height: pt(240),
    margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) },
  },
  headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
  parts: {
    margins: { top: pt(60), left: pt(30), right: pt(24), bottom: pt(12) },
    design: {
      elements: [{
        kind: 'box', id: 'partBg',
        placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill', height: 'fill' } },
        style: { backgroundColor: { hex: '#e3e0d6', model: 'hex' } },
      }],
    },
  },
  header: {
    elements: [{
      kind: 'text', id: 'running', content: 'Running head', fontSize: pt(8), overflow: 'clip',
      placement: { anchor: { to: 'container', edge: 'top-left' } },
    }],
  },
};

const markdown = `:::part{number="I" title="Foundations"}
1. First chapter
2. Second chapter
:::

# One

Body text.`;

describe('renderToHtmlIndexed paint order', () => {
  it('paints the part opener band under the body blocks and the header over them', () => {
    const doc = buildDocument({ markdown }, config);
    const part = doc.pages.find((p) => p.partInfo)!;
    expect(part.openerBand).toBeDefined();
    expect(part.columns[0]!.blocks.length).toBeGreaterThan(0);

    const rendered = renderToHtmlIndexed(doc, { mode: 'single' });
    const page = rendered.pages[part.index]!;
    const bandAt = page.innerHtml.indexOf('background:#e3e0d6');
    const firstBlockAt = page.innerHtml.indexOf('class="pt-block"');
    expect(bandAt).toBeGreaterThanOrEqual(0);
    expect(firstBlockAt).toBeGreaterThanOrEqual(0);
    // Absolute positioning paints in source order: band first = underneath.
    expect(bandAt).toBeLessThan(firstBlockAt);

    // The header is emitted after the blocks (on top), and the block list
    // still drives per-block patching.
    const headerAt = page.innerHtml.indexOf('Running head');
    expect(headerAt).toBeGreaterThan(firstBlockAt);
    expect(page.blocks.map((b) => b.id)).toEqual(part.columns[0]!.blocks.map((b) => b.id));
    expect(page.innerHtml.startsWith(page.blocks[0]!.html)).toBe(false);
    // The non-block markup is exposed on its own so a block-level patcher
    // can notice a design-only change.
    expect(page.decorationHtml).toContain('background:#e3e0d6');
    expect(page.decorationHtml).toContain('Running head');
    expect(page.decorationHtml).not.toContain('pt-block');
  });
});
