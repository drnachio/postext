import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { parseMarkdown } from '../parse';
import { computeChapterTitles } from '../pipeline/placeholders';
import type { PostextConfig } from '../types';
import type { VDTDesignTextBlock } from '../vdt';

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
  page: { width: pt(360), height: pt(240), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
  layout: { layoutType: 'double' },
  headings: {
    levels: [
      {
        level: 1,
        span: 'page',
        breakBefore: { enabled: false, parity: 'any' },
        advancedDesign: {
          enabled: true,
          slot: {
            elements: [
              {
                kind: 'text', id: 'title', content: '{titleText}', fontSize: pt(14), overflow: 'wrap',
                placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill', height: 'auto' } },
              },
              {
                kind: 'text', id: 'label', content: 'Chapter {chapterNumber}', fontSize: pt(8), overflow: 'ellipsis-end',
                placement: { anchor: { to: 'container', edge: 'top-right' }, size: { width: 'auto', height: 'auto' } },
              },
            ],
          },
        },
      },
    ],
  },
};

describe('opener band title source mapping', () => {
  it('stamps the heading text range on the {titleText} element only', () => {
    const markdown = '# Health and Illness {author="J. Doe"}\n\nBody text after the opener.';
    const doc = buildDocument({ markdown }, config);
    const band = doc.pages[0]!.openerBand;
    expect(band).toBeDefined();
    const texts = band!.blocks.filter((b): b is VDTDesignTextBlock => b.kind === 'text');
    const withSource = texts.filter((b) => b.sourceStart !== undefined);
    expect(withSource).toHaveLength(1);
    expect(markdown.slice(withSource[0]!.sourceStart, withSource[0]!.sourceEnd)).toBe('Health and Illness');
  });
});

describe('forced title breaks (\\\\)', () => {
  const markdown = '# Health and illness. \\\\ Community health {author="J. Doe"}\n\nBody text after the opener.';

  it('parses the marker into a single break char mapped to the backslashes', () => {
    const [h] = parseMarkdown(markdown);
    expect(h!.text).toBe('Health and illness.\u2028Community health');
    expect(h!.titleBreaks).toEqual([19]);
    expect(markdown.slice(h!.sourceMap![19]!, h!.sourceMap![19]! + 2)).toBe('\\\\');
  });

  it('breaks the opener title into two lines and flattens it elsewhere', () => {
    const doc = buildDocument({ markdown }, config);
    const band = doc.pages[0]!.openerBand!;
    const title = band.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text' && b.sourceStart !== undefined)!;
    expect(title.lines.map((l) => l.text)).toEqual(['Health and illness.', 'Community health']);
    // The in-column heading and the running-head title show a plain space.
    const heading = doc.blocks.find((b) => b.type === 'heading')!;
    expect(heading.lines.map((l) => l.text).join(' ')).not.toContain('\u2028');
    expect(computeChapterTitles(doc.blocks, doc.pages.length, doc.pages)[0]).toBe('Health and illness. Community health');
  });
});
