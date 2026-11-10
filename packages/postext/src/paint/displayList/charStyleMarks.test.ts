// Character style decorations (`[…]|id|`) in the display list
// the page-faithful outputs read: the band under the text, the lines over it.

import { describe, expect, it } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import type { PostextConfig } from '../../index.js';
import { documentDisplayList } from './index.js';

// Deterministic stub: every character is 7 px wide.
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext() {
    return { font: '', measureText: (t: string) => ({ width: t.length * 7 }) };
  }
};

const mm = (value: number) => ({ value, unit: 'mm' as const });
const config = {
  page: { dpi: 72, width: mm(140), height: mm(200), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  characterStyles: [
    { id: 'rotulador', highlight: { enabled: true, color: { hex: '#ffe14d' }, opacity: 50 } },
    { id: 'sub', underline: { enabled: true, color: { hex: '#cc0000' } }, strike: { enabled: true } },
  ],
} as unknown as PostextConfig;

describe('character style marks in the display list', () => {
  it('paints the band before the text and the lines after it', () => {
    const doc = buildDocument({ markdown: 'Un [texto marcado]|rotulador| y [otro]|sub| aquí.' }, config);
    const items = documentDisplayList(doc)[0]!.items;
    const text = items.findIndex((i) => i.kind === 'text');
    const band = items.findIndex((i) => i.kind === 'rect' && i.fill?.toLowerCase() === '#fff0a6');
    expect(band).toBeGreaterThanOrEqual(0);
    expect(band).toBeLessThan(text);
    const rules = items.slice(text + 1).filter((i) => i.kind === 'rule');
    expect(rules.some((r) => r.kind === 'rule' && r.color.toLowerCase() === '#cc0000')).toBe(true);
    expect(rules.length).toBeGreaterThanOrEqual(2);
  });
});
