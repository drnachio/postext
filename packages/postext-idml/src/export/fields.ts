// Form fields in the IDML package (#1445): a chip that carries a `field`
// becomes an InDesign form field on its box, as InDesign itself writes one
// (InDesign 2026 exports, DOM 21): the field's own transform, its bounds in
// `PathBoundingBox`, and its look as page items inside it. A text or number
// field is a `TextBox`, a choice a `ComboBox`, a check box a `CheckBox`
// with its two appearances (`UpOff`, `UpOn`) as states.
//
// What InDesign's fields cannot hold travels as the field's script labels
// (`Label`, read with `extractLabel` in InDesign scripting): a default
// value (`postext:value`), a number format (`postext:format`) and a
// calculation (`postext:calc`, written as the `calc` attribute writes it,
// numbers and nested calculations included). InDesign has no default
// value, number format, calculation or text alignment on a form field;
// its PDF export writes none of them.

import { formatFieldCalc, type FormFieldSpec } from 'postext/writer';
import { escapeXml } from '../xml/write.js';
import { attr, num } from './parts.js';

export interface FieldPaint {
  /** Sheet box of the field, centre and half sizes in spread pt. */
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  /** `FillColor` / `StrokeColor` / `StrokeWeight` / corner attributes of the box. */
  paint: string;
  /** Swatch of the check mark (the chip's text colour). */
  ink: string;
  /** Text size, pt. */
  sizePt: number;
}

const point = (x: number, y: number) => `<PathPointType Anchor="${num(x)} ${num(y)}" LeftDirection="${num(x)} ${num(y)}" RightDirection="${num(x)} ${num(y)}"/>`;

function geometry(points: [number, number][], open: boolean): string {
  return `<Properties><PathGeometry><GeometryPathType PathOpen="${open}"><PathPointArray>${points.map(([x, y]) => point(x, y)).join('')}</PathPointArray></GeometryPathType></PathGeometry></Properties>`;
}

/** The field's box as a rectangle in the field's own frame (centred). */
function boxXml(next: () => string, f: FieldPaint): string {
  const { hw, hh } = f;
  return (
    `<Rectangle${attr('Self', next())} ContentType="GraphicType" ItemTransform="1 0 0 1 0 0" AppliedObjectStyle="ObjectStyle/$ID/[None]"${f.paint}>` +
    geometry([[-hw, -hh], [-hw, hh], [hw, hh], [hw, -hh]], false) +
    '</Rectangle>'
  );
}

/** A check box's mark: a tick drawn in the chip's ink, inside the box. */
function tickXml(next: () => string, f: FieldPaint): string {
  const s = Math.min(f.hw, f.hh);
  return (
    `<Polygon${attr('Self', next())} ContentType="Unassigned" ItemTransform="1 0 0 1 0 0" AppliedObjectStyle="ObjectStyle/$ID/[None]" FillColor="Swatch/None"${attr('StrokeColor', f.ink)}${attr('StrokeWeight', Math.max(0.5, s * 0.2))} EndCap="RoundEndCap" EndJoin="RoundEndJoin">` +
    geometry([[-0.55 * s, 0], [-0.15 * s, 0.45 * s], [0.6 * s, -0.5 * s]], true) +
    '</Polygon>'
  );
}

const state = (next: () => string, type: 'UpOff' | 'UpOn', active: boolean, items: string): string =>
  `<State${attr('Self', next())}${attr('Active', active)} Enabled="true"><Properties><Statetype type="enumeration">${type}</Statetype></Properties>` +
  `<Group${attr('Self', next())} ItemTransform="1 0 0 1 0 0" AppliedObjectStyle="ObjectStyle/$ID/[None]">${items}</Group></State>`;

/** A check box value that reads as ticked. */
export const checked = (value: string): boolean => value.trim() !== '' && !/^(0|false|no|off)$/i.test(value.trim());

function labels(field: FormFieldSpec, value: string): string {
  const pairs: [string, string][] = [];
  if (value && field.kind !== 'checkbox') pairs.push(['postext:value', value]);
  if (field.format) pairs.push(['postext:format', field.format]);
  if (field.calc) pairs.push(['postext:calc', formatFieldCalc(field.calc)]);
  return pairs.length ? `<Label>${pairs.map(([k, v]) => `<KeyValuePair${attr('Key', k)}${attr('Value', v)}/>`).join('')}</Label>` : '';
}

/** The `ChoiceList` of a combo box: an attribute (a list of words) when
 *  no option holds a space, otherwise a list property. */
function choices(options: string[]): { attr: string; prop: string } {
  if (!options.some((o) => /\s/.test(o))) return { attr: attr('ChoiceList', options.join(' ')), prop: '' };
  return { attr: '', prop: `<ChoiceList type="list">${options.map((o) => `<ListItem type="string">${escapeXml(o)}</ListItem>`).join('')}</ChoiceList>` };
}

/** The IDML of one form field. `next` hands out `Self` ids. */
export function fieldXml(next: () => string, field: FormFieldSpec, value: string, f: FieldPaint): string {
  const self = next();
  const tag = field.kind === 'checkbox' ? 'CheckBox' : field.kind === 'choice' ? 'ComboBox' : 'TextBox';
  const list = field.kind === 'choice' ? choices(field.options ?? []) : { attr: '', prop: '' };
  const common =
    `${attr('Self', self)}${attr('Name', field.name)}${attr('Description', field.tooltip ?? '')}${attr('ReadOnly', !!field.readonly)}${attr('Required', !!field.required)}` +
    ' PrintableInPdf="true" HiddenUntilTriggered="false" VisibilityInPdf="VisibleInPdf" Visible="true" ItemLayer="ulayer" AppliedObjectStyle="ObjectStyle/$ID/[None]"' +
    attr('ItemTransform', `1 0 0 1 ${num(f.cx)} ${num(f.cy)}`);
  const own =
    field.kind === 'checkbox'
      ? `${attr('CheckedByDefault', checked(value))} ExportValue="Yes"`
      : field.kind === 'choice'
        ? `${list.attr} SortChoices="false"${attr('FontSize', f.sizePt)}`
        : `${attr('Multiline', !!field.multiline)} Password="false" Scrollable="true"${attr('FontSize', f.sizePt)}`;
  const props = `<Properties><PathBoundingBox${attr('Left', -f.hw)}${attr('Top', -f.hh)}${attr('Right', f.hw)}${attr('Bottom', f.hh)}/>${list.prop}${labels(field, value)}</Properties>`;
  const look =
    field.kind === 'checkbox'
      ? state(next, 'UpOff', !checked(value), boxXml(next, f)) + state(next, 'UpOn', checked(value), boxXml(next, f) + tickXml(next, f))
      : boxXml(next, f);
  return `<${tag}${common}${own}>${props}${look}</${tag}>`;
}
