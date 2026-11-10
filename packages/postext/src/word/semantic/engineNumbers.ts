// The numbers the engine prints, for the semantic .docx (#1395): heading
// prefixes and resource numbers ("1.7") counted through the book chapter
// after chapter, as the layout counts them when it lays a book out one
// chapter at a time (`continuationAfter`), and the caption and `:ref`
// labels built by the engine's own helpers.

import { headingNumberingOptions, headingTemplatesOf } from '../../pipeline/contents/outline.js';
import { headingIsNumbered } from '../../pipeline/sections/headingStyles.js';
import {
  computeHeadingContext,
  computeResourceNumberingState,
  type HeadingContext,
  type ResourceCounterState,
  type ResourceNumberEntry,
  type ResourceNumberingMap,
} from '../../pipeline/resources/resourceNumbering.js';
import { captionLabelText, resolveRefLabel } from '../../pipeline/resources/resourceLayout/refSpans.js';
import { mergeCaptionStyle } from '../../defaults/resources/captionStyle.js';
import { documentLocale, effectiveResourceTypes } from '../../defaults/resources/resourceTypes.js';
import { computeHeadingNumbering } from '../../numerals/numbering.js';
import type { InlineSpan } from '../../parse/index.js';
import type { ContentBlock } from '../../parse/types.js';
import type { HeadingCounters, PostextConfig, Resource, ResourceType, ResolvedCaptionStyleConfig } from '../../types.js';
import type { ResolvedConfig } from '../../vdt.js';

export interface BookNumbers {
  resourceTypes: ResourceType[];
  /** Every numbered resource of the book, by id. */
  resources: ResourceNumberingMap;
  /** Order of first showing per type (1, 2, …): a caption whose number is
   *  this plain count keeps a Word SEQ field. */
  ordinals: Map<string, number>;
  /** Heading number prefix per block, per chapter (undefined = none). */
  headings: (string | undefined)[][];
  /** The counter of each heading, per block, per chapter (what a composed
   *  page's `{headingNumber}` prints), numbered or not by a template. */
  headingValues: (number | undefined)[][];
  /** The number of each comic strip counted as a resource type
   *  (`:::strip{type=figure caption=…}`), by its block. */
  strips: Map<ContentBlock, ResourceNumberEntry>;
}

/** Number the headings and resources of every chapter in book order,
 *  from `startHeadings`: the counters a book that continues a longer one
 *  starts from (`preset.json`'s `start.headings`, #1444). */
export function bookNumbers(chapters: readonly { blocks: ContentBlock[] }[], config: PostextConfig, resolved: ResolvedConfig, resources: Resource[], startHeadings?: HeadingCounters): BookNumbers {
  const resourceTypes = effectiveResourceTypes(config, resources);
  const locale = documentLocale(config);
  const isNumbered = (b: ContentBlock): boolean => headingIsNumbered(b, resolved);
  const templates = headingTemplatesOf(resolved);
  const options = headingNumberingOptions(resolved);
  let heading: HeadingContext | undefined = startHeadings ? { ...startHeadings } : undefined;
  let counters: ResourceCounterState | undefined;
  let numbered: ResourceNumberingMap = {};
  const headings: (string | undefined)[][] = [];
  const headingValues: (number | undefined)[][] = [];
  const strips = new Map<ContentBlock, ResourceNumberEntry>();
  for (const ch of chapters) {
    const start = heading ? [heading.h1, heading.h2, heading.h3, heading.h4, heading.h5, heading.h6] : undefined;
    const counted = computeHeadingNumbering(ch.blocks, templates, start, isNumbered, options);
    headings.push(counted.prefixes);
    headingValues.push(counted.values);
    const context = computeHeadingContext(ch.blocks, heading, isNumbered);
    const state = computeResourceNumberingState(ch.blocks, resourceTypes, resources, context, { counters, numbered }, resolved.numerals, locale);
    numbered = state.map;
    counters = state.counters;
    for (const [i, entry] of Object.entries(state.strips)) {
      const b = ch.blocks[Number(i)];
      if (b) strips.set(b, entry);
    }
    if (context.length) heading = context[context.length - 1];
  }
  // The plain count of each resource in its type, in numbering order.
  const ordinals = new Map<string, number>();
  const perType = new Map<string, number>();
  const typeOf = new Map(resources.map((r) => [r.id, r.typeId]));
  for (const id of Object.keys(numbered)) {
    const t = typeOf.get(id) ?? numbered[id]!.typeId ?? '';
    const n = (perType.get(t) ?? 0) + 1;
    perType.set(t, n);
    ordinals.set(id, n);
  }
  return { resourceTypes, resources: numbered, ordinals, headings, headingValues, strips };
}

/** A type's caption style over the document's. */
export function captionStyleOf(resolved: ResolvedConfig, type: ResourceType | undefined): ResolvedCaptionStyleConfig {
  return mergeCaptionStyle(resolved.captionStyle, type?.captionStyle, resolved.colorPalette);
}

/** The label that opens a resource's caption ("Figure 1.7. "), split
 *  around the number; undefined when the engine prints none. */
export function captionLabelParts(resolved: ResolvedConfig, type: ResourceType | undefined, number: string): { head: string; number: string; tail: string } | undefined {
  const cs = captionStyleOf(resolved, type);
  const text = captionLabelText(type?.captionPrefix ?? '', number, cs);
  if (!text) return undefined;
  if (!number) return { head: text, number: '', tail: '' };
  const at = text.indexOf(number, (type?.captionPrefix ?? '').length);
  return at < 0 ? { head: text, number: '', tail: '' } : { head: text.slice(0, at), number, tail: text.slice(at + number.length) };
}

/** The words a `:ref` to a resource prints, as the engine prints them. */
export function resourceRefLabel(ref: NonNullable<InlineSpan['ref']>, numbers: BookNumbers, resources: Resource[], resolved: ResolvedConfig): string {
  return resolveRefLabel(ref, numbers.resources, numbers.resourceTypes, resources, resolved.captionStyle.labelNumberGap);
}
