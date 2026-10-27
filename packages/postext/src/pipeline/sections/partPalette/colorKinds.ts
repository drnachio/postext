// The kinds a flow colour can come from (text, heading, frame and table
// roles), the settings path each kind reads, and the walk over a config's
// colour settings (#1278: split out of partPalette.ts).
import type { ColorValue } from '../../../types.js';
import type { ResolvedConfig } from '../../../vdt.js';
import { CODE_BOX_STYLE_ID } from '../../code/codeBlocks.js';

export type Remap = (hex: string | undefined) => string | undefined;

/** The colours a block's text is painted in: the VDT field and the kind of
 *  setting each one comes from. */
export const TEXT_FIELDS = [
  ['color', 'text:color'], ['boldColor', 'text:bold'], ['italicColor', 'text:italic'],
  ['refColor', 'text:ref'], ['bulletColor', 'text:bullet'], ['separatorColor', 'text:separator'],
] as const;
/** Colours of a resource block and of its table, and the setting of the
 *  caption or table style each one is resolved from. */
export const CAPTION_KEYS = [['captionColor', 'color'], ['captionLabelColor', 'labelColor'], ['noteColor', 'note.color']] as const;
export const TABLE_KEYS = [
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
 *   `caption:note.color`;
 * - `label:<setting>@<label style id>` and `label:<setting>` (figure label
 *   styles, #902): `color`, `halo.color` or `background`.
 */
export type FlowColorKind =
  | `text:${TextColorRole}` | `toc:${TocColorRole}` | 'heading' | `heading:${number}` | `heading@${string}`
  | `box:${string}` | `table:${string}` | `chip:${string}` | `caption:${string}` | `label:${string}`;

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
    case 'label.icon.color':
    case 'icon.tint':
    case 'marker.tint':
    case 'label.icon.tint':
      return ['text'];
    default:
      return ['fill', 'border', 'rule', 'text'];
  }
}

/** The kinds of flow colour a colour of the resolved configuration `cfg`
 *  at `path` sets: none for a design, the page, the debug overlay… */
export function kindsOfPath(path: readonly string[], cfg: ResolvedConfig): FlowColorKind[] {
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
    case 'labelStyles': {
      const id = cfg.labelStyles?.[index]?.id;
      return id !== undefined ? [`label:${rest(2)}@${id}`, `label:${rest(2)}`] : [`label:${rest(2)}`];
    }
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
export function walkColorPairs(
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

export const withHash = (hex: string): string => (hex.startsWith('#') ? hex : `#${hex}`);
