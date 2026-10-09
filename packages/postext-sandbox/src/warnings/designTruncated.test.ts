import { describe, expect, it } from 'vitest';
import { buildDocument } from 'postext';
import type { DesignElement, PostextConfig } from 'postext';
import { computeWarnings } from './compute';
import { warningCategory } from './categories';
import type { WarningPayload } from './types';

// #628: a design text the layout cut to fit its width is listed under
// Design, names the book page it was cut on, and goes with the design
// checks when they are turned off.

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
const TITLE = 'A chapter title much too long for its box';
const runningHead: DesignElement = {
  kind: 'text', id: 'rh', content: '{chapterTitle}', fontSize: pt(10),
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(140) } },
};
const config = (extra: PostextConfig = {}): PostextConfig => ({
  page: { width: pt(300), height: pt(400), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [runningHead] },
  footer: { elements: [] },
  ...extra,
});
const markdown = `# ${TITLE}\n\n${Array.from({ length: 12 }, (_, i) => `Paragraph ${i} with enough words to run on.`).join('\n\n')}`;

const truncated = (cfg: PostextConfig) =>
  computeWarnings({ markdown, config: cfg, doc: buildDocument({ markdown }, cfg) })
    .filter((w): w is typeof w & { payload: Extract<WarningPayload, { kind: 'designTextTruncated' }> } => w.payload.kind === 'designTextTruncated');

describe('designTextTruncated in the Checks panel (#628)', () => {
  it('lists a running head cut on its pages once, under Design, with its book page', () => {
    const found = truncated(config());
    expect(found).toHaveLength(1);
    expect(found[0]!.payload).toEqual({ kind: 'designTextTruncated', slot: 'header', elementId: 'rh', text: TITLE, mode: 'ellipsis-end', page: 1 });
    expect(warningCategory('designTextTruncated')).toBe('design');
  });

  it('is turned off with the design checks', () => {
    expect(truncated(config({ debug: { warnings: { designIssues: false } } }))).toEqual([]);
  });

  it('says nothing when the running head wraps', () => {
    expect(truncated(config({ header: { elements: [{ ...runningHead, overflow: 'wrap' } as DesignElement] } }))).toEqual([]);
  });
});
