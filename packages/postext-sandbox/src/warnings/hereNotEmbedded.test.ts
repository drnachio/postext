import { describe, expect, it } from 'vitest';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource } from 'postext';
import { computeWarnings } from './compute.js';
import { warningCategory } from './categories.js';
import { DEFAULT_LABELS } from '../types/index.js';
import { detailFor, titleFor } from '../sidebar/WarningsPanel.js';

// A resource placed `here` that the text only cites (#1365) in the Checks
// panel: one warning at its `:ref`, among the figures.

describe('hereNotEmbedded in the Checks panel', () => {
  it('lists a here resource cited and never embedded', () => {
    const g = globalThis as unknown as { OffscreenCanvas?: unknown };
    g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (t: string) => ({ width: t.length * 7 }) }; } };
    const config: PostextConfig = {};
    const resources: Resource[] = [{
      id: 'plate', typeId: 'figure', kind: 'bitmap', caption: 'A plate.', createdAt: 0, updatedAt: 0,
      bitmap: { fileId: 'p', format: 'png', width: 400, height: 200 },
      placement: { position: 'here' },
    }];
    const markdown = 'Intro.\n\nAs :ref{id="plate"} shows, the light is seen from the bay.';
    const doc = buildDocument({ markdown, resources }, config);
    const found = computeWarnings({ markdown, config, doc, resources }).filter((w) => w.payload.kind === 'hereNotEmbedded');
    expect(found.map((w) => w.payload)).toEqual([{ kind: 'hereNotEmbedded', resourceId: 'plate' }]);
    expect(found[0]!.line).toBe(3);
    expect(warningCategory('hereNotEmbedded')).toBe('figures');
    expect(titleFor(found[0]!.payload, DEFAULT_LABELS)).toBe(DEFAULT_LABELS.warningsHereNotEmbeddedTitle);
    expect(detailFor(found[0]!.payload, DEFAULT_LABELS)).toContain('#plate');
  });
});
