// Renditions of the site's own pages: the shared header, video
// transcripts, docs, home, legal pages, accessibility, Sandbox and glossary
// (#1276: split out of markdown.ts).
import { routing } from '@/i18n/routing';
import { siteLocale } from '@/i18n/locales';
import { glossarySections } from '@/lib/glossary/glossary';
import { type DocMeta, getDocSource, getAllDocs } from '@/lib/docs';
import { localizedUrl, SITE_URL } from '@/lib/seo';
import { FEATURE_KEYS, featureDocPath } from '@/lib/featureDocs';
import { GUIDE_BUNDLE_FILE, GUIDE_BUNDLE_PATH } from '@/lib/guideBundle';
import { type TranscriptVideo, TRANSCRIPTS } from '@/components/landing/transcripts';
import { COOKBOOK_PATH } from './cookbook';
import { labelsFor, messagesFor, REPO_URL, NPM_URL, YOUTUBE_URL } from './labels';
import { markdownUrl, mdxToMarkdown } from './mdx';

// ---------------------------------------------------------------------------
// Page renditions
// ---------------------------------------------------------------------------

export function header(opts: {
  title: string;
  description?: string;
  locale: string;
  path: string;
  availableLocales?: readonly string[];
  meta?: Pick<DocMeta, "lastUpdated" | "readingTime">;
  /** Extra facts, listed after the HTML version (without the "- "). */
  facts?: string[];
}): string {
  const labels = labelsFor(opts.locale);
  const lines = [`# ${opts.title}`, ""];
  if (opts.description) lines.push(`> ${opts.description}`, "");
  const facts: string[] = [`- ${labels.canonical}: ${localizedUrl(opts.locale, opts.path)}`];
  for (const fact of opts.facts ?? []) facts.push(`- ${fact}`);
  if (opts.meta?.lastUpdated) facts.push(`- ${labels.lastUpdated}: ${opts.meta.lastUpdated}`);
  if (opts.meta?.readingTime) facts.push(`- ${labels.readingTime}: ${opts.meta.readingTime}`);
  const others = (opts.availableLocales ?? routing.locales).filter((l) => l !== opts.locale);
  if (others.length > 0) {
    facts.push(
      `- ${labels.otherLanguages}: ${others.map((l) => `[${l}](${markdownUrl(l, opts.path)})`).join(", ")}`
    );
  }
  lines.push(...facts, "");
  return lines.join("\n");
}

/** A narrated video's transcript (what is shown and what is said), as the
 *  page's disclosure under the player lists it. */
export function transcriptMarkdown(video: TranscriptVideo, locale: string): string {
  const t = messagesFor(locale).Transcript;
  const lang = siteLocale(locale);
  const blocks = TRANSCRIPTS[video][lang] ?? TRANSCRIPTS[video].en;
  // The scenes name the tags they show (<h1>, <p>): as code, not markup.
  const literal = (s: string) => s.replace(/<\/?[a-z][a-z0-9]*>/g, "`$&`");
  return [
    `**${t.summary}.** ${t.note}`,
    "",
    ...blocks.map((b) =>
      [`- ${b.time}`, b.scene && `*${t.onScreen}:* ${literal(b.scene)}`, b.narration && `*${t.narration}:* ${literal(b.narration)}`]
        .filter(Boolean)
        .join(" · ")
    ),
    "",
  ].join("\n");
}

/** The "In short" block of a rendition: the page in plain words (WCAG 3.1.5). */
export function plainSummary(locale: string, text: string | undefined): string {
  if (!text) return "";
  return `## ${messagesFor(locale).PlainLanguage.heading}\n\n${text}\n`;
}

/** Removes the MDX doc's own leading `# Title` so the rendition's header owns it. */
function dropLeadingH1(markdown: string): string {
  return markdown.replace(/^# .+\n+/, "");
}

export function docMarkdown(slug: string, locale: string): string | null {
  const doc = getDocSource(slug, locale);
  if (!doc) return null;
  const path = `/docs/${slug}`;
  const entry = getAllDocs().find((d) => d.slug === slug);
  const availableLocales = routing.locales.filter((l) => entry?.locales[l]);
  const body = dropLeadingH1(mdxToMarkdown(doc.source, locale, localizedUrl(locale, path)));
  return `${header({
    title: doc.meta.title,
    description: doc.meta.description,
    locale,
    path,
    availableLocales,
    meta: doc.meta,
  })}\n${doc.meta.plainSummary ? `${plainSummary(locale, doc.meta.plainSummary)}\n` : ""}${body}\n`;
}

export function docsList(locale: string, withMarkdownLinks = true): string[] {
  return getAllDocs()
    .map((d) => d.locales[locale])
    .filter((m): m is DocMeta => Boolean(m))
    .map((m) => {
      const url = withMarkdownLinks
        ? markdownUrl(locale, `/docs/${m.slug}`)
        : localizedUrl(locale, `/docs/${m.slug}`);
      return `- [${m.title}](${url})${m.description ? `: ${m.description}` : ""}`;
    });
}

const QUICK_START = `import { buildDocument, renderToHtml } from "postext";

const doc = buildDocument({
  markdown: "# Hello World\\n\\nYour content here.",
});

const html = renderToHtml(doc);`;

const API_PREVIEW = `import { buildDocument, renderToHtml } from "postext";

const doc = buildDocument(
  { markdown },
  {
    layout: { layoutType: "double" },
    bodyText: {
      textAlign: "justify",
      hyphenation: { enabled: true, locale: "en-us" },
    },
  }
);

const html = renderToHtml(doc);`;

const BUNDLE_PARTS = ["config", "chapters", "fonts", "resources", "images"] as const;

/** Message markup (`<code>`, `<em>`) → plain Markdown text. Everything
 *  from a `<` to the next `>` goes in one scan, so no tag can reassemble
 *  from what a removal leaves behind. */
export function stripTags(text: string): string {
  const coded = text.replace(/<code>(.*?)<\/code>/g, "`$1`");
  let out = "";
  let inTag = false;
  for (const c of coded) {
    if (c === "<") inTag = true;
    else if (c === ">") inTag = false;
    else if (!inTag) out += c;
  }
  return out;
}

export function homeMarkdown(locale: string): string {
  const m = messagesFor(locale);
  const labels = labelsFor(locale);
  const f = m.Features as Record<string, string>;
  const b = m.Bundle as Record<string, string>;
  return [
    header({ title: m.Metadata.title, description: m.Metadata.description, locale, path: "" }),
    plainSummary(locale, m.PlainLanguage.home),
    `## ${stripTags(m.Hero.title)}`,
    "",
    m.Hero.subtitle,
    "",
    `## ${m.Showreel.title}`,
    "",
    transcriptMarkdown("showreel", locale),
    `## ${m.About.titleLine1} ${m.About.titleLine2}`,
    "",
    m.About.paragraph1,
    "",
    `${m.About.paragraph2prefix}[${m.About.pretextLink}](https://github.com/chenglou/pretext)${m.About.paragraph2suffix}`,
    "",
    `## ${m.Features.title}`,
    "",
    ...FEATURE_KEYS.flatMap((k) => [
      `### ${f[`${k}Title`]}`,
      "",
      f[`${k}Description`]!,
      "",
      `[${f.docsLink}](${localizedUrl(locale, featureDocPath(k, locale))})`,
      "",
    ]),
    `## ${m.ApiPreview.title}`,
    "",
    stripTags(m.ApiPreview.description),
    "",
    "```ts",
    API_PREVIEW,
    "```",
    "",
    `## ${m.HowItWorks.title}`,
    "",
    `1. **${m.HowItWorks.step1Title}.** ${m.HowItWorks.step1Description}`,
    `2. **${m.HowItWorks.step2Title}.** ${m.HowItWorks.step2Description}`,
    `3. **${m.HowItWorks.step3Title}.** ${m.HowItWorks.step3Description}`,
    "",
    `## ${m.Bundle.title}`,
    "",
    m.Bundle.lead,
    "",
    m.Bundle.paragraph1,
    "",
    stripTags(m.Bundle.paragraph2),
    "",
    ...BUNDLE_PARTS.map((k) => `- **${b[`${k}Title`]}**`),
    "",
    `### ${m.Bundle.demoTitle}`,
    "",
    m.Bundle.demoDescription,
    "",
    `- [${GUIDE_BUNDLE_FILE}](${SITE_URL}${GUIDE_BUNDLE_PATH})`,
    "",
    `## ${m.Install.title}`,
    "",
    "```bash",
    "pnpm add postext",
    "```",
    "",
    "```ts",
    QUICK_START,
    "```",
    "",
    `## ${labels.docs}`,
    "",
    ...docsList(locale),
    "",
    `## ${labels.links}`,
    "",
    `- [GitHub](${REPO_URL})`,
    `- [npm](${NPM_URL})`,
    `- [YouTube](${YOUTUBE_URL})`,
    `- [${labels.cookbook}](${markdownUrl(locale, COOKBOOK_PATH)}): ${labels.cookbookDesc}`,
    `- [${labels.sandbox}](${localizedUrl(locale, "/sandbox")}): ${labels.sandboxDesc}`,
    `- [${m.Footer.mitLicense}](${markdownUrl(locale, "/license")})`,
    "",
  ].join("\n");
}

export const LEGAL_PAGES = ["license", "privacy-policy", "cookie-policy"] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];

function linkify(text: string, tag: string, url: string): string {
  return text.replace(new RegExp(`<${tag}>(.*?)</${tag}>`), `[$1](${url})`);
}

export function legalMarkdown(page: LegalPage, locale: string): string {
  const m = messagesFor(locale);
  const path = `/${page}`;
  if (page === "license") {
    const t = m.License;
    return [
      header({ title: t.title, description: t.metaDescription, locale, path }),
      plainSummary(locale, m.PlainLanguage.license),
      t.copyright,
      "",
      t.grant,
      "",
      t.condition,
      "",
      t.disclaimer,
      "",
      linkify(t.sourceText, "repoLink", REPO_URL),
      "",
    ].join("\n");
  }
  if (page === "privacy-policy") {
    const t = m.PrivacyPolicy;
    return [
      header({ title: t.title, description: t.metaDescription, locale, path }),
      plainSummary(locale, m.PlainLanguage.privacy),
      `*${t.lastUpdated}*`,
      "",
      `## ${t.controllerTitle}`, "", t.controllerText, "",
      `## ${t.dataCollectedTitle}`, "", t.dataCollectedText, "",
      `## ${t.legalBasisTitle}`, "", t.legalBasisText, "",
      `## ${t.cookiesTitle}`, "", linkify(t.cookiesText, "cookieLink", markdownUrl(locale, "/cookie-policy")), "",
      `## ${t.rightsTitle}`, "", t.rightsText, "",
      ...[t.rightAccess, t.rightRectification, t.rightErasure, t.rightPortability, t.rightObjection, t.rightWithdraw].map((r) => `- ${r}`),
      "",
      `## ${t.childrenTitle}`, "", t.childrenText, "",
      `## ${t.contactTitle}`, "", t.contactText, "",
    ].join("\n");
  }
  const t = m.CookiePolicy;
  return [
    header({ title: t.title, description: t.metaDescription, locale, path }),
    plainSummary(locale, m.PlainLanguage.cookies),
    `*${t.lastUpdated}*`,
    "",
    `## ${t.whatAreCookiesTitle}`, "", t.whatAreCookiesText, "",
    `## ${t.cookiesWeUseTitle}`, "", t.cookiesWeUseText, "",
    `| ${t.tableName} | ${t.tableCategory} | ${t.tableDuration} | ${t.tablePurpose} |`,
    "| --- | --- | --- | --- |",
    `| \`postext_consent\` | ${t.categoryNecessary} | ${t.duration365} | ${t.purposeConsent} |`,
    "",
    `## ${t.categoriesTitle}`, "",
    `- **${t.categoryNecessaryLabel}:** ${t.categoryNecessaryDesc}`,
    `- **${t.categoryAnalyticsLabel}:** ${t.categoryAnalyticsDesc}`,
    `- **${t.categoryMarketingLabel}:** ${t.categoryMarketingDesc}`,
    "",
    `## ${t.manageCookiesTitle}`, "", t.manageCookiesText, "",
    `## ${t.moreInfoTitle}`, "", linkify(t.moreInfoText, "privacyLink", markdownUrl(locale, "/privacy-policy")), "",
  ].join("\n");
}

/** The accessibility statement (app/[locale]/accessibility/page.tsx). */
export function accessibilityMarkdown(locale: string): string {
  const t = messagesFor(locale).AccessibilityStatement;
  const list = (items: string[]) => items.map((i) => `- ${i}`);
  return [
    header({ title: t.title, description: t.metaDescription, locale, path: "/accessibility" }),
    `*${t.lastUpdated}*`,
    "",
    `## ${t.targetTitle}`, "", t.targetText, "",
    `## ${t.prefsTitle}`, "", t.prefsText, "",
    ...list([t.prefsTheme, t.prefsAlign, t.prefsSpacing, t.prefsWidth, t.prefsColors, t.prefsZoom]),
    "",
    t.sandboxTargets,
    "",
    `## ${t.keyboardTitle}`, "",
    ...list([t.keyboardTab, t.keyboardSkip, t.keyboardActivate, t.keyboardEscape, t.keyboardSearch]),
    "",
    `## ${t.limitationsTitle}`, "", t.limitationsIntro, "",
    ...list(t.limitations),
    "",
    `## ${t.reportTitle}`, "", linkify(t.reportText, "issuesLink", `${REPO_URL}/issues`), "",
  ].join("\n");
}

/** The Sandbox is an app: its rendition says what it does and leads to its guide. */
export function sandboxMarkdown(locale: string): string {
  const t = messagesFor(locale).Sandbox;
  const labels = labelsFor(locale);
  const guide = getAllDocs().find((d) => d.slug === "sandbox")?.locales[locale];
  return [
    header({ title: t.metaTitle, description: t.metaDescription, locale, path: "/sandbox" }),
    labels.sandboxDesc,
    "",
    ...(guide ? [`- [${guide.title}](${markdownUrl(locale, "/docs/sandbox")})${guide.description ? `: ${guide.description}` : ""}`] : []),
    `- [${GUIDE_BUNDLE_FILE}](${SITE_URL}${GUIDE_BUNDLE_PATH}): ${labels.guideBundleDesc}`,
    `- ${labels.webmcp}: ${labels.webmcpDesc}`,
    "",
  ].join("\n");
}

export const GLOSSARY_PATH = "/glossary";

/** The glossary: every term under its category, then the abbreviations. */
export function glossaryMarkdown(locale: string): string {
  const t = messagesFor(locale).Glossary;
  const { categories, abbreviations } = glossarySections(siteLocale(locale));
  const title = {
    type: t.categoryType,
    cjk: t.categoryCjk,
    japanese: t.categoryJapanese,
    arabic: t.categoryArabic,
    web: t.categoryWeb,
  } as const;
  const out = [header({ title: t.title, description: t.metaDescription, locale, path: GLOSSARY_PATH }), t.lead, ""];
  for (const c of categories) {
    out.push(`## ${title[c.category]}`, "");
    for (const term of c.terms) {
      out.push(`- **${term.term}**${term.native ? ` (${term.native})` : ""}: ${term.definition}`);
    }
    out.push("");
  }
  out.push(`## ${t.abbreviations}`, "", t.abbreviationsLead, "");
  for (const a of abbreviations) out.push(`- **${a.abbr}**: ${a.title}`);
  out.push("");
  return out.join("\n");
}
