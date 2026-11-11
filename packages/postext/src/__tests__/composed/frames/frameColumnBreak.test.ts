/**
 * A `:::columnbreak` in a frame's text (#1512): what follows it opens the
 * next frame of the chain, as a column of the flow ends at one. A frame
 * that cannot go on sets its text through.
 */
import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { PostextConfig, VDTBlock, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';
import { installSizedStub } from '../../vertical/stub.js';

installSizedStub();

const pt = (value: number) => ({ value, unit: 'pt' as const });
const PAGE: PostextConfig = {
  page: { width: pt(400), height: pt(500), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(40), right: pt(40) } } as never,
  bodyText: { fontFamily: 'Test Serif', fontSize: pt(10), lineHeight: pt(20), textAlign: 'left' } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
};
const composedPage = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const frameOf = (page: VDTPage, name: string): VDTFrame => page.composed!.frames.find((f) => f.name === name)!;
const textOf = (page: VDTPage, name: string): string =>
  frameOf(page, name).blockIds.map((id) => page.floats!.find((b) => b.id === id)!).filter((b): b is VDTBlock => !!b && b.type !== 'callout').flatMap((b) => b.lines).map((l) => l.text.trim()).join(' ');

/** Two frames side by side, each tall enough for the whole story. */
const chain = (linked: boolean): PageTemplate => ({
  id: 'pair',
  frames: [
    { name: 'a', flow: true, width: pt(150), height: pt(300), ...(linked ? { next: 'b' } : {}), placement: { anchor: { to: 'container', edge: 'top-left' } } },
    { name: 'b', width: pt(150), height: pt(300), placement: { anchor: { to: '#a', edge: 'right' } } },
  ],
});
const build = (md: string, linked = true) =>
  buildDocument({ markdown: `::::page{template="pair"}\n${md}\n::::\n` }, { ...PAGE, pageTemplates: [chain(linked)] } as PostextConfig, createMeasurementCache());

describe('a column break in a chained frame (#1512)', () => {
  it('sets a story that fits in its first frame without one', () => {
    const page = composedPage(build('First part.\n\nSecond part.'));
    expect(textOf(page, 'a')).toBe('First part. Second part.');
    expect(textOf(page, 'b')).toBe('');
  });

  it('opens the next frame at the break, though the text would fit', () => {
    const page = composedPage(build('First part.\n\n:::columnbreak\n\nSecond part.\n\nThird part.'));
    expect(textOf(page, 'a')).toBe('First part.');
    expect(textOf(page, 'b')).toBe('Second part. Third part.');
    expect(frameOf(page, 'a').continuesTo).toBe(frameOf(page, 'b').id);
  });

  it('does not cut before the first block, nor a frame that cannot go on', () => {
    const lead = composedPage(build(':::columnbreak\n\nFirst part.\n\nSecond part.'));
    expect(textOf(lead, 'a')).toBe('First part. Second part.');
    const alone = composedPage(build('First part.\n\n:::columnbreak\n\nSecond part.', false));
    expect(textOf(alone, 'a')).toBe('First part. Second part.');
  });
});
