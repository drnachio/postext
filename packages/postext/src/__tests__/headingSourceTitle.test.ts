import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import type { PostextConfig } from '../types';
import type { VDTBlock, VDTDocument } from '../vdt';

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

// EF-81: a heading set in capitals keeps its title as written on the block
// (`VDTBlock.sourceTitle`), which the PDF bookmarks name it with.
const config: PostextConfig = {
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }, { level: 2, textTransform: 'uppercase', numberingTemplate: '{1}.{2}' }] },
};
const headings = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'heading');

describe('the title as written, beside the capitals (EF-81)', () => {
  it('is kept on an uppercase heading, without its number, forced breaks as spaces', () => {
    const doc = buildDocument({ markdown: '# Pendulum\n\n## Author \\\\ contributions\n\nText.' }, config);
    const [h1, h2] = headings(doc);
    expect(h1!.sourceTitle).toBeUndefined();
    expect(h2!.lines.map((l) => l.text).join(' ')).toContain('AUTHOR');
    expect(h2!.sourceTitle).toBe('Author contributions');
    expect(h2!.numberPrefix).toBe('1.1');
  });

  it('is left out when the title cites a resource: its label exists in the lines only', () => {
    const doc = buildDocument({ markdown: '# Pendulum\n\n## Data of :ref{id="t1"}\n\nText.' }, config);
    expect(headings(doc)[1]!.sourceTitle).toBeUndefined();
  });
});
