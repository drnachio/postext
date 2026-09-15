import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { continuationAfter } from '../pipeline/continuation';
import type { LayoutContinuation, PostextConfig, Resource } from '../types';

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

const figure = (id: string): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  caption: `Figure ${id}.`,
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 400, height: 300 },
});

const numbered: PostextConfig = {
  page: { width: pt(360), height: pt(480), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
  headings: { levels: [{ level: 1, numberingTemplate: 'Chapter {1}' }, { level: 2, numberingTemplate: '{1}.{2}' }] },
};

const headingPrefixes = (markdown: string, continuation?: LayoutContinuation, resources?: Resource[]) => {
  const doc = buildDocument({ markdown, continuation, resources }, numbered);
  return doc.blocks.filter((b) => b.type === 'heading').map((b) => b.numberPrefix?.trim() ?? '');
};

describe('continuationAfter', () => {
  it('reports the heading counters at the end of the content', () => {
    const c = continuationAfter({ markdown: '# One\n\n## A\n\n## B\n\n### deep' });
    expect(c.headings).toEqual({ h1: 1, h2: 2, h3: 1, h4: 0, h5: 0, h6: 0 });
  });

  it('chains chapter after chapter', () => {
    const one = continuationAfter({ markdown: '# One\n\n## A' });
    const two = continuationAfter({ markdown: '# Two\n\ntext' }, undefined, one);
    expect(two.headings).toEqual({ h1: 2, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 });
    // Nothing to count: the counters pass through.
    const three = continuationAfter({ markdown: 'just a paragraph' }, undefined, two);
    expect(three.headings).toEqual(two.headings);
  });

  it('ignores front matter and carries resource numbers and counters', () => {
    const resources = [figure('f1'), figure('f2')];
    const one = continuationAfter({ markdown: '---\ntitle: T\n---\n# One\n\nSee :ref{id=f1}.', resources });
    expect(one.headings?.h1).toBe(1);
    expect(one.resourceNumbers?.f1?.number).toBe('1.1');
    expect(one.resourceCounters?.figure).toEqual({ counter: 1, heading: { h1: 1, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } });
    const two = continuationAfter({ markdown: '# Two\n\nSee :ref{id=f2} and :ref{id=f1}.', resources }, undefined, one);
    // f2 is the first figure of chapter 2; f1 keeps the number of its first mention.
    expect(two.resourceNumbers?.f2?.number).toBe('2.1');
    expect(two.resourceNumbers?.f1?.number).toBe('1.1');
    expect(two.resourceCounters?.figure?.counter).toBe(1);
  });
});

describe('buildDocument with a continuation', () => {
  it('numbers headings after the preceding chapters', () => {
    expect(headingPrefixes('# One\n\ntext')).toEqual(['Chapter 1']);
    const after = continuationAfter({ markdown: '# One\n\n## A\n\n## B' });
    expect(headingPrefixes('# Two\n\ntext', after)).toEqual(['Chapter 2']);
    // Sub-levels restart under the new chapter number.
    expect(headingPrefixes('## C\n\ntext', after)).toEqual(['1.3']);
  });

  it('numbers resources after the preceding chapters', () => {
    const resources = [figure('f1'), figure('f2')];
    const after = continuationAfter({ markdown: '# One\n\nSee :ref{id=f1}.', resources });
    const doc = buildDocument({ markdown: '# Two\n\nSee :ref{id=f2} then :ref{id=f1}.', resources, continuation: after }, numbered);
    const text = doc.blocks
      .filter((b) => b.type === 'paragraph')
      .map((b) => b.lines.map((l) => l.text).join(' '))
      .join(' ');
    expect(text).toContain('2.1');
    expect(text).toContain('1.1');
  });

  it('starts page numbering where the previous page left off', () => {
    const doc = buildDocument(
      { markdown: 'Just text.', continuation: { pageIndexOffset: 13, pageNumbering: { startAt: 14 } } },
      numbered,
    );
    expect(doc.pageIndexOffset).toBe(13);
    expect(doc.pages[0]!.pageNumberValue).toBe(14);
    expect(doc.pages[0]!.pageLabel).toBe('14');
  });

  it('keeps the page-number format of the previous page', () => {
    const doc = buildDocument(
      { markdown: 'Front matter text.', continuation: { pageIndexOffset: 2, pageNumbering: { format: 'lower-roman', startAt: 3 } } },
      numbered,
    );
    expect(doc.pages[0]!.pageLabel).toBe('iii');
  });

  it('pads parity for a leading chapter heading as it would mid-book', () => {
    const alwaysOdd: PostextConfig = {
      ...numbered,
      headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'always-odd' } }] },
    };
    // Self-contained: the document-start exception applies, no blank page.
    const alone = buildDocument({ markdown: '# Two\n\ntext' }, alwaysOdd);
    expect(alone.pages[0]!.blankForForce).toBeFalsy();
    expect(alone.pages).toHaveLength(1);
    // After 13 pages (the next physical page, 14, is even): one mandatory
    // blank, then the chapter opens on physical page 15.
    const after13 = buildDocument(
      { markdown: '# Two\n\ntext', continuation: { pageIndexOffset: 13, pageNumbering: { startAt: 14 } } },
      alwaysOdd,
    );
    expect(after13.pages[0]!.blankForForce).toBe(true);
    expect(after13.pages).toHaveLength(2);
    expect(after13.pages[1]!.pageNumberValue).toBe(15);
    expect(after13.blocks[0]!.pageIndex).toBe(1);
    // After 12 pages (next physical page 13, odd): the mandatory blank lands
    // on 13, parity pads 14, the chapter opens on 15.
    const after12 = buildDocument(
      { markdown: '# Two\n\ntext', continuation: { pageIndexOffset: 12, pageNumbering: { startAt: 13 } } },
      alwaysOdd,
    );
    expect(after12.pages[0]!.blankForForce).toBe(true);
    expect(after12.pages[1]!.blankForParity).toBe(true);
    expect(after12.pages).toHaveLength(3);
    expect(after12.pages[2]!.pageNumberValue).toBe(15);
  });

  it('mirrors margins by physical page', () => {
    const mirrored: PostextConfig = {
      page: { width: pt(360), height: pt(240), margins: { top: pt(18), bottom: pt(18), left: pt(40), right: pt(10), mirror: true } },
    };
    const odd = buildDocument({ markdown: 'text' }, mirrored);
    const even = buildDocument({ markdown: 'text', continuation: { pageIndexOffset: 1 } }, mirrored);
    expect(odd.pages[0]!.contentArea.x).not.toBe(even.pages[0]!.contentArea.x);
    const evenAgain = buildDocument({ markdown: 'text', continuation: { pageIndexOffset: 3 } }, mirrored);
    expect(evenAgain.pages[0]!.contentArea.x).toBe(even.pages[0]!.contentArea.x);
  });
});
