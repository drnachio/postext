import { createElement as h, type ComponentProps } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SandboxStoreContext } from '../../../context/SandboxContext.js';
import { DEFAULT_LABELS } from '../../../types/defaultLabels.js';
import { LabelAnchorsPanel, LeaderFields } from './LabelAnchorsPanel.js';
import type { PictureMarks } from './pictureMarks.js';

// #931: the anchors list ticks anchors for a change together.

const marks: PictureMarks = {
  anchors: [
    { id: 'albar', x: 0.1, y: 0.1, style: 'capital' },
    { id: 'puerto', x: 0.2, y: 0.2, style: 'ciudad' },
    { id: 'norte', x: 0.3, y: 0.3, style: 'capital', align: 'start' },
  ],
  avoid: [],
  faces: [],
};
const noop = () => undefined;
const props = (extra: Partial<ComponentProps<typeof LabelAnchorsPanel>> = {}): ComponentProps<typeof LabelAnchorsPanel> => ({
  marks, area: undefined, labelStyles: [{ id: 'capital' }, { id: 'ciudad' }], byAnchor: new Map(), waiting: [], waitingLabel: new Map(),
  placing: null, onPlacing: noop, selected: null, onSelect: noop, commit: noop, edit: noop, beginEdit: noop, remove: noop, addAtCentre: noop,
  showIdErrors: false, idInputs: { current: new Map() }, addButton: { current: null },
  ticked: new Set(), onTick: noop, showNames: false, onShowNames: noop, denseMap: false, ...extra,
});
const render = (p: ComponentProps<typeof LabelAnchorsPanel>) => {
  const state = { labels: DEFAULT_LABELS };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  return renderToString(h(SandboxStoreContext, { value: store as never }, h(LabelAnchorsPanel, p)));
};

describe('the anchors list with ticks (#931)', () => {
  it('has a checkbox per anchor named after it, a Select shown button and a hint, and no bulk fields yet', () => {
    const html = render(props());
    expect((html.match(/type="checkbox"/g) ?? [])).toHaveLength(3);
    expect(html).toContain('aria-label="Select puerto"');
    expect(html).toContain('>Select shown<');
    expect(html).toContain('Shift-click their points');
    expect(html).not.toContain('selected anchors');
  });

  it('shows the fields of the ticked anchors, mixed values marked, once some are ticked', () => {
    const html = render(props({ ticked: new Set([0, 1]) }));
    expect(html).toContain('Set for the 2 selected anchors');
    expect(html).toContain('2 selected');
    expect(html).toContain('>Clear selection<');
    // The two differ in style: the Select says so; their alignment is the default for both.
    expect(html).toContain('Mixed');
    expect(html).toContain('aria-pressed="true"');
  });

  it('offers the names switch only on a dense map', () => {
    expect(render(props())).not.toContain('Names on the picture');
    expect(render(props({ denseMap: true }))).toContain('Names on the picture');
  });
});

describe('the mark at the point of an anchor\'s leader (#1079)', () => {
  it('offers a ring and a bar beside the dot and the arrow', () => {
    const anchor = { id: 'lago', x: 0.4, y: 0.6, leader: { endCap: 'ring' as const } };
    const state = { labels: DEFAULT_LABELS };
    const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
    const html = renderToString(h(SandboxStoreContext, { value: store as never }, h(LeaderFields, {
      anchor, index: 0, marks: { ...marks, anchors: [anchor] }, texts: [], commit: noop, edit: noop, beginEdit: noop, styleHasLeader: () => false,
    } as ComponentProps<typeof LeaderFields>)));
    expect(html).toContain(`>${DEFAULT_LABELS.connectorCapRing}<`);
    expect(html).toContain(`>${DEFAULT_LABELS.connectorCapBar}<`);
  });
});
