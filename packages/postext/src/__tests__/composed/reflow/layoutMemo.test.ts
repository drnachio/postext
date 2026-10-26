/**
 * The layout memo of a composed page (#972): the reflow ladder lays whole
 * frames again at every step, and a frame laid out in the same style at the
 * same width and height is answered from the memo. The answer must be the
 * layout that would have been made: these tests lay the same pages with the
 * memo off and on and compare everything the VDT carries, including what
 * the layout keeps by identity.
 */
import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { clearComposedPageMemo } from '../../../composed/pageMemo.js';
import { layoutMemoSwitch, createLayoutMemo, memoLayout, copyLayout } from '../../../pipeline/composedPages/layoutMemo.js';
import { widthLessEndIndent } from '../../../pipeline/blocks/buildHelpers.js';
import { isDesignedBoxHeading } from '../../../pipeline/callouts/calloutLayout.js';
import { page8Fixture } from '../fixtures/page8.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { PostextConfig, VDTBlock, VDTDocument } from '../../../index.js';

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

const TAB = {
  id: 'pestana',
  name: 'Pestaña',
  advancedDesign: {
    enabled: true,
    minHeight: mm(10),
    slot: { elements: [{ kind: 'box', id: 'tab', placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(-3), y: mm(-4) }, size: { width: mm(40), height: mm(8) } }, style: { backgroundColor: { hex: '#ffffff', model: 'hex' } } }] },
  },
};

/** The page-8 stand-in with its first box too short for its text: the
 *  ladder tries every step on it. */
function ladderPage(): { markdown: string; config: PostextConfig; resources: ReturnType<typeof page8Fixture>['resources'] } {
  const { markdown, config, resources } = page8Fixture('es');
  const base = config.pageTemplates![0]! as PageTemplate;
  const tpl: PageTemplate = { ...base, frames: base.frames!.map((f) => (f.name === 'dinero' ? { ...f, height: mm(36), minHeight: undefined } : f)) };
  const more = Array.from({ length: 4 }, (_, i) => `Más dinero ${i} `.repeat(30).trim()).join('\n\n');
  // The designed heading and the paragraph set off the foot are in a frame
  // that no step of the ladder changes: its later layouts come from the memo.
  const steady = ['## Cuentas {style="pestana"}', ':::paragraphs{align=end endIndent=2}\nFirmado\n:::'].join('\n\n');
  return {
    markdown: markdown.replace(/(:::frame\{slot="dinero"[^\n]*\n)/, `$1${more}\n\n`).replace(/(:::frame\{slot="ahorro"[^\n]*\n)/, `$1${steady}\n\n`),
    config: { ...config, headingStyles: [...(config.headingStyles ?? []), TAB as never], pageTemplates: [tpl] },
    resources,
  };
}

const allBlocks = (doc: VDTDocument): VDTBlock[] => doc.pages.flatMap((p) => [...p.columns.flatMap((c) => c.blocks), ...(p.floats ?? [])]);

function laid(on: boolean, f = ladderPage()): VDTDocument {
  layoutMemoSwitch.enabled = on;
  try {
    clearComposedPageMemo();
    return buildDocument({ markdown: f.markdown, resources: f.resources }, f.config, createMeasurementCache());
  } finally {
    layoutMemoSwitch.enabled = true;
  }
}

describe('the layout memo of a composed page (#972)', () => {
  it('lays out a ladder page as it would without the memo, identity-kept state included', () => {
    const off = laid(false);
    const on = laid(true);
    // The page went through the ladder.
    const overflow = (on.contentWarnings ?? []).find((w) => w.kind === 'frameOverflow');
    expect(overflow).toBeDefined();
    expect(JSON.stringify(on.pages)).toBe(JSON.stringify(off.pages));
    expect(JSON.stringify(on.contentWarnings)).toBe(JSON.stringify(off.contentWarnings));
    const a = allBlocks(off);
    const b = allBlocks(on);
    expect(b.length).toBe(a.length);
    // What the layout keeps by identity.
    expect(a.some((blk) => isDesignedBoxHeading(blk))).toBe(true);
    expect(a.some((blk) => widthLessEndIndent(blk, 1000) < 1000)).toBe(true);
    expect(b.map((blk) => isDesignedBoxHeading(blk))).toEqual(a.map((blk) => isDesignedBoxHeading(blk)));
    expect(b.map((blk) => widthLessEndIndent(blk, 1000))).toEqual(a.map((blk) => widthLessEndIndent(blk, 1000)));
  });

  it('answers layouts the ladder repeats from the memo, and none with the memo off', () => {
    layoutMemoSwitch.hits = 0;
    laid(false);
    expect(layoutMemoSwitch.hits).toBe(0);
    laid(true);
    expect(layoutMemoSwitch.hits).toBeGreaterThan(10);
  });
});

describe('memoLayout', () => {
  const result = () => ({
    frame: { id: 'f', bbox: { x: 0, y: 0, width: 10, height: 10 }, lines: [] },
    children: [] as VDTBlock[],
    units: [],
    width: 10, totalHeight: 10, marginTopPx: 0, marginBottomPx: 0, continuesMarkerPx: 0,
  }) as never;
  const ctx = () => ({ dropCapNotes: new Map(), joiningLetterSpacing: new Set<number>() }) as never;

  it('hands a mover its own copy and keeps the first answer untouched', () => {
    const memo = createMemo();
    const c = ctx();
    let laidTimes = 0;
    const compute = () => { laidTimes++; return result(); };
    const first = memoLayout(memo, 'k', c, false, compute);
    first.frame.bbox.x = 99;
    const second = memoLayout(memo, 'k', c, false, compute);
    second.frame.bbox.x = 50;
    const third = memoLayout(memo, 'k', c, false, compute);
    expect(laidTimes).toBe(1);
    expect(second.frame.bbox.x).toBe(50);
    expect(third.frame.bbox.x).toBe(0);
  });

  it('replays the notes a layout wrote to its context', () => {
    const memo = createMemo();
    const c = ctx() as unknown as { dropCapNotes: Map<number, unknown>; joiningLetterSpacing: Set<number> };
    memoLayout(memo, 'k', c as never, false, () => {
      c.dropCapNotes.set(3, { reason: 'inBox' });
      c.joiningLetterSpacing.add(4);
      return result();
    });
    c.dropCapNotes.clear();
    c.joiningLetterSpacing.clear();
    memoLayout(memo, 'k', c as never, false, () => { throw new Error('laid again'); });
    expect(c.dropCapNotes.get(3)).toEqual({ reason: 'inBox' });
    expect(c.joiningLetterSpacing.has(4)).toBe(true);
  });

  it('does not keep a layout that cannot be copied', () => {
    class Odd { x = 1; }
    const withOdd = () => { const r = result() as { frame: { odd?: unknown } }; r.frame.odd = new Odd(); return r as never; };
    expect(copyLayout(withOdd())).toBeNull();
    const memo = createMemo();
    let laidTimes = 0;
    for (let i = 0; i < 3; i++) memoLayout(memo, 'k', ctx(), false, () => { laidTimes++; return withOdd(); });
    expect(laidTimes).toBe(3);
  });

  it('keeps shared structure shared in the copy', () => {
    const r = result() as { frame: VDTBlock; children: VDTBlock[]; units: { kind: string; block: VDTBlock }[] };
    r.children.push(r.frame);
    r.units.push({ kind: 'block', block: r.frame });
    const c = copyLayout(r as never) as unknown as typeof r;
    expect(c.children[0]).toBe(c.frame);
    expect(c.units[0]!.block).toBe(c.frame);
    expect(c.frame).not.toBe(r.frame);
  });
});

function createMemo() { return createLayoutMemo(); }
