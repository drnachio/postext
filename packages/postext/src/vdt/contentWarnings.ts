// Content warnings: what the source names wrongly or the layout could not
// honour, one union member per kind (#1276: split out of vdt.ts).
import type { SourceWarning } from './contentWarnings/source.js';
import type { ComposedPageWarning } from './contentWarnings/composed.js';
import type { MarkupWarning } from './contentWarnings/markup.js';
import type { TextSettingWarning } from './contentWarnings/text.js';
import type { ComicWarning } from './contentWarnings/comic.js';
import type { LayoutWarning } from './contentWarnings/layout.js';

/** Where a content warning points: the source range of the construct in
 *  the markdown given to the build (frontmatter included), and the page it
 *  was placed on. Both are absent when the construct has no place in the
 *  text (a style id set on a resource that is never placed) or put nothing
 *  on a page (an embed of an unknown id). */
interface ContentWarningBase {
  sourceStart?: number;
  sourceEnd?: number;
  pageIndex?: number;
}

/** A reference the build could not resolve, or markup it did not
 *  recognise and set in a fallback: the output is complete but not what the
 *  source asked for. Computed from the source before layout (see
 *  `collectContentWarnings`); the build lists them in
 *  {@link VDTDocument.contentWarnings}. Narrow on `kind` — further kinds may
 *  be added in minor releases. */
export type ContentWarning = ContentWarningBase & (
  | SourceWarning
  | ComposedPageWarning
  | MarkupWarning
  | TextSettingWarning
  | ComicWarning
  | LayoutWarning
);
