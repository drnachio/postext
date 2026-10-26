// #1063: connectors, shapes (paths), corners and sides edited in the
// template editor without JSON: what each editor shows, and the values its
// fields write.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseSvgPath, resolveDesignSlot, type CalloutStyleConfig, type DesignElement } from 'postext';
import { SandboxStoreContext } from '../../../../context/SandboxContext.js';
import { DEFAULT_LABELS as L } from '../../../../types/defaultLabels.js';
import { CalloutStylesSection } from '../../callouts/CalloutStylesSection.js';
import { SlotEditor } from './SlotEditor.js';
import { PATH_PRESETS, PATH_PRESET_NAMES, checkPathData, cornerValues, formatDash, linkCorners, parseDash, presetOf, setCorner, setSideField, sideValue, unlinkCorners } from './shapeEdits.js';
import { sidePointChoice, sidePointFromChoice } from './sidePoint.js';
import type { FrameTarget } from './sizeTo.js';

const pt = (value: number) => ({ value, unit: 'pt' as const });
const mm = (value: number) => ({ value, unit: 'mm' as const });
const FRAMES: FrameTarget[] = [{ name: 'root', kind: 'frame' }, { name: 'leaf', kind: 'frame' }, { name: 'card', kind: 'frame', repeated: true }, { name: 'stack', kind: 'group' }];

function store(config: object) {
  const state = { config, resources: [], labels: L, locale: 'en', chapters: [], activeChapterId: null };
  return { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
}

function renderSlot(elements: DesignElement[], frames?: FrameTarget[]): string {
  return renderToString(
    h(SandboxStoreContext, { value: store({}) as never },
      h(SlotEditor, { slotKey: 'part', raw: { elements }, resolved: resolveDesignSlot({ elements }, 'part'), onUpdate: () => {}, frames, connectorHost: frames ? { templateId: 't', scope: 'base' } : undefined })),
  );
}

const renderStyles = (calloutStyles: CalloutStyleConfig[]) =>
  renderToString(h(SandboxStoreContext, { value: store({ calloutStyles }) as never }, h(CalloutStylesSection)));

const pressed = (html: string, name: string) => new RegExp(`aria-label="${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" aria-pressed="true"`).test(html);

describe('the slot editor (#1063)', () => {
  it('adds shapes anywhere and connectors on a template\'s decoration only', () => {
    expect(renderSlot([])).toContain(L.headerFooterAddPath);
    expect(renderSlot([])).not.toContain(L.headerFooterAddConnector);
    expect(renderSlot([], FRAMES)).toContain(L.headerFooterAddConnector);
  });

  it('shows a connector\'s ends: the start in a list, each target a toggle button, the fields of each end', () => {
    const html = renderSlot([{ kind: 'connector', id: 'c', from: { to: '#root' }, to: [{ to: '#leaf' }, { to: '#card[2]' }], routing: 'tree', endCap: 'arrow' }], FRAMES);
    expect(html).toContain(`${L.headerFooterElementConnector} #1`);
    expect(html).toContain(L.connectorFrom);
    // Every frame, the instances of the repeated one and the group are a
    // button; the ends set are pressed, an instance end is listed too.
    expect(pressed(html, L.connectorToUse.replace('__name__', L.headerFooterSizeToFrame.replace('__name__', 'leaf')))).toBe(true);
    expect(html).toContain(`aria-label="${L.connectorToUse.replace('__name__', L.connectorTargetInstances.replace('__name__', 'card'))}" aria-pressed="false"`);
    expect(pressed(html, L.connectorToUse.replace('__name__', L.connectorTargetInstance.replace('__name__', 'card').replace('__n__', '2')))).toBe(true);
    expect(html).toContain(`aria-label="${L.connectorToUse.replace('__name__', L.headerFooterSizeToGroup.replace('__name__', 'stack'))}"`);
    // The start is not offered as an end.
    expect(html).not.toContain(`aria-label="${L.connectorToUse.replace('__name__', L.headerFooterSizeToFrame.replace('__name__', 'root'))}"`);
    expect(html).toContain(L.connectorPick);
    for (const label of [L.connectorSide, L.connectorAt, L.connectorGap, L.connectorRouting, L.connectorRadius, L.connectorTrunk, L.connectorColor, L.connectorWidth, L.connectorDash, L.connectorStartCap, L.connectorEndCap, L.connectorCapSize, L.connectorOpacity, L.connectorPin]) {
      expect(html, label).toContain(label);
    }
    // One set of end fields for the start and one per end.
    expect(html.split(`>${L.connectorSide}<`).length - 1).toBe(3);
  });

  it('offers a ring and a bar as marks (#1079)', () => {
    const html = renderSlot([{ kind: 'connector', id: 'c', from: { to: '#root' }, to: { to: '#leaf' }, startCap: 'bar', endCap: 'ring', opacity: 0.4 }], FRAMES);
    expect(html).toContain(L.connectorCapRing);
    expect(html).toContain(L.connectorCapBar);
    expect(html).toContain('value="40"');
  });

  it('a straight connector has no bend fields; no mark, no mark size', () => {
    const html = renderSlot([{ kind: 'connector', id: 'c', from: { to: '#root' }, to: { to: '#leaf' }, routing: 'straight' }], FRAMES);
    expect(html).not.toContain(L.connectorTrunk);
    expect(html).not.toContain(L.connectorCapSize);
  });

  it('an end at a picture\'s anchor (#1064) names it, hides the point along the side, and the line goes over the frames by default (#1076)', () => {
    const html = renderSlot([{ kind: 'connector', id: 'c', from: { to: '#root' }, to: { to: '#leaf', anchor: 'harbour' }, routing: 'straight' }], FRAMES);
    expect(html).toContain(L.connectorAnchor);
    expect(html).toContain(L.pointersAnchorMissing.replace('__anchor__', 'harbour'));
    expect(html).toContain(L.connectorOver);
    expect(html).toContain(L.connectorOverDefaultOn);
    const plain = renderSlot([{ kind: 'connector', id: 'c', from: { to: '#root' }, to: { to: '#leaf' }, routing: 'straight' }], FRAMES);
    expect(plain).toContain(L.connectorOverDefaultOff);
    const set = renderSlot([{ kind: 'connector', id: 'c', from: { to: '#root' }, to: { to: '#leaf' }, routing: 'straight', over: true }], FRAMES);
    expect(set).not.toContain(L.connectorOverDefaultOff);
  });

  it('shows a shape\'s presets, its path, view box, fit, fill and outline', () => {
    const html = renderSlot([{ kind: 'path', id: 'p', d: PATH_PRESETS.chevron, fill: { hex: '#123456', model: 'hex' }, stroke: { hex: '#000000', model: 'hex' }, placement: { anchor: { to: 'container', edge: 'top-left' } } }]);
    expect(html).toContain(`${L.headerFooterElementPath} #1`);
    expect(html).toMatch(/aria-pressed="true"[^>]*>(<[^>]+>)*<path[^>]*><\/path><\/svg><span>Chevron<\/span>/);
    for (const label of [L.pathData, L.pathViewBoxWidth, L.pathViewBoxHeight, L.pathAspect, L.pathFillColor, L.pathStrokeColor, L.pathStrokeWidth]) expect(html, label).toContain(label);
    expect(html).not.toContain('role="alert"');
  });

  it('says where path data goes wrong, and writes nothing until it reads right', () => {
    const html = renderSlot([{ kind: 'path', id: 'p', d: 'L 0 0 1 1', placement: { anchor: { to: 'container', edge: 'top-left' } } }]);
    expect(html).toContain('role="alert"');
    expect(html).toContain(L.pathDataInvalid.replace('__at__', '1'));
    expect(html).toContain('aria-invalid="true"');
  });

  it('anchors an element to a frame and a point along its side', () => {
    const html = renderSlot([{ kind: 'box', id: 'b', placement: { anchor: { to: '#root', edge: 'below', at: 0.25 } }, style: {} }], FRAMES);
    expect(html).toContain(`>${L.headerFooterSizeToFrame.replace('__name__', 'root')}<`);
    expect(html).toContain(L.headerFooterAnchorAt);
    expect(html).toContain(L.sidePointValue);
  });

  it('gives a decoration box a radius per corner and a border per side', () => {
    const linked = renderSlot([{ kind: 'box', id: 'b', placement: { anchor: { to: 'container', edge: 'top-left' } }, style: { borderRadius: pt(4) } }]);
    expect(linked).toContain(L.shapeCornersLinked);
    expect(linked).not.toContain(L.shapeCornerTopLeft);
    const own = renderSlot([{ kind: 'box', id: 'b', placement: { anchor: { to: 'container', edge: 'top-left' } }, style: { borderColor: { hex: '#000000', model: 'hex' }, borderWidth: pt(1), borderRadius: { topLeft: pt(4) }, borderSides: { bottom: { enabled: false } } } }]);
    for (const label of [L.shapeCornerTopLeft, L.shapeCornerTopRight, L.shapeCornerBottomRight, L.shapeCornerBottomLeft]) expect(own, label).toContain(label);
    expect(own).toContain(L.shapeSideShow.replace('__side__', L.shapeSideTop));
    expect(own).toContain(L.shapeSideColor.replace('__side__', L.shapeSideTop));
    // The bottom side is off: no colour or width for it.
    expect(own).not.toContain(L.shapeSideColor.replace('__side__', L.shapeSideBottom));
  });
});

describe('box styles: corners, sides and the joined tab (#1063)', () => {
  it('shows the per-corner radius, per-side borders, the joined switch, the fillet and the foot positions', () => {
    const html = renderStyles([{ id: 'card', borderRadius: { topLeft: mm(3), topRight: mm(3) }, border: { enabled: true, sides: { bottom: { enabled: false } } }, label: { position: 'bottom-left', joined: true } }]);
    expect(html).toContain(L.shapeCornerBottomLeft);
    expect(html).toContain(L.shapeSideShow.replace('__side__', L.shapeSideLeft));
    expect(html).toContain(L.calloutStyleLabelJoined);
    expect(html).toContain(L.calloutStyleLabelFillet);
    // A joined tab stands on the edge: no rise field.
    expect(html).not.toContain(`>${L.calloutStyleLabelOffset}<`);
    expect(html).toContain(L.calloutStyleLabelPositionBottomLeft);
  });
});

describe('the values the shape fields write', () => {
  it('corners: linked and unlinked keep what showed; one corner changes alone', () => {
    expect(unlinkCorners(pt(4), pt(0))).toEqual({ topLeft: pt(4), topRight: pt(4), bottomRight: pt(4), bottomLeft: pt(4) });
    expect(linkCorners({ topLeft: pt(2), bottomRight: pt(6) }, pt(0))).toEqual(pt(6));
    expect(cornerValues({ topLeft: pt(2) }, pt(0)).bottomLeft).toEqual(pt(0));
    expect(setCorner(pt(3), pt(0), 'topRight', pt(0))).toEqual({ topLeft: pt(3), topRight: pt(0), bottomRight: pt(3), bottomLeft: pt(3) });
  });

  it('sides: a field set or taken off, each side over the whole border', () => {
    const whole = { enabled: true, color: { hex: '#000000', model: 'hex' as const }, width: pt(1) };
    const s = setSideField({}, 'top', 'width', pt(3));
    expect(s).toEqual({ top: { width: pt(3) } });
    expect(sideValue(s, 'top', whole).width).toEqual(pt(3));
    expect(sideValue(s, 'left', whole)).toEqual(whole);
    expect(setSideField(s, 'top', 'width', undefined)).toEqual({});
  });

  it('dashes: points unless a unit is written; nonsense is refused', () => {
    expect(parseDash('3 2')).toEqual([pt(3), pt(2)]);
    expect(parseDash('2mm, 1.5mm')).toEqual([mm(2), mm(1.5)]);
    expect(parseDash('  ')).toBeUndefined();
    expect(parseDash('3 -2')).toBeNull();
    expect(parseDash('0 0')).toBeNull();
    expect(formatDash([pt(3), mm(1)])).toBe('3 1mm');
  });

  it('every preset is path data the engine draws, and is recognised again', () => {
    for (const name of PATH_PRESET_NAMES) {
      expect(parseSvgPath(PATH_PRESETS[name]).ok, name).toBe(true);
      expect(presetOf(PATH_PRESETS[name], undefined)).toBe(name);
    }
    expect(presetOf(PATH_PRESETS.bar, [10, 10])).toBeUndefined();
    expect(checkPathData('M0 0 L1')).toEqual({ ok: false, at: expect.any(Number) });
  });

  it('side points: words, a fraction from the point it replaces, unset', () => {
    expect(sidePointChoice(undefined)).toBe('');
    expect(sidePointChoice(0.3)).toBe('fraction');
    expect(sidePointFromChoice('fraction', 'end')).toBe(1);
    expect(sidePointFromChoice('fraction', undefined)).toBe(0.5);
    expect(sidePointFromChoice('start', 0.3)).toBe('start');
    expect(sidePointFromChoice('', 'end')).toBeUndefined();
  });
});
