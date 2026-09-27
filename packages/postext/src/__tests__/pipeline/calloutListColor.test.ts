import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { resolveCalloutStylesConfig } from '../../defaults/calloutStyles';
import { resolveAllConfig } from '../../pipeline/config';
import type { VDTBlock, VDTDocument } from '../../vdt';
import type { CalloutStyleConfig, PostextConfig } from '../../types';

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

// EF-92: a box's `lists.color` reaches the numbers of its ordered lists
// whenever the style sets it — also when it happens to equal the document's
// bullet colour, which an unset field inherits. Nested bullet levels keep
// the old rule: a box that repeats the document's bullet or colour leaves
// each level's own (a book's nested dashes survive).

const M = '#7a1f5c';
const G = '#2e7d32';
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

const config = (lists?: CalloutStyleConfig['lists']): PostextConfig => ({
  headings: { balancing: { enabled: false } },
  layout: { layoutType: 'single' },
  unorderedLists: { color: hex(M), levels: [{ level: 2, color: hex('#999999'), bulletChar: '◦' }] },
  orderedLists: { color: hex(G) },
  calloutStyles: [{ id: 'check', ...(lists ? { lists } : {}) }],
});

const MD = [
  ':::callout{type="check"}',
  '1. one',
  '2. two',
  '',
  '- first',
  '  - nested',
  ':::',
].join('\n');

const item = (doc: VDTDocument, text: string): VDTBlock => {
  const b = doc.blocks.find((x) => x.type === 'listItem' && x.lines.some((l) => l.text.includes(text)));
  if (!b) throw new Error(`no list item ${text}`);
  return b;
};

describe('EF-92: a box lists.color reaches its ordered-list numbers whenever it is set', () => {
  it('numbers take lists.color when the style sets it to the unordered-list colour', () => {
    const doc = buildDocument({ markdown: MD }, config({ color: hex(M) }));
    expect(item(doc, 'one').bulletColor?.toLowerCase()).toBe(M);
    expect(item(doc, 'two').bulletColor?.toLowerCase()).toBe(M);
  });

  it('nested bullet levels keep their own colour when the box repeats the document colour', () => {
    const doc = buildDocument({ markdown: MD }, config({ color: hex(M) }));
    expect(item(doc, 'first').bulletColor?.toLowerCase()).toBe(M);
    expect(item(doc, 'nested').bulletColor?.toLowerCase()).toBe('#999999');
  });

  it('a style that leaves lists.color unset keeps the document colours (numbers and levels)', () => {
    const doc = buildDocument({ markdown: MD }, config());
    expect(item(doc, 'one').bulletColor?.toLowerCase()).toBe(G);
    expect(item(doc, 'first').bulletColor?.toLowerCase()).toBe(M);
    expect(item(doc, 'nested').bulletColor?.toLowerCase()).toBe('#999999');
  });

  it('a lists.color that differs from the bullet colour colours numbers and every level (as before)', () => {
    const doc = buildDocument({ markdown: MD }, config({ color: hex('#123456') }));
    expect(item(doc, 'one').bulletColor?.toLowerCase()).toBe('#123456');
    expect(item(doc, 'nested').bulletColor?.toLowerCase()).toBe('#123456');
  });

  it('a box that repeats the document bullet keeps the nested levels\' own bullets', () => {
    const bullet = resolveAllConfig(config()).unorderedLists.bulletChar;
    const set = buildDocument({ markdown: MD }, config({ bulletChar: bullet }));
    expect(item(set, 'first').bulletText).toBe(bullet);
    expect(item(set, 'nested').bulletText).toBe('◦');
    // A different bullet replaces every level's, as before.
    const other = buildDocument({ markdown: MD }, config({ bulletChar: '▪' }));
    expect(item(other, 'nested').bulletText).toBe('▪');
  });

  it('the resolved style records whether it sets lists.color', () => {
    const resolved = resolveAllConfig(config());
    const r = (lists?: CalloutStyleConfig['lists']) => resolveCalloutStylesConfig(
      [{ id: 'x', ...(lists ? { lists } : {}) }], resolved.bodyText, resolved.headings, resolved.unorderedLists,
    )[0]!.lists;
    expect(r().colorSet).toBeUndefined();
    expect(r({ indent: { value: 1, unit: 'mm' } }).colorSet).toBeUndefined();
    expect(r({ color: hex(M) }).colorSet).toBe(true);
  });
});
