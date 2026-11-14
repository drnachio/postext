// `Resources/Graphic.xml` (swatches and stroke styles) and
// `Resources/Fonts.xml`.

import { child, children, isElement, localName, num, nums, type XmlElement } from '../xml/read.js';
import type { ColourSpace, IdmlColor, IdmlFont, IdmlStrokeStyle, IdmlSwatch, IdmlWarning } from '../model/document.js';
import { plainName } from './props.js';

const SPACES: Record<string, ColourSpace> = { CMYK: 'CMYK', RGB: 'RGB', LAB: 'LAB', HSB: 'HSB', MixedInk: 'MixedInk' };
const spaceOf = (v: string | undefined): ColourSpace => SPACES[v ?? ''] ?? 'CMYK';

// `ColorOverride` marks the colours InDesign keeps itself: `[Black]`,
// `[Paper]` (the stock: it prints nothing), `[Registration]` (every
// plate) and the hidden process inks it reserves.
const SPECIALS: Record<string, NonNullable<IdmlColor['special']>> = { Specialblack: 'black', Specialpaper: 'paper', Specialregistration: 'registration', Hiddenreserved: 'reserved' };
const MODELS = new Set(['Process', 'Spot', 'Registration', 'MixedInkModel']);

/** The key-value pairs of an element's script label, if it has any. */
export function labelOf(el: XmlElement): Record<string, string> | undefined {
  return labelPairs(children(child(el, 'Properties'), 'Label'));
}

/** The key-value pairs of `<Label>` elements, if they hold any. */
export function labelPairs(labels: readonly XmlElement[]): Record<string, string> | undefined {
  const pairs = labels.flatMap((l) => children(l, 'KeyValuePair'));
  if (!pairs.length) return undefined;
  const out: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const kv of pairs) if (kv.attrs.Key) out[kv.attrs.Key] = kv.attrs.Value ?? '';
  return out;
}

function colourOf(el: XmlElement): IdmlColor {
  const a = el.attrs;
  const special = SPECIALS[a.ColorOverride ?? ''];
  const alt = nums(el, 'AlternateColorValue');
  const colour: IdmlColor = {
    kind: 'color',
    self: a.Self ?? '',
    name: plainName(a.Name),
    model: MODELS.has(a.Model ?? '') ? (a.Model as IdmlColor['model']) : 'Process',
    space: spaceOf(a.Space),
    value: nums(el, 'ColorValue') ?? [],
    visible: a.Visible !== 'false',
  };
  if (special) colour.special = special;
  if (a.AlternateSpace && a.AlternateSpace !== 'NoAlternateColor' && alt?.length) colour.alternate = { space: spaceOf(a.AlternateSpace), value: alt };
  const label = labelOf(el);
  if (label) colour.label = label;
  return colour;
}

export interface GraphicResources {
  swatches: Map<string, IdmlSwatch>;
  strokeStyles: Map<string, IdmlStrokeStyle>;
}

// InDesign's own stroke styles are named, not described: what each one
// draws is known by its name.
function builtInStroke(name: string): IdmlStrokeStyle['kind'] {
  if (name === 'Solid') return 'solid';
  if (/Dash/.test(name)) return 'dashed';
  if (/Dot/.test(name)) return 'dotted';
  if (/Thick|Thin|Triple/.test(name)) return 'striped';
  return 'other';
}

export function graphicOf(root: XmlElement, warnings: IdmlWarning[], part?: string): GraphicResources {
  const swatches = new Map<string, IdmlSwatch>();
  const strokeStyles = new Map<string, IdmlStrokeStyle>();
  const put = (s: IdmlSwatch): void => {
    if (!s.self) return;
    if (swatches.has(s.self)) warnings.push({ code: 'duplicateId', message: `Swatch ${s.self.slice(0, 80)} is written twice; the first one is kept`, ...(part ? { part } : {}) });
    else swatches.set(s.self, s);
  };
  for (const el of root.children) {
    if (!isElement(el)) continue;
    const a = el.attrs;
    switch (localName(el.name)) {
      case 'Color':
        put(colourOf(el));
        break;
      case 'Tint':
        put({ kind: 'tint', self: a.Self ?? '', name: plainName(a.Name), base: a.BaseColor ?? '', tint: num(el, 'TintValue') ?? 100 });
        break;
      case 'Gradient': {
        const stops = children(el, 'GradientStop').map((s) => ({ color: s.attrs.StopColor ?? '', location: num(s, 'Location') ?? 0, midpoint: num(s, 'Midpoint') ?? 50 }));
        put({ kind: 'gradient', self: a.Self ?? '', name: plainName(a.Name), type: a.Type === 'Radial' ? 'Radial' : 'Linear', stops });
        break;
      }
      case 'MixedInk':
      case 'MixedInkGroup':
        put({
          kind: 'mixedInk',
          self: a.Self ?? '',
          name: plainName(a.Name),
          inks: (a.InkList ?? '').split(/\s+(?=Ink\/)/).filter(Boolean),
          values: nums(el, 'InkValues') ?? [],
          space: spaceOf(a.Space),
          value: nums(el, 'ColorValue') ?? [],
        });
        break;
      case 'Swatch':
        put({ kind: 'none', self: a.Self ?? '', name: plainName(a.Name) });
        break;
      case 'StrokeStyle':
        if (a.Self) strokeStyles.set(a.Self, { self: a.Self, name: plainName(a.Name), kind: builtInStroke(plainName(a.Name)) });
        break;
      // Stroke styles a user defined: these do carry their description.
      case 'DashedStrokeStyle': {
        const dashes = nums(el, 'DashArray');
        if (a.Self) strokeStyles.set(a.Self, { self: a.Self, name: plainName(a.Name), kind: 'dashed', ...(dashes?.length ? { dashArray: dashes } : {}) });
        break;
      }
      case 'DottedStrokeStyle':
        if (a.Self) strokeStyles.set(a.Self, { self: a.Self, name: plainName(a.Name), kind: 'dotted' });
        break;
      case 'StripedStrokeStyle':
        if (a.Self) strokeStyles.set(a.Self, { self: a.Self, name: plainName(a.Name), kind: 'striped' });
        break;
      default:
    }
  }
  return { swatches, strokeStyles };
}

export function fontsOf(root: XmlElement): IdmlFont[] {
  const out: IdmlFont[] = [];
  for (const family of children(root, 'FontFamily')) {
    for (const f of children(family, 'Font')) {
      const a = f.attrs;
      const font: IdmlFont = { family: a.FontFamily ?? family.attrs.Name ?? '', style: a.FontStyleName ?? '' };
      if (a.PostScriptName) font.postScriptName = a.PostScriptName;
      if (a.FullName) font.fullName = a.FullName;
      if (a.FontType) font.type = a.FontType;
      if (a.Status) font.status = a.Status;
      out.push(font);
    }
  }
  return out;
}

