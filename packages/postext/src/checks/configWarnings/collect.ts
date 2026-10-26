// collectConfigWarnings, which runs every check below on a config, its
// options, and the page-template and label-style check (#1276: split out
// of configWarnings.ts).
import type { PostextConfig, Resource, DocumentMetadata } from '../../types.js';
import type { ConfigWarning } from '../../vdt.js';
import { dimensionToPx } from '../../units.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import { exerciseConfigWarnings } from '../../exercises/configWarnings.js';
import { validatePageTemplates } from '../../composed/validate.js';
import { collectChoiceWarnings, collectNumeralsWarnings } from './choices.js';
import { collectContentInConfigWarnings } from './contentInConfig.js';
import { collectCalloutStyleWarnings, collectLabelIconWarnings, collectDesignAnchorWarnings, collectDesignPathWarnings, collectDesignKeyWarnings, collectBoxShapeWarnings, collectConnectorWarnings, collectTextOverWarnings, collectFenceConditionWarnings } from './design.js';
import { collectUnknownKeyWarnings } from './unknownKeys.js';
import { collectValueWarnings, collectSideColumnWarnings, collectColumnCountWarnings, collectCjkGridWarnings } from './values.js';

/**
 * Walk a config for values the engine replaces or leaves out:
 * - an unknown numbering format (lists, page labels, resource counters —
 *   any of their spellings is fine, see `parseNumberFormat`) and a CSS font
 *   stack in a font-family field, in every nested partial config (heading
 *   styles, part list overrides, `htmlViewer.overrides`, design elements);
 * - the `sideColumnPercent` of a one-and-a-half layout that would leave one
 *   of the columns with no width (see `sideColumnPercentUsed`), and the
 *   column count of a `multiple` layout that is no whole number from 3 to
 *   8 — the document's, and every heading style's own `layout`;
 * - a character grid (`cjk.grid`) larger than the page leaves room for;
 * - a key the heading settings or a paragraph style do not have
 *   (`unknownConfigKey`: `headings`, its `balancing` and `levels`,
 *   `headingStyles`, `paragraphStyles`), a top-level key a config does not
 *   have, and a key a design element, its placement or a connector's end
 *   does not have (#1122);
 * - a setting with a value outside its choices (`unknownConfigValue`):
 *   `direction`, the Arabic body text words (`emphasis`, `tashkil`,
 *   `kashida`, `kashidaPatterns`), the composition rules, `toc.groups.head`,
 *   a heading's `numberPosition`, spread footnotes in a horizontal
 *   document, the comics words, `print.standard`, `outputProfile` and
 *   `renderingIntent`, the contrast check, the Canvas gaps
 *   (`canvasViewer`), the `checks.contentInConfig` limits (`maxWords`,
 *   `maxChars`), the line numbers, a resource type's `resetOn` and text
 *   wrap, the code style, tab stops and drop caps; line numbers or text
 *   wrap asked of a vertical document (`lineNumbersUnsupported`,
 *   `wrapUnsupported`);
 * - a `numerals` value that names no digit system (`unknownNumerals`);
 * - page templates and label styles (see `validatePageTemplates`), and a
 *   box style whose `extends` names no style or comes back to itself;
 * - the design texts that hold the book's content instead of placeholders
 *   (`contentInConfig`, #849, tuned by `checks.contentInConfig`);
 * - a design element's point along a side (`anchor.at`) or size edge
 *   (`size.width.edge`…) outside its choices (`unknownConfigValue`, #1055);
 * - a path element's keys, path data, `viewBox` and
 *   `preserveAspectRatio` (#1060);
 * - box shapes (#1059): corner and side keys a box does not have, a label
 *   tab's `position` outside its choices, a joined tab with an `offset`;
 * - a design element's `when` / `unless` that names no attribute, or that
 *   a heading, part or box design would ignore (#1087);
 * - the exercise styles and settings (#1226): keys they do not have, words
 *   outside their choices, numbering styles the engine does not know.
 * Pure.
 */
export function collectConfigWarnings(config: PostextConfig | undefined, options: ConfigWarningOptions = {}): ConfigWarning[] {
  if (!config) return [];
  return [
    ...collectValueWarnings(config), ...collectSideColumnWarnings(config), ...collectColumnCountWarnings(config), ...collectUnknownKeyWarnings(config),
    ...collectCjkGridWarnings(config), ...collectChoiceWarnings(config), ...collectNumeralsWarnings(config),
    ...collectPageTemplateWarnings(config, options), ...collectCalloutStyleWarnings(config), ...collectLabelIconWarnings(config),
    ...collectContentInConfigWarnings(config, options),
    ...collectDesignAnchorWarnings(config),
    ...collectDesignPathWarnings(config), ...collectDesignKeyWarnings(config), ...collectBoxShapeWarnings(config),
    ...collectConnectorWarnings(config), ...collectTextOverWarnings(config), ...collectFenceConditionWarnings(config),
    ...exerciseConfigWarnings(config),
  ];
}

/** What else the config checks may read. */
export interface ConfigWarningOptions {
  /** The book's resources: an anchor's label `style` is checked against
   *  `labelStyles` (`labelStyleUnknown`). */
  resources?: readonly Resource[];
  /** The document's metadata (its front matter): its `title`, `subtitle`,
   *  `author` and `publisher` are allowed in a design text as if listed in
   *  `checks.contentInConfig.allow`, since a running head often repeats
   *  them. */
  metadata?: DocumentMetadata;
}

/** Page templates and label styles (#853): see `validatePageTemplates`.
 *  Lengths in different units are compared at the page's dpi, an em at
 *  the body text's size. */
function collectPageTemplateWarnings(config: PostextConfig, options: ConfigWarningOptions): ConfigWarning[] {
  const overrides = config.htmlViewer?.overrides;
  const any = config.pageTemplates !== undefined || config.labelStyles !== undefined
    || overrides?.pageTemplates !== undefined || overrides?.labelStyles !== undefined
    || config.frameLooks !== undefined || overrides?.frameLooks !== undefined
    || (options.resources ?? []).some((r) => r.anchors?.some((a) => a.style !== undefined || a.labelAt !== undefined || a.leader !== undefined));
  if (!any) return [];
  const resolved = resolveAllConfig(config);
  const dpi = resolved.page.dpi;
  const baseFontSizePx = dimensionToPx(resolved.bodyText.fontSize, dpi, 16);
  return validatePageTemplates(config, { resources: options.resources, dpi, baseFontSizePx });
}
