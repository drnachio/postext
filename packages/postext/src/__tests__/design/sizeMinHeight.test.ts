import { describe, it, expect } from 'vitest';
import { measureHeadingAdvancedDesignHeight } from '../../pipeline/pages/headerFooter.js';
import { resolveHeadingsConfig } from '../../defaults/structure/headings.js';
import { resolveDesignSlot } from '../../defaults/structure/headerFooter.js';
import { layoutDesignSlot } from '../../design/layout.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import type { DesignElement } from '../../types.js';
import type { VDTPage } from '../../vdt.js';

// #1293: `size.minHeight` floors a fixed height or one that runs to an
// edge. A chapter opener's band runs down to the foot of its lead but is
// never shorter than the design's own, so a long title stays on the band.

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

const DPI = 72; // 1pt = 1px
const pt = (value: number) => ({ value, unit: 'pt' as const });
const page = { index: 0, pageLabel: '1' } as unknown as VDTPage;
const WIDTH = 320;

/** A title wrapping in 140 pt, a band from the container's top down to
 *  10 pt under the title (60 pt at least) and a foot hanging from it. */
const elements: DesignElement[] = [
  { kind: 'text', id: 'title', content: '{titleText}', fontSize: pt(20), lineHeight: 1, overflow: 'wrap', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(140) } } } as DesignElement,
  { kind: 'box', id: 'pad', placement: { anchor: { to: '#title', edge: 'below' }, size: { width: pt(0), height: pt(10) } }, style: {} },
  { kind: 'box', id: 'band', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill', height: { to: '#pad', edge: 'bottom' }, minHeight: pt(60) } }, style: { backgroundColor: { hex: '#2b4acb', model: 'hex' } } },
  { kind: 'box', id: 'foot', placement: { anchor: { to: '#band', edge: 'below' }, size: { width: 'fill', height: pt(2) } }, style: { backgroundColor: { hex: '#000000', model: 'hex' } } },
];
const heading = (titleText: string) => ({ titleText, formattedNumber: '', chapterNumber: '' });
const lay = (titleText: string, els = elements) => {
  const out = layoutDesignSlot(resolveDesignSlot({ elements: els }), {
    container: { x: 0, y: 0, width: WIDTH, height: 400 }, dpi: DPI,
    placeholders: { kind: 'heading', page, allPages: [page], metadata: {}, chapterTitleByPageIndex: [], heading: heading(titleText) },
  }, 0);
  const box = (id: string) => out.primitives[out.elementIds.indexOf(id)]!;
  return { band: box('band'), foot: box('foot'), title: box('title') };
};

describe('size.minHeight (#1293)', () => {
  it('keeps a band that runs to a short text at its least', () => {
    const { band, foot } = lay('Short');
    expect(band.height).toBeCloseTo(60, 5);
    expect(foot.y).toBeCloseTo(60, 5);
  });

  it('lets the band grow past it to reach a long text, the foot following', () => {
    const { band, foot, title } = lay('A title long enough to wrap onto four or five lines of the band it sits on');
    expect(title.y + title.height).toBeGreaterThan(60);
    expect(band.height).toBeCloseTo(title.y + title.height + 10, 5);
    expect(foot.y).toBeCloseTo(band.y + band.height, 5);
  });

  it('raises a fixed height and leaves a taller one alone', () => {
    const fixed = (height: number): DesignElement => ({ kind: 'box', id: 'band', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { height: pt(height), minHeight: pt(40) } }, style: {} });
    expect(lay('x', [fixed(20)]).band.height).toBeCloseTo(40, 5);
    expect(lay('x', [fixed(50)]).band.height).toBeCloseTo(50, 5);
  });

  it('makes a heading reserve as far as the grown band and its foot reach', () => {
    const level = resolveHeadingsConfig({ levels: [{ level: 1, advancedDesign: { enabled: true, slot: { elements } } }] }).levels.find((l) => l.level === 1)!;
    const reserve = (titleText: string) => measureHeadingAdvancedDesignHeight(level, heading(titleText), WIDTH, DPI, {}, 0);
    expect(reserve('Short')).toBeCloseTo(62, 5);
    const long = lay('A title long enough to wrap onto four or five lines of the band it sits on');
    expect(reserve('A title long enough to wrap onto four or five lines of the band it sits on')).toBeCloseTo(long.foot.y + long.foot.height, 5);
  });

  it('is a known size key: no unknown-key warning', () => {
    const warnings = collectConfigWarnings({ headings: { levels: [{ level: 1, advancedDesign: { enabled: true, slot: { elements } } }] } });
    expect(warnings.filter((w) => JSON.stringify(w).includes('minHeight'))).toEqual([]);
  });
});
