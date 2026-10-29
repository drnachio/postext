// Built-in example resources for the default Sandbox document. These are seeded
// on first entry (when the resource store is empty) and restored on document
// reset, so the default markdown's `::resource` embeds and `:ref` references
// resolve out-of-the-box and the resources system is functional immediately.
//
// SVG blobs are stored under deterministic fileIds via `putBlobAt`, so
// re-seeding overwrites the same record instead of orphaning the previous blob.
//
// The set deliberately spans the placement matrix (column/page span × auto/top/
// bottom position) and is spread across every major section of the document, so the
// float engine is exercised thoroughly and the default document reads as a fully
// illustrated publication. Every figure is a distinct illustration — no diagram
// is reused at two different spans.
//
// Every word a figure, table, caption or alternative text prints is given
// once per edition of the guide (English, Spanish, Simplified Chinese,
// Catalan, Arabic, Japanese, Brazilian Portuguese, French, German and Italian; see `lang.ts`). The Arabic edition's figures read from
// the right: those whose layout follows the reading order are drawn as
// their mirror image, their labels set right to left (see `drawn`).

import type { ResourcePlacement, Resource } from 'postext';
import { invalidateResourceImage } from '../controls/media/resourceImages.js';
import { putBlobAt } from '../storage/blobStore.js';
import { type GuideLang, GUIDE_LANGS, guideLang } from './lang.js';
import { guideVideosSignature, guideVideoPosters, guideVideoResources } from './videos.js';
import { guideStripArt, guideStripResources, guideStripSignature } from './strip.js';
import { SVG_FIGURES, figureSize } from './figures.js';
import { FIGURE_SPECS } from './figureSpecs.js';
import { TABLE_SPECS } from './tableSpecs.js';

export { DEFAULT_RESOURCE_IDS } from './ids.js';
export { figureSize, SVG_FIGURES } from './figures.js';
export type { GuideFigure } from './figures.js';

export { GUIDE_LANGS, guideLang, type GuideLang } from './lang.js';
export { GUIDE_VIDEO_IDS, guideHasVideos, guideVideoPosters } from './videos.js';
export { GUIDE_STRIP_IDS, guideStripArt } from './strip.js';

/** A figure's or table's placement in an edition. The Chinese and Japanese
 *  editions are vertical: a figure or table stands upright in its tier and
 *  the breadth it takes on the sheet is the room it uses in the flow, so one
 *  set across both tiers would hold a whole page for the strip it fills.
 *  There each takes one tier, the other going on with the text. */
function figurePlacement(placement: ResourcePlacement, lang: GuideLang): ResourcePlacement {
  return (lang === 'zh-Hans' || lang === 'ja') && placement.span === 'page' ? { ...placement, span: 'column' } : placement;
}

/** The blob id a figure's SVG is stored under in one language. Each
 *  language keeps its own copy: the Spanish and the English guide can be
 *  open (and edited, as drafts) side by side without one's figures
 *  overwriting the other's. The bare ids of earlier versions are no longer
 *  written, so a book saved with them keeps the figures it had. */
export function figureBlobId(fileId: string, lang: GuideLang): string {
  // Lower-cased: `-zh-hans`, `-pt-br`.
  return `${fileId}-${lang.toLowerCase()}`;
}

/** A pure description of every example resource in every language — the
 *  SVG markup, captions, alt texts, placements and table models — for the
 *  built-in preset's fingerprint (no blob is written). */
export function defaultResourcesSignature(): string {
  // `blob-ids-by-locale`: each language's figures moved to ids of their own.
  const parts: unknown[] = ['blob-ids-by-locale', guideVideosSignature(), guideStripSignature()];
  for (const lang of GUIDE_LANGS) {
    for (const [fileId, fig] of Object.entries(SVG_FIGURES)) parts.push(fileId, fig.generate(lang));
    for (const f of FIGURE_SPECS) parts.push(f.id, f.fileId, figurePlacement(f.placement, lang), f.caption[lang], f.altText[lang]);
    for (const t of TABLE_SPECS) parts.push(t.id, figurePlacement(t.placement, lang), t.caption[lang], t.model(lang));
  }
  return JSON.stringify(parts);
}

/** Build (and persist the blobs for) the default example resources for the
 *  given document `locale` (defaults to English). Captions, table content, and
 *  diagram labels follow the locale so they match the seeded markdown — a
 *  Spanish document gets Spanish tables and figures, a Japanese one Japanese
 *  ones. Safe to call repeatedly — blob writes are idempotent on their
 *  deterministic ids. */
export async function buildDefaultResources(locale = 'en'): Promise<Resource[]> {
  const now = Date.now();
  const lang = guideLang(locale);

  // Persist every figure's SVG blob; tolerate IndexedDB being unavailable.
  // Without storage the SVGs won't render, but tables still work and the
  // warnings panel flags the unresolved blobs.
  await Promise.all(
    Object.entries(SVG_FIGURES).map(async ([fileId, fig]) => {
      try {
        const bytes = new TextEncoder().encode(fig.generate(lang)).buffer;
        const blobId = figureBlobId(fileId, lang);
        await putBlobAt(blobId, bytes, 'image/svg+xml');
        // The blob may replace an earlier seed under the same fileId (a new
        // version of the guide) — drop any cached decode so viewers
        // re-register it.
        invalidateResourceImage(blobId);
      } catch {
        // ignore — see note above
      }
    }),
  );

  const figures: Resource[] = FIGURE_SPECS.map((spec) => {
    const fig = SVG_FIGURES[spec.fileId];
    return {
      id: spec.id,
      typeId: 'figure',
      kind: 'svg',
      svg: { fileId: figureBlobId(spec.fileId, lang), ...figureSize(fig, lang) },
      placement: figurePlacement(spec.placement, lang),
      caption: spec.caption[lang],
      altText: spec.altText[lang],
      createdAt: now,
      updatedAt: now,
    };
  });

  // The videos (#478), in the editions they were cut in: their posters
  // stored like the figures.
  const posters = await guideVideoPosters(lang).catch(() => ({} as Record<string, Uint8Array>));
  await Promise.all(
    Object.entries(posters).map(async ([blobId, bytes]) => {
      try {
        await putBlobAt(blobId, bytes.buffer as ArrayBuffer, 'image/jpeg');
        invalidateResourceImage(blobId);
      } catch {
        // as for the figures
      }
    }),
  );
  // The comic strip's panels (#1296): one copy of the pictures for every
  // edition, stored like the posters.
  const strip = await guideStripArt().catch(() => ({} as Record<string, Uint8Array>));
  await Promise.all(
    Object.entries(strip).map(async ([blobId, bytes]) => {
      try {
        await putBlobAt(blobId, bytes.buffer as ArrayBuffer, 'image/jpeg');
        invalidateResourceImage(blobId);
      } catch {
        // as for the figures
      }
    }),
  );
  const videos: Resource[] = guideVideoResources(lang, now).map((r) => ({ ...r, placement: figurePlacement(r.placement!, lang) }));

  const tables: Resource[] = TABLE_SPECS.map((spec) => ({
    id: spec.id,
    typeId: 'table',
    kind: 'table',
    table: { model: spec.model(lang) },
    placement: figurePlacement(spec.placement, lang),
    caption: spec.caption[lang],
    createdAt: now,
    updatedAt: now,
  }));

  return [...figures, ...videos, ...tables, ...guideStripResources(lang, now)];
}
