import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SandboxStoreContext } from '../../../context/SandboxContext.js';
import { DEFAULT_LABELS } from '../../../types/defaultLabels.js';
import { SafeAreaField } from './SafeAreaEditor.js';
import type { Resource } from 'postext';
import { anchorLabelState, figureFenceResource, figureOfLine, labelsInChapters } from './figureLabels.js';
import { addAnchor, applyMarks, labelFieldsOf, marksOf, nextAnchorId, normalizeMarks, withLabelFields } from './pictureMarks.js';
import { takeAnchorEditorRequest, requestAnchorEditor, onAnchorEditorRequest } from './anchorEditorRequest.js';
import type { SandboxAction } from '../../../context/SandboxContext.js';

// #866: anchors made by clicking on a picture, named after the text's
// `::label` lines.

const MAP: Resource = {
  id: 'mapa', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'mapa.png', format: 'png', width: 400, height: 300 },
  anchors: [{ id: 'albar', x: 0.4, y: 0.5, style: 'capital', align: 'start' }],
};

const CHAPTER = [
  '::::page{template="mapa"}',
  '# Velmar',
  '',
  ':::figure{resource="mapa" slot="mapa"}',
  '::label[**Albar**]{at="albar"}',
  '::label[Puerto Gris]{at="puerto" style="ciudad"}',
  '',
  '::label[Nordia]{at="norte"}',
  '::label[Mar]{at="40% 60%"}',
  '::label[Albar bis]{at="albar"}',
  ':::',
  '::::',
  '',
  ':::figure{resource="otro"}',
  '::label[Otra]{at="x"}',
  ':::',
].join('\n');

describe('the labels of a picture in the text', () => {
  it('reads every label of a figure, with its anchor or its point, text and place', () => {
    const labels = labelsInChapters([{ id: 'c1', markdown: CHAPTER }], 'mapa');
    expect(labels.map((l) => [l.anchor ?? l.point, l.text, l.style])).toEqual([
      ['albar', 'Albar', undefined],
      ['puerto', 'Puerto Gris', 'ciudad'],
      ['norte', 'Nordia', undefined],
      [{ x: 0.4, y: 0.6 }, 'Mar', undefined],
      ['albar', 'Albar bis', undefined],
    ]);
    const puerto = labels[1]!;
    expect(CHAPTER.slice(puerto.start, puerto.end)).toBe('::label[Puerto Gris]{at="puerto" style="ciudad"}');
    expect(CHAPTER.slice(puerto.textStart, puerto.textEnd)).toBe('Puerto Gris');
    expect(labelsInChapters([{ id: 'c1', markdown: CHAPTER }]).map((l) => l.resourceId)).toContain('otro');
    expect(labelsInChapters([{ id: 'c1', markdown: 'no labels here' }])).toEqual([]);
  });

  it('splits the names into anchors with labels and names waiting for one, in the order the text uses them', () => {
    const state = anchorLabelState(MAP.anchors!, labelsInChapters([{ id: 'c1', markdown: CHAPTER }], 'mapa'));
    expect(state.byAnchor.get('albar')!.map((l) => l.text)).toEqual(['Albar', 'Albar bis']);
    expect(state.waiting).toEqual(['puerto', 'norte']);
    expect(state.waitingLabel.get('norte')!.text).toBe('Nordia');
  });

  it('finds the figure a label line belongs to', () => {
    const lines = CHAPTER.split('\n');
    const at = (n: number) => lines[n - 1]!;
    expect(figureOfLine(at, 8)).toBe('mapa');
    expect(figureOfLine(at, 15)).toBe('otro');
    expect(figureOfLine(at, 2)).toBeUndefined();
    expect(figureFenceResource(':::figure{slot="a" resource=\'m-1\'}')).toBe('m-1');
    expect(figureFenceResource(':::frame{slot="a"}')).toBeUndefined();
  });
});

describe('anchors made on the picture', () => {
  it('names a new anchor anchorN, or the name given, with the label fields of the one picked before', () => {
    const marks = marksOf(MAP);
    expect(nextAnchorId(marks.anchors, 'anchor')).toBe('anchor2');
    const free = addAnchor(marks, { x: 0.1, y: 1.2 }, { prefix: 'anchor', fields: labelFieldsOf(marks.anchors[0]) });
    expect(free.anchors[1]).toEqual({ id: 'anchor2', x: 0.1, y: 1, style: 'capital', align: 'start' });
    const named = addAnchor(marks, { x: 0.7, y: 0.2 }, { id: 'puerto' });
    expect(named.anchors[1]).toEqual({ id: 'puerto', x: 0.7, y: 0.2 });
    // Comics keep their speakers.
    expect(addAnchor(marks, { x: 0.5, y: 0.5 }).anchors[1]!.id).toBe('speaker2');
  });

  it('sets the label fields, a default value taking the key away', () => {
    let marks = marksOf(MAP);
    marks = withLabelFields(marks, 0, { verticalAlign: 'bottom', rotate: -12.346, width: 0.123456 });
    expect(normalizeMarks(marks).anchors[0]).toEqual({ id: 'albar', x: 0.4, y: 0.5, style: 'capital', align: 'start', verticalAlign: 'bottom', rotate: -12.35, width: 0.1235 });
    marks = withLabelFields(marks, 0, { align: 'center', verticalAlign: 'middle', rotate: 0, width: undefined, style: undefined });
    expect(applyMarks(MAP, marks).anchors).toEqual([{ id: 'albar', x: 0.4, y: 0.5 }]);
  });
});

describe('opening the anchor editor from elsewhere', () => {
  it('opens the Resources panel on the picture and hands the request over once', () => {
    const actions: SandboxAction[] = [];
    let heard = 0;
    const off = onAnchorEditorRequest(() => { heard++; });
    requestAnchorEditor((a) => actions.push(a), { resourceId: 'mapa', place: 'norte' });
    off();
    expect(actions).toEqual([{ type: 'SET_PANEL', payload: 'resources' }, { type: 'SET_ACTIVE_RESOURCE', payload: 'mapa' }]);
    expect(heard).toBe(1);
    expect(takeAnchorEditorRequest('otro')).toBeNull();
    expect(takeAnchorEditorRequest('mapa')).toEqual({ resourceId: 'mapa', place: 'norte' });
    expect(takeAnchorEditorRequest('mapa')).toBeNull();
  });
});

describe('the field of a labelled picture', () => {
  it('offers its anchors and counts the labels still waiting for one', () => {
    const state = { config: {}, resources: [MAP], labels: DEFAULT_LABELS, locale: 'en', chapters: [{ id: 'c1', title: 'Velmar', markdown: CHAPTER }], activeChapterId: 'c1', markdown: CHAPTER };
    const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
    const html = renderToString(h(SandboxStoreContext, { value: store as never }, h(SafeAreaField, { resource: MAP, onChange: () => {} })));
    expect(html).toContain('>Anchors<');
    expect(html).toContain('Anchors: 1 · Labels without an anchor: 2');
    expect(html).not.toContain('Speakers: 1');
  });
});
