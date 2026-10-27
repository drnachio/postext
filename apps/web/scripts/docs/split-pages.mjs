/**
 * Splits the overlong docs pages into focused pages (#884). Run once:
 *
 *   cd apps/web && node scripts/docs/split-pages.mjs
 *
 * `split-pages.data.json` names, for each page to split (`from`), the new
 * pages and the sections each one takes, by the English heading path
 * (`Body text > Hyphenation`). A section takes its whole subtree, except the
 * subsections listed for another page. Every language is cut at the same
 * headings (the pages have the same heading structure in every language); a
 * section moved from a deeper level is promoted so it opens at `##`. No line
 * is rewritten except the address of a link and the level of a heading.
 *
 * The script then
 *
 * - writes the new pages with their metadata (`parent` is the page they
 *   came from) and updates the metadata of the pages that stay;
 * - rewrites every link to a moved heading in the docs, the recipe
 *   write-ups, the READMEs and the skill references;
 * - moves the `docs: { slug, heading }` entries of the Cookbook registries;
 * - regroups the Configuration index by page;
 * - renumbers `order` and recomputes `readingTime` in every docs page;
 * - updates `src/lib/anchors/configurationAnchors.json` (the old single-page
 *   Configuration ids, which pointed at pages split now) and writes
 *   `src/lib/anchors/movedAnchors.json`: every heading id that left a page, per
 *   page and language, with the page that holds it now (the data of the
 *   redirect on the pages that were split).
 *
 * It checks that the split loses and repeats no line. Like
 * split-configuration.mjs, it is done: a second run would split the pages
 * that were split already, and fails on their missing sections. A split run
 * already is marked `"done": true` in the data and skipped, so one more split
 * (the Sandbox's composed pages, #884 / #846) is added to the data and run
 * alone: it keeps the other pages' reading time, merges its redirects into
 * `movedAnchors.json` and takes an optional `intro` paragraph per language
 * for the new page.
 */
import fs from "node:fs";
import path from "node:path";
import GithubSlugger from "github-slugger";

const LOCALES = ["en", "es", "ca", "zh", "ar", "ja", "pt", "fr", "de", "it"];
const LAST_UPDATED = "2026-10-20";
const ROOT = path.resolve(import.meta.dirname, "../../../..");
const DOCS = path.join(ROOT, "docs");
const COOKBOOK = path.join(ROOT, "cookbook");
const data = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "split-pages.data.json"), "utf8"));
const ORDER = data.order;
// A split marked `done` was run already (its pages exist and its links are
// rewritten); only the others are split now.
const SPLITS = data.splits.filter((s) => !s.done);
const FROM = new Set(SPLITS.map((s) => s.from));

const report = [];
const fail = (message) => {
  throw new Error(message);
};

// ---------------------------------------------------------------------------
// Reading a page
// ---------------------------------------------------------------------------

/** The `#`–`######` headings outside fenced code (a fence closes on the same
 *  character, at least as long). */
function headings(lines) {
  const out = [];
  let fence = null;
  lines.forEach((line, i) => {
    const m = line.match(/^(`{3,}|~{3,})(.*)$/);
    if (m) {
      if (fence === null) fence = { mark: m[1][0], size: m[1].length };
      else if (m[1][0] === fence.mark && m[1].length >= fence.size && m[2].trim() === "") fence = null;
      return;
    }
    if (fence !== null) return;
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) out.push({ level: h[1].length, text: h[2].trim(), line: i });
  });
  return out;
}

const quote = (text) => (text.includes("'") ? JSON.stringify(text) : `'${text}'`);

function metaOf(source) {
  const block = source.match(/export\s+const\s+metadata\s*=\s*\{([\s\S]+?)\n\};/);
  if (!block) fail("no metadata");
  const get = (key) => {
    const m = block[1].match(new RegExp(`\\n\\s*${key}:\\s*('(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*")`));
    if (!m) return "";
    return m[1].startsWith('"') ? JSON.parse(m[1]) : m[1].slice(1, -1).replace(/\\'/g, "'");
  };
  const order = block[1].match(/\n\s*order:\s*(\d+)/);
  return {
    title: get("title"),
    sidebarTitle: get("sidebarTitle"),
    description: get("description"),
    lang: get("lang"),
    lastUpdated: get("lastUpdated"),
    readingTime: get("readingTime"),
    order: order ? Number(order[1]) : 99,
    parent: get("parent"),
    plainSummary: get("plainSummary"),
  };
}

function metadataLines(file, meta) {
  return [
    `{/* docs/${file} */}`,
    "",
    "export const metadata = {",
    `  title: ${quote(meta.title)},`,
    `  sidebarTitle: ${quote(meta.sidebarTitle)},`,
    `  description: ${quote(meta.description)},`,
    `  lang: '${meta.lang}',`,
    `  lastUpdated: '${meta.lastUpdated}',`,
    `  readingTime: '${meta.readingTime}',`,
    `  order: ${meta.order},`,
    ...(meta.parent ? [`  parent: '${meta.parent}',`] : []),
    `  plainSummary: ${JSON.stringify(meta.plainSummary)},`,
    "};",
  ];
}

/** The lines of a page after its metadata block. */
function bodyLines(source) {
  const lines = source.split("\n");
  const end = lines.indexOf("};");
  if (end === -1) fail("no end of metadata");
  return lines.slice(end + 1);
}

function trimEnd(lines) {
  const out = [...lines];
  while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
  return out;
}

// ---------------------------------------------------------------------------
// Reading time: prose words (code fences and tags left out) at 220 a minute,
// Chinese and Japanese at 500 characters a minute, Arabic at 180 words.
// ---------------------------------------------------------------------------

function readingMinutes(locale, body) {
  const prose = body
    .join("\n")
    .replace(/^(`{3,}|~{3,})[\s\S]*?^\1\s*$/gm, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\]\([^)]*\)/g, "]");
  if (locale === "zh" || locale === "ja") {
    const cjk = (prose.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
    const latin = prose.replace(/[\u3000-\u9fff\uf900-\uffef]/g, " ").split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
    return Math.max(1, Math.round(cjk / 500 + latin / 220));
  }
  const words = prose.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return Math.max(1, Math.round(words / (locale === "ar" ? 180 : 220)));
}

function readingTime(locale, minutes) {
  if (locale === "zh") return `${minutes}分钟`;
  if (locale === "ja") return `${minutes}分`;
  if (locale === "ar") return minutes === 1 ? "دقيقة" : minutes === 2 ? "دقيقتان" : minutes <= 10 ? `${minutes} دقائق` : `${minutes} دقيقة`;
  return `${minutes} min`;
}

// ---------------------------------------------------------------------------
// The split of each page, in every language
// ---------------------------------------------------------------------------

/** English heading path of every heading (the h1 left out). */
function paths(list) {
  const stack = [];
  return list.map((h) => {
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
    stack.push(h);
    return stack.filter((x) => x.level > 1).map((x) => x.text).join(" > ");
  });
}

const slugAll = (list) => {
  const slugger = new GithubSlugger();
  return list.map((h) => slugger.slug(h.text));
};

/** locale → old slug → old id → { slug, id }. */
const anchors = Object.fromEntries(LOCALES.map((l) => [l, {}]));
/** locale → slug → page text (written at the end). */
const pagesOut = Object.fromEntries(LOCALES.map((l) => [l, {}]));
/** locale → slug → metadata of a new or updated page. */
const metaOut = Object.fromEntries(LOCALES.map((l) => [l, {}]));
/** split from → locale → the original body lines (for the final check). */
const originals = {};

const enStructure = {};

for (const split of SPLITS) {
  originals[split.from] = {};
  const en = headings(bodyLines(fs.readFileSync(path.join(DOCS, `${split.from}-en.mdx`), "utf8")));
  const enPaths = paths(en);
  enStructure[split.from] = { headings: en, paths: enPaths };
  // Section path → heading index, and the page each listed section goes to.
  const listed = new Map();
  split.pages.forEach((page, p) => {
    for (const s of page.sections) {
      const i = enPaths.indexOf(s);
      if (i === -1) fail(`${split.from}: no section "${s}"`);
      if (listed.has(i)) fail(`${split.from}: "${s}" listed twice`);
      listed.set(i, p);
    }
  });
  // The run (listed section) that owns each heading: its nearest listed
  // ancestor-or-self; -1 stays on the page.
  const owner = en.map((_, i) => {
    for (let j = i; j >= 0; j--) {
      if (listed.has(j)) {
        // j is an ancestor of i when no heading between them is at j's level or above.
        const between = en.slice(j + 1, i + 1);
        if (between.every((h) => h.level > en[j].level)) return j;
      }
    }
    return -1;
  });

  for (const l of LOCALES) {
    const file = path.join(DOCS, `${split.from}-${l}.mdx`);
    const source = fs.readFileSync(file, "utf8");
    const body = bodyLines(source);
    originals[split.from][l] = body;
    const list = headings(body);
    if (list.map((h) => h.level).join("") !== en.map((h) => h.level).join("")) fail(`${split.from}-${l}: heading structure differs from English`);
    const oldIds = slugAll(list);
    const h1 = list.findIndex((h) => h.level === 1);
    if (h1 !== 0) fail(`${split.from}-${l}: expected the h1 first`);

    // The run of each body line: the owner of the heading it is under.
    const runOf = body.map(() => -1);
    let k = -1;
    body.forEach((_, i) => {
      while (k + 1 < list.length && list[k + 1].line <= i) k++;
      runOf[i] = k === -1 ? -1 : owner[k];
    });

    const meta = metaOf(source);
    const entryText = split.entry[l] ?? fail(`${split.from}: no entry text for ${l}`);

    // The page that stays.
    const keep = body.filter((_, i) => runOf[i] === -1);
    if (entryText.title) {
      const at = keep.findIndex((line) => /^# /.test(line));
      keep[at] = `# ${entryText.title}`;
    }
    const pages = [{ slug: split.from, lines: keep, shift: new Map() }];
    split.pages.forEach((page, p) => {
      const text = page.locales[l] ?? fail(`${page.slug}: no text for ${l}`);
      const lines = ["", `# ${text.title}`, "", ...(text.intro ? [text.intro, "", ""] : [""])];
      const shiftAt = new Map();
      for (const s of page.sections) {
        const root = enPaths.indexOf(s);
        const shift = en[root].level - 2;
        const run = body.map((line, i) => ({ line, i })).filter(({ i }) => runOf[i] === root);
        for (const { line, i } of trimEnd(run.map((r) => r.line)).map((line, n) => ({ line, i: run[n].i }))) {
          const isHeading = list.some((h) => h.line === i);
          lines.push(isHeading && shift > 0 ? line.slice(shift) : line);
        }
        lines.push("", "");
        if (shift > 0) shiftAt.set(s, shift);
      }
      if (listed.size === 0 || ![...listed.values()].includes(p)) fail(`${page.slug}: no sections`);
      pages.push({ slug: page.slug, lines: trimEnd(lines), shift: shiftAt });
    });

    // New ids, page by page, and where each old id went.
    const where = new Map();
    for (const page of pages) {
      page.headings = headings(page.lines);
      page.ids = slugAll(page.headings);
    }
    const pageOfHeading = list.map((_, i) => {
      if (i === 0) return split.from;
      const run = owner[i];
      return run === -1 ? split.from : split.pages[listed.get(run)].slug;
    });
    // Each page's headings appear in the order the runs were concatenated:
    // collect, per page, the old heading indices in that order.
    const orderOnPage = new Map(pages.map((p) => [p.slug, []]));
    orderOnPage.get(split.from).push(...list.map((_, i) => i).filter((i) => pageOfHeading[i] === split.from));
    split.pages.forEach((page) => {
      for (const s of page.sections) {
        const root = enPaths.indexOf(s);
        orderOnPage.get(page.slug).push(...list.map((_, i) => i).filter((i) => owner[i] === root));
      }
    });
    for (const page of pages) {
      const olds = orderOnPage.get(page.slug);
      // New pages start with their own h1.
      const offset = page.slug === split.from ? 0 : 1;
      if (page.headings.length !== olds.length + offset) fail(`${page.slug}-${l}: ${page.headings.length} headings for ${olds.length + offset}`);
      olds.forEach((oldIndex, n) => {
        const id = page.ids[n + offset];
        where.set(oldIds[oldIndex], { slug: page.slug, id });
        if (page.slug === split.from && id !== oldIds[oldIndex]) report.push(`${l}: ${split.from}#${oldIds[oldIndex]} is now #${id}`);
        else if (page.slug !== split.from && id !== oldIds[oldIndex]) report.push(`${l}: ${split.from}#${oldIds[oldIndex]} is ${page.slug}#${id}`);
      });
    }
    anchors[l][split.from] = where;

    for (const page of pages) {
      pagesOut[l][page.slug] = page.lines;
      if (page.slug === split.from) {
        metaOut[l][page.slug] = { ...meta, ...entryText, lastUpdated: LAST_UPDATED };
      } else {
        const text = split.pages.find((p) => p.slug === page.slug).locales[l];
        // A page split off a page of a chapter belongs to that chapter.
        metaOut[l][page.slug] = { ...text, lang: l, lastUpdated: LAST_UPDATED, parent: meta.parent || split.from, order: 0, readingTime: "" };
      }
    }
  }
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

/** `#id` links of a line that was on page `from`, written on page `current`. */
function relinkInPage(line, locale, from, current, where) {
  return line.replace(/(\]\(|href=")#([^)"\s]+)(?=[)"])/g, (whole, open, raw) => {
    const target = anchors[locale][from].get(decode(raw));
    if (!target) {
      report.push(`${where}: no heading for #${raw}`);
      return whole;
    }
    const id = raw.includes("%") ? encodeURIComponent(target.id) : target.id;
    return target.slug === current ? `${open}#${id}` : `${open}/${locale}/docs/${target.slug}#${id}`;
  });
}

const SPLIT = [...FROM].sort((a, b) => b.length - a.length).join("|");
const ABSOLUTE = new RegExp(`((?:https://postext\\.dev)?)/(en|es|ca|zh|ja|ar|pt|fr|de|it)/docs/(${SPLIT})#([^)"\\s'<>\`\\]]+)`, "g");
const LOCALELESS = new RegExp(`(["'(])/docs/(${SPLIT})#([^)"\\s'<>\`\\]]+)`, "g");

/** Links to `/<locale>/docs/<split page>#id`, in any file. On page `current`
 *  in `currentLocale`, a link to a heading of the same page becomes `#id`. */
function relinkAbsolute(text, where, current = null, currentLocale = null) {
  return text.replace(ABSOLUTE, (whole, origin, locale, from, raw) => {
    const target = anchors[locale][from].get(decode(raw));
    if (!target) {
      report.push(`${where}: no heading for ${whole}`);
      return whole;
    }
    const id = raw.includes("%") ? encodeURIComponent(target.id) : target.id;
    if (!origin && current === target.slug && currentLocale === locale) return `#${id}`;
    return `${origin}/${locale}/docs/${target.slug}#${id}`;
  });
}

// ---------------------------------------------------------------------------
// The Configuration index, regrouped by page
// ---------------------------------------------------------------------------

const configPages = ORDER.filter((slug) => {
  if (slug === "configuration") return false;
  const file = path.join(DOCS, `${slug}-en.mdx`);
  if (fs.existsSync(file)) return metaOf(fs.readFileSync(file, "utf8")).parent === "configuration";
  return data.splits.some((s) => s.from.startsWith("configuration") && s.pages.some((p) => p.slug === slug));
});

function sidebarTitleOf(locale, slug) {
  if (metaOut[locale][slug]?.sidebarTitle) return metaOut[locale][slug].sidebarTitle;
  return metaOf(fs.readFileSync(path.join(DOCS, `${slug}-${locale}.mdx`), "utf8")).sidebarTitle;
}

/** The heading text, in a language, at an English path of a split page. */
function headingAt(locale, from, enPath) {
  const { paths: enPaths } = enStructure[from];
  const i = enPaths.indexOf(enPath);
  if (i === -1) fail(`index line: no "${enPath}" on ${from}`);
  const list = headings(originals[from][locale]);
  const ids = slugAll(list);
  return { text: list[i].text, id: ids[i] };
}

function rebuildIndex(locale, source) {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => /^## /.test(line));
  const body = lines.slice(start + 1);
  const lead = body.findIndex((line) => line.trim() !== "");
  const bullets = body.filter((line) => line.startsWith("- "));
  const others = body.filter((line, i) => i !== lead && line.trim() !== "" && !line.startsWith("- ") && !/^\*\*\[.+\]\(.+\)\*\*$/.test(line));
  if (others.length > 0) fail(`configuration-${locale}: unexpected index line: ${others[0]}`);

  // (The page's links are rewritten already.)
  const items = bullets.map((next) => {
    const first = next.match(/\]\(\/[a-z]{2}\/docs\/([a-z-]+)(?:#([^)\s]+))?\)/);
    if (!first) fail(`configuration-${locale}: index line without a link: ${next}`);
    return { line: next, slug: first[1], id: first[2] ? decode(first[2]) : "" };
  });
  for (const [slug, extra] of Object.entries(data.configurationIndex.lines)) {
    const split = data.splits.find((s) => s.pages.some((p) => p.slug === slug)) ?? data.splits.find((s) => s.from === slug);
    for (const entry of extra) {
      const h = headingAt(locale, split.from, entry.path);
      const target = anchors[locale][split.from].get(h.id);
      items.push({ line: `- [${h.text}](/${locale}/docs/${target.slug}#${target.id})${entry.tails[locale]}`, slug: target.slug, id: target.id });
    }
  }
  const position = (slug, id) => {
    const page = pagesOut[locale][slug] ?? bodyLines(fs.readFileSync(path.join(DOCS, `${slug}-${locale}.mdx`), "utf8"));
    const ids = slugAll(headings(page));
    const at = ids.indexOf(id);
    return at === -1 ? 0 : at;
  };
  const out = [lines[start], "", data.configurationIndex.locales[locale].indexLead, ""];
  for (const slug of configPages) {
    const own = items.filter((item) => item.slug === slug).sort((a, b) => position(slug, a.id) - position(slug, b.id));
    if (own.length === 0) fail(`configuration-${locale}: no index lines for ${slug}`);
    out.push(`**[${sidebarTitleOf(locale, slug)}](/${locale}/docs/${slug})**`, "", ...own.map((item) => item.line), "");
  }
  for (const item of items) if (!configPages.includes(item.slug)) fail(`configuration-${locale}: index line for ${item.slug}`);
  return [...lines.slice(0, start), ...trimEnd(out), ""].join("\n");
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

const written = [];
const write = (file, text) => {
  const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (before === text) return;
  fs.writeFileSync(file, text);
  written.push(path.relative(ROOT, file));
};

const orderOf = (slug) => {
  const n = ORDER.indexOf(slug) + 1;
  if (n === 0) fail(`No order for ${slug}`);
  return n;
};

// The split pages: relink, then metadata.
for (const l of LOCALES) {
  for (const split of SPLITS) {
    for (const slug of [split.from, ...split.pages.map((p) => p.slug)]) {
      const lines = pagesOut[l][slug].map((line) => relinkAbsolute(relinkInPage(line, l, split.from, slug, `${slug}-${l}`), `${slug}-${l}`, slug, l));
      pagesOut[l][slug] = lines;
      const meta = { ...metaOut[l][slug], order: orderOf(slug), readingTime: readingTime(l, readingMinutes(l, lines)) };
      metaOut[l][slug] = meta;
    }
  }
}
for (const l of LOCALES) {
  for (const [slug, lines] of Object.entries(pagesOut[l])) {
    const file = `${slug}-${l}.mdx`;
    write(path.join(DOCS, file), [...metadataLines(file, metaOut[l][slug]), ...lines, ""].join("\n").replace(/\n{4,}/g, "\n\n\n"));
  }
}

// Every other docs page: links, order and reading time.
for (const file of fs.readdirSync(DOCS)) {
  const m = file.match(/^(.+)-(en|es|ca|zh|ja|ar|pt|fr|de|it)\.mdx$/);
  if (!m) continue;
  const [, slug, locale] = m;
  if (pagesOut[locale][slug]) continue;
  const full = path.join(DOCS, file);
  let source = relinkAbsolute(fs.readFileSync(full, "utf8"), file);
  if (slug === "configuration" && SPLITS.some((s) => s.from.startsWith("configuration"))) {
    source = rebuildIndex(locale, source);
    const text = data.configurationIndex.locales[locale];
    const meta = { ...metaOf(source), description: text.description, plainSummary: text.plainSummary, lastUpdated: LAST_UPDATED };
    source = [...metadataLines(file, meta), ...bodyLines(source)].join("\n");
  }
  source = source.replace(/^(\s*order:\s*)\d+/m, `$1${orderOf(slug)}`);
  // The reading time of a page that is not split is kept (a rerun is for one
  // more split, not for a recount of the whole site).
  if (SPLITS.some((s) => s.from.startsWith("configuration")) || data.recountReadingTime) {
    const minutes = readingMinutes(locale, bodyLines(source));
    source = source.replace(/^(\s*readingTime:\s*)'[^']*'/m, `$1'${readingTime(locale, minutes)}'`);
  }
  write(full, source);
}

// ---------------------------------------------------------------------------
// Nothing lost, nothing repeated
// ---------------------------------------------------------------------------

/** A line with the address of its links blanked and its heading marks off. */
const blank = (line) =>
  line
    .replace(/\]\([^)\s]*\)/g, "](…)")
    .replace(/href="[^"]*"/g, 'href="…"')
    .replace(/^#{2,6}\s/, "# ");

for (const split of SPLITS) {
  for (const l of LOCALES) {
    const intros = new Set(split.pages.map((p) => p.locales[l].intro).filter(Boolean));
    const was = originals[split.from][l].filter((line) => line.trim() !== "" && !/^# /.test(line)).map(blank).sort();
    const is = [split.from, ...split.pages.map((p) => p.slug)]
      .flatMap((slug) => bodyLines(fs.readFileSync(path.join(DOCS, `${slug}-${l}.mdx`), "utf8")))
      .filter((line) => line.trim() !== "" && !/^# /.test(line) && !intros.has(line))
      .map(blank)
      .sort();
    if (was.length !== is.length) fail(`${split.from}-${l}: ${was.length} lines before, ${is.length} after`);
    was.forEach((line, i) => {
      if (line !== is[i]) fail(`${split.from}-${l}: line changed: ${line.slice(0, 80)} / ${is[i].slice(0, 80)}`);
    });
  }
}

// ---------------------------------------------------------------------------
// The other consumers
// ---------------------------------------------------------------------------

// Cookbook registries: `docs: { slug: "<split page>", heading: { en: … } }`.
const REGISTRY = path.join(ROOT, "cookbook/_registry");
for (const file of fs.readdirSync(REGISTRY).filter((f) => f.endsWith(".json"))) {
  const full = path.join(REGISTRY, file);
  const lines = fs.readFileSync(full, "utf8").split("\n");
  lines.forEach((line, i) => {
    const m = line.match(/^\s*"slug": "([a-z-]+)",?\s*$/);
    if (!m || !FROM.has(m[1])) return;
    const en = lines.slice(i + 1, i + 6).map((x) => x.match(/^\s*"en": (".*"),?\s*$/)?.[1]).find(Boolean);
    if (!en) fail(`${file}:${i + 1}: no English heading after the slug`);
    const text = JSON.parse(en);
    const { headings: list } = enStructure[m[1]];
    const ids = slugAll(list);
    const at = list.findIndex((h) => h.text === text);
    if (at === -1) fail(`${file}:${i + 1}: no heading "${text}" on ${m[1]}`);
    const slug = anchors.en[m[1]].get(ids[at]).slug;
    if (slug !== m[1]) lines[i] = line.replace(`"${m[1]}"`, JSON.stringify(slug));
  });
  write(full, lines.join("\n"));
}

// Recipe write-ups, READMEs, skill references, site code and tests.
const others = [
  "README.md",
  ...fs.readdirSync(path.join(ROOT, "packages")).map((p) => `packages/${p}/README.md`),
  ...fs.readdirSync(path.join(ROOT, "plugins/postext/skills/postext-port/references")).map((f) => `plugins/postext/skills/postext-port/references/${f}`),
  "plugins/postext/skills/postext-port/SKILL.md",
  "plugins/postext/README.md",
];
for (const recipe of fs.readdirSync(COOKBOOK, { withFileTypes: true })) {
  if (!recipe.isDirectory() || /^[_.]/.test(recipe.name)) continue;
  for (const l of LOCALES) others.push(`cookbook/${recipe.name}/${l}.mdx`);
}
for (const rel of others) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  write(full, relinkAbsolute(fs.readFileSync(full, "utf8"), rel));
}
// Locale-less addresses in the site's code (`"/docs/sandbox#props"`) are
// English ids.
for (const rel of ["apps/web/src/lib/webmcp/siteTools.test.ts"]) {
  const full = path.join(ROOT, rel);
  const text = fs.readFileSync(full, "utf8").replace(LOCALELESS, (whole, open, from, raw) => {
    const target = anchors.en[from].get(decode(raw));
    return target ? `${open}/docs/${target.slug}#${target.id}` : whole;
  });
  write(full, text);
}

// The old single-page Configuration ids that pointed at a page split now.
const CONFIG_ANCHORS = path.join(ROOT, "apps/web/src/lib/anchors/configurationAnchors.json");
const configAnchors = JSON.parse(fs.readFileSync(CONFIG_ANCHORS, "utf8"));
for (const l of Object.keys(configAnchors)) {
  const table = configAnchors[l];
  const next = {};
  for (const [slug, ids] of Object.entries(table)) {
    for (const entry of ids.split(" ")) {
      const [oldId, nowId = oldId] = entry.split(">");
      const moved = FROM.has(slug) ? anchors[l][slug].get(nowId) : null;
      const target = moved ?? { slug, id: nowId };
      (next[target.slug] ??= []).push(oldId === target.id ? oldId : `${oldId}>${target.id}`);
    }
  }
  configAnchors[l] = Object.fromEntries(
    Object.entries(next)
      .sort(([a], [b]) => orderOf(a) - orderOf(b))
      .map(([slug, ids]) => [slug, ids.join(" ")]),
  );
}
write(CONFIG_ANCHORS, `${JSON.stringify(configAnchors, null, 2)}\n`);

// The redirect data of the split pages: every id that left a page (or was
// renamed on it), under the page that holds it now.
const MOVED = path.join(ROOT, "apps/web/src/lib/anchors/movedAnchors.json");
const moved = fs.existsSync(MOVED) ? JSON.parse(fs.readFileSync(MOVED, "utf8")) : {};
for (const split of SPLITS) {
  moved[split.from] = {};
  for (const l of LOCALES) {
    const table = {};
    for (const [id, target] of anchors[l][split.from]) {
      if (target.slug === split.from && target.id === id) continue;
      (table[target.slug] ??= []).push(id === target.id ? id : `${id}>${target.id}`);
    }
    moved[split.from][l] = Object.fromEntries(
      Object.entries(table)
        .sort(([a], [b]) => orderOf(a) - orderOf(b))
        .map(([slug, ids]) => [slug, ids.join(" ")]),
    );
  }
}
write(MOVED, `${JSON.stringify(moved, null, 2)}\n`);

for (const line of report) console.log(line);
console.log(`${written.length} files written`);
