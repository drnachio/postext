// EF-98: the per-resource Align control. A picture (bitmap or SVG) narrower
// than its slot follows `placement.align` at any width — a bitmap smaller
// than the column, or one `layout.fitFiguresToPage` shrank — and an inline
// embed takes Width and Align like a float, so both controls are offered
// there too; the caption-beside switch stays with column floats.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Resource, ResourcePlacement } from 'postext';
import { defaultResourceTypes } from 'postext';
import { SandboxStoreContext } from '../../context/SandboxContext';
import { DEFAULT_LABELS } from '../../types/defaultLabels';
import { ResourceDetail } from './ResourceDetail';

const L = DEFAULT_LABELS;

function render(resource: Resource): string {
  const state = { config: {}, resources: [resource], labels: L, locale: 'en' };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  return renderToString(
    h(SandboxStoreContext, { value: store as never },
      h(ResourceDetail, {
        resource,
        types: defaultResourceTypes(),
        otherIds: new Set<string>(),
        referenceCount: 1,
        onChange: () => {},
        onRename: () => {},
        onDelete: () => {},
        onBack: () => {},
      })),
  );
}

const bitmap = (placement: ResourcePlacement): Resource => ({
  id: 'plate', typeId: 'figure', kind: 'bitmap', caption: 'A plate.', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'f', format: 'png', width: 300, height: 200 },
  placement,
});
const table = (placement: ResourcePlacement): Resource => ({
  id: 'tab', typeId: 'table', kind: 'table', caption: 'A table.', createdAt: 0, updatedAt: 0,
  table: { model: { rows: [[{ content: 'a' }]] } },
  placement,
});

/** Whether the placement row labelled `label` is rendered (#441: one
 *  labelled row per key, the rows that cannot apply left out). */
const row = (html: string, label: string): boolean =>
  new RegExp(`<label[^>]*>(?:<span[^>]*></span>)?${label}<`).test(html);
const align = (html: string): boolean => row(html, L.resourceTypePlacementAlign);
const width = (html: string): boolean => row(html, L.resourceTypePlacementWidth);
const captionSide = (html: string): boolean => row(html, L.resourceTypePlacementCaptionSide);

describe('ResourceDetail placement: width and align', () => {
  it('offers Align for a full-width picture (it places a picture narrower than the column)', () => {
    expect(align(render(bitmap({ position: 'auto' })))).toBe(true);
  });

  it('leaves Align out for a full-width table (it fills its slot)', () => {
    expect(align(render(table({ position: 'auto' })))).toBe(false);
    // Narrowed by Width, a table can be aligned.
    expect(align(render(table({ position: 'auto', width: 0.5 })))).toBe(true);
  });

  it('offers Width and Align for an inline embed, without the caption-beside switch', () => {
    const html = render(bitmap({ position: 'here', align: 'center' }));
    expect(width(html)).toBe(true);
    expect(align(html)).toBe(true);
    expect(captionSide(html)).toBe(false);
    // A column float keeps the switch.
    expect(captionSide(render(bitmap({ position: 'auto' })))).toBe(true);
  });

  it('hides Width and Align for a turned resource (a page of its own)', () => {
    const html = render(bitmap({ position: 'auto', rotate: 'ccw' }));
    expect(width(html)).toBe(false);
    expect(align(html)).toBe(false);
  });

  it('offers Shrink to fit and Caption width on a floated picture, Smallest scale once it shrinks (#626)', () => {
    const shrink = (html: string) => row(html, L.resourceTypePlacementShrink);
    const minScale = (html: string) => row(html, L.resourceTypePlacementMinScale);
    const measure = (html: string) => row(html, L.resourceTypePlacementCaptionMeasure);
    const plain = render(bitmap({ position: 'auto' }));
    expect(shrink(plain)).toBe(true);
    expect(minScale(plain)).toBe(false);
    expect(measure(plain)).toBe(true);
    expect(minScale(render(bitmap({ position: 'auto', shrink: 'slot' })))).toBe(true);
    // Not for an inline embed (Caption width still applies), a turned
    // figure or a table.
    const inline = render(bitmap({ position: 'here' }));
    expect(shrink(inline)).toBe(false);
    expect(measure(inline)).toBe(true);
    expect(shrink(render(bitmap({ position: 'auto', rotate: 'ccw' })))).toBe(false);
    expect(shrink(render(table({ position: 'auto' })))).toBe(false);
  });

  it('says in the tooltip that Align also places a picture narrower than its slot', () => {
    expect(L.resourceTypePlacementAlignTooltip).toMatch(/picture/);
  });
});
