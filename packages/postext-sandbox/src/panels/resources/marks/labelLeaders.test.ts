import { createElement as h, type ComponentProps } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Resource } from 'postext';
import { SandboxStoreContext } from '../../../context/SandboxContext.js';
import { DEFAULT_LABELS } from '../../../types/defaultLabels.js';
import { LabelAnchorsPanel } from './LabelAnchorsPanel.js';
import { labelsInChapters } from './figureLabels.js';
import { labelLeaderEdit } from './labelLeaderEdit.js';
import { applyMarks, leaderDrawn, marksOf, normalizeMarks, nudge, removeMark, withLabelAway, withLeader, type PictureMarks } from './pictureMarks.js';

// #1064: a label set away from its point (labelAt) and its leader, in the
// anchor editor.

const PIC: Resource = {
  id: 'map', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'm.png', format: 'png', width: 400, height: 300, resolution: 72 },
  anchors: [{ id: 'harbour', x: 0.5, y: 0.5, style: 'town' }, { id: 'mill', x: 0.95, y: 0.05, labelAt: { x: 0.7, y: 0.2 }, leader: { routing: 'elbow' } }],
};

describe('a label away from its point (#1064)', () => {
  it('is kept by the dialog\'s marks and stored rounded', () => {
    const marks = marksOf(PIC);
    expect(marks.anchors[1]!.labelAt).toEqual({ x: 0.7, y: 0.2 });
    const stored = applyMarks(PIC, { ...marks, anchors: marks.anchors.map((a, i) => (i === 1 ? { ...a, labelAt: { x: 0.123456, y: 0.2 } } : a)) });
    expect(stored.anchors![1]).toMatchObject({ labelAt: { x: 0.1235, y: 0.2 }, leader: { routing: 'elbow' } });
    expect(normalizeMarks(marks).anchors[0]).not.toHaveProperty('labelAt');
  });

  it('is set away by a button, inside the picture near an edge, and back', () => {
    const away = withLabelAway(marksOf(PIC), 0, true);
    expect(away.anchors[0]!.labelAt).toEqual({ x: 0.58, y: 0.42 });
    // Near the top right corner the step turns back into the picture.
    const corner = withLabelAway({ ...marksOf(PIC), anchors: [{ id: 'c', x: 0.98, y: 0.02 }] }, 0, true);
    expect(corner.anchors[0]!.labelAt!.x).toBeCloseTo(0.9);
    expect(corner.anchors[0]!.labelAt!.y).toBeCloseTo(0.1);
    expect(withLabelAway(away, 0, false).anchors[0]).not.toHaveProperty('labelAt');
  });

  it('is nudged by the arrow keys from its point, and Delete sets it back', () => {
    const target = { kind: 'label', index: 0 } as const;
    const once = nudge(marksOf(PIC), target, 1, 0, false);
    expect(once.anchors[0]!.labelAt).toEqual({ x: 0.51, y: 0.5 });
    // The anchor's own point does not move.
    expect(once.anchors[0]!.x).toBe(0.5);
    expect(nudge(once, target, 0, -1, true).anchors[0]!.labelAt!.y).toBeCloseTo(0.45);
    expect(removeMark(once, target).anchors[0]).not.toHaveProperty('labelAt');
  });

  it('takes a leader as the style says, on (keeping a look) or off', () => {
    const m: PictureMarks = marksOf(PIC);
    expect(withLeader(m, 0, 'on').anchors[0]!.leader).toBe(true);
    expect(withLeader(m, 1, 'on').anchors[1]!.leader).toEqual({ routing: 'elbow' });
    expect(withLeader(m, 1, 'off').anchors[1]!.leader).toBe(false);
    expect(withLeader(m, 1, 'style').anchors[1]).not.toHaveProperty('leader');
    expect(withLeader(m, 0, 'on', {}).anchors[0]!.leader).toBe(true);
    // Drawn: the label's attribute, else the anchor's, else away + a style look.
    expect(leaderDrawn({ labelAt: { x: 0, y: 0 } }, true)).toBe(true);
    expect(leaderDrawn({ labelAt: { x: 0, y: 0 } }, false)).toBe(false);
    expect(leaderDrawn({}, true)).toBe(false);
    expect(leaderDrawn({ leader: false, labelAt: { x: 0, y: 0 } }, true)).toBe(false);
    expect(leaderDrawn({ leader: false }, true, true)).toBe(true);
  });
});

describe('the leader fields of the anchor picked (#1064)', () => {
  const md = ':::figure{resource="map"}\n::label[Harbour]{at="harbour"}\n:::label{at="harbour" leader="none"}\nHarbour\nquay\n:::\n:::\n';
  const texts = labelsInChapters([{ id: 'c', markdown: md }], 'map');
  const noop = () => undefined;
  const props = (selected: number): ComponentProps<typeof LabelAnchorsPanel> => ({
    marks: marksOf(PIC), area: undefined, labelStyles: [{ id: 'town', leader: {} }], byAnchor: new Map([['harbour', texts]]), waiting: [], waitingLabel: new Map(),
    placing: null, onPlacing: noop, selected, onSelect: noop, commit: noop, edit: noop, beginEdit: noop, remove: noop, addAtCentre: noop,
    showIdErrors: false, idInputs: { current: new Map() }, addButton: { current: null },
    ticked: new Set(), onTick: noop, showNames: false, onShowNames: noop, denseMap: false, onLabelLeader: noop, styleHasLeader: (id) => id === 'town',
  });
  const render = (p: ComponentProps<typeof LabelAnchorsPanel>) => {
    const state = { labels: DEFAULT_LABELS };
    const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
    return renderToString(h(SandboxStoreContext, { value: store as never }, h(LabelAnchorsPanel, p)));
  };

  it('reads both label forms, with their own leader attribute', () => {
    expect(texts.map((t) => [t.text, t.leader])).toEqual([['Harbour', undefined], ['Harbour / quay', false]]);
  });

  it('offers the label away switch, the leader choice and each label\'s own leader', () => {
    const html = render(props(0));
    expect(html).toContain('>Label and leader<');
    expect(html).toContain('Away from its point');
    expect(html).toContain('No leader is drawn for this label.');
    expect(html).toContain('aria-label="Leader of “Harbour”"');
    expect(html).toContain('The labels set at this anchor');
    // The second label says leader="none": its Off is the choice.
    const own = html.slice(html.indexOf('aria-label="Leader of “Harbour / quay”"'));
    expect(own.slice(0, own.indexOf('</div>'))).toMatch(/aria-checked="true"[^>]*>Off</);
  });

  it('shows the label\'s place and the leader\'s line for an anchor set away with a leader of its own', () => {
    const html = render(props(1));
    expect(html).toContain('Label across');
    expect(html).toContain('A leader is drawn from this label to its point.');
    expect(html).toContain('>Elbow<');
    expect(html).toContain('Mark at the point');
  });

  it('writes a label\'s own leader into its chapter, the live text for the one on screen', () => {
    const edit = labelLeaderEdit({ chapters: [{ id: 'c', markdown: 'old' }], activeChapterId: 'c', markdown: md }, texts[0]!, 'on')!;
    expect(edit.chapterId).toBe('c');
    expect(edit.change.insert).toBe('at="harbour" leader');
    expect(edit.baseLength).toBe(md.length);
    expect(labelLeaderEdit({ chapters: [], activeChapterId: 'x', markdown: '' }, texts[0]!, 'on')).toBeNull();
  });
});
