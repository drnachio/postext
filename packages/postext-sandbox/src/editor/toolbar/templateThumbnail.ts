/**
 * A page template drawn small (#864): its frames' empty boxes on the page,
 * for the editor's composed-page picker. The boxes are placed with the
 * engine's own frame geometry (`placeFrameBox`, in frame order) on a recto
 * of the book's page size; a frame whose height follows its content gets
 * a few lines' height, as an empty frame shows in the picker.
 *
 * Pure.
 */

import {
  dimensionToPx,
  frameOrder,
  framePlaceable,
  frameUnionRect,
  groupPlaceable,
  placeFrameBox,
  resolvePageConfig,
  resolvePageTemplate,
  type FrameRect,
  type PageTemplateSource,
  type PostextConfig,
  type ResolvedPageTemplate,
} from 'postext';
import { chainTargets } from './composedInsert.js';

export interface ThumbnailFrame {
  name: string;
  rect: FrameRect;
  rotate: number;
  /** Drawn with a callout style (a box), or frameless. */
  styled: boolean;
  /** Takes the running text, a heading, or only what a chain continues. */
  role: 'flow' | 'heading' | 'chained' | 'slot';
}

export interface TemplateThumbnail {
  id: string;
  name: string;
  /** The page (trim), in px at 72 dpi. */
  width: number;
  height: number;
  /** The content area the frames refer to by default. */
  content: FrameRect;
  frames: ThumbnailFrame[];
}

const DPI = 72;
/** Lines an `'auto'` frame shows in the picker. */
const AUTO_LINES = 3;

/** The thumbnail of `template` on the book's page, or null when the
 *  template cannot be resolved. */
export function templateThumbnail(config: PostextConfig, id: string, resolved?: ResolvedPageTemplate): TemplateThumbnail | null {
  const template = resolved ?? resolvePageTemplate(config as PageTemplateSource, id, { parity: 'recto' });
  if (!template) return null;
  const page = resolvePageConfig(config.page);
  const emPx = dimensionToPx(config.bodyText?.fontSize ?? { value: 10, unit: 'pt' }, DPI, 12);
  const px = (d: Parameters<typeof dimensionToPx>[0]) => dimensionToPx(d, DPI, emPx);
  const width = px(page.width);
  const height = px(page.height);
  // A recto: the inner margin (`left` when they mirror) at the spine side.
  const m = page.margins;
  const content: FrameRect = { x: px(m.left), y: px(m.top), width: width - px(m.left) - px(m.right), height: height - px(m.top) - px(m.bottom) };
  const trim: FrameRect = { x: 0, y: 0, width, height };
  const area = template.area === 'trim' || template.area === 'bleed' ? trim : content;
  const ctx = { areas: { area, page: trim, bleed: trim }, dpi: DPI, emPx };
  const rects = new Map<string, FrameRect>();
  const groupRect = (name: string): FrameRect | undefined => {
    const g = template.groups.find((gr) => gr.name === name);
    if (!g) return undefined;
    const own = groupPlaceable(g);
    if (own) return placeFrameBox(own, template, ctx, (n) => rects.get(n) ?? groupRect(n), () => 0);
    return frameUnionRect(g.frames.flatMap((n) => (rects.has(n) ? [rects.get(n)!] : [])));
  };
  const natural = () => AUTO_LINES * emPx * 1.4;
  for (const frame of frameOrder(template)) {
    rects.set(frame.name, placeFrameBox(framePlaceable(frame), template, ctx, (n) => rects.get(n) ?? groupRect(n), natural));
  }
  const chained = chainTargets(template.frames);
  return {
    id: template.id,
    name: template.name ?? template.id,
    width,
    height,
    content,
    frames: template.frames.map((f) => ({
      name: f.name,
      rect: rects.get(f.name) ?? { ...area, height: 0 },
      rotate: f.rotate,
      styled: f.style !== undefined,
      role: chained.has(f.name) ? 'chained' : f.flow ? 'flow' : f.takes ? 'heading' : 'slot',
    })),
  };
}

/** The template ids of the configuration, first of each id, in order. */
export function templateIds(config: PostextConfig): string[] {
  const list = (config as PageTemplateSource).pageTemplates;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of list) {
    const id = (t as { id?: unknown }).id;
    if (typeof id !== 'string' || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
