// The spans of captions, notes and cells resolved before measuring: CJK
// annotations, colour swatches, icon chips and :ref labels with their case
// (#1276: split out of resourceLayout.ts).
import { type AnchorTargets, type CrossRefStrings, findAnchorTarget, unprefixedId, anchorRefLabel } from '../../references/crossRefs.js';
import type { InlineSpan, SwatchShape, SwatchBox, InlineIcon, RefCase } from '../../../parse/index.js';
import type { ResolvedCjkConfig, ColorPaletteEntry, Resource, Dimension, ResourceType, ResolvedCaptionStyleConfig } from '../../../types.js';
import { isSwatchFill } from '../../../measure/rich.js';
import { refLabelPieces } from '../../../measure/spaces.js';
import { dimensionToPx } from '../../../units.js';
import { hasAnnotations, resolveAnnotationSpans } from '../../text/annotations.js';
import { fontSizePxOf, type ChipContext, resolveChipSpans } from '../../text/chips.js';
import type { ResourceNumberingMap } from '../resourceNumbering.js';
import type { CellFontSet } from './tableLayout.js';

/**
 * A caption's, a note's or a cell's spans with their Chinese and Japanese
 * annotations resolved as the running text resolves them (#429; the
 * marks of #193, #421, ruby #194, warichu #195): `*…*` on CJK characters
 * set with emphasis marks under `cjk.emphasis: 'dots'`, the region's mark
 * where a mark leaves it unset, book titles as `cjk.bookTitleMark` sets
 * them (brackets in the text, the wavy line, or plain), and the faces of
 * ruby readings and warichu notes at the size of `fontString` (the cell's,
 * the caption's or the note's). The measurer then sets readings and notes
 * and flags the marked segments; the marks are placed once the document is
 * laid out (`annotateDocument`), as on body lines. The same array when the
 * spans hold none of them, so plain captions and cells measure as before.
 */
export function annotatedSpans(spans: InlineSpan[], scope: AnnotationScope, fontString: string): InlineSpan[] {
  if (!hasAnnotations(spans, scope.cjk)) return spans;
  return resolveAnnotationSpans(spans, { cjk: scope.cjk, dpi: scope.dpi, fontString, fontSizePx: fontSizePxOf(fontString) });
}

/** What {@link annotatedSpans} reads of the document. */
export interface AnnotationScope {
  cjk: ResolvedCjkConfig;
  dpi: number;
}

/** Non-breaking space used to glue a resolved `:ref` label into a single
 *  atomic text token, so a post-measurement pass can tag it reliably. */
const NBSP = ' ';

/** Resolve the colour of every inline `:swatch{…}` span: a `#rgb` / `#rgba`
 *  hex is normalised to six / eight digits, a `#rrggbb` / `#rrggbbaa` one
 *  lower-cased, an `rgb()` / `rgba()` colour kept as written; any other
 *  value is looked up as a document palette entry id. An unresolved colour
 *  is left as written (the measurer then draws an empty outline). Spans
 *  without a swatch pass through. */
export function resolveSwatchSpans(spans: InlineSpan[], palette: ColorPaletteEntry[] | undefined, resources?: readonly Resource[], metrics?: SwatchMetrics): InlineSpan[] {
  return spans.map((span) => {
    if (!span.swatch) return span;
    const icon = span.swatch.icon;
    // An inline symbol (#1058): its tint as a swatch's colour, and the
    // picture of a resource icon.
    if (icon) {
      const color = span.swatch.color.trim() ? resolveSwatchColor(span.swatch.color, palette) ?? '' : '';
      const picture = icon.resource !== undefined ? iconPicture(resources?.find((r) => r.id === icon.resource)) : undefined;
      if (color === span.swatch.color && !picture) return span;
      return { ...span, swatch: { color, icon: picture ? { ...icon, picture } : icon } };
    }
    const color = resolveSwatchColor(span.swatch.color, palette);
    // The size, outline, corners and gap written on it (#1104), in px for
    // the text it sits in.
    const shape = span.swatch.shape;
    const box = shape && metrics ? resolveSwatchBox(shape, palette, metrics) : undefined;
    if (color === undefined && !box) return span;
    return { ...span, swatch: { color: color ?? span.swatch.color, ...(shape ? { shape } : {}), ...(box ? { box } : {}) } };
  });
}

/** What a swatch's lengths are read against (#1104): the document's DPI
 *  and the font size of the text the swatch sits in (its em). */
export interface SwatchMetrics {
  dpi: number;
  fontSizePx: number;
}

/** A swatch's shape in px and hex (#1104): an outline colour that names
 *  no palette entry is left out (the text colour outlines it). */
export function resolveSwatchBox(shape: SwatchShape, palette: ColorPaletteEntry[] | undefined, metrics: SwatchMetrics): SwatchBox {
  const px = (d: Dimension): number => Math.max(0, dimensionToPx(d, metrics.dpi, metrics.fontSizePx));
  const box: SwatchBox = {};
  if (shape.size) box.sidePx = Math.max(1, px(shape.size));
  if (shape.borderWidth) box.borderWidthPx = px(shape.borderWidth);
  if (shape.borderColor) {
    const hex = resolveSwatchColor(shape.borderColor, palette);
    if (hex !== undefined) box.borderColor = hex;
  }
  if (shape.radius) box.radiusPx = px(shape.radius);
  if (shape.gap) box.gapPx = px(shape.gap);
  return box;
}

/** A swatch's colour as a fill (see {@link resolveSwatchSpans}), or
 *  undefined when it names no palette entry. */
function resolveSwatchColor(value: string, palette: ColorPaletteEntry[] | undefined): string | undefined {
  const raw = value.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i.exec(raw);
  if (short) return `#${short.slice(1).filter(Boolean).map((d) => d + d).join('')}`.toLowerCase();
  if (/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) return raw.toLowerCase();
  if (isSwatchFill(raw)) return raw;
  return palette?.find((e) => e.id === raw)?.value.hex;
}

/** The picture an inline symbol draws from a resource (#1058): a bitmap's
 *  or an SVG's file and its proportions (square when an SVG declares no
 *  size); undefined for any other resource. */
function iconPicture(resource: Resource | undefined): NonNullable<InlineIcon['picture']> | undefined {
  if (resource?.kind === 'bitmap' && resource.bitmap?.fileId) {
    const { width, height } = resource.bitmap;
    return { fileId: resource.bitmap.fileId, format: resource.bitmap.format, svg: false, aspect: width > 0 && height > 0 ? width / height : 1 };
  }
  if (resource?.kind === 'svg' && resource.svg?.fileId) {
    const { width, height } = resource.svg;
    return { fileId: resource.svg.fileId, svg: true, aspect: width && height && width > 0 && height > 0 ? width / height : 1 };
  }
  return undefined;
}

/** Inline chips of a table cell, sized against the cell's font. */
export function resolveCellChips(spans: InlineSpan[], chips: ChipContext | undefined, set: CellFontSet): InlineSpan[] {
  return chips ? resolveChipSpans(spans, chips, fontSizePxOf(set.fontString)) : spans;
}

/** Build a label for an inline `:ref` to a resource, honouring its `style` and
 *  optional override `text`. Mirrors the caption-prefix conventions. */
export function resolveRefLabel(
  ref: NonNullable<InlineSpan['ref']>,
  resourceNumbering: ResourceNumberingMap,
  resourceTypes: ResourceType[],
  resources: Resource[],
  /** Between the label and the number (`captionStyle.labelNumberGap`); a
   *  type's own caption style may set another. */
  labelNumberGap: string = NBSP,
): string {
  if (ref.text !== undefined && ref.text.length > 0) return ref.text;
  const entry = resourceNumbering[ref.resourceId];
  const number = entry?.number ?? '?';
  if (ref.style === 'number') return number;
  const resource = resources.find((r) => r.id === ref.resourceId);
  // A numbered comic strip is no resource: its entry carries its type.
  const typeId = resource?.typeId ?? entry?.typeId;
  const type = typeId !== undefined ? resourceTypes.find((t) => t.id === typeId) : undefined;
  const gap = typeof type?.captionStyle?.labelNumberGap === 'string' ? type.captionStyle.labelNumberGap : labelNumberGap;
  if (ref.style === 'full') {
    return labelWithNumber(applyRefCase(type?.name ?? type?.shortLabel ?? '', ref.case), number, gap);
  }
  // default: short label + number (e.g. "Fig. 1.7")
  return labelWithNumber(applyRefCase(type?.shortLabel ?? type?.name ?? '', ref.case), number, gap);
}

/** "Fig. 1.7": a type's label and a number, glued by a no-break space (or
 *  the caption style's `labelNumberGap`: 图1-1). A type whose
 *  `numberingTemplate` is empty has no number, and its label stands alone
 *  (EF-149). */
function labelWithNumber(label: string, number: string, gap: string = NBSP): string {
  if (!label) return number;
  return number ? `${label}${gap}${number}` : label;
}

/** The label that opens a caption: "Figure 1.7. " — or, for a type
 *  numbered with an empty template, "Figure. ". Without a number, spaces at
 *  the prefix's end are dropped, and a prefix that already ends in a stop
 *  (`.`, `:`, `!`, `?`, `…` or a full-width form, as in "Pl.") takes no
 *  second one. Empty without a prefix. With a number, the caption style's
 *  `labelNumberGap` and `labelSeparator` stand around it ("图1-1　"). */
const CAPTION_STOP_RE = /[.:!?…。．：！？]$/;
export function captionLabelText(captionPrefix: string, number: string, cs?: Pick<ResolvedCaptionStyleConfig, 'labelNumberGap' | 'labelSeparator'>): string {
  if (captionPrefix.length === 0) return '';
  if (number) return `${captionPrefix}${cs?.labelNumberGap ?? NBSP}${number}${cs?.labelSeparator ?? '. '}`;
  const label = captionPrefix.trimEnd();
  if (label.length === 0) return '';
  return CAPTION_STOP_RE.test(label) ? `${label} ` : `${label}. `;
}

/** Apply a `:ref{case=…}` transform to the label part of a computed
 *  reference (`Fig.` / `Figure`). The number is never touched — the caller
 *  joins it afterwards — and `text=` overrides bypass this entirely. */
function applyRefCase(label: string, refCase: RefCase | undefined): string {
  if (refCase === undefined || label.length === 0) return label;
  switch (refCase) {
    case 'lower':
      return label.toLocaleLowerCase();
    case 'upper':
      return label.toLocaleUpperCase();
    case 'capitalize': {
      const first = [...label][0]!;
      return first.toLocaleUpperCase() + label.slice(first.length);
    }
  }
}

/** Anchor targets and the words a cross-reference prints, threaded into
 *  {@link resolveRefSpans} (#262). */
export interface AnchorRefContext {
  targets: AnchorTargets;
  strings: CrossRefStrings;
}

/** Resolve inline `:ref` spans to their computed label, keeping the `ref`
 *  metadata so the rich-text measurer treats each label as one atomic,
 *  non-breaking token and tags the produced segment with `refResourceId`.
 *  A reference whose id names no resource but an anchor (a heading's
 *  `{#id}`, an inline anchor, a container) prints the anchor's label and is
 *  flagged `ref.anchor` (#262); a pandoc-crossref prefix (`fig:map`) may be
 *  left off the identifier it names. */
export function resolveRefSpans(
  spans: InlineSpan[],
  resourceNumbering: ResourceNumberingMap,
  resourceTypes: ResourceType[],
  resources: Resource[],
  refStyle?: {
    bold: boolean;
    italic: boolean;
    labelNumberGap?: string;
    anchors?: AnchorRefContext;
    /** `crossRefs.breakLabels` (#702): a label of words with a space
     *  between two of them is marked `ref.breakable`, and a line may break
     *  there (`refLabelPieces`). */
    breakLabels?: boolean;
  },
): InlineSpan[] {
  if (!spans.some((s) => s.ref)) return spans;
  const isResource = (id: string): boolean => resourceNumbering[id] !== undefined || resources.some((r) => r.id === id);
  return spans.map((span) => {
    if (!span.ref) return span;
    let ref = span.ref;
    let label: { text: string; words: boolean } | undefined;
    if (!isResource(ref.resourceId)) {
      const target = findAnchorTarget(refStyle?.anchors?.targets, ref.resourceId);
      const bare = unprefixedId(ref.resourceId);
      if (target && refStyle?.anchors) {
        ref = { ...ref, resourceId: target.id, anchor: true, ...(target.pageIndex !== undefined ? { pageIndex: target.pageIndex } : {}) };
        label = anchorRefLabel(ref, target, refStyle.anchors.strings);
      } else if (bare !== undefined && isResource(bare)) {
        ref = { ...ref, resourceId: bare };
      }
    }
    // A reference to a resource is words only under a `text` override: its
    // own label carries a number ("Fig. 1.7").
    label ??= {
      text: resolveRefLabel(ref, resourceNumbering, resourceTypes, resources, refStyle?.labelNumberGap),
      words: ref.text !== undefined && ref.text.length > 0,
    };
    // Spans resolved twice (a block measured again) are marked afresh.
    if (ref.breakable) {
      ref = { ...ref };
      delete ref.breakable;
    }
    // Words only: a number keeps to the word before it (`Fig. 1a`), so a
    // label of a word and a number has no break either.
    if (label.words && refStyle?.breakLabels === true && refLabelPieces(label.text)) ref = { ...ref, breakable: true };
    return {
      ...span,
      ref,
      text: label.text,
      // Reference labels keep the emphasis of the run they sit in, and the
      // reference style adds its own on top where it sets it (#531), so the
      // measurer selects the matching font; colour is applied by renderers
      // via `refResourceId`.
      bold: span.bold || (refStyle?.bold ?? false),
      italic: span.italic || (refStyle?.italic ?? false),
    };
  });
}
