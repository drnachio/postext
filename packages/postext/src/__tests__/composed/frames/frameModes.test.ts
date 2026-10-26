import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { PostextConfig, VDTBlock, VDTDocument, VDTPage } from '../../../index.js';

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const PAGE: PostextConfig = {
  page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
};
const composedPage = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const frameBlocks = (page: VDTPage, name: string): VDTBlock[] => {
  const frame = page.composed!.frames.find((f) => f.name === name)!;
  return frame.blockIds.map((id) => page.floats!.find((b) => b.id === id)!).filter((b) => b && b.type !== 'callout');
};

describe('a frame set in its own direction (#944)', () => {
  const t = (direction?: 'ltr' | 'rtl'): PageTemplate => ({
    id: 'sheet',
    frames: [
      { name: 'main', flow: true, width: mm(80), height: mm(60), placement: { anchor: { to: 'container', edge: 'top-left' } } },
      { name: 'quote', width: mm(80), height: mm(60), placement: { anchor: { to: 'container', edge: 'top-right' } }, ...(direction ? { direction } : {}) },
    ],
  });
  const md = [
    '::::page{template="sheet"}',
    'A paragraph of the book.',
    '',
    ':::frame{slot="quote"}',
    'The quoted lines, set in another direction.',
    '',
    ':::callout{dir=ltr}',
    'A note that keeps its own.',
    ':::',
    ':::',
    '::::',
    '',
  ].join('\n');
  const build = (direction?: 'ltr' | 'rtl', extra: Partial<PostextConfig> = {}) =>
    buildDocument({ markdown: md }, { ...PAGE, ...extra, pageTemplates: [t(direction)] } as PostextConfig, createMeasurementCache());

  it('an rtl frame in a left-to-right book sets its story right to left; a box that writes its own dir keeps it', () => {
    const page = composedPage(build('rtl'));
    const quote = frameBlocks(page, 'quote');
    const para = quote.find((b) => b.type === 'paragraph' && b.lines.some((l) => l.segments?.some((s) => s.text?.includes('quoted'))))!;
    // Set against the page's direction: its lines carry the span they align in,
    // its start on the right.
    expect(para.lines.every((l) => l.measure !== undefined)).toBe(true);
    const note = quote.find((b) => b.type === 'paragraph' && b.lines.some((l) => l.segments?.some((s) => s.text?.includes('note'))))!;
    expect(note.lines.every((l) => l.measure === undefined)).toBe(true);
    // The book's own frame is unchanged.
    expect(frameBlocks(page, 'main')[0]!.lines.every((l) => l.measure === undefined)).toBe(true);
  });

  it('without a direction the story follows the book', () => {
    const page = composedPage(build());
    expect(frameBlocks(page, 'quote').every((b) => b.lines.every((l) => l.measure === undefined))).toBe(true);
  });

  it('an ltr frame on a right-to-left page sets its story left to right', () => {
    const page = composedPage(build('ltr', { direction: 'rtl' }));
    const para = frameBlocks(page, 'quote').find((b) => b.type === 'paragraph')!;
    expect(para.lines.every((l) => l.measure !== undefined)).toBe(true);
    expect(frameBlocks(page, 'main')[0]!.lines.every((l) => l.measure === undefined)).toBe(true);
  });
});
