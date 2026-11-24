// The page of the book as the Design panel's editors read it: resolved
// with the document's language and direction (which decide the binding),
// with the character grid's margins when a grid is on.

import { resolveBodyTextConfig, resolveLayoutConfig, resolvePageConfig } from 'postext';
import type { PostextConfig, ResolvedBodyTextConfig, ResolvedLayoutConfig, ResolvedPageConfig } from 'postext';
import { documentComicDirection, documentDirection, documentLanguage } from '../../context/documentDirection.js';
import { toPt } from '../../controls/inputs/units.js';
import { defaultDocumentLocale } from '../../controls/language/hyphenation.js';
import { pageDrawingConfig } from '../sections/writing/cjkGridReadout.js';
import type { SpreadPage } from './spreadGeometry.js';

export interface BookSpread {
  page: ResolvedPageConfig;
  layout: ResolvedLayoutConfig;
  body: ResolvedBodyTextConfig;
  /** The document's language (the interface's when it names none). */
  language: string;
}

export function bookSpread(config: PostextConfig, uiLocale: string): BookSpread {
  const drawn = pageDrawingConfig(config);
  const language = documentLanguage(config, defaultDocumentLocale(uiLocale));
  const direction = documentDirection(config.direction, language);
  const layout = resolveLayoutConfig(drawn.layout);
  const page = resolvePageConfig(drawn.page, language, layout.writingMode, direction, documentComicDirection(config, language, layout.writingMode, direction));
  return { page, layout, body: resolveBodyTextConfig(config.bodyText, config.locale), language };
}

/** The page in points, as the spread geometry reads it. */
export function spreadPageOf(page: ResolvedPageConfig): SpreadPage {
  return {
    width: Math.max(toPt(page.width), 1),
    height: Math.max(toPt(page.height), 1),
    top: toPt(page.margins.top),
    bottom: toPt(page.margins.bottom),
    inner: toPt(page.margins.left),
    outer: toPt(page.margins.right),
    mirror: page.margins.mirror ?? false,
  };
}

/** Size and leading of the body text in points. A leading in `em` is a
 *  multiple of the size. */
export function bodyMetrics(body: ResolvedBodyTextConfig): { size: number; leading: number } {
  const size = toPt(body.fontSize);
  const relative = body.lineHeight.unit === 'em' || body.lineHeight.unit === 'rem';
  return { size, leading: relative ? body.lineHeight.value * size : toPt(body.lineHeight) };
}
