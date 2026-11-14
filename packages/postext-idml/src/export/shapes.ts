// Shapes: boxes, rules and paths as native page items, and the boxes and
// form fields of a text item's chips.

import type { DisplayItem, DisplayRect } from 'postext';
import type { VDTPathCommand } from 'postext/writer';
import { CHIP_PLACEHOLDER } from 'postext/writer';
import { overprintAttrs, swatch } from './colours.js';
import { fieldXml } from './fields.js';
import { parseCssFont } from './fonts.js';
import { boxGeometry, chipRect, opacityXml, pathGeometry, pp, toSpread, type Pt } from './geometry.js';
import { attr, num } from './parts.js';
import { frameName, isField, type TextItem, type Writer } from './writer.js';

type RectItem = Extract<DisplayItem, { kind: 'rect' }>;

export function rectXml(w: Writer, item: Pick<RectItem, 'rect' | 'fill' | 'stroke' | 'strokeWidthPx' | 'radius' | 'rotate' | 'frame'>, name?: string): string {
  const fill = swatch(w, item.fill);
  const stroke = item.strokeWidthPx ? swatch(w, item.stroke) : undefined;
  if (!fill && !stroke) return '';
  const g = boxGeometry(w, item.rect, item.rotate);
  return (
    `<Rectangle${attr('Self', w.next())} ContentType="Unassigned" ItemLayer="ulayer"${attr('ItemTransform', g.transform)} AppliedObjectStyle="ObjectStyle/$ID/[None]"` +
    `${paintAttrs(w, fill, stroke, item.strokeWidthPx, item.radius)}${attr('Name', name ?? (item.frame ? `${frameName(item.frame)} (box)` : undefined))}>` +
    `${g.geometry}${opacityXml(fill?.opacity ?? stroke?.opacity ?? 1)}</Rectangle>`
  );
}

/** Fill, stroke (inside the edge) and rounded corners of a box. */
export function paintAttrs(w: Writer, fill: { ref: string; overprint?: boolean } | undefined, stroke: { ref: string; overprint?: boolean } | undefined, strokeWidthPx: number | undefined, radiusPx: number | undefined): string {
  const radius = radiusPx ? radiusPx * w.k : 0;
  const corners = radius > 0 ? ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'].map((c) => `${attr(`${c}CornerOption`, 'RoundedCorner')}${attr(`${c}CornerRadius`, radius)}`).join('') : '';
  return (
    `${attr('FillColor', fill?.ref ?? 'Swatch/None')}${attr('StrokeColor', stroke?.ref ?? 'Swatch/None')}${attr('StrokeWeight', stroke ? strokeWidthPx! * w.k : 0)}` +
    `${stroke ? ' StrokeAlignment="InsideAlignment"' : ''}${corners}${overprintAttrs(fill, stroke)}`
  );
}

/** The boxes of a text item's chips (a label's fill, an outline) as
 *  rectangles on the page, behind the text, which carries the chips'
 *  words (`paragraphRuns`). An underline-only chip is left to the text. */
export function chipRects(w: Writer, item: TextItem, map?: (r: DisplayRect) => DisplayRect): string[] {
  const out: string[] = [];
  for (const line of item.lines) {
    for (const run of line.runs) {
      const b = run.inline?.kind === 'chip' ? run.inline.box : undefined;
      const at = chipRect(run, line);
      const rect = at && map ? map(at) : at;
      if (!b || !rect || (!b.fill && !(b.stroke && b.strokeWidthPx)) || isField(w, run)) continue;
      out.push(rectXml(w, { fill: b.fill, stroke: b.stroke, strokeWidthPx: b.strokeWidthPx, radius: b.radius, rect }));
    }
  }
  return out;
}

/** The form fields of a text item's chips, over the text (#1445). The
 *  field's value is the chip's words. */
export function chipFields(w: Writer, item: TextItem, map?: (r: DisplayRect) => DisplayRect): string[] {
  const out: string[] = [];
  for (const line of item.lines) {
    line.runs.forEach((run, i) => {
      const field = run.inline?.kind === 'chip' ? run.inline.field : undefined;
      const b = run.inline?.box;
      const at = chipRect(run, line);
      if (!field || !b || !at || !isField(w, run)) return;
      const rect = map ? map(at) : at;
      if (item.rotate) w.warn('field.rotated', `Form field "${field.name}" stands in turned text; it is written unturned`);
      const end = at.x + at.width;
      const value = [run, ...line.runs.slice(i + 1).filter((r) => !r.inline && r.x < end - 0.01)].map((r) => r.text).join('').replaceAll(CHIP_PLACEHOLDER, '').trim();
      if (value && field.kind !== 'checkbox') w.warn('field.value', 'InDesign form fields have no default value: a field\'s value is kept as its script label postext:value');
      if (field.format || field.calc) w.warn('field.script', 'InDesign form fields have no number format or calculation: they are kept as the script labels postext:format and postext:calc');
      const c = toSpread(w, rect.x + rect.width / 2, rect.y + rect.height / 2);
      const fill = swatch(w, b.fill);
      const stroke = b.strokeWidthPx ? swatch(w, b.stroke) : undefined;
      const sizePx = field.sizePx ?? (parseCssFont(run.fontString).sizePx || 12);
      out.push(
        fieldXml(w.next, field, value, {
          cx: c.x,
          cy: c.y,
          hw: (rect.width * w.k) / 2,
          hh: (rect.height * w.k) / 2,
          paint: paintAttrs(w, fill, stroke, b.strokeWidthPx, b.radius),
          ink: swatch(w, run.color)?.ref ?? 'Color/Black',
          sizePt: sizePx * w.k,
        }),
      );
    });
  }
  return out;
}

export function ruleXml(w: Writer, item: Extract<DisplayItem, { kind: 'rule' }>): string {
  const stroke = swatch(w, item.color);
  if (!stroke || item.widthPx <= 0) return '';
  const a = toSpread(w, item.x1, item.y1);
  const b = toSpread(w, item.x2, item.y2);
  const dash = item.dash?.length ? ` StrokeType="StrokeStyle/$ID/Dashed"${attr('StrokeDashAndGap', item.dash.map((d) => num(d * w.k)).join(' '))}` : '';
  return (
    `<GraphicLine${attr('Self', w.next())} ContentType="Unassigned" ItemLayer="ulayer" ItemTransform="1 0 0 1 0 0" AppliedObjectStyle="ObjectStyle/$ID/[None]"` +
    ` FillColor="Swatch/None"${attr('StrokeColor', stroke.ref)}${attr('StrokeWeight', item.widthPx * w.k)}${dash}${overprintAttrs(undefined, stroke)} LeftLineEnd="None" RightLineEnd="None">` +
    `${pathGeometry([{ points: [pp(a), pp(b)], open: true }])}${opacityXml(stroke.opacity)}</GraphicLine>`
  );
}

/** Path commands (sheet px) as IDML path points: each point's left
 *  direction is the handle coming in, its right one the handle going out. */
export function subpathPoints(w: Writer, cmds: VDTPathCommand[]): { points: string[]; open: boolean } {
  type P = { a: Pt; l: Pt; r: Pt };
  const pts: P[] = [];
  let open = true;
  const at = (x: number, y: number) => toSpread(w, x, y);
  for (const c of cmds) {
    if (c.op === 'M' || c.op === 'L') {
      const a = at(c.x, c.y);
      pts.push({ a, l: a, r: a });
    } else if (c.op === 'C') {
      const last = pts[pts.length - 1];
      if (last) last.r = at(c.x1, c.y1);
      const a = at(c.x, c.y);
      pts.push({ a, l: at(c.x2, c.y2), r: a });
    } else if (c.op === 'Q') {
      const last = pts[pts.length - 1];
      const p0 = last?.a ?? at(c.x1, c.y1);
      const q = at(c.x1, c.y1);
      const a = at(c.x, c.y);
      if (last) last.r = { x: p0.x + (2 / 3) * (q.x - p0.x), y: p0.y + (2 / 3) * (q.y - p0.y) };
      pts.push({ a, l: { x: a.x + (2 / 3) * (q.x - a.x), y: a.y + (2 / 3) * (q.y - a.y) }, r: a });
    } else if (c.op === 'Z') {
      open = false;
    }
  }
  if (!open && pts.length > 1) {
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    if (Math.abs(first.a.x - last.a.x) < 1e-3 && Math.abs(first.a.y - last.a.y) < 1e-3) {
      first.l = last.l;
      pts.pop();
    }
  }
  return { points: pts.map((p) => pp(p.a, p.l, p.r)), open };
}

export function pathXml(w: Writer, item: Extract<DisplayItem, { kind: 'path' }>): string {
  const fill = swatch(w, item.fill);
  const stroke = item.stroke && item.stroke.widthPx > 0 ? swatch(w, item.stroke.color) : undefined;
  if (!fill && !stroke) return '';
  const paths = item.subpaths.filter((s) => s.length > 1).map((s) => subpathPoints(w, s));
  if (!paths.length) return '';
  const dash = item.stroke?.dash?.length ? ` StrokeType="StrokeStyle/$ID/Dashed"${attr('StrokeDashAndGap', item.stroke.dash.map((d) => num(d * w.k)).join(' '))}` : '';
  const cap = item.stroke?.cap === 'round' ? ' EndCap="RoundEndCap"' : item.stroke?.cap === 'square' ? ' EndCap="ProjectingEndCap"' : '';
  const join = item.stroke?.join === 'round' ? ' EndJoin="RoundEndJoin"' : item.stroke?.join === 'bevel' ? ' EndJoin="BevelEndJoin"' : '';
  return (
    `<Polygon${attr('Self', w.next())} ContentType="Unassigned" ItemLayer="ulayer" ItemTransform="1 0 0 1 0 0" AppliedObjectStyle="ObjectStyle/$ID/[None]"` +
    `${attr('FillColor', fill?.ref ?? 'Swatch/None')}${attr('StrokeColor', stroke?.ref ?? 'Swatch/None')}${attr('StrokeWeight', stroke ? item.stroke!.widthPx * w.k : 0)}${dash}${cap}${join}${overprintAttrs(fill, stroke)}>` +
    `${pathGeometry(paths)}${opacityXml(fill?.opacity ?? stroke?.opacity ?? 1)}</Polygon>`
  );
}
