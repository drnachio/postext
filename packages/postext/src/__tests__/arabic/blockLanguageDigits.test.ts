import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { parseMarkdown } from '../../parse';
import type { PostextConfig } from '../../types';
import type { VDTDocument } from '../../vdt';

// #401: a generated number inside a block in another language. A `:::`
// container that names its language (`lang=en`) numbers its ordered lists
// in that language's digits; a container in the document's language, and
// everything else, keep the document's. Footnote numbers stay in the
// document's digits (one sequence, marker and note alike).

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
const config = (locale: string, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  locale,
  page: { width: pt(300), height: pt(500), margins: { top: pt(30), bottom: pt(30), left: pt(30), right: pt(30) } },
  layout: { layoutType: 'single' },
  ...extra,
});
const numbers = (doc: VDTDocument) => doc.blocks.filter((b) => b.type === 'listItem').map((b) => b.bulletText);

describe('#401: list numbers in a block of another language', () => {
  it('stamps the container language on the blocks inside it', () => {
    const blocks = parseMarkdown(':::paragraphs{dir=ltr lang=en}\nOne.\n\n:::callout\nTwo.\n:::\n:::\n\nThree.');
    expect(blocks.filter((b) => b.type === 'paragraph').map((b) => [b.text, b.lang ?? null])).toEqual([
      ['One.', 'en'], ['Two.', 'en'], ['Three.', null],
    ]);
  });

  it('numbers an English list of an Arabic book in European digits', () => {
    const md = '1. واحد\n2. اثنان\n\n:::paragraphs{dir=ltr lang=en}\n1. one\n2. two\n:::\n\n:::paragraphs{lang=ar}\n1. ثالث\n:::';
    expect(numbers(buildDocument({ markdown: md }, config('ar')))).toEqual(['١.', '٢.', '1.', '2.', '١.']);
  });

  it('numbers an Arabic list of an English book in Arabic-Indic digits', () => {
    const md = '1. one\n\n:::paragraphs{dir=rtl lang=ar-EG}\n1. واحد\n2. اثنان\n:::';
    expect(numbers(buildDocument({ markdown: md }, config('en')))).toEqual(['1.', '١.', '٢.']);
  });

  it("keeps the document's own digits for a container in its language", () => {
    const md = ':::paragraphs{lang=ar-SA}\n1. واحد\n:::';
    expect(numbers(buildDocument({ markdown: md }, config('ar', { numerals: 'latn' })))).toEqual(['1.']);
  });

  it('leaves footnote numbers in the document digits', () => {
    const md = ':::paragraphs{dir=ltr lang=en}\nA note.[^a]\n:::\n\n[^a]: Note.';
    const doc = buildDocument({ markdown: md }, config('ar'));
    const marker = doc.blocks.flatMap((b) => b.lines.flatMap((l) => l.segments ?? [])).find((s) => s.footnoteId !== undefined);
    expect(marker?.text).toBe('١');
  });
});
