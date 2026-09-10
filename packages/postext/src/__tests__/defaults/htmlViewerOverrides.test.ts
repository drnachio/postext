import { describe, it, expect } from 'vitest';
import {
  applyHtmlViewerOverrides,
  mergeConfigOverrides,
  resolveHtmlViewerConfig,
  stripHtmlViewerDefaults,
} from '../../defaults/htmlViewer';
import type { DesignElement, PostextConfig } from '../../types';

const mm = (value: number) => ({ value, unit: 'mm' as const });

const band: DesignElement = {
  kind: 'box', id: 'band',
  placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill', height: mm(10) } },
  style: { backgroundColor: { hex: '#9bcdbf', model: 'hex' } },
};
const title: DesignElement = {
  kind: 'text', id: 'title', content: '{titleText}', fontSize: mm(6), overflow: 'wrap',
  placement: { anchor: { to: 'container', edge: 'top-left' } },
};

const base: PostextConfig = {
  page: { margins: { top: mm(20), bottom: mm(15), left: mm(15), right: mm(15) } },
  headings: {
    fontFamily: 'Optima',
    levels: [
      { level: 1, fontSize: mm(8), advancedDesign: { enabled: true, slot: { elements: [band, title] }, minHeight: mm(59) } },
      { level: 2, fontSize: mm(4), textTransform: 'uppercase' },
    ],
  },
  parts: { margins: { top: mm(76), bottom: mm(20), left: mm(43), right: mm(25) }, design: { elements: [band] } },
  calloutStyles: [{ id: 'note', name: 'Note' }],
};

describe('mergeConfigOverrides', () => {
  it('merges objects recursively, keeping untouched siblings', () => {
    const merged = mergeConfigOverrides(base, { parts: { margins: { top: mm(60) } } });
    expect(merged.parts?.margins).toEqual({ top: mm(60), bottom: mm(20), left: mm(43), right: mm(25) });
    expect(merged.parts?.design).toBe(base.parts?.design);
    expect(merged.page).toBe(base.page);
  });

  it('merges heading levels by level number and appends unknown levels', () => {
    const merged = mergeConfigOverrides(base, {
      headings: {
        levels: [
          { level: 1, advancedDesign: { enabled: true, slot: { elements: [title] }, minHeight: mm(0) } },
          { level: 3, fontSize: mm(3) },
        ],
      },
    });
    const levels = merged.headings!.levels!;
    expect(levels.map((l) => l.level)).toEqual([1, 2, 3]);
    // Level 1 keeps its size, swaps the slot wholesale and drops the min height.
    expect(levels[0]).toMatchObject({ level: 1, fontSize: mm(8) });
    expect(levels[0]!.advancedDesign!.slot!.elements).toEqual([title]);
    expect(levels[0]!.advancedDesign!.minHeight).toEqual(mm(0));
    // Level 2 is untouched; the group-level font family survives.
    expect(levels[1]).toBe(base.headings!.levels![1]);
    expect(merged.headings!.fontFamily).toBe('Optima');
  });

  it('replaces every other array wholesale', () => {
    const merged = mergeConfigOverrides(base, {
      parts: { design: { elements: [title] } },
      calloutStyles: [],
    });
    expect(merged.parts!.design!.elements).toEqual([title]);
    expect(merged.calloutStyles).toEqual([]);
  });

  it('does not mutate its inputs', () => {
    const snapshot = JSON.stringify(base);
    const overrides = { parts: { margins: { top: mm(1) } } };
    const overridesSnapshot = JSON.stringify(overrides);
    mergeConfigOverrides(base, overrides);
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(JSON.stringify(overrides)).toBe(overridesSnapshot);
  });
});

describe('applyHtmlViewerOverrides', () => {
  it('returns the very same config when there is nothing to apply', () => {
    expect(applyHtmlViewerOverrides(base)).toBe(base);
    const withEmpty: PostextConfig = { ...base, htmlViewer: { maxCharsPerLine: 60, overrides: {} } };
    expect(applyHtmlViewerOverrides(withEmpty)).toBe(withEmpty);
  });

  it('applies the overrides once and consumes them', () => {
    const cfg: PostextConfig = {
      ...base,
      htmlViewer: { maxCharsPerLine: 60, overrides: { parts: { margins: { top: mm(60) } } } },
    };
    const applied = applyHtmlViewerOverrides(cfg);
    expect(applied.parts?.margins?.top).toEqual(mm(60));
    expect(applied.htmlViewer).toEqual({ maxCharsPerLine: 60 });
    // Idempotent: a second pass has nothing left to merge.
    expect(applyHtmlViewerOverrides(applied)).toBe(applied);
  });
});

describe('htmlViewer overrides through resolve / strip', () => {
  it('survives resolveHtmlViewerConfig and stripHtmlViewerDefaults', () => {
    const overrides = { parts: { margins: { top: mm(60) } } };
    expect(resolveHtmlViewerConfig({ overrides }).overrides).toBe(overrides);
    expect(resolveHtmlViewerConfig({ overrides: {} })).not.toHaveProperty('overrides');
    expect(stripHtmlViewerDefaults({ overrides })).toEqual({ overrides });
    expect(stripHtmlViewerDefaults({ overrides: {} })).toBeUndefined();
  });
});
