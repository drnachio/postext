import { describe, expect, it } from 'vitest';
import { buildDocument, createMeasurementCache, type DesignConnectorElement, type LabelStyle, type PostextConfig, type Resource, type VDTDocument } from 'postext';
import { applyTextChanges } from '../book/textChanges.js';
import { setLabelLeader } from '../editor/syntax/labelAttrs.js';
import { labelsInChapters } from '../panels/resources/marks/figureLabels.js';
import { applyMarks, marksOf, withLabelAway, withLabelFields, withLeader, withPoint } from '../panels/resources/marks/pictureMarks.js';
import { withLeaderLook } from '../sidebar/sections/figures/LabelStylesSection.js';
import { frameAnchorsOnPage, labelsOnPage } from '../viewport/composed/labelAnchorGeometry.js';
import { pointersOf, setPointer } from './pointerEdits.js';
import { connectorHandles } from './connectorHandles.js';
import { updateConnectorEnd } from './connectorEdits.js';
import { MAP_NOTES_CONFIG, MAP_NOTES_MARKDOWN, MAP_NOTES_RESOURCES } from './mapNotes.fixture.js';

// #1064, done when: a "parts of a map" page with its pointers and its key
// is built in the Sandbox without writing JSON. Each step is the edit a
// panel makes (the frame's pointers or the canvas grip, the anchor editor,
// the label style editor, the text's own label attribute), and the laid
// page is checked: the pointers end on the picture's anchors, the names set
// away have their leaders, the key is a legend.

(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext() {
    return { font: '', measureText: (s: string) => ({ width: [...s].length * 6 }) };
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const build = (markdown: string, config: PostextConfig, resources: Resource[]): VDTDocument =>
  buildDocument({ markdown, resources }, config, createMeasurementCache());
const composedPage = (doc: VDTDocument) => doc.pages.findIndex((p) => p.composed);

describe('a parts-of-a-map page made with the Sandbox\'s edits (#1064)', () => {
  it('finds the anchors of the map in its frame, on the sheet', () => {
    const doc = build(MAP_NOTES_MARKDOWN, MAP_NOTES_CONFIG, MAP_NOTES_RESOURCES);
    const page = composedPage(doc);
    const points = frameAnchorsOnPage(doc, page, () => undefined);
    expect(points.map((p) => p.anchorId)).toEqual(['title', 'legend', 'scale', 'hills', 'pond']);
    expect(new Set(points.map((p) => p.frame))).toEqual(new Set(['map']));
    // The label set at an anchor stands on the same point.
    const hills = labelsOnPage(doc, page).find((l) => l.anchorId === 'hills')!;
    const there = points.find((p) => p.anchorId === 'hills')!.point;
    expect(Math.abs(hills.point.x - there.x)).toBeLessThan(0.01);
    expect(Math.abs(hills.point.y - there.y)).toBeLessThan(0.01);
  });

  it('draws the pointers, the leaders and the key', () => {
    // The frame's pointers (or the canvas grip): three notes to three parts.
    let templates = MAP_NOTES_CONFIG.pageTemplates!;
    for (const [from, anchor] of [['n1', 'title'], ['n2', 'legend'], ['n3', 'scale']] as const) {
      const out = setPointer(templates, 'parts', { from, toFrame: 'map', anchor })!;
      expect(out.created).toBe(true);
      templates = out.templates;
    }
    expect(pointersOf(templates, 'parts').map((p) => `${p.from}>${p.toFrame}#${p.anchor}`)).toEqual(['n1>map#title', 'n2>map#legend', 'n3>map#scale']);
    // The map keeps its layer: a pointer paints over the frames (#1076).
    expect(templates[0]!.frames!.find((f) => f.name === 'map')!.layer).toBeUndefined();
    // The same pointer again changes nothing.
    expect(setPointer(templates, 'parts', { from: 'n1', toFrame: 'map', anchor: 'title' })!.created).toBe(false);

    // The label style editor: a key style and a leader look for names.
    const key: LabelStyle = { id: 'key', kind: 'legend', fontSize: pt(7.5), background: hex('#ffffff'), border: { color: hex('#55646a'), width: pt(0.6) }, radius: pt(3), padding: pt(4) };
    const labelStyles = [...MAP_NOTES_CONFIG.labelStyles!.map((s) => (s.id === 'name' ? { ...s, leader: withLeaderLook(undefined, { width: pt(0.6) }) } : s)), key];

    // The anchor editor: the key takes its style; the hills' name moves
    // off its point (a leader by the style), the pond's too with an
    // elbow of its own.
    let marks = marksOf(MAP_NOTES_RESOURCES[0]!);
    const at = (id: string) => marks.anchors.findIndex((a) => a.id === id);
    marks = withLabelFields(marks, at('legend'), { style: 'key' });
    marks = withLabelAway(marks, at('hills'), true);
    marks = withPoint(marks, { kind: 'label', index: at('hills') }, { x: 0.62, y: 0.6 });
    marks = withLabelAway(marks, at('pond'), true);
    marks = withLeader(marks, at('pond'), 'on', { routing: 'elbow' });
    const resources = [applyMarks(MAP_NOTES_RESOURCES[0]!, marks)];
    expect(resources[0]!.anchors!.find((a) => a.id === 'hills')!.labelAt).toEqual({ x: 0.62, y: 0.6 });
    expect(resources[0]!.anchors!.find((a) => a.id === 'pond')!.leader).toEqual({ routing: 'elbow' });

    // The text: the scale's label turns its own leader off (it stands at its point anyway).
    const scale = labelsInChapters([{ id: 'c', markdown: MAP_NOTES_MARKDOWN }], 'island').find((l) => l.anchor === 'scale')!;
    const markdown = applyTextChanges(MAP_NOTES_MARKDOWN, [setLabelLeader(MAP_NOTES_MARKDOWN, scale, 'off')!]);
    expect(markdown).toContain('::label[0 — 10 km]{at="scale" leader="none"}');

    const doc = build(markdown, { ...MAP_NOTES_CONFIG, pageTemplates: templates, labelStyles }, resources);
    const pageIndex = composedPage(doc);
    const page = doc.pages[pageIndex]!;
    const points = frameAnchorsOnPage(doc, pageIndex, (id) => resources.find((r) => r.id === id)?.anchors);
    const blocks = page.composed!.decoration?.blocks ?? [];
    for (const [id, anchor] of [['pointer-n1-title', 'title'], ['pointer-n2-legend', 'legend'], ['pointer-n3-scale', 'scale']] as const) {
      const path = blocks.find((b) => b.elementId === id) as { kind: string; subpaths: { op: string; x?: number; y?: number }[][] } | undefined;
      expect(path?.kind, id).toBe('path');
      const end = path!.subpaths.flat().filter((c) => c.op !== 'Z').at(-1)!;
      const want = points.find((p) => p.anchorId === anchor)!.point;
      // The line ends on the anchor's point: where the Sandbox draws it.
      expect(Math.hypot(end.x! - want.x, end.y! - want.y), id).toBeLessThan(0.5);
      // The connector card's handle for that end stands on the same point.
      const el = templates[0]!.decoration!.elements.find((e) => e.id === id) as DesignConnectorElement;
      const frames = new Map(page.composed!.frames.map((f) => [f.name, f.rect]));
      const handle = connectorHandles(el, { frames, anchorPoint: (frame, at) => points.find((p) => p.frame === frame && p.anchorId === at)?.point }).find((h) => h.end === 0)!;
      expect(Math.hypot(handle.x - want.x, handle.y - want.y), id).toBeLessThan(0.01);
      // Without the anchor (the card's «None: a side of the box») it is on the frame's side.
      const bare = connectorHandles(updateConnectorEnd(el, 0, { anchor: undefined }), { frames }).find((h) => h.end === 0)!;
      expect(Math.hypot(bare.x - want.x, bare.y - want.y), id).toBeGreaterThan(1);
    }
    const labels = labelsOnPage(doc, pageIndex);
    const byAnchor = (id: string) => labels.find((l) => l.anchorId === id)!;
    expect(byAnchor('hills').label.layout!.leader).toBeDefined();
    expect(byAnchor('pond').label.layout!.leader!.routing).toBe('elbow');
    expect(byAnchor('scale').label.layout!.leader).toBeUndefined();
    expect(byAnchor('legend').label.layout!.legend).toBe(true);
    // A label away from its point knows where its point is (the canvas
    // draws the line there and a drag moves the label, not the anchor).
    const hillsPoint = points.find((p) => p.anchorId === 'hills')!.point;
    expect(Math.hypot(byAnchor('hills').anchorPoint!.x - hillsPoint.x, byAnchor('hills').anchorPoint!.y - hillsPoint.y)).toBeLessThan(0.01);
    expect(byAnchor('title').anchorPoint).toBeUndefined();
  });
});
