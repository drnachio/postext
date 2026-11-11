// `floatPinMissed` (#1494): the floats set by hand (`placement.pin`) that are
// not where their pin asks, read off the finished layout, so a pin is
// reported whatever path of the pass set the float (its page's slots, the
// usual ones, a chapter's end).
import type { ContentWarning, VDTBlock, VDTColumn, VDTDocument, VDTPage } from '../../vdt.js';
import type { Resource } from '../../types.js';
import { MAX_PIN_PAGE_OFFSET } from '../../defaults/layout.js';
import { cleanPin } from '../floats/floatPlacement.js';

type Reason = 'notTaken' | 'tooFar' | 'column' | 'unsupported';

/** The text columns a pin counts on `page`, in reading order. */
const pinColumnsOf = (page: VDTPage): VDTColumn[] => page.columns.filter((c) => c.kind !== 'span' && c.kind !== 'side');

/** The page whose text first cites resource `id`: a line with a `:ref`
 *  to it, else the first line set after its `::resource` line
 *  (`directiveIdx`, the content index the float carries). */
function citingPageOf(doc: VDTDocument, id: string, directiveIdx: number | undefined): number | undefined {
  const blocks = (page: VDTPage): VDTBlock[] => page.columns.flatMap((c) => c.blocks);
  for (const page of doc.pages) {
    if (blocks(page).some((b) => b.lines.some((l) => l.segments?.some((s) => s.refResourceId === id)))) return page.index;
  }
  if (directiveIdx === undefined) return undefined;
  for (const page of doc.pages) {
    if (blocks(page).some((b) => b.contentIndex !== undefined && b.contentIndex > directiveIdx && b.lines.length > 0)) return page.index;
  }
  return undefined;
}

/** Where a float's first slice landed: its page, its text column (counted
 *  as a pin counts them; `undefined` across the page), and its slot. */
function landingOf(page: VDTPage, block: VDTBlock): { column?: number; slot: 'top' | 'bottom' } {
  const cols = pinColumnsOf(page);
  const at = cols.findIndex((c) => c.index === block.columnIndex);
  const col = cols[at] ?? cols[0];
  const mid = block.bbox.y + block.bbox.height / 2;
  const slot = col && mid > col.bbox.y + col.bbox.height / 2 ? 'bottom' : 'top';
  return { ...(at >= 0 && page.columns[block.columnIndex]?.kind !== 'span' ? { column: at } : {}), slot };
}

/**
 * A `floatPinMissed` warning for each resource with a pin that is not where
 * the pin asks. `pinned`: the resources the float plan kept a pin for (an
 * upright float of a column or of the page, its pin readable and within
 * {@link MAX_PIN_PAGE_OFFSET} pages); any other pin is ignored, and
 * reported as `'tooFar'` or `'unsupported'`. A resource on no page, or whose
 * citation is on no page, is reported elsewhere (`unplaced`) or not at all
 * (cited in another chapter).
 */
export function floatPinWarnings(
  doc: VDTDocument,
  resources: readonly Resource[],
  pinned: ReadonlySet<string>,
  sourceRangeOf?: (contentIndex: number) => { start: number; end: number } | undefined,
): ContentWarning[] {
  const out: ContentWarning[] = [];
  const withPin = resources.filter((r) => r.placement?.pin);
  if (withPin.length === 0) return out;
  const floats = new Map<string, { page: VDTPage; block: VDTBlock }>();
  const inline = new Map<string, { page: VDTPage; block: VDTBlock }>();
  for (const page of doc.pages) {
    for (const block of page.floats ?? []) {
      const id = block.resourceBlock?.resource.id;
      if (id !== undefined && !floats.has(id)) floats.set(id, { page, block });
    }
    for (const col of page.columns) {
      for (const block of col.blocks) {
        const id = block.resourceBlock?.resource.id;
        if (id !== undefined && !inline.has(id)) inline.set(id, { page, block });
      }
    }
  }
  for (const r of withPin) {
    const at = floats.get(r.id) ?? inline.get(r.id);
    if (!at) continue;
    const range = at.block.contentIndex !== undefined ? sourceRangeOf?.(at.block.contentIndex) : undefined;
    const push = (reason: Reason, requestedPage?: number): void => {
      out.push({
        kind: 'floatPinMissed', resourceId: r.id, reason,
        ...(requestedPage !== undefined ? { requestedPage } : {}),
        ...(range ? { sourceStart: range.start, sourceEnd: range.end } : {}),
        pageIndex: at.page.index,
      });
    };
    const raw = r.placement!.pin!;
    const pin = cleanPin(raw);
    if (!pin) {
      push(Number.isInteger(raw.page) && raw.page > MAX_PIN_PAGE_OFFSET ? 'tooFar' : 'unsupported');
      continue;
    }
    if (!pinned.has(r.id) || !floats.has(r.id)) { push('unsupported'); continue; }
    const cite = citingPageOf(doc, r.id, at.block.contentIndex);
    if (cite === undefined) continue;
    const requested = cite + pin.page;
    const landed = landingOf(at.page, at.block);
    const pageSpan = landed.column === undefined;
    const target = doc.pages[requested];
    const noSuchColumn = !pageSpan && pin.column !== undefined && !!target && pin.column >= pinColumnsOf(target).length;
    const kept = at.page.index === requested && landed.slot === pin.slot
      && (pageSpan || pin.column === undefined || noSuchColumn || landed.column === pin.column);
    if (kept && !noSuchColumn) continue;
    push(kept && noSuchColumn ? 'column' : 'notTaken', requested);
  }
  return out;
}
