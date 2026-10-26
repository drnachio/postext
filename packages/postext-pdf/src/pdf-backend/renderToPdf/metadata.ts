// The document's language tag, metadata strings and title, and the
// structure element of an opener's text (#1276: split out of
// pdf-backend/index.ts).
import { type HyphenationLocale, canonicalLocaleTag, type VDTDocument, type VDTBlock, type VDTPage } from 'postext';
import { numberedHeadingText } from '../structure/outlines.js';
import type { StructElem } from '../structure/tagging.js';
import { StructureFlow } from '../structure/structureFlow.js';

/** BCP 47 tag of a document (`/Lang`): its `locale` (`'zh-Hant-TW'`,
 *  script and region kept), else the tag its hyphenation was asked for
 *  (`'es-ES'`, `'sv'`) when the patterns are another locale's, else the
 *  patterns' own (`'en-us'` → `'en-US'`). */
export function languageTag(config: { locale?: string; bodyText?: { hyphenation?: { locale?: HyphenationLocale; tag?: string } } } | undefined): string | undefined {
  const declared = canonicalLocaleTag(config?.locale);
  if (declared) return declared;
  const hyphenation = config?.bodyText?.hyphenation;
  const locale = hyphenation?.tag?.trim() || hyphenation?.locale;
  if (!locale) return undefined;
  // Canonical case: language lower, a two-letter region upper, the script
  // and variant subtags as given.
  return locale.replace(/_/g, '-').split('-')
    .map((sub, i) => (i === 0 ? sub.toLowerCase() : sub.length === 2 ? sub.toUpperCase() : sub))
    .join('-');
}

/** A metadata value as PDF text. The engine hands the printed fields over
 *  as strings; a VDT from elsewhere may still carry typed YAML values
 *  (`title: 1984` is a number, a date a `Date`, `author: [A, B]` a list),
 *  which pdf-lib rejects — coerce them rather than throw. */
export function metadataString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === 'boolean') return String(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  if (Array.isArray(value)) {
    const items = value.map(metadataString).filter((v): v is string => !!v);
    return items.length > 0 ? items.join(', ') : undefined;
  }
  return undefined;
}

/** Title of the document for the PDF metadata: the declared title, else the
 *  first heading (PDF/UA-1 §7.1 requires one). */
export function documentTitle(docs: readonly VDTDocument[]): string {
  const declared = metadataString(docs[0]?.metadata?.title)?.trim();
  if (declared) return declared;
  let best: VDTBlock | undefined;
  for (const doc of docs) {
    for (const block of doc.blocks) {
      if (block.type !== 'heading') continue;
      if (!best || (block.headingLevel ?? 1) < (best.headingLevel ?? 1)) best = block;
      if ((best.headingLevel ?? 1) === 1) break;
    }
    if (best && (best.headingLevel ?? 1) === 1) break;
  }
  return (best && numberedHeadingText(best)) || 'Document';
}

/** The heading element an opener band's text belongs to: the part title on
 *  a part-divider page, else the `span: 'page'` heading the band replaced
 *  (hidden in its column, its lines still set — a structural `hidden`
 *  heading, whose lines have no height, prints nothing at all), else a
 *  plain paragraph. */
export function openerTextElem(page: VDTPage, structure: StructureFlow): () => StructElem {
  let elem: StructElem | undefined;
  return () => {
    if (elem) return elem;
    if (page.partInfo) return (elem = structure.partHeading());
    for (const col of page.columns) {
      for (const block of col.blocks) {
        if (block.hidden && block.type === 'heading' && (block.lines[0]?.bbox.height ?? 0) > 0) return (elem = structure.blockElem(block));
      }
    }
    return (elem = structure.tree.root.child('P'));
  };
}
