/**
 * Print preflight (#605): what a printer would reject in a laid-out
 * document, found on the VDT so it runs as soon as a page is laid out —
 * the Sandbox shows it in Review, and a Node pipeline can fail a build on
 * it.
 *
 * - Pictures whose effective resolution at their printed size (pixels per
 *   inch, crop included) falls under `print.preflight.minImageResolution`
 *   (critical under `criticalImageResolution`): figures, table-cell
 *   pictures, design images, comic panels. The pixels are the file's when
 *   the host knows them (`imageSize`), else the resource's declaration.
 * - Bitmaps whose declared pixel size and file disagree (#631).
 * - RGB pictures in a CMYK job (converted on export, or kept RGB by a
 *   PDF/X-4 that does not convert them), when the host says which
 *   pictures are RGB (`imageColor`).
 * - Rules, borders and strokes thinner than `minRuleWidth`.
 * - Text under `smallTextSize` set with more than one ink.
 * - Colours whose separation exceeds the ink limit.
 * - Text inside the safe zone near the trim, and boxes or pictures that
 *   stop short of the trim by less than `bleedSnap` without bleeding.
 */

import type { CmykPercent, ResolvedPrintConfig, Resource } from './types';
import type { BoundingBox, VDTComicPage, VDTDesignSlot, VDTDocument, VDTLine } from './vdt';
import type { OutputTransform } from './color/transform';
import { authoredCmykColors } from './color/authored';
import { resolvePrintConfig } from './defaults/print';
import { dimensionToPx } from './units';

export type PreflightSeverity = 'critical' | 'warning' | 'info';

export type PreflightIssue = {
  severity: PreflightSeverity;
  /** Book-absolute page index (`pageIndexOffset` counted in). */
  pageIndex: number;
  /** The offending area, page px. */
  rect?: BoundingBox;
  /** Source range in the chapter markdown, when the element has one. */
  sourceStart?: number;
  sourceEnd?: number;
} & (
  | { kind: 'lowImageResolution'; fileId: string; resourceId?: string; ppi: number; minimum: number }
  /** A bitmap that declares a pixel size its file does not have (more
   *  than a pixel off either way): its print size and resolution are
   *  worked out from the declaration. Reported once, where it is first
   *  placed; `warning` when the declaration exceeds the file. */
  | { kind: 'declaredPixelsMismatch'; fileId: string; resourceId?: string; declared: { width: number; height: number }; actual: { width: number; height: number } }
  | { kind: 'rgbImage'; fileId: string; resourceId?: string; converted: boolean }
  | { kind: 'thinRule'; widthPt: number; minimumPt: number; color: string }
  | { kind: 'smallProcessText'; sizePt: number; inks: number; color: string; text: string }
  | { kind: 'inkLimit'; color: string; coverage: number; limit: number }
  | { kind: 'safeZone'; distanceMm: number; safeZoneMm: number; text: string }
  | { kind: 'nearTrim'; gapMm: number; edge: 'top' | 'right' | 'bottom' | 'left' }
);

export type PreflightKind = PreflightIssue['kind'];

export interface PreflightOptions {
  /** The print settings to check against; the document's `config.print`
   *  (else the defaults) when omitted. */
  print?: ResolvedPrintConfig;
  /** Pixel sizes of pictures by resource (a bitmap's `width`/`height`);
   *  the resource a figure carries is used when present. */
  resources?: readonly Resource[];
  /** The separation of the job's output profile: counts inks and checks
   *  coverage exactly. Without it a neutral counts one ink and any other
   *  colour three, and coverage is not checked. */
  transform?: OutputTransform;
  /** The real pixel size of a bitmap's file (the decoded image, or
   *  `bitmapInfo` on its bytes), when the host knows it: the resolution is
   *  worked out from it, and a declaration that disagrees is reported
   *  (`declaredPixelsMismatch`). */
  imageSize?: (fileId: string) => { width: number; height: number } | undefined;
  /** Whether a picture's file is RGB, CMYK or gray (from its bytes). */
  imageColor?: (fileId: string) => 'rgb' | 'cmyk' | 'gray' | undefined;
  /** The job is CMYK (a PDF/X standard, or a CMYK PDF). Defaults to true
   *  when a PDF/X standard is set. */
  cmyk?: boolean;
}

const MM_PER_IN = 25.4;
const EPS = 0.5;

function fontSizePx(fontString: string | undefined): number | undefined {
  const m = fontString ? /(\d+(?:\.\d+)?)px/.exec(fontString) : null;
  return m ? Number(m[1]) : undefined;
}

function hex6(color: string | undefined): string | undefined {
  if (!color) return undefined;
  const c = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(c)) return c.slice(0, 7);
  if (/^#[0-9a-f]{3}([0-9a-f])?$/.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  return undefined;
}

function isTransparent(color: string | undefined): boolean {
  if (!color) return true;
  const c = color.trim().toLowerCase();
  return c === 'transparent' || /^#[0-9a-f]{6}00$/.test(c) || /^#[0-9a-f]{3}0$/.test(c);
}

/** Pixel sizes by file id. */
function bitmapSizes(doc: VDTDocument, resources: readonly Resource[] | undefined): Map<string, { w: number; h: number; id: string }> {
  const out = new Map<string, { w: number; h: number; id: string }>();
  const note = (r: Resource | undefined) => {
    const b = r?.bitmap;
    if (r && b && b.width > 0 && b.height > 0 && !out.has(b.fileId)) out.set(b.fileId, { w: b.width, h: b.height, id: r.id });
  };
  for (const r of resources ?? []) note(r);
  for (const block of doc.blocks) note(block.resourceBlock?.resource);
  for (const page of doc.pages) for (const f of page.floats ?? []) note(f.resourceBlock?.resource);
  return out;
}

/** One placed bitmap and its effective resolution there (#631): the
 *  file's pixels shown (crop and safe area counted) over its printed size
 *  in inches, the smaller of the two axes. */
export interface PlacedImageResolution {
  fileId: string;
  resourceId?: string;
  /** Book-absolute page index. */
  pageIndex: number;
  ppi: number;
  /** Printed size, layout px. */
  width: number;
  height: number;
}

/** Every bitmap placed in `doc` with its effective resolution: figures,
 *  table-cell pictures, design images and comic panels, one entry per
 *  placement. Uses `options.resources` and `options.imageSize` as
 *  {@link preflightDocument} does; runs whether or not preflight is on. */
export function placedImageResolutions(doc: VDTDocument, options: Pick<PreflightOptions, 'resources' | 'imageSize'> = {}): PlacedImageResolution[] {
  const placed: PlacedImageResolution[] = [];
  runPreflight(doc, { ...options, print: undefined }, placed);
  return placed;
}

export function preflightDocument(doc: VDTDocument, options: PreflightOptions = {}): PreflightIssue[] {
  return runPreflight(doc, options);
}

function runPreflight(doc: VDTDocument, options: PreflightOptions, placed?: PlacedImageResolution[]): PreflightIssue[] {
  const print = options.print ?? doc.config.print ?? resolvePrintConfig();
  const pf = print.preflight;
  if (!pf.enabled && !placed) return [];
  const dpi = doc.config.page.dpi;
  const pxToPt = (px: number) => (px / dpi) * 72;
  const pxToMm = (px: number) => (px / dpi) * MM_PER_IN;
  const offset = doc.pageIndexOffset ?? 0;
  const cmykJob = options.cmyk ?? print.standard !== 'none';
  const sizes = bitmapSizes(doc, options.resources);
  const authored = authoredCmykColors(doc.config);
  const minRulePx = dimensionToPx(pf.minRuleWidth, dpi);
  const smallTextPx = dimensionToPx(pf.smallTextSize, dpi);
  const safePx = dimensionToPx(pf.safeZone, dpi);
  const snapPx = dimensionToPx(pf.bleedSnap, dpi);
  const tenthMmPx = dimensionToPx({ value: 0.1, unit: 'mm' }, dpi);
  const out: PreflightIssue[] = [];
  const t = options.transform;

  const separation = (hex: string): CmykPercent | undefined => {
    const exact = authored.get(hex);
    if (exact) return exact;
    if (!t) return undefined;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const k = t.fromRgb(r, g, b);
    return { c: k.c * 100, m: k.m * 100, y: k.y * 100, k: k.k * 100 };
  };
  const inkCount = (hex: string): number => {
    const sep = separation(hex);
    if (sep) return [sep.c, sep.m, sep.y, sep.k].filter((v) => v > EPS).length;
    const neutral = hex.slice(1, 3) === hex.slice(3, 5) && hex.slice(3, 5) === hex.slice(5, 7);
    return neutral ? 1 : 3;
  };

  // Ink coverage, once per colour.
  const coverageSeen = new Set<string>();
  const checkCoverage = (color: string | undefined, pageIndex: number, rect?: BoundingBox) => {
    const hex = hex6(color);
    if (!hex || !cmykJob || coverageSeen.has(hex)) return;
    coverageSeen.add(hex);
    const sep = separation(hex);
    if (!sep) return;
    const coverage = sep.c + sep.m + sep.y + sep.k;
    if (coverage > print.inkLimit + EPS) {
      out.push({ kind: 'inkLimit', severity: 'warning', pageIndex, color: hex, coverage: Math.round(coverage), limit: print.inkLimit, ...(rect ? { rect } : {}) });
    }
  };

  // The file's pixels against the declaration, once per file.
  const mismatchSeen = new Set<string>();
  const checkImage = (fileId: string | undefined, placedW: number, placedH: number, fracW: number, fracH: number, pageIndex: number, rect: BoundingBox, resourceId?: string, src?: { start?: number; end?: number }) => {
    if (!fileId) return;
    const declared = sizes.get(fileId);
    const real = options.imageSize?.(fileId);
    const actual = real && real.width > 0 && real.height > 0 ? { w: real.width, h: real.height } : undefined;
    const size = actual ?? declared;
    const source = src?.start !== undefined ? { sourceStart: src.start, ...(src.end !== undefined ? { sourceEnd: src.end } : {}) } : {};
    const rid = resourceId ?? declared?.id;
    if (pf.enabled && declared && actual && !mismatchSeen.has(fileId) && (Math.abs(declared.w - actual.w) > 1 || Math.abs(declared.h - actual.h) > 1)) {
      mismatchSeen.add(fileId);
      const over = declared.w > actual.w + 1 || declared.h > actual.h + 1;
      out.push({
        kind: 'declaredPixelsMismatch', severity: over ? 'warning' : 'info', pageIndex, rect, fileId,
        declared: { width: declared.w, height: declared.h }, actual: { width: actual.w, height: actual.h },
        ...(rid ? { resourceId: rid } : {}), ...source,
      });
    }
    if (size && placedW > 0 && placedH > 0) {
      const ppi = Math.min((size.w * fracW) / (placedW / dpi), (size.h * fracH) / (placedH / dpi));
      placed?.push({ fileId, ...(rid ? { resourceId: rid } : {}), pageIndex, ppi, width: placedW, height: placedH });
      if (!pf.enabled) return;
      if (ppi < pf.minImageResolution - EPS) {
        out.push({
          kind: 'lowImageResolution',
          severity: ppi < pf.criticalImageResolution - EPS ? 'critical' : 'warning',
          pageIndex, rect, fileId, ppi: Math.round(ppi), minimum: pf.minImageResolution,
          ...(rid ? { resourceId: rid } : {}), ...source,
        });
      }
    }
    if (pf.enabled && cmykJob && options.imageColor?.(fileId) === 'rgb') {
      const converted = print.standard === 'pdfx1a' || print.convertImages;
      out.push({ kind: 'rgbImage', severity: converted ? 'info' : 'warning', pageIndex, rect, fileId, converted, ...(rid ? { resourceId: rid } : {}), ...source });
    }
  };

  const checkRule = (widthPx: number, color: string | undefined, pageIndex: number, rect: BoundingBox) => {
    if (widthPx <= 0 || isTransparent(color)) return;
    if (widthPx < minRulePx - 1e-6) {
      out.push({ kind: 'thinRule', severity: 'warning', pageIndex, rect, widthPt: Math.round(pxToPt(widthPx) * 100) / 100, minimumPt: Math.round(pxToPt(minRulePx) * 100) / 100, color: hex6(color) ?? String(color) });
    }
    checkCoverage(color, pageIndex, rect);
  };

  for (const page of doc.pages) {
    const pageIndex = page.index + offset;
    const trim: BoundingBox = {
      x: doc.trimOffset,
      y: doc.trimOffset,
      width: page.width - 2 * doc.trimOffset,
      height: page.height - 2 * doc.trimOffset,
    };
    const flowPage = !!page.flow;

    // --- text: small multi-ink text, coverage, safe zone
    const smallSeen = new Set<string>();
    const checkLines = (lines: readonly VDTLine[], blockFont: string, blockColor: string, src: { start?: number; end?: number }, absolute: boolean) => {
      let safeIssue: { d: number; text: string; rect: BoundingBox } | undefined;
      for (const line of lines) {
        const segs = line.segments ?? [];
        const runs = segs.length > 0
          ? segs.filter((s) => s.kind === 'text' && s.text.trim()).map((s) => ({ font: s.fontString ?? blockFont, color: s.color ?? blockColor, text: s.text }))
          : line.text.trim() ? [{ font: blockFont, color: blockColor, text: line.text }] : [];
        for (const run of runs) {
          const hex = hex6(run.color);
          if (!hex) continue;
          checkCoverage(hex, pageIndex, absolute ? line.bbox : undefined);
          const size = fontSizePx(run.font);
          if (size === undefined || size >= smallTextPx - 1e-6) continue;
          const inks = inkCount(hex);
          if (inks <= 1) continue;
          const key = `${hex}|${size}`;
          if (smallSeen.has(key)) continue;
          smallSeen.add(key);
          out.push({
            kind: 'smallProcessText', severity: 'warning', pageIndex,
            sizePt: Math.round(pxToPt(size) * 10) / 10, inks, color: hex, text: run.text.trim().slice(0, 40),
            ...(absolute ? { rect: line.bbox } : {}),
            ...(src.start !== undefined ? { sourceStart: src.start, ...(src.end !== undefined ? { sourceEnd: src.end } : {}) } : {}),
          });
        }
        if (absolute && !flowPage && line.text.trim()) {
          const b = line.bbox;
          const d = Math.min(b.x - trim.x, b.y - trim.y, trim.x + trim.width - (b.x + b.width), trim.y + trim.height - (b.y + b.height));
          // Inside the trim but within the safe zone.
          if (d < safePx - 1e-6 && d > -safePx && (!safeIssue || d < safeIssue.d)) safeIssue = { d, text: line.text.trim().slice(0, 40), rect: b };
        }
      }
      if (safeIssue) {
        out.push({
          kind: 'safeZone', severity: 'warning', pageIndex, rect: safeIssue.rect,
          distanceMm: Math.round(pxToMm(Math.max(0, safeIssue.d)) * 10) / 10, safeZoneMm: Math.round(pxToMm(safePx) * 10) / 10, text: safeIssue.text,
          ...(src.start !== undefined ? { sourceStart: src.start, ...(src.end !== undefined ? { sourceEnd: src.end } : {}) } : {}),
        });
      }
    };

    // --- boxes / pictures that stop just short of the trim
    const checkNearTrim = (rect: BoundingBox) => {
      if (flowPage || snapPx <= 0) return;
      const gaps: Array<[number, 'top' | 'right' | 'bottom' | 'left']> = [
        [rect.x - trim.x, 'left'],
        [rect.y - trim.y, 'top'],
        [trim.x + trim.width - (rect.x + rect.width), 'right'],
        [trim.y + trim.height - (rect.y + rect.height), 'bottom'],
      ];
      for (const [gap, edge] of gaps) {
        // Under a tenth of a millimetre the box reaches the trim (rounding).
        if (gap > tenthMmPx && gap < snapPx) {
          out.push({ kind: 'nearTrim', severity: 'warning', pageIndex, rect, gapMm: Math.round(pxToMm(gap) * 10) / 10, edge });
          return;
        }
      }
    };

    const checkSlot = (slot: VDTDesignSlot | undefined) => {
      for (const b of slot?.blocks ?? []) {
        if (b.kind === 'rule') {
          checkRule(b.thicknessPx, b.color, pageIndex, b.bbox);
        } else if (b.kind === 'box') {
          if (b.box.borderWidthPx > 0 && b.box.borderColor) checkRule(b.box.borderWidthPx, b.box.borderColor, pageIndex, b.bbox);
          if (!isTransparent(b.box.backgroundColor)) {
            checkCoverage(b.box.backgroundColor, pageIndex, b.bbox);
            checkNearTrim(b.bbox);
          }
        } else if (b.kind === 'image') {
          if (b.imageKind !== 'svg') checkImage(b.fileId, b.bbox.width, b.bbox.height, 1, 1, pageIndex, b.bbox);
          checkNearTrim(b.bbox);
        } else if (b.kind === 'text') {
          // What the block shows (a placeholder that resolved to nothing
          // prints nothing).
          const shown = b.lines.map((l) => l.text).join(' ').trim();
          if (!shown) continue;
          const hex = hex6(b.color);
          if (b.box && !isTransparent(b.box.backgroundColor)) checkCoverage(b.box.backgroundColor, pageIndex, b.bbox);
          if (!hex) continue;
          checkCoverage(hex, pageIndex, b.bbox);
          const size = fontSizePx(b.fontString);
          const inks = inkCount(hex);
          if (size !== undefined && size < smallTextPx - 1e-6 && inks > 1) {
            out.push({
              kind: 'smallProcessText', severity: 'warning', pageIndex, rect: b.bbox,
              sizePt: Math.round(pxToPt(size) * 10) / 10, inks, color: hex, text: shown.slice(0, 40),
              ...(b.sourceStart !== undefined ? { sourceStart: b.sourceStart, ...(b.sourceEnd !== undefined ? { sourceEnd: b.sourceEnd } : {}) } : {}),
            });
          }
        }
      }
    };

    const checkComic = (comic: VDTComicPage | undefined) => {
      for (const panel of comic?.panels ?? []) {
        if (panel.border.style !== 'none') checkRule(panel.border.width, panel.border.color, pageIndex, panel.bbox);
        for (const art of [panel.art, panel.pop]) {
          if (!art || art.kind !== 'bitmap') continue;
          const size = sizes.get(art.fileId);
          checkImage(art.fileId, art.box.width, art.box.height, size ? art.source.width / size.w : 1, size ? art.source.height / size.h : 1, pageIndex, art.box, art.resourceId, { start: panel.sourceStart, end: panel.sourceEnd });
        }
      }
    };

    const blocks = [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? []), ...page.marginNotes];
    for (const block of blocks) {
      if (block.hidden) continue;
      const src = { start: block.sourceStart, end: block.sourceEnd };
      checkLines(block.lines, block.fontString, block.color, src, true);
      const rb = block.resourceBlock;
      if (rb) {
        if (rb.captionLines.length > 0) checkLines(rb.captionLines, rb.captionFontString, rb.captionColor, src, false);
        const body: BoundingBox = { x: block.bbox.x + rb.bodyRect.x, y: block.bbox.y + rb.bodyRect.y, width: rb.bodyRect.width, height: rb.bodyRect.height };
        if (rb.kind === 'bitmap') {
          const s = rb.bodySource;
          checkImage(rb.fileId, rb.bodyRect.width, rb.bodyRect.height, s?.width ?? 1, s?.height ?? 1, pageIndex, body, rb.resource.id, src);
          checkNearTrim(body);
        }
        const table = rb.table;
        if (table) {
          // Booktabs strokes (#625) have their own widths: the thinnest counts.
          const rulePx = table.strokes
            ? table.strokes.reduce((min, s) => Math.min(min, s.widthPx), Infinity)
            : table.borderWidthPx;
          if (rulePx > 0 && Number.isFinite(rulePx)) checkRule(rulePx, table.borderColor, pageIndex, body);
          for (const cell of table.cells ?? []) {
            const img = cell.image;
            if (img && img.kind === 'bitmap') checkImage(img.fileId, img.rect.width, img.rect.height, 1, 1, pageIndex, body, img.resourceId, src);
          }
        }
      }
      checkSlot(block.designOverlay);
      checkComic(block.comic);
    }
    if (page.columnRule?.enabled && page.columns.length > 1) {
      checkRule(page.columnRule.lineWidthPx, page.columnRule.color, pageIndex, page.contentArea);
    }
    checkSlot(page.header);
    checkSlot(page.footer);
    checkSlot(page.openerBand);
    checkSlot(page.lineNumbers);
    checkComic(page.comic);
  }

  // The rich-black recipe against the limit.
  if (cmykJob && print.black.richBlack) {
    const rb = print.black.richBlackColor;
    const coverage = rb.c + rb.m + rb.y + rb.k;
    if (coverage > print.inkLimit + EPS) {
      out.push({ kind: 'inkLimit', severity: 'warning', pageIndex: offset, color: 'rich-black', coverage: Math.round(coverage), limit: print.inkLimit });
    }
  }
  return out;
}
