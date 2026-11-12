/**
 * The named styles a book's text uses that a design lacks (#1523): shown
 * before a design is kept, so the author knows which paragraphs, boxes or
 * headings lose their style. Read from the same warnings the build gives
 * for an unknown style id, the ones the design adds over the book's own.
 */

import type { PostextConfig, Resource } from '../types.js';
import { collectContentWarnings } from '../pipeline/contentWarnings.js';

/** What kind of named style a text names and a design lacks. */
export type MissingStyleKind = 'paragraph' | 'heading' | 'callout' | 'chip' | 'character' | 'mark' | 'table';

/** A style id the text uses and a design lacks. */
export interface MissingStyle {
  kind: MissingStyleKind;
  id: string;
}

const KINDS: Record<string, MissingStyleKind> = {
  unknownParagraphStyle: 'paragraph',
  unknownHeadingStyle: 'heading',
  unknownCalloutType: 'callout',
  unknownChipStyle: 'chip',
  unknownCharacterStyle: 'character',
  unknownMarkStyle: 'mark',
  unknownTableStyle: 'table',
};

function unknownStyles(chapters: readonly string[], config: PostextConfig, resources: readonly Resource[]): Map<string, MissingStyle> {
  const out = new Map<string, MissingStyle>();
  for (const markdown of chapters) {
    for (const w of collectContentWarnings(markdown, config, resources)) {
      const kind = KINDS[w.kind];
      if (!kind) continue;
      const rec = w as { style?: string; type?: string };
      const id = rec.style ?? rec.type;
      if (typeof id === 'string' && id.length > 0) out.set(`${kind}:${id}`, { kind, id });
    }
  }
  return out;
}

/** The style ids `chapters` use that `after` (a book with a design
 *  applied) lacks and `before` had, by kind and id, in text order. */
export function designMissingStyles(
  chapters: readonly string[],
  before: PostextConfig,
  after: PostextConfig,
  resources: readonly Resource[] = [],
): MissingStyle[] {
  const had = unknownStyles(chapters, before, resources);
  return [...unknownStyles(chapters, after, resources)].filter(([k]) => !had.has(k)).map(([, v]) => v);
}
