// Inline content that is not text: maths and music (an SVG each) and
// colour swatches, as inline anchored objects in the line. An inline
// object takes its width in the line, so the words about it stand where
// Postext set them, and it moves with the text when the text is edited.

import type { DisplayRun } from 'postext';
import { svgSize } from 'postext/writer';
import { overprintAttrs, swatch } from './colours.js';
import { parseCssFont } from './fonts.js';
import { attr, num } from './parts.js';
import type { Writer } from './writer.js';

const ANCHOR =
  ' AnchoredPosition="InlinePosition" SpineRelative="false" LockPosition="false" PinPosition="true" AnchorPoint="BottomRightAnchor" HorizontalAlignment="LeftAlign" HorizontalReferencePoint="TextFrame"' +
  ' VerticalAlignment="TopAlign" VerticalReferencePoint="LineBaseline" AnchorXoffset="0"';

/** A box `width` × `height` pt standing on the baseline, its foot
 *  `descent` pt under it. */
function box(width: number, height: number): string {
  const p = (x: number, y: number) => `<PathPointType Anchor="${num(x)} ${num(y)}" LeftDirection="${num(x)} ${num(y)}" RightDirection="${num(x)} ${num(y)}"/>`;
  return `<Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>${p(0, -height)}${p(0, 0)}${p(width, 0)}${p(width, -height)}</PathPointArray></GeometryPathType></PathGeometry></Properties>`;
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The inline object of a run that is drawn, not set (`run.inline`), or
 *  undefined when the run has nothing to draw. */
export function inlineObjectXml(w: Writer, run: DisplayRun): string | undefined {
  const inl = run.inline;
  if (!inl || inl.kind === 'chip') return undefined;
  const width = inl.widthPx * w.k;
  if (inl.kind === 'swatch') {
    // A square of colour on the baseline (an icon swatch is a glyph of
    // the symbol font: left to the text).
    const s = inl.swatch;
    if (!s || s.icon) return undefined;
    const side = (s.side ?? inl.heightPx) * w.k;
    const fill = swatch(w, s.color);
    const stroke = s.borderWidth ? swatch(w, s.ink) : undefined;
    const radius = s.radius ? s.radius * w.k : 0;
    const corners = radius > 0 ? ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'].map((c) => `${attr(`${c}CornerOption`, 'RoundedCorner')}${attr(`${c}CornerRadius`, radius)}`).join('') : '';
    return (
      `<Rectangle${attr('Self', w.next())} ContentType="Unassigned" ItemTransform="1 0 0 1 0 0" AppliedObjectStyle="ObjectStyle/$ID/[None]"${attr('FillColor', fill?.ref ?? 'Swatch/None')}${attr('StrokeColor', stroke?.ref ?? 'Swatch/None')}` +
      `${attr('StrokeWeight', stroke ? s.borderWidth! * w.k : 0)}${stroke ? ' StrokeAlignment="InsideAlignment"' : ''}${corners}${overprintAttrs(fill, stroke)}>${box(Math.min(width, side) || side, side)}<AnchoredObjectSetting${ANCHOR} AnchorYoffset="0" AnchorSpaceAbove="0"/></Rectangle>`
    );
  }
  if (!inl.svg) return undefined;
  const height = inl.heightPx * w.k;
  const ascent = (inl.ascentPx ?? inl.heightPx) * w.k;
  const descent = Math.max(0, height - ascent);
  const bytes = new TextEncoder().encode(inl.svg);
  const size = svgSize(inl.svg);
  const pw = size?.width || width;
  const ph = size?.height || height;
  const name = `${inl.kind}-${w.media.size + w.inlineCount + 1}.svg`;
  w.inlineCount++;
  const sizePx = parseCssFont(run.fontString).sizePx;
  if (!sizePx) return undefined;
  return (
    `<Rectangle${attr('Self', w.next())} ContentType="GraphicType" ItemTransform="1 0 0 1 0 0" AppliedObjectStyle="ObjectStyle/$ID/[None]" FillColor="Swatch/None" StrokeColor="Swatch/None" StrokeWeight="0"${attr('Name', inl.kind)}>` +
    box(width, height) +
    // The object's foot stands on the baseline; a negative offset lowers
    // it by its descent.
    `<AnchoredObjectSetting${ANCHOR}${attr('AnchorYoffset', -descent)} AnchorSpaceAbove="0"/>` +
    `<Image${attr('Self', w.next())}${attr('ItemTransform', `${num(width / pw)} 0 0 ${num(height / ph)} 0 ${num(-height)}`)}>` +
    `<Properties><Contents><![CDATA[${base64(bytes)}]]></Contents><GraphicBounds Left="0" Top="0"${attr('Right', pw)}${attr('Bottom', ph)}/></Properties>` +
    `<Link${attr('Self', w.next())}${attr('LinkResourceURI', `file:Links/${name}`)} StoredState="Embedded" LinkClassID="35906" LinkClientID="257" LinkResourceModified="false" ShowInUI="true" CanEmbed="true" CanUnembed="true" CanPackage="true" ImportPolicy="NoAutoImport" ExportPolicy="NoAutoExport"/>` +
    '</Image></Rectangle>'
  );
}
