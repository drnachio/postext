import { describe, it, expect } from 'vitest';
import { layoutDesignSlot } from '../../design/layout';
import { resolveDesignPlaceholders, type DesignPlaceholderContext } from '../../design/placeholders';
import { resolveDesignSlot } from '../../defaults/headerFooter';
import { computeChapterTitles } from '../../pipeline/placeholders';
import type { DesignElement } from '../../types';
import type { VDTBlock, VDTLine, VDTPage } from '../../vdt';

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

const DPI = 72; // 1pt = 1px keeps the arithmetic readable.
const pt = (value: number) => ({ value, unit: 'pt' as const });
const stubPage = (index: number) => ({ index, pageLabel: String(index + 1) } as unknown as VDTPage);

describe('running heads — {chapterNumber} in header/footer slots', () => {
  it('resolves from the per-page chapter number table', () => {
    const pages = [stubPage(0), stubPage(1)];
    const ctx: DesignPlaceholderContext = {
      kind: 'header',
      page: pages[1]!,
      allPages: pages,
      metadata: {},
      chapterTitleByPageIndex: ['Intro', 'Intro'],
      chapterNumberByPageIndex: ['1', '1'],
    };
    expect(resolveDesignPlaceholders('CAPÍTULO {chapterNumber}', ctx).text).toBe('CAPÍTULO 1');
    expect(resolveDesignPlaceholders('{chapterNumber}', { ...ctx, kind: 'footer' }).text).toBe('1');
  });
});

describe('running heads — {chapterTitle} from a wrapped H1', () => {
  const line = (text: string, hyphenated = false): VDTLine => ({
    text,
    bbox: { x: 0, y: 0, width: 0, height: 0 },
    baseline: 0,
    hyphenated,
  });
  const h1 = (lines: VDTLine[]): VDTBlock => ({
    id: 'h1',
    type: 'heading',
    bbox: { x: 0, y: 0, width: 0, height: 0 },
    lines,
    pageIndex: 0,
    columnIndex: 0,
    dirty: false,
    snappedToGrid: false,
    fontString: '',
    color: '',
    textAlign: 'left',
    headingLevel: 1,
  });

  it('rejoins wrapped lines with a single space even when they keep their trailing space token', () => {
    const block = h1([line('Concepto de salud y '), line('enfermedad. Salud '), line('comunitaria')]);
    expect(computeChapterTitles([block], 1)).toEqual(['Concepto de salud y enfermedad. Salud comunitaria']);
  });

  it('continues a hyphenated line without the break mark or a space', () => {
    const block = h1([line('Terapia ocupa-', true), line('cional comunitaria')]);
    expect(computeChapterTitles([block], 1)).toEqual(['Terapia ocupacional comunitaria']);
  });
});

describe('running heads — letter-spacing on design text', () => {
  const container = { x: 0, y: 0, width: 400, height: 80 };
  const placeholders: DesignPlaceholderContext = {
    kind: 'header',
    page: stubPage(0),
    allPages: [stubPage(0)],
    metadata: {},
    chapterTitleByPageIndex: [],
  };
  const text = (letterSpacing?: { value: number; unit: 'pt' }): DesignElement => ({
    kind: 'text',
    id: 't',
    content: 'SECCIÓN I', // 9 chars → 63px untracked at 7px/char
    fontSize: pt(10),
    overflow: 'ellipsis-end',
    placement: { anchor: { to: 'container', edge: 'top-left' } },
    ...(letterSpacing ? { letterSpacing } : {}),
  });
  const layout = (el: DesignElement) =>
    layoutDesignSlot(resolveDesignSlot({ elements: [el] }), { container, dpi: DPI, placeholders }, 0).primitives[0]!;

  it('widens the element by one tracking unit per character and reports the tracking', () => {
    const plain = layout(text());
    const tracked = layout(text(pt(0.5)));
    expect(plain.width).toBe(63);
    expect(tracked.width).toBeCloseTo(63 + 9 * 0.5);
    expect(plain.kind === 'text' && plain.letterSpacingPx).toBe(0);
    expect(tracked.kind === 'text' && tracked.letterSpacingPx).toBeCloseTo(0.5);
  });
});
