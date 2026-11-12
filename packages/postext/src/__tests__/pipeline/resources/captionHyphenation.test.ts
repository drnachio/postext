import { describe, it, expect } from 'vitest';
import { layoutResourceBlock } from '../../../pipeline/resources/resourceLayout.js';
import { snippetRuleBreaking } from '../../../pipeline/resources/resourceLayout/snippets.js';
import { hyphenBreaking } from '../../../pipeline/text/hyphenRules.js';
import { resolveAllConfig } from '../../../pipeline/config.js';
import { defaultResourceTypes } from '../../../defaults/resources/resourceTypes.js';
import { mergeCaptionStyle, resolveCaptionStyleConfig, stripCaptionStyleDefaults } from '../../../defaults/resources/captionStyle.js';
import { resolveTableStyleConfig, resolveTableStylesConfig, stripTableStyleDefaults } from '../../../defaults/resources/tableStyle.js';
import { resolveBodyTextConfig } from '../../../defaults/text/bodyText.js';
import type { KPItem, KPOptions } from '../../../knuthPlass/types.js';
import type { VDTLine } from '../../../vdt.js';
import type { CaptionStyleConfig, PostextConfig, Resource, ResourceType } from '../../../types.js';

// `hyphenation` on a caption, its note and a table (#1528): the text is set
// as running text, broken whole on the optimal breaker within the body's
// word-spacing limits, its words divided where a paragraph style with
// `hyphenation: true` divides them, under the body's hyphen and stack
// rules. A note and a caption take their own leading (`lineHeight`).
// Unset, every caption, note and cell is set as before.

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

const LONG = 'Typographers balance justification against hyphenation when narrow measures leave conspicuous rivers between extraordinarily long words in captions underneath illustrations.';

const figure: Resource = {
  id: 'fig',
  typeId: 'figure',
  kind: 'bitmap',
  caption: LONG,
  note: LONG,
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'fig.png', format: 'png', width: 400, height: 200 },
};

const table = (styleId?: string): Resource => ({
  id: 'tab',
  typeId: 'table',
  kind: 'table',
  caption: 'Cells.',
  createdAt: 0,
  updatedAt: 0,
  table: {
    model: { rows: [[{ content: 'Characteristics' }, { content: 'Explanation' }], [{ content: LONG }, { content: LONG }]] },
    ...(styleId ? { styleId } : {}),
  },
});

function layoutOf(resource: Resource, config: PostextConfig, width: number, types: ResourceType[] = defaultResourceTypes()) {
  const resolved = resolveAllConfig(config);
  const { block, totalHeight } = layoutResourceBlock({
    resource,
    resourceType: types.find((t) => t.id === resource.typeId),
    number: '1',
    resolved,
    columnWidth: width,
    resourceNumbering: { [resource.id]: { number: '1', typeId: resource.typeId, heading: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } } },
    resourceTypes: types,
    resources: [resource],
  });
  return { ...block, totalHeight };
}

function layout(captionStyle: CaptionStyleConfig | undefined, width = 300, extra: PostextConfig = {}) {
  return layoutOf(figure, { ...extra, ...(captionStyle ? { captionStyle } : {}) }, width);
}

const RAGGED: PostextConfig = { bodyText: { hyphenation: { ragged: true } } };
const painted = (line: VDTLine): number => (line.segments ?? []).reduce((w, s) => w + s.width, 0);
const shape = (lines: VDTLine[]) => lines.map((l) => [l.text, l.bbox.x, l.bbox.y, l.bbox.width, l.hyphenated ?? false]);
const cellShapes = (block: ReturnType<typeof layoutOf>) => block.table!.cells.map((c) => shape(c.lines));
const cellsHyphenated = (block: ReturnType<typeof layoutOf>) => block.table!.cells.some((c) => c.lines.some((l) => l.hyphenated));

/** How many dictionary syllables the optimal breaker is offered while `run`
 *  lays out (ragged text seldom takes one: its right-hand glue is loose). */
function offeredHyphens(run: () => void): number {
  let count = 0;
  (globalThis as { __postextKpTap?: unknown }).__postextKpTap = (items: KPItem[]) => {
    count += items.filter((it) => it.type === 'penalty' && it.flagged).length;
  };
  try {
    run();
  } finally {
    delete (globalThis as { __postextKpTap?: unknown }).__postextKpTap;
  }
  return count;
}

describe('captions and notes set as running text', () => {
  it('leaves every caption and note as it was by default', () => {
    for (const align of ['justify', 'left', 'center'] as const) {
      for (const extra of [{}, RAGGED, { bodyText: { stacks: 'avoid' } } as PostextConfig]) {
        const before = layout({ align, note: { align } }, 180, extra);
        const off = layout({ align, hyphenation: false, note: { align, hyphenation: false } }, 180, extra);
        expect(shape(off.captionLines), align).toEqual(shape(before.captionLines));
        expect(shape(off.noteLines), align).toEqual(shape(before.noteLines));
        expect(before.captionLines.some((l) => l.hyphenated), align).toBe(false);
      }
    }
    // The breaking of 1.79: line by line, or whole while stacks are avoided.
    expect(snippetRuleBreaking('justify', resolveAllConfig({}))).toEqual({});
    expect(snippetRuleBreaking('left', resolveAllConfig(RAGGED))).toEqual({});
    const stacks = resolveAllConfig({ bodyText: { stacks: 'avoid' } });
    expect(snippetRuleBreaking('left', stacks)).toEqual({ optimal: true, optimalRagged: true, stacks: expect.any(Object) });
  });

  it('divides words where a paragraph style with hyphenation divides them', () => {
    const hyphenated = (style: CaptionStyleConfig, extra?: PostextConfig) => layout(style, 180, extra).captionLines.some((l) => l.hyphenated);
    expect(hyphenated({ align: 'justify', hyphenation: true })).toBe(true);
    // Ragged, only with the body's ragged hyphenation, within its zone.
    expect(hyphenated({ align: 'left', hyphenation: true })).toBe(false);
    expect(offeredHyphens(() => layout({ align: 'left', hyphenation: true }, 180))).toBe(0);
    expect(offeredHyphens(() => layout({ align: 'left', hyphenation: true }, 180, RAGGED))).toBeGreaterThan(0);
    const fontSizePx = 16;
    expect(snippetRuleBreaking('left', resolveAllConfig({}), { fontSizePx })).toEqual({ optimal: true, optimalRagged: true });
    expect(snippetRuleBreaking('left', resolveAllConfig(RAGGED), { fontSizePx })).toEqual({ optimal: true, optimalRagged: true, hyphenate: true, hyphenationZonePx: 48 });
    // As a paragraph style that sets `hyphenation: true`, with the body's
    // hyphenation off too.
    expect(hyphenated({ align: 'justify', hyphenation: true }, { bodyText: { hyphenation: { enabled: false } } })).toBe(true);
    // Without the optimal breaker: line by line, words divided all the same.
    const greedy: PostextConfig = { bodyText: { optimalLineBreaking: false } };
    expect(snippetRuleBreaking('justify', resolveAllConfig(greedy), { fontSizePx })).toEqual({ hyphenate: true });
    expect(hyphenated({ align: 'justify', hyphenation: true }, greedy)).toBe(true);
  });

  it('sets a justified caption flush with both edges, the last line natural', () => {
    const lines = layout({ align: 'justify', hyphenation: true }).captionLines;
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines.slice(0, -1)) expect(line.bbox.x + painted(line)).toBeCloseTo(300, 6);
    expect(painted(lines[lines.length - 1]!)).toBeLessThan(300);
  });

  it('hands the line breaker the rules the body text gets', () => {
    const rules: PostextConfig = { bodyText: { stacks: 'avoid', hyphenation: { ladders: 'avoid', lastWord: 'avoid', fewerHyphens: 2 } } };
    const seen: KPOptions[] = [];
    (globalThis as { __postextKpTap?: unknown }).__postextKpTap = (_items: unknown, options: KPOptions) => { seen.push(options); };
    try {
      layout({ align: 'justify', hyphenation: true }, 180, rules);
    } finally {
      delete (globalThis as { __postextKpTap?: unknown }).__postextKpTap;
    }
    // The WebAssembly breaker reads these options (`wasm/abi.ts`) as the
    // TypeScript one does.
    const resolved = resolveAllConfig(rules);
    const expected = hyphenBreaking(resolved.bodyText.hyphenation);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toMatchObject({ ladders: expected.ladders, lastWordDemerits: expected.lastWordDemerits, extraHyphenPenalty: expected.extraHyphenPenalty, stacks: expect.any(Object) });
    expect(seen[0]!.maxStretchRatio).toBe(resolved.bodyText.maxWordSpacing);
  });

  it('sets the note as running text too, in its own leading', () => {
    const lines = layout({ note: { align: 'justify', hyphenation: true } }, 180).noteLines;
    expect(lines.some((l) => l.hyphenated)).toBe(true);
    for (const line of lines.slice(0, -1)) expect(line.bbox.x + painted(line)).toBeCloseTo(180, 6);
    const pitch = (lineHeight?: CaptionStyleConfig['lineHeight']) => {
      const ls = layout({ note: { fontSize: { value: 8, unit: 'pt' }, ...(lineHeight ? { lineHeight } : {}) } }, 180).noteLines;
      return ls[1]!.bbox.y - ls[0]!.bbox.y;
    };
    const natural = pitch();
    expect(pitch({ value: 20, unit: 'px' })).toBeCloseTo(20, 6);
    expect(pitch({ value: 2, unit: 'em' })).toBeCloseTo(pitch({ value: 1, unit: 'em' }) * 2, 6);
    expect(pitch({ value: 2, unit: 'em' })).toBeGreaterThan(natural);
    // The block grows with the note's leading.
    expect(layout({ note: { lineHeight: { value: 3, unit: 'em' } } }, 180).totalHeight).toBeGreaterThan(layout(undefined, 180).totalHeight);
  });

  it('keeps the numbered label whole and marked on the optimal breaker', () => {
    // The label is painted in its own colour from `captionLabel`, which the
    // Knuth–Plass lines must carry: with hyphenation, and with stacks
    // avoided, which also breaks captions whole.
    const stacks: PostextConfig = { bodyText: { stacks: 'avoid' } };
    for (const [style, extra] of [[{ align: 'justify', hyphenation: true }, {}], [{ align: 'left' }, stacks]] as const) {
      const segs = layout(style, 180, extra).captionLines[0]!.segments!;
      const label = segs.filter((s) => s.captionLabel && s.kind === 'text').map((s) => s.text).join('').replace(/ /g, ' ');
      expect(label).toBe('Figure 1.');
    }
  });

  it('takes its own leading', () => {
    const pitch = (lineHeight?: CaptionStyleConfig['lineHeight']) => {
      const lines = layout({ fontSize: { value: 8, unit: 'pt' }, ...(lineHeight ? { lineHeight } : {}) }, 180).captionLines;
      return lines[1]!.bbox.y - lines[0]!.bbox.y;
    };
    const natural = pitch();
    expect(pitch({ value: 20, unit: 'px' })).toBeCloseTo(20, 6);
    expect(pitch({ value: 2, unit: 'em' })).toBeGreaterThan(natural);
  });

  it('follows a resource type that sets it on its own captions', () => {
    const types = defaultResourceTypes().map((t) => (t.id === 'figure' ? { ...t, captionStyle: { align: 'justify' as const, hyphenation: true, note: { align: 'justify' as const, hyphenation: true } } } : t));
    const block = layoutOf(figure, {}, 180, types);
    expect(block.captionLines.some((l) => l.hyphenated)).toBe(true);
    expect(block.noteLines.some((l) => l.hyphenated)).toBe(true);
    // The document's other types keep their captions as before.
    const plain = layoutOf(table(), { captionStyle: { align: 'justify' } }, 180, types);
    expect(plain.captionLines.some((l) => l.hyphenated)).toBe(false);
  });
});

describe('table cells set as running text', () => {
  it('leaves every cell as it was by default', () => {
    for (const extra of [{}, RAGGED, { bodyText: { stacks: 'avoid' } } as PostextConfig]) {
      const before = layoutOf(table(), extra, 260);
      const off = layoutOf(table(), { ...extra, tableStyle: { hyphenation: false } }, 260);
      expect(cellShapes(off)).toEqual(cellShapes(before));
      expect(cellsHyphenated(before)).toBe(false);
    }
  });

  it('divides the words of a cell with the body ragged hyphenation', () => {
    // Cells are ragged: their words are offered for division with ragged
    // hyphenation on, the lines broken whole on the optimal breaker.
    expect(offeredHyphens(() => layoutOf(table(), { ...RAGGED, tableStyle: { hyphenation: true } }, 260))).toBeGreaterThan(0);
    expect(offeredHyphens(() => layoutOf(table(), { tableStyle: { hyphenation: true } }, 260))).toBe(0);
    expect(offeredHyphens(() => layoutOf(table(), RAGGED, 260))).toBe(0);
    // In a narrow column a long word is divided at a syllable.
    const narrow: PostextConfig = { bodyText: { hyphenation: { ragged: true, zone: { value: 0, unit: 'em' } } }, tableStyle: { hyphenation: true } };
    expect(cellsHyphenated(layoutOf(table(), narrow, 200))).toBe(true);
  });

  it('follows the named table style a table picks', () => {
    const config: PostextConfig = { ...RAGGED, tableStyles: [{ id: 'narrow', hyphenation: true }, { id: 'plain' }] };
    expect(offeredHyphens(() => layoutOf(table('narrow'), config, 260))).toBeGreaterThan(0);
    expect(offeredHyphens(() => layoutOf(table('plain'), config, 260))).toBe(0);
    expect(offeredHyphens(() => layoutOf(table(), config, 260))).toBe(0);
    // A named style inherits the document's table style, and may undo it.
    const global: PostextConfig = { ...RAGGED, tableStyle: { hyphenation: true }, tableStyles: [{ id: 'plain', hyphenation: false }] };
    expect(offeredHyphens(() => layoutOf(table(), global, 260))).toBeGreaterThan(0);
    expect(offeredHyphens(() => layoutOf(table('plain'), global, 260))).toBe(0);
  });
});

describe('hyphenation and lineHeight in the config', () => {
  const body = resolveBodyTextConfig(undefined);

  it('resolve to the behaviour before when unset', () => {
    const cs = resolveCaptionStyleConfig({}, body);
    expect(cs.hyphenation).toBe(false);
    expect(cs.note.hyphenation).toBe(false);
    expect('lineHeight' in cs).toBe(false);
    expect('lineHeight' in cs.note).toBe(false);
    expect(resolveTableStyleConfig({}, body).hyphenation).toBe(false);
  });

  it('are stripped at their defaults and kept otherwise', () => {
    expect(stripCaptionStyleDefaults({ hyphenation: false, note: { hyphenation: false } })).toBeUndefined();
    expect(stripCaptionStyleDefaults({ hyphenation: true, lineHeight: { value: 11, unit: 'pt' }, note: { hyphenation: true, lineHeight: { value: 1.2, unit: 'em' } } }))
      .toEqual({ hyphenation: true, lineHeight: { value: 11, unit: 'pt' }, note: { hyphenation: true, lineHeight: { value: 1.2, unit: 'em' } } });
    expect(stripTableStyleDefaults({ hyphenation: false })).toBeUndefined();
    expect(stripTableStyleDefaults({ hyphenation: true })).toEqual({ hyphenation: true });
  });

  it('a named table style inherits the document table style', () => {
    const [inherits, own] = resolveTableStylesConfig([{ id: 'a' }, { id: 'b', hyphenation: false }], { hyphenation: true }, body);
    expect(inherits!.hyphenation).toBe(true);
    expect(own!.hyphenation).toBe(false);
  });

  it('a resource type overrides them, and inherits them otherwise', () => {
    const base = resolveCaptionStyleConfig({ hyphenation: true, lineHeight: { value: 11, unit: 'pt' }, note: { lineHeight: { value: 1.1, unit: 'em' } } }, body);
    expect(mergeCaptionStyle(base, { align: 'justify' })).toMatchObject({ hyphenation: true, lineHeight: { value: 11, unit: 'pt' }, note: { lineHeight: { value: 1.1, unit: 'em' } } });
    expect(mergeCaptionStyle(base, { hyphenation: false, note: { hyphenation: true, lineHeight: { value: 9, unit: 'pt' } } }))
      .toMatchObject({ hyphenation: false, note: { hyphenation: true, lineHeight: { value: 9, unit: 'pt' } } });
  });
});
