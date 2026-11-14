// The mapping of special inks and die paths, piece by piece (#1576): die
// line names, finish labels, the ink types and labels the export writes,
// and the die shapes the import reads from a path.

import { describe, expect, it } from 'vitest';
import type { Path, Point } from '../../model/geometry.js';
import { finishLabel, isDieLineName, parseFinishLabel } from '../../model/specialInks.js';
import { inkLabel, inkType } from '../../export/inks.js';
import { classifyHole, cornerOptions, cornerRadii, mirrorPath, pathData } from '../dieShapes.js';
import { swatchFinish } from '../inks.js';
import type { IdmlColor } from '../../model/document.js';

const KAPPA = 0.5522847498;
const pt = (x: number, y: number): Point => ({ x, y });
const corner = (x: number, y: number) => ({ anchor: pt(x, y), left: pt(x, y), right: pt(x, y) });
const closed = (points: Path['points']): Path => ({ open: false, points });

function rectPath(x: number, y: number, w: number, h: number): Path {
  return closed([corner(x, y), corner(x, y + h), corner(x + w, y + h), corner(x + w, y)]);
}

/** An ellipse as InDesign draws an oval: four anchors, one per edge. */
function ovalPath(x: number, y: number, w: number, h: number): Path {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const ox = (w / 2) * KAPPA;
  const oy = (h / 2) * KAPPA;
  return closed([
    { anchor: pt(x, cy), left: pt(x, cy + oy), right: pt(x, cy - oy) },
    { anchor: pt(cx, y), left: pt(cx - ox, y), right: pt(cx + ox, y) },
    { anchor: pt(x + w, cy), left: pt(x + w, cy - oy), right: pt(x + w, cy + oy) },
    { anchor: pt(cx, y + h), left: pt(cx + ox, y + h), right: pt(cx - ox, y + h) },
  ]);
}

/** A rectangle with each corner rounded by its radius (0: square), as a
 *  path of curves. */
function roundedPath(x: number, y: number, w: number, h: number, r: [number, number, number, number]): Path {
  const [tl, tr, br, bl] = r;
  const pts: Path['points'] = [];
  const add = (a: Point, l: Point = a, rr: Point = a) => pts.push({ anchor: a, left: l, right: rr });
  const k = KAPPA;
  if (tl) {
    add(pt(x, y + tl), pt(x, y + tl), pt(x, y + tl - tl * k));
    add(pt(x + tl, y), pt(x + tl - tl * k, y));
  } else add(pt(x, y));
  if (tr) {
    add(pt(x + w - tr, y), pt(x + w - tr, y), pt(x + w - tr + tr * k, y));
    add(pt(x + w, y + tr), pt(x + w, y + tr - tr * k));
  } else add(pt(x + w, y));
  if (br) {
    add(pt(x + w, y + h - br), pt(x + w, y + h - br), pt(x + w, y + h - br + br * k));
    add(pt(x + w - br, y + h), pt(x + w - br + br * k, y + h));
  } else add(pt(x + w, y + h));
  if (bl) {
    add(pt(x + bl, y + h), pt(x + bl, y + h), pt(x + bl - bl * k, y + h));
    add(pt(x, y + h - bl), pt(x, y + h - bl + bl * k));
  } else add(pt(x, y + h));
  return closed(pts);
}

describe('die line names', () => {
  it('knows the names die-makers give the plate, in the skill\'s list', () => {
    for (const name of ['Die', 'CutContour', 'Cut Contour', 'Dieline', 'Die line', 'Die-cut', 'Troquel', 'Línea de troquel', 'Stanzform', 'Fustella', 'Découpe', 'Kiss cut', '模切', '抜き型']) expect(isDieLineName(name), name).toBe(true);
  });

  it('does not take a word that only holds one', () => {
    for (const name of ['Diesel blue', 'PANTONE 871 C', 'Varnish', 'Studies', 'Cutting edge']) expect(isDieLineName(name), name).toBe(false);
  });
});

describe('finish labels', () => {
  it('reads back what it writes', () => {
    for (const f of [{ kind: 'foil', sheen: 'matte' }, { kind: 'varnish', sheen: 'softTouch' }, { kind: 'white' }, { kind: 'metallic' }] as const) expect(parseFinishLabel(finishLabel(f))).toEqual(f);
  });

  it('drops what is no finish, and an unknown sheen', () => {
    expect(parseFinishLabel('gold')).toBeUndefined();
    expect(parseFinishLabel('')).toBeUndefined();
    expect(parseFinishLabel('foil shiny')).toEqual({ kind: 'foil' });
    expect(parseFinishLabel('foil matte extra')).toBeUndefined();
  });

  it('prefers the label over the name, and guesses from the name without one', () => {
    const swatch = (name: string, label?: Record<string, string>): IdmlColor => ({ kind: 'color', self: `Color/${name}`, name, model: 'Spot', space: 'CMYK', value: [0, 0, 0, 0], visible: true, ...(label ? { label } : {}) });
    expect(swatchFinish(swatch('Gold', { 'postext:finish': 'foil' }))).toEqual({ finish: { kind: 'foil' }, guessed: false });
    expect(swatchFinish(swatch('PANTONE 871 C'))).toEqual({ finish: { kind: 'metallic' }, guessed: true });
    expect(swatchFinish(swatch('Barniz UVI mate'))).toEqual({ finish: { kind: 'varnish', sheen: 'matte' }, guessed: true });
    expect(swatchFinish(swatch('PANTONE 286 C'))).toBeUndefined();
  });
});

describe('inks the export writes', () => {
  const cmyk = { c: 0, m: 0, y: 0, k: 0 };
  it('gives each finish the ink type InDesign separates it with', () => {
    expect(inkType({ name: 'V', cmyk, finish: { kind: 'varnish' }, overprint: true })).toBe('Transparent');
    expect(inkType({ name: 'Die', cmyk, overprint: true, dieLine: true })).toBe('Transparent');
    expect(inkType({ name: 'W', cmyk, finish: { kind: 'white' }, overprint: true })).toBe('Opaque');
    expect(inkType({ name: 'G', cmyk, finish: { kind: 'metallic' }, overprint: false })).toBe('Opaque');
    expect(inkType({ name: 'F', cmyk, finish: { kind: 'fluorescent' }, overprint: false })).toBe('Normal');
    expect(inkType({ name: 'P', cmyk, overprint: false })).toBe('Normal');
  });

  it('labels the finish, and an overprint only where the finish would not give it', () => {
    expect(inkLabel({ name: 'V', cmyk, finish: { kind: 'varnish' }, overprint: true })).toEqual([['postext:finish', 'varnish']]);
    expect(inkLabel({ name: 'W', cmyk, finish: { kind: 'white' }, overprint: false })).toEqual([['postext:finish', 'white'], ['postext:overprint', 'false']]);
    expect(inkLabel({ name: 'P', cmyk, overprint: true })).toEqual([['postext:overprint', 'true']]);
    expect(inkLabel({ name: 'P', cmyk, overprint: false })).toEqual([]);
  });
});

describe('die shapes from paths', () => {
  it('reads a rectangle, and one rounded by its corner options', () => {
    expect(classifyHole(rectPath(10, 20, 30, 40))).toEqual({ kind: 'rect', box: { left: 10, top: 20, right: 40, bottom: 60 } });
    const corners = cornerOptions({ TopLeftCornerOption: 'RoundedCorner', TopLeftCornerRadius: '6', TopRightCornerOption: 'RoundedCorner', TopRightCornerRadius: '6', BottomRightCornerOption: 'RoundedCorner', BottomRightCornerRadius: '6', BottomLeftCornerOption: 'RoundedCorner', BottomLeftCornerRadius: '6' });
    expect(classifyHole(rectPath(10, 20, 30, 40), { kind: 'Rectangle', ...(corners ? { corners } : {}) })).toMatchObject({ kind: 'roundRect', radius: 6 });
    expect(cornerOptions({ TopLeftCornerOption: 'None', TopLeftCornerRadius: '6' })).toBeUndefined();
  });

  it('reads a rounded rectangle drawn as a path', () => {
    expect(classifyHole(roundedPath(0, 0, 100, 40, [8, 8, 8, 8]))).toMatchObject({ kind: 'roundRect', box: { left: 0, top: 0, right: 100, bottom: 40 } });
    expect(classifyHole(roundedPath(0, 0, 100, 40, [8, 8, 8, 8]))!.radius).toBeCloseTo(8, 5);
  });

  it('reads a circle and an ellipse', () => {
    expect(classifyHole(ovalPath(5, 5, 20, 20))).toEqual({ kind: 'circle', box: { left: 5, top: 5, right: 25, bottom: 25 } });
    expect(classifyHole(ovalPath(5, 5, 40, 20))!.kind).toBe('ellipse');
  });

  it('writes anything else as path data in a viewBox the size of its box', () => {
    const tri = closed([corner(10, 10), corner(30, 10), corner(10, 40)]);
    expect(classifyHole(tri)).toEqual({ kind: 'path', box: { left: 10, top: 10, right: 30, bottom: 40 }, d: 'M0 0 L20 0 L0 30 Z', viewBox: [20, 30] });
    expect(pathData(ovalPath(0, 0, 2, 2), pt(0, 0))).toMatch(/^M0 1 C/);
  });

  it('mirrors a path across the page', () => {
    const m = mirrorPath(rectPath(10, 0, 20, 5), 100);
    expect(m.points.map((p) => p.anchor.x).sort((a, b) => a - b)).toEqual([70, 70, 90, 90]);
  });

  it('reads which corners of the page are rounded', () => {
    const page = { left: 0, top: 0, right: 400, bottom: 560 };
    expect(cornerRadii(roundedPath(0, 0, 400, 560, [0, 14, 14, 0]), page)).toMatchObject({ TopLeft: 0, BottomLeft: 0 });
    expect(cornerRadii(roundedPath(0, 0, 400, 560, [0, 14, 14, 0]), page)!.TopRight).toBeCloseTo(14, 5);
    expect(cornerRadii(rectPath(0, 0, 400, 560), page)).toEqual({ TopLeft: 0, TopRight: 0, BottomRight: 0, BottomLeft: 0 });
    // A shaped edge (an anchor inside the page) is no rounded rectangle.
    expect(cornerRadii(closed([corner(0, 0), corner(400, 0), corner(300, 280), corner(400, 560), corner(0, 560)]), page)).toBeUndefined();
  });
});
