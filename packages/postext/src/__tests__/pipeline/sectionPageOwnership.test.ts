import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { VDTDocument, VDTPage } from '../../vdt';
import type { HeadingBreakParity, HeadingStyleConfig, PostextConfig } from '../../types';

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

/**
 * Which styled section a page belongs to — its running heads and palette —
 * as the configuration docs state it ("Heading styles": a page where
 * sections meet; blank pages). Each section's header prints its tab, in the
 * palette colour `band` the section overrides.
 */

const pt = (value: number) => ({ value, unit: 'pt' as const });

const COLORS: Record<string, string> = { A: '#aa0000', B: '#00aa00', C: '#0000aa' };
const tabStyle = (letter: string): HeadingStyleConfig => ({
  id: `L${letter}`,
  palette: { band: COLORS[letter]! },
  header: {
    elements: [{
      kind: 'text', id: 'tab', content: `TAB ${letter}`, fontSize: pt(8), overflow: 'clip',
      color: { hex: '#888888', model: 'hex', paletteId: 'band' },
      placement: { anchor: { to: 'page', edge: 'top-right' } },
    }],
  },
});

const config = (parity?: HeadingBreakParity): PostextConfig => ({
  page: { dpi: 96, sizePreset: '17x24' },
  layout: { layoutType: 'single' },
  colorPalette: [
    { id: 'main-color', name: 'Main', value: { hex: '#222222', model: 'hex' } },
    { id: 'band', name: 'Band', value: { hex: '#888888', model: 'hex' } },
  ],
  header: {
    elements: [{ kind: 'text', id: 'doc', content: 'DOCUMENT', fontSize: pt(8), overflow: 'clip', placement: { anchor: { to: 'page', edge: 'top-left' } } }],
  },
  footer: { elements: [] },
  headings: {
    balancing: { enabled: false },
    levels: [{ level: 1, breakBefore: parity ? { enabled: true, parity } : { enabled: false } }],
  },
  headingStyles: [tabStyle('A'), tabStyle('B'), tabStyle('C')],
});

const LONG = 'Entry text goes on for a while. '.repeat(60);
const SHORT = 'A short entry.';

const build = (markdown: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown }, cfg, createMeasurementCache());

/** Header text of a page, and the colour its section tab was painted in. */
function head(page: VDTPage): { text: string; tabColor?: string } {
  const blocks = page.header?.blocks ?? [];
  const texts = blocks.flatMap((b) => ('lines' in b ? (b.lines as { text: string }[]).map((l) => l.text) : []));
  const tab = blocks.find((b) => 'lines' in b && (b.lines as { text: string }[]).some((l) => l.text.startsWith('TAB')));
  return { text: texts.join('|'), ...(tab && 'color' in tab ? { tabColor: String((tab as { color: string }).color) } : {}) };
}

describe('which section a page belongs to (EF-43)', () => {
  it('a page where two sections start takes the running heads and palette of the last one', () => {
    const doc = build(`# A {style="LA"}\n\n${SHORT}\n\n# B {style="LB"}\n\n${LONG}`, config());
    expect(head(doc.pages[0]!)).toEqual({ text: 'TAB B', tabColor: COLORS.B });
  });

  it('a section that ends mid-page leaves the page to what follows it', () => {
    // A runs onto page 2; an unstyled H1 closes it there.
    const doc = build(`# A {style="LA"}\n\n${LONG.repeat(4)}\n\n# Plain\n\n${LONG}`, config());
    const plainPage = doc.blocks.find((b) => b.type === 'heading' && b.lines.some((l) => l.text.includes('Plain')))!.pageIndex;
    expect(plainPage).toBeGreaterThan(0);
    expect(head(doc.pages[0]!).text).toBe('TAB A');
    expect(head(doc.pages[plainPage]!).text).toBe('DOCUMENT');
  });

  it("the separator blank of an 'always-odd' break belongs to the section before it", () => {
    const doc = build(`# A {style="LA"}\n\n${SHORT}\n\n# B {style="LB"}\n\n${SHORT}`, config('always-odd'));
    const blank = doc.pages.findIndex((p) => p.blankForForce);
    expect(blank).toBe(1);
    expect(head(doc.pages[blank]!)).toEqual({ text: 'TAB A', tabColor: COLORS.A });
    expect(head(doc.pages[2]!).text).toBe('TAB B');
  });

  it("a parity blank ('odd') belongs to the section after it", () => {
    const doc = build(`# A {style="LA"}\n\n${SHORT}\n\n# B {style="LB"}\n\n${SHORT}`, config('odd'));
    const blank = doc.pages.findIndex((p) => p.blankForParity);
    expect(blank).toBe(1);
    expect(head(doc.pages[blank]!)).toEqual({ text: 'TAB B', tabColor: COLORS.B });
  });
});
