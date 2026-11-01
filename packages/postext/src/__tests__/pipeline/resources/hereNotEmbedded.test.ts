import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { formatWarning } from '../../../pipeline/contentWarnings/formatWarning.js';
import { continuationAfter } from '../../../pipeline/continuation.js';
import type { VDTDocument } from '../../../vdt.js';
import type { PostextConfig, Resource } from '../../../types.js';

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
const CONFIG: PostextConfig = {
  page: { width: mm(160), height: mm(240), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
};

const figure = (position: 'here' | 'top'): Resource => ({
  id: 'fig', typeId: 'figure', kind: 'bitmap', caption: 'Una figura.', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'fig.png', format: 'png', width: 400, height: 200 },
  placement: { position },
});

const CITED = 'Antes del texto.\n\nComo muestra la :ref{id="fig"}, el faro se ve desde la bahía.\n\nDespués.';

const build = (markdown: string, r: Resource, continuation?: Parameters<typeof buildDocument>[0]['continuation']): VDTDocument =>
  buildDocument({ markdown, resources: [r], ...(continuation ? { continuation } : {}) }, CONFIG, createMeasurementCache());

const hereWarnings = (doc: VDTDocument) => (doc.contentWarnings ?? []).filter((w) => w.kind === 'hereNotEmbedded');
/** Whether the figure is on a page: in the text or among the floats. */
const placed = (doc: VDTDocument): boolean =>
  doc.pages.some((p) => [...p.columns.flatMap((c) => c.blocks), ...(p.floats ?? [])].some((b) => b.type === 'resource'));

describe('a resource placed here that the text only cites (#1365)', () => {
  it('is reported at its first :ref, as on no page', () => {
    const doc = build(CITED, figure('here'));
    expect(placed(doc)).toBe(false);
    const found = hereWarnings(doc);
    expect(found).toHaveLength(1);
    const w = found[0]!;
    expect(w).toMatchObject({ kind: 'hereNotEmbedded', resourceId: 'fig' });
    expect(CITED.slice(w.sourceStart, w.sourceEnd)).toContain(':ref');
    expect(formatWarning(w)).toContain('"fig"');
  });

  it('says nothing once the resource is embedded', () => {
    const doc = build(`${CITED}\n\n::resource{id="fig"}`, figure('here'));
    expect(placed(doc)).toBe(true);
    expect(hereWarnings(doc)).toHaveLength(0);
  });

  it('says nothing for a floating resource, which the :ref places', () => {
    const doc = build(CITED, figure('top'));
    expect(placed(doc)).toBe(true);
    expect(hereWarnings(doc)).toHaveLength(0);
  });

  it('says nothing for one an earlier chapter placed', () => {
    const before = continuationAfter({ markdown: '::resource{id="fig"}', resources: [figure('here')] }, CONFIG);
    const doc = build(CITED, figure('here'), before);
    expect(hereWarnings(doc)).toHaveLength(0);
  });
});
