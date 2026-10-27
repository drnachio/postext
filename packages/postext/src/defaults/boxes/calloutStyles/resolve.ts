// Resolving one box style and the whole calloutStyles list against the body
// text and headings (#1278: split out of calloutStyles.ts).
import { floatColumnCount } from '../../shared.js';
import type { CalloutStyleConfig, ResolvedBodyTextConfig, ResolvedHeadingsConfig, ResolvedUnorderedListsConfig, ResolvedCalloutStyleConfig, CalloutDesignConfig, ResolvedCalloutDesignConfig, CalloutNumberingConfig, ResolvedCalloutNumberingConfig } from '../../../types.js';
import { defaultTableContinuationStrings } from '../../resources/tableStyle.js';
import { presentTag } from '../../../hyphenation/locale.js';
import { resolveDesignSlot } from '../../structure/headerFooter.js';
import { inheritCalloutStyles } from './inherit.js';
import { DEFAULT_CALLOUT_STYLE_STATIC, resolveBorder, shapeFields, iconTint, labelIconKind, labelIconScale, PT0, DEFAULT_CALLOUT_STYLES } from './statics.js';

function resolveCalloutStyleConfig(
  partial: CalloutStyleConfig,
  bodyText: ResolvedBodyTextConfig,
  headings: ResolvedHeadingsConfig,
  unorderedLists: ResolvedUnorderedListsConfig,
  locale: string | undefined,
): ResolvedCalloutStyleConfig {
  const d = DEFAULT_CALLOUT_STYLE_STATIC;
  // Continuation strings follow the document language, as a table's do
  // (a blank `locale` is unset).
  const strings = defaultTableContinuationStrings(presentTag(locale) ?? bodyText.hyphenation.tag ?? bodyText.hyphenation.locale);
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    title: partial.title ?? d.title,
    span: partial.span ?? d.span,
    columns: floatColumnCount(partial.columns),
    placement: partial.placement ?? d.placement,
    // Any other value reads as the default.
    sideAtColumnEnd: partial.sideAtColumnEnd === 'after' ? 'after' : d.sideAtColumnEnd,
    fixed: {
      anchor: partial.fixed?.anchor ?? d.fixed.anchor,
      offset: {
        x: partial.fixed?.offset?.x ?? d.fixed.offset.x,
        y: partial.fixed?.offset?.y ?? d.fixed.offset.y,
      },
    },
    floatBarrier: partial.floatBarrier ?? d.floatBarrier,
    width: partial.width ?? d.width,
    backgroundEnabled: partial.backgroundEnabled ?? d.backgroundEnabled,
    background: partial.background ?? d.background,
    border: resolveBorder(partial.border),
    borderRadius: partial.borderRadius ?? d.borderRadius,
    padding: {
      top: partial.padding?.top ?? d.padding.top,
      right: partial.padding?.right ?? d.padding.right,
      bottom: partial.padding?.bottom ?? d.padding.bottom,
      left: partial.padding?.left ?? d.padding.left,
    },
    stripe: {
      enabled: partial.stripe?.enabled ?? d.stripe.enabled,
      side: partial.stripe?.side ?? d.stripe.side,
      width: partial.stripe?.width ?? d.stripe.width,
      color: partial.stripe?.color ?? d.stripe.color,
    },
    icon: {
      kind: partial.icon?.kind ?? d.icon.kind,
      glyph: partial.icon?.glyph ?? d.icon.glyph,
      resourceId: partial.icon?.resourceId ?? d.icon.resourceId,
      fontFamily: partial.icon?.fontFamily ?? headings.fontFamily,
      fontWeight: partial.icon?.fontWeight ?? d.icon.fontWeight,
      size: partial.icon?.size ?? d.icon.size,
      color: partial.icon?.color ?? d.icon.color,
      align: partial.icon?.align ?? d.icon.align,
      position: partial.icon?.position ?? d.icon.position,
      cornerSide: partial.icon?.cornerSide ?? d.icon.cornerSide,
      ...(partial.icon?.width ? { width: partial.icon.width } : {}),
      ...shapeFields(partial.icon, partial.icon?.kind ?? d.icon.kind),
      ...(iconTint(partial.icon?.tint) ? { tint: iconTint(partial.icon?.tint)! } : {}),
    },
    ...(partial.label
      ? {
          label: {
            fontFamily: partial.label.fontFamily ?? headings.fontFamily,
            fontSize: partial.label.fontSize ?? bodyText.fontSize,
            fontWeight: partial.label.fontWeight ?? d.label.fontWeight,
            color: partial.label.color ?? d.label.color,
            background: partial.label.background ?? d.label.background,
            position: partial.label.position ?? d.label.position,
            height: partial.label.height ?? d.label.height,
            paddingX: partial.label.paddingX ?? d.label.paddingX,
            offset: partial.label.offset ?? d.label.offset,
            inset: partial.label.inset ?? d.label.inset,
            icon: {
              kind: labelIconKind(partial.label.icon),
              resourceId: partial.label.icon?.resourceId ?? d.label.icon.resourceId,
              width: partial.label.icon?.width ?? d.label.icon.width,
              gap: partial.label.icon?.gap ?? d.label.icon.gap,
              placement: partial.label.icon?.placement === 'inside' ? 'inside' : d.label.icon.placement,
              tint: iconTint(partial.label.icon?.tint) ?? d.label.icon.tint,
              ...shapeFields(partial.label.icon, labelIconKind(partial.label.icon)),
              // The glyph (#1054): in the label's face and weight unless
              // set, its colour the label's when the tab is laid out.
              glyph: typeof partial.label.icon?.glyph === 'string' ? partial.label.icon.glyph : d.label.icon.glyph,
              fontFamily: partial.label.icon?.fontFamily ?? partial.label.fontFamily ?? headings.fontFamily,
              fontWeight: partial.label.icon?.fontWeight ?? partial.label.fontWeight ?? d.label.fontWeight,
              scale: labelIconScale(partial.label.icon?.scale),
              ...(partial.label.icon?.color ? { color: partial.label.icon.color } : {}),
            },
            rule: {
              enabled: partial.label.rule?.enabled ?? d.label.rule.enabled,
              color: partial.label.rule?.color ?? d.label.rule.color,
              width: partial.label.rule?.width ?? d.label.rule.width,
            },
            joined: partial.label.joined === true,
            ...(partial.label.fillet ? { fillet: partial.label.fillet } : {}),
            ...(partial.label.borderRadius !== undefined ? { borderRadius: partial.label.borderRadius } : {}),
            ...(partial.label.ownBackground === true ? { ownBackground: true as const } : {}),
          },
        }
      : {}),
    columnGap: partial.columnGap ?? d.columnGap,
    marker: {
      kind: partial.marker?.kind ?? d.marker.kind,
      glyph: partial.marker?.glyph ?? d.marker.glyph,
      resourceId: partial.marker?.resourceId ?? d.marker.resourceId,
      fontFamily: partial.marker?.fontFamily ?? headings.fontFamily,
      fontWeight: partial.marker?.fontWeight ?? d.marker.fontWeight,
      size: partial.marker?.size ?? d.marker.size,
      color: partial.marker?.color ?? d.marker.color,
      align: partial.marker?.align ?? d.marker.align,
      gap: partial.marker?.gap ?? d.marker.gap,
      rule: {
        enabled: partial.marker?.rule?.enabled ?? d.marker.rule.enabled,
        color: partial.marker?.rule?.color ?? d.marker.rule.color,
        width: partial.marker?.rule?.width ?? d.marker.rule.width,
        length: partial.marker?.rule?.length ?? d.marker.rule.length,
      },
      ...shapeFields(partial.marker, partial.marker?.kind ?? d.marker.kind),
      ...(iconTint(partial.marker?.tint) ? { tint: iconTint(partial.marker?.tint)! } : {}),
    },
    titleStyle: {
      fontFamily: partial.titleStyle?.fontFamily ?? headings.fontFamily,
      fontSize: partial.titleStyle?.fontSize ?? bodyText.fontSize,
      fontWeight: partial.titleStyle?.fontWeight ?? d.titleStyle.fontWeight,
      italic: partial.titleStyle?.italic ?? d.titleStyle.italic,
      color: partial.titleStyle?.color ?? d.titleStyle.color,
      textTransform: partial.titleStyle?.textTransform ?? d.titleStyle.textTransform,
      gap: partial.titleStyle?.gap ?? d.titleStyle.gap,
      letterSpacing: partial.titleStyle?.letterSpacing ?? PT0,
      indent: partial.titleStyle?.indent ?? PT0,
      lineHeight: partial.titleStyle?.lineHeight ?? d.titleStyle.lineHeight,
    },
    body: {
      fontFamily: partial.body?.fontFamily ?? bodyText.fontFamily,
      fontSize: partial.body?.fontSize ?? bodyText.fontSize,
      lineHeight: partial.body?.lineHeight ?? bodyText.lineHeight,
      color: partial.body?.color ?? bodyText.color,
      ...(partial.body?.boldColor ?? bodyText.boldColor ? { boldColor: partial.body?.boldColor ?? bodyText.boldColor } : {}),
      ...(partial.body?.italicColor ? { italicColor: partial.body.italicColor } : {}),
      fontWeight: partial.body?.fontWeight ?? bodyText.fontWeight,
      boldFontWeight: partial.body?.boldFontWeight ?? bodyText.boldFontWeight,
      italic: partial.body?.italic ?? false,
      smallCaps: partial.body?.smallCaps ?? false,
      // Absent unless set to something other than zero (#974).
      ...(partial.body?.letterSpacing && partial.body.letterSpacing.value !== 0 ? { letterSpacing: partial.body.letterSpacing } : {}),
      textAlign: partial.body?.textAlign === 'start' ? 'left' : partial.body?.textAlign ?? (bodyText.textAlign === 'justify' ? 'justify' : 'left'),
      hyphenation: partial.body?.hyphenation ?? bodyText.hyphenation.enabled,
      paragraphSpacing: partial.body?.paragraphSpacing ?? bodyText.paragraphSpacing,
      firstLineIndent: partial.body?.firstLineIndent ?? bodyText.firstLineIndent,
      // Absent unless set: the box takes the body's tab stops (#622).
      ...(Array.isArray(partial.body?.tabStops) ? { tabStops: partial.body.tabStops } : {}),
      ...(partial.body?.tabInterval ? { tabInterval: partial.body.tabInterval } : {}),
    },
    lists: {
      bulletChar: partial.lists?.bulletChar ?? unorderedLists.bulletChar,
      color: partial.lists?.color ?? unorderedLists.color,
      indent: partial.lists?.indent ?? unorderedLists.indent,
      gap: partial.lists?.gap ?? unorderedLists.gap,
      itemSpacing: partial.lists?.itemSpacing ?? unorderedLists.itemSpacing,
      ...(partial.lists?.bulletFontSize ? { bulletFontSize: partial.lists.bulletFontSize } : {}),
      ...(partial.lists?.bulletFontWeight !== undefined ? { bulletFontWeight: partial.lists.bulletFontWeight } : {}),
      ...(partial.lists?.bulletFontFamily ? { bulletFontFamily: partial.lists.bulletFontFamily } : {}),
      ...(partial.lists?.marginTop ? { marginTop: partial.lists.marginTop } : {}),
      ...(partial.lists?.marginBottom ? { marginBottom: partial.lists.marginBottom } : {}),
      // Set, not merely equal to the inherited value: the box's colour then
      // reaches its ordered-list numbers (EF-92).
      ...(partial.lists?.color ? { colorSet: true } : {}),
    },
    marginTop: partial.marginTop ?? d.marginTop,
    marginBottom: partial.marginBottom ?? d.marginBottom,
    snapToGrid: partial.snapToGrid ?? d.snapToGrid,
    keepTogether: partial.keepTogether ?? d.keepTogether,
    splitMinLines: Number.isInteger(partial.splitMinLines) && partial.splitMinLines! >= 1
      ? partial.splitMinLines!
      : d.splitMinLines,
    repeatTitle: partial.repeatTitle ?? d.repeatTitle,
    continuedSuffix: partial.continuedSuffix ?? strings.continuedSuffix,
    continuesMarkerEnabled: partial.continuesMarkerEnabled ?? d.continuesMarkerEnabled,
    continuesMarker: partial.continuesMarker ?? strings.continuesMarker,
    continuesMarkerAlign: partial.continuesMarkerAlign ?? d.continuesMarkerAlign,
    continuesMarkerItalic: partial.continuesMarkerItalic ?? d.continuesMarkerItalic,
    ...(partial.numbering ? { numbering: resolveCalloutNumbering(partial.numbering, partial.id) } : {}),
    endMark: partial.endMark ?? '',
    ...(partial.design ? { design: resolveCalloutDesign(partial.design) } : {}),
  };
}

/** A box style's design (#1014): on once set unless it says otherwise, its
 *  text elements wrapping as a heading design's do. */
function resolveCalloutDesign(raw: CalloutDesignConfig): ResolvedCalloutDesignConfig {
  return {
    enabled: raw.enabled ?? true,
    slot: resolveDesignSlot(raw.slot ?? { elements: [] }, 'box'),
    ...(raw.minHeight ? { minHeight: raw.minHeight } : {}),
    setsContent: raw.setsContent === true,
  };
}

/** A style's statement numbering (#530) with its defaults: the counter
 *  named after the style, `{n}` never reset, a bold run-in label ending in
 *  a full stop. */
function resolveCalloutNumbering(partial: CalloutNumberingConfig, styleId: string): ResolvedCalloutNumberingConfig {
  return {
    label: partial.label ?? '',
    counter: partial.counter === false ? '' : (partial.counter?.trim() || styleId),
    numberingTemplate: partial.numberingTemplate ?? '{n}',
    resetOn: partial.resetOn ?? 'never',
    counterFormat: partial.counterFormat ?? 'decimal',
    placement: partial.placement === 'title' ? 'title' : 'runIn',
    bold: partial.bold ?? true,
    italic: partial.italic ?? false,
    suffix: partial.suffix ?? '.',
  };
}

/** Resolve the callout styles. `locale` is the document language of the
 *  continuation strings (`continuedSuffix` / `continuesMarker`) when a
 *  style leaves them unset — `PostextConfig.locale`, else the hyphenation
 *  locale. A style's `extends` (#905) is merged in first. */
export function resolveCalloutStylesConfig(
  partial: CalloutStyleConfig[] | undefined,
  bodyText: ResolvedBodyTextConfig,
  headings: ResolvedHeadingsConfig,
  unorderedLists: ResolvedUnorderedListsConfig,
  locale?: string,
): ResolvedCalloutStyleConfig[] {
  return inheritCalloutStyles(partial ?? DEFAULT_CALLOUT_STYLES).map((s) =>
    resolveCalloutStyleConfig(s, bodyText, headings, unorderedLists, locale),
  );
}
