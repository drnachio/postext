import { describe, expect, it } from 'vitest';
import { buildDocument } from 'postext';
import type { ContentWarning, PostextConfig, Resource } from 'postext';
import { computeWarnings } from './compute.js';
import { warningCategory } from './categories.js';
import { DEFAULT_LABELS } from '../types/index.js';
import { detailFor, titleFor } from '../sidebar/WarningsPanel.js';

// A float set by hand that is not where its pin asks (#1494) in the Checks
// panel: among the figures, with the reason the layout gives.

describe('floatPinMissed in the Checks panel', () => {
  const g = globalThis as unknown as { OffscreenCanvas?: unknown };
  g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (t: string) => ({ width: t.length * 7 }) }; } };
  const config: PostextConfig = {};
  const resources: Resource[] = [{
    id: 'plate', typeId: 'figure', kind: 'bitmap', caption: 'A plate.', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: 'p', format: 'png', width: 400, height: 200 },
    placement: { pin: { page: 0, slot: 'top' } },
  }];
  const markdown = 'Intro.\n\nAs :ref{id="plate"} shows, the light is seen from the bay.';

  /** The Checks of a layout that reported `w`. */
  const checks = (w: ContentWarning) => {
    const doc = buildDocument({ markdown, resources }, config);
    doc.contentWarnings = [...(doc.contentWarnings ?? []).filter((x) => x.kind !== 'floatPinMissed'), w];
    return computeWarnings({ markdown, config, doc, resources }).filter((x) => x.payload.kind === 'floatPinMissed');
  };

  it('lists each reason with the page the float went to', () => {
    const [notTaken] = checks({ kind: 'floatPinMissed', resourceId: 'plate', reason: 'notTaken', pageIndex: 1, sourceStart: 11, sourceEnd: 30 });
    expect(notTaken!.payload).toEqual({ kind: 'floatPinMissed', resourceId: 'plate', reason: 'notTaken', page: 2 });
    expect(notTaken!.line).toBe(3);
    expect(warningCategory('floatPinMissed')).toBe('figures');
    expect(titleFor(notTaken!.payload, DEFAULT_LABELS)).toBe(DEFAULT_LABELS.warningsFloatPinMissedTitle);
    expect(detailFor(notTaken!.payload, DEFAULT_LABELS)).toBe(`#plate — ${DEFAULT_LABELS.warningsFloatPinMissedDetail.replace('__page__', '2')}`);
    const [tooFar] = checks({ kind: 'floatPinMissed', resourceId: 'plate', reason: 'tooFar', pageIndex: 0 });
    expect(detailFor(tooFar!.payload, DEFAULT_LABELS)).toContain('more than 3 pages');
    const [column] = checks({ kind: 'floatPinMissed', resourceId: 'plate', reason: 'column', pageIndex: 0 });
    expect(detailFor(column!.payload, DEFAULT_LABELS)).toContain('column page 1 does not have');
    const [unsupported] = checks({ kind: 'floatPinMissed', resourceId: 'plate', reason: 'unsupported' });
    expect(unsupported!.payload).toEqual({ kind: 'floatPinMissed', resourceId: 'plate', reason: 'unsupported' });
    expect(detailFor(unsupported!.payload, DEFAULT_LABELS)).toContain('the pin is ignored');
  });
});
