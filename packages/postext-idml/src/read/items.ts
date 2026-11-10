// Page items: frames, shapes, groups, pictures, form fields and the
// states of interactive objects, wherever they stand (a spread, a group,
// a text they are anchored in, a table cell).

import { bool, child, children, isElement, localName, num, nums, property, textOf, type XmlElement } from '../xml/read.js';
import type { AnchoredData, GraphicData, IdmlPageItem, PageItemKind, TextFrameData, TextWrapData } from '../model/document.js';
import { matrixOf } from '../model/geometry.js';
import { edges, listNumbers, pathsOf, propsOf } from './props.js';

const SHAPES: Record<string, PageItemKind> = {
  TextFrame: 'TextFrame', Rectangle: 'Rectangle', Oval: 'Oval', Polygon: 'Polygon', GraphicLine: 'GraphicLine', Group: 'Group',
  Button: 'Button', MultiStateObject: 'MultiStateObject', TextBox: 'TextBox', CheckBox: 'CheckBox', RadioButton: 'RadioButton',
  ComboBox: 'ComboBox', ListBox: 'ListBox', SignatureField: 'SignatureField', EPSText: 'EPSText', HtmlItem: 'HtmlItem',
};

const GRAPHICS = new Set(['Image', 'PDF', 'EPS', 'SVG', 'WMF', 'PICT', 'ImportedPage', 'Movie', 'Sound', 'Graphic']);

/** The element is a page item this reader knows. */
export const isPageItem = (el: XmlElement): boolean => localName(el.name) in SHAPES;

function base64(s: string): Uint8Array | undefined {
  const clean = s.replace(/\s+/g, '');
  if (!clean || /[^A-Za-z0-9+/=]/.test(clean)) return undefined;
  try {
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return undefined;
  }
}

function linkName(uri: string): string {
  let path = uri.replace(/^file:/i, '').replace(/[?#].*$/, '');
  try {
    path = decodeURIComponent(path);
  } catch {
    // The path as written.
  }
  return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '';
}

function graphicOf(el: XmlElement): GraphicData {
  const p = propsOf(el);
  const gb = p.properties.GraphicBounds;
  const link = child(el, 'Link');
  const contents = p.properties.Contents;
  const clip = child(el, 'ClippingPathSettings');
  const ppi = (name: string): [number, number] | undefined => {
    const v = nums(el, name);
    return v && v.length === 2 ? [v[0]!, v[1]!] : undefined;
  };
  const data = contents ? base64(textOf(contents)) : undefined;
  const actual = ppi('ActualPpi');
  const effective = ppi('EffectivePpi');
  const pdfPage = num(child(el, 'PDFAttribute'), 'PageNumber');
  const clipPaths = clip && clip.attrs.ClippingType && clip.attrs.ClippingType !== 'None' ? pathsOf(clip) : [];
  return {
    type: localName(el.name) as GraphicData['type'],
    self: el.attrs.Self ?? '',
    transform: matrixOf(nums(el, 'ItemTransform')),
    bounds: { left: num(gb, 'Left') ?? 0, top: num(gb, 'Top') ?? 0, right: num(gb, 'Right') ?? 0, bottom: num(gb, 'Bottom') ?? 0 },
    ...(link?.attrs.LinkResourceURI !== undefined
      ? { link: { uri: link.attrs.LinkResourceURI, stored: link.attrs.StoredState ?? 'Normal', ...(link.attrs.LinkResourceFormat ? { format: link.attrs.LinkResourceFormat.replace(/^\$ID\//, '') } : {}), name: linkName(link.attrs.LinkResourceURI) } }
      : {}),
    ...(data ? { data } : {}),
    ...(el.attrs.Space ? { space: el.attrs.Space.replace(/^\$ID\/#?/, '') } : {}),
    ...(actual ? { actualPpi: actual } : {}),
    ...(effective ? { effectivePpi: effective } : {}),
    ...(pdfPage !== undefined ? { pageNumber: pdfPage } : {}),
    ...(clipPaths.length ? { clippingPath: clipPaths } : {}),
    props: p,
  };
}

function textFrameOf(el: XmlElement): TextFrameData {
  const pref = child(el, 'TextFramePreference');
  const inset = listNumbers(property(pref, 'InsetSpacing'));
  const one = num(pref, 'InsetSpacing');
  const ref = (name: string) => (el.attrs[name] && el.attrs[name] !== 'n' ? el.attrs[name] : undefined);
  const prev = ref('PreviousTextFrame');
  const next = ref('NextTextFrame');
  const fixed = num(pref, 'TextColumnFixedWidth');
  return {
    story: el.attrs.ParentStory ?? '',
    ...(prev ? { previous: prev } : {}),
    ...(next ? { next } : {}),
    columns: Math.max(1, Math.round(num(pref, 'TextColumnCount') ?? 1)),
    gutter: num(pref, 'TextColumnGutter') ?? 12,
    inset: inset?.length === 4 ? [inset[0]!, inset[1]!, inset[2]!, inset[3]!] : inset?.length === 1 ? [inset[0]!, inset[0]!, inset[0]!, inset[0]!] : one !== undefined ? [one, one, one, one] : [0, 0, 0, 0],
    firstBaseline: pref?.attrs.FirstBaselineOffset ?? 'AscentOffset',
    minFirstBaseline: num(pref, 'MinimumFirstBaselineOffset') ?? 0,
    verticalJustification: pref?.attrs.VerticalJustification ?? 'TopAlign',
    autoSizing: pref?.attrs.AutoSizingType ?? 'Off',
    ignoreWrap: bool(pref, 'IgnoreWrap') ?? false,
    ...(fixed !== undefined && pref?.attrs.UseFixedColumnWidth === 'true' ? { columnFixedWidth: fixed } : {}),
  };
}

function wrapOf(el: XmlElement): TextWrapData | undefined {
  const w = child(el, 'TextWrapPreference');
  const mode = w?.attrs.TextWrapMode;
  if (!w || !mode || mode === 'None') return undefined;
  const contour = pathsOf(w);
  return {
    mode: mode as TextWrapData['mode'],
    offset: edges(property(w, 'TextWrapOffset')),
    side: w.attrs.TextWrapSide ?? 'BothSides',
    inverse: w.attrs.Inverse === 'true',
    ...(contour.length ? { contour } : {}),
  };
}

function anchoredOf(el: XmlElement): AnchoredData | undefined {
  const a = child(el, 'AnchoredObjectSetting');
  if (!a) return undefined;
  const position = a.attrs.AnchoredPosition;
  return { position: position === 'AboveLine' || position === 'Anchored' ? position : 'InlinePosition', props: a.attrs };
}

const EFFECTS = ['DropShadowSetting', 'FeatherSetting', 'InnerShadowSetting', 'OuterGlowSetting', 'InnerGlowSetting', 'BevelAndEmbossSetting', 'SatinSetting', 'DirectionalFeatherSetting', 'GradientFeatherSetting'];

function transparencyOf(el: XmlElement): { opacity: number; blendMode?: string; effects: string[] } {
  let opacity = 100;
  let blendMode: string | undefined;
  const effects = new Set<string>();
  for (const name of ['TransparencySetting', 'FillTransparencySetting', 'StrokeTransparencySetting', 'ContentTransparencySetting']) {
    const t = child(el, name);
    if (!t) continue;
    const b = child(t, 'BlendingSetting');
    if (name === 'TransparencySetting') {
      opacity = num(b, 'Opacity') ?? 100;
      if (b?.attrs.BlendMode && b.attrs.BlendMode !== 'Normal') blendMode = b.attrs.BlendMode;
    } else if ((num(b, 'Opacity') ?? 100) < 100) effects.add(`${name.replace('TransparencySetting', '')} opacity`);
    for (const e of EFFECTS) {
      const s = child(t, e);
      if (!s) continue;
      const on = s.attrs.Mode ? s.attrs.Mode !== 'None' : s.attrs.Applied === 'true';
      if (on) effects.add(e.replace('Setting', ''));
    }
  }
  return { opacity, ...(blendMode ? { blendMode } : {}), effects: [...effects] };
}

/** One page item and what it holds. `depth` guards groups nested without
 *  end. */
export function pageItemOf(el: XmlElement, depth = 0): IdmlPageItem {
  const element = localName(el.name);
  const kind = SHAPES[element] ?? 'Other';
  const p = propsOf(el);
  const a = el.attrs;
  const ref = (v: string | undefined) => (v && v !== 'n' ? v : undefined);
  const item: IdmlPageItem = {
    ...p,
    kind,
    element,
    self: a.Self ?? '',
    transform: matrixOf(nums(el, 'ItemTransform')),
    paths: pathsOf(el),
    visible: a.Visible !== 'false',
    locked: a.Locked === 'true',
    nonprinting: a.Nonprinting === 'true',
    textPaths: [],
    children: [],
    ...transparencyOf(el),
  };
  const name = a.Name && a.Name !== '$ID/' ? a.Name : undefined;
  if (name) item.name = name;
  const layer = ref(a.ItemLayer);
  if (layer) item.layer = layer;
  const style = ref(a.AppliedObjectStyle);
  if (style) item.objectStyle = style;
  if (a.ContentType) item.contentType = a.ContentType;
  const over = ref(a.OverriddenMasterPageItem);
  if (over) item.overrides = over;
  if (kind === 'TextFrame') item.textFrame = textFrameOf(el);
  const wrap = wrapOf(el);
  if (wrap) item.wrap = wrap;
  const anchored = anchoredOf(el);
  if (anchored) item.anchored = anchored;
  const alt = child(el, 'ObjectExportOption');
  if (alt?.attrs.AltTextSourceType === 'SourceCustom' && alt.attrs.CustomAltText && alt.attrs.CustomAltText !== '$ID/') item.altText = alt.attrs.CustomAltText;

  if (depth > 64) return item;
  const states: NonNullable<IdmlPageItem['states']> = [];
  for (const c of el.children) {
    if (!isElement(c)) continue;
    const n = localName(c.name);
    if (GRAPHICS.has(n)) item.graphic ??= graphicOf(c);
    else if (n === 'TextPath') item.textPaths.push({ story: c.attrs.ParentStory ?? '', props: c.attrs });
    else if (n === 'State') {
      states.push({ name: c.attrs.Name ?? '', active: c.attrs.Active === 'true', items: children(c).filter(isPageItem).map((x) => pageItemOf(x, depth + 1)) });
    } else if (n in SHAPES) item.children.push(pageItemOf(c, depth + 1));
  }
  if (states.length) item.states = states;
  return item;
}
