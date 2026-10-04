// The paragraph style a block is set in and the level of an index entry
// (`VDTBlock.paragraphStyleId`, `VDTBlock.indexLevel`, `VDTLine.indexLevel`):
// metadata for renditions that set the text again (a reflowable EPUB).
import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import type { PostextConfig } from '../types';
import type { VDTBlock, VDTDocument } from '../vdt';

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
  page: {
    width: pt(360),
    height: pt(300),
    margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) },
  },
  layout: { layoutType: 'single' },
  paragraphStyles: [
    { id: 'aside', fontSize: pt(9), italic: true },
    { id: 'poem', fontSize: pt(11) },
  ],
};

const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
const filler = (n: number) =>
  Array.from({ length: n }, (_, i) => `Paragraph ${i} with enough words to consume vertical space and push the text on.`).join('\n\n');

const allBlocks = (doc: VDTDocument): VDTBlock[] => [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])];
const textOf = (b: VDTBlock): string => b.lines.map((l) => l.text).join(' ');

describe('VDTBlock.paragraphStyleId', () => {
  it('names the style of the :::paragraphs container, on every fragment', () => {
    const md = `Plain body text.\n\n${filler(17)}\n\n:::paragraphs{style="aside"}\nFirst aside. ${long} ${long}\n\nSecond aside.\n:::\n\nBody again.`;
    const doc = buildDocument({ markdown: md }, base);
    const asides = doc.blocks.filter((b) => b.paragraphStyleId === 'aside');
    // The first aside is split across pages: each fragment says so.
    const first = asides.filter((b) => textOf(b).includes('word'));
    expect(first.map((b) => b.pageIndex)).toEqual([0, 1]);
    expect(first[1]!.id).toMatch(/-cont-1$/);
    expect(asides.some((b) => textOf(b).startsWith('Second aside'))).toBe(true);
    for (const b of doc.blocks) {
      const t = textOf(b);
      if (t.startsWith('Plain body') || t.startsWith('Body again') || t.startsWith('Paragraph')) expect(b.paragraphStyleId).toBeUndefined();
    }
  });

  it('is set inside a box and on a poem whose fence names a style', () => {
    const md = `:::callout\n:::paragraphs{style="aside"}\nInside the box.\n:::\nBox text.\n:::\n\n:::verse{style="poem"}\nOne line || and its half\n:::\n\n:::verse{style="none"}\nAnother poem\n:::`;
    const doc = buildDocument({ markdown: md }, base);
    const blocks = allBlocks(doc);
    expect(blocks.find((b) => textOf(b).startsWith('Inside the box'))!.paragraphStyleId).toBe('aside');
    expect(blocks.find((b) => textOf(b).startsWith('Box text'))!.paragraphStyleId).toBeUndefined();
    expect(blocks.find((b) => textOf(b).includes('One line'))!.paragraphStyleId).toBe('poem');
    // A style the config does not have: the poem keeps the text's.
    expect(blocks.find((b) => textOf(b).includes('Another poem'))!.paragraphStyleId).toBeUndefined();
  });
});

describe('VDTBlock.indexLevel / VDTLine.indexLevel', () => {
  it('gives each index block its entry level and each entry its first line', () => {
    const md = `# Text\n\nThe :index[heart] beats.:index{term="Pulse!radial"}:index{term="Pulse!carotid"} :index{term="Cardiac insufficiency" see="Heart failure"}\n\n# Index\n\n:::index`;
    const doc = buildDocument({ markdown: md }, base);
    const index = doc.blocks.filter((b) => b.indexLevel !== undefined);
    const rows = index.map((b) => [b.indexLevel, b.lines.map((l) => [l.indexLevel, l.text])]);
    expect(rows).toEqual([
      // A cross-reference-only entry is an entry too.
      [0, [[undefined, 'C'], [0, 'Cardiac insufficiency. See Heart failure']]],
      [0, [[undefined, 'H'], [0, expect.stringMatching(/^heart, \d+$/)]]],
      // The page-less head is set with its first sub-entry.
      [1, [[undefined, 'P'], [0, 'Pulse'], [1, expect.stringMatching(/^carotid, \d+$/)]]],
      [1, [[1, expect.stringMatching(/^radial, \d+$/)]]],
    ]);
    // Body text carries neither.
    expect(doc.blocks.filter((b) => b.indexLevel === undefined).flatMap((b) => b.lines).every((l) => l.indexLevel === undefined)).toBe(true);
  });
});
