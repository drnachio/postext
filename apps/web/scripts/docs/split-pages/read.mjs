// Reading a page: headings, metadata, body lines and reading time.

export const fail = (message) => {
  throw new Error(message);
};

// ---------------------------------------------------------------------------
// Reading a page
// ---------------------------------------------------------------------------

/** The `#`–`######` headings outside fenced code (a fence closes on the same
 *  character, at least as long). */
export function headings(lines) {
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

export function metaOf(source) {
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

export function metadataLines(file, meta) {
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
export function bodyLines(source) {
  const lines = source.split("\n");
  const end = lines.indexOf("};");
  if (end === -1) fail("no end of metadata");
  return lines.slice(end + 1);
}

export function trimEnd(lines) {
  const out = [...lines];
  while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
  return out;
}

// ---------------------------------------------------------------------------
// Reading time: prose words (code fences and tags left out) at 220 a minute,
// Chinese and Japanese at 500 characters a minute, Arabic at 180 words.
// ---------------------------------------------------------------------------

export function readingMinutes(locale, body) {
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

export function readingTime(locale, minutes) {
  if (locale === "zh") return `${minutes}分钟`;
  if (locale === "ja") return `${minutes}分`;
  if (locale === "ar") return minutes === 1 ? "دقيقة" : minutes === 2 ? "دقيقتان" : minutes <= 10 ? `${minutes} دقائق` : `${minutes} دقيقة`;
  return `${minutes} min`;
}
