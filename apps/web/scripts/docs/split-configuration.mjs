/**
 * Splits the Configuration reference into its pages (#655). Run once:
 *
 *   cd apps/web && node scripts/docs/split-configuration.mjs [--skip-recipes a,b,c]
 *
 * The seven `docs/configuration-<locale>.mdx` files of BASE are cut at their
 * `##` sections into the pages of `split-configuration.data.json`, the same
 * way in every language: a section goes whole to one page and no line is
 * rewritten except the address of a link. The script then
 *
 * - leaves `docs/configuration-<locale>.mdx` as the entry page: the
 *   introduction and the index, which lists every section on its new page;
 * - rewrites every link to a Configuration anchor in the docs, the recipe
 *   write-ups, the READMEs and the skill references, so each points at the
 *   page that now holds the heading;
 * - moves the `docs: { slug: "configuration" }` entries of the Cookbook
 *   registries to the page of their heading;
 * - renumbers `order` in every docs page;
 * - writes `src/lib/configurationAnchors.json`: every heading id of the old
 *   single page, per language, under the page that holds it now (the data of
 *   the entry page's redirect).
 *
 * It reads the old page from git and checks that the split loses and repeats
 * nothing. The split is done: a full run now would write the pages again as
 * they were on that day, over whatever was edited since. What stays useful is
 *
 *   node scripts/docs/split-configuration.mjs --only-recipes a,b,c
 *
 * which rewrites nothing but the links of those recipes' write-ups (the ones
 * a first run left out with `--skip-recipes`).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import GithubSlugger from "github-slugger";

/** The commit whose single-page Configuration reference is split. */
const BASE = "6cb2a860";
const LAST_UPDATED = "2026-10-10";
const LOCALES = ["en", "es", "ca", "zh", "ar", "ja", "pt"];
const ROOT = path.resolve(import.meta.dirname, "../../../..");
const DOCS = path.join(ROOT, "docs");
const COOKBOOK = path.join(ROOT, "cookbook");
const ENTRY = "configuration";
const data = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "split-configuration.data.json"), "utf8"));

/** Reading order of the docs after the split. */
const ORDER = [
  "introduction",
  "architecture",
  ENTRY,
  ...data.pages.map((p) => p.slug),
  "justification",
  "document-format",
  "chinese-layout",
  "arabic-layout",
  "japanese-layout",
  "comics",
  "contributing",
  "sandbox",
  "skill",
  "command-line",
];

const listArg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : new Set(process.argv[i + 1].split(","));
};
const SKIP_RECIPES = listArg("--skip-recipes") ?? new Set();
/** When set, only the write-ups of these recipes are written. */
const ONLY_RECIPES = listArg("--only-recipes");

const report = [];
const fail = (message) => {
  throw new Error(message);
};

/** The `#`–`######` headings outside fenced code. */
function headings(lines) {
  const out = [];
  let fence = null;
  lines.forEach((line, i) => {
    const mark = line.match(/^(`{3,}|~{3,})/)?.[1][0];
    if (mark) {
      fence = fence === null ? mark : fence === mark ? null : fence;
      return;
    }
    if (fence !== null) return;
    const m = line.match(/^(#{1,6})\s+(.+)$/);
    if (m) out.push({ level: m[1].length, text: m[2].trim(), line: i });
  });
  return out;
}

const quote = (text) => (text.includes("'") ? JSON.stringify(text) : `'${text}'`);

function readingTime(locale, minutes) {
  if (locale === "zh") return `${minutes}分钟`;
  if (locale === "ja") return `${minutes}分`;
  if (locale === "ar") return minutes === 2 ? "دقيقتان" : minutes <= 10 ? `${minutes} دقائق` : `${minutes} دقيقة`;
  return `${minutes} min`;
}

function metadata(file, meta) {
  return [
    `{/* docs/${file} */}`,
    "",
    "export const metadata = {",
    `  title: ${quote(meta.title)},`,
    `  sidebarTitle: ${quote(meta.sidebarTitle)},`,
    `  description: ${quote(meta.description)},`,
    `  lang: '${meta.lang}',`,
    `  lastUpdated: '${LAST_UPDATED}',`,
    `  readingTime: '${meta.readingTime}',`,
    `  order: ${meta.order},`,
    ...(meta.parent ? [`  parent: '${meta.parent}',`] : []),
    `  plainSummary: ${JSON.stringify(meta.plainSummary)},`,
    "};",
  ];
}

/** Drops the blank lines at the end. */
function trimEnd(lines) {
  const out = [...lines];
  while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
  return out;
}

// ---------------------------------------------------------------------------
// The old page of each language, cut into sections
// ---------------------------------------------------------------------------

const sectionPage = new Map();
data.pages.forEach((page, i) => page.sections.forEach((s) => sectionPage.set(s, i)));

function readOld(locale) {
  const source = execFileSync("git", ["show", `${BASE}:docs/${ENTRY}-${locale}.mdx`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
  const lines = source.split("\n");
  const all = headings(lines);
  const slugger = new GithubSlugger();
  for (const h of all) h.id = slugger.slug(h.text);
  const h2 = all.filter((h) => h.level === 2);
  const sections = h2.map((h, i) => ({
    heading: h,
    lines: lines.slice(h.line, h2[i + 1]?.line ?? lines.length),
    headings: all.filter((x) => x.line >= h.line && x.line < (h2[i + 1]?.line ?? lines.length)),
  }));
  const preamble = lines.slice(0, h2[0].line);
  if ([...preamble, ...sections.flatMap((s) => s.lines)].join("\n") !== source) fail(`${locale}: sections do not add up`);
  return { locale, source, lines, all, sections, preamble };
}

const old = Object.fromEntries(LOCALES.map((l) => [l, readOld(l)]));

// Same headings, at the same levels and in the same order, in every language.
for (const l of LOCALES) {
  const levels = (x) => x.all.map((h) => h.level).join("");
  if (levels(old[l]) !== levels(old.en)) fail(`${l}: heading structure differs from the English page`);
  if (/<[a-zA-Z][^>{}]*\sid="[^"]+"/.test(old[l].source)) {
    report.push(`${l}: the old page has explicit id attributes (not in the anchor map)`);
  }
}

/** Section ordinal → page index (-1: the entry page). */
const pageOfSection = old.en.sections.map((s) => {
  if (s.heading.text === "Index") return -1;
  const page = sectionPage.get(s.heading.text);
  if (page === undefined) fail(`Section in no page: ${s.heading.text}`);
  return page;
});
if (pageOfSection.filter((p) => p === -1).length !== 1) fail("Expected one Index section");
for (const [name] of sectionPage) {
  if (!old.en.sections.some((s) => s.heading.text === name)) fail(`No such section: ${name}`);
}

const slugOfPage = (page) => (page === -1 ? ENTRY : data.pages[page].slug);

// ---------------------------------------------------------------------------
// Old anchor → the page that holds it and its id there
// ---------------------------------------------------------------------------

/** locale → old id → { slug, id, heading }. */
const anchors = {};
/** locale → slug → the headings of the new page with their new ids, in order. */
const newHeadings = {};

for (const l of LOCALES) {
  const o = old[l];
  anchors[l] = new Map();
  newHeadings[l] = {};
  const place = (slug, h1, list) => {
    const slugger = new GithubSlugger();
    const out = [];
    if (h1 !== null) out.push({ level: 1, text: h1, id: slugger.slug(h1), oldId: null });
    for (const h of list) {
      const id = slugger.slug(h.text);
      out.push({ level: h.level, text: h.text, id, oldId: h.id });
      anchors[l].set(h.id, { slug, id, heading: h });
      if (id !== h.id) report.push(`${l}: #${h.id} is #${id} on ${slug}`);
    }
    newHeadings[l][slug] = out;
  };
  const before = o.all.filter((h) => h.line < o.sections[0].heading.line);
  if (before.length !== 1 || before[0].level !== 1) fail(`${l}: expected one h1 before the first section`);
  place(ENTRY, null, [...before, ...o.sections.filter((_, i) => pageOfSection[i] === -1).flatMap((s) => s.headings)]);
  data.pages.forEach((page, p) => {
    place(
      page.slug,
      page.locales[l].title,
      o.sections.filter((_, i) => pageOfSection[i] === p).flatMap((s) => s.headings)
    );
  });
  if (anchors[l].size !== o.all.length) fail(`${l}: ${o.all.length} headings, ${anchors[l].size} anchors`);
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

const decode = (id) => {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
};

/** `#id` links of a line of the old page, as written on the page `current`. */
function relinkInPage(line, locale, current, where) {
  return line.replace(/(\]\(|href=")#([^)"\s]+)(?=[)"])/g, (whole, open, raw) => {
    const target = anchors[locale].get(decode(raw));
    if (!target) {
      report.push(`${where}: no heading for #${raw}`);
      return whole;
    }
    return target.slug === current ? `${open}#${target.id}` : `${open}/${locale}/docs/${target.slug}#${target.id}`;
  });
}

const ABSOLUTE = /((?:https:\/\/postext\.dev)?)\/(en|es|ca|zh|ja|ar|pt)\/docs\/configuration#([^)"\s'<>`\]]+)/g;

/** Links to `/<locale>/docs/configuration#id`, in any file. On a page of the
 *  reference (`current`), a link to a heading of the same page becomes `#id`. */
function relinkAbsolute(text, where, current = null, currentLocale = null) {
  return text.replace(ABSOLUTE, (whole, origin, locale, raw) => {
    const target = anchors[locale].get(decode(raw));
    if (!target) {
      report.push(`${where}: no heading for ${whole}`);
      return whole;
    }
    const id = raw.includes("%") ? encodeURIComponent(target.id) : target.id;
    if (!origin && current === target.slug && currentLocale === locale) return `#${id}`;
    return `${origin}/${locale}/docs/${target.slug}#${id}`;
  });
}

const relink = (lines, locale, current, where) =>
  lines.map((line) => relinkAbsolute(relinkInPage(line, locale, current, where), where, current, locale));

// ---------------------------------------------------------------------------
// The pages
// ---------------------------------------------------------------------------

/** The index of the entry page: the old lines, grouped by page and in the
 *  order of the sections, plus a line for every section they did not list. */
function buildIndex(locale) {
  const o = old[locale];
  const section = o.sections[pageOfSection.indexOf(-1)];
  const body = trimEnd(section.lines.slice(1)).filter((line) => line.trim() !== "");
  const bullets = body.filter((line) => line.startsWith("- "));
  if (body.length !== bullets.length + 1 || body[0].startsWith("- ")) fail(`${locale}: unexpected index layout`);

  const position = new Map(o.all.map((h, i) => [h.id, i]));
  const sectionOf = (h) => o.sections.findIndex((s) => s.headings.includes(h));
  const items = bullets.map((line) => {
    const ids = [...line.matchAll(/\]\(#([^)\s]+)\)/g)].map((m) => decode(m[1]));
    if (ids.length === 0) fail(`${locale}: index line without a link: ${line}`);
    const targets = ids.map((id) => anchors[locale].get(id) ?? fail(`${locale}: index links to #${id}`));
    const pages = new Set(targets.map((t) => t.slug));
    if (pages.size !== 1) fail(`${locale}: index line spans pages: ${line}`);
    return { line, ids, slug: targets[0].slug, at: position.get(ids[0]) };
  });
  const listed = new Set(items.flatMap((item) => item.ids));
  o.sections.forEach((s, i) => {
    if (pageOfSection[i] === -1 || listed.has(s.heading.id)) return;
    const tail = data.indexLines[old.en.sections[i].heading.text]?.[locale];
    if (!tail) fail(`No index line for "${old.en.sections[i].heading.text}" (${locale})`);
    items.push({
      line: `- [${s.heading.text}](#${s.heading.id})${tail}`,
      ids: [s.heading.id],
      slug: slugOfPage(pageOfSection[i]),
      at: position.get(s.heading.id),
    });
  });
  for (const s of o.sections) {
    const i = sectionOf(s.heading);
    if (pageOfSection[i] !== -1 && !items.some((item) => item.ids.includes(s.heading.id))) fail(`${locale}: ${s.heading.text} not in the index`);
  }

  const lines = [section.lines[0], "", data.entry[locale].indexLead, ""];
  for (const page of data.pages) {
    lines.push(`**[${page.locales[locale].sidebarTitle}](/${locale}/docs/${page.slug})**`, "");
    const own = items.filter((item) => item.slug === page.slug).sort((a, b) => a.at - b.at);
    if (own.length === 0) fail(`${locale}: no index lines for ${page.slug}`);
    lines.push(...own.map((item) => item.line), "");
  }
  return lines;
}

const enLines = (page) =>
  old.en.sections.filter((_, i) => pageOfSection[i] === page).reduce((n, s) => n + s.lines.length, 0);

const written = [];
const write = (file, text) => {
  const recipe = path.relative(COOKBOOK, file).split(path.sep);
  if (ONLY_RECIPES && !(recipe.length === 2 && ONLY_RECIPES.has(recipe[0]))) return;
  const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (before === text) return;
  fs.writeFileSync(file, text);
  written.push(path.relative(ROOT, file));
};

/** locale → slug → the lines of the page's sections after relinking. */
const pageSections = {};

for (const l of LOCALES) {
  const o = old[l];
  pageSections[l] = {};

  // The entry page: its introduction, then the index.
  const title = o.source.match(/title: '([^']+)'/)[1];
  const sidebarTitle = o.source.match(/sidebarTitle: '([^']+)'/)[1];
  const metaEnd = o.preamble.indexOf("};");
  const intro = relink(trimEnd(o.preamble.slice(metaEnd + 1)), l, ENTRY, `${ENTRY}-${l}`);
  const index = relink(buildIndex(l), l, ENTRY, `${ENTRY}-${l}`);
  const entry = [
    ...metadata(`${ENTRY}-${l}.mdx`, {
      title,
      sidebarTitle,
      description: data.entry[l].description,
      lang: l,
      readingTime: readingTime(l, 2),
      order: ORDER.indexOf(ENTRY) + 1,
      plainSummary: data.entry[l].plainSummary,
    }),
    ...intro,
    "",
    "",
    ...trimEnd(index),
    "",
  ];
  write(path.join(DOCS, `${ENTRY}-${l}.mdx`), entry.join("\n"));

  data.pages.forEach((page, p) => {
    const text = page.locales[l];
    const sections = o.sections
      .filter((_, i) => pageOfSection[i] === p)
      .map((s) => relink(s.lines, l, page.slug, `${page.slug}-${l}`));
    pageSections[l][page.slug] = sections;
    const file = `${page.slug}-${l}.mdx`;
    const out = [
      ...metadata(file, {
        ...text,
        lang: l,
        readingTime: readingTime(l, Math.max(2, Math.round(enLines(p) / 200))),
        order: ORDER.indexOf(page.slug) + 1,
        parent: ENTRY,
      }),
      "",
      `# ${text.title}`,
      "",
      "",
      ...trimEnd(sections.flat()),
      "",
    ];
    write(path.join(DOCS, file), out.join("\n"));
  });
}

// ---------------------------------------------------------------------------
// Nothing lost, nothing repeated
// ---------------------------------------------------------------------------

// (Checked on the files a full run has just written.)

/** A line with the address of its links blanked. */
const blank = (line) => line.replace(/\]\([^)\s]*\)/g, "](…)").replace(/href="[^"]*"/g, 'href="…"');

for (const l of ONLY_RECIPES ? [] : LOCALES) {
  const o = old[l];
  // Read the pages back, cut them at their `##` and put the sections in the old order.
  const back = new Array(o.sections.length);
  const counts = {};
  data.pages.forEach((page, p) => {
    const lines = fs.readFileSync(path.join(DOCS, `${page.slug}-${l}.mdx`), "utf8").split("\n");
    const all = headings(lines);
    const h2 = all.filter((h) => h.level === 2);
    counts[page.slug] = { lines: lines.length - 1, headings: all.length };
    const ordinals = o.sections.map((_, i) => i).filter((i) => pageOfSection[i] === p);
    if (h2.length !== ordinals.length) fail(`${l}: ${page.slug} has ${h2.length} sections, expected ${ordinals.length}`);
    h2.forEach((h, k) => {
      back[ordinals[k]] = lines.slice(h.line, h2[k + 1]?.line ?? lines.length);
    });
  });
  let total = 0;
  o.sections.forEach((s, i) => {
    if (pageOfSection[i] === -1) return;
    const was = trimEnd(s.lines);
    const is = trimEnd(back[i]);
    if (was.length !== is.length) fail(`${l}: "${s.heading.text}" had ${was.length} lines, has ${is.length}`);
    was.forEach((line, k) => {
      if (line !== is[k] && blank(line) !== blank(is[k])) fail(`${l}: "${s.heading.text}" line ${k + 1} changed beyond a link`);
    });
    total += was.length;
  });
  const headingsNow = Object.values(counts).reduce((n, c) => n + c.headings, 0) - data.pages.length;
  const headingsWere = o.all.length - newHeadings[l][ENTRY].length;
  if (headingsNow !== headingsWere) fail(`${l}: ${headingsWere} headings before, ${headingsNow} after`);
  if (l === "en") {
    report.push(`en: ${total} lines of sections kept; lines per page: ${Object.entries(counts).map(([slug, c]) => `${slug} ${c.lines}`).join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// Every other docs page: links and order
// ---------------------------------------------------------------------------

for (const file of fs.readdirSync(DOCS)) {
  const m = file.match(/^(.+)-(en|es|ca|zh|ja|ar|pt)\.mdx$/);
  if (!m) continue;
  const [, slug, locale] = m;
  const order = ORDER.indexOf(slug) + 1;
  if (order === 0) fail(`No order for ${slug}`);
  if (slug === ENTRY || data.pages.some((p) => p.slug === slug)) continue;
  const full = path.join(DOCS, file);
  const source = fs.readFileSync(full, "utf8");
  const next = relinkAbsolute(source, file).replace(/^(\s*order:\s*)\d+/m, `$1${order}`);
  for (const link of next.matchAll(ABSOLUTE)) {
    if (link[2] !== locale) report.push(`${file}: links to another language: ${link[0]}`);
  }
  write(full, next);
}

// ---------------------------------------------------------------------------
// The other consumers
// ---------------------------------------------------------------------------

// Cookbook registries: `docs: { slug: "configuration", heading: { en: … } }`.
const REGISTRY = path.join(ROOT, "cookbook/_registry");
for (const file of fs.readdirSync(REGISTRY).filter((f) => f.endsWith(".json"))) {
  const full = path.join(REGISTRY, file);
  const lines = fs.readFileSync(full, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (!/^\s*"slug": "configuration",?\s*$/.test(line)) return;
    const en = lines.slice(i + 1, i + 6).map((x) => x.match(/^\s*"en": (".*"),?\s*$/)?.[1]).find(Boolean);
    if (!en) fail(`${file}:${i + 1}: no English heading after the slug`);
    const text = JSON.parse(en);
    const heading = old.en.all.find((h) => h.level <= 3 && h.text === text);
    if (!heading) fail(`${file}:${i + 1}: no heading "${text}"`);
    const slug = anchors.en.get(heading.id).slug;
    lines[i] = line.replace('"configuration"', JSON.stringify(slug));
  });
  write(full, lines.join("\n"));
}

// Recipe write-ups (outside the recipes' source hash), READMEs, skill references.
const others = [
  "README.md",
  ...fs.readdirSync(path.join(ROOT, "packages")).map((p) => `packages/${p}/README.md`),
  ...fs.readdirSync(path.join(ROOT, "plugins/postext/skills/postext-port/references")).map((f) => `plugins/postext/skills/postext-port/references/${f}`),
  "plugins/postext/skills/postext-port/SKILL.md",
  "plugins/postext/README.md",
];
for (const recipe of fs.readdirSync(COOKBOOK, { withFileTypes: true })) {
  if (!recipe.isDirectory() || /^[_.]/.test(recipe.name)) continue;
  for (const l of LOCALES) {
    const rel = `cookbook/${recipe.name}/${l}.mdx`;
    if (!fs.existsSync(path.join(ROOT, rel))) continue;
    if (SKIP_RECIPES.has(recipe.name)) {
      const left = [...fs.readFileSync(path.join(ROOT, rel), "utf8").matchAll(ABSOLUTE)];
      for (const link of left) {
        const target = anchors[link[2]].get(decode(link[3]));
        if (target && target.slug !== ENTRY) report.push(`left: ${rel}: ${link[0]} → /${link[2]}/docs/${target.slug}#${target.id}`);
      }
      continue;
    }
    others.push(rel);
  }
}
for (const rel of others) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  write(full, relinkAbsolute(fs.readFileSync(full, "utf8"), rel));
}

// The redirect data: every id of the old page, under the page that holds it.
const fixture = {};
for (const l of LOCALES) {
  fixture[l] = {};
  for (const [id, target] of anchors[l]) {
    (fixture[l][target.slug] ??= []).push(id === target.id ? id : `${id}>${target.id}`);
  }
  for (const slug of Object.keys(fixture[l])) fixture[l][slug] = fixture[l][slug].join(" ");
}
write(path.join(ROOT, "apps/web/src/lib/configurationAnchors.json"), `${JSON.stringify(fixture, null, 2)}\n`);

for (const line of report) console.log(line);
console.log(`${written.length} files written`);
