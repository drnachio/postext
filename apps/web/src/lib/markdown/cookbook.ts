// Renditions of the Cookbook: the recipe list and one recipe with its
// ingredients, scripts and credits (#1276: split out of markdown.ts).
import { routing } from '@/i18n/routing';
import { siteLocale } from '@/i18n/locales';
import { SITE_URL, localizedUrl } from '@/lib/seo';
import { catalogRecipe } from '@/lib/cookbook/catalog';
import { docAnchorPath } from '@/lib/cookbook/docLinks';
import { pageImages, captureVariantFor, pdfDownload, sandboxLink } from '@/lib/cookbook/images';
import { recipeHref, writeupFor, getVisibleRecipes, getRecipe, getComposed } from '@/lib/cookbook/recipes';
import { loadRegistry } from '@/lib/cookbook/registry';
import { relatedRecipes } from '@/lib/cookbook/related';
import { testedOn } from '@/lib/cookbook/tested';
import { type Locale, type DocAnchor, type ComposedPen, type LicenseId, type Registry, type Recipe, type Credit, localizedText } from '@/lib/cookbook/types';
import { shownGotchas } from '@/lib/cookbook/validate';
import { REPO_URL, labelsFor } from './labels';
import { markdownUrl, type MdxComponentRenderers, mdxToMarkdown, collapseBlankLines } from './mdx';
import { header, plainSummary } from './pages';

// ---------------------------------------------------------------------------
// Cookbook
// ---------------------------------------------------------------------------

export const COOKBOOK_PATH = "/cookbook";
const COOKBOOK_SOURCE_URL = `${REPO_URL}/tree/main/cookbook`;

export function cookbookLocale(locale: string): Locale {
  return siteLocale(locale);
}

/** "Nº 012" / "N.º 012" */
function recipeNumber(n: number, locale: string): string {
  return `${labelsFor(locale).numberSign} ${String(n).padStart(3, "0")}`;
}

export function recipeMarkdownUrl(slug: string, locale: string): string {
  return markdownUrl(locale, recipeHref(slug));
}

/** A docs section as a link into its doc's Markdown rendition, or null
 *  when the heading no longer exists. */
function docMarkdownUrl(anchor: DocAnchor, locale: Locale): string | null {
  const path = docAnchorPath(anchor, locale);
  if (!path) return null;
  const [page, hash] = path.split("#");
  return `${markdownUrl(locale, page)}${hash ? `#${hash}` : ""}`;
}

function link(text: string, url: string | null | undefined): string {
  return url ? `[${text}](${url})` : text;
}

/** A fence one backtick longer than any run of backticks in `code`. */
function fenced(code: string, lang: string): string {
  const longest = Math.max(2, ...[...code.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(longest + 1);
  return `${fence}${lang}\n${code.replace(/\n+$/, "")}\n${fence}`;
}

/** Lines `a`–`b` (1-based, inclusive) of the composed script, fenced, with
 *  a comment naming them so a reader can find them in the whole file. */
function scriptExcerpt(pen: ComposedPen, [a, b]: [number, number], locale: string): string {
  const code = pen.js.split("\n").slice(a - 1, b).join("\n");
  return fenced(`// script.js, ${labelsFor(locale).lines} ${a}–${b}\n${code}`, "js");
}

/** A title as a sentence: a plain lowercase first word capitalised (never
 *  an identifier such as `fontFamily`), and a closing full stop. */
function sentence(text: string): string {
  const t = text.trim();
  if (!t) return "";
  const capitalised = /^[a-z]+(?=[\s,.:;!?]|$)/.test(t) ? t[0]!.toUpperCase() + t.slice(1) : t;
  return capitalised + (/[.!?…]$/.test(t) ? "" : ".");
}

function licenseName(license: LicenseId, locale: string): string {
  const labels = labelsFor(locale);
  if (license === "original") return labels.licenseOriginal;
  if (license === "PD") return labels.licensePD;
  if (license === "reproduction-authorised") return labels.licenseAuthorised;
  return license;
}

/** "Level 2 (Intermediate)" */
function levelText(level: number, registry: Registry, locale: Locale): string {
  const title = registry.taxonomy.levels.find((l) => l.id === level)?.title[locale];
  return `${labelsFor(locale).level} ${level}${title ? ` (${title})` : ""}`;
}

function genreText(recipe: Recipe, registry: Registry, locale: Locale): string {
  return recipe.meta.genres
    .map((id) => registry.taxonomy.genres.find((g) => g.id === id)?.title[locale] ?? id)
    .join(", ");
}

/** One line of a recipe list: `[Nº 012 · Title](….md): summary · level · genres`. */
function recipeListLine(recipe: Recipe, registry: Registry, locale: Locale): string {
  const fm = writeupFor(recipe, locale)?.frontmatter;
  const title = `${recipeNumber(recipe.meta.number, locale)} · ${fm?.title ?? recipe.slug}`;
  const facts = [fm?.summary, levelText(recipe.meta.level, registry, locale), genreText(recipe, registry, locale)];
  if (recipe.meta.status === "draft") facts.push(labelsFor(locale).draft);
  return `- [${title}](${recipeMarkdownUrl(recipe.slug, locale)}): ${facts.filter(Boolean).join(" · ")}`;
}

/** The Cookbook's contents (`/{locale}/cookbook.md`): every visible recipe,
 *  grouped by part and chapter, each linking to its own rendition. */
export function cookbookMarkdown(locale: string): string {
  const lang = cookbookLocale(locale);
  const labels = labelsFor(locale);
  const recipes = getVisibleRecipes();
  const lines = [
    header({ title: labels.cookbookTitle, description: labels.cookbookDesc, locale, path: COOKBOOK_PATH }),
    labels.cookbookIntro,
    "",
  ];
  if (recipes.length === 0) return [...lines, labels.noRecipes, ""].join("\n");
  const registry = loadRegistry();
  const { parts, chapters } = registry.taxonomy;
  for (const part of parts) {
    const shelves = chapters
      .filter((c) => c.part === part.id)
      .sort((a, b) => a.number - b.number)
      .map((chapter) => ({ chapter, recipes: recipes.filter((r) => r.meta.chapter === chapter.id) }))
      .filter((shelf) => shelf.recipes.length > 0);
    if (shelves.length === 0) continue;
    lines.push(`## ${labels.part} ${part.number} · ${part.title[lang]}`, "");
    for (const { chapter, recipes: shelf } of shelves) {
      lines.push(`### ${labels.chapter} ${chapter.number} · ${chapter.title[lang]}`, "", chapter.intro[lang], "");
      lines.push(...shelf.map((recipe) => recipeListLine(recipe, registry, lang)), "");
    }
  }
  return lines.join("\n");
}

/** How the write-up's components read in this recipe's rendition. */
function recipeRenderers(
  recipe: Recipe,
  pen: ComposedPen | null,
  registry: Registry,
  locale: Locale
): MdxComponentRenderers {
  const labels = labelsFor(locale);
  const pages = pageImages(recipe, locale);
  const pageUrl = (n: string | undefined) => {
    const page = pages.find((p) => String(p.n) === n);
    return page ? `${SITE_URL}${page.src}` : null;
  };
  return {
    block: {
      Excerpt: ({ region }) => {
        const found = region ? pen?.ranges.regions[region] : undefined;
        return found && pen ? scriptExcerpt(pen, found.lines, locale) : "";
      },
      PageShot: ({ page, caption }) => {
        const url = pageUrl(page);
        const alt = pages.find((p) => String(p.n) === page)?.alt ?? caption ?? "";
        const image = url ? `![${alt.replace(/[[\]]/g, "")}](${url})` : "";
        return [image, caption ? `*${caption}*` : ""].filter(Boolean).join("\n\n");
      },
      Gotcha: ({ id }) => {
        const gotcha = id ? registry.gotchas[id] : undefined;
        return gotcha ? `> **${labels.pitfall}:** ${sentence(gotcha.title[locale])} ${gotcha.body[locale]}` : "";
      },
    },
    inline: {
      Feature: ({ id }, children) => {
        const feature = id ? registry.features[id] : undefined;
        const text = children || feature?.label[locale] || id || "";
        return feature ? link(text, docMarkdownUrl(feature.docs, locale)) : text;
      },
      RecipeLink: ({ slug }, children) => {
        const target = slug ? getRecipe(slug) : null;
        const text = children || (target && writeupFor(target, locale)?.frontmatter.title) || slug || "";
        return target ? link(text, recipeMarkdownUrl(target.slug, locale)) : text;
      },
      PageRef: ({ page }, children) => link(children || `${labels.pages} ${page}`, pageUrl(page)),
    },
  };
}

/** The Ingredients section: features, config, APIs and type, linked to the
 *  docs' Markdown renditions. */
function ingredientsMarkdown(recipe: Recipe, registry: Registry, locale: Locale): string[] {
  const labels = labelsFor(locale);
  const { primary, also } = recipe.meta.features;
  const search = catalogRecipe(recipe, locale, registry, []).search;
  const captured = captureVariantFor(recipe, locale)?.data.detected;
  // Features the capture found in the code that recipe.json does not declare.
  const undeclared = (captured?.features ?? []).filter((id) => !primary.includes(id) && !also.includes(id));
  const featureLink = (id: string) => {
    const feature = registry.features[id];
    return feature ? link(feature.label[locale], docMarkdownUrl(feature.docs, locale)) : id;
  };
  const out: string[] = [`**${labels.teaches}**`, ""];
  for (const id of primary) {
    const feature = registry.features[id];
    out.push(`- ${featureLink(id)}${feature ? `: ${feature.definition[locale]}` : ""}`);
  }
  out.push("");
  const alsoUses = [...also, ...undeclared];
  if (alsoUses.length > 0) out.push(`**${labels.alsoUses}**`, "", ...alsoUses.map((id) => `- ${featureLink(id)}`), "");
  const configKeys = search.configKeys.filter((key) => /^[A-Za-z]+$/.test(key));
  if (configKeys.length > 0) {
    const items = configKeys.map((key) => {
      const anchor = registry.config[key];
      return link(`\`${key}\``, anchor ? docMarkdownUrl(anchor, locale) : null);
    });
    out.push(`**${labels.configAtAGlance}**`, "", `- ${items.join(", ")}`, "");
  }
  if (search.apis.length > 0) {
    const items = search.apis.map((api) => {
      const anchor = registry.apis[api];
      return link(`\`${api}\``, anchor ? docMarkdownUrl(anchor, locale) : null);
    });
    out.push(`**${labels.apis}**`, "", `- ${items.join(", ")}`, "");
  }
  const fonts = recipe.meta.credits.fonts;
  if (fonts.length > 0) {
    out.push(`**${labels.typefaces}**`, "", `- ${fonts.map((f) => `${f.family} (${f.license})`).join(", ")}`, "");
  }
  return out;
}

function creditLine(credit: Credit, locale: Locale): string {
  const labels = labelsFor(locale);
  const source = credit.source
    ? /^https?:\/\//.test(credit.source)
      ? ` ([${labels.source}](${credit.source}))`
      : ` (${credit.source})`
    : "";
  return `${localizedText(credit.what, locale)}: ${credit.who}${source}, ${licenseName(credit.license, locale)}`;
}

/** A recipe's rendition (`/{locale}/cookbook/<slug>.md`): the write-up with
 *  its generated sections, every excerpt expanded and the whole code. */
export function recipeMarkdown(slug: string, locale: string): string | null {
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) return null;
  const recipe = getRecipe(slug);
  if (!recipe) return null;
  const lang = cookbookLocale(locale);
  const labels = labelsFor(locale);
  const writeup = writeupFor(recipe, lang);
  if (!writeup) return null;
  const registry = loadRegistry();
  const { meta } = recipe;
  const { sections: headings } = registry.taxonomy;
  const path = recipeHref(slug);
  const pageUrl = localizedUrl(locale, path);

  let pen: ComposedPen | null = null;
  let composeError = "";
  try {
    pen = getComposed(slug, lang);
  } catch (error) {
    // Development only: a production build fails on the recipe page first.
    composeError = (error as Error).message;
  }
  const renderers = recipeRenderers(recipe, pen, registry, lang);
  const authored = (id: keyof typeof headings) => {
    const chunk = writeup.sections[id];
    return chunk ? mdxToMarkdown(chunk, locale, pageUrl, renderers) : "";
  };

  // Header facts.
  const chapter = registry.taxonomy.chapters.find((c) => c.id === meta.chapter);
  const outputs = meta.outputs.map((id) => registry.taxonomy.outputs.find((o) => o.id === id)?.title[lang] ?? id);
  const capture = recipe.capture;
  const requires = [`postext ≥ ${meta.engine.postext}`];
  if (meta.engine.postextPdf) requires.push(`postext-pdf ≥ ${meta.engine.postextPdf}`);
  let tested = "";
  if (capture) {
    // The release it was last verified on, else the one that pictured it (#735).
    const on = testedOn(capture);
    const versions = [on.postext, on.postextPdf && `postext-pdf ${on.postextPdf}`];
    tested = ` · ${labels.testedWith} ${versions.filter(Boolean).join(", ")} ${labels.testedOn} ${on.at.slice(0, 10)}`;
  }
  const pages = pageImages(recipe, lang);
  const pdf = pdfDownload(recipe, lang);
  const facts = [
    [
      `${labels.recipe} ${recipeNumber(meta.number, lang)}`,
      chapter?.title[lang],
      levelText(meta.level, registry, lang),
      `${labels.outputs}: ${outputs.join(", ")}`,
      meta.status === "draft" ? labels.draft : "",
    ]
      .filter(Boolean)
      .join(" · "),
    `${labels.genres}: ${genreText(recipe, registry, lang)}`,
    `${labels.requires} ${requires.join(", ")}${tested}`,
  ];
  if (pages.length > 0) {
    facts.push(`${labels.pages}: ${pages.map((p) => `[${p.label || p.n}](${SITE_URL}${p.src})`).join(", ")}`);
  }
  if (pdf) facts.push(`${labels.pdf}: ${SITE_URL}${pdf.href}`);
  const sandbox = sandboxLink(recipe, lang);
  if (sandbox) {
    const hash = `#recipe=${slug}&lang=${sandbox.variant}`;
    facts.push(`${labels.openInSandbox}: ${localizedUrl(locale, "/sandbox")}${hash} (.postext: ${SITE_URL}${sandbox.bundle})`);
  }
  facts.push(`${labels.lastUpdated}: ${meta.updated}`);

  const out: string[] = [
    header({ title: writeup.frontmatter.title, description: writeup.frontmatter.summary, locale, path, facts }),
  ];
  if (writeup.frontmatter.plain) out.push(plainSummary(locale, writeup.frontmatter.plain));

  // What you'll build, then the questions it answers.
  const questions = meta.answers
    .map((id, i) => (i === 0 && writeup.frontmatter.question) || registry.questions[id]?.text[lang])
    .filter((q): q is string => Boolean(q));
  out.push(`## ${headings.build[lang]}`, "", authored("build"), "");
  if (questions.length > 0) out.push(`**${labels.answers}:**`, "", ...questions.map((q) => `- ${q}`), "");

  // The short answer: the `answer` region.
  const answer = pen?.ranges.regions.answer;
  if (pen && answer) {
    out.push(`## ${headings.short[lang]}`, "");
    // Region titles are code comments, written in English (as on the page).
    if (answer.title && lang === "en") out.push(sentence(answer.title), "");
    out.push(scriptExcerpt(pen, answer.lines, lang), "");
  }

  out.push(`## ${headings.ingredients[lang]}`, "", ...ingredientsMarkdown(recipe, registry, lang));
  out.push(`## ${headings.method[lang]}`, "", authored("method"), "");

  // The whole recipe: every composed file.
  out.push(`## ${headings.whole[lang]}`, "");
  if (pen) {
    const scriptOnly = !pen.html && !pen.css;
    out.push(scriptOnly ? labels.wholeRecipeScript : labels.wholeRecipe, "");
    out.push(`- ${labels.sourceFolder}: ${COOKBOOK_SOURCE_URL}/${slug}`);
    const externals = [...(pen.pen.stylesheets ?? []), ...(pen.pen.scripts ?? [])];
    if (externals.length > 0) out.push(`- ${labels.externals}: ${externals.join(", ")}`);
    out.push("");
    if (pen.html) out.push("### index.html", "", fenced(pen.html, "html"), "");
    if (pen.css) out.push("### style.css", "", fenced(pen.css, "css"), "");
    out.push("### script.js", "", fenced(pen.js, "js"), "");
  } else {
    out.push(`${labels.notComposed}: ${composeError}`, "", `- ${labels.sourceFolder}: ${COOKBOOK_SOURCE_URL}/${slug}`, "");
  }

  const variations = authored("variations");
  if (variations) out.push(`## ${headings.variations[lang]}`, "", variations, "");

  // Pitfalls: the shared gotchas (a fixed one only while the recipe pins an
  // engine older than the fix), the warnings the recipe explains, then its own lines.
  const pitfalls: string[] = [];
  for (const id of shownGotchas(meta, registry.gotchas)) {
    const gotcha = registry.gotchas[id];
    if (!gotcha) continue;
    const fixed = gotcha.fixedIn ? ` (${labels.fixedIn} postext ${gotcha.fixedIn})` : "";
    pitfalls.push(`- **${sentence(gotcha.title[lang])}**${fixed} ${gotcha.body[lang]}`);
  }
  for (const kind of meta.explainsWarnings ?? []) {
    const warning = registry.warnings[kind];
    if (!warning) continue;
    const docs = warning.docs ? docMarkdownUrl(warning.docs, lang) : null;
    pitfalls.push(
      `- **${labels.warning}: ${warning.label[lang]}** (\`${kind}\`). ${warning.cause[lang]} ${labels.fix}: ${warning.fix[lang]}${
        docs ? ` ([${labels.docs}](${docs}))` : ""
      }`
    );
  }
  const ownPitfalls = authored("pitfalls");
  if (pitfalls.length > 0 || ownPitfalls) {
    out.push(`## ${headings.pitfalls[lang]}`, "", ...pitfalls);
    if (ownPitfalls) out.push(...(pitfalls.length > 0 ? [""] : []), ownPitfalls);
    out.push("");
  }

  // Credits.
  const { credits, license } = meta;
  const authors = credits.authors.map((a) =>
    a.github ? `${a.name} ([@${a.github}](https://github.com/${a.github}))` : a.url ? `[${a.name}](${a.url})` : a.name
  );
  out.push(`## ${headings.credits[lang]}`, "", `- ${labels.recipeBy}: ${authors.join(", ")}`);
  for (const credit of credits.text) out.push(`- ${labels.creditText}: ${creditLine(credit, lang)}`);
  for (const credit of credits.images) out.push(`- ${labels.creditImages}: ${creditLine(credit, lang)}`);
  if (credits.fonts.length > 0) {
    out.push(`- ${labels.creditType}: ${credits.fonts.map((f) => `${f.family} (${f.license})`).join(", ")}`);
  }
  out.push(`- ${labels.creditCode}: ${license.code} · ${labels.creditContent}: ${license.content}`, "");

  const related = relatedRecipes(slug);
  if (related.length > 0) {
    out.push(`## ${labels.related}`, "", ...related.map((r) => recipeListLine(r, registry, lang)), "");
  }

  return collapseBlankLines(out.join("\n")).trimEnd() + "\n";
}
