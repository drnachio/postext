/**
 * The parts of a book's design (#1523): the groups of the Sandbox's Design
 * panel, one by one, so a design is saved, tried and applied in the same
 * pieces the settings are edited in. Every top-level setting belongs to
 * one part, or is the book's own (`BOOK_OWN_KEYS`), or travels with the
 * parts that use it (`customFonts`, `chapterStyles`): the type check
 * below fails to compile when a setting is added to `PostextConfig` and
 * not here.
 *
 * Two settings are shared by several groups, as the panel shows them:
 *
 * - `page`: the binding is edited with the writing system, the crop marks
 *   with the print preparation, the baseline grid with the advanced
 *   settings; the rest of `page` (size, margins, ground, numbering) is
 *   the page part.
 * - `layout`: the writing mode belongs to the writing system; the rest of
 *   `layout` (columns, gutters, floats, balancing) is the page part.
 *
 * A dotted entry (`page.binding`) claims that one field; the whole-key
 * entry (`page`) takes every field the dotted entries leave.
 */

import type { PostextConfig } from '../types.js';
import type { PageConfig } from '../types/page.js';
import type { LayoutConfig } from '../types/layout.js';
import type { BookOwnKey } from '../defaults/bookKeys.js';

/** A part of a design: a group of the Design panel. */
export type DesignPart =
  | 'page' | 'writing' | 'colors' | 'text' | 'headings' | 'lists' | 'figures'
  | 'callouts' | 'exercises' | 'comics' | 'running' | 'parts' | 'output'
  | 'folio' | 'advanced';

/** Every part, in the Design panel's order. */
export const DESIGN_PARTS: readonly DesignPart[] = [
  'page', 'writing', 'colors', 'text', 'headings', 'lists', 'figures',
  'callouts', 'exercises', 'comics', 'running', 'parts', 'output', 'folio', 'advanced',
];

/** A top-level setting, or one field of `page` or `layout`. */
export type DesignKeyPath = keyof PostextConfig | `page.${keyof PageConfig & string}` | `layout.${keyof LayoutConfig & string}`;

/** The settings of each part. */
export const DESIGN_PART_KEYS = {
  page: ['page', 'layout', 'pageTemplates'],
  writing: ['cjk', 'layout.writingMode', 'page.binding'],
  colors: ['colorPalette', 'contrast'],
  text: [
    'bodyText', 'paragraphStyles', 'chipStyles', 'characterStyles', 'markStyles', 'codeStyle',
    'math', 'footnotes', 'links', 'lineNumbers', 'citations', 'symbolFont',
  ],
  headings: ['headings', 'headingStyles', 'toc', 'index', 'crossRefs'],
  lists: ['unorderedLists', 'orderedLists'],
  figures: ['captionStyle', 'tableStyle', 'tableStyles', 'diagramStyle', 'scoreStyle', 'scoreStyles', 'videoStyle', 'labelStyles'],
  callouts: ['calloutStyles', 'frameLooks'],
  exercises: ['exerciseStyles', 'exercises'],
  comics: ['comics'],
  running: ['header', 'footer'],
  parts: ['parts'],
  output: ['print', 'pdfGeneration', 'htmlViewer', 'canvasViewer', 'page.cutLines'],
  folio: ['folio'],
  advanced: ['page.baselineGrid'],
} as const satisfies { readonly [P in DesignPart]: readonly DesignKeyPath[] };

/** Settings that are no part but travel with the parts that use them: the
 *  font families the parts set text in, and the chapter styles, each cut
 *  down to the parts. */
export const DESIGN_CARRIED_KEYS = ['customFonts', 'chapterStyles'] as const satisfies readonly (keyof PostextConfig)[];

type TopKey<P> = P extends `${infer K}.${string}` ? K : P;
type PartKey = TopKey<(typeof DESIGN_PART_KEYS)[DesignPart][number]>;
type Unplaced = Exclude<keyof PostextConfig, PartKey | (typeof DESIGN_CARRIED_KEYS)[number] | BookOwnKey>;
/** Compile-time check: every setting has a place. A setting named here
 *  is missing from `DESIGN_PART_KEYS` (or from `BOOK_OWN_KEYS`). */
const everySettingPlaced: [Unplaced] extends [never] ? true : Unplaced = true;
void everySettingPlaced;

/** One slot of a configuration a part owns: a top-level key less the
 *  fields other parts claim, or one field of a key. */
export interface DesignPartSlot {
  part: DesignPart;
  key: keyof PostextConfig;
  /** One field of `key`. */
  field?: string;
  /** The fields of `key` that belong to other parts. */
  except?: readonly string[];
}

function buildSlots(): DesignPartSlot[] {
  const claimed = new Map<string, string[]>();
  for (const part of DESIGN_PARTS) {
    for (const path of DESIGN_PART_KEYS[part] as readonly string[]) {
      const dot = path.indexOf('.');
      if (dot < 0) continue;
      const key = path.slice(0, dot);
      claimed.set(key, [...(claimed.get(key) ?? []), path.slice(dot + 1)]);
    }
  }
  const slots: DesignPartSlot[] = [];
  for (const part of DESIGN_PARTS) {
    for (const path of DESIGN_PART_KEYS[part] as readonly string[]) {
      const dot = path.indexOf('.');
      if (dot >= 0) {
        slots.push({ part, key: path.slice(0, dot) as keyof PostextConfig, field: path.slice(dot + 1) });
      } else {
        const except = claimed.get(path);
        slots.push({ part, key: path as keyof PostextConfig, ...(except ? { except } : {}) });
      }
    }
  }
  return slots;
}

/** Every slot, in part order. */
export const DESIGN_PART_SLOTS: readonly DesignPartSlot[] = buildSlots();

/** The slots of `parts`. */
export function designPartSlots(parts: readonly DesignPart[]): DesignPartSlot[] {
  const wanted = new Set(parts);
  return DESIGN_PART_SLOTS.filter((s) => wanted.has(s.part));
}

/** Whether `v` names a part. */
export function isDesignPart(v: unknown): v is DesignPart {
  return typeof v === 'string' && (DESIGN_PARTS as readonly string[]).includes(v);
}

/** The part a setting belongs to (`key`, or `key` + one of its fields):
 *  undefined for the book's own settings and the carried ones. */
export function designPartOf(key: string, field?: string): DesignPart | undefined {
  let whole: DesignPart | undefined;
  for (const s of DESIGN_PART_SLOTS) {
    if (s.key !== key) continue;
    if (s.field !== undefined) {
      if (s.field === field) return s.part;
    } else {
      whole = s.part;
    }
  }
  return whole;
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The value of `slot` in `config` (an override works as well): undefined
 *  when it is unset (an object slot left with no field counts as unset). */
export function readDesignSlot(config: object, slot: DesignPartSlot): unknown {
  const value = (config as Json)[slot.key];
  if (slot.field !== undefined) return isObject(value) ? value[slot.field] : undefined;
  if (!slot.except || !isObject(value)) return value;
  const rest: Json = {};
  for (const [k, v] of Object.entries(value)) if (!slot.except.includes(k)) rest[k] = v;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

/** `config` with `slot` set to `value` (unset when undefined), the other
 *  parts' fields of the same key kept. Returns a new object; `config` is
 *  not changed. */
export function writeDesignSlot<T extends object>(config: T, slot: DesignPartSlot, value: unknown): T {
  const next: Json = { ...(config as Json) };
  const current = next[slot.key];
  if (slot.field !== undefined) {
    const obj: Json = isObject(current) ? { ...current } : {};
    if (value === undefined) delete obj[slot.field];
    else obj[slot.field] = value;
    if (Object.keys(obj).length > 0) next[slot.key] = obj;
    else delete next[slot.key];
    return next as T;
  }
  if (!slot.except) {
    if (value === undefined) delete next[slot.key];
    else next[slot.key] = value;
    return next as T;
  }
  const kept: Json = {};
  if (isObject(current)) for (const k of slot.except) if (current[k] !== undefined) kept[k] = current[k];
  const merged: Json = { ...(isObject(value) ? value : {}), ...kept };
  if (Object.keys(merged).length > 0) next[slot.key] = merged;
  else delete next[slot.key];
  return next as T;
}
