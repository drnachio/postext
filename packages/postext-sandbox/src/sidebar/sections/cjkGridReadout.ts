'use client';

import { useMemo } from 'react';
import { applyCjkGrid, cjkGridGeometry, resolvePageConfig } from 'postext';
import type { CjkGridGeometry, Dimension, PostextConfig } from 'postext';
import { useSandboxSelector } from '../../context/SandboxContext';
import { formatNumber } from '../../controls/units';

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

/** The config the pages are set with, for the Sandbox's page drawings:
 *  with the character grid on, its margins, gutter and side column
 *  (`applyCjkGrid`) instead of the minimums the author wrote. The grid
 *  writes its lengths in px at the page's dpi; the drawings read px at
 *  96 dpi, so they are handed back in points. */
export function pageDrawingConfig(config: PostextConfig): PostextConfig {
  const applied = applyCjkGrid(config);
  if (!applied || applied === config) return config;
  const dpi = resolvePageConfig(config.page).dpi;
  const pt = (d: Dimension | undefined): Dimension | undefined => (d && d.unit === 'px' ? { value: (d.value / dpi) * 72, unit: 'pt' } : d);
  const m = applied.page?.margins;
  return {
    ...applied,
    ...(applied.page && m ? { page: { ...applied.page, margins: { ...m, top: pt(m.top), bottom: pt(m.bottom), left: pt(m.left), right: pt(m.right) } } } : {}),
    ...(applied.layout ? { layout: { ...applied.layout, gutterWidth: pt(applied.layout.gutterWidth) } } : {}),
  };
}

/** A length in px at `dpi` as millimetres, to one decimal, written as
 *  the Sandbox's UI locale writes numbers (`103,7` in Spanish). */
export function mmText(px: number, dpi: number, uiLocale: string): string {
  return formatNumber(Math.round((px / dpi) * 25.4 * 10) / 10, uiLocale);
}

/** A label with the grid's margins filled in (`__top__` … `__right__`). */
export function gridMarginsText(template: string, g: CjkGridGeometry, uiLocale: string): string {
  return template
    .replace('__top__', mmText(g.margins.top, g.dpi, uiLocale))
    .replace('__bottom__', mmText(g.margins.bottom, g.dpi, uiLocale))
    .replace('__left__', mmText(g.margins.left, g.dpi, uiLocale))
    .replace('__right__', mmText(g.margins.right, g.dpi, uiLocale));
}
