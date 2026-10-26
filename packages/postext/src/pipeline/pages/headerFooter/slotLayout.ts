// layoutSlotToVdt: a design slot laid out as page blocks, with the source
// each text element maps back to, composed-page modules and decoration,
// and running heads as page furniture (#1276: split out of headerFooter.ts).
import type { PageRole, Resource, ResolvedDesignTextElement, ResolvedDesignSlot } from '../../../types.js';
import { type VDTDesignSlotKind, type VDTPage, type VDTDesignSlot, createBoundingBox, type VDTBlock } from '../../../vdt.js';
import { resolveDesignSlot } from '../../../defaults/structure/headerFooter.js';
import type { ResolvedPageTemplate } from '../../../composed/types.js';
import { expectedFurniture } from '../../../composed/furniture.js';
import { type DesignFrames, layoutDesignSlot, type ResolvedTextPrimitive } from '../../../design/layout.js';
import { type DesignPlaceholderContext, resolveDesignText } from '../../../design/placeholders.js';
import { plainDesignText } from '../../../design/richText.js';
import { primitiveToBlock } from './primitives.js';

/** Optional page-level inputs for `layoutSlotToVdt`. */
export interface SlotLayoutExtras {
  frames?: DesignFrames;
  /** The document's base direction and whether the slot is painted in the
   *  flow of a mirrored page (see `LayoutContext`). */
  direction?: 'ltr' | 'rtl';
  mirrored?: boolean;
  /** Start and end edges read the start on the right (`LayoutContext`). */
  startRight?: boolean;
  /** See `LayoutContext.arabicNumbers` (#665). */
  arabicNumbers?: boolean;
  pageRole?: PageRole;
  /** Resources by id, for `kind: 'image'` elements. */
  resourceById?: ReadonlyMap<string, Resource>;
  /** Source range of the text `{titleText}` renders; stamped on the text
   *  blocks whose element content mentions the placeholder. */
  titleSource?: { start: number; end: number; text?: string; sourceMap?: number[] };
  /** Source ranges of heading attribute values; a text element whose
   *  content is exactly `{attr.<key>}` maps back to that value. */
  attrSources?: Record<string, { start: number; end: number }>;
  attrs?: Record<string, string>;
  /** Source range of the heading line itself: what `{number}`,
   *  `{chapterNumber}` or `{chapterTitle}` elements map back to. */
  headingSource?: { start: number; end: number };
  /** Source ranges of the frontmatter field values (`{title}`, `{author}`,
   *  `{subtitle}`, `{publishDate}`) and the values themselves. */
  metadataSources?: Record<string, { start: number; end: number }>;
  metadata?: Record<string, unknown>;
  /** Where the slot is painted: a text block cut to fit is flagged with it
   *  (`VDTDesignTextBlock.truncated`, #628). Absent: nothing is flagged. */
  slot?: VDTDesignSlotKind;
  /** JSON pointer of the slot in the configuration (`/footer`,
   *  `/pageTemplates/0/decoration`): every block is stamped with its
   *  element's id and, with this, the element's pointer (`…/elements/<i>`,
   *  or the one `elementPaths` gives) (#857). */
  configPath?: string;
  /** The config pointer of each element by id, where the slot's elements
   *  are not one array of the configuration (a template's decoration
   *  merged over the templates it extends). */
  elementPaths?: ReadonlyMap<string, string>;
  /** Filled with the ends connectors left out (#1056): the connector's id
   *  and the box it named. */
  connectorDropped?: { elementId: string; targetId: string }[];
  /** Filled with the ends connectors set at an anchor no picture of their
   *  frame has (#1057). */
  connectorAnchorUnknown?: { elementId: string; targetId: string; anchor: string; resourceId?: string; known: string[] }[];
  /** The attributes some elements read before `attrs`, with their source
   *  ranges, by element id (#1189): a module's elements read its
   *  `:::module` fence. */
  elementAttrs?: ReadonlyMap<string, { attrs: Record<string, string>; attrSources: Record<string, { start: number; end: number }> }>;
  /** Text elements painted over the frames of a composed page (#1189):
   *  their blocks are marked `over`. */
  overTexts?: ReadonlySet<string>;
}

/** A composed page's module elements (#1189): the attributes each reads
 *  before the page fence's (its `:::module` fence's, as the laid `pages`
 *  record them), by element id, and the indices of every element of a
 *  module in the template's decoration. `elements` is the decoration
 *  resolved (its ids, in the template's order). */
export function moduleDecoration(
  template: ResolvedPageTemplate,
  elements: readonly { id: string }[],
  pages: readonly VDTPage[],
): { elementAttrs: Map<string, { attrs: Record<string, string>; attrSources: Record<string, { start: number; end: number }> }>; inModule: Set<number> } {
  const elementAttrs = new Map<string, { attrs: Record<string, string>; attrSources: Record<string, { start: number; end: number }> }>();
  const inModule = new Set<number>();
  const laidModules = new Map(pages.flatMap((p) => p.composed?.modules ?? []).filter((m) => m.attrs).map((m) => [m.name, m] as const));
  for (const m of template.modules ?? []) {
    if (!m.decoration) continue;
    const laid = laidModules.get(m.name);
    for (let i = m.decoration.start; i < m.decoration.end; i++) {
      inModule.add(i);
      const id = elements[i]?.id;
      if (id === undefined || !laid?.attrs) continue;
      const attrSources: Record<string, { start: number; end: number }> = {};
      for (const [k, v] of Object.entries(laid.attrSources ?? {})) attrSources[k] = { start: v.sourceStart, end: v.sourceEnd };
      elementAttrs.set(id, { attrs: laid.attrs, attrSources });
    }
  }
  return { elementAttrs, inModule };
}

/** What a composed page's decoration means to draw (`folioMissing`,
 *  #1163), a module's elements reading its fence first (#1189). */
export function decorationFurniture(template: ResolvedPageTemplate, page: VDTPage, at: number, role: PageRole | undefined, pageAttrs: Record<string, string> | undefined) {
  const elements = resolveDesignSlot(template.decoration, 'header').elements;
  const { elementAttrs } = moduleDecoration(template, elements, [page]);
  return expectedFurniture(elements, 'decoration', at, role, pageAttrs, elementAttrs.size > 0 ? new Map([...elementAttrs].map(([id, a]) => [id, a.attrs] as const)) : undefined);
}

/** `{ configPath }` when there is one. */
export const withPath = (configPath: string | undefined): { configPath?: string } => (configPath !== undefined ? { configPath } : {});

const ATTR_ELEMENT = /^\s*\{attr\.([A-Za-z_][A-Za-z0-9_-]*)\}\s*$/;
const HEADING_LINE_PLACEHOLDER = /\{(number|numberDecimal|numberRoman|numberRomanLower|numberAlpha|numberAlphaLower|numberWords|numberWordsLower|numberOrdinalWords|numberOrdinalWordsLower|numberHan|chapterNumber|chapterTitle)\}/;
const METADATA_ELEMENT = /^\s*\{(title|subtitle|author|publishDate)\}\s*$/;

/** The source a text element maps back to, from what its content renders:
 *  the heading title for `{titleText}`, an attribute value for a bare
 *  `{attr.key}`, the heading line for number / chapter placeholders, a
 *  frontmatter value for a bare `{title}` / `{author}`…; null otherwise. */
function sourceForElement(
  content: string,
  extras: SlotLayoutExtras,
): { start: number; end: number; text?: string; sourceMap?: number[] } | null {
  if (extras.titleSource && content.includes('{titleText}')) return extras.titleSource;
  const attr = /^\s*\{attr\.([A-Za-z_][A-Za-z0-9_-]*)\}\s*$/.exec(content);
  if (attr && extras.attrSources?.[attr[1]!]) {
    const range = extras.attrSources[attr[1]!]!;
    const value = extras.attrs?.[attr[1]!] ?? '';
    return withMap(range, value);
  }
  if (extras.headingSource && HEADING_LINE_PLACEHOLDER.test(content)) return extras.headingSource;
  const meta = METADATA_ELEMENT.exec(content);
  if (meta && extras.metadataSources?.[meta[1]!]) {
    const range = extras.metadataSources[meta[1]!]!;
    const value = extras.metadata?.[meta[1]!];
    return withMap(range, typeof value === 'string' ? value : '');
  }
  return null;
}

/**
 * A title element's source as its lines print it (#546): the template
 * round `{titleText}` (a heading's number and its point, "4. ") is printed
 * too, so the text and its map take it in, the characters before the
 * title mapped to its start and those after it to its end, and
 * `prefixLen` counts the ones before. The source as it was when the
 * printed text does not hold the title as written.
 */
function withPrintedTitle(
  el: ResolvedDesignTextElement,
  src: { start: number; end: number; text?: string; sourceMap?: number[] },
  placeholders: DesignPlaceholderContext,
): { start: number; end: number; text?: string; sourceMap?: number[]; prefixLen?: number } {
  const at = el.content.indexOf('{titleText}');
  const map = src.sourceMap;
  if (at < 0 || src.text === undefined || !map || map.length !== src.text.length) return src;
  // As the layout prints it: placeholders filled, marks dropped, the case
  // transformed.
  const upper = el.textTransform === 'uppercase';
  const print = (template: string): string => {
    const resolved = resolveDesignText(template, placeholders, el.inlineMarks === true);
    const plain = el.inlineMarks ? plainDesignText(resolved) : resolved;
    return upper ? plain.toLocaleUpperCase() : plain;
  };
  const text = print(el.content);
  const title = upper ? src.text.toLocaleUpperCase() : src.text;
  if (text === title) return title === src.text ? src : { ...src, text };
  const prefixLen = print(el.content.slice(0, at)).length;
  if (title.length !== src.text.length || text.slice(prefixLen, prefixLen + title.length) !== title) return src;
  const suffixLen = text.length - prefixLen - title.length;
  return {
    ...src,
    text,
    sourceMap: [...new Array<number>(prefixLen).fill(src.start), ...map, ...new Array<number>(suffixLen).fill(src.end)],
    ...(prefixLen ? { prefixLen } : {}),
  };
}

/** A range plus a per-character map when the rendered value is exactly the
 *  source span (so the caret lands on the clicked glyph). */
function withMap(range: { start: number; end: number }, value: string): { start: number; end: number; text?: string; sourceMap?: number[] } {
  if (value.length > 0 && value.length === range.end - range.start) {
    return { ...range, text: value, sourceMap: Array.from({ length: value.length }, (_, i) => range.start + i) };
  }
  return range;
}

export function layoutSlotToVdt(
  slot: ResolvedDesignSlot,
  container: { x: number; y: number; width: number; height: number },
  pageIndex: number,
  placeholders: DesignPlaceholderContext,
  dpi: number,
  extras?: SlotLayoutExtras,
): VDTDesignSlot | undefined {
  const own = extras?.elementAttrs;
  const result = layoutDesignSlot(
    slot,
    {
      container, dpi, placeholders, frames: extras?.frames, pageRole: extras?.pageRole, resourceById: extras?.resourceById,
      ...(extras?.direction ? { direction: extras.direction } : {}),
      ...(extras?.mirrored ? { mirrored: true } : {}),
      ...(extras?.startRight ? { startRight: true } : {}),
      ...(extras?.arabicNumbers ? { arabicNumbers: true } : {}),
      ...(own && own.size > 0 ? { elementAttrs: new Map([...own].map(([id, a]) => [id, a.attrs] as const)) } : {}),
    },
    pageIndex,
  );
  /** What element `id` reads (#1189): the slot's extras and placeholders,
   *  with a module's fence attributes over the page's. */
  const extrasOf = (id: string): SlotLayoutExtras | undefined => {
    const a = own?.get(id);
    return a && extras ? { ...extras, attrs: { ...extras.attrs, ...a.attrs }, attrSources: { ...extras.attrSources, ...a.attrSources } } : extras;
  };
  const placeholdersOf = (id: string): DesignPlaceholderContext => {
    const a = own?.get(id);
    return a ? { ...placeholders, pageAttrs: { ...placeholders.pageAttrs, ...a.attrs } } : placeholders;
  };
  if (extras?.connectorDropped) {
    for (const issue of result.issues) if (issue.kind === 'connectorDropped') extras.connectorDropped.push({ elementId: issue.elementId, targetId: issue.targetId });
  }
  if (extras?.connectorAnchorUnknown) {
    for (const issue of result.issues) {
      if (issue.kind !== 'connectorAnchorUnknown') continue;
      const { kind: _kind, ...rest } = issue;
      void _kind;
      extras.connectorAnchorUnknown.push(rest);
    }
  }
  if (result.primitives.length === 0) return undefined;
  const sourceByElement = new Map<string, { start: number; end: number; text?: string; sourceMap?: number[]; prefixLen?: number; attr?: string }>();
  if (extras) {
    for (const el of slot.elements) {
      if (el.kind !== 'text') continue;
      const elExtras = extrasOf(el.id)!;
      const elPlaceholders = placeholdersOf(el.id);
      const src = sourceForElement(el.content, elExtras);
      if (!src) continue;
      // Inline marks drop their markers from the printed text. The
      // per-character map holds while the mapped value is still printed as
      // written (no markers or escapes of its own); otherwise only the range
      // maps back.
      const keepMap = !el.inlineMarks || src.text === undefined
        || plainDesignText(resolveDesignText(el.content, elPlaceholders, el.inlineMarks === true)).includes(src.text);
      const attr = ATTR_ELEMENT.exec(el.content)?.[1];
      const mapped = keepMap ? withPrintedTitle(el, src, elPlaceholders) : { start: src.start, end: src.end };
      sourceByElement.set(el.id, attr !== undefined && elExtras.attrSources?.[attr] ? { ...mapped, attr } : mapped);
    }
  }
  // The texts cut to fit (#628), flagged on the element's own block (not
  // on its drop cap's).
  const truncated = new Map<string, { mode: NonNullable<ResolvedTextPrimitive['truncated']>; text: string }>();
  if (extras?.slot) {
    for (const issue of result.issues) {
      if (issue.kind === 'textTruncated') truncated.set(issue.elementId, { mode: issue.mode, text: issue.text });
    }
  }
  // Where each element is written in the configuration (#857).
  const pathById = new Map<string, string>();
  if (extras?.configPath !== undefined) slot.elements.forEach((el, i) => pathById.set(el.id, `${extras.configPath}/elements/${i}`));
  for (const [id, path] of extras?.elementPaths ?? []) pathById.set(id, path);
  // An image picked by an attribute (`resourceId: '{attr.fondo}'`).
  const imageAttrById = new Map<string, string>();
  for (const el of slot.elements) {
    const attr = el.kind === 'image' ? ATTR_ELEMENT.exec(el.resourceId ?? '')?.[1] : undefined;
    if (attr !== undefined && extrasOf(el.id)?.attrs?.[attr] !== undefined) imageAttrById.set(el.id, attr);
  }
  const blocks = result.primitives.map((prim) => {
    const block = primitiveToBlock(prim);
    if (prim.id) {
      block.elementId = prim.id;
      const path = pathById.get(prim.id);
      if (path !== undefined) block.configPath = path;
      const attr = block.kind === 'image' ? imageAttrById.get(prim.id) : undefined;
      if (attr !== undefined) block.attr = attr;
    }
    const cut = prim.kind === 'text' && !prim.dropCap ? truncated.get(prim.id) : undefined;
    if (block.kind === 'text' && cut && extras?.slot) block.truncated = { elementId: prim.id, slot: extras.slot, mode: cut.mode, text: cut.text };
    const src = sourceByElement.get(prim.id);
    if (block.kind === 'text' && src) {
      block.sourceStart = src.start;
      block.sourceEnd = src.end;
      if (src.text !== undefined && src.sourceMap && src.sourceMap.length === src.text.length) {
        block.sourceText = src.text;
        block.sourceMap = src.sourceMap;
        if (src.prefixLen) block.sourcePrefixLen = src.prefixLen;
      }
      if (src.attr !== undefined) block.attr = src.attr;
    }
    if (block.kind === 'text' && extras?.overTexts?.has(prim.id)) block.over = true;
    return block;
  });
  return {
    bbox: createBoundingBox(container.x, container.y, container.width, container.height),
    blocks,
  };
}

/**
 * A running head or footer as page furniture: the pictures it repeats on
 * every page keep no alternative text, so HTML gives them `alt=""` and
 * `role="presentation"` and a screen reader skips them, as the tagged PDF
 * does (a pagination artifact). The pictures of an opener, a part page or a
 * heading design keep theirs.
 */
export function asFurniture(slot: VDTDesignSlot | undefined): VDTDesignSlot | undefined {
  if (!slot || !slot.blocks.some((b) => b.kind === 'image' && b.altText !== undefined)) return slot;
  return {
    ...slot,
    blocks: slot.blocks.map((b) => {
      if (b.kind !== 'image' || b.altText === undefined) return b;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { altText: _alt, ...rest } = b;
      return rest;
    }),
  };
}

/** The source of a heading block's title text: its per-character map when
 *  the block has one, else its whole range. */
export function headingTitleSource(block: VDTBlock, titleText: string): SlotLayoutExtras['titleSource'] {
  const map = block.sourceMap;
  if (map && map.length > 0) return { start: map[0]!, end: map[map.length - 1]! + 1, text: titleText, sourceMap: map };
  if (block.sourceStart !== undefined && block.sourceEnd !== undefined) return { start: block.sourceStart, end: block.sourceEnd };
  return undefined;
}

export function headingLineSource(block: VDTBlock): { start: number; end: number } | undefined {
  return block.sourceStart !== undefined && block.sourceEnd !== undefined ? { start: block.sourceStart, end: block.sourceEnd } : undefined;
}

/** Plain title text of a part (`\\` rendered as a line break) and the
 *  source offset of every character of it, for editor cursor mapping. */
export function partTitleSourceMap(rawTitle: string, sourceStart: number): { text: string; sourceMap: number[] } {
  let text = '';
  const sourceMap: number[] = [];
  const re = /[ \t]*\\\\[ \t]*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawTitle)) !== null) {
    for (let i = last; i < m.index; i++) { text += rawTitle[i]; sourceMap.push(sourceStart + i); }
    text += '\n';
    sourceMap.push(sourceStart + m.index);
    last = m.index + m[0].length;
  }
  for (let i = last; i < rawTitle.length; i++) { text += rawTitle[i]; sourceMap.push(sourceStart + i); }
  return { text, sourceMap };
}
