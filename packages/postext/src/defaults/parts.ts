import type {
  HeadingBreakParity,
  PartsConfig,
  ResolvedBodyTextConfig,
  ResolvedDesignSlot,
  ResolvedOrderedListsConfig,
  ResolvedPageConfig,
  ResolvedPartsConfig,
  ResolvedUnorderedListsConfig,
} from '../types';
import { resolveDesignSlot, stripDesignSlotDefaults } from './headerFooter';

/** Static defaults of the `parts` section. Fields that inherit from another
 *  section (`margins` from the page, `bodyStyle.*` from the body text and
 *  the list configs) are resolved at resolve time. */
export const DEFAULT_PARTS_CONFIG = {
  breakBefore: { parity: 'odd' as HeadingBreakParity },
  breakAfter: { enabled: true, parity: 'any' as HeadingBreakParity },
  design: { elements: [] } as ResolvedDesignSlot,
};

export function resolvePartsConfig(
  partial: PartsConfig | undefined,
  page: ResolvedPageConfig,
  bodyText: ResolvedBodyTextConfig,
  unorderedLists: ResolvedUnorderedListsConfig,
  orderedLists: ResolvedOrderedListsConfig,
): ResolvedPartsConfig {
  const d = DEFAULT_PARTS_CONFIG;
  const pm = page.margins;
  return {
    breakBefore: { parity: partial?.breakBefore?.parity ?? d.breakBefore.parity },
    breakAfter: {
      enabled: partial?.breakAfter?.enabled ?? d.breakAfter.enabled,
      parity: partial?.breakAfter?.parity ?? d.breakAfter.parity,
    },
    margins: {
      top: partial?.margins?.top ?? pm.top,
      bottom: partial?.margins?.bottom ?? pm.bottom,
      left: partial?.margins?.left ?? pm.left,
      right: partial?.margins?.right ?? pm.right,
      mirror: partial?.margins?.mirror ?? pm.mirror,
    },
    design: partial?.design ? resolveDesignSlot(partial.design, 'header') : { elements: [] },
    bodyStyle: {
      fontFamily: partial?.bodyStyle?.fontFamily ?? bodyText.fontFamily,
      fontSize: partial?.bodyStyle?.fontSize ?? bodyText.fontSize,
      lineHeight: partial?.bodyStyle?.lineHeight ?? bodyText.lineHeight,
      color: partial?.bodyStyle?.color ?? bodyText.color,
      textAlign: partial?.bodyStyle?.textAlign ?? bodyText.textAlign,
      bulletColor: partial?.bodyStyle?.bulletColor ?? unorderedLists.color,
      numberColor: partial?.bodyStyle?.numberColor ?? orderedLists.color,
    },
  };
}

function stripObject<T extends object>(obj: T): T | undefined {
  return Object.keys(obj).length > 0 ? obj : undefined;
}

/** Drop every field equal to its static default. Inherited fields
 *  (`margins.*`, `bodyStyle.*`) are kept whenever set, since their
 *  effective default depends on other sections. Returns `undefined` when
 *  nothing remains. */
export function stripPartsDefaults(parts: PartsConfig | undefined): PartsConfig | undefined {
  if (!parts) return undefined;
  const d = DEFAULT_PARTS_CONFIG;
  const r: PartsConfig = {};
  if (parts.breakBefore?.parity !== undefined && parts.breakBefore.parity !== d.breakBefore.parity) {
    r.breakBefore = { parity: parts.breakBefore.parity };
  }
  if (parts.breakAfter) {
    const ba: PartsConfig['breakAfter'] = {};
    if (parts.breakAfter.enabled !== undefined && parts.breakAfter.enabled !== d.breakAfter.enabled) {
      ba.enabled = parts.breakAfter.enabled;
    }
    if (parts.breakAfter.parity !== undefined && parts.breakAfter.parity !== d.breakAfter.parity) {
      ba.parity = parts.breakAfter.parity;
    }
    const kept = stripObject(ba);
    if (kept) r.breakAfter = kept;
  }
  if (parts.margins) {
    const m: PartsConfig['margins'] = {};
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      const v = parts.margins[side];
      if (v !== undefined) m[side] = v;
    }
    if (parts.margins.mirror !== undefined) m.mirror = parts.margins.mirror;
    const kept = stripObject(m);
    if (kept) r.margins = kept;
  }
  if (parts.design) {
    const slot = stripDesignSlotDefaults(parts.design, 'header');
    if (slot && slot.elements && slot.elements.length > 0) r.design = slot;
  }
  if (parts.bodyStyle) {
    const b: PartsConfig['bodyStyle'] = {};
    if (parts.bodyStyle.fontFamily !== undefined) b.fontFamily = parts.bodyStyle.fontFamily;
    if (parts.bodyStyle.fontSize !== undefined) b.fontSize = parts.bodyStyle.fontSize;
    if (parts.bodyStyle.lineHeight !== undefined) b.lineHeight = parts.bodyStyle.lineHeight;
    if (parts.bodyStyle.color !== undefined) b.color = parts.bodyStyle.color;
    if (parts.bodyStyle.textAlign !== undefined) b.textAlign = parts.bodyStyle.textAlign;
    if (parts.bodyStyle.bulletColor !== undefined) b.bulletColor = parts.bodyStyle.bulletColor;
    if (parts.bodyStyle.numberColor !== undefined) b.numberColor = parts.bodyStyle.numberColor;
    const kept = stripObject(b);
    if (kept) r.bodyStyle = kept;
  }
  return stripObject(r);
}
