import { describe, expect, it } from 'vitest';
import { buildDocument, type Resource } from 'postext';
import { computeWarnings } from './compute';
import { stitchDocuments } from '../book/stitch';

// The comic warnings only the layout finds (a balloon that does not fit, a
// picture letterboxed in its cell) reach the Checks panel from a document
// the engine really laid out, not only from a hand-made one (#581).

class StubCtx {
  font = '';
  measureText(s: string): { width: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number } {
    return { width: s.length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const resources: Resource[] = [{
  id: 'strip', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  // A very wide picture whose safe area is most of it: a tall cell must
  // letterbox it.
  bitmap: { fileId: 'strip-file', format: 'png', width: 4000, height: 400 },
  safeArea: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
}];

const markdown = [
  '# Chapter',
  '',
  ':::page{split="8 / * [30 | *]"}',
  '::panel',
  'ana: This line is far too long for so thin a panel, however the lettering turns it, and it says so.',
  '::panel{art=strip}',
  '::panel',
  ':::',
  '',
].join('\n');

describe('comic layout warnings in the Checks panel', () => {
  it('reads a balloon that does not fit and a letterboxed picture off a laid-out document', () => {
    const doc = buildDocument({ markdown, resources }, { page: { sizePreset: '17x24' } });
    const all = computeWarnings({ markdown, config: {}, doc, resources });
    const overflow = all.find((w) => w.payload.kind === 'comicBalloonOverflow');
    const letterbox = all.find((w) => w.payload.kind === 'comicPanelLetterbox');
    expect(overflow, 'comicBalloonOverflow').toBeDefined();
    expect(letterbox, 'comicPanelLetterbox').toBeDefined();
    // Each points at its line: a click jumps there.
    expect(overflow!.line).toBe(5);
    expect(letterbox!.line).toBe(6);
  });

  it('keeps them when the chapters are stitched into one book document', () => {
    const doc = buildDocument({ markdown, resources }, { page: { sizePreset: '17x24' } });
    const book = stitchDocuments([{ chapterId: 'a', doc }, { chapterId: 'b', doc }]);
    const kinds = (book!.doc.contentWarnings ?? []).map((w) => w.kind);
    expect(kinds.filter((k) => k === 'comicBalloonOverflow')).toHaveLength(2);
  });
});
