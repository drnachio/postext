import type { PostextConfig } from '../types.js';
import { extractFrontmatter } from '../parse/frontmatter.js';
import { mergeConfigLayers, type ConfigOverride } from './configLayers.js';

/** The front-matter key a chapter names its style with. */
export const CHAPTER_STYLE_KEY = 'chapterStyle';

/** The page settings a chapter style cannot change: one trim, resolution,
 *  set of cut lines and binding for the whole book. */
const BOOK_PAGE_KEYS = ['sizePreset', 'width', 'height', 'dpi', 'cutLines', 'binding'];

/** A `chapterStyle:` line a later chapter's blanked front matter keeps. */
const STYLE_LINE = /^chapterStyle:[ \t]*["']?[\w.-]+["']?[ \t]*$/;

/**
 * A front-matter block (its `---` lines included) blanked for a chapter
 * after the first: every character but the line breaks a space, so source
 * offsets stay and no metadata of it is read as the book's — but for its
 * `chapterStyle:` line, kept with the `---` around it, so the chapter's
 * own layout still knows its style.
 */
export function blankChapterFrontmatter(block: string): string {
  const lines = block.split('\n');
  const keep = lines.findIndex((l) => STYLE_LINE.test(l.replace(/\r$/, '')));
  if (keep < 0) return block.replace(/[^\n\r]/g, ' ');
  const close = lines.findIndex((l, i) => i > 0 && l.replace(/\r$/, '') === '---');
  return lines.map((l, i) => (i === 0 || i === keep || i === close ? l : l.replace(/[^\r]/g, ' '))).join('\n');
}

/** The style a chapter's front matter names, if any. */
export function chapterStyleOf(markdown: string): string | undefined {
  if (!markdown.startsWith('---')) return undefined;
  try {
    const value = extractFrontmatter(markdown).metadata[CHAPTER_STYLE_KEY];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

const merged = new WeakMap<PostextConfig, Map<string, PostextConfig>>();

/**
 * The configuration a chapter in style `styleId` is laid out with: the
 * style's override merged over the book's (`mergeConfigLayers`), without
 * the page settings that stay the book's. The book's own configuration for
 * a chapter without a style or with one the book does not define. The same
 * object for the same book configuration and style, so the caches keyed on
 * configurations keep working.
 */
export function chapterConfig(config: PostextConfig, styleId: string | undefined): PostextConfig {
  if (!styleId) return config;
  const style = config.chapterStyles?.find((s) => s.id === styleId);
  if (!style) return config;
  let perConfig = merged.get(config);
  if (!perConfig) merged.set(config, (perConfig = new Map()));
  const hit = perConfig.get(styleId);
  if (hit) return hit;
  // The merged configuration names no styles: a chapter laid out with it
  // is not styled twice.
  const override: ConfigOverride = { ...style.config, chapterStyles: null };
  if (override.page && typeof override.page === 'object') {
    const page = { ...(override.page as Record<string, unknown>) };
    for (const key of BOOK_PAGE_KEYS) delete page[key];
    override.page = page;
  }
  const out = mergeConfigLayers(config, override);
  perConfig.set(styleId, out);
  return out;
}

/** The configuration of the chapter whose source is `markdown`. */
export function chapterConfigOf(config: PostextConfig, markdown: string): PostextConfig {
  return config.chapterStyles?.length ? chapterConfig(config, chapterStyleOf(markdown)) : config;
}

/** A section break inside a chapter (`::section{style="…"}`, on a line of
 *  its own): from it to the next break the chapter is set in that chapter
 *  style, from a new page; `::section` alone returns to the chapter's own
 *  settings. */
export interface SectionBreak {
  /** Source offsets of the break's line (its line break excluded). */
  start: number;
  end: number;
  style?: string;
}

const SECTION_LINE = /^::section(?:\{\s*style\s*=\s*["']([^"']*)["']\s*\})?[ \t]*$/;
const FENCE = /^(`{3,}|~{3,})/;

/** The section breaks of a chapter's source, in order: outside code
 *  fences and the front matter. */
export function sectionBreaks(markdown: string): SectionBreak[] {
  if (!markdown.includes('::section')) return [];
  const out: SectionBreak[] = [];
  let fence: string | undefined;
  let pos = 0;
  let inFrontmatter = markdown.startsWith('---');
  let first = true;
  while (pos <= markdown.length) {
    const nl = markdown.indexOf('\n', pos);
    const end = nl === -1 ? markdown.length : nl;
    const line = markdown.slice(pos, end).replace(/\r$/, '');
    if (inFrontmatter) {
      if (!first && line === '---') inFrontmatter = false;
    } else {
      const f = FENCE.exec(line.trimStart());
      if (f) {
        if (!fence) fence = f[1]![0]!;
        else if (f[1]![0] === fence) fence = undefined;
      } else if (!fence) {
        const m = SECTION_LINE.exec(line.trim());
        if (m) out.push({ start: pos, end: pos + line.length, ...(m[1]?.trim() ? { style: m[1].trim() } : {}) });
      }
    }
    first = false;
    if (nl === -1) break;
    pos = nl + 1;
  }
  return out;
}

const sectionMerged = new WeakMap<PostextConfig, Map<string, PostextConfig>>();

/** The configuration of a section in style `styleId` of a chapter set with
 *  `chapterCfg`: the style (from the book's `styles`) merged over the
 *  chapter's settings, the book's page settings kept. */
export function sectionConfig(chapterCfg: PostextConfig, styles: PostextConfig['chapterStyles'], styleId: string | undefined): PostextConfig {
  const style = styleId ? styles?.find((s) => s.id === styleId) : undefined;
  if (!style) return chapterCfg;
  let perConfig = sectionMerged.get(chapterCfg);
  if (!perConfig) sectionMerged.set(chapterCfg, (perConfig = new Map()));
  const hit = perConfig.get(style.id);
  if (hit) return hit;
  const out = chapterConfig({ ...chapterCfg, chapterStyles: styles }, style.id);
  perConfig.set(style.id, out);
  return out;
}
