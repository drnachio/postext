// Warnings on resources: their first uses, upscaled bitmaps and the
// picture resources a configuration names (#1276: split out of
// compute.ts).
import type { ContentBlock, Resource, PostextConfig, ResourceType, VDTDocument, SvgFontFaceReport } from 'postext';
import type { Warning } from '../types.js';
import { lineNumberForOffset } from './layout.js';

/** Bitmaps rendered wider than this multiple of their natural pixel width are
 *  flagged as upscaled (blurry). Mirrors issue #49 §8. */
const BITMAP_UPSCALE_THRESHOLD = 1.5;

/** The source range of every resource's first embed or inline `:ref`, in
 *  reading order: what a resource-level warning points at. */
function firstResourceUses(blocks: ContentBlock[], markdown: string): Map<string, { start: number; end: number }> {
  const uses = new Map<string, { start: number; end: number }>();
  for (const b of blocks) {
    if (b.type === 'resourceBlock' && b.resourceId !== undefined && !uses.has(b.resourceId)) {
      uses.set(b.resourceId, { start: b.sourceStart, end: b.sourceEnd });
    }
    let plain = 0;
    for (const span of b.spans) {
      const id = span.ref?.resourceId;
      if (id !== undefined && !uses.has(id)) {
        const start = b.sourceMap[plain] ?? b.sourceStart;
        const close = markdown.indexOf('}', start);
        uses.set(id, { start, end: close >= 0 && close < b.sourceEnd ? close + 1 : b.sourceEnd });
      }
      plain += span.text.length;
    }
  }
  return uses;
}

/** The payload a bitmap / SVG resource paints from. */
function imageFileId(r: Resource): string | undefined {
  if (r.kind === 'bitmap') return r.bitmap?.fileId;
  if (r.kind === 'svg') return r.svg?.fileId;
  if (r.kind === 'video') return r.video?.poster?.fileId;
  return undefined;
}

/**
 * The resource ids of the pictures the configuration itself draws: every
 * design element of `kind: 'image'` — in the header and footer, a heading
 * level's or heading style's design, a part's design or verso design, the
 * contents' part rows —, every callout icon of `kind: 'resource'` and every
 * callout label-tab icon. Walked generically, like the font collector, so a
 * new design slot is covered without a change here. A subtree switched off
 * (`enabled: false`) draws nothing and is skipped. An image id with
 * `{attr.<key>}` placeholders stands for every id the `blocks`' attributes
 * fill it with.
 */
export function configImageResourceIds(config: PostextConfig, blocks: readonly ContentBlock[] = []): Set<string> {
  const ids = new Set<string>();
  // A templated id (`'{attr.art}'`, `'map-{attr.n}'`) names the pictures
  // the document's headings and parts give it: one id per attribute value.
  const ATTR = /\{attr\.([A-Za-z_][A-Za-z0-9_-]*)\}/g;
  const addTemplated = (template: string): void => {
    const keys = [...template.matchAll(ATTR)].map((m) => m[1]!);
    for (const b of blocks) {
      const attrs = b.attrs;
      if (!attrs || !keys.some((k) => attrs[k] !== undefined)) continue;
      const id = template.replace(ATTR, (_, k: string) => attrs[k] ?? '').trim();
      if (id && !id.includes('{')) ids.add(id);
    }
  };
  const visit = (node: unknown, key: string, parentKey: string): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, key, parentKey);
      return;
    }
    const rec = node as Record<string, unknown>;
    if (rec.enabled === false) return;
    const id = rec.resourceId;
    if (typeof id === 'string' && id.length > 0) {
      // A design image element, a callout icon set to a resource, or a
      // label tab's icon (which has no kind).
      if (rec.kind === 'image' && id.includes('{')) addTemplated(id);
      else if (rec.kind === 'image' || rec.kind === 'resource' || (rec.kind === undefined && key === 'icon' && parentKey === 'label')) {
        ids.add(id);
      }
    }
    for (const [k, value] of Object.entries(rec)) {
      if (value && typeof value === 'object') visit(value, k, key);
    }
  };
  visit(config, '', '');
  return ids;
}

/**
 * Resource integrity warnings (issue #49 §8):
 *   - duplicateResourceId: two or more resources sharing the same id.
 *   - danglingTypeRef: a resource whose `typeId` is not a known `ResourceType`.
 *   - bitmapTooSmall: a bitmap rendered larger than 1.5× its natural width.
 *   - missingImage: an image the document uses (embedded, referenced, in a
 *     used table's cells, or drawn by the configuration: see
 *     {@link configImageResourceIds}) whose payload the previews could not
 *     read (`unavailableImages`), so it paints as a placeholder.
 * Unknown ids, table style ids and ragged grids are the engine's (see
 * {@link collectEngineContentWarnings}).
 */
export function collectResourceWarnings(
  blocks: ContentBlock[],
  markdown: string,
  resources: Resource[],
  resourceTypes: ResourceType[],
  doc: VDTDocument | null,
  /** Resource ids the configuration itself draws (see
   *  {@link configImageResourceIds}), which count as used even though the
   *  document never references them. */
  configUsedIds: ReadonlySet<string> = new Set(),
  /** File ids whose payload could not be read or decoded. */
  unavailableImages: ReadonlySet<string> = new Set(),
  /** SVG pictures whose fonts could not all be inlined, by file id (#630). */
  svgFontIssues: ReadonlyMap<string, readonly SvgFontFaceReport[]> = new Map(),
): Warning[] {
  const out: Warning[] = [];
  let idx = 0;

  // Map of id -> count to detect duplicates and existence.
  const idCounts = new Map<string, number>();
  for (const r of resources) {
    idCounts.set(r.id, (idCounts.get(r.id) ?? 0) + 1);
  }
  const knownTypeIds = new Set(resourceTypes.map((t) => t.id));

  // 1. Images the document uses with no readable payload, and SVG
  //    pictures it uses whose fonts could not all be inlined (#630).
  if (unavailableImages.size > 0 || svgFontIssues.size > 0) {
    const uses = firstResourceUses(blocks, markdown);
    const byId = new Map(resources.map((r) => [r.id, r]));
    // Cell images count where their table is used.
    const cellUses = new Map<string, { start: number; end: number }>();
    for (const [id, at] of uses) {
      for (const row of byId.get(id)?.table?.model.rows ?? []) {
        for (const cell of row) {
          const image = cell.image?.resourceId;
          if (image !== undefined && !uses.has(image) && !cellUses.has(image)) cellUses.set(image, at);
        }
      }
    }
    const reportedFonts = new Set<string>();
    for (const r of resources) {
      const fileId = imageFileId(r);
      const issues = fileId !== undefined ? svgFontIssues.get(fileId) : undefined;
      if (!issues || fileId === undefined || unavailableImages.has(fileId) || reportedFonts.has(r.id)) continue;
      const at = uses.get(r.id) ?? cellUses.get(r.id);
      if (!at && !configUsedIds.has(r.id)) continue;
      reportedFonts.add(r.id);
      const where = at ? { sourceStart: at.start, sourceEnd: at.end, line: lineNumberForOffset(markdown, at.start) } : {};
      const tooLarge = issues.filter((f) => f.status === 'tooLarge');
      if (tooLarge.length > 0) {
        out.push({
          id: `resource-svg-fonts-too-large-${r.id}`,
          payload: { kind: 'svgFontsTooLarge', resourceId: r.id, fileId, bytes: tooLarge.reduce((sum, f) => sum + (f.bytes ?? 0), 0) },
          ...where,
        });
      }
      for (const f of issues) {
        if (f.status !== 'unavailable') continue;
        out.push({
          id: `resource-svg-font-${r.id}-${f.family}-${f.weight}-${f.style}`,
          payload: { kind: 'svgFontUnavailable', resourceId: r.id, fileId, family: f.family, weight: f.weight, style: f.style },
          ...where,
        });
      }
    }
    const reported = new Set<string>();
    for (const r of resources) {
      const fileId = imageFileId(r);
      if (fileId === undefined || !unavailableImages.has(fileId) || reported.has(r.id)) continue;
      const at = uses.get(r.id) ?? cellUses.get(r.id);
      if (!at && !configUsedIds.has(r.id)) continue;
      reported.add(r.id);
      out.push({
        id: `resource-missing-image-${r.id}`,
        payload: { kind: 'missingImage', resourceId: r.id, fileId },
        ...(at ? { sourceStart: at.start, sourceEnd: at.end, line: lineNumberForOffset(markdown, at.start) } : {}),
      });
    }
  }

  // 2. Per-resource integrity: duplicates and dangling type refs. A resource
  //    nobody embeds or references is not a problem: resources are shared by
  //    every chapter and are often uploaded before the text that uses them.
  //    Duplicates are reported once per colliding id.
  const reportedDuplicate = new Set<string>();
  for (const r of resources) {
    const count = idCounts.get(r.id) ?? 1;
    if (count > 1 && !reportedDuplicate.has(r.id)) {
      reportedDuplicate.add(r.id);
      out.push({
        id: `resource-duplicate-${r.id}`,
        payload: { kind: 'duplicateResourceId', resourceId: r.id, count },
      });
    }
    if (!knownTypeIds.has(r.typeId)) {
      out.push({
        id: `resource-dangling-type-${idx++}-${r.id}`,
        payload: { kind: 'danglingTypeRef', resourceId: r.id, typeId: r.typeId },
      });
    }
  }

  // 3. bitmapTooSmall: compare rendered body width against the bitmap's
  //    natural pixel width from the measured VDT.
  if (doc) {
    const seen = new Set<string>();
    for (const block of doc.blocks) {
      const rb = block.resourceBlock;
      if (!rb || rb.kind !== 'bitmap') continue;
      // A picture cropped within its safe area shows only part of its
      // pixels across the body.
      const naturalWidth = rb.resource.bitmap?.width;
      if (!naturalWidth || naturalWidth <= 0) continue;
      const bitmapWidth = Math.round(naturalWidth * (rb.bodySource?.width ?? 1));
      const renderedWidth = rb.bodyRect.width;
      if (renderedWidth > bitmapWidth * BITMAP_UPSCALE_THRESHOLD) {
        const key = rb.resource.id;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          id: `resource-bitmap-small-${key}`,
          payload: {
            kind: 'bitmapTooSmall',
            resourceId: key,
            renderedWidth: Math.round(renderedWidth),
            bitmapWidth,
          },
        });
      }
    }
  }

  return out;
}
