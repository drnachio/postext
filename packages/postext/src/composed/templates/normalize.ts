// Normalisation of a merged template: grid, cells, fit, overflow, frames,
// frame looks, rules and groups (#1276: split out of templates.ts).
import type { Dimension, ColorValue } from '../../types.js';
import type { PageTemplateGrid, FrameGridCell, ResolvedFrameFit, FrameOverflowConfig, ModuleWidth, FrameConfig, ResolvedFrame, FrameLook, FrameLookEntry, FrameRulesConfig, FrameGroupConfig, ResolvedFrameGroup } from '../types.js';
import { isRecord, finite, isFrameDimension, ZERO, DEFAULT_FRAME_FIT, normalizeFrameSize, DEFAULT_FRAME, oneOf, FRAME_VERTICAL_ALIGNS, FRAME_EXCLUDES, FRAME_TAKES, FRAME_WRITING_MODES, FRAME_DIRECTIONS, LOOK_TREE, type LookTree, DIMENSION_UNITS, FRAME_GROUP_KINDS, DEFAULT_FRAME_GROUP, FRAME_GRID_ROW_ALIGNS, FRAME_GROUP_ALIGNS } from './defaults.js';
import type { NamedEntry } from './merging.js';

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

export function normalizeGrid(raw: unknown): Required<PageTemplateGrid> | undefined {
  if (!isRecord(raw)) return undefined;
  const columns = finite(raw.columns) && raw.columns >= 1 ? Math.round(raw.columns) : undefined;
  const rows = finite(raw.rows) && raw.rows >= 1 ? Math.round(raw.rows) : undefined;
  if (columns === undefined || rows === undefined) return undefined;
  return {
    columns,
    rows,
    columnGap: isFrameDimension(raw.columnGap) ? raw.columnGap : ZERO,
    rowGap: isFrameDimension(raw.rowGap) ? raw.rowGap : ZERO,
  };
}

/** A grid cell clamped to the grid; undefined without a grid or a cell. */
function normalizeCell(raw: unknown, grid: Required<PageTemplateGrid> | undefined): Required<FrameGridCell> | undefined {
  if (!grid || !isRecord(raw) || !finite(raw.col) || !finite(raw.row)) return undefined;
  const col = Math.min(grid.columns, Math.max(1, Math.round(raw.col)));
  const row = Math.min(grid.rows, Math.max(1, Math.round(raw.row)));
  const cols = finite(raw.cols) ? Math.min(grid.columns - col + 1, Math.max(1, Math.round(raw.cols))) : 1;
  const rows = finite(raw.rows) ? Math.min(grid.rows - row + 1, Math.max(1, Math.round(raw.rows))) : 1;
  return { col, row, cols, rows };
}

export const scale = (v: unknown, fallback: number): number => (finite(v) && v > 0 ? Math.min(1, v) : fallback);

function normalizeFit(raw: unknown): ResolvedFrameFit {
  const f = isRecord(raw) ? raw : {};
  return {
    shrinkText: typeof f.shrinkText === 'boolean' ? f.shrinkText : DEFAULT_FRAME_FIT.shrinkText,
    minScale: scale(f.minScale, DEFAULT_FRAME_FIT.minScale),
    scaleImages: typeof f.scaleImages === 'boolean' ? f.scaleImages : DEFAULT_FRAME_FIT.scaleImages,
    imageMinScale: scale(f.imageMinScale, DEFAULT_FRAME_FIT.imageMinScale),
    preferContinue: typeof f.preferContinue === 'boolean' ? f.preferContinue : DEFAULT_FRAME_FIT.preferContinue,
  };
}

function normalizeOverflow(raw: unknown): FrameOverflowConfig {
  if (!isRecord(raw)) return {};
  const out: FrameOverflowConfig = {};
  if (typeof raw.continueIn === 'string' && raw.continueIn !== '') out.continueIn = raw.continueIn;
  if (typeof raw.mark === 'string' || raw.mark === false) out.mark = raw.mark;
  if (typeof raw.fromMark === 'string' && raw.fromMark.trim() !== '') out.fromMark = raw.fromMark;
  return out;
}

export const dim = (v: unknown): Dimension | undefined => (isFrameDimension(v) ? v : undefined);

/** A module's `width` (#1088) the engine can use: a length, a percentage
 *  above 0, or `'fill'`. */
export function moduleWidth(v: unknown): ModuleWidth | undefined {
  if (v === 'fill') return v;
  if (isRecord(v) && 'percent' in v) return finite(v.percent) && v.percent > 0 ? { percent: v.percent } : undefined;
  return dim(v);
}
/** A module's `grow` or `shrink` (#1095) the engine can use: a finite
 *  number, 0 or more. */
export function moduleFactor(v: unknown): number | undefined {
  return finite(v) && v >= 0 ? v : undefined;
}

const nonNegative = (v: unknown, fallback: number): number => (finite(v) && v >= 0 ? v : fallback);

/** A frame's `growWith` (#1117) the engine can use: `'children'`, or the
 *  names of a list (a name that is no string, or empty, is left out; a
 *  list with none is no list). */
export function growWithOf(v: unknown): { growWith?: 'children' | string[] } {
  if (v === 'children') return { growWith: 'children' };
  if (!Array.isArray(v)) return {};
  const names = [...new Set(v.filter((n): n is string => typeof n === 'string' && n.trim() !== ''))];
  return names.length > 0 ? { growWith: names } : {};
}

/** A frame as the layout reads it: every default filled in, sizes read
 *  from `width`/`height` and else `placement.size`, values the engine
 *  cannot use replaced by their default. */
export function normalizeFrame(
  frame: FrameConfig,
  grid?: Required<PageTemplateGrid>,
  where: { configPath: string; fieldPaths: Record<string, string> } = { configPath: '', fieldPaths: {} },
): ResolvedFrame {
  const f = frame as FrameConfig & Record<string, unknown>;
  const placement = isRecord(f.placement) ? f.placement : undefined;
  const cell = normalizeCell(f.grid, grid);
  const out: ResolvedFrame = {
    name: f.name,
    ...(placement ? { placement } : {}),
    ...(cell ? { grid: cell } : {}),
    width: normalizeFrameSize(f.width) ?? normalizeFrameSize(placement?.size?.width) ?? DEFAULT_FRAME.width,
    height: normalizeFrameSize(f.height) ?? normalizeFrameSize(placement?.size?.height) ?? DEFAULT_FRAME.height,
    layer: finite(f.layer) ? f.layer : DEFAULT_FRAME.layer,
    rotate: finite(f.rotate) ? f.rotate : DEFAULT_FRAME.rotate,
    verticalAlign: oneOf(FRAME_VERTICAL_ALIGNS, f.verticalAlign) ? f.verticalAlign : DEFAULT_FRAME.verticalAlign,
    columns: finite(f.columns) && f.columns >= 1 ? Math.round(f.columns) : DEFAULT_FRAME.columns,
    exclude: oneOf(FRAME_EXCLUDES, f.exclude) ? f.exclude : DEFAULT_FRAME.exclude,
    ...(f.wrap === 'contour' ? { wrap: 'contour' as const } : {}),
    ...(f.overlap === 'allow' ? { overlap: 'allow' as const } : {}),
    flow: f.flow === true,
    pin: f.pin === true,
    grow: nonNegative(f.grow, DEFAULT_FRAME.grow),
    shrink: nonNegative(f.shrink, DEFAULT_FRAME.shrink),
    priority: finite(f.priority) ? f.priority : DEFAULT_FRAME.priority,
    ...growWithOf(f.growWith),
    fit: normalizeFit(f.fit),
    overflow: normalizeOverflow(f.overflow),
    optional: f.optional === true,
    crossGutter: f.crossGutter === true,
    configPath: where.configPath,
    fieldPaths: where.fieldPaths,
  };
  for (const key of ['minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'columnGap'] as const) {
    const d = dim(f[key]);
    if (d) out[key] = d;
  }
  if (typeof f.style === 'string' && f.style !== '') out.style = f.style;
  if (isRecord(f.padding)) {
    const padding: Record<string, Dimension> = {};
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const d = dim(f.padding[side]);
      if (d) padding[side] = d;
    }
    out.padding = padding;
  }
  if (typeof f.next === 'string' && f.next !== '') out.next = f.next;
  if (oneOf(FRAME_TAKES, f.takes)) out.takes = f.takes;
  if (oneOf(FRAME_WRITING_MODES, f.writingMode)) out.writingMode = f.writingMode;
  if (oneOf(FRAME_DIRECTIONS, f.direction)) out.direction = f.direction;
  const rules = normalizeRules(f.rules);
  if (rules) out.rules = rules;
  const look = normalizeLook(f.look, LOOK_TREE);
  if (look) out.look = look as FrameLook;
  return out;
}

/** A frame's `look` (#976) with what the engine cannot use left out: a
 *  key that is not in the tree, a colour with no `hex`, a bad length. */
function normalizeLook(raw: unknown, tree: LookTree): Record<string, unknown> | undefined {
  if (!isRecord(raw)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, kind] of Object.entries(tree)) {
    const value = raw[key];
    if (kind === 'color') {
      if (isRecord(value) && typeof value.hex === 'string') out[key] = value;
    } else if (kind === 'tracking') {
      // A length that may be negative.
      if (isRecord(value) && finite(value.value) && typeof value.unit === 'string' && DIMENSION_UNITS.includes(value.unit)) out[key] = { value: value.value, unit: value.unit };
    } else {
      const inner = normalizeLook(value, kind);
      if (inner) out[key] = inner;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The named looks of `frameLooks` (#1089) the engine can use: entries
 *  with an id (the first of each id wins), each with what a frame's
 *  `look` could not use left out (`normalizeLook`); an entry that keeps no
 *  field still names a look (it changes nothing). None when the list
 *  holds no entry with an id. */
export function normalizeFrameLooks(raw: unknown): FrameLookEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: FrameLookEntry[] = [];
  const seen = new Set<string>();
  for (const e of raw) {
    if (!isRecord(e) || typeof e.id !== 'string' || e.id === '' || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push({ id: e.id, ...(typeof e.name === 'string' ? { name: e.name } : {}), ...(normalizeLook(e, LOOK_TREE) ?? {}) });
  }
  return out.length > 0 ? out : undefined;
}

/** The look a frame wears with a named look laid over its own (#1089):
 *  `over`'s fields (an entry's `id` and `name` left out) over `below`'s,
 *  key by key at every level. */
export function lookOver(below: FrameLook | undefined, over: FrameLook): FrameLook {
  const fields: Record<string, unknown> = { ...over };
  delete fields.id;
  delete fields.name;
  return mergeLook(below, fields) as FrameLook;
}

/** `look` over `below`, key by key at every level (colours and lengths
 *  replaced whole). */
export function mergeLook(below: unknown, look: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = isRecord(below) ? { ...below } : {};
  for (const [key, value] of Object.entries(look)) {
    if (value === undefined) continue;
    const here = out[key];
    out[key] = isRecord(value) && !('hex' in value) && !('unit' in value) && isRecord(here) ? mergeLook(here, value) : value;
  }
  return out;
}

/** A frame's `rules` (#914) with the values the engine cannot use left
 *  out (their defaults apply); none when it is not an object. */
function normalizeRules(raw: unknown): FrameRulesConfig | undefined {
  if (!isRecord(raw)) return undefined;
  const out: FrameRulesConfig = {};
  const every = raw.every === 'line' ? 'line' : dim(raw.every);
  if (every) out.every = every;
  if (isRecord(raw.color) && typeof raw.color.hex === 'string') out.color = raw.color as unknown as ColorValue;
  const width = dim(raw.width);
  if (width) out.width = width;
  if (isFrameDimension(raw.inset)) out.inset = raw.inset;
  else if (isRecord(raw.inset)) {
    const left = dim(raw.inset.left);
    const right = dim(raw.inset.right);
    out.inset = { ...(left ? { left } : {}), ...(right ? { right } : {}) };
  }
  return out;
}

export function normalizeGroup(entry: NamedEntry<FrameGroupConfig>, grid: Required<PageTemplateGrid> | undefined): ResolvedFrameGroup {
  const g = entry.value as FrameGroupConfig & Record<string, unknown>;
  const placement = isRecord(g.placement) ? g.placement : undefined;
  const cell = normalizeCell(g.grid, grid);
  const kind = oneOf(FRAME_GROUP_KINDS, g.kind) ? g.kind : DEFAULT_FRAME_GROUP.kind;
  const gap = dim(g.gap) ?? DEFAULT_FRAME_GROUP.gap;
  const names = (v: unknown): string[] => (Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string') : []);
  // A grid's own fields (#1061), only on a grid: other groups resolve as
  // they always did.
  const repeat = kind === 'grid' && isRecord(g.repeat) ? g.repeat : undefined;
  const repeatFrames = repeat ? [...new Set(names(repeat.frames))] : [];
  const max = repeat && finite(repeat.max) && repeat.max >= 1 ? Math.floor(repeat.max) : undefined;
  const gridFields: Partial<ResolvedFrameGroup> = kind === 'grid'
    ? {
      columns: finite(g.columns) && g.columns >= 1 ? Math.floor(g.columns) : 1,
      columnGap: dim(g.columnGap) ?? gap,
      rowGap: dim(g.rowGap) ?? gap,
      rowAlign: oneOf(FRAME_GRID_ROW_ALIGNS, g.rowAlign) ? g.rowAlign : 'stretch',
      ...(repeatFrames.length > 0 ? { repeat: { frames: repeatFrames, ...(max !== undefined ? { max } : {}) } } : {}),
    }
    : {};
  // A modules group (#1062), only when it says so: it takes the page's
  // modules, not frames of its own: a stack, or (#1088) a row or a grid of
  // them, or a group of them inside the modules stack it names (`within`).
  const modules = g.modules === true;
  const continueIn = modules && isRecord(g.overflow) && typeof g.overflow.continueIn === 'string' && g.overflow.continueIn !== '' ? g.overflow.continueIn : undefined;
  const within = modules && typeof g.within === 'string' && g.within !== '' && g.within !== g.name ? g.within : undefined;
  const templates = within !== undefined && Array.isArray(g.templates) ? [...new Set(names(g.templates))] : undefined;
  const moduleFields: Partial<ResolvedFrameGroup> = modules
    ? {
      modules: true,
      ...(continueIn !== undefined && within === undefined ? { overflow: { continueIn } } : {}),
      ...(within !== undefined ? { within } : {}),
      ...(templates ? { templates } : {}),
      // A grid of modules has no repeat; a row of them aligns its modules.
      ...(kind === 'grid' ? { ...gridFields, repeat: undefined } : {}),
      ...(kind === 'row' ? { rowAlign: oneOf(FRAME_GRID_ROW_ALIGNS, g.rowAlign) ? g.rowAlign : 'stretch' } : {}),
    }
    : {};
  if (moduleFields.repeat === undefined) delete moduleFields.repeat;
  return {
    name: g.name,
    kind,
    // A grid that repeats holds its set's frames.
    frames: modules ? [] : gridFields.repeat ? repeatFrames : names(g.frames),
    gap,
    ...(modules ? {} : gridFields),
    ...moduleFields,
    ...(placement ? { placement } : {}),
    ...(cell ? { grid: cell } : {}),
    align: oneOf(FRAME_GROUP_ALIGNS, g.align) ? g.align : DEFAULT_FRAME_GROUP.align,
    configPath: entry.configPath,
    fieldPaths: entry.fieldPaths,
  };
}
