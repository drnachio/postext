import { describe, it, expect } from 'vitest';
import { buildDocument } from '../index';
import { createMeasurementCache } from '../measure';
import type { PostextConfig, Resource, ResourcePlacement } from '../types';
class StubCtx { font = ''; measureText(s: string) { return { width: s.length * 5 }; } }
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class { getContext() { return new StubCtx(); } };
const pt = (value: number) => ({ value, unit: 'pt' as const });
const pic = (id: string, placement: ResourcePlacement) => ({ id, typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: id, format: 'png', width: 300, height: 400 }, caption: 'Cap', placement });
// A page-wide floated box at the end of a section (#515): whatever the copy
// leaves of the section's last page, the box is set somewhere, never lost.
// The real case (cookbook Nº 136) dropped it when column balancing spliced
// a segment from a pass that had drained the box onto another page.
describe('floated boxes survive column balancing', () => {
it('sets a closing page-wide box on some page for any length of copy', () => {
  let lost = 0;
  let runs = 0;
  for (let a = 4; a <= 40; a += 3) for (const b of [3, 6, 9, 12]) {
    runs++;
    const p = (n: number) => 'Body text that runs on for a while and keeps going. '.repeat(n);
    const md = `# Stage\n\n## Review\n\n${p(a)}\n\n::resource{id="act"}\n\n${p(b)}\n\n## Band\n\n${p(b)}\n\n## Show\n\n${p(b)}\n\n## Letters\n\n${p(a)}\n\n:::callout{span="page" placement="bottom" title="Ads"}\n:::columns{count=4 breaks="2,3,4"}\nOne ad here.\n\nTwo ad here.\n\nThree ad.\n\nFour ad.\n:::\n:::\n\n# Sport\n\n${p(10)}`;
    const doc = buildDocument({ markdown: md, resources: [pic('act', { position: 'top', span: 'column', columns: 2 })] as unknown as Resource[] }, {
      page: { dpi: 72, width: pt(600), height: pt(800), margins: { top: pt(30), bottom: pt(30), left: pt(30), right: pt(30) } },
      layout: { layoutType: 'multiple', columnCount: 4, columnRule: { enabled: true } },
      bodyText: { fontSize: pt(9), lineHeight: pt(11) },
      headings: { levels: [{ level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' } }, { level: 2, fontSize: pt(16), lineHeight: pt(18), marginTop: pt(11) }] },
    } as unknown as PostextConfig, createMeasurementCache());
    if (!doc.blocks.some((x) => x.type === 'callout')) lost++;
  }
  expect(runs).toBe(52);
  expect(lost).toBe(0);
});
});
