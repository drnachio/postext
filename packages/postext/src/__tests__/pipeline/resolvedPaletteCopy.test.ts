import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { resolveAllConfig } from '../../pipeline/config';
import type { PostextConfig, Resource, VDTDocument } from '../../index';

// EF-175: a configuration is resolved once per object and the result is
// cached against it. The resolved configuration used to keep the caller's
// `colorPalette` array itself, so a palette changed in place reached the
// colours resolved at layout time (inline swatches, table cell fills) and
// not the ones resolved up front (headings, bullets, chips, caption bars):
// one page mixed both palettes. It now keeps a copy.

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

const RED = '#d7263d';
const TEAL = '#2a9d8f';
const band = { hex: RED, model: 'hex' as const, paletteId: 'band' };

const table: Resource = {
  id: 't',
  typeId: 'table',
  kind: 'table',
  createdAt: 0,
  updatedAt: 0,
  placement: { position: 'here' },
  table: { model: { rows: [[{ content: 'a', background: band }]] } },
};

const colours = (doc: VDTDocument) => {
  const blocks = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks));
  const heading = blocks.find((b) => b.type === 'heading')!;
  const swatch = blocks.flatMap((b) => b.lines).flatMap((l) => l.segments ?? []).find((s) => s.kind === 'swatch')!;
  const cell = blocks.find((b) => b.resourceBlock?.table)!.resourceBlock!.table!.cells[0]!;
  return { heading: heading.color?.toLowerCase(), swatch: swatch.swatch?.color?.toLowerCase(), cell: cell.background?.toLowerCase() };
};

describe('EF-175: the resolved configuration keeps its own copy of the palette', () => {
  it('does not hold the caller\'s palette array or its entries', () => {
    const config: PostextConfig = { colorPalette: [{ id: 'band', name: 'Band', value: { hex: RED, model: 'hex' } }] };
    const resolved = resolveAllConfig(config);
    expect(resolved.colorPalette).toEqual(config.colorPalette);
    expect(resolved.colorPalette).not.toBe(config.colorPalette);
    expect(resolved.colorPalette![0]).not.toBe(config.colorPalette![0]);
    expect(resolved.colorPalette![0]!.value).not.toBe(config.colorPalette![0]!.value);
  });

  it('a palette changed in place gives one consistent result on the next build', () => {
    const config: PostextConfig = {
      header: { elements: [] },
      footer: { elements: [] },
      colorPalette: [{ id: 'band', name: 'Band', value: { hex: RED, model: 'hex' } }],
      headings: { levels: [{ level: 1, color: band }] },
    };
    const content = { markdown: '# Title\n\nA :swatch{color="band"} key.\n\n::resource{id="t"}\n', resources: [table] };
    const first = colours(buildDocument(content, config));
    expect(first).toEqual({ heading: RED, swatch: RED, cell: RED });
    config.colorPalette![0]!.value.hex = TEAL;
    const second = colours(buildDocument(content, config));
    // Same object, same resolution: every colour keeps the first palette.
    expect(second).toEqual(first);
    // A new object is resolved afresh: every colour takes the new palette.
    const third = colours(buildDocument(content, { ...config }));
    expect(third).toEqual({ heading: TEAL, swatch: TEAL, cell: TEAL });
  });
});
