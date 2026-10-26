// #945: the design element editors write and read a size that runs to an
// edge (`{ to, edge }`) instead of showing it as a fill, and the image
// editor offers the cover focus point.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { resolveDesignSlot, type DesignElement } from 'postext';
import { SandboxStoreContext } from '../../../../context/SandboxContext.js';
import { DEFAULT_LABELS } from '../../../../types/defaultLabels.js';
import { SlotEditor } from './SlotEditor.js';
import { defaultSizeTo, isSizeTo, sizeTargets, sizeToFor } from './sizeTo.js';
import type { SlotKind } from './placementAdapter.js';

const mm = (value: number) => ({ value, unit: 'mm' as const });

function render(slotKey: SlotKind, elements: DesignElement[], frames?: { name: string; kind: 'frame' | 'group' }[]): string {
  const state = {
    config: {},
    resources: [{ id: 'hero', typeId: 'foto', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'hero.png', format: 'png', width: 4, height: 2 } }],
    labels: DEFAULT_LABELS,
    locale: 'en',
  };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  return renderToString(
    h(SandboxStoreContext, { value: store as never },
      h(SlotEditor, { slotKey, raw: { elements }, resolved: resolveDesignSlot({ elements }, 'part'), onUpdate: () => {}, frames })),
  );
}

const anchor = { to: 'container', edge: 'top-left' } as const;
const box = (size: object): DesignElement => ({ kind: 'box', id: 'ground', placement: { anchor, size }, style: {} } as DesignElement);
const rule = (size: object, direction = 'horizontal'): DesignElement => ({ kind: 'rule', id: 'r', direction, placement: { anchor, size } } as unknown as DesignElement);
const text = (size: object): DesignElement => ({ kind: 'text', id: 't', content: 'x', fontSize: { value: 10, unit: 'pt' }, placement: { anchor, size } } as DesignElement);
const image = (extra: object): DesignElement => ({ kind: 'image', id: 'i', resourceId: 'hero', placement: { anchor, size: { width: mm(70), height: mm(55) } }, ...extra } as DesignElement);

describe('sizes that run to an edge (#945)', () => {
  it('knows a size to an edge from a length, auto and fill', () => {
    expect(isSizeTo({ to: 'bleed', edge: 'bottom' })).toBe(true);
    expect(isSizeTo(mm(5))).toBe(false);
    expect(isSizeTo('fill')).toBe(false);
    expect(isSizeTo('auto')).toBe(false);
    expect(isSizeTo(undefined)).toBe(false);
  });

  it('starts a side at the far edge of its container, and keeps an edge that fits the side', () => {
    expect(defaultSizeTo('width')).toEqual({ to: 'container', edge: 'right' });
    expect(defaultSizeTo('height')).toEqual({ to: 'container', edge: 'bottom' });
    expect(sizeToFor('height', 'bleed', 'top')).toEqual({ to: 'bleed', edge: 'top' });
    // A width cannot stop at a top edge.
    expect(sizeToFor('width', '#band', 'top')).toEqual({ to: '#band', edge: 'right' });
    expect(sizeToFor('width', 'page', 'left')).toEqual({ to: 'page', edge: 'left' });
  });

  it('offers the container, the page, the bleed, the outer margin of running heads, the other elements and the frames', () => {
    const siblings = [{ id: 'band', kind: 'box' as const, index: 0 }];
    const frames = [{ name: 'dinero', kind: 'frame' as const }, { name: 'cards', kind: 'group' as const }];
    expect(sizeTargets('part', siblings, frames).map((t) => t.value)).toEqual(['container', 'page', 'bleed', '#band', '#dinero', '#cards']);
    expect(sizeTargets('header', [], []).map((t) => t.value)).toEqual(['container', 'page', 'bleed', 'outer']);
  });

  it('shows a box height that runs to the bleed as a target and an edge, not as a length', () => {
    const html = render('part', [box({ width: mm(40), height: { to: 'bleed', edge: 'bottom' } })]);
    expect(html).toContain(DEFAULT_LABELS.headerFooterSizeToHeight);
    expect(html).toContain(DEFAULT_LABELS.headerFooterAnchorToBleed);
    expect(html).toContain(DEFAULT_LABELS.headerFooterFrameEdgeBottom);
    // The width keeps its length field and offers the target picker, set to none.
    expect(html).toContain(DEFAULT_LABELS.headerFooterSizeToWidth);
    expect(html).toContain(DEFAULT_LABELS.headerFooterSizeToNone);
  });

  it('names a frame or a group of the template a size runs to', () => {
    const html = render('part', [box({ width: mm(40), height: { to: '#dinero', edge: 'bottom' } })], [{ name: 'dinero', kind: 'frame' }]);
    expect(html).toContain(DEFAULT_LABELS.headerFooterSizeToFrame.replace('__name__', 'dinero'));
    const group = render('part', [box({ width: { to: '#cards', edge: 'right' }, height: mm(10) })], [{ name: 'cards', kind: 'group' }]);
    expect(group).toContain(DEFAULT_LABELS.headerFooterSizeToGroup.replace('__name__', 'cards'));
  });

  it('keeps a target that is no longer there selectable', () => {
    const html = render('part', [box({ width: mm(40), height: { to: '#gone', edge: 'bottom' } })]);
    expect(html).toContain(DEFAULT_LABELS.headerFooterImageMissing.replace('__id__', 'gone'));
  });

  it('reads a text width to an edge as its own mode', () => {
    const html = render('part', [text({ width: { to: 'page', edge: 'right' } })]);
    expect(html).toContain(DEFAULT_LABELS.headerFooterElementSizeToEdge);
    expect(html).toContain(DEFAULT_LABELS.headerFooterAnchorToPage);
    expect(html).toContain(DEFAULT_LABELS.headerFooterFrameEdgeRight);
    const plain = render('part', [text({ width: mm(40) })]);
    expect(plain).not.toContain(DEFAULT_LABELS.headerFooterSizeToEdge);
  });

  it('offers the rule a length to an edge in the direction it runs', () => {
    const horizontal = render('part', [rule({ width: { to: 'bleed', edge: 'right' } })]);
    expect(horizontal).toContain(DEFAULT_LABELS.headerFooterSizeToWidth);
    expect(horizontal).toContain(DEFAULT_LABELS.headerFooterFrameEdgeRight);
    const vertical = render('part', [rule({ height: { to: 'bleed', edge: 'bottom' } }, 'vertical')]);
    expect(vertical).toContain(DEFAULT_LABELS.headerFooterSizeToHeight);
    expect(vertical).toContain(DEFAULT_LABELS.headerFooterFrameEdgeBottom);
  });

  it('offers the image both sides, and the focus point once it covers its box', () => {
    const contain = render('part', [image({})]);
    expect(contain).toContain(DEFAULT_LABELS.headerFooterSizeToWidth);
    expect(contain).not.toContain(DEFAULT_LABELS.headerFooterImageFocus);
    const cover = render('part', [image({ fit: 'cover' })]);
    expect(cover).toContain(DEFAULT_LABELS.headerFooterImageFocus);
    expect(cover).toContain(DEFAULT_LABELS.headerFooterImageFocusX);
    expect(cover).toContain(DEFAULT_LABELS.headerFooterImageFocusY);
    // Set, the fields read the point in percent.
    const set = render('part', [image({ fit: 'cover', focus: { x: 0.25, y: 0.9 } })]);
    expect(set).toContain('value="25"');
    expect(set).toContain('value="90"');
    // Both sides to an edge count as set.
    const toEdges = render('part', [image({ fit: 'cover', placement: { anchor, size: { width: { to: 'page', edge: 'right' }, height: { to: 'bleed', edge: 'bottom' } } } })]);
    expect(toEdges).toContain(DEFAULT_LABELS.headerFooterImageFocus);
  });
});
