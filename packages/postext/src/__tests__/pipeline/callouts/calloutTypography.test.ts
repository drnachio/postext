import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { VDTBlock, VDTDocument } from '../../../vdt.js';
import type { PostextConfig } from '../../../types.js';

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

// EF-41: which styles the text inside a callout takes (the rules the
// configuration reference states under "Typography inside a box").

const pt = (value: number) => ({ value, unit: 'pt' as const });
const CONFIG: PostextConfig = {
  headings: { balancing: { enabled: false } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Doc', fontSize: pt(10) },
  paragraphStyles: [{ id: 'big', fontWeight: 700 }],
  orderedLists: { fontFamily: 'Numbers', numberFontSize: { value: 1.5, unit: 'em' } },
  calloutStyles: [
    { id: 'box', body: { fontFamily: 'Box', fontSize: pt(7), smallCaps: true } },
    { id: 'inner', body: { fontFamily: 'Inner' } },
  ],
};
const MD = [
  ':::callout{type="box"}',
  'Box text.',
  '',
  ':::paragraphs{style="big"}',
  'Styled text.',
  ':::',
  '',
  '1. Numbered item.',
  '',
  '> Quoted line.',
  '',
  ':::columns{count=2}',
  'Left column.',
  '',
  'Right column.',
  ':::',
  '',
  ':::callout{type="inner"}',
  ':::paragraphs{style="big"}',
  'Nested styled.',
  ':::',
  ':::',
  ':::',
].join('\n');
const doc: VDTDocument = buildDocument({ markdown: MD }, CONFIG, createMeasurementCache());
const block = (text: string): VDTBlock => {
  const b = doc.blocks.find((x) => x.lines.some((l) => l.text.toUpperCase().includes(text.toUpperCase())));
  if (!b) throw new Error(`no block ${text}`);
  return b;
};
/** A font string as `[style, weight, size in pt, family]`. */
const face = (font: string): [string, string, number, string] => {
  const m = /^(?:(italic) )?(\d+) (\d*\.?\d+)px (.+)$/.exec(font);
  if (!m) throw new Error(`font ${font}`);
  return [m[1] ?? 'normal', m[2]!, Math.round((Number(m[3]) * 72) / 300 * 100) / 100, m[4]!];
};

describe('typography inside a callout', () => {
  it('sets paragraphs in the box body', () => {
    expect(face(block('Box text.').fontString)).toEqual(['normal', '400', 7, 'Box']);
    expect(block('Box text.').lines[0]!.text).toBe('BOX TEXT.');
  });

  it('applies a paragraph style, whose unset fields inherit the box body, in nested boxes too (#1119)', () => {
    expect(face(block('Styled text.').fontString)).toEqual(['normal', '700', 7, 'Box']);
    // The inner box sets only its face: its size is the document body's.
    expect(face(block('Nested styled.').fontString)).toEqual(['normal', '700', 10, 'Inner']);
    for (const text of ['Styled text.', 'Nested styled.']) {
      // The box's small caps do not reach the styled paragraph.
      expect(block(text).lines[0]!.text).toBe(text);
    }
  });

  it('keeps the document body under paragraphStylesInBoxes: document, as up to 1.51', () => {
    const legacy = buildDocument({ markdown: MD }, { ...CONFIG, bodyText: { ...CONFIG.bodyText, paragraphStylesInBoxes: 'document' } }, createMeasurementCache());
    for (const text of ['Styled text.', 'Nested styled.']) {
      const b = legacy.blocks.find((x) => x.lines.some((l) => l.text.includes(text)))!;
      expect(face(b.fontString)).toEqual(['normal', '700', 10, 'Doc']);
    }
  });

  it('takes the ordered-list number from the global orderedLists, the item text from the box', () => {
    const item = block('Numbered item.');
    expect(face(item.fontString)).toEqual(['normal', '400', 7, 'Box']);
    expect(item.bulletFontString).toContain('Numbers');
  });

  it('sets blockquotes in the box face, italic and small caps', () => {
    const quote = block('Quoted line.');
    expect(face(quote.fontString)).toEqual(['italic', '400', 7, 'Box']);
    expect(quote.lines[0]!.text).toBe('QUOTED LINE.');
  });

  it('shares the box body across a :::columns group', () => {
    expect(face(block('Left column.').fontString)).toEqual(['normal', '400', 7, 'Box']);
    expect(face(block('Right column.').fontString)).toEqual(['normal', '400', 7, 'Box']);
  });
});
