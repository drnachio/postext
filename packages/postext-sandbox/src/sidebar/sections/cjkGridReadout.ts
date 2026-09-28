'use client';

import { useMemo } from 'react';
import { cjkGridGeometry } from 'postext';
import type { CjkGridGeometry } from 'postext';
import { useSandboxSelector } from '../../context/SandboxContext';

/** The character grid (`cjk.grid`) the config sets, or undefined when it is
 *  off: what the Page and East Asian typography sections read out. */
export function useCjkGrid(): CjkGridGeometry | undefined {
  const grid = useSandboxSelector((s) => s.config.cjk?.grid);
  const page = useSandboxSelector((s) => s.config.page);
  const bodyText = useSandboxSelector((s) => s.config.bodyText);
  const layout = useSandboxSelector((s) => s.config.layout);
  const locale = useSandboxSelector((s) => s.config.locale);
  return useMemo(
    () => (grid?.enabled ? cjkGridGeometry({ page, bodyText, layout, locale, cjk: { grid } }) : undefined),
    [grid, page, bodyText, layout, locale],
  );
}

/** A length in px at `dpi` as millimetres, to one decimal. */
export function mmText(px: number, dpi: number): string {
  return (Math.round((px / dpi) * 25.4 * 10) / 10).toString();
}

/** A label with the grid's margins filled in (`__top__` … `__right__`). */
export function gridMarginsText(template: string, g: CjkGridGeometry): string {
  return template
    .replace('__top__', mmText(g.margins.top, g.dpi))
    .replace('__bottom__', mmText(g.margins.bottom, g.dpi))
    .replace('__left__', mmText(g.margins.left, g.dpi))
    .replace('__right__', mmText(g.margins.right, g.dpi));
}
