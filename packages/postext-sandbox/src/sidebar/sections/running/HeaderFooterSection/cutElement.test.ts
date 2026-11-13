// A die-cut hole in a page template's decoration (#1565): its own card,
// titled as a hole, offered only where a hole can cut a composed page.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { resolveDesignSlot, type DesignElement, type PostextConfig } from 'postext';
import { SandboxStoreContext } from '../../../../context/SandboxContext.js';
import { DEFAULT_LABELS } from '../../../../types/defaultLabels.js';
import { SlotEditor } from './SlotEditor.js';
import { elementKindLabel } from './elementKind.js';

const mm = (value: number) => ({ value, unit: 'mm' as const });

function render(elements: DesignElement[], template: boolean, config: PostextConfig = {}): string {
  const state = { config, resources: [], labels: DEFAULT_LABELS, locale: 'en' };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  return renderToString(
    h(SandboxStoreContext, { value: store as never },
      h(SlotEditor, {
        slotKey: 'header',
        raw: { elements },
        resolved: resolveDesignSlot({ elements }, 'header'),
        onUpdate: () => {},
        ...(template ? { connectorHost: { templateId: 'cover', scope: 'book' } as never } : {}),
      })),
  );
}

const cut = (extra: Partial<DesignElement> = {}): DesignElement => ({
  kind: 'cut', id: 'window',
  placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(40), y: mm(60) }, size: { width: mm(70), height: mm(45) } },
  ...extra,
} as DesignElement);

describe('cut elements in the Sandbox', () => {
  it('names a cut element as a die-cut hole', () => {
    expect(elementKindLabel(DEFAULT_LABELS, 'cut')).toBe(DEFAULT_LABELS.headerFooterElementCut);
  });

  it('offers Add die-cut hole in a page template only', () => {
    expect(render([], true)).toContain(DEFAULT_LABELS.headerFooterAddCut);
    expect(render([], false)).not.toContain(DEFAULT_LABELS.headerFooterAddCut);
  });

  it('shows the card of a cut element with its die, leaves and text gap', () => {
    const config: PostextConfig = { dieCuts: { shapes: [{ id: 'window', name: 'Cover window', shape: 'roundRect', x: mm(0), y: mm(0), width: mm(10), height: mm(10), leaves: 3 }] } };
    const html = render([cut({ die: 'window' } as Partial<DesignElement>)], true, config);
    expect(html).toContain(DEFAULT_LABELS.headerFooterElementCut);
    expect(html).toContain(DEFAULT_LABELS.dieCutsPlacementDie);
    expect(html).toContain('Cover window (window)');
    expect(html).toContain(DEFAULT_LABELS.dieCutsLeaves);
    expect(html).toContain(DEFAULT_LABELS.dieCutsWrapGap);
    // A die gives the outline: no path data field.
    expect(html).not.toContain(DEFAULT_LABELS.dieCutsPathD);
  });

  it('asks for path data when the element names no die', () => {
    expect(render([cut()], true)).toContain(DEFAULT_LABELS.dieCutsPathD);
  });
});
