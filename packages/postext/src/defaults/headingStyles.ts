import type {
  HeadingStyleConfig,
  ResolvedBodyTextConfig,
  ResolvedHeadingStyleConfig,
  ResolvedHeadingStyleOverrides,
  ResolvedLayoutConfig,
  ResolvedOrderedListsConfig,
  ResolvedPageConfig,
  ResolvedUnorderedListsConfig,
} from '../types';
import { resolveDesignSlot, stripDesignSlotDefaults } from './headerFooter';
import { resolveLayoutConfig } from './layout';
import { resolveHeadingLevelOverrides } from './headings';

/** No heading styles ship by default — a document declares its own. */
export const DEFAULT_HEADING_STYLES: HeadingStyleConfig[] = [];

function resolveHeadingStyleConfig(
  partial: HeadingStyleConfig,
  page: ResolvedPageConfig,
  bodyText: ResolvedBodyTextConfig,
  unorderedLists: ResolvedUnorderedListsConfig,
  orderedLists: ResolvedOrderedListsConfig,
): ResolvedHeadingStyleConfig {
  const overrides: ResolvedHeadingStyleOverrides = resolveHeadingLevelOverrides(partial);
  const pm = page.margins;
  const out: ResolvedHeadingStyleConfig = {
    id: partial.id,
    name: partial.name ?? partial.id,
    numbered: partial.numbered ?? true,
    toc: partial.toc ?? true,
    overrides,
    palette: { ...(partial.palette ?? {}) },
  };
  if (partial.header) out.header = resolveDesignSlot(partial.header, 'header');
  if (partial.footer) out.footer = resolveDesignSlot(partial.footer, 'footer');
  if (partial.margins) {
    out.margins = {
      top: partial.margins.top ?? pm.top,
      bottom: partial.margins.bottom ?? pm.bottom,
      left: partial.margins.left ?? pm.left,
      right: partial.margins.right ?? pm.right,
      mirror: partial.margins.mirror ?? pm.mirror,
    };
  }
  if (partial.layout) out.layout = resolveLayoutConfig(partial.layout) as ResolvedLayoutConfig;
  if (partial.bodyStyle) {
    const b = partial.bodyStyle;
    out.bodyStyle = {
      fontFamily: b.fontFamily ?? bodyText.fontFamily,
      fontSize: b.fontSize ?? bodyText.fontSize,
      lineHeight: b.lineHeight ?? bodyText.lineHeight,
      color: b.color ?? bodyText.color,
      textAlign: b.textAlign ?? bodyText.textAlign,
      bulletColor: b.bulletColor ?? unorderedLists.color,
      numberColor: b.numberColor ?? orderedLists.color,
      ...(b.unorderedLists ? { unorderedLists: b.unorderedLists } : {}),
      ...(b.orderedLists ? { orderedLists: b.orderedLists } : {}),
    };
  }
  return out;
}

export function resolveHeadingStylesConfig(
  partial: HeadingStyleConfig[] | undefined,
  page: ResolvedPageConfig,
  bodyText: ResolvedBodyTextConfig,
  unorderedLists: ResolvedUnorderedListsConfig,
  orderedLists: ResolvedOrderedListsConfig,
): ResolvedHeadingStyleConfig[] {
  return (partial ?? DEFAULT_HEADING_STYLES).map((s) =>
    resolveHeadingStyleConfig(s, page, bodyText, unorderedLists, orderedLists));
}

/** Drop unset fields and the static defaults (`numbered: true`, `toc:
 *  true`, `name` equal to `id`, empty slots / palettes). Level overrides
 *  and the inherited section fields are kept whenever set. Returns
 *  `undefined` when no styles remain. */
export function stripHeadingStylesDefaults(
  styles: HeadingStyleConfig[] | undefined,
): HeadingStyleConfig[] | undefined {
  if (!styles || styles.length === 0) return undefined;
  return styles.map((s) => {
    const r: HeadingStyleConfig = { id: s.id };
    const out = r as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(s)) {
      if (v === undefined || k === 'id') continue;
      if (k === 'name' && v === s.id) continue;
      if (k === 'numbered' && v === true) continue;
      if (k === 'toc' && v === true) continue;
      if (k === 'header' || k === 'footer') {
        const slot = stripDesignSlotDefaults(v as HeadingStyleConfig['header'], k);
        if (slot && slot.elements && slot.elements.length > 0) out[k] = slot;
        continue;
      }
      if (k === 'palette' && Object.keys(v as object).length === 0) continue;
      if ((k === 'margins' || k === 'layout' || k === 'bodyStyle') && Object.keys(v as object).length === 0) continue;
      out[k] = v;
    }
    return r;
  });
}
