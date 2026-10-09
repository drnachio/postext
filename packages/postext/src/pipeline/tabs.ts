/**
 * Tabs in body text (#622): what the measurer gets of a block's tabs.
 *
 * The parser keeps every tab as a span of its own (`InlineSpan.tab`). A
 * tab character is a tab only in a paragraph whose style sets tab stops
 * (`tabStops` or `tabInterval`: a paragraph style's, a callout body's, the
 * body's); in any other it is set back as the word space it always was, the
 * span merged with its neighbours, so a stored document lays out as it did.
 * `:tab` is a tab everywhere: without a stop to go to it is a word space at
 * the measurer. Vertical text sets every tab as a word space (and the build
 * says so, `tabInVerticalText`).
 */

import type { ContentBlock, InlineSpan } from '../parse';
import type { ResolvedConfig } from '../vdt';
import type { BlockStyle } from './styles';
import type { TabSettings } from '../measure/tabs';
import { resolveTabSettings, resolveTabStopPx } from '../defaults/tabStops';
import { resolvedLocale } from './config';

/** The keys a span set as plain text may carry and still merge with the
 *  span next to it. */
const PLAIN_KEYS = new Set(['text', 'bold', 'italic', 'links', 'smallCaps', 'script']);

function plainSpan(s: InlineSpan): boolean {
  for (const k of Object.keys(s)) if (!PLAIN_KEYS.has(k) && (s as unknown as Record<string, unknown>)[k] !== undefined) return false;
  return true;
}

function sameStyle(a: InlineSpan, b: InlineSpan): boolean {
  return a.bold === b.bold && a.italic === b.italic && !!a.smallCaps === !!b.smallCaps && a.script === b.script;
}

/** `spans` with the tabs `asSpace` picks set as word spaces, each merged
 *  with the plain spans of the same style on either side (the parser cut
 *  the text there only for the tab), so the spans are the ones the text had
 *  before tabs were read. Same text length. */
export function tabsAsWordSpaces(spans: readonly InlineSpan[], asSpace: (span: InlineSpan) => boolean): InlineSpan[] {
  const out: InlineSpan[] = [];
  // The last span pushed ends on a tab set as a space.
  let afterSpace = false;
  for (const span of spans) {
    const converted = !!span.tab && asSpace(span);
    let s = span;
    if (converted) {
      const { tab: _tab, ...rest } = span;
      void _tab;
      s = { ...rest, text: ' ' };
    }
    const last = out[out.length - 1];
    if ((converted || afterSpace) && last && plainSpan(last) && plainSpan(s) && sameStyle(last, s)) {
      out[out.length - 1] = joinSpans(last, s);
    } else {
      out.push(s);
    }
    afterSpace = converted;
  }
  return out;
}

function joinSpans(a: InlineSpan, b: InlineSpan): InlineSpan {
  const links: NonNullable<InlineSpan['links']> = [];
  for (const l of [...(a.links ?? []), ...(b.links ?? []).map((l) => ({ ...l, start: l.start + a.text.length, end: l.end + a.text.length }))]) {
    // A link the tab cut in two is one again, its space included.
    const prev = links[links.length - 1];
    if (prev && prev.href === l.href && l.start <= prev.end + 1) prev.end = Math.max(prev.end, l.end);
    else links.push({ ...l });
  }
  const joined: InlineSpan = { ...a, text: a.text + b.text };
  if (links.length > 0) joined.links = links;
  else delete joined.links;
  return joined;
}

/**
 * The block as the measurer sets its tabs, and the paragraph's tab stops
 * in px (undefined when it holds no tab, or nothing to go to). `vertical`:
 * the text is set down the page; `rich`: the block is measured by the
 * formatted-text breaker, the only one that sets tabs.
 */
export function prepareTabs(
  block: ContentBlock,
  style: BlockStyle,
  resolved: ResolvedConfig,
  options: { vertical: boolean; rich: boolean },
): { block: ContentBlock; tabs?: TabSettings } {
  if (!block.spans.some((s) => s.tab)) return { block };
  const hasStops = (style.tabStops?.length ?? 0) > 0 || style.tabInterval !== undefined;
  const all = options.vertical || !options.rich;
  const asSpace = (s: InlineSpan) => all || (s.tab!.literal === true && !hasStops);
  let spans = block.spans.some((s) => s.tab && asSpace(s)) ? tabsAsWordSpaces(block.spans, asSpace) : block.spans;
  if (!spans.some((s) => s.tab)) {
    return { block: { ...block, spans, text: spans.map((s) => s.text).join('') } };
  }
  const dpi = resolved.page.dpi;
  const locale = resolvedLocale(resolved);
  // A `:tab{at=…}` stop, resolved at the paragraph's size.
  spans = spans.map((s) => {
    if (!s.tab?.stop) return s;
    const px = resolveTabStopPx(s.tab.stop, dpi, style.fontSizePx, locale);
    return px ? { ...s, tab: { ...s.tab, px } } : s;
  });
  const tabs = hasStops ? resolveTabSettings(style.tabStops, style.tabInterval, dpi, style.fontSizePx, locale) : undefined;
  return { block: { ...block, spans, text: spans.map((s) => s.text).join('') }, ...(tabs ? { tabs } : {}) };
}
