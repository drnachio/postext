import type { ChapterStyleConfig, PostextConfig } from '../types.js';
import { extractFrontmatter } from '../parse/frontmatter.js';
import { DIRECTIVE_RE } from '../parse/blockParser.js';
import { parseDirectiveAttrs } from '../parse/attrs.js';
import { mergeConfigLayers, type ConfigOverride } from './configLayers.js';
import { BOOK_PAGE_KEYS, BOOK_WIDE_KEYS } from './bookKeys.js';

/** The front-matter key a chapter names its style with. */
export const CHAPTER_STYLE_KEY = 'chapterStyle';

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

/** Offset of the first line after a leading front-matter block (found by
 *  its `---` lines, as the Sandbox and the bundles find it), 0 without
 *  one. */
function bodyStart(markdown: string): number {
  const bom = markdown.startsWith('﻿') ? 1 : 0;
  const first = markdown.indexOf('\n', bom);
  if (first === -1 || markdown.slice(bom, first).replace(/\r$/, '') !== '---') return bom;
  let pos = first + 1;
  while (pos < markdown.length) {
    const nl = markdown.indexOf('\n', pos);
    const end = nl === -1 ? markdown.length : nl;
    if (markdown.slice(pos, end).replace(/\r$/, '') === '---') return nl === -1 ? markdown.length : nl + 1;
    if (nl === -1) break;
    pos = nl + 1;
  }
  return bom;
}

/** The `:::part` fence a chapter opens with — its first line of text after
 *  the front matter —, with the style it names (`style="…"`). `undefined`
 *  for a chapter that opens with anything else. */
export function openingPart(markdown: string): { style?: string } | undefined {
  let pos = bodyStart(markdown);
  while (pos < markdown.length) {
    const nl = markdown.indexOf('\n', pos);
    const line = markdown.slice(pos, nl === -1 ? markdown.length : nl).trim();
    if (line) {
      const m = DIRECTIVE_RE.exec(line);
      if (!m || m[1] !== 'part') return undefined;
      const style = parseDirectiveAttrs(m[2] ?? '').style?.trim();
      return style ? { style } : {};
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  return undefined;
}

/**
 * The style a chapter is set in: the one its front matter names; else,
 * for a chapter that opens with a `:::part` fence, the style of that part
 * (none when the fence names none); else `inherited`, the style of the
 * part the chapter belongs to (`continuation.part.style`).
 */
export function chapterStyleIdOf(markdown: string, inherited?: string): string | undefined {
  const own = chapterStyleOf(markdown);
  if (own) return own;
  const part = openingPart(markdown);
  return part ? part.style : inherited;
}

/** The settings of a chapter style that stay the book's and are ignored:
 *  top-level keys of `BOOK_WIDE_KEYS`, and `page.<key>` for the page keys
 *  of `BOOK_PAGE_KEYS`. */
export function bookSettingsOf(style: Pick<ChapterStyleConfig, 'config'>): string[] {
  const config = style.config ?? {};
  const out: string[] = BOOK_WIDE_KEYS.filter((k) => config[k] !== undefined);
  const page = config.page;
  if (page && typeof page === 'object') {
    for (const k of BOOK_PAGE_KEYS) if ((page as Record<string, unknown>)[k] !== undefined) out.push(`page.${k}`);
  }
  return out;
}

const merged = new WeakMap<PostextConfig, Map<string, PostextConfig>>();
/** The configurations {@link chapterConfig} made: a chapter's, never
 *  styled again. */
const styled = new WeakSet<PostextConfig>();

/**
 * The configuration a chapter in style `styleId` is laid out with: the
 * style's override merged over the book's (`mergeConfigLayers`), without
 * the settings that stay the book's (`BOOK_WIDE_KEYS`, `BOOK_PAGE_KEYS`).
 * The book's own configuration for a chapter without a style or with one
 * the book does not define. The same object for the same book
 * configuration and style, so the caches keyed on configurations keep
 * working. The merged configuration keeps the book's list of styles (its
 * warnings name the styles the book defines); handed back here, it is
 * returned as it is.
 */
export function chapterConfig(config: PostextConfig, styleId: string | undefined): PostextConfig {
  if (!styleId || styled.has(config)) return config;
  const style = config.chapterStyles?.find((s) => s.id === styleId);
  if (!style) return config;
  let perConfig = merged.get(config);
  if (!perConfig) merged.set(config, (perConfig = new Map()));
  const hit = perConfig.get(styleId);
  if (hit) return hit;
  const override: ConfigOverride = { ...style.config };
  for (const key of BOOK_WIDE_KEYS) delete override[key];
  if (override.page && typeof override.page === 'object') {
    const page = { ...(override.page as Record<string, unknown>) };
    for (const key of BOOK_PAGE_KEYS) delete page[key];
    override.page = page;
  }
  const out = mergeConfigLayers(config, override);
  perConfig.set(styleId, out);
  styled.add(out);
  return out;
}

/** The configuration of the chapter whose source is `markdown`, in the
 *  part whose style is `inherited` (see {@link chapterStyleIdOf}). */
export function chapterConfigOf(config: PostextConfig, markdown: string, inherited?: string): PostextConfig {
  return config.chapterStyles?.length ? chapterConfig(config, chapterStyleIdOf(markdown, inherited)) : config;
}
