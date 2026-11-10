// Computed properties: what a paragraph or a run is set in once its
// style, the styles that one is based on, and its own overrides are put
// together.
//
// A style writes only what differs from the style it is based on, down
// to InDesign's root style of the kind (`[No paragraph style]` writes
// every paragraph and character attribute; `[No character style]` writes
// none). A text range writes only its local overrides. So the value of
// an attribute is the first one found walking: the range, its style,
// that style's parents. A run's character formatting comes from the
// paragraph first (a paragraph style carries character attributes too)
// and the character style and the run's overrides are laid over it.

import type { IdmlDocument, IdmlParagraph, IdmlRun, IdmlStyle, Props, StyleKind } from '../model/document.js';

const EMPTY: Props = { attrs: {}, properties: {} };

/** `over` laid on `base`: a new `Props`, neither is changed. */
export function mergeProps(base: Props, over: Props): Props {
  return { attrs: { ...base.attrs, ...over.attrs }, properties: { ...base.properties, ...over.properties } };
}

/** The style and the ones it is based on, root first. A chain that comes
 *  back to itself is cut where it does. */
export function styleChain(doc: IdmlDocument, kind: StyleKind, self: string | undefined): IdmlStyle[] {
  const map = doc.styles[kind];
  const chain: IdmlStyle[] = [];
  const seen = new Set<string>();
  let at = self;
  while (at !== undefined && !seen.has(at)) {
    seen.add(at);
    const style = map.get(at);
    if (!style) break;
    chain.push(style);
    at = style.basedOn;
  }
  return chain.reverse();
}

const computed = new WeakMap<IdmlDocument, Map<string, Props>>();

// What a style says of itself rather than of the text set in it.
const OWN = new Set(['Self', 'Name', 'BasedOn', 'NextStyle', 'KeyboardShortcut', 'ExtendedKeyboardShortcut', 'StyleUniqueId', 'Imported', 'SplitDocument', 'EmitCss', 'IncludeClass', 'EpubAriaRole', 'PreviewColor']);

function strip(p: Props): Props {
  const attrs: Record<string, string> = {};
  for (const k in p.attrs) if (!OWN.has(k)) attrs[k] = p.attrs[k]!;
  const properties: Props['properties'] = {};
  for (const k in p.properties) if (!OWN.has(k)) properties[k] = p.properties[k]!;
  return { attrs, properties };
}

/** A style's properties with everything it inherits. The result is
 *  shared between calls: read it, do not change it. */
export function computeStyle(doc: IdmlDocument, kind: StyleKind, self: string | undefined): Props {
  if (self === undefined) return EMPTY;
  let cache = computed.get(doc);
  if (!cache) computed.set(doc, (cache = new Map()));
  const key = `${kind}\u0000${self}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let out = EMPTY;
  for (const style of styleChain(doc, kind, self)) out = mergeProps(out, strip(style));
  cache.set(key, out);
  return out;
}

/** A paragraph's own overrides: the attributes of its range without the
 *  references that are not formatting. */
const RANGE = new Set(['AppliedParagraphStyle', 'AppliedCharacterStyle', 'AppliedConditions']);

function overrides(p: Props): Props {
  let attrs = p.attrs;
  for (const k of RANGE) {
    if (k in attrs) {
      if (attrs === p.attrs) attrs = { ...attrs };
      delete attrs[k];
    }
  }
  return attrs === p.attrs ? p : { attrs, properties: p.properties };
}

const paragraphCache = new WeakMap<IdmlParagraph, Props>();

/** Computed paragraph style with the paragraph's overrides over it. */
export function paragraphProps(doc: IdmlDocument, para: IdmlParagraph): Props {
  const hit = paragraphCache.get(para);
  if (hit) return hit;
  const out = mergeProps(computeStyle(doc, 'paragraph', para.paragraphStyle), overrides(para));
  paragraphCache.set(para, out);
  return out;
}

/** What a run is set in: the paragraph's result, the computed character
 *  style over it, the run's overrides over both. */
export function runProps(doc: IdmlDocument, para: IdmlParagraph, run: IdmlRun): Props {
  return mergeProps(mergeProps(paragraphProps(doc, para), computeStyle(doc, 'character', run.characterStyle)), overrides(run));
}

/** One attribute of a run without merging everything: the run, its
 *  character style, the paragraph, its style. For counting over a whole
 *  book. */
export function runAttr(doc: IdmlDocument, para: IdmlParagraph, run: IdmlRun, name: string): string | undefined {
  return run.attrs[name] ?? computeStyle(doc, 'character', run.characterStyle).attrs[name] ?? para.attrs[name] ?? computeStyle(doc, 'paragraph', para.paragraphStyle).attrs[name];
}

/** The same for a property (`AppliedFont`), as text. */
export function runProperty(doc: IdmlDocument, para: IdmlParagraph, run: IdmlRun, name: string): string | undefined {
  const el = run.properties[name] ?? computeStyle(doc, 'character', run.characterStyle).properties[name] ?? para.properties[name] ?? computeStyle(doc, 'paragraph', para.paragraphStyle).properties[name];
  if (!el) return undefined;
  let text = '';
  for (const c of el.children) if (typeof c === 'string') text += c;
  return text;
}

/** A style by its path of names (`['Heads', 'H1']`), for a host that
 *  knows styles as their author sees them. */
export function styleByPath(doc: IdmlDocument, kind: StyleKind, path: readonly string[]): IdmlStyle | undefined {
  const wanted = path.join('\u0000');
  for (const s of doc.styles[kind].values()) if ([...s.groups, s.name].join('\u0000') === wanted) return s;
  return undefined;
}

/** A style's path as its author reads it (`Heads/H1`). */
export const stylePath = (style: IdmlStyle): string => [...style.groups, style.name].join('/');
