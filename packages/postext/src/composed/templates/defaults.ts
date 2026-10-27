// The defaults a page template's frames, groups and label styles fill in,
// the words each choice takes, and the small readers the rest share
// (#1276: split out of templates.ts).
import type { Dimension } from '../../types.js';
import type { ResolvedFrameFit, FrameSize, ResolvedPageTemplate } from '../types.js';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const ZERO: Dimension = { value: 0, unit: 'mm' };

export const DEFAULT_FRAME_FIT: Readonly<ResolvedFrameFit> = {
  shrinkText: true,
  minScale: 0.9,
  scaleImages: true,
  imageMinScale: 0.8,
  preferContinue: true,
};

/** What a frame that sets nothing comes to (besides its name). */
export const DEFAULT_FRAME = {
  width: 'fill' as FrameSize,
  height: 'auto' as FrameSize,
  layer: 1,
  rotate: 0,
  verticalAlign: 'top' as const,
  columns: 1,
  exclude: 'none' as const,
  flow: false,
  pin: false,
  grow: 0,
  shrink: 0,
  priority: 0,
  optional: false,
  crossGutter: false,
};

export const DEFAULT_FRAME_GROUP = {
  kind: 'stack' as const,
  gap: ZERO,
  align: 'start' as const,
};

export const DEFAULT_PAGE_TEMPLATE = {
  area: 'content' as const,
  spread: false,
  gutter: ZERO,
  role: 'composed',
};

/** The `role` of a module template (#1062, DESIGN §12.7). */
export const MODULE_ROLE = 'module';

/** Whether a resolved template is a module (#1062): a page fence never lays
 *  one (`moduleAsPage`). */
export function isModuleTemplate(template: Pick<ResolvedPageTemplate, 'role'> | undefined): boolean {
  return template?.role === MODULE_ROLE;
}

export const DEFAULT_LABEL_STYLE = {
  fontStyle: 'normal' as const,
  textTransform: 'none' as const,
  minScale: 0.85,
};

export const FRAME_VERTICAL_ALIGNS = ['top', 'middle', 'bottom', 'justify'] as const;
export const FRAME_EXCLUDES = ['none', 'push'] as const;
export const FRAME_WRAPS = ['box', 'contour'] as const;
export const FRAME_OVERLAPS = ['check', 'allow'] as const;
export const FRAME_TAKES = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'toc'] as const;
export const FRAME_GROUP_KINDS = ['stack', 'row', 'grid'] as const;
export const FRAME_GRID_ROW_ALIGNS = ['start', 'center', 'end', 'stretch'] as const;
export const FRAME_GROUP_ALIGNS = ['start', 'center', 'end', 'space-between'] as const;
export const TEMPLATE_AREAS = ['content', 'trim', 'bleed'] as const;
export const FRAME_WRITING_MODES = ['horizontal-tb', 'vertical-rl'] as const;
export const FRAME_DIRECTIONS = ['ltr', 'rtl'] as const;
export const LABEL_FONT_STYLES = ['normal', 'italic'] as const;
export const LABEL_TEXT_TRANSFORMS = ['none', 'uppercase'] as const;
export const LABEL_OVERLAPS = ['check', 'allow'] as const;
/** `LabelStyle.align` and `LabelStyle.kind` (#1058). */
export const LABEL_ALIGNS = ['start', 'center', 'end'] as const;
export const LABEL_KINDS = ['legend'] as const;

/** The shape of a frame's `look` (#976): which keys it has and what each
 *  holds, a colour or a length. */
export const LOOK_TREE = {
  background: 'color',
  border: { color: 'color' },
  stripe: { color: 'color' },
  icon: { color: 'color' },
  marker: { color: 'color', rule: { color: 'color' } },
  titleStyle: { color: 'color' },
  body: { color: 'color', boldColor: 'color', italicColor: 'color', letterSpacing: 'tracking' },
  label: { color: 'color', background: 'color', rule: { color: 'color' } },
} as const;
export type LookTree = { readonly [key: string]: 'color' | 'tracking' | LookTree };

export const DIMENSION_UNITS = ['cm', 'mm', 'in', 'pt', 'px', 'em', 'rem'];

// ---------------------------------------------------------------------------
// Small readers
// ---------------------------------------------------------------------------

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

/** A length the engine can use: a finite, non-negative value in a known
 *  unit. */
export function isFrameDimension(v: unknown): v is Dimension {
  return isRecord(v) && finite(v.value) && v.value >= 0 && typeof v.unit === 'string' && DIMENSION_UNITS.includes(v.unit);
}

/** `v` as a frame size, or undefined when it is none. A percentage is
 *  clamped to 0 … 100. */
export function normalizeFrameSize(v: unknown): FrameSize | undefined {
  if (v === 'auto' || v === 'fill') return v;
  if (isRecord(v) && 'percent' in v) {
    return finite(v.percent) ? { percent: Math.min(100, Math.max(0, v.percent)) } : undefined;
  }
  return isFrameDimension(v) ? { value: v.value, unit: v.unit } : undefined;
}
