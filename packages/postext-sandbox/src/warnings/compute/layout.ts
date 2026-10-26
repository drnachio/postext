// Warnings read off the laid-out document: missing fonts, loose lines and
// what the layout reports of each block (#1276: split out of compute.ts).
import { type PostextConfig, type VDTDocument, type ResolvedDebugConfig, findLooseLines } from 'postext';
import { getConfigFontSpecs, getConfigFontFamilies } from '../../controls/fonts/fontLoader.js';
import type { Warning, WarningPayload } from '../types.js';

export function lineNumberForOffset(markdown: string, offset: number): number {
  if (offset <= 0) return 1;
  let line = 1;
  const n = Math.min(offset, markdown.length);
  for (let i = 0; i < n; i++) {
    if (markdown.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Detect fonts referenced by the resolved config that the browser has not
 * successfully registered with `document.fonts.check`. Returns unique family
 * names. Safe to call server-side — returns [] when `document.fonts` is
 * unavailable.
 */
export function detectMissingFonts(config: PostextConfig): string[] {
  if (typeof document === 'undefined' || !document.fonts) return [];
  const specs = getConfigFontSpecs(config);
  const missingSpecs = specs.filter((s) => !document.fonts.check(s));
  if (missingSpecs.length === 0) return [];
  const families = getConfigFontFamilies(config);
  const missing = families.filter((family) =>
    missingSpecs.some((spec) => spec.includes(`"${family}"`)),
  );
  return [...new Set(missing)];
}

export function collectLooseLineWarnings(
  doc: VDTDocument,
  debug: ResolvedDebugConfig,
  markdown: string,
): Warning[] {
  const threshold = debug.looseLineHighlight.threshold;
  const out: Warning[] = [];
  let idx = 0;
  for (const { block, line, ratio } of findLooseLines(doc, { threshold })) {
    // A CJK line set short at its tracking cap has a warning of its own
    // (`cjkLooseLine`, from the layout).
    if (line.cjkLoose) continue;
    const sourceStart = line.sourceStart ?? block.sourceStart;
    const sourceEnd = line.sourceEnd ?? block.sourceEnd;
    out.push({
      id: `loose-${idx++}-${sourceStart ?? 'x'}`,
      payload: { kind: 'looseLine', ratio, threshold },
      sourceStart,
      sourceEnd,
      line: sourceStart !== undefined ? lineNumberForOffset(markdown, sourceStart) : undefined,
    });
  }
  return out;
}

/** The kinds of `doc.contentWarnings` only the layout finds (the others
 *  are read from the source by {@link collectEngineContentWarnings}). */
const LAYOUT_CONTENT_KINDS: ReadonlySet<string> = new Set([
  'indexSeeUnknown', 'indexRangeUnclosed', 'indexReadingMissing', 'cjkLooseLine', 'raggedLine',
  'cjkMarksExceedLeading', 'rubyExceedsLeading', 'kuntenExceedsLeading', 'arabicMarksExceedLeading',
  'unbreakableWordOverflow', 'wordDividedByCharacter', 'wordDividedBySyllable', 'joiningScriptLetterSpacing',
  'comicPanelLetterbox', 'comicBalloonOverflow', 'lineNumberOverlap', 'dropCap', 'codeOverflow', 'textWrap',
  'columnsTooNarrow',
]);

/** Warnings the layout itself raised (`doc.warnings`): a box the engine
 *  had to place overflowing its column because no column could hold it.
 *  The content warnings the build lists in `doc.contentWarnings` (unknown
 *  ids, styles and directives) are read from the source by
 *  {@link collectEngineContentWarnings} — before the layout exists, too. */
export function collectLayoutWarnings(doc: VDTDocument, markdown: string): Warning[] {
  const out: Warning[] = [];
  // What `:::index` raised: cross-references and ranges are only known
  // once the whole book's marks reach the index chapter.
  (doc.contentWarnings ?? []).forEach((w, i) => {
    // …the justified CJK lines set short at their tracking cap, the
    // paragraphs whose leading is too tight for their Chinese marks, ruby
    // readings, kanbun marks or Arabic vowel marks, the Arabic-script words
    // wider than their line and the styles whose letter-spacing such words
    // do not take, and the comic panels and balloons the layout had to
    // force (a letterboxed picture, a balloon that does not fit).
    if (w.kind === 'emptyCaption' || w.kind === 'resourceMoved') {
      // A caption line with the label alone, and a resource set in the
      // text that moved on and left its column's foot empty (#1151).
      out.push({
        id: `layout-${w.kind}-${w.resourceId}-${i}`,
        payload: w.kind === 'emptyCaption'
          ? { kind: 'emptyCaption', resourceId: w.resourceId, label: w.label }
          : { kind: 'resourceMoved', resourceId: w.resourceId, page: (w.pageIndex ?? 0) + 1 + (doc.pageIndexOffset ?? 0), emptyMm: w.emptyMm },
        sourceStart: w.sourceStart,
        sourceEnd: w.sourceEnd,
        line: w.sourceStart !== undefined ? lineNumberForOffset(markdown, w.sourceStart) : undefined,
      });
      return;
    }
    if (w.kind === 'pictureBelowPrintSize') {
      // A picture its column holds under half its print size (#901), in mm.
      const mm = (v: number) => Math.round((v * 254) / doc.config.page.dpi) / 10;
      out.push({
        id: `layout-pictureBelowPrintSize-${w.resourceId}-${i}`,
        payload: { kind: 'pictureBelowPrintSize', resourceId: w.resourceId, scale: w.scale, printMm: mm(w.printWidthPx), columnMm: mm(w.widthPx), pageMm: mm(w.pageWidthPx) },
        sourceStart: w.sourceStart,
        sourceEnd: w.sourceEnd,
        line: w.sourceStart !== undefined ? lineNumberForOffset(markdown, w.sourceStart) : undefined,
      });
      return;
    }
    if (w.kind === 'floatShrunk') {
      // A picture scaled to its slot (#626); an overrun in mm, as for boxes.
      const mmPerPx = 25.4 / doc.config.page.dpi;
      out.push({
        id: `layout-floatShrunk-${w.resourceId}-${i}`,
        payload: {
          kind: 'floatShrunk',
          resourceId: w.resourceId,
          scale: w.scale,
          ...(w.overflowPx !== undefined ? { overflowMm: Math.round(w.overflowPx * mmPerPx * 10) / 10 } : {}),
        },
        sourceStart: w.sourceStart,
        sourceEnd: w.sourceEnd,
        line: w.sourceStart !== undefined ? lineNumberForOffset(markdown, w.sourceStart) : undefined,
      });
      return;
    }
    if (w.kind === 'afterText' || w.kind === 'unplaced') {
      // A side box or side float set on a page with no text, by its book
      // page, and what the layout could place nowhere (#639).
      out.push({
        id: `layout-${w.kind}-${w.sourceStart ?? w.resourceId ?? 'x'}-${i}`,
        payload: w.kind === 'afterText'
          ? { kind: 'afterText', page: (w.pageIndex ?? 0) + 1 + (doc.pageIndexOffset ?? 0), ...(w.resourceId !== undefined ? { resourceId: w.resourceId } : {}) }
          : { kind: 'unplaced', ...(w.resourceId !== undefined ? { resourceId: w.resourceId } : {}) },
        sourceStart: w.sourceStart,
        sourceEnd: w.sourceEnd,
        line: w.sourceStart !== undefined ? lineNumberForOffset(markdown, w.sourceStart) : undefined,
      });
      return;
    }
    if (w.kind === 'headingClaimsColumn') {
      // An in-column heading whose design fills its column (#997), by its
      // book page.
      out.push({
        id: `layout-headingClaimsColumn-${w.sourceStart ?? 'x'}-${i}`,
        payload: { kind: 'headingClaimsColumn', level: w.level, page: (w.pageIndex ?? 0) + 1 + (doc.pageIndexOffset ?? 0), ...(w.element !== undefined ? { element: w.element } : {}) },
        sourceStart: w.sourceStart,
        sourceEnd: w.sourceEnd,
        line: w.sourceStart !== undefined ? lineNumberForOffset(markdown, w.sourceStart) : undefined,
      });
      return;
    }
    if (w.kind === 'shortListSplit' || w.kind === 'openerFloat' || w.kind === 'tocGroupSplit') {
      // The composition rules (#749): a short list cut between columns, a
      // float on an opener page, a contents block cut (#850), each by its
      // book page.
      const page = (w.pageIndex ?? 0) + 1 + (doc.pageIndexOffset ?? 0);
      out.push({
        id: `layout-${w.kind}-${w.sourceStart ?? 'x'}-${i}`,
        payload: w.kind === 'shortListSplit'
          ? { kind: 'shortListSplit', page, items: w.items }
          : w.kind === 'tocGroupSplit'
            ? { kind: 'tocGroupSplit', page, title: w.title, columns: w.columns }
            : { kind: 'openerFloat', page, ...(w.resourceId !== undefined ? { resourceId: w.resourceId } : {}) },
        sourceStart: w.sourceStart,
        sourceEnd: w.sourceEnd,
        line: w.sourceStart !== undefined ? lineNumberForOffset(markdown, w.sourceStart) : undefined,
      });
      return;
    }
    if (w.kind === 'frameOverflow') {
      // Text poured into a composed page's frame that the frame and its
      // chain cannot hold (#855), by its book page.
      out.push({
        id: `layout-frameOverflow-${w.fenceIndex}-${w.frame}-${w.pageIndex ?? 'x'}-${i}`,
        payload: {
          kind: 'frameOverflow',
          template: w.template,
          frame: w.frame,
          fenceIndex: w.fenceIndex,
          overflowMm: w.overflowMm,
          page: (w.pageIndex ?? 0) + 1 + (doc.pageIndexOffset ?? 0),
          configPath: w.configPath,
          // What the reflow ladder tried and what would make it fit (#858).
          ...(w.locale ? { locale: w.locale } : {}),
          stepsTried: w.stepsTried ?? [],
          scale: w.scale ?? 1,
          ...(w.imageScale !== undefined ? { imageScale: w.imageScale } : {}),
          proposals: w.proposals ?? [],
        },
        sourceStart: w.sourceStart,
        sourceEnd: w.sourceEnd,
        line: w.sourceStart !== undefined ? lineNumberForOffset(markdown, w.sourceStart) : undefined,
      });
      return;
    }
    if (w.kind === 'frameCovered' || w.kind === 'frameOutsideArea') {
      // Ink of a frame under another frame, or past the trim, the bleed
      // or the box it is anchored inside (#1053), by its book page.
      const page = (w.pageIndex ?? 0) + 1 + (doc.pageIndexOffset ?? 0);
      const common = { template: w.template, frame: w.frame, fenceIndex: w.fenceIndex, page, configPath: w.configPath, ...(w.locale ? { locale: w.locale } : {}) };
      out.push({
        id: `layout-${w.kind}-${w.fenceIndex}-${w.frame}-${w.kind === 'frameCovered' ? w.coveredBy : w.past}-${w.pageIndex ?? 'x'}-${i}`,
        payload: w.kind === 'frameCovered'
          ? {
            kind: 'frameCovered',
            ...common,
            coveredBy: w.coveredBy,
            coveredByPath: w.coveredByPath,
            overlapMm2: w.overlapMm2,
            ...(w.text !== undefined ? { text: w.text } : {}),
            ...(w.picture !== undefined ? { picture: w.picture } : {}),
            proposals: w.proposals ?? [],
          }
          : {
            kind: 'frameOutsideArea',
            ...common,
            past: w.past,
            ...(w.target !== undefined ? { target: w.target } : {}),
            excessMm: w.excessMm,
            sides: { ...w.sides },
            proposals: w.proposals ?? [],
          },
        sourceStart: w.sourceStart,
        sourceEnd: w.sourceEnd,
        line: w.sourceStart !== undefined ? lineNumberForOffset(markdown, w.sourceStart) : undefined,
      });
      return;
    }
    if (w.kind === 'folioMissing') {
      // A composed page that draws no folio or running head its siblings
      // of the template draw (#1163), pointed at its page fence.
      out.push({
        id: `layout-folioMissing-${w.template}-${w.slot}-${w.elementId}-${w.pageIndex ?? 'x'}-${i}`,
        payload: { kind: 'folioMissing', template: w.template, elementId: w.elementId, slot: w.slot, folio: w.folio, side: w.side, drawnOn: w.drawnOn, siblings: w.siblings, page: (w.pageIndex ?? 0) + 1 + (doc.pageIndexOffset ?? 0) },
        sourceStart: w.sourceStart,
        sourceEnd: w.sourceEnd,
        line: w.sourceStart !== undefined ? lineNumberForOffset(markdown, w.sourceStart) : undefined,
      });
      return;
    }
    if (w.kind === 'continueTargetMissing') {
      // A story that jumps to a page fence no later page has (#917).
      out.push({
        id: `layout-continueTargetMissing-${w.fenceIndex}-${w.frame}-${i}`,
        payload: { kind: 'continueTargetMissing', template: w.template, frame: w.frame, fenceIndex: w.fenceIndex, target: w.target, before: w.before === true, page: (w.pageIndex ?? 0) + 1 + (doc.pageIndexOffset ?? 0), configPath: w.configPath },
        sourceStart: w.sourceStart,
        sourceEnd: w.sourceEnd,
        line: w.sourceStart !== undefined ? lineNumberForOffset(markdown, w.sourceStart) : undefined,
      });
      return;
    }
    if (w.kind === 'frameContinuationLimit') {
      // A frame's content that went on to the most pages a composed page
      // may add and still does not fit (#859), by its book page.
      out.push({
        id: `layout-frameContinuationLimit-${w.fenceIndex}-${w.frame}-${i}`,
        payload: { kind: 'frameContinuationLimit', template: w.template, frame: w.frame, fenceIndex: w.fenceIndex, pages: w.pages, overflowMm: w.overflowMm, page: (w.pageIndex ?? 0) + 1 + (doc.pageIndexOffset ?? 0), configPath: w.configPath },
        sourceStart: w.sourceStart,
        sourceEnd: w.sourceEnd,
        line: w.sourceStart !== undefined ? lineNumberForOffset(markdown, w.sourceStart) : undefined,
      });
      return;
    }
    if (w.kind === 'labelAnchorUnknown' || w.kind === 'anchorUnlabelled') {
      // A figure's label at an anchor its picture lacks, or an anchor left
      // without a word in this locale (#860), by its book page.
      const page = (w.pageIndex ?? 0) + 1 + (doc.pageIndexOffset ?? 0);
      out.push({
        id: `layout-${w.kind}-${w.resourceId}-${w.anchor}-${w.sourceStart ?? 'x'}-${i}`,
        payload: w.kind === 'labelAnchorUnknown'
          ? { kind: 'labelAnchorUnknown', resourceId: w.resourceId, anchor: w.anchor, known: w.known, page, ...(w.locale ? { locale: w.locale } : {}) }
          : { kind: 'anchorUnlabelled', resourceId: w.resourceId, anchor: w.anchor, style: w.style, page, ...(w.locale ? { locale: w.locale } : {}) },
        sourceStart: w.sourceStart,
        sourceEnd: w.sourceEnd,
        line: w.sourceStart !== undefined ? lineNumberForOffset(markdown, w.sourceStart) : undefined,
      });
      return;
    }
    if (w.kind === 'labelOverflow' || w.kind === 'labelOverlap') {
      // Words on a picture that do not fit or that meet (#902), by their
      // book page.
      const page = (w.pageIndex ?? 0) + 1 + (doc.pageIndexOffset ?? 0);
      out.push({
        id: `layout-${w.kind}-${w.resourceId}-${w.anchor ?? w.text}-${w.sourceStart ?? 'x'}-${i}`,
        payload: w.kind === 'labelOverflow'
          ? { kind: 'labelOverflow', resourceId: w.resourceId, text: w.text, ...(w.anchor !== undefined ? { anchor: w.anchor } : {}), widthPct: w.widthPct, scale: w.scale, page, ...(w.locale ? { locale: w.locale } : {}) }
          : { kind: 'labelOverlap', resourceId: w.resourceId, text: w.text, ...(w.anchor !== undefined ? { anchor: w.anchor } : {}), with: w.with, ...(w.withAnchor !== undefined ? { withAnchor: w.withAnchor } : {}), ...(w.withSymbol !== undefined ? { withSymbol: w.withSymbol } : {}), count: w.count, page, ...(w.locale ? { locale: w.locale } : {}) },
        sourceStart: w.sourceStart,
        sourceEnd: w.sourceEnd,
        line: w.sourceStart !== undefined ? lineNumberForOffset(markdown, w.sourceStart) : undefined,
      });
      return;
    }
    if (w.kind === 'fontFallback') {
      // A face the layout measured with a fallback (#629): one per face,
      // whatever chapter found it; no place in the text.
      out.push({
        id: `font-fallback-${w.family}-${w.weight}-${w.style}`,
        payload: { kind: 'fontFallback', family: w.family, weight: w.weight, style: w.style, reason: w.reason },
      });
      return;
    }
    if (w.kind === 'glyphFallback') {
      // Characters a face lacks, drawn from another face (#1105): one per
      // face, no place in the text.
      out.push({
        id: `glyph-fallback-${w.family}-${w.weight}-${w.style}`,
        payload: { kind: 'glyphFallback', family: w.family, weight: w.weight, style: w.style, characters: [...w.characters], count: w.count, ...(w.supplier ? { supplier: w.supplier } : {}) },
      });
      return;
    }
    // A text panel's text clipped (#885) is the layout's; the panel frame's
    // other reasons are read from the source.
    if (!LAYOUT_CONTENT_KINDS.has(w.kind) && !(w.kind === 'comicPanelFrame' && w.reason === 'textOverflow')) return;
    const payload: Record<string, unknown> = { ...w };
    delete payload.sourceStart;
    delete payload.sourceEnd;
    delete payload.pageIndex;
    out.push({
      id: `index-${w.kind}-${i}`,
      payload: payload as unknown as WarningPayload,
      sourceStart: w.sourceStart,
      sourceEnd: w.sourceEnd,
      line: w.sourceStart !== undefined ? lineNumberForOffset(markdown, w.sourceStart) : undefined,
    });
  });
  const pxPerMm = doc.config.page.dpi / 25.4;
  let idx = 0;
  for (const w of doc.warnings ?? []) {
    if (w.kind !== 'calloutOverflow') continue;
    out.push({
      id: `layout-${idx++}-${w.sourceStart ?? 'x'}`,
      payload: { kind: 'calloutOverflow', page: w.pageIndex + 1 + (doc.pageIndexOffset ?? 0), overflowMm: w.overflowPx / pxPerMm },
      sourceStart: w.sourceStart,
      sourceEnd: w.sourceEnd,
      line: w.sourceStart !== undefined ? lineNumberForOffset(markdown, w.sourceStart) : undefined,
    });
  }
  return out;
}
