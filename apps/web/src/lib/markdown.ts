/**
 * Plain-Markdown renditions of the site's pages, for LLMs and agents
 * (`/<locale>/<page>.md`, `Accept: text/markdown`, `llms.txt`,
 * `llms-full.txt`). Everything is derived from the same sources the HTML
 * pages render — the MDX docs, the Cookbook's recipe folders and the message
 * files — so the two never drift.
 */
import { routing } from '@/i18n/routing';
import { getAllDocs } from '@/lib/docs';
import { SITE_NAME, SITE_URL } from '@/lib/seo';
import { FEATURE_KEYS, featureDocPath } from '@/lib/featureDocs';
import { GUIDE_BUNDLE_FILE, GUIDE_BUNDLE_PATH } from '@/lib/guideBundle';
import { getVisibleRecipes, recipeHref, getAllRecipes, writeupFor } from '@/lib/cookbook/recipes';
import { cookbookMarkdown, recipeMarkdown, COOKBOOK_PATH, cookbookLocale, recipeMarkdownUrl } from './markdown/cookbook';
import { labelsFor, messagesFor, REPO_URL, YOUTUBE_URL } from './markdown/labels';
import { markdownUrl } from './markdown/mdx';
import { homeMarkdown, docMarkdown, LEGAL_PAGES, legalMarkdown, type LegalPage, accessibilityMarkdown, sandboxMarkdown, GLOSSARY_PATH, glossaryMarkdown, stripTags, docsList } from './markdown/pages';

export { markdownUrl, mdxToMarkdown } from './markdown/mdx';
export type { MdxComponentRenderers } from './markdown/mdx';
export { docMarkdown, homeMarkdown, LEGAL_PAGES, legalMarkdown, accessibilityMarkdown, sandboxMarkdown, GLOSSARY_PATH, glossaryMarkdown } from './markdown/pages';
export type { LegalPage } from './markdown/pages';
export { cookbookMarkdown, recipeMarkdown } from './markdown/cookbook';

/**
 * Markdown for a localized path (`""`, `/docs/<slug>`, `/license`, …), or
 * `null` when the path has no rendition.
 */
export function pageMarkdown(locale: string, path: string): string | null {
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) return null;
  const clean = path.replace(/^\/+|\/+$/g, "");
  if (clean === "") return homeMarkdown(locale);
  if (clean === "docs") {
    const first = getAllDocs().find((d) => d.locales[locale]);
    return first ? docMarkdown(first.slug, locale) : null;
  }
  const doc = clean.match(/^docs\/([a-z0-9-]+)$/);
  if (doc) return docMarkdown(doc[1]!, locale);
  if (clean === "cookbook") return cookbookMarkdown(locale);
  const recipe = clean.match(/^cookbook\/([a-z0-9-]+)$/);
  if (recipe) return recipeMarkdown(recipe[1]!, locale);
  if ((LEGAL_PAGES as readonly string[]).includes(clean)) return legalMarkdown(clean as LegalPage, locale);
  if (clean === "accessibility") return accessibilityMarkdown(locale);
  if (clean === "sandbox") return sandboxMarkdown(locale);
  if (`/${clean}` === GLOSSARY_PATH) return glossaryMarkdown(locale);
  return null;
}

/** Every path with a Markdown rendition, per locale (for static generation). */
export function markdownPaths(locale: string): string[] {
  const docs = getAllDocs()
    .filter((d) => d.locales[locale])
    .map((d) => `/docs/${d.slug}`);
  const recipes = getVisibleRecipes().map((r) => recipeHref(r.slug));
  return ["", "/docs", ...docs, COOKBOOK_PATH, ...recipes, ...LEGAL_PAGES.map((p) => `/${p}`), "/accessibility", GLOSSARY_PATH, "/sandbox"];
}

// ---------------------------------------------------------------------------
// llms.txt
// ---------------------------------------------------------------------------

/** llms.txt's Cookbook section: one line per published recipe (drafts are
 *  noindex even when shown), each linking to its rendition (which holds the
 *  whole code), then the contents. Empty while there are no recipes. */
function cookbookList(locale: string): string[] {
  const recipes = getAllRecipes();
  if (recipes.length === 0) return [];
  const lang = cookbookLocale(locale);
  const labels = labelsFor(locale);
  return [
    `## ${labels.cookbook}`,
    "",
    ...recipes.map((recipe) => {
      const fm = writeupFor(recipe, lang)?.frontmatter;
      return `- [${fm?.title ?? recipe.slug}](${recipeMarkdownUrl(recipe.slug, locale)})${fm?.summary ? `: ${fm.summary}` : ""}`;
    }),
    `- [${labels.allRecipes}](${markdownUrl(locale, COOKBOOK_PATH)})`,
    "",
  ];
}

/** The published packages, each with its label key. */
const PACKAGES = [
  ["postext", "pkgPostext"],
  ["postext-pdf", "pkgPdf"],
  ["postext-epub", "pkgEpub"],
  ["postext-folio", "pkgFolio"],
  ["postext-citeproc", "pkgCiteproc"],
  ["postext-cli", "pkgCli"],
] as const;

/** The `llms.txt` index (https://llmstxt.org) for one locale. */
export function llmsTxt(locale: string): string {
  const m = messagesFor(locale);
  const labels = labelsFor(locale);
  const f = m.Features as Record<string, string>;
  const lines = [
    `# ${SITE_NAME}`,
    "",
    `> ${m.Metadata.description}`,
    "",
    m.Hero.subtitle,
    "",
    `- ${labels.install}: \`pnpm add postext\``,
    `- ${labels.home}: [${markdownUrl(locale)}](${markdownUrl(locale)})`,
    `- ${labels.fullDocs}: [${labels.fullText}](${SITE_URL}${locale === routing.defaultLocale ? "" : `/${locale}`}/llms-full.txt)`,
    "",
    `## ${labels.features}`,
    "",
    ...FEATURE_KEYS.map((k) => {
      const [page, hash] = featureDocPath(k, locale).split("#");
      const url = `${markdownUrl(locale, page)}${hash ? `#${hash}` : ""}`;
      return `- [${stripTags(f[`${k}Title`]!)}](${url}): ${stripTags(f[`${k}Description`]!)}`;
    }),
    "",
    `## ${labels.packages}`,
    "",
    ...PACKAGES.map(([name, key]) => `- [${name}](https://www.npmjs.com/package/${name}): ${labels[key]}`),
    "",
    `## ${labels.docs}`,
    "",
    ...docsList(locale),
    "",
    ...cookbookList(locale),
    `## ${labels.links}`,
    "",
    `- [GitHub](${REPO_URL}): ${labels.linkGithub}`,
    `- [YouTube](${YOUTUBE_URL}): ${labels.linkYoutube}`,
    `- [${labels.sandbox}](${markdownUrl(locale, "/sandbox")}): ${labels.sandboxDesc}`,
    `- [${labels.agentSkills}](${SITE_URL}/.well-known/agent-skills/index.json): ${labels.agentSkillsDesc}`,
    `- [${labels.webmcp}](${markdownUrl(locale, "/docs/sandbox")}): ${labels.webmcpDesc}`,
    `- [${GUIDE_BUNDLE_FILE}](${SITE_URL}${GUIDE_BUNDLE_PATH}): ${labels.guideBundleDesc}`,
    "",
    `## ${labels.optional}`,
    "",
    `- [${m.Glossary.title}](${markdownUrl(locale, GLOSSARY_PATH)}): ${m.Glossary.metaDescription}`,
    `- [${m.Footer.mitLicense}](${markdownUrl(locale, "/license")})`,
    `- [${m.Footer.privacyPolicy}](${markdownUrl(locale, "/privacy-policy")})`,
    `- [${m.Footer.cookiePolicy}](${markdownUrl(locale, "/cookie-policy")})`,
    `- [${m.Footer.accessibility}](${markdownUrl(locale, "/accessibility")})`,
  ];
  for (const other of routing.locales.filter((l) => l !== locale)) {
    lines.push(`- [${labelsFor(other).localeDocs}](${SITE_URL}/${other}/llms.txt)`);
  }
  return lines.join("\n") + "\n";
}

/** Pushes every ATX heading outside fenced code one level down. */
function demoteHeadings(markdown: string): string {
  let fence: string | null = null;
  return markdown
    .split("\n")
    .map((line) => {
      const f = line.match(/^\s*(`{3,}|~{3,})/);
      if (f) {
        if (fence === null) fence = f[1]!;
        else if (line.trim().replace(/[`~]/g, "") === "") fence = null;
        return line;
      }
      return fence === null ? line.replace(/^(#{1,5}) /, "#$1 ") : line;
    })
    .join("\n");
}

/** Every documentation page of one locale concatenated (`llms-full.txt`). */
export function llmsFullTxt(locale: string): string {
  const m = messagesFor(locale);
  const docs = getAllDocs()
    .filter((d) => d.locales[locale])
    .map((d) => docMarkdown(d.slug, locale))
    .filter((s): s is string => Boolean(s))
    // Demote each page one level so the file has a single H1.
    .map(demoteHeadings);
  return [`# ${SITE_NAME}`, "", `> ${m.Metadata.description}`, "", ...docs].join("\n\n") + "\n";
}
