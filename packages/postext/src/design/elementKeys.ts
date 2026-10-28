// The keys of design elements and of the placement objects they share with
// composed frames and groups (#1122). Each table is checked against its type
// (`satisfies Record<keyof …, true>`): a key added to a type fails to compile
// until it is listed here, so the checks cannot go stale. Pure.

import type {
  ConnectorEnd,
  DesignBoxElement,
  DesignConnectorElement,
  DesignImageElement,
  DesignPathElement,
  DesignRuleElement,
  DesignTextElement,
  DesignTextRepeat,
  DesignTextStroke,
  ElementAnchor,
  ElementBoxStyle,
  ElementPlacement,
  ElementSizeTo,
  PostextConfig,
  TextDotsStyle,
} from '../types.js';
import type { DecorationRemoval, TemplateDecoration } from '../composed/types.js';
import { closestKey } from '../util/closestKey.js';

const COMMON = { kind: true, id: true, parity: true, pages: true, when: true, unless: true, pin: true } as const;
const PLACED = { ...COMMON, reserve: true, placement: true } as const;

export const DESIGN_TEXT_KEYS = {
  ...PLACED, content: true, fontFamily: true, figureStyle: true, fontSize: true, fontWeight: true, italic: true, color: true, align: true,
  direction: true, verticalAlign: true, lineHeight: true, letterSpacing: true, overflow: true, hyphenate: true,
  textTransform: true, box: true, dropCap: true, paragraphIndent: true, inlineMarks: true, stroke: true, dotted: true,
  repeat: true, writingMode: true, over: true,
} satisfies Record<keyof DesignTextElement, true>;
export const DESIGN_RULE_KEYS = { ...PLACED, direction: true, color: true, thickness: true } satisfies Record<keyof DesignRuleElement, true>;
export const DESIGN_BOX_KEYS = { ...PLACED, style: true } satisfies Record<keyof DesignBoxElement, true>;
export const DESIGN_IMAGE_KEYS = { ...PLACED, resourceId: true, decorative: true, fit: true, focus: true } satisfies Record<keyof DesignImageElement, true>;
export const DESIGN_PATH_KEYS = {
  ...PLACED, d: true, viewBox: true, fill: true, stroke: true, width: true, dash: true, preserveAspectRatio: true,
} satisfies Record<keyof DesignPathElement, true>;
export const DESIGN_CONNECTOR_KEYS = {
  ...COMMON, from: true, to: true, routing: true, radius: true, trunk: true, color: true, opacity: true, width: true,
  dash: true, startCap: true, endCap: true, capSize: true, over: true,
} satisfies Record<keyof DesignConnectorElement, true>;
export const CONNECTOR_END_KEYS = { to: true, side: true, at: true, gap: true, anchor: true } satisfies Record<keyof ConnectorEnd, true>;
export const DECORATION_REMOVAL_KEYS = { id: true, remove: true } satisfies Record<keyof DecorationRemoval, true>;
export const TEMPLATE_DECORATION_KEYS = { elements: true } satisfies Record<keyof TemplateDecoration, true>;

export const PLACEMENT_KEYS = { anchor: true, offset: true, size: true } satisfies Record<keyof ElementPlacement, true>;
export const ANCHOR_KEYS = { to: true, edge: true, at: true } satisfies Record<keyof ElementAnchor, true>;
export const OFFSET_KEYS = { x: true, y: true } satisfies Record<keyof NonNullable<ElementPlacement['offset']>, true>;
export const SIZE_KEYS = { width: true, height: true, maxWidth: true, minHeight: true } satisfies Record<keyof NonNullable<ElementPlacement['size']>, true>;
export const SIZE_TO_KEYS = { to: true, edge: true } satisfies Record<keyof ElementSizeTo, true>;

const BOX_STYLE_KEYS = {
  backgroundColor: true, borderColor: true, borderWidth: true, borderRadius: true, borderSides: true, padding: true,
} satisfies Record<keyof ElementBoxStyle, true>;
const BOX_PADDING_KEYS = { top: true, right: true, bottom: true, left: true } satisfies Record<keyof NonNullable<ElementBoxStyle['padding']>, true>;
const DROP_CAP_KEYS = {
  lines: true, fontFamily: true, fontWeight: true, fontSize: true, color: true, gap: true,
} satisfies Record<keyof NonNullable<DesignTextElement['dropCap']>, true>;
const STROKE_KEYS = { width: true, color: true, hollow: true } satisfies Record<keyof DesignTextStroke, true>;
const DOTS_KEYS = { spacing: true, size: true } satisfies Record<keyof TextDotsStyle, true>;
const REPEAT_KEYS = { gap: true, count: true } satisfies Record<keyof DesignTextRepeat, true>;

/** Every top-level key of a config. */
export const CONFIG_KEYS = {
  page: true, layout: true, bodyText: true, headings: true, tableStyle: true, tableStyles: true, captionStyle: true,
  diagramStyle: true, scoreStyle: true, scoreStyles: true, videoStyle: true, paragraphStyles: true, calloutStyles: true, chipStyles: true, markStyles: true,
  parts: true, headingStyles: true, toc: true, index: true, unorderedLists: true, orderedLists: true, math: true,
  footnotes: true, crossRefs: true, citations: true, cjk: true, lineNumbers: true, codeStyle: true, header: true,
  footer: true, locale: true, direction: true, numerals: true, debug: true, htmlViewer: true, canvasViewer: true,
  folio: true, comics: true, pageTemplates: true, labelStyles: true, frameLooks: true, composedViewerLeaf: true,
  pdfGeneration: true, print: true, contrast: true, checks: true, colorPalette: true, customFonts: true,
  resourceTypes: true, exerciseStyles: true, exercises: true,
} satisfies Record<keyof PostextConfig, true>;

const ELEMENT_KEYS: Record<string, Record<string, true>> = {
  text: DESIGN_TEXT_KEYS, rule: DESIGN_RULE_KEYS, box: DESIGN_BOX_KEYS, image: DESIGN_IMAGE_KEYS, path: DESIGN_PATH_KEYS,
  connector: DESIGN_CONNECTOR_KEYS,
};

/** How a warning's path is written: `/a/0/b` (a JSON pointer, as the page
 *  templates' checks write it) or `a[0].b` (as the other config checks). */
export interface KeyPath {
  key(path: string, key: string): string;
  index(path: string, i: number): string;
}
/** A JSON pointer (RFC 6901). */
export const POINTER_PATH: KeyPath = {
  key: (path, key) => `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`,
  index: (path, i) => `${path}/${i}`,
};
export const DOTTED_PATH: KeyPath = {
  key: (path, key) => (path ? `${path}.${key}` : key),
  index: (path, i) => `${path}[${i}]`,
};

/** An unknown key, as the config checks report it. */
export interface UnknownKey {
  path: string;
  value: string;
  suggestion?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The keys of `node` (a plain object) that `known` does not list. A key
 *  set to `undefined` sets nothing either way. */
export function unknownKeysOf(node: unknown, known: Record<string, true>, path: string, at: KeyPath, out: UnknownKey[]): void {
  if (!isRecord(node)) return;
  const names = Object.keys(known);
  for (const [key, value] of Object.entries(node)) {
    if (value === undefined || Object.prototype.hasOwnProperty.call(known, key)) continue;
    const suggestion = closestKey(key, names);
    out.push({ path: at.key(path, key), value: key, ...(suggestion ? { suggestion } : {}) });
  }
}

/** The keys of a placement (`anchor`, `offset`, `size`) of a design
 *  element, a frame or a group, and of the objects inside it: an anchor,
 *  an offset, a size and a `{ to, edge }` size (a length `{ value, unit }`
 *  is not checked here). */
export function placementUnknownKeys(placement: unknown, path: string, at: KeyPath, out: UnknownKey[]): void {
  if (!isRecord(placement)) return;
  unknownKeysOf(placement, PLACEMENT_KEYS, path, at, out);
  unknownKeysOf(placement.anchor, ANCHOR_KEYS, at.key(path, 'anchor'), at, out);
  unknownKeysOf(placement.offset, OFFSET_KEYS, at.key(path, 'offset'), at, out);
  const size = placement.size;
  if (!isRecord(size)) return;
  const sizePath = at.key(path, 'size');
  unknownKeysOf(size, SIZE_KEYS, sizePath, at, out);
  for (const key of Object.keys(SIZE_KEYS)) {
    const v = size[key];
    if (isRecord(v) && 'to' in v) unknownKeysOf(v, SIZE_TO_KEYS, at.key(sizePath, key), at, out);
  }
}

/** The keys of one design element (#1122) by its `kind`, its placement, a
 *  connector's ends and a text's or box's nested looks. An element of an
 *  unknown kind is not checked (it draws nothing); an inherited element
 *  taken out (`{ id, remove: true }`, #975) has only those two keys. */
export function designElementUnknownKeys(el: unknown, path: string, at: KeyPath, out: UnknownKey[]): void {
  if (!isRecord(el)) return;
  if (el.kind === undefined && el.remove === true) {
    unknownKeysOf(el, DECORATION_REMOVAL_KEYS, path, at, out);
    return;
  }
  const known = typeof el.kind === 'string' && Object.prototype.hasOwnProperty.call(ELEMENT_KEYS, el.kind) ? ELEMENT_KEYS[el.kind]! : undefined;
  if (!known) return;
  unknownKeysOf(el, known, path, at, out);
  placementUnknownKeys(el.placement, at.key(path, 'placement'), at, out);
  if (el.kind === 'connector') {
    unknownKeysOf(el.from, CONNECTOR_END_KEYS, at.key(path, 'from'), at, out);
    if (Array.isArray(el.to)) el.to.forEach((t, k) => unknownKeysOf(t, CONNECTOR_END_KEYS, at.index(at.key(path, 'to'), k), at, out));
    else unknownKeysOf(el.to, CONNECTOR_END_KEYS, at.key(path, 'to'), at, out);
  }
  if (el.kind === 'text') {
    boxStyleUnknownKeys(el.box, at.key(path, 'box'), at, out);
    unknownKeysOf(el.dropCap, DROP_CAP_KEYS, at.key(path, 'dropCap'), at, out);
    unknownKeysOf(el.stroke, STROKE_KEYS, at.key(path, 'stroke'), at, out);
    unknownKeysOf(el.dotted, DOTS_KEYS, at.key(path, 'dotted'), at, out);
    unknownKeysOf(el.repeat, REPEAT_KEYS, at.key(path, 'repeat'), at, out);
  }
  if (el.kind === 'box') boxStyleUnknownKeys(el.style, at.key(path, 'style'), at, out);
}

/** A box look's keys (corner and side keys are the box shape check's). */
function boxStyleUnknownKeys(style: unknown, path: string, at: KeyPath, out: UnknownKey[]): void {
  if (!isRecord(style)) return;
  unknownKeysOf(style, BOX_STYLE_KEYS, path, at, out);
  unknownKeysOf(style.padding, BOX_PADDING_KEYS, at.key(path, 'padding'), at, out);
}
