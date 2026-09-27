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

/** The opening tag of the Align select, or null when it is not rendered. */
const alignSelect = (html: string): string | null => {
  const at = html.indexOf(`aria-label="${L.resourceTypePlacementAlign}"`);
  if (at < 0) return null;
  const start = html.lastIndexOf('<select', at);
  return html.slice(start, html.indexOf('>', at) + 1);
};
const captionSide = (html: string): boolean => html.includes(`aria-label="${L.resourceTypePlacementCaptionSide}"`);

describe('ResourceDetail placement: width and align', () => {
  it('enables Align for a full-width picture (it places a picture narrower than the column)', () => {
    const tag = alignSelect(render(bitmap({ position: 'auto' })));
    expect(tag).not.toBeNull();
    expect(tag).not.toMatch(/\sdisabled/);
  });

  it('keeps Align disabled for a full-width table (it fills its slot)', () => {
    const tag = alignSelect(render(table({ position: 'auto' })));
    expect(tag).not.toBeNull();
    expect(tag).toMatch(/\sdisabled/);
    // Narrowed by Width, a table can be aligned.
    expect(alignSelect(render(table({ position: 'auto', width: 0.5 })))).not.toMatch(/\sdisabled/);
  });

  it('offers Width and Align for an inline embed, without the caption-beside switch', () => {
    const html = render(bitmap({ position: 'here', align: 'center' }));
    expect(html).toContain(`aria-label="${L.resourceTypePlacementWidth}"`);
    const tag = alignSelect(html);
    expect(tag).not.toBeNull();
    expect(tag).not.toMatch(/\sdisabled/);
    expect(captionSide(html)).toBe(false);
    // A column float keeps the switch.
    expect(captionSide(render(bitmap({ position: 'auto' })))).toBe(true);
  });

  it('hides Width and Align for a turned resource (a page of its own)', () => {
    expect(alignSelect(render(bitmap({ position: 'auto', rotate: 'ccw' })))).toBeNull();
  });

  it('says in the tooltip that Align also places a picture narrower than its slot', () => {
    expect(L.resourceTypePlacementAlignTooltip).toMatch(/picture/);
  });
});
