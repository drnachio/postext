/**
 * The character grid (`cjk.grid`, 字格 / 版心; clreq §7.1.1): a Chinese type
 * area is authored as the body size × characters per line × lines per page,
 * plus the line gap and, with two columns, the gutter — not as margins.
 *
 * A pre-pass (`applyCjkGrid`, run by `resolveAllConfig` before anything is
 * resolved) rewrites the config so that every consumer reads ordinary
 * values: each column is `charsPerLine` ems of the body size wide, the
 * gutter of a two-column page a whole number of ems (the one written,
 * rounded, at least one), the type area `linesPerPage` lines of the body's
 * line height tall; and the page margins are set so the type area sits in
 * the middle of the area the configured margins leave, which act as
 * minimums (a mirrored book keeps its inner and outer margins apart, each
 * grown by the same amount). A grid larger than that area is reduced to
 * what fits and reported (`cjkGridClamped`); unset numbers take what fits.
 *
 * The computation runs on logical axes: along the line (the inline axis:
 * the page's width in horizontal text, its height in vertical text,
 * `layout.writingMode: 'vertical-rl'`) and across lines (the block axis).
 * A `oneAndHalf` layout is snapped as a single column of `charsPerLine`
 * ems; its two columns are then cut from that width as usual.
 */

import type { PostextConfig, Dimension } from '../types';
import { resolvePageConfig } from '../defaults/page';
import { resolveBodyTextConfig } from '../defaults/bodyText';
import { resolveLayoutConfig } from '../defaults/layout';
import { dimensionToPx } from '../units';

/** The grid of a config as the pre-pass sets it (px at the page's dpi). */
export interface CjkGridGeometry {
  /** Characters per line and lines per column in use. */
  charsPerLine: number;
  linesPerPage: number;
  /** The numbers as written, when the grid had to reduce them. */
  clamped: { charsPerLine?: number; linesPerPage?: number };
  columns: 1 | 2;
  /** The body size (one character) and the line pitch, px. */
  em: number;
  pitch: number;
  /** The gutter between two columns, in ems. */
  gutterEm: number;
  /** The type area, px: along the line and across lines. */
  inline: number;
  block: number;
  /** The margins the grid sets, px (`left`/`right` are inner/outer when
   *  the margins are mirrored). */
  margins: { top: number; bottom: number; left: number; right: number };
  /** The text runs down the page. */
  vertical: boolean;
  dpi: number;
}

const EPS = 1e-9;

function px(dim: Dimension, dpi: number, base: number): number {
  return dimensionToPx(dim, dpi, base);
}

/**
 * The grid a config asks for, or undefined when `cjk.grid.enabled` is not
 * set. Pure: reads the config, resolves what it needs.
 */
export function cjkGridGeometry(config: PostextConfig | undefined): CjkGridGeometry | undefined {
  const grid = config?.cjk?.grid;
  if (!grid || grid.enabled !== true) return undefined;
  const locale = config?.locale;
  const page = resolvePageConfig(config?.page, locale);
  const body = resolveBodyTextConfig(config?.bodyText, locale);
  const layout = resolveLayoutConfig(config?.layout);
  const dpi = page.dpi;
  const em = px(body.fontSize, dpi, 16);
  const lh = body.lineHeight;
  const pitch = lh.unit === 'em' || lh.unit === 'rem' ? em * lh.value : px(lh, dpi, em);
  if (!(em > 0) || !(pitch > 0)) return undefined;
  const width = px(page.width, dpi, em);
  const height = px(page.height, dpi, em);
  const m = page.margins;
  const top = px(m.top, dpi, em);
  const bottom = px(m.bottom, dpi, em);
  const left = px(m.left, dpi, em);
  const right = px(m.right, dpi, em);
  // The writing mode lives on the layout (vertical text is added by the
  // vertical writing mode); read it without depending on its type.
  const vertical = (config?.layout as { writingMode?: string } | undefined)?.writingMode === 'vertical-rl';
  const availInline = vertical ? height - top - bottom : width - left - right;
  const availBlock = vertical ? width - left - right : height - top - bottom;
  const columns: 1 | 2 = layout.layoutType === 'double' ? 2 : 1;
  const gutterEm = columns === 2 ? Math.max(1, Math.round(px(layout.gutterWidth, dpi, em) / em)) : 0;
  const maxChars = Math.max(1, Math.floor((availInline - gutterEm * em * (columns - 1)) / columns / em + EPS));
  const maxLines = Math.max(1, Math.floor(availBlock / pitch + EPS));
  const wantChars = positiveInt(grid.charsPerLine);
  const wantLines = positiveInt(grid.linesPerPage);
  const charsPerLine = wantChars !== undefined ? Math.min(wantChars, maxChars) : maxChars;
  const linesPerPage = wantLines !== undefined ? Math.min(wantLines, maxLines) : maxLines;
  const clamped: CjkGridGeometry['clamped'] = {};
  if (wantChars !== undefined && wantChars > charsPerLine) clamped.charsPerLine = wantChars;
  if (wantLines !== undefined && wantLines > linesPerPage) clamped.linesPerPage = wantLines;
  const inline = columns * charsPerLine * em + (columns - 1) * gutterEm * em;
  const block = linesPerPage * pitch;
  // The type area in the middle of what the margins leave: each margin
  // grows by half the slack (or shrinks, when even one line or character
  // does not fit).
  const slackInline = (availInline - inline) / 2;
  const slackBlock = (availBlock - block) / 2;
  const margins = vertical
    ? { top: top + slackInline, bottom: bottom + slackInline, left: left + slackBlock, right: right + slackBlock }
    : { top: top + slackBlock, bottom: bottom + slackBlock, left: left + slackInline, right: right + slackInline };
  return { charsPerLine, linesPerPage, clamped, columns, em, pitch, gutterEm, inline, block, margins, vertical, dpi };
}

function positiveInt(n: unknown): number | undefined {
  const v = typeof n === 'string' ? Number(n) : n;
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.floor(v) : undefined;
}

/**
 * The config with the character grid applied (see the module comment):
 * `page.margins`, `layout.gutterWidth` (two columns) and the grid's numbers
 * in use, written in px. The same object when the grid is off.
 */
export function applyCjkGrid(config: PostextConfig | undefined): PostextConfig | undefined {
  const g = cjkGridGeometry(config);
  if (!g || !config) return config;
  const dim = (value: number): Dimension => ({ value, unit: 'px' });
  const layout = g.columns === 2 ? { ...config.layout, gutterWidth: dim(g.gutterEm * g.em) } : config.layout;
  return {
    ...config,
    page: {
      ...config.page,
      margins: {
        ...config.page?.margins,
        top: dim(g.margins.top),
        bottom: dim(g.margins.bottom),
        left: dim(g.margins.left),
        right: dim(g.margins.right),
      },
    },
    ...(layout ? { layout } : {}),
    cjk: { ...config.cjk, grid: { ...config.cjk!.grid, charsPerLine: g.charsPerLine, linesPerPage: g.linesPerPage } },
  };
}

/** The colour of the character-grid overlay: a light grey on any paper. */
export const CHARACTER_GRID_COLOR = 'rgba(128, 128, 128, 0.45)';

/** The cells of the character grid on a page, for the overlay
 *  (`cjk.grid.show`): each column's left edge, the cell size (one em of the
 *  body size) and the top of each row's cells. A row's cell is the
 *  character's em box on the line: from 0.88 em above the line's baseline
 *  (set 0.8 of the line pitch down) to 0.12 em below it. Undefined when the
 *  grid is off or hidden. The geometry is the page's content area, in the
 *  frame its blocks are laid out in. */
export interface CjkGridCells {
  cell: number;
  chars: number;
  columns: number[];
  rows: number[];
}

export function cjkGridCells(
  resolved: { cjk?: { grid?: { show?: boolean; charsPerLine?: number; linesPerPage?: number } }; bodyText: { fontSize: Dimension }; layout: { layoutType: string; gutterWidth: Dimension }; page: { dpi: number } },
  contentArea: { x: number; y: number },
  pitch: number,
): CjkGridCells | undefined {
  const grid = resolved.cjk?.grid;
  if (!grid?.show || !grid.charsPerLine || !grid.linesPerPage) return undefined;
  const dpi = resolved.page.dpi;
  const em = dimensionToPx(resolved.bodyText.fontSize, dpi, 16);
  if (!(em > 0) || !(pitch > 0)) return undefined;
  const count = resolved.layout.layoutType === 'double' ? 2 : 1;
  const gutter = count === 2 ? dimensionToPx(resolved.layout.gutterWidth, dpi, em) : 0;
  const columns: number[] = [];
  for (let c = 0; c < count; c++) columns.push(contentArea.x + c * (grid.charsPerLine * em + gutter));
  const rows: number[] = [];
  for (let j = 0; j < grid.linesPerPage; j++) rows.push(contentArea.y + j * pitch + pitch * 0.8 - em * 0.88);
  return { cell: em, chars: grid.charsPerLine, columns, rows };
}
