/**
 * Links from the Cookbook into the docs. A `DocAnchor` names a doc and the
 * text of one of its headings per locale; the anchor id comes from the same
 * slugger the doc page renders with (`extractToc`), so it survives accents
 * and punctuation, and a renamed heading resolves to null (the registry
 * test fails) instead of shipping a dead fragment.
 *
 * Isomorphic Node: relative `.ts` imports only.
 */
import { extractToc, getDocSource, type TocItem } from "../docs.ts";
import type { DocAnchor, Locale } from "./types.ts";
import { LOCALES } from "./types.ts";

const memo = new Map<string, { at: number; toc: TocItem[] | null }>();
/** How long development reuses a doc's headings. A recipe's Markdown
 *  rendition resolves dozens of anchors, and every miss re-reads and
 *  re-slugs the whole doc (configuration-en.mdx takes about 10 ms). */
const DEV_TTL_MS = 1500;

/** A doc's headings; memoised in production, for DEV_TTL_MS in development. */
function tocFor(slug: string, locale: Locale): TocItem[] | null {
  const key = `${slug}|${locale}`;
  const hit = memo.get(key);
  if (hit && (process.env.NODE_ENV === "production" || Date.now() - hit.at < DEV_TTL_MS)) return hit.toc;
  const doc = getDocSource(slug, locale);
  const toc = doc ? extractToc(doc.source) : null;
  memo.set(key, { at: Date.now(), toc });
  return toc;
}

/** The heading an anchor names in a locale, or null when the doc or the
 *  heading does not exist. */
export function resolveDocAnchor(anchor: DocAnchor, locale: Locale): { slug: string; id: string; text: string } | null {
  const text = anchor.heading[locale];
  if (!text) return null;
  const item = tocFor(anchor.slug, locale)?.find((i) => i.text === text);
  return item ? { slug: anchor.slug, id: item.id, text: item.text } : null;
}

/** Locale-less path, "/docs/<slug>#<id>", or null. */
export function docAnchorPath(anchor: DocAnchor, locale: Locale): string | null {
  const hit = resolveDocAnchor(anchor, locale);
  return hit ? `/docs/${hit.slug}#${hit.id}` : null;
}

/** "/{locale}/docs/<slug>#<id>", or null when the anchor does not resolve. */
export function docAnchor(anchor: DocAnchor, locale: Locale): string | null {
  const path = docAnchorPath(anchor, locale);
  return path ? `/${locale}${path}` : null;
}

/** Whether an internal docs link (`/es/docs/configuration#estilo-de-tablas`,
 *  with or without a fragment) points at an existing doc and heading. */
export function docLinkExists(href: string): boolean {
  const m = /^\/(en|es|ca|zh|ar)\/docs\/([a-z0-9-]+)\/?(?:#(.+))?$/.exec(href);
  if (!m || !(LOCALES as readonly string[]).includes(m[1])) return false;
  const toc = tocFor(m[2], m[1] as Locale);
  if (!toc) return false;
  if (!m[3]) return true;
  const id = decodeURIComponent(m[3]);
  return toc.some((item) => item.id === id);
}
