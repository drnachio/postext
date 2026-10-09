// A part's `palette` recolours the flow as well as its designs. The VDT
// keeps resolved hex values, not palette links, so the flow is recoloured by
// value: on the pages a part (or a styled section) rules, every colour of the
// text flow equal to the base value of a palette entry the part overrides
// takes the part's value — headings, bold and italic runs, references,
// bullets and numbers, captions and caption bars, table text, rules and
// fills, callout boxes (title, background, stripe), inline chips (fill,
// outline, text). Explicit colours that merely coincide with an entry (an
// inline swatch) keep theirs.
//
// Two entries can share a base value and still take different values on a
// page (one overridden and not the other, or both to different colours).
// The value alone then cannot say which one a flow colour came from. Each
// colour of the VDT is therefore matched with the settings it can come
// from (its kind: a block's text, bold, italic, reference, marker or
// separator colour; a heading level or heading style; one part of one
// callout style's frame; one colour of a table, chip or caption style) and
// takes the value those settings resolve to under the page's palette
// (`flowColorValues`). A cell's own fill follows its own link.

import type { CaptionStyleConfig, ColorPaletteEntry, ColorValue, PostextConfig, ResourceType } from '../types';
import type { ResolvedConfig, VDTBlock, VDTDesignBlock, VDTDocument, VDTLine, VDTResourceTableCell, ResolvedResourceBlock } from '../vdt';
import { resolveAllConfig } from './config';
import { mergeCaptionStyle } from '../defaults/captionStyle';
import { CODE_BOX_STYLE_ID } from './codeBlocks';

type Remap = (hex: string | undefined) => string | undefined;

/** The colours a block's text is painted in: the VDT field and the kind of
 *  setting each one comes from. */
const TEXT_FIELDS = [
  ['color', 'text:color'], ['boldColor', 'text:bold'], ['italicColor', 'text:italic'],
  ['refColor', 'text:ref'], ['bulletColor', 'text:bullet'], ['separatorColor', 'text:separator'],
] as const;
/** Colours of a resource block and of its table, and the setting of the
 *  caption or table style each one is resolved from. */
const CAPTION_KEYS = [['captionColor', 'color'], ['captionLabelColor', 'labelColor'], ['noteColor', 'note.color']] as const;
const TABLE_KEYS = [
  ['color', 'bodyColor'], ['headerColor', 'headerColor'], ['borderColor', 'borderColor'],
  ['headerBackground', 'headerBackground'], ['bodyBackground', 'bodyBackground'],
  ['bodyAlternateBackground', 'bodyAlternateBackground'],
] as const;

/** The colour of a block's text a setting sets: its running text, bold and
 *  italic runs, references, list marker (a bullet or a number), or a
 *  number's separator. */
export type TextColorRole = 'color' | 'bold' | 'italic' | 'ref' | 'bullet' | 'separator' | 'dropCap' | 'code';

/** The colours of a contents row: the entry's text (bold and italic runs
 *  included), its number, and its page number and subtitle. */
export type TocColorRole = 'color' | 'number' | 'segment';

/** The part of a callout frame a setting colours: the fills (background,
 *  stripe, label tab), the border, the rules (the marker's and the
 *  label's) and the text (title, icon and marker glyphs, label). */
export type FrameColorRole = 'fill' | 'border' | 'rule' | 'text';

/**
 * The kinds of flow colour. A kind names the settings a colour of the VDT
 * can come from:
 * - `text:<role>` ({@link TextColorRole}): body text, blockquotes,
 *   paragraph styles, lists, the text inside boxes, section and part
 *   bodies, display maths;
 * - `toc:<role>` ({@link TocColorRole}): the rows of the contents;
 * - `heading:<level>` (a heading level), `heading@<style id>` (a heading
 *   style), and `heading` for every heading colour;
 * - `box:<role>@<callout style id>` ({@link FrameColorRole}) and
 *   `box:<role>` for that part of every callout style;
 * - `table:<setting>` (the document's table style), `table:<setting>@<id>`
 *   (a named table style), `chip:<setting>@<id>` and `chip:<setting>`
 *   (chip styles), `caption:<setting>` (the document's caption style) and
 *   `caption:<setting>@<resource type id>` (a resource type's own): one
 *   colour of those styles, as `table:headerBackground` or
 *   `caption:note.color`.
 */
export type FlowColorKind =
  | `text:${TextColorRole}` | `toc:${TocColorRole}` | 'heading' | `heading:${number}` | `heading@${string}`
  | `box:${string}` | `table:${string}` | `chip:${string}` | `caption:${string}`;

/** For base values (lower-case hex) that palette entries share: the values
 *  each kind of flow colour takes under a page's palette overrides. */
export type FlowColorValues = ReadonlyMap<string, ReadonlyMap<FlowColorKind, ReadonlySet<string>>>;

/** Keys whose subtree is a design (running heads, openers, part pages,
 *  heading designs): designs follow their palette links directly. */
const DESIGN_KEYS = new Set(['header', 'footer', 'design', 'versoDesign', 'advancedDesign']);

const isIndex = (k: string): boolean => /^\d+$/.test(k);

/** The kinds a colour of a text setting at `path` belongs to. `color`
 *  under a list is the marker's colour (list items take the body's). */
function textKinds(path: readonly string[]): FlowColorKind[] {
  const keys = path.filter((k) => !isIndex(k));
  const inList = keys.some((k) => k === 'unorderedLists' || k === 'orderedLists' || k === 'lists');
  switch (keys[keys.length - 1]) {
    case 'boldColor':
      return ['text:bold'];
    case 'italicColor':
      return ['text:italic'];
    case 'referenceColor':
      return ['text:ref'];
    case 'bulletColor':
    case 'numberColor':
      return ['text:bullet'];
    case 'separatorColor':
      return ['text:separator'];
    case 'color':
      return [inList ? 'text:bullet' : 'text:color'];
    default:
      // `taskCompletedColor`: the text of a ticked task.
      return ['text:color'];
  }
}

/** The parts of a callout frame a setting of the style colours (`rest` is
 *  its path inside the style, `stripe.color`); a colour this list does
 *  not know counts for every part. */
function frameRoles(rest: string): FrameColorRole[] {
  switch (rest) {
    case 'background':
    case 'stripe.color':
    case 'label.background':
      return ['fill'];
    case 'border.color':
      return ['border'];
    case 'marker.rule.color':
    case 'label.rule.color':
      return ['rule'];
    case 'titleStyle.color':
    case 'icon.color':
    case 'marker.color':
    case 'label.color':
      return ['text'];
    default:
      return ['fill', 'border', 'rule', 'text'];
  }
}

/** The kinds of flow colour a colour of the resolved configuration `cfg`
 *  at `path` sets: none for a design, the page, the debug overlay… */
function kindsOfPath(path: readonly string[], cfg: ResolvedConfig): FlowColorKind[] {
  if (path.some((k) => DESIGN_KEYS.has(k))) return [];
  // A body paragraph's drop cap (#623), set by a paragraph style or a
  // heading level or style.
  if (path.includes('dropCap')) return ['text:dropCap'];
  const [top, second] = path;
  const index = Number(second);
  // The setting inside a style, indices left out (`note.color`).
  const rest = (from: number): string => path.slice(from).filter((k) => !isIndex(k)).join('.');
  switch (top) {
    case 'headings': {
      if (second !== 'levels') return ['heading'];
      const level = cfg.headings.levels[Number(path[2])]?.level;
      return level !== undefined && path[path.length - 1] === 'color' ? [`heading:${level}`, 'heading'] : ['heading'];
    }
    case 'headingStyles': {
      if (path[2] === 'bodyStyle') return textKinds(path);
      if (path[2] !== 'overrides') return [];
      const id = cfg.headingStyles[index]?.id;
      return id !== undefined && path[path.length - 1] === 'color' ? [`heading@${id}`, 'heading'] : ['heading'];
    }
    case 'bodyText':
    case 'unorderedLists':
    case 'orderedLists':
    case 'paragraphStyles':
    case 'math':
      return textKinds(path);
    case 'toc':
      if (second === 'pageNumber' || second === 'subtitle') return ['toc:segment'];
      if (second !== 'levels') return [];
      return [path[path.length - 1] === 'numberColor' ? 'toc:number' : 'toc:color'];
    case 'parts':
      return second === 'bodyStyle' ? textKinds(path) : [];
    case 'calloutStyles': {
      if (path[2] === 'body' || path[2] === 'lists') return textKinds(path);
      const id = cfg.calloutStyles[index]?.id;
      return frameRoles(rest(2)).flatMap((role): FlowColorKind[] => (id !== undefined ? [`box:${role}@${id}`, `box:${role}`] : [`box:${role}`]));
    }
    case 'tableStyle':
      return [`table:${rest(1)}`];
    case 'tableStyles': {
      const id = cfg.tableStyles[index]?.id;
      return id !== undefined ? [`table:${rest(2)}@${id}`] : [];
    }
    case 'chipStyles': {
      const id = cfg.chipStyles[index]?.id;
      return id !== undefined ? [`chip:${rest(2)}@${id}`, `chip:${rest(2)}`] : [`chip:${rest(2)}`];
    }
    case 'captionStyle':
      return [`caption:${rest(1)}`];
    case 'codeStyle': {
      // Code listings (#624): the code and its tokens, the box's frame
      // (a box of the build's own style), inline code (a chip).
      const setting = rest(1);
      if (second === 'inline') return [`chip:${rest(2)}@${CODE_BOX_STYLE_ID}`];
      if (setting === 'background' || setting === 'highlightBackground') return [`box:fill@${CODE_BOX_STYLE_ID}`];
      if (setting === 'border.color') return [`box:border@${CODE_BOX_STYLE_ID}`];
      if (second === 'titleStyle' || second === 'label') return frameRoles(setting).map((role): FlowColorKind => `box:${role}@${CODE_BOX_STYLE_ID}`);
      return ['text:code'];
    }
    default:
      return [];
  }
}

function isColorValue(v: unknown): v is ColorValue {
  return typeof v === 'object' && v !== null && typeof (v as ColorValue).hex === 'string';
}

/** Walk two resolved configurations of the same shape side by side and hand
 *  every pair of colours to `visit` with its path. */
function walkColorPairs(
  a: unknown,
  b: unknown,
  path: string[],
  visit: (path: readonly string[], before: ColorValue, after: ColorValue) => void,
): void {
  if (isColorValue(a) && isColorValue(b)) {
    visit(path, a, b);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) walkColorPairs(a[i], b[i], [...path, String(i)], visit);
    return;
  }
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return;
  for (const key of Object.keys(a)) {
    if (key === 'colorPalette') continue;
    const va = (a as Record<string, unknown>)[key];
    if (typeof va !== 'object' || va === null) continue;
    walkColorPairs(va, (b as Record<string, unknown>)[key], [...path, key], visit);
  }
}

const withHash = (hex: string): string => (hex.startsWith('#') ? hex : `#${hex}`);

/**
 * The values each kind of flow colour takes under `overrides` (palette id →
 * hex), for the base values of `config`'s palette that two or more entries
 * share: `config` is resolved with its own palette and with the overridden
 * one, and every colour setting of the flow is read in both. Settings of a
 * kind that resolve to one base value may disagree under the overrides (two
 * entries that share it, or an entry and a colour written out); the set
 * then holds each value.
 */
export function flowColorValues(
  config: PostextConfig | undefined,
  overrides: Readonly<Record<string, string>>,
  resourceTypes?: readonly ResourceType[],
): FlowColorValues {
  if (!config) return new Map();
  // Memoised per configuration object (resolved configurations are cached
  // the same way) and override map: every build of a chapter asks again.
  const key = JSON.stringify(Object.entries(overrides).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  let memo = valuesMemo.get(config);
  if (!memo) valuesMemo.set(config, (memo = new Map()));
  let hit = memo.get(key);
  if (!hit || hit.resourceTypes !== resourceTypes) {
    hit = { resourceTypes, values: computeFlowColorValues(config, overrides, resourceTypes) };
    memo.set(key, hit);
  }
  return hit.values;
}

const valuesMemo = new WeakMap<PostextConfig, Map<string, { resourceTypes: readonly ResourceType[] | undefined; values: FlowColorValues }>>();

/** Forget the colour values memoised for `config` (changed in place,
 *  #629: `invalidateConfig`). */
export function forgetFlowColorValues(config: PostextConfig): void {
  valuesMemo.delete(config);
}

function computeFlowColorValues(
  config: PostextConfig,
  overrides: Readonly<Record<string, string>>,
  resourceTypes: readonly ResourceType[] | undefined,
): FlowColorValues {
  const out = new Map<string, Map<FlowColorKind, Set<string>>>();
  const palette = config.colorPalette;
  if (!palette || palette.length === 0) return out;
  const counts = new Map<string, number>();
  for (const e of palette) {
    const key = e.value.hex.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const shared = new Set([...counts].filter(([, n]) => n > 1).map(([hex]) => hex));
  if (shared.size === 0) return out;
  const next: ColorPaletteEntry[] = palette.map((e) => {
    const hex = overrides[e.id];
    return hex ? { ...e, value: { ...e.value, hex: withHash(hex) } } : e;
  });
  const before = resolveAllConfig(config);
  const after = resolveAllConfig({ ...config, colorPalette: next });
  const record = (kinds: readonly FlowColorKind[], a: ColorValue, b: ColorValue): void => {
    const key = a.hex.toLowerCase();
    if (kinds.length === 0 || !shared.has(key)) return;
    let byKind = out.get(key);
    if (!byKind) out.set(key, (byKind = new Map()));
    for (const kind of kinds) {
      let values = byKind.get(kind);
      if (!values) byKind.set(kind, (values = new Set()));
      values.add(b.hex.toLowerCase());
    }
  };
  walkColorPairs(before, after, [], (path, a, b) => record(kindsOfPath(path, before), a, b));
  // Captions of a resource type resolve their overrides at layout time.
  for (const type of resourceTypes ?? []) {
    const cs: CaptionStyleConfig | undefined = type.captionStyle;
    if (!cs) continue;
    walkColorPairs(
      mergeCaptionStyle(before.captionStyle, cs, before.colorPalette),
      mergeCaptionStyle(after.captionStyle, cs, after.colorPalette),
      [],
      (path, a, b) => record([`caption:${path.join('.')}@${type.id}`], a, b),
    );
  }
  return out;
}

/** Groups of kinds, tried in order: the first group with a setting that
 *  starts from a colour's value decides it. */
type KindGroups = readonly (readonly FlowColorKind[])[];

/** The remaps of one page, and the value a palette link takes there. */
interface PageRemaps {
  /** The remap of a flow colour that comes from the settings of `groups`
   *  (see {@link KindGroups}). The same function for every group when no
   *  base value is ambiguous on the page. */
  by: (groups: KindGroups) => Remap;
  /** A cell's own fill: its palette link decides where the value cannot;
   *  a fill written out is told apart from the table's by `groups`. */
  cellFill: (hex: string, source: ColorValue | undefined, groups: KindGroups) => string;
}

/** The kind groups of a style's colour `setting` (`headerBackground`):
 *  the named style's own first, when the block names one. */
function scoped(family: 'table' | 'chip' | 'caption', settings: readonly string[], id: string | undefined): KindGroups {
  const all = settings.map((s): FlowColorKind => `${family}:${s}`);
  return id ? [settings.map((s): FlowColorKind => `${family}:${s}@${id}`), all] : [all];
}

/** Segment colours of `lines` (inline swatches keep their own colour: it
 *  lives on `segment.swatch`, which is not touched), chips included. A
 *  chip's colours are replaced on a copy of its record: the measurement
 *  cache shares that record between every copy of the measured lines, and
 *  the same paragraph may also sit on a page the palette does not rule. */
function recolorLines(lines: readonly VDTLine[] | undefined, remap: Remap, r: PageRemaps): void {
  for (const line of lines ?? []) {
    for (const seg of line.segments ?? []) {
      if (seg.color) seg.color = remap(seg.color);
      const chip = seg.chip;
      if (chip && (chip.background || chip.borderColor || chip.color)) {
        const style = chip.styleId || undefined;
        const background = r.by(scoped('chip', ['background'], style))(chip.background);
        const borderColor = r.by(scoped('chip', ['borderColor'], style))(chip.borderColor);
        const color = r.by(scoped('chip', ['color'], style))(chip.color);
        if (background !== chip.background || borderColor !== chip.borderColor || color !== chip.color) {
          seg.chip = {
            ...chip,
            ...(background ? { background } : {}),
            ...(borderColor ? { borderColor } : {}),
            ...(color ? { color } : {}),
          };
        }
      }
    }
  }
}

/** A callout frame's decoration, each part by the settings that colour it
 *  in the frame's style. */
function recolorFrame(blocks: readonly VDTDesignBlock[], styleId: string | undefined, r: PageRemaps): void {
  const part = (role: FrameColorRole): Remap =>
    r.by(styleId !== undefined ? [[`box:${role}@${styleId}`], [`box:${role}`]] : [[`box:${role}`]]);
  for (const b of blocks) {
    if (b.kind === 'text') {
      const remap = part('text');
      b.color = remap(b.color) ?? b.color;
      if (b.stroke) b.stroke.color = remap(b.stroke.color) ?? b.stroke.color;
    } else if (b.kind === 'rule') {
      b.color = part('rule')(b.color) ?? b.color;
    } else if (b.kind === 'box') {
      if (b.box.backgroundColor) b.box.backgroundColor = part('fill')(b.box.backgroundColor);
      if (b.box.borderColor) b.box.borderColor = part('border')(b.box.borderColor);
    }
  }
}

/** The model cell a laid-out cell was set from. */
function modelCell(rb: ResolvedResourceBlock, cell: VDTResourceTableCell) {
  return rb.resource?.table?.model.rows[cell.row]?.[cell.col];
}

/** Where a heading's colour comes from: its heading style when the style
 *  sets one from the colour's value, otherwise its level. */
function headingGroups(block: VDTBlock): KindGroups {
  const level: FlowColorKind = block.headingLevel !== undefined ? `heading:${block.headingLevel}` : 'heading';
  return block.headingStyleId !== undefined ? [[`heading@${block.headingStyleId}`], [level]] : [[level]];
}

/** The settings each text colour of a contents row comes from. A row
 *  paints its bold and italic runs in its own colour. */
const TOC_FIELDS: Readonly<Record<string, FlowColorKind>> = {
  color: 'toc:color', boldColor: 'toc:color', italicColor: 'toc:color', bulletColor: 'toc:number', separatorColor: 'toc:number',
};

function recolorBlock(block: VDTBlock, r: PageRemaps): void {
  const rec = block as unknown as Record<string, string | undefined>;
  const heading = block.type === 'heading' ? headingGroups(block) : undefined;
  const toc = block.tocEntry !== undefined;
  for (const [key, kind] of TEXT_FIELDS) {
    if (!rec[key]) continue;
    const groups: KindGroups = heading && key === 'color' ? heading : [[(toc ? TOC_FIELDS[key] : undefined) ?? kind]];
    rec[key] = r.by(groups)(rec[key]);
  }
  // A run with a colour of its own: a contents entry's page number or
  // subtitle; a token of a code listing (#624).
  recolorLines(block.lines, r.by(toc ? [['toc:segment']] : block.type === 'code' ? [['text:code'], ['text:color']] : heading ?? []), r);
  // A drop cap (#623): its own setting's colour, or the paragraph's.
  if (block.dropCap) block.dropCap.color = r.by([['text:dropCap'], ['text:color']])(block.dropCap.color) ?? block.dropCap.color;
  // A callout frame's decoration (background, border, stripe, title) is a
  // design overlay resolved from the style's palette-linked colours.
  if (block.type === 'callout' && block.designOverlay) recolorFrame(block.designOverlay.blocks, block.callout?.styleId, r);
  const rb = block.resourceBlock;
  if (!rb) return;
  const rrec = rb as unknown as Record<string, string | undefined>;
  const typeId = rb.resource?.typeId;
  for (const [key, setting] of CAPTION_KEYS) if (rrec[key]) rrec[key] = r.by(scoped('caption', [setting], typeId))(rrec[key]);
  // The references in captions and cells: `bodyText.referenceColor`.
  if (rb.linkColor) rb.linkColor = r.by([['text:ref']])(rb.linkColor) ?? rb.linkColor;
  if (rb.captionBar) rb.captionBar.background = r.by(scoped('caption', ['background'], typeId))(rb.captionBar.background) ?? rb.captionBar.background;
  const captionRuns = r.by(scoped('caption', CAPTION_KEYS.map(([, s]) => s), typeId));
  recolorLines(rb.captionLines, captionRuns, r);
  recolorLines(rb.noteLines, captionRuns, r);
  recolorLines(rb.continuesLines, captionRuns, r);
  if (rb.table) {
    const t = rb.table;
    const trec = t as unknown as Record<string, string | undefined>;
    const styleId = rb.resource?.table?.styleId;
    for (const [key, setting] of TABLE_KEYS) if (trec[key]) trec[key] = r.by(scoped('table', [setting], styleId))(trec[key]);
    const fills = scoped('table', ['bodyBackground', 'bodyAlternateBackground', 'headerBackground'], styleId);
    const cellRuns = r.by(scoped('table', ['bodyColor', 'headerColor'], styleId));
    for (const cell of t.cells) {
      if (cell.background) cell.background = r.cellFill(cell.background, modelCell(rb, cell)?.background, fills);
      recolorLines(cell.lines, cellRuns, r);
    }
  }
}

/** Recolour each page's flow (columns and floats) with the palette overrides
 *  in force on it (`palettes[pageIndex]`: palette id → hex). `valuesFor`
 *  gives, for an override map, what each kind of flow colour takes where
 *  two entries share a base value (see {@link flowColorValues}); without it
 *  such a value takes the last override that changes it. */
export function applyPartPalettesToFlow(
  doc: VDTDocument,
  palettes: readonly Record<string, string>[],
  basePalette: readonly ColorPaletteEntry[] | undefined,
  valuesFor?: (overrides: Readonly<Record<string, string>>) => FlowColorValues,
): void {
  if (!basePalette || basePalette.length === 0) return;
  const baseHex = new Map(basePalette.map((e) => [e.id, e.value.hex.toLowerCase()]));
  const cache = new Map<Record<string, string>, PageRemaps | null>();
  const remapsOf = (overrides: Record<string, string>): PageRemaps | null => {
    const hit = cache.get(overrides);
    if (hit !== undefined) return hit;
    const map = new Map<string, string>();
    for (const [id, hex] of Object.entries(overrides)) {
      const base = baseHex.get(id);
      const next = withHash(hex);
      if (base && base !== next.toLowerCase()) map.set(base, next);
    }
    const remaps = map.size === 0 ? null : pageRemaps(map, overrides, basePalette, valuesFor);
    cache.set(overrides, remaps);
    return remaps;
  };
  for (const page of doc.pages) {
    const overrides = palettes[page.index];
    if (!overrides || Object.keys(overrides).length === 0) continue;
    const r = remapsOf(overrides);
    if (!r) continue;
    for (const col of page.columns) for (const block of col.blocks) recolorBlock(block, r);
    for (const block of page.floats ?? []) recolorBlock(block, r);
  }
}

function pageRemaps(
  map: ReadonlyMap<string, string>,
  overrides: Readonly<Record<string, string>>,
  basePalette: readonly ColorPaletteEntry[],
  valuesFor: ((overrides: Readonly<Record<string, string>>) => FlowColorValues) | undefined,
): PageRemaps {
  const byValue: Remap = (hex) => (hex ? map.get(hex.toLowerCase()) ?? hex : hex);
  // Base values two entries share and the page gives two values.
  const results = new Map<string, Set<string>>();
  for (const e of basePalette) {
    const base = e.value.hex.toLowerCase();
    const o = overrides[e.id];
    let set = results.get(base);
    if (!set) results.set(base, (set = new Set()));
    set.add(o ? withHash(o).toLowerCase() : base);
  }
  const ambiguous = new Set([...results].filter(([, s]) => s.size > 1).map(([hex]) => hex));
  const values = ambiguous.size > 0 && valuesFor ? valuesFor(overrides) : undefined;
  const linked = (source: ColorValue | undefined): string | undefined => {
    if (!source?.paletteId) return undefined;
    const entry = basePalette.find((e) => e.id === source.paletteId);
    if (!entry) return undefined;
    const o = overrides[entry.id];
    return o ? withHash(o) : entry.value.hex;
  };
  if (!values) {
    return {
      by: () => byValue,
      cellFill: (hex, source) => (ambiguous.has(hex.toLowerCase()) ? linked(source) : undefined) ?? byValue(hex) ?? hex,
    };
  }
  const by = (groups: KindGroups): Remap => (hex) => {
    if (!hex) return hex;
    const key = hex.toLowerCase();
    if (ambiguous.has(key)) {
      const found = values.get(key);
      for (const group of groups) {
        const taken = new Set<string>();
        for (const kind of group) for (const v of found?.get(kind) ?? []) taken.add(v);
        if (taken.size === 0) continue;
        // The settings that start from the value all agree: theirs.
        // Otherwise the value decides, as without a palette clash.
        if (taken.size === 1) {
          const v = taken.values().next().value!;
          return v === key ? hex : v;
        }
        break;
      }
    }
    return map.get(key) ?? hex;
  };
  return {
    by,
    // A cell fill with no link of its own (a colour written out) is told
    // apart from the table's fills by value only.
    cellFill: (hex, source, groups) => (ambiguous.has(hex.toLowerCase()) ? linked(source) : undefined) ?? by(groups)(hex) ?? hex,
  };
}
