/**
 * The words of the frame-style library (#873): the settings a merge
 * suggestion names, in the panel's own names for them, and the counts.
 */

import type { SandboxLabels } from '../../../../types/labels.js';
import type { MergeSuggestion, StyleKind } from '../../../../frameStyles/styleCompare.js';
import type { StyleUsage } from '../../../../frameStyles/styleUsage.js';

/** The panel's name for each top-level setting of a callout style. */
const GROUP_LABELS: Record<string, keyof SandboxLabels> = {
  padding: 'calloutStylePaddingGroup',
  border: 'calloutStyleBorderGroup',
  borderRadius: 'calloutStyleBorderRadius',
  background: 'calloutStyleBackground',
  backgroundEnabled: 'calloutStyleBackground',
  stripe: 'calloutStyleStripeGroup',
  icon: 'calloutStyleIconGroup',
  'label': 'calloutStyleLabelGroup',
  marker: 'calloutStyleMarkerGroup',
  // `title` is the text a box shows when it has none of its own.
  title: 'calloutStyleTitle',
  titleStyle: 'calloutStyleTitleGroup',
  body: 'calloutStyleBodyGroup',
  lists: 'calloutStyleListsGroup',
  columnGap: 'calloutStyleColumnGap',
  keepTogether: 'calloutStyleContinuationGroup',
  splitMinLines: 'calloutStyleContinuationGroup',
  repeatTitle: 'calloutStyleContinuationGroup',
  continuedSuffix: 'calloutStyleContinuationGroup',
  continuesMarkerEnabled: 'calloutStyleContinuationGroup',
  continuesMarker: 'calloutStyleContinuationGroup',
  continuesMarkerAlign: 'calloutStyleContinuationGroup',
  continuesMarkerItalic: 'calloutStyleContinuationGroup',
  numbering: 'frameStylesFieldNumbering',
  endMark: 'frameStylesFieldNumbering',
  placement: 'frameStylesFieldPosition',
  span: 'frameStylesFieldPosition',
  columns: 'frameStylesFieldPosition',
  sideAtColumnEnd: 'frameStylesFieldPosition',
  fixed: 'frameStylesFieldPosition',
  floatBarrier: 'frameStylesFieldPosition',
  width: 'frameStylesFieldPosition',
  marginTop: 'frameStylesFieldPosition',
  marginBottom: 'frameStylesFieldPosition',
  snapToGrid: 'frameStylesFieldPosition',
};

/** `a, b and c` in the panel's language. */
export function listText(items: readonly string[], and: string, separator = ', '): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(separator)}${and}${items[items.length - 1]}`;
}

/** The settings of `groups` (top-level keys), named as the panel names
 *  them, each once, in running text: lower-cased, except in German, whose
 *  nouns keep their capital. */
export function groupsText(groups: readonly string[], labels: SandboxLabels, uiLocale = 'en'): string {
  const lower = !uiLocale.toLowerCase().startsWith('de');
  const names = [...new Set(groups.map((g) => {
    const key = GROUP_LABELS[g];
    const name = key ? String(labels[key]) : g;
    return lower ? name.toLocaleLowerCase(uiLocale) : name;
  }))];
  return listText(names, labels.frameStylesAnd, labels.frameStylesListSeparator);
}

/** «These 3 styles differ only in padding: merge?» */
export function suggestionText(s: MergeSuggestion, labels: SandboxLabels, uiLocale?: string): string {
  const count = String(s.merge.length + 1);
  if (s.groups.length === 0) return labels.frameStylesSuggestionSame.replace('__count__', count);
  return labels.frameStylesSuggestionOnly.replace('__count__', count).replace('__fields__', groupsText(s.groups, labels, uiLocale));
}

/** «The box and 6 variants: differ in fill and border» (#976). */
export function kindText(kind: StyleKind, name: string, labels: SandboxLabels, uiLocale?: string): string {
  const groups = [...new Set(kind.variants.flatMap((v) => v.groups))].sort();
  const fields = groupsText(groups, labels, uiLocale);
  const template = kind.variants.length === 1 ? labels.frameStylesKindOne : labels.frameStylesKindMany;
  return template.replace('__name__', name).replace('__count__', String(kind.variants.length)).replace('__fields__', fields);
}

function countText(n: number, one: string, many: string): string {
  return (n === 1 ? one : many).replace('__count__', String(n));
}

export function boxesText(n: number, labels: SandboxLabels): string {
  return countText(n, labels.frameStylesBoxesOne, labels.frameStylesBoxesMany);
}

export function framesText(n: number, labels: SandboxLabels): string {
  return countText(n, labels.frameStylesFramesOne, labels.frameStylesFramesMany);
}

export function pagesText(n: number, labels: SandboxLabels): string {
  return countText(n, labels.frameStylesPagesOne, labels.frameStylesPagesMany);
}

/** One line saying where a style is used. */
export function usageText(u: StyleUsage | undefined, labels: SandboxLabels): string {
  if (!u || (u.fenceCount === 0 && u.frames.length === 0)) return labels.frameStylesUnused;
  const parts: string[] = [];
  if (u.frames.length > 0) parts.push(framesText(u.frames.length, labels));
  if (u.pageCount > 0) parts.push(pagesText(u.pageCount, labels));
  if (u.fenceCount > 0) parts.push(boxesText(u.fenceCount, labels));
  return parts.join(' · ');
}
