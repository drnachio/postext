import type {
  AnchorEdge,
  ColorValue,
  Dimension,
  ElementBoxStyle,
  ElementPlacement,
  ElementSize,
  HAlign,
  PageParity,
  ResolvedDesignBoxElement,
  ResolvedDesignElement,
  ResolvedDesignRuleElement,
  ResolvedDesignSlot,
  ResolvedDesignTextElement,
  TextOverflow,
  VAlign,
} from '../types';
import { dimensionToPx } from '../units';
import { buildFontString, measureTextWidth } from '../measure';
import { hyphenateText } from '../hyphenate';
import {
  resolveDesignPlaceholders,
  type DesignPlaceholderContext,
} from './placeholders';

/** A line of wrapped text with its measured width and baseline offset. */
export interface WrappedLine {
  text: string;
  width: number;
  /** Vertical offset of the baseline from the top of the text content box. */
  baselineY: number;
  /** Y offset of the line top within the element's content box. */
  topY: number;
  /** Line-box height (lineHeight * fontSize). */
  height: number;
}

export interface ResolvedPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ResolvedElementBox {
  backgroundColor?: string;
  borderColor?: string;
  borderWidthPx: number;
  borderRadiusPx: number;
  padding: ResolvedPadding;
}

/** Resolved geometry for a single element in a design slot. */
export interface ResolvedElementGeometry {
  id: string;
  kind: 'text' | 'rule' | 'box';
  /** Absolute page-space rectangle (the element's outer box). */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResolvedTextPrimitive extends ResolvedElementGeometry {
  kind: 'text';
  lines: WrappedLine[];
  fontString: string;
  fontSizePx: number;
  color: string;
  align: HAlign;
  verticalAlign: VAlign;
  /** Whether the element needs a clip rect during rendering. */
  needsClip: boolean;
  /** Content box (inside padding) offsets, relative to element x/y. */
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
  box?: ResolvedElementBox;
}

export interface ResolvedRulePrimitive extends ResolvedElementGeometry {
  kind: 'rule';
  direction: 'horizontal' | 'vertical';
  color: string;
  thicknessPx: number;
}

export interface ResolvedBoxPrimitive extends ResolvedElementGeometry {
  kind: 'box';
  box: ResolvedElementBox;
}

export type ResolvedPrimitive =
  | ResolvedTextPrimitive
  | ResolvedRulePrimitive
  | ResolvedBoxPrimitive;

export interface DesignSlotLayout {
  /** Container bbox passed in (absolute page coordinates). */
  container: { x: number; y: number; width: number; height: number };
  primitives: ResolvedPrimitive[];
  /** Elements flagged with cyclic anchor graph or dangling references. */
  issues: LayoutIssue[];
}

export interface LayoutIssue {
  kind: 'cyclicAnchor' | 'danglingAnchor';
  elementId: string;
  targetId?: string;
}

export interface LayoutContext {
  container: { x: number; y: number; width: number; height: number };
  dpi: number;
  placeholders: DesignPlaceholderContext;
}

function pageMatchesParity(pageIndex: number, parity: PageParity): boolean {
  if (parity === 'all') return true;
  const pageNumber = pageIndex + 1;
  const isOdd = pageNumber % 2 === 1;
  return parity === 'odd' ? isOdd : !isOdd;
}

function dimPx(d: Dimension | undefined, dpi: number, baseFontSizePx?: number): number {
  if (!d) return 0;
  return dimensionToPx(d, dpi, baseFontSizePx);
}

function resolvePadding(
  padding: ElementBoxStyle['padding'],
  dpi: number,
  baseFontSizePx?: number,
): ResolvedPadding {
  return {
    top: dimPx(padding?.top, dpi, baseFontSizePx),
    right: dimPx(padding?.right, dpi, baseFontSizePx),
    bottom: dimPx(padding?.bottom, dpi, baseFontSizePx),
    left: dimPx(padding?.left, dpi, baseFontSizePx),
  };
}

function resolveBox(
  style: ElementBoxStyle | undefined,
  dpi: number,
  baseFontSizePx?: number,
): ResolvedElementBox | undefined {
  if (!style) return undefined;
  return {
    backgroundColor: style.backgroundColor?.hex,
    borderColor: style.borderColor?.hex,
    borderWidthPx: dimPx(style.borderWidth, dpi, baseFontSizePx),
    borderRadiusPx: dimPx(style.borderRadius, dpi, baseFontSizePx),
    padding: resolvePadding(style.padding, dpi, baseFontSizePx),
  };
}

function colorHex(c: ColorValue | undefined): string {
  return c?.hex ?? '#000000';
}

// ---------------------------------------------------------------------------
// Anchor dependency graph
// ---------------------------------------------------------------------------

function anchorTargetId(placement: ElementPlacement): string | undefined {
  if (placement.anchor.to === 'container') return undefined;
  return placement.anchor.to.slice(1);
}

function topoSort(
  elements: ResolvedDesignElement[],
  issues: LayoutIssue[],
): ResolvedDesignElement[] {
  const byId = new Map<string, ResolvedDesignElement>();
  for (const el of elements) byId.set(el.id, el);

  // Detect dangling
  for (const el of elements) {
    const target = anchorTargetId(el.placement);
    if (target && !byId.has(target)) {
      issues.push({ kind: 'danglingAnchor', elementId: el.id, targetId: target });
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const out: ResolvedDesignElement[] = [];

  function visit(el: ResolvedDesignElement, path: string[]): void {
    if (visited.has(el.id)) return;
    if (visiting.has(el.id)) {
      issues.push({ kind: 'cyclicAnchor', elementId: el.id });
      return;
    }
    visiting.add(el.id);
    const target = anchorTargetId(el.placement);
    if (target) {
      const dep = byId.get(target);
      if (dep) visit(dep, [...path, el.id]);
    }
    visiting.delete(el.id);
    visited.add(el.id);
    out.push(el);
  }

  for (const el of elements) visit(el, []);
  return out;
}

// ---------------------------------------------------------------------------
// Anchor edge resolution — compute (anchorX, anchorY) and which element edge
// sits at that anchor. The element's extent grows from that anchor point.
// ---------------------------------------------------------------------------

interface AnchorReference {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Pin = 'start' | 'middle' | 'end';

interface AnchorResult {
  /** Anchor point on the reference (absolute coordinates). */
  anchorX: number;
  anchorY: number;
  /** How the element aligns against the anchor. `start` = anchor is at element's
   *  top/left edge; `end` = anchor at bottom/right; `middle` = centered. */
  pinX: Pin;
  pinY: Pin;
}

function resolveContainerAnchor(
  edge: AnchorEdge,
  ref: AnchorReference,
): AnchorResult {
  // Container-relative nine-point grid: pin the corresponding corner of the
  // element to the corresponding point of the container.
  switch (edge) {
    case 'top-left':
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'start', pinY: 'start' };
    case 'top':
      return { anchorX: ref.x + ref.width / 2, anchorY: ref.y, pinX: 'middle', pinY: 'start' };
    case 'top-right':
      return { anchorX: ref.x + ref.width, anchorY: ref.y, pinX: 'end', pinY: 'start' };
    case 'left':
      return { anchorX: ref.x, anchorY: ref.y + ref.height / 2, pinX: 'start', pinY: 'middle' };
    case 'center':
      return { anchorX: ref.x + ref.width / 2, anchorY: ref.y + ref.height / 2, pinX: 'middle', pinY: 'middle' };
    case 'right':
      return { anchorX: ref.x + ref.width, anchorY: ref.y + ref.height / 2, pinX: 'end', pinY: 'middle' };
    case 'bottom-left':
      return { anchorX: ref.x, anchorY: ref.y + ref.height, pinX: 'start', pinY: 'end' };
    case 'bottom':
      return { anchorX: ref.x + ref.width / 2, anchorY: ref.y + ref.height, pinX: 'middle', pinY: 'end' };
    case 'bottom-right':
      return { anchorX: ref.x + ref.width, anchorY: ref.y + ref.height, pinX: 'end', pinY: 'end' };
    default:
      // Fallback when an element-to-element edge was set with anchor.to = 'container'.
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'start', pinY: 'start' };
  }
}

function resolveElementAnchor(
  edge: AnchorEdge,
  ref: AnchorReference,
): AnchorResult {
  switch (edge) {
    case 'right-of':
      return { anchorX: ref.x + ref.width, anchorY: ref.y, pinX: 'start', pinY: 'start' };
    case 'left-of':
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'end', pinY: 'start' };
    case 'below':
      return { anchorX: ref.x, anchorY: ref.y + ref.height, pinX: 'start', pinY: 'start' };
    case 'above':
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'start', pinY: 'end' };
    case 'align-top':
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'start', pinY: 'start' };
    case 'align-bottom':
      return { anchorX: ref.x, anchorY: ref.y + ref.height, pinX: 'start', pinY: 'end' };
    case 'align-left':
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'start', pinY: 'start' };
    case 'align-right':
      return { anchorX: ref.x + ref.width, anchorY: ref.y, pinX: 'end', pinY: 'start' };
    default:
      // Fallback when a container edge was set with anchor.to = '#id' — treat
      // as align-top (match target's top-left).
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'start', pinY: 'start' };
  }
}

// ---------------------------------------------------------------------------
// Text layout — wrap / ellipsis / clip
// ---------------------------------------------------------------------------

function ellipsize(
  text: string,
  fontString: string,
  maxWidth: number,
  mode: 'start' | 'end' | 'middle',
): string {
  const ellipsis = '…';
  if (measureTextWidth(text, fontString) <= maxWidth) return text;
  const ellipsisWidth = measureTextWidth(ellipsis, fontString);
  if (ellipsisWidth > maxWidth) return '';
  const budget = maxWidth - ellipsisWidth;
  if (mode === 'end') {
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (measureTextWidth(text.slice(0, mid), fontString) <= budget) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return text.slice(0, lo) + ellipsis;
  }
  if (mode === 'start') {
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (measureTextWidth(text.slice(mid), fontString) <= budget) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    return ellipsis + text.slice(lo);
  }
  // middle
  let leftLen = 0;
  let rightLen = 0;
  while (true) {
    const candidate = text.slice(0, leftLen + 1) + text.slice(text.length - rightLen);
    if (measureTextWidth(candidate, fontString) + ellipsisWidth > maxWidth) break;
    leftLen++;
    if (leftLen + rightLen >= text.length) break;
    const candidate2 = text.slice(0, leftLen) + text.slice(text.length - (rightLen + 1));
    if (measureTextWidth(candidate2, fontString) + ellipsisWidth > maxWidth) break;
    rightLen++;
    if (leftLen + rightLen >= text.length) break;
  }
  return text.slice(0, leftLen) + ellipsis + text.slice(text.length - rightLen);
}

const SOFT_HYPHEN = '\u00AD';

function breakWordWithHyphenation(
  word: string,
  fontString: string,
  maxWidth: number,
  useHyphenation: boolean,
): { head: string; tail: string } | undefined {
  // Returns a split of the word where head (with trailing hyphen if hyphenated)
  // fits in maxWidth. Returns undefined if no split is possible.
  if (useHyphenation) {
    const hy = hyphenateText(word);
    if (hy.includes(SOFT_HYPHEN)) {
      const parts = hy.split(SOFT_HYPHEN);
      let best: { head: string; tail: string } | undefined;
      for (let i = 1; i < parts.length; i++) {
        const headRaw = parts.slice(0, i).join('');
        const tailRaw = parts.slice(i).join('');
        const headWithHyphen = headRaw + '-';
        if (measureTextWidth(headWithHyphen, fontString) <= maxWidth) {
          best = { head: headWithHyphen, tail: tailRaw };
        } else {
          break;
        }
      }
      if (best) return best;
    }
  }
  // Last-resort character break so text never overflows when it can't fit.
  let lo = 1;
  let hi = word.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measureTextWidth(word.slice(0, mid), fontString) <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  if (lo < 1) return undefined;
  return { head: word.slice(0, lo), tail: word.slice(lo) };
}

function wrapToWidth(
  text: string,
  fontString: string,
  maxWidth: number,
  hyphenate: boolean,
): string[] {
  // Greedy word wrap; preserves existing line breaks.
  const paragraphs = text.split('\n');
  const out: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/(\s+)/);
    let current = '';
    for (const part of words) {
      const test = current + part;
      if (measureTextWidth(test, fontString) <= maxWidth || (current.length === 0 && /^\s*$/.test(part))) {
        current = test;
      } else if (current.length === 0) {
        // Single word doesn't fit — try hyphenation / char break.
        let remaining = part;
        while (remaining.length > 0) {
          if (measureTextWidth(remaining, fontString) <= maxWidth) {
            current = remaining;
            break;
          }
          const split = breakWordWithHyphenation(remaining, fontString, maxWidth, hyphenate);
          if (!split || split.head.length === 0) {
            current = remaining;
            break;
          }
          out.push(split.head);
          remaining = split.tail;
        }
      } else {
        out.push(current.replace(/\s+$/, ''));
        // New line starts with this part; if the part itself doesn't fit, split it.
        const trimmed = part.replace(/^\s+/, '');
        if (measureTextWidth(trimmed, fontString) <= maxWidth) {
          current = trimmed;
        } else {
          let remaining = trimmed;
          current = '';
          while (remaining.length > 0) {
            if (measureTextWidth(remaining, fontString) <= maxWidth) {
              current = remaining;
              break;
            }
            const split = breakWordWithHyphenation(remaining, fontString, maxWidth, hyphenate);
            if (!split || split.head.length === 0) {
              current = remaining;
              break;
            }
            out.push(split.head);
            remaining = split.tail;
          }
        }
      }
    }
    if (current.length > 0) out.push(current.replace(/\s+$/, ''));
    else out.push('');
  }
  return out.length > 0 ? out : [''];
}

interface TextMeasurement {
  lines: WrappedLine[];
  contentWidth: number;
  contentHeight: number;
  needsClip: boolean;
}

function layoutText(
  text: string,
  fontString: string,
  fontSizePx: number,
  lineHeight: number,
  overflow: TextOverflow,
  /** When not undefined, constrains text width. Otherwise measure natural. */
  maxContentWidth: number | undefined,
  hyphenate: boolean | undefined,
): TextMeasurement {
  const lineHeightPx = fontSizePx * lineHeight;
  if (maxContentWidth === undefined) {
    // Single natural line.
    const width = measureTextWidth(text, fontString);
    return {
      lines: [{
        text,
        width,
        topY: 0,
        baselineY: lineHeightPx * 0.8,
        height: lineHeightPx,
      }],
      contentWidth: width,
      contentHeight: lineHeightPx,
      needsClip: false,
    };
  }
  if (overflow === 'wrap') {
    const lines = wrapToWidth(text, fontString, maxContentWidth, hyphenate ?? false);
    const wrapped: WrappedLine[] = lines.map((t, i) => ({
      text: t,
      width: measureTextWidth(t, fontString),
      topY: i * lineHeightPx,
      baselineY: i * lineHeightPx + lineHeightPx * 0.8,
      height: lineHeightPx,
    }));
    const w = wrapped.reduce((m, l) => Math.max(m, l.width), 0);
    return {
      lines: wrapped,
      contentWidth: w,
      contentHeight: wrapped.length * lineHeightPx,
      needsClip: false,
    };
  }
  if (overflow === 'clip') {
    const natural = measureTextWidth(text, fontString);
    return {
      lines: [{
        text,
        width: natural,
        topY: 0,
        baselineY: lineHeightPx * 0.8,
        height: lineHeightPx,
      }],
      contentWidth: Math.min(natural, maxContentWidth),
      contentHeight: lineHeightPx,
      needsClip: true,
    };
  }
  // ellipsis-*
  const mode: 'start' | 'end' | 'middle' =
    overflow === 'ellipsis-start' ? 'start'
    : overflow === 'ellipsis-middle' ? 'middle'
    : 'end';
  const visible = ellipsize(text, fontString, maxContentWidth, mode);
  const width = measureTextWidth(visible, fontString);
  return {
    lines: [{
      text: visible,
      width,
      topY: 0,
      baselineY: lineHeightPx * 0.8,
      height: lineHeightPx,
    }],
    contentWidth: width,
    contentHeight: lineHeightPx,
    needsClip: false,
  };
}

// ---------------------------------------------------------------------------
// Size resolution helpers
// ---------------------------------------------------------------------------

function resolveFixedSize(
  size: ElementSize | undefined,
  dpi: number,
  baseFontSizePx?: number,
): number | 'auto' | 'fill' | undefined {
  if (size === undefined) return undefined;
  if (size === 'auto' || size === 'fill') return size;
  return dimPx(size, dpi, baseFontSizePx);
}

// Clamp helper — returns x + w bounded by container edge when pin is 'start'
// (element extends to the right/down), etc.
function fillToContainerEdge(
  anchorX: number,
  pinX: Pin,
  container: AnchorReference,
): number {
  if (pinX === 'start') return container.x + container.width - anchorX;
  if (pinX === 'end') return anchorX - container.x;
  // middle: distance to nearest edge * 2
  const leftDist = anchorX - container.x;
  const rightDist = container.x + container.width - anchorX;
  return Math.min(leftDist, rightDist) * 2;
}

function fillToContainerEdgeY(
  anchorY: number,
  pinY: Pin,
  container: AnchorReference,
): number {
  if (pinY === 'start') return container.y + container.height - anchorY;
  if (pinY === 'end') return anchorY - container.y;
  const topDist = anchorY - container.y;
  const botDist = container.y + container.height - anchorY;
  return Math.min(topDist, botDist) * 2;
}

function edgeXFromPin(anchorX: number, pinX: Pin, width: number): number {
  if (pinX === 'start') return anchorX;
  if (pinX === 'end') return anchorX - width;
  return anchorX - width / 2;
}

function edgeYFromPin(anchorY: number, pinY: Pin, height: number): number {
  if (pinY === 'start') return anchorY;
  if (pinY === 'end') return anchorY - height;
  return anchorY - height / 2;
}

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------

/** Layout one design slot against its container. */
export function layoutDesignSlot(
  slot: ResolvedDesignSlot,
  context: LayoutContext,
  pageIndex: number,
): DesignSlotLayout {
  const issues: LayoutIssue[] = [];
  const containerRef: AnchorReference = {
    x: context.container.x,
    y: context.container.y,
    width: context.container.width,
    height: context.container.height,
  };

  // Filter by parity first.
  const candidates = slot.elements.filter((el) => pageMatchesParity(pageIndex, el.parity));

  // Topologically sort (dependencies first).
  const ordered = topoSort(candidates, issues);

  // Precompute: resolved text contents (placeholder-expanded).
  const textContent = new Map<string, string>();
  for (const el of ordered) {
    if (el.kind === 'text') {
      const { text } = resolveDesignPlaceholders(el.content, context.placeholders);
      textContent.set(el.id, text);
    }
  }

  const resolvedGeo = new Map<string, ResolvedPrimitive>();
  const primitives: ResolvedPrimitive[] = [];

  for (const el of ordered) {
    const target = anchorTargetId(el.placement);
    let refGeo: AnchorReference = containerRef;
    let useElementEdge = false;
    if (target) {
      const dep = resolvedGeo.get(target);
      if (dep) {
        refGeo = { x: dep.x, y: dep.y, width: dep.width, height: dep.height };
        useElementEdge = true;
      }
    }
    const anchor = useElementEdge
      ? resolveElementAnchor(el.placement.anchor.edge, refGeo)
      : resolveContainerAnchor(el.placement.anchor.edge, refGeo);

    const offsetX = dimPx(el.placement.offset?.x, context.dpi);
    const offsetY = dimPx(el.placement.offset?.y, context.dpi);
    const anchorX = anchor.anchorX + offsetX;
    const anchorY = anchor.anchorY + offsetY;

    if (el.kind === 'text') {
      const prim = layoutTextElement(el, textContent.get(el.id) ?? '', {
        anchorX,
        anchorY,
        pinX: anchor.pinX,
        pinY: anchor.pinY,
      }, containerRef, context.dpi, useElementEdge);
      resolvedGeo.set(el.id, prim);
      primitives.push(prim);
    } else if (el.kind === 'rule') {
      const prim = layoutRuleElement(el, {
        anchorX,
        anchorY,
        pinX: anchor.pinX,
        pinY: anchor.pinY,
      }, containerRef, context.dpi);
      resolvedGeo.set(el.id, prim);
      primitives.push(prim);
    } else {
      const prim = layoutBoxElement(el, {
        anchorX,
        anchorY,
        pinX: anchor.pinX,
        pinY: anchor.pinY,
      }, containerRef, context.dpi);
      resolvedGeo.set(el.id, prim);
      primitives.push(prim);
    }
  }

  return {
    container: context.container,
    primitives,
    issues,
  };
}

function layoutTextElement(
  el: ResolvedDesignTextElement,
  text: string,
  pin: AnchorResult,
  container: AnchorReference,
  dpi: number,
  anchoredToElement: boolean,
): ResolvedTextPrimitive {
  const fontSizePx = dimPx(el.fontSize, dpi);
  const weight = el.fontWeight === 400 ? 'normal' : String(el.fontWeight);
  const style = el.italic ? 'italic' : 'normal';
  const fontString = buildFontString(el.fontFamily, fontSizePx, weight, style);
  const box = resolveBox(el.box, dpi, fontSizePx);
  const padding: ResolvedPadding = box?.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };

  const widthSize = resolveFixedSize(el.placement.size?.width, dpi, fontSizePx);
  const heightSize = resolveFixedSize(el.placement.size?.height, dpi, fontSizePx);

  // Determine content width budget.
  let contentMax: number | undefined;
  let elementWidth: number | undefined;
  let clampToContainer = false;
  if (widthSize === 'auto' || widthSize === undefined) {
    // Auto width: let the text size itself, but never overflow the container.
    // We compute the distance from the anchor to the container edge and use
    // that as an upper bound for wrapping/ellipsis.
    const fillW = fillToContainerEdge(pin.anchorX, pin.pinX, container);
    contentMax = Math.max(0, fillW - padding.left - padding.right);
    clampToContainer = true;
  } else if (widthSize === 'fill') {
    const fillW = fillToContainerEdge(pin.anchorX, pin.pinX, container);
    elementWidth = Math.max(0, fillW);
    contentMax = Math.max(0, elementWidth - padding.left - padding.right);
  } else {
    elementWidth = widthSize;
    contentMax = Math.max(0, elementWidth - padding.left - padding.right);
  }

  const m = layoutText(text, fontString, fontSizePx, el.lineHeight, el.overflow, contentMax, el.hyphenate);
  const contentWidth = m.contentWidth;
  if (elementWidth === undefined) elementWidth = contentWidth + padding.left + padding.right;
  if (clampToContainer) {
    const maxW = fillToContainerEdge(pin.anchorX, pin.pinX, container);
    elementWidth = Math.min(elementWidth, Math.max(0, maxW));
  }

  let elementHeight: number;
  if (heightSize === undefined || heightSize === 'auto') {
    elementHeight = m.contentHeight + padding.top + padding.bottom;
  } else if (heightSize === 'fill') {
    elementHeight = Math.max(0, fillToContainerEdgeY(pin.anchorY, pin.pinY, container));
  } else {
    elementHeight = heightSize;
  }

  const x = edgeXFromPin(pin.anchorX, pin.pinX, elementWidth);
  const y = edgeYFromPin(pin.anchorY, pin.pinY, elementHeight);

  // When anchored to another element with auto-sized width, wrapped lines
  // should flow from the anchor side: right-of → left-align, left-of →
  // right-align. This keeps the first character of every wrapped line at the
  // same vertical gutter as the anchor, matching user intent.
  const autoWidth = el.placement.size?.width === undefined || el.placement.size?.width === 'auto';
  const effectiveAlign: HAlign = anchoredToElement && autoWidth
    ? (pin.pinX === 'start' ? 'left' : pin.pinX === 'end' ? 'right' : el.align)
    : el.align;

  return {
    kind: 'text',
    id: el.id,
    x,
    y,
    width: elementWidth,
    height: elementHeight,
    lines: m.lines,
    fontString,
    fontSizePx,
    color: colorHex(el.color),
    align: effectiveAlign,
    verticalAlign: el.verticalAlign,
    needsClip: m.needsClip || el.overflow === 'clip',
    contentX: padding.left,
    contentY: padding.top,
    contentWidth: Math.max(0, elementWidth - padding.left - padding.right),
    contentHeight: Math.max(0, elementHeight - padding.top - padding.bottom),
    box,
  };
}

function layoutRuleElement(
  el: ResolvedDesignRuleElement,
  pin: AnchorResult,
  container: AnchorReference,
  dpi: number,
): ResolvedRulePrimitive {
  const thicknessPx = dimPx(el.thickness, dpi);
  const widthSize = resolveFixedSize(el.placement.size?.width, dpi);
  const heightSize = resolveFixedSize(el.placement.size?.height, dpi);

  let elementWidth: number;
  let elementHeight: number;
  if (el.direction === 'horizontal') {
    if (widthSize === undefined || widthSize === 'auto' || widthSize === 'fill') {
      elementWidth = Math.max(0, fillToContainerEdge(pin.anchorX, pin.pinX, container));
    } else {
      elementWidth = widthSize;
    }
    elementHeight = typeof heightSize === 'number' ? heightSize : thicknessPx;
  } else {
    if (heightSize === undefined || heightSize === 'auto' || heightSize === 'fill') {
      elementHeight = Math.max(0, fillToContainerEdgeY(pin.anchorY, pin.pinY, container));
    } else {
      elementHeight = heightSize;
    }
    elementWidth = typeof widthSize === 'number' ? widthSize : thicknessPx;
  }

  const x = edgeXFromPin(pin.anchorX, pin.pinX, elementWidth);
  const y = edgeYFromPin(pin.anchorY, pin.pinY, elementHeight);

  return {
    kind: 'rule',
    id: el.id,
    direction: el.direction,
    x,
    y,
    width: elementWidth,
    height: elementHeight,
    color: colorHex(el.color),
    thicknessPx,
  };
}

function layoutBoxElement(
  el: ResolvedDesignBoxElement,
  pin: AnchorResult,
  container: AnchorReference,
  dpi: number,
): ResolvedBoxPrimitive {
  const widthSize = resolveFixedSize(el.placement.size?.width, dpi);
  const heightSize = resolveFixedSize(el.placement.size?.height, dpi);
  let elementWidth: number;
  let elementHeight: number;
  if (widthSize === undefined || widthSize === 'auto' || widthSize === 'fill') {
    elementWidth = Math.max(0, fillToContainerEdge(pin.anchorX, pin.pinX, container));
  } else {
    elementWidth = widthSize;
  }
  if (heightSize === undefined || heightSize === 'auto' || heightSize === 'fill') {
    elementHeight = Math.max(0, fillToContainerEdgeY(pin.anchorY, pin.pinY, container));
  } else {
    elementHeight = heightSize;
  }
  const x = edgeXFromPin(pin.anchorX, pin.pinX, elementWidth);
  const y = edgeYFromPin(pin.anchorY, pin.pinY, elementHeight);
  const box = resolveBox(el.style, dpi) ?? {
    borderWidthPx: 0,
    borderRadiusPx: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  };
  return {
    kind: 'box',
    id: el.id,
    x,
    y,
    width: elementWidth,
    height: elementHeight,
    box,
  };
}
