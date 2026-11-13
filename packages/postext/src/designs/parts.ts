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
 * - `bodyText`: the composition rules (#1540) — where hyphens may fall,
 *   the letters a hyphen leaves, the stacks, the citation and operator
 *   breaks, a hyphen at a column's foot — are the composition part, the
 *   rest is the text part. So the rules of a language's tradition are
 *   saved and applied apart from the type they are set in.
 *
 * A dotted entry (`page.binding`, `bodyText.hyphenation.ladders`) claims
 * that one field, however deep; the whole-key entry (`page`) takes every
 * field the dotted entries leave.
 */

import type { PostextConfig } from '../types.js';
import type { PageConfig } from '../types/page.js';
import type { LayoutConfig } from '../types/layout.js';
import type { BodyTextConfig } from '../types/text/bodyText/config.js';
import type { HyphenationConfig } from '../types/text/locale.js';
import type { BookOwnKey } from '../defaults/bookKeys.js';

/** A part of a design: a group of the Design panel. */
export type DesignPart =
  | 'page' | 'writing' | 'colors' | 'text' | 'composition' | 'headings' | 'lists' | 'figures'
  | 'callouts' | 'exercises' | 'comics' | 'running' | 'parts' | 'output'
  | 'folio' | 'advanced';

/** Every part, in the Design panel's order. */
export const DESIGN_PARTS: readonly DesignPart[] = [
  'page', 'writing', 'colors', 'text', 'composition', 'headings', 'lists', 'figures',
  'callouts', 'exercises', 'comics', 'running', 'parts', 'output', 'folio', 'advanced',
];

/** A top-level setting, or one field of `page`, `layout` or `bodyText`
 *  (`bodyText.hyphenation` one level further). */
export type DesignKeyPath =
  | keyof PostextConfig
  | `page.${keyof PageConfig & string}`
  | `layout.${keyof LayoutConfig & string}`
  | `bodyText.${keyof BodyTextConfig & string}`
  | `bodyText.hyphenation.${keyof HyphenationConfig & string}`;

/** The settings of each part. */
export const DESIGN_PART_KEYS = {
  page: ['page', 'layout', 'pageTemplates', 'dieCuts'],
  writing: ['cjk', 'layout.writingMode', 'page.binding'],
  colors: ['colorPalette', 'contrast'],
  text: [
    'bodyText', 'paragraphStyles', 'chipStyles', 'characterStyles', 'markStyles', 'codeStyle',
    'math', 'footnotes', 'links', 'lineNumbers', 'citations', 'symbolFont',
  ],
  composition: [
    'bodyText.hyphenation.minWordLength', 'bodyText.hyphenation.leftMin', 'bodyText.hyphenation.rightMin',
    'bodyText.hyphenation.capitalized', 'bodyText.hyphenation.fewerHyphens',
    'bodyText.hyphenation.ladders', 'bodyText.hyphenation.maxConsecutive', 'bodyText.hyphenation.ladderPenalty',
    'bodyText.hyphenation.lastWord', 'bodyText.hyphenation.lastWordPenalty',
    'bodyText.hyphenateAcrossColumns',
    'bodyText.stacks', 'bodyText.stackMinCharacters', 'bodyText.stackPenalty',
    'bodyText.citationBreaks', 'bodyText.citationBreakPenalty',
    'bodyText.operatorBreaks', 'bodyText.operatorBreakPenalty',
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
  /** One field of `key`, dotted when it is deeper (`hyphenation.ladders`). */
  field?: string;
  /** The fields of `key` that belong to other parts (dotted as `field`). */
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

/** The value at the dotted `path` of `node`, or undefined. */
function getAt(node: unknown, path: string): unknown {
  let at: unknown = node;
  for (const k of path.split('.')) {
    if (!isObject(at)) return undefined;
    at = at[k];
  }
  return at;
}

/** `node` (an object, or nothing) with the dotted `path` set to `value`,
 *  or removed when it is undefined; the objects on the way are copied, and
 *  one left with no field goes too (undefined when `node` is left empty). */
function setAt(node: unknown, path: readonly string[], value: unknown): Json | undefined {
  const [k, ...rest] = path;
  const out: Json = isObject(node) ? { ...node } : {};
  const child = rest.length === 0 ? value : setAt(out[k!], rest, value);
  if (child === undefined) delete out[k!];
  else out[k!] = child;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The value of `slot` in `config` (an override works as well): undefined
 *  when it is unset (an object slot left with no field counts as unset). */
export function readDesignSlot(config: object, slot: DesignPartSlot): unknown {
  const value = (config as Json)[slot.key];
  if (slot.field !== undefined) return getAt(value, slot.field);
  if (!slot.except || !isObject(value)) return value;
  let rest: Json | undefined = value;
  for (const path of slot.except) {
    if (getAt(rest, path) !== undefined) rest = setAt(rest, path.split('.'), undefined);
  }
  return rest;
}

/** `config` with `slot` set to `value` (unset when undefined), the other
 *  parts' fields of the same key kept. Returns a new object; `config` is
 *  not changed. */
export function writeDesignSlot<T extends object>(config: T, slot: DesignPartSlot, value: unknown): T {
  const next: Json = { ...(config as Json) };
  const current = next[slot.key];
  let written: unknown;
  if (slot.field !== undefined) {
    written = setAt(current, slot.field.split('.'), value);
  } else if (!slot.except) {
    written = value;
  } else {
    // The design's value, less any field of another part it carries, with
    // the book's fields of the other parts put back.
    let merged: Json | undefined = isObject(value) ? value : undefined;
    for (const path of slot.except) merged = setAt(merged, path.split('.'), getAt(current, path));
    written = merged;
  }
  if (written === undefined) delete next[slot.key];
  else next[slot.key] = written;
  return next as T;
}
