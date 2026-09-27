import type { ColorValue, PostextConfig } from 'postext';
import type { SandboxLabels } from '../types';

// Every `ColorValue` of a configuration can link to a palette entry
// (`paletteId`) and follows it — design slots, callout labels, the
// reference colour… (the engine's palette pass reaches them all). The
// helpers below walk the whole configuration the same way, so deleting an
// entry finds and unlinks every colour tied to it.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isLinkedTo(value: unknown, paletteId: string): value is ColorValue {
  return isPlainObject(value) && typeof value.hex === 'string' && value.paletteId === paletteId;
}

/** Walk `node`, calling `visit` on every value linked to `paletteId` with its
 *  path (`header.elements[0].color`); `visit`'s result replaces it. The
 *  palette itself is not walked. Unchanged subtrees keep their identity. */
function mapLinkedColors<T>(
  node: T,
  paletteId: string,
  visit: (value: ColorValue, path: string) => ColorValue,
  path = '',
): T {
  if (isLinkedTo(node, paletteId)) return visit(node, path) as T;
  if (Array.isArray(node)) {
    let out: unknown[] | undefined;
    node.forEach((item, i) => {
      const next = mapLinkedColors(item, paletteId, visit, `${path}[${i}]`);
      if (next !== item) {
        out ??= node.slice();
        out[i] = next;
      }
    });
    return (out ?? node) as T;
  }
  if (!isPlainObject(node)) return node;
  let out: Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'colorPalette' || value === null || typeof value !== 'object') continue;
    const next = mapLinkedColors(value, paletteId, visit, path ? `${path}.${key}` : key);
    if (next !== value) {
      out ??= { ...node };
      out[key] = next;
    }
  }
  return (out ?? node) as T;
}

// ---------------------------------------------------------------------------
// Usage labels: what the panels call the setting a linked colour sits in
// ---------------------------------------------------------------------------

type Field = (l: SandboxLabels) => string;
type Fields = Readonly<Record<string, Field>>;

/** A usage label: the panel names from the section down to the field. */
const join = (...parts: string[]): string => parts.join(' › ');

/** What an item of a named list (a style, a resource type, a design
 *  element) is called in the panels: its name, else its id, else its
 *  position. */
function itemName(list: unknown, index: number): string {
  const item = Array.isArray(list) ? list[index] : undefined;
  if (isPlainObject(item)) {
    for (const key of ['name', 'id']) {
      const v = item[key];
      if (typeof v === 'string' && v.trim().length > 0) return v;
    }
  }
  return String(index + 1);
}

/** `H<level>` of the heading or contents level at `index`. */
function levelName(labels: SandboxLabels, list: unknown, index: number): string {
  const item = Array.isArray(list) ? list[index] : undefined;
  const level = isPlainObject(item) && typeof item.level === 'number' ? item.level : index + 1;
  return `${labels.headingLevel}${level}`;
}

/** The value at a dotted path (`headingStyles[0].header`) of `root`. */
function valueAt(root: unknown, path: string): unknown {
  let node = root;
  for (const key of path.split(/[.[\]]+/).filter((k) => k.length > 0)) {
    if (!isPlainObject(node) && !Array.isArray(node)) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/** A design element's colours, by the field its editor shows. */
const DESIGN_FIELDS: Fields = {
  color: (l) => l.headerFooterElementColor,
  'dropCap.color': (l) => l.headerFooterElementDropCapColor,
  'stroke.color': (l) => l.headerFooterElementStrokeColor,
  'style.backgroundColor': (l) => l.headerFooterElementBoxBackgroundColor,
  'style.borderColor': (l) => l.headerFooterElementBoxBorderColor,
  'box.backgroundColor': (l) => l.headerFooterElementBoxBackgroundColor,
  'box.borderColor': (l) => l.headerFooterElementBoxBorderColor,
};

/** The body-style colours of a part or a heading style (`bodyStyle.…`). */
const BODY_STYLE_FIELDS: Fields = {
  color: (l) => l.partsBodyColor,
  bulletColor: (l) => l.partsBodyBulletColor,
  numberColor: (l) => l.partsBodyNumberColor,
  'orderedLists.color': (l) => join(l.orderedLists, l.orderedListsColor),
  'orderedLists.separatorColor': (l) => join(l.orderedLists, l.orderedListsSeparatorColor),
  'unorderedLists.color': (l) => join(l.unorderedLists, l.unorderedListsColor),
  'unorderedLists.taskCompletedColor': (l) => join(l.unorderedLists, l.taskCompletedColor),
};

/** A table style's colours (`tableStyle` or an entry of `tableStyles`). */
const TABLE_FIELDS: Fields = {
  bodyColor: (l) => join(l.tableBodyGroup, l.colorLabel),
  bodyBackground: (l) => join(l.tableBodyGroup, l.backgroundColorLabel),
  bodyAlternateBackground: (l) => l.tableBodyAlternateColor,
  headerColor: (l) => join(l.tableHeaderGroup, l.colorLabel),
  headerBackground: (l) => join(l.tableHeaderGroup, l.backgroundColorLabel),
  borderColor: (l) => l.tableBorderColor,
};

/** A caption style's colours (`captionStyle` or a resource type's). */
const CAPTION_FIELDS: Fields = {
  labelColor: (l) => join(l.captionLabelGroup, l.colorLabel),
  color: (l) => join(l.captionDescriptionGroup, l.colorLabel),
  background: (l) => join(l.captionBarGroup, l.backgroundColorLabel),
  'note.color': (l) => join(l.captionNoteGroup, l.colorLabel),
};

const CALLOUT_FIELDS: Fields = {
  background: (l) => l.calloutStyleBackgroundColor,
  'border.color': (l) => l.calloutStyleBorderColor,
  'stripe.color': (l) => l.calloutStyleStripeColor,
  'icon.color': (l) => join(l.calloutStyleIconGroup, l.calloutStyleIconColor),
  'marker.color': (l) => join(l.calloutStyleMarkerGroup, l.calloutStyleIconColor),
  'marker.rule.color': (l) => join(l.calloutStyleMarkerGroup, l.calloutStyleMarkerRuleColor),
  'label.color': (l) => join(l.calloutStyleLabelGroup, l.calloutStyleLabelColor),
  'label.background': (l) => join(l.calloutStyleLabelGroup, l.calloutStyleLabelBackground),
  'label.rule.color': (l) => join(l.calloutStyleLabelGroup, l.calloutStyleLabelRuleColor),
  'titleStyle.color': (l) => l.calloutStyleTitleColor,
  'body.color': (l) => join(l.calloutStyleBodyGroup, l.colorLabel),
  'body.boldColor': (l) => join(l.calloutStyleBodyGroup, l.calloutStyleBodyBoldColor),
  'body.italicColor': (l) => join(l.calloutStyleBodyGroup, l.calloutStyleBodyItalicColor),
  'lists.color': (l) => join(l.calloutStyleListsGroup, l.colorLabel),
};

const CHIP_FIELDS: Fields = {
  color: (l) => join(l.chipStyleTextGroup, l.colorLabel),
  background: (l) => l.chipStyleBackgroundColor,
  borderColor: (l) => l.chipStyleBorderColor,
};

const PARAGRAPH_FIELDS: Fields = {
  color: (l) => l.colorLabel,
  boldColor: (l) => l.bodyBoldColor,
  italicColor: (l) => l.bodyItalicColor,
};

const TOC_ENTRY_FIELDS: Fields = {
  color: (l) => l.colorLabel,
  numberColor: (l) => l.tocEntryNumberColor,
};

/** `rest` looked up in `fields`, joined after `scope`; `undefined` (listed
 *  by its path) for a colour the panels do not show. */
function scoped(fields: Fields, labels: SandboxLabels, rest: string | undefined, ...scope: string[]): string | undefined {
  const field = rest !== undefined ? fields[rest] : undefined;
  return field ? join(...scope, field(labels)) : undefined;
}

type Describe = (l: SandboxLabels, m: RegExpExecArray, c: PostextConfig) => string | undefined;
const num = (m: RegExpExecArray, i: number): number => Number(m[i]);

/** The design slots the panels edit — the path of the slot, and what the
 *  slot is called there. Their elements are named by id. */
function designSlotName(slotPath: string, l: SandboxLabels, c: PostextConfig): string | undefined {
  if (slotPath === 'header') return l.header;
  if (slotPath === 'footer') return l.footer;
  if (slotPath === 'parts.design') return join(l.parts, l.partsDesign);
  if (slotPath === 'parts.versoDesign') return join(l.parts, l.partsVersoDesign);
  if (slotPath === 'toc.parts.design') return join(l.tocSection, l.tocParts);
  let m = /^headings\.levels\[(\d+)\]\.advancedDesign\.slot$/.exec(slotPath);
  if (m) return join(l.headings, levelName(l, c.headings?.levels, num(m, 1)), l.headingAdvancedDesign);
  m = /^headingStyles\[(\d+)\]\.(advancedDesign\.slot|header|footer)$/.exec(slotPath);
  if (m) {
    const part = m[2] === 'header' ? l.header : m[2] === 'footer' ? l.footer : l.headingAdvancedDesign;
    return join(l.headingStylesSection, itemName(c.headingStyles, num(m, 1)), part);
  }
  return undefined;
}

/** The settings a palette entry's colour is known by in the panels, by
 *  their path; any other linked colour is listed by its path. */
const LABELLED_PATHS: [RegExp, Describe][] = [
  [/^page\.backgroundColor$/, (l) => l.pageBackgroundColor],
  [/^page\.cutLines\.color$/, (l) => l.cutLinesColor],
  [/^page\.baselineGrid\.color$/, (l) => l.baselineGridColor],
  [/^layout\.columnRule\.color$/, (l) => l.columnRuleColor],
  [/^bodyText\.color$/, (l) => l.bodyColor],
  [/^bodyText\.boldColor$/, (l) => l.bodyBoldColor],
  [/^bodyText\.italicColor$/, (l) => l.bodyItalicColor],
  [/^bodyText\.referenceColor$/, (l) => l.bodyReferenceColor],
  [/^math\.color$/, (l) => join(l.mathSection, l.mathColor)],
  [/^headings\.color$/, (l) => l.headingsColor],
  [/^headings\.levels\[(\d+)\]\.color$/, (l, m, c) => join(l.headings, levelName(l, c.headings?.levels, num(m, 1)), l.headingColor)],
  [/^unorderedLists\.color$/, (l) => l.unorderedListsColor],
  [/^unorderedLists\.taskCompletedColor$/, (l) => l.taskCompletedColor],
  [/^unorderedLists\.levels\[(\d+)\]\.color$/, (l, m) => join(l.unorderedLists, `L${num(m, 1) + 1}`, l.unorderedListLevelColor)],
  [/^orderedLists\.color$/, (l) => l.orderedListsColor],
  [/^orderedLists\.separatorColor$/, (l) => l.orderedListsSeparatorColor],
  [/^orderedLists\.levels\[(\d+)\]\.color$/, (l, m) => join(l.orderedLists, `L${num(m, 1) + 1}`, l.orderedListLevelColor)],
  [/^orderedLists\.levels\[(\d+)\]\.separatorColor$/, (l, m) => join(l.orderedLists, `L${num(m, 1) + 1}`, l.orderedListsSeparatorColor)],
  [/^diagramStyle\.inkColor$/, (l) => l.diagramInkColor],
  [/^debug\.cursorSync\.color$/, (l) => l.debugCursorSyncColor],
  [/^debug\.selectionSync\.color$/, (l) => l.debugSelectionSyncColor],
  [/^debug\.looseLineHighlight\.color$/, (l) => l.debugLooseLinesColor],
  // Tables and captions.
  [/^tableStyle\.(.+)$/, (l, m) => scoped(TABLE_FIELDS, l, m[1], l.tableStyleSection)],
  [/^tableStyles\[(\d+)\]\.(.+)$/, (l, m, c) => scoped(TABLE_FIELDS, l, m[2], l.tableStylesSection, itemName(c.tableStyles, num(m, 1)))],
  [/^captionStyle\.(.+)$/, (l, m) => scoped(CAPTION_FIELDS, l, m[1], l.captionStyleSection)],
  [/^resourceTypes\[(\d+)\]\.captionStyle\.(.+)$/, (l, m, c) => scoped(CAPTION_FIELDS, l, m[2], l.resourceTypesSection, itemName(c.resourceTypes, num(m, 1)))],
  // Styles.
  [/^calloutStyles\[(\d+)\]\.(.+)$/, (l, m, c) => scoped(CALLOUT_FIELDS, l, m[2], l.calloutStylesSection, itemName(c.calloutStyles, num(m, 1)))],
  [/^chipStyles\[(\d+)\]\.(.+)$/, (l, m, c) => scoped(CHIP_FIELDS, l, m[2], l.chipStylesSection, itemName(c.chipStyles, num(m, 1)))],
  [/^paragraphStyles\[(\d+)\]\.(.+)$/, (l, m, c) => scoped(PARAGRAPH_FIELDS, l, m[2], l.paragraphStylesSection, itemName(c.paragraphStyles, num(m, 1)))],
  [/^headingStyles\[(\d+)\]\.color$/, (l, m, c) => join(l.headingStylesSection, itemName(c.headingStyles, num(m, 1)), l.headingColor)],
  [/^headingStyles\[(\d+)\]\.layout\.columnRule\.color$/, (l, m, c) => join(l.headingStylesSection, itemName(c.headingStyles, num(m, 1)), l.columnRuleColor)],
  [/^headingStyles\[(\d+)\]\.bodyStyle\.(.+)$/, (l, m, c) => scoped(BODY_STYLE_FIELDS, l, m[2], l.headingStylesSection, itemName(c.headingStyles, num(m, 1)), l.partsBodyStyle)],
  [/^parts\.bodyStyle\.(.+)$/, (l, m) => scoped(BODY_STYLE_FIELDS, l, m[1], l.parts, l.partsBodyStyle)],
  // Contents.
  [/^toc\.levels\[(\d+)\]\.(.+)$/, (l, m, c) => scoped(TOC_ENTRY_FIELDS, l, m[2], l.tocSection, levelName(l, c.toc?.levels, num(m, 1)))],
  [/^toc\.unnumbered\.(.+)$/, (l, m) => scoped(TOC_ENTRY_FIELDS, l, m[1], l.tocSection, l.tocUnnumbered)],
  [/^toc\.pageNumber\.color$/, (l) => join(l.tocSection, l.tocPageNumber, l.colorLabel)],
  [/^toc\.subtitle\.color$/, (l) => join(l.tocSection, l.tocSubtitle, l.colorLabel)],
  // Design elements: the slot, the element, the field.
  [/^(.+)\.elements\[(\d+)\]\.(.+)$/, (l, m, c) => {
    const slot = designSlotName(m[1]!, l, c);
    if (slot === undefined) return undefined;
    const elements = valueAt(c, `${m[1]}.elements`);
    return scoped(DESIGN_FIELDS, l, m[3], slot, itemName(elements, num(m, 2)));
  }],
];

function usageLabel(path: string, labels: SandboxLabels, config: PostextConfig): string {
  for (const [re, describe] of LABELLED_PATHS) {
    const m = re.exec(path);
    const label = m ? describe(labels, m, config) : undefined;
    if (label !== undefined) return label;
  }
  return path;
}

/** Where `config` uses the palette entry `paletteId`, in config order: the
 *  panel name of a setting that has one, else the colour's path. */
export function findPaletteUsages(
  config: PostextConfig,
  paletteId: string,
  labels: SandboxLabels,
): string[] {
  const usages: string[] = [];
  mapLinkedColors(config, paletteId, (value, path) => {
    usages.push(usageLabel(path, labels, config));
    return value;
  });
  return usages;
}

/** `config` with every colour linked to `paletteId` unlinked: a plain colour,
 *  frozen at the value the entry gives it (what the page shows), or at its
 *  stored value when the entry is gone. The palette is left as it is. */
export function unlinkPaletteRefs(config: PostextConfig, paletteId: string): PostextConfig {
  const entry = config.colorPalette?.find((e) => e.id === paletteId)?.value;
  return mapLinkedColors(config, paletteId, (value) => ({
    hex: entry?.hex ?? value.hex,
    model: entry?.model ?? value.model,
  }));
}
