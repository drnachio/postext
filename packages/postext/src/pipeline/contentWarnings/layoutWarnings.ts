// The page each content warning landed on, and the warnings read from the
// laid-out document: loose CJK lines, ragged and divided words, cut design
// texts, shrunk floats, small pictures, empty captions, drop caps (#1276: split out of contentWarnings.ts).
import { computeChapterTitles } from '../pages/placeholders.js';
import type { Resource } from '../../types.js';
import type { VDTDocument, ContentWarning, VDTDesignSlot } from '../../vdt.js';
import { composedFrameBlockIds } from '../../composed/paint.js';
import { bitmapResolutionFor, bitmapLayoutSize } from '../../bitmapResolution.js';

/**
 * The page each content warning's construct was placed on: the first placed
 * block of the resource a resource-level warning names, else the first
 * block whose source range holds the warning's start. Warnings whose
 * construct put nothing on a page keep no `pageIndex`.
 */
export function locateContentWarnings(doc: VDTDocument, warnings: readonly ContentWarning[]): ContentWarning[] {
  if (warnings.length === 0) return [];
  const placed = [...doc.blocks];
  for (const page of doc.pages) if (page.floats) placed.push(...page.floats);
  const pageOfResource = new Map<string, number>();
  for (const b of placed) {
    const id = b.resourceBlock?.resource.id;
    if (id !== undefined && b.pageIndex >= 0) {
      const prev = pageOfResource.get(id);
      if (prev === undefined || b.pageIndex < prev) pageOfResource.set(id, b.pageIndex);
    }
  }
  /** The page of the first block holding `offset`, else — a container's
   *  fence line places nothing itself — of the first block after it. */
  const pageAt = (offset: number): number | undefined => {
    let holder: number | undefined;
    let next: { start: number; page: number } | undefined;
    for (const b of placed) {
      if (b.pageIndex < 0 || b.sourceStart === undefined || b.sourceEnd === undefined) continue;
      if (offset >= b.sourceStart && offset <= b.sourceEnd) {
        if (holder === undefined || b.pageIndex < holder) holder = b.pageIndex;
      } else if (b.sourceStart > offset && (!next || b.sourceStart < next.start || (b.sourceStart === next.start && b.pageIndex < next.page))) {
        next = { start: b.sourceStart, page: b.pageIndex };
      }
    }
    // A comic page holds no block: its whole source range is its page.
    for (const page of doc.pages) {
      const c = page.comic;
      if (!c) continue;
      if (offset >= c.sourceStart && offset <= c.sourceEnd) {
        if (holder === undefined || page.index < holder) holder = page.index;
      } else if (c.sourceStart > offset && (!next || c.sourceStart < next.start)) {
        next = { start: c.sourceStart, page: page.index };
      }
    }
    return holder ?? next?.page;
  };
  return warnings.map((w) => {
    const owner = w.kind === 'unknownTableStyle' || w.kind === 'raggedTableGrid'
      ? w.resourceId
      : 'inResource' in w ? w.inResource : undefined;
    const page = (owner !== undefined ? pageOfResource.get(owner) : undefined)
      ?? (w.kind === 'unknownResourceId' && w.usage === 'embed' ? undefined : w.sourceStart !== undefined ? pageAt(w.sourceStart) : undefined);
    return page !== undefined ? { ...w, pageIndex: page } : w;
  });
}

/** A `cjkLooseLine` warning for each justified CJK line set short with the
 *  capped tracking (`VDTLine.cjkLoose`), on the page it was placed on. */
export function cjkLooseLineWarnings(doc: VDTDocument): ContentWarning[] {
  const out: ContentWarning[] = [];
  for (const block of doc.blocks) {
    for (const line of block.lines) {
      if (!line.cjkLoose) continue;
      out.push({
        kind: 'cjkLooseLine',
        text: line.text,
        ...(line.sourceStart !== undefined ? { sourceStart: line.sourceStart } : {}),
        ...(line.sourceEnd !== undefined ? { sourceEnd: line.sourceEnd } : {}),
        ...(block.pageIndex >= 0 ? { pageIndex: block.pageIndex } : {}),
      });
    }
  }
  return out;
}

/** A `raggedLine` warning for each line of a justified paragraph set
 *  ragged because its word spaces would have stretched past 3×
 *  (`VDTLine.raggedSpaceRatio`, #732), on the page it was placed on: the
 *  running text, the paragraphs of a box and the notes at a column foot
 *  (all of them blocks of the document). */
export function raggedLineWarnings(doc: VDTDocument): ContentWarning[] {
  const out: ContentWarning[] = [];
  for (const block of doc.blocks) {
    for (const line of block.lines) {
      if (line.raggedSpaceRatio === undefined) continue;
      out.push({
        kind: 'raggedLine',
        text: line.text,
        ratio: line.raggedSpaceRatio,
        ...(line.sourceStart !== undefined ? { sourceStart: line.sourceStart } : {}),
        ...(line.sourceEnd !== undefined ? { sourceEnd: line.sourceEnd } : {}),
        ...(block.pageIndex >= 0 ? { pageIndex: block.pageIndex } : {}),
      });
    }
  }
  return out;
}

/** The warning of a word cut to fit its line (#1150), by how it was cut. */
function dividedKind(cut: 'syllable' | 'character' | undefined): 'wordDividedByCharacter' | 'wordDividedBySyllable' | undefined {
  return cut === 'character' ? 'wordDividedByCharacter' : cut === 'syllable' ? 'wordDividedBySyllable' : undefined;
}

/** A `wordDividedByCharacter` warning (a `wordDividedBySyllable` note) for
 *  each line ending in a piece of a word wider than its whole measure that
 *  the breaker cut to fit (`VDTLine.wordDivided`, #1150), in the flow, a
 *  composed page's frames and design texts alike. And an
 *  `unbreakableWordOverflow` warning for each line holding a word of a
 *  joining script wider than the line (`VDTLine.wordOverflow`), on the page
 *  it was placed on; and once per text for a design text line that does
 *  (`VDTDesignTextLine.wordOverflow`: a running head repeats it on every
 *  page), on the first page that shows it. */
export function wordOverflowWarnings(doc: VDTDocument): ContentWarning[] {
  const out: ContentWarning[] = [];
  const seen = new Set<string>();
  const slot = (s: VDTDesignSlot | undefined, pageIndex: number): void => {
    for (const b of s?.blocks ?? []) {
      if (b.kind !== 'text') continue;
      for (const line of b.lines) {
        const kind = line.wordOverflow ? 'unbreakableWordOverflow' : dividedKind(line.wordDivided);
        if (!kind || seen.has(`${kind}\u0000${line.text}`)) continue;
        seen.add(`${kind}\u0000${line.text}`);
        out.push({
          kind,
          text: line.text,
          ...(b.sourceStart !== undefined ? { sourceStart: b.sourceStart } : {}),
          ...(b.sourceEnd !== undefined ? { sourceEnd: b.sourceEnd } : {}),
          pageIndex,
        });
      }
    }
  };
  doc.pages.forEach((page, i) => {
    slot(page.header, i);
    slot(page.openerBand, i);
    for (const col of page.columns) for (const block of col.blocks) slot(block.designOverlay, i);
    for (const block of page.floats ?? []) slot(block.designOverlay, i);
    slot(page.footer, i);
  });
  for (const block of doc.blocks) {
    for (const line of block.lines) {
      const kind = line.wordOverflow ? 'unbreakableWordOverflow' : dividedKind(line.wordDivided);
      if (!kind) continue;
      out.push({
        kind,
        text: line.text,
        ...(line.sourceStart !== undefined ? { sourceStart: line.sourceStart } : {}),
        ...(line.sourceEnd !== undefined ? { sourceEnd: line.sourceEnd } : {}),
        ...(block.pageIndex >= 0 ? { pageIndex: block.pageIndex } : {}),
      });
    }
  }
  return out;
}

/** A `designTextTruncated` warning for each design text cut to fit its
 *  width (`VDTDesignTextBlock.truncated`, #628): one per element and page
 *  for a heading design, a part page or a contents part row; one per
 *  element and chapter for a running head or folio, which repeats the cut
 *  on every page (a chapter title, a folio's page number), on the first
 *  page that shows it. */
export function designTruncationWarnings(doc: VDTDocument): ContentWarning[] {
  const out: ContentWarning[] = [];
  const seen = new Set<string>();
  let chapters: string[] | undefined;
  const slot = (s: VDTDesignSlot | undefined, pageIndex: number): void => {
    for (const b of s?.blocks ?? []) {
      if (b.kind !== 'text' || !b.truncated) continue;
      const t = b.truncated;
      let key: string;
      if (t.slot === 'header' || t.slot === 'footer') {
        chapters ??= computeChapterTitles(doc.blocks, doc.pages.length, doc.pages);
        key = `${t.slot}\u0000${t.elementId}\u0000${chapters[pageIndex] ?? ''}`;
      } else {
        key = `${pageIndex}\u0000${t.slot}\u0000${t.elementId}\u0000${b.sourceStart ?? ''}`;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        kind: 'designTextTruncated',
        slot: t.slot,
        elementId: t.elementId,
        text: t.text,
        mode: t.mode,
        ...(b.sourceStart !== undefined ? { sourceStart: b.sourceStart } : {}),
        ...(b.sourceEnd !== undefined ? { sourceEnd: b.sourceEnd } : {}),
        pageIndex,
      });
    }
  };
  doc.pages.forEach((page, i) => {
    slot(page.header, i);
    slot(page.openerBand, i);
    for (const col of page.columns) for (const block of col.blocks) slot(block.designOverlay, i);
    for (const block of page.floats ?? []) slot(block.designOverlay, i);
    slot(page.footer, i);
  });
  return out;
}

/** A `joiningScriptLetterSpacing` warning for the first placed part of
 *  each block (by content index, `blocks`) whose style tracks words of a
 *  joining script, which are set untracked. */
export function joiningLetterSpacingWarnings(doc: VDTDocument, blocks: ReadonlySet<number>): ContentWarning[] {
  const out: ContentWarning[] = [];
  const seen = new Set<number>();
  for (const block of doc.blocks) {
    const idx = block.contentIndex;
    if (idx === undefined || !blocks.has(idx) || seen.has(idx)) continue;
    seen.add(idx);
    out.push({
      kind: 'joiningScriptLetterSpacing',
      text: block.lines[0]?.text ?? '',
      ...(block.sourceStart !== undefined ? { sourceStart: block.sourceStart } : {}),
      ...(block.sourceEnd !== undefined ? { sourceEnd: block.sourceEnd } : {}),
      ...(block.pageIndex >= 0 ? { pageIndex: block.pageIndex } : {}),
    });
  }
  return out;
}

/** A `floatShrunk` warning for each floated picture the layout set smaller
 *  to fit the room of its slot (`placement.shrink`, #626), with how far it
 *  still runs past the text block's foot when even its smallest scale did
 *  not fit. `sourceRangeOf` gives the range of the content block that first
 *  cites it. */
export function floatShrinkWarnings(
  doc: VDTDocument,
  sourceRangeOf?: (contentIndex: number) => { start: number; end: number } | undefined,
): ContentWarning[] {
  const out: ContentWarning[] = [];
  for (const page of doc.pages) {
    for (const block of page.floats ?? []) {
      const rb = block.resourceBlock;
      if (!rb || rb.shrinkScale === undefined) continue;
      const foot = page.contentArea.y + page.contentArea.height;
      const overflowPx = Math.round(block.bbox.y + block.bbox.height - foot);
      const range = block.contentIndex !== undefined ? sourceRangeOf?.(block.contentIndex) : undefined;
      out.push({
        kind: 'floatShrunk',
        resourceId: rb.resource.id,
        scale: Math.round(rb.shrinkScale * 1000) / 1000,
        ...(overflowPx > 0 ? { overflowPx } : {}),
        ...(range ? { sourceStart: range.start, sourceEnd: range.end } : {}),
        pageIndex: page.index,
      });
    }
  }
  return out;
}

/** Under this share of its print size a picture is reported. */
const PRINT_SIZE_SCALE = 0.5;
/** …when the text block is at least this much wider than its column. */
const WIDER_PAGE = 1.25;

/** A `pictureBelowPrintSize` warning (#901) for each bitmap with a print
 *  size that its column holds at under half of it, on a page whose text
 *  block is wider than the column: a picture meant to fill a page, set in
 *  one of its two default columns. A print size is the resource's own
 *  `bitmap.resolution` or a number in `layout.bitmapResolution` (a
 *  resolution read from the file under `'file'` is no statement of the
 *  author's). A picture narrowed on purpose (`placement.width`), shrunk to
 *  its slot (`floatShrunk`), turned, or set in a composed page's frame is
 *  left alone. `resources` are the document's, as given (before the
 *  layout stamps its policy on them). Once per picture, where it is first
 *  placed; `sourceRangeOf` gives the range of the content block citing it. */
export function pictureBelowPrintSizeWarnings(
  doc: VDTDocument,
  resources: readonly Resource[] | undefined,
  sourceRangeOf?: (contentIndex: number) => { start: number; end: number } | undefined,
): ContentWarning[] {
  if (!resources || resources.length === 0) return [];
  const own = new Map(resources.map((r) => [r.id, r]));
  const policy = doc.config.layout.bitmapResolution;
  const dpi = doc.config.page.dpi;
  const out: ContentWarning[] = [];
  const seen = new Set<string>();
  for (const page of doc.pages) {
    const inFrames = page.composed ? composedFrameBlockIds(page) : undefined;
    const blocks = [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? []).filter((b) => !inFrames?.has(b.id))];
    for (const block of blocks) {
      const rb = block.resourceBlock;
      if (!rb || rb.kind !== 'bitmap' || rb.rotation || rb.shrinkScale !== undefined || block.comic) continue;
      const id = rb.resource.id;
      if (seen.has(id)) continue;
      const resource = own.get(id) ?? rb.resource;
      const bitmap = resource.bitmap;
      if (!bitmap) continue;
      const ppi = bitmapResolutionFor({ resolution: bitmap.resolution }, typeof policy === 'number' ? policy : 'document');
      if (ppi === undefined) continue;
      const frac = resource.placement?.width;
      if (typeof frac === 'number' && frac > 0 && frac < 1) continue;
      const printWidthPx = bitmapLayoutSize({ ...bitmap, resolution: ppi }, dpi).width;
      const widthPx = rb.bodyRect.width;
      if (!(printWidthPx > 0) || widthPx / printWidthPx >= PRINT_SIZE_SCALE) continue;
      // The column caps it (no other fit set it smaller), and spanning the
      // page would give it more room.
      const slotPx = block.bbox.width;
      if (widthPx < slotPx - 1) continue;
      const pageWidthPx = page.contentArea.width;
      if (pageWidthPx < slotPx * WIDER_PAGE) continue;
      seen.add(id);
      const range = block.contentIndex !== undefined ? sourceRangeOf?.(block.contentIndex) : undefined;
      out.push({
        kind: 'pictureBelowPrintSize',
        resourceId: id,
        scale: Math.round((widthPx / printWidthPx) * 1000) / 1000,
        printWidthPx: Math.round(printWidthPx),
        widthPx: Math.round(widthPx),
        pageWidthPx: Math.round(pageWidthPx),
        ...(range ? { sourceStart: range.start, sourceEnd: range.end } : {}),
        pageIndex: page.index,
      });
    }
  }
  return out;
}

/** An `emptyCaption` warning (#1151) for each resource whose type gives a
 *  caption prefix and whose own caption is empty: its caption line prints
 *  the label and number alone. Once per resource, where it is first
 *  placed (a page's columns, then its floats); `sourceRangeOf` gives the
 *  range of the content block citing or embedding it. */
export function emptyCaptionWarnings(
  doc: VDTDocument,
  sourceRangeOf?: (contentIndex: number) => { start: number; end: number } | undefined,
): ContentWarning[] {
  const out: ContentWarning[] = [];
  const seen = new Set<string>();
  for (const page of doc.pages) {
    for (const block of [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? [])]) {
      const rb = block.resourceBlock;
      if (!rb || block.hidden || block.comic || seen.has(rb.resource.id)) continue;
      if (rb.captionPrefix.trim().length === 0 || (rb.resource.caption ?? '').trim().length > 0) continue;
      if (rb.captionLines.length === 0) continue;
      seen.add(rb.resource.id);
      const range = block.contentIndex !== undefined ? sourceRangeOf?.(block.contentIndex) : undefined;
      out.push({
        kind: 'emptyCaption',
        resourceId: rb.resource.id,
        label: rb.captionLines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim(),
        ...(range ? { sourceStart: range.start, sourceEnd: range.end } : {}),
        pageIndex: page.index,
      });
    }
  }
  return out;
}

/** A `dropCap` warning for the first placed part of each paragraph (by
 *  content index) whose drop cap could not be set as configured (#623). */
export function dropCapWarnings(
  doc: VDTDocument,
  notes: ReadonlyMap<number, { reason: Extract<ContentWarning, { kind: 'dropCap' }>['reason']; handling?: 'reserve' | 'shrink' | 'skip'; lines?: number }>,
): ContentWarning[] {
  const out: ContentWarning[] = [];
  const seen = new Set<number>();
  /** Paragraphs set in more than one piece. */
  const pieces = new Map<number, number>();
  for (const block of doc.blocks) {
    if (block.type === 'paragraph' && block.contentIndex !== undefined) pieces.set(block.contentIndex, (pieces.get(block.contentIndex) ?? 0) + 1);
  }
  for (const block of doc.blocks) {
    const idx = block.contentIndex;
    if (idx === undefined || seen.has(idx) || block.type !== 'paragraph') continue;
    // A box or a frame chain that had to cut a paragraph before its drop
    // cap's sink line (#947) shows it on the piece holding the initial.
    const cutBeforeSink = block.dropCap !== undefined && block.lines.length < block.dropCap.sink && (pieces.get(idx) ?? 0) > 1;
    const note = notes.get(idx) ?? (cutBeforeSink ? { reason: 'split' as const } : undefined);
    if (!note) continue;
    seen.add(idx);
    const start = block.dropCap?.sourceStart ?? block.sourceStart;
    out.push({
      kind: 'dropCap',
      reason: note.reason,
      ...(note.handling ? { handling: note.handling } : {}),
      ...(note.lines !== undefined ? { lines: note.lines } : {}),
      text: (block.dropCap?.text ?? '') + (block.lines[0]?.text ?? ''),
      ...(start !== undefined ? { sourceStart: start } : {}),
      ...(block.sourceEnd !== undefined ? { sourceEnd: block.sourceEnd } : {}),
      ...(block.pageIndex >= 0 ? { pageIndex: block.pageIndex } : {}),
    });
  }
  return out;
}
