// #1642: a document sent as it differs from the one sent before is, put
// together by the client, the document sent whole.

import { describe, expect, it } from 'vitest';
import { buildDocument, createLayoutTapes } from '../../index.js';
import { createMeasurementCache } from '../../measure/index.js';
import { applyDocumentPatch, makeDocumentPatch, sentWhole, type SentDocument } from '../../worker/docPatch.js';
import type { PostextConfig } from '../../types.js';
import type { VDTDocument } from '../../vdt.js';

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
const config = { page: { width: pt(360), height: pt(480), margins: { top: pt(36), bottom: pt(36), left: pt(36), right: pt(36) } } } as PostextConfig;
const para = (n: number) => `Paragraph ${n} with enough words in it to run over several lines of a narrow column, and then a few more to be sure of it. `.repeat(3).trim();

/** A worker and its client, without the thread between them: the worker
 *  builds with tapes and answers whole or in pieces, the client holds the
 *  document it last put together. What crosses is cloned, as a message. */
function pair() {
  const tapes = createLayoutTapes();
  const cache = createMeasurementCache();
  let sent: SentDocument | undefined;
  let seq = 0;
  let held: { seq: number; doc: VDTDocument } | undefined;
  return (markdown: string): { doc: VDTDocument; whole: string; pagesSent: number; moved: number } => {
    const built = buildDocument({ markdown }, config, cache, { tapes });
    const whole = JSON.stringify(built);
    seq++;
    if (sent && held && held.seq === sent.seq) {
      const patch = structuredClone(makeDocumentPatch(built, sent));
      sent = { seq, pages: [...built.pages], blocks: [...built.blocks] };
      const doc = applyDocumentPatch(patch, held.doc);
      held = { seq, doc };
      return { doc, whole, pagesSent: patch.pages.filter((p) => typeof p !== 'number').length, moved: patch.moves.reduce((n, m) => n + m.pages.length, 0) };
    }
    sent = sentWhole(built, seq);
    held = { seq, doc: structuredClone(built) };
    return { doc: held.doc, whole, pagesSent: built.pages.length, moved: 0 };
  };
}

describe('a document sent as it differs from the one before', () => {
  it('is the document sent whole, letter after letter and edit after edit', () => {
    const blocks = ['# A chapter', ...Array.from({ length: 120 }, (_, i) => para(i))];
    const build = pair();
    const first = build(blocks.join('\n\n'));
    expect(JSON.stringify(first.doc)).toBe(first.whole);
    const pages = first.doc.pages.length;

    // Letters in the middle: a few pages cross, the pages after the edit
    // are moved where the client holds them.
    for (let turn = 1; turn <= 3; turn++) {
      blocks[50] = `${blocks[50]}x`;
      const next = build(blocks.join('\n\n'));
      expect(JSON.stringify(next.doc), `letter ${turn}`).toBe(next.whole);
      expect(next.pagesSent).toBeLessThan(pages / 2);
      expect(next.moved).toBeGreaterThan(2);
    }
    // Elsewhere, and edits that add lines.
    for (const at of [20, 100, 50]) {
      blocks[at] = `${blocks[at]} And a sentence more, long enough to add a line or two to the paragraph it ends.`;
      const longer = build(blocks.join('\n\n'));
      expect(JSON.stringify(longer.doc), `sentence at block ${at}`).toBe(longer.whole);
      blocks[at] = `${blocks[at]}y`;
      const typed = build(blocks.join('\n\n'));
      expect(JSON.stringify(typed.doc), `letter at block ${at}`).toBe(typed.whole);
    }
    // The blocks of the list are the blocks of the pages, as in a
    // document sent whole.
    const last = build(blocks.join('\n\n'));
    const inPages = new Set(last.doc.pages.flatMap((p) => [...p.columns.flatMap((c) => c.blocks), ...(p.floats ?? [])]));
    expect(last.doc.blocks.filter((b) => b.pageIndex >= 0).every((b) => inPages.has(b))).toBe(true);
  }, 120_000);
});
