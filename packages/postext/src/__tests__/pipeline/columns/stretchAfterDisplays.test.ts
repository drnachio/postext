import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PostextConfig, VDTBlock, VDTDocument } from '../../../index.js';

// `headings.balancing.stretchAfterDisplays: false` (#710): column balancing
// adds no grid line under a display formula or a callout box.

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

const words = 'the lake froze late that year and the ferry kept running until the first week of december when the ice closed over the middle'.split(' ');
const para = (n: number, seed: number) => `${Array.from({ length: n }, (_, i) => words[(i * 7 + seed) % words.length]).join(' ')}.`;

/** Paragraphs and short boxes over several two-column pages: no heading and
 *  no list, so a short column's first whole-line lever is the one under a
 *  box. */
const markdown = (): string => {
  const parts: string[] = [];
  for (let i = 0; i < 40; i++) {
    parts.push(para(60 + (i * 13) % 31, i));
    if (i % 3 === 1) parts.push(`:::callout{title="Note ${i}"}\n${para(18 + (i % 5) * 4, i + 3)}\n:::`);
  }
  return parts.join('\n\n');
};

const build = (balancing: NonNullable<PostextConfig['headings']>['balancing']): VDTDocument => buildDocument(
  { markdown: markdown() },
  {
    page: { sizePreset: '17x24' },
    layout: { layoutType: 'double' },
    bodyText: { orphanMinLines: 3, widowMinLines: 3 },
    headings: { balancing },
  },
  createMeasurementCache(),
);

const levered = (doc: VDTDocument, lever: string): VDTBlock[] =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks)).filter((b) => b.balancing?.levers.includes(lever as never));

describe('headings.balancing.stretchAfterDisplays (#710)', () => {
  it('adds a line under a box by default and none when switched off', () => {
    const on = build({ looseParagraphs: false });
    expect(levered(on, 'afterDisplay').length).toBeGreaterThan(0);
    // Unset and `true` are the same layout.
    expect(JSON.stringify(build({ looseParagraphs: false, stretchAfterDisplays: true }).pages)).toBe(JSON.stringify(on.pages));

    const off = build({ looseParagraphs: false, stretchAfterDisplays: false });
    expect(levered(off, 'afterDisplay')).toEqual([]);
    // The other levers still run.
    const loose = build({ stretchAfterDisplays: false });
    expect(levered(loose, 'afterDisplay')).toEqual([]);
  });
});
