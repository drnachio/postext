// The design-slot controls added for inline marks, outlines and the opener
// reservation opt-out: which slots and elements show them.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { resolveDesignSlot, type DesignElement } from 'postext';
import { SandboxStoreContext } from '../../../context/SandboxContext';
import { DEFAULT_LABELS } from '../../../types/defaultLabels';
import { SlotEditor } from './SlotEditor';
import type { SlotKind } from './placementAdapter';

const pt = (value: number) => ({ value, unit: 'pt' as const });

function render(slotKey: SlotKind, elements: DesignElement[]): string {
  const state = { config: {}, resources: [], labels: DEFAULT_LABELS, locale: 'en' };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  return renderToString(
    h(SandboxStoreContext, { value: store as never },
      h(SlotEditor, { slotKey, raw: { elements }, resolved: resolveDesignSlot({ elements }, 'header'), onUpdate: () => {} })),
  );
}

const text = (extra: Partial<DesignElement> = {}): DesignElement => ({
  kind: 'text', id: 't', content: 'x', fontSize: pt(10), overflow: 'wrap',
  placement: { anchor: { to: 'container', edge: 'top-left' } },
  ...extra,
} as DesignElement);
const box: DesignElement = { kind: 'box', id: 'b', placement: { anchor: { to: 'page', edge: 'bottom-right' } }, style: {} };

describe('design element controls', () => {
  it('offers the reservation switch in heading designs only, for every element kind', () => {
    const count = (html: string) => html.split(DEFAULT_LABELS.headerFooterElementReserve).length - 1;
    const one = count(render('heading', [box]));
    expect(one).toBeGreaterThan(0);
    expect(count(render('heading', [text(), box]))).toBe(2 * one);
    expect(render('header', [text(), box])).not.toContain(DEFAULT_LABELS.headerFooterElementReserve);
    expect(render('part', [box])).not.toContain(DEFAULT_LABELS.headerFooterElementReserve);
  });

  it('offers the decorative switch on image elements, on when the element says so (#213)', () => {
    const image = (extra: Partial<DesignElement> = {}): DesignElement => ({
      kind: 'image', id: 'i', resourceId: 'plate', placement: { anchor: { to: 'container', edge: 'top-left' } }, ...extra,
    } as DesignElement);
    const label = DEFAULT_LABELS.headerFooterImageDecorative;
    expect(render('heading', [image()])).toContain(label);
    expect(render('part', [image()])).toContain(label);
    // A running head's or footer's picture is always decoration.
    expect(render('header', [image()])).not.toContain(label);
    expect(render('footer', [image()])).not.toContain(label);
    expect(render('heading', [text(), box])).not.toContain(label);
    // Set, the row reads as changed from its default.
    const changed = (html: string) => html.includes(`${label}<span class="sr-only"> (`);
    expect(changed(render('heading', [image()]))).toBe(false);
    expect(changed(render('heading', [image({ decorative: true } as Partial<DesignElement>)]))).toBe(true);
  });

  it('shows the inline-marks switch and the outline width, and the outline details once it is set', () => {
    const plain = render('header', [text()]);
    expect(plain).toContain(DEFAULT_LABELS.headerFooterElementInlineMarks);
    expect(plain).toContain(DEFAULT_LABELS.headerFooterElementStrokeWidth);
    expect(plain).not.toContain(DEFAULT_LABELS.headerFooterElementStrokeHollow);
    const outlined = render('header', [text({ stroke: { width: pt(1) } } as Partial<DesignElement>)]);
    expect(outlined).toContain(DEFAULT_LABELS.headerFooterElementStrokeColor);
    expect(outlined).toContain(DEFAULT_LABELS.headerFooterElementStrokeHollow);
  });
});
