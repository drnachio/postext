import type {
  HeadingStyleConfig,
  ResolvedBodyTextConfig,
  ResolvedHeadingStyleConfig,
  ResolvedHeadingStyleOverrides,
  ResolvedLayoutConfig,
  ResolvedOrderedListsConfig,
  ResolvedPageConfig,
  ResolvedUnorderedListsConfig,
} from '../../types.js';
import { migrateDesignSlot, resolveDesignSlot } from './headerFooter.js';
import { resolveLayoutConfig } from '../layout.js';
import { resolveHeadingLevelOverrides } from './headings.js';
import { startEndAsLeftRight } from '../shared.js';

/** No heading styles ship by default — a document declares its own. */
export const DEFAULT_HEADING_STYLES: HeadingStyleConfig[] = [];

function resolveHeadingStyleConfig(
  partial: HeadingStyleConfig,
  page: ResolvedPageConfig,
  bodyText: ResolvedBodyTextConfig,
  unorderedLists: ResolvedUnorderedListsConfig,
  orderedLists: ResolvedOrderedListsConfig,
  docLayout: ResolvedLayoutConfig | undefined,
): ResolvedHeadingStyleConfig {
  const overrides: ResolvedHeadingStyleOverrides = resolveHeadingLevelOverrides(partial);
  const pm = page.margins;
  const out: ResolvedHeadingStyleConfig = {
    id: partial.id,
    name: partial.name ?? partial.id,
    numbered: partial.numbered ?? true,
    toc: partial.toc ?? true,
    runningChapter: partial.runningChapter ?? true,
    sectionEnd: partial.sectionEnd === 'heading' ? 'heading' : 'level',
    overrides,
    palette: { ...(partial.palette ?? {}) },
  };
  if (partial.breakBefore) {
    const { enabled, parity } = partial.breakBefore;
    out.breakBefore = { ...(enabled !== undefined ? { enabled } : {}), ...(parity !== undefined ? { parity } : {}) };
  }
  if (partial.numberingTemplate !== undefined) out.numberingTemplate = partial.numberingTemplate;
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
  if (partial.layout) {
    const layout = resolveLayoutConfig(partial.layout) as ResolvedLayoutConfig;
    // The section's column rule takes each field it leaves unset from the
    // document's, so a section that only changes its columns keeps the
    // document's rule (EF-112).
    const own = partial.layout.columnRule;
    out.layout = docLayout
      ? {
          ...layout,
          // The document's column count, unless the section sets its own.
          columnCount: partial.layout.columnCount ?? docLayout.columnCount,
          // The document's writing mode, unless the section sets its own.
          writingMode: partial.layout.writingMode === 'vertical-rl' || partial.layout.writingMode === 'horizontal-tb'
            ? partial.layout.writingMode
            : docLayout.writingMode,
          columnRule: {
            enabled: own?.enabled ?? docLayout.columnRule.enabled,
            color: own?.color ?? docLayout.columnRule.color,
            lineWidth: own?.lineWidth ?? docLayout.columnRule.lineWidth,
          },
        }
      : layout;
  }
  if (partial.bodyStyle) {
    const b = partial.bodyStyle;
    out.bodyStyle = {
      fontFamily: b.fontFamily ?? bodyText.fontFamily,
      fontSize: b.fontSize ?? bodyText.fontSize,
      lineHeight: b.lineHeight ?? bodyText.lineHeight,
      color: b.color ?? bodyText.color,
      textAlign: startEndAsLeftRight(b.textAlign ?? bodyText.textAlign),
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
  /** The document's layout: a style's `layout.columnRule` takes the fields
   *  it leaves unset from it. Without it they take the static defaults. */
  layout?: ResolvedLayoutConfig,
): ResolvedHeadingStyleConfig[] {
  return (partial ?? DEFAULT_HEADING_STYLES).map((s) =>
    resolveHeadingStyleConfig(s, page, bodyText, unorderedLists, orderedLists, layout));
}

/** Drop unset fields and the static defaults (`numbered: true`, `toc:
 *  true`, `runningChapter: true`, `sectionEnd: 'level'`, `name` equal to `id`, an empty
 *  `palette`). Everything else a style sets is kept, since a style's
 *  default is what it inherits and not a value of its own (#694): level
 *  overrides, and the section fields even when they are empty. An empty
 *  `header` or `footer` silences the document's running head or folio on
 *  the style's pages (a cover, an opener), one that restates the built-in
 *  slot replaces the document's own, and `margins: {}`, `layout: {}` and
 *  `bodyStyle: {}` resolve to a section of their own. A slot in the
 *  pre-placement shape is stored migrated. Returns `undefined` when no
 *  styles remain. */
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
      if (k === 'runningChapter' && v === true) continue;
      if (k === 'sectionEnd' && v === 'level') continue;
      if (k === 'header' || k === 'footer') {
        out[k] = migrateDesignSlot(v as HeadingStyleConfig['header'], k) ?? v;
        continue;
      }
      if (k === 'palette' && Object.keys(v as object).length === 0) continue;
      out[k] = v;
    }
    return r;
  });
}
