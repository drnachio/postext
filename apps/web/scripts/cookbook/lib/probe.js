/**
 * The in-page half of the Cookbook capture harness, served at /__cb/probe.js
 * by scripts/cookbook/serve.ts and imported by harness.ts once the pen has
 * settled. It reads what the shims recorded in `window.__cb` and returns
 * plain JSON: the facts the checks judge in Node (checks.ts), and the page,
 * card and OG images, painted by the pen's own engine instance (so the
 * image registry is shared) and encoded by Chrome.
 *
 * Browser ES module; no dependencies.
 */

/** Fontsource's `latin` subset (the kit's unicode-range): PDF text outside
 *  it falls back to another face (C25). */
const LATIN = [
  [0x0000, 0x00ff], [0x0131, 0x0131], [0x0152, 0x0153], [0x02bb, 0x02bc], [0x02c6, 0x02c6],
  [0x02da, 0x02da], [0x02dc, 0x02dc], [0x0304, 0x0304], [0x0308, 0x0308], [0x0329, 0x0329],
  [0x2000, 0x206f], [0x20ac, 0x20ac], [0x2122, 0x2122], [0x2191, 0x2191], [0x2193, 0x2193],
  [0x2212, 0x2212], [0x2215, 0x2215], [0xfeff, 0xfeff], [0xfffd, 0xfffd],
];
const MAIN_COLOR = '#295AA3';
/** Content warnings on how the text is set that C5 reports. */
const TEXT_WARNING_KINDS = new Set(['arabicMarksExceedLeading', 'unbreakableWordOverflow', 'joiningScriptLetterSpacing', 'lineNumberOverlap']);
/** What a comic warning names: the picture, the panel, the speaker, the style. */
function comicDetail(w) {
  return [w.resourceId, w.anchorId, w.panel === undefined ? undefined : `panel ${w.panel + 1}`,
    w.style, w.speaker, w.reasons?.join('+'), w.message].filter((x) => x !== undefined && x !== '').join(' ');
}
const FALLBACK_DIRECTIVES = ['pagebreak', 'numbering', 'columnbreak', 'space', 'toc'];
const FALLBACK_CONTAINERS = ['callout', 'paragraphs', 'part', 'columns', 'paper'];
/** The parser's own fence patterns (packages/postext/src/parse/blockParser.ts). */
const DIRECTIVE_RE = /^:::\s*([a-z][a-z0-9-]*)\s*(?:\{([^}]*)\})?\s*$/;
const CLOSE_RE = /^:::\s*$/;
/** Raw-body fences whose lines belong to the comic parser. */
const COMIC_FENCES = new Set(['page', 'strip']);
const RESOURCE_RE = /^::resource\s*\{id="([^"]+)"\}\s*$/;

// ─── The record ─────────────────────────────────────────────────────────────

function record() {
  return window.__cb ?? { builds: [], images: [], engines: {}, pending: 0, lastBuildAt: 0, importedAt: 0 };
}

/** One recorded build: 'last' | 'first' | index. */
function pickOne(builds, select) {
  const i = select === 'first' ? 0 : typeof select === 'number' ? select : builds.length - 1;
  return builds[Math.max(0, Math.min(builds.length - 1, i))];
}

/** The build that is "the result": capture.doc = 'last' | 'first' | index,
 *  or a list of them (two editions). Several builds make one: the first's
 *  source, config and engine, every build's documents, and `segments`, the
 *  documents of each build, whose pages {@link pagesOf} numbers on from
 *  one build to the next. */
function pick(select = 'last') {
  const { builds } = record();
  if (!builds.length) return null;
  if (!Array.isArray(select)) return pickOne(builds, select);
  const picked = [...new Set(select.map((s) => pickOne(builds, s)))];
  if (picked.length === 1) return picked[0];
  return { ...picked[0], docs: picked.flatMap((b) => b.docs ?? []), segments: picked.map((b) => b.docs ?? []), picked };
}

/** A build's index in the record (the first one, for several). */
function indexOfBuild(build) {
  return record().builds.indexOf(build?.picked?.[0] ?? build);
}

/** The engine module instance that built (or painted) a build. */
function engineOf(build) {
  const { engines } = record();
  return engines[build?.shim] ?? engines.postext ?? engines['postext-bundle'] ?? Object.values(engines)[0];
}

/** Every page of a build in book order. `n` counts from 1 at the build's
 *  first page (capture.hero, capture.pages and the pNN files use it, so a
 *  document continued at `continuation.pageIndexOffset: 40` still has pages
 *  1–4); `book` is the physical page number in the whole book, whose parity
 *  decides versos and rectos. */
function pagesOf(build) {
  const out = [];
  let before = 0;
  let docIndex = 0;
  // Several builds (`capture.doc` as a list): each keeps its book page
  // numbers, and `n` goes on from the pages of the builds before it.
  for (const docs of build.segments ?? [build.docs]) {
    const base = docs[0]?.pageIndexOffset ?? 0;
    let last = before;
    for (const doc of docs) {
      for (const page of doc.pages) {
        const book = (doc.pageIndexOffset ?? 0) + page.index + 1;
        const n = before + book - base;
        out.push({ doc, docIndex, page, n, book });
        last = Math.max(last, n);
      }
      docIndex++;
    }
    before = last;
  }
  return out;
}

const round = (value, step = 1) => Math.round(value / step) * step;

/** Resolves when no build has been recorded for `quietMs` (harness need H10). */
export async function settle(quietMs = 500, maxMs = 10000) {
  const start = performance.now();
  for (;;) {
    const cb = record();
    const now = performance.now();
    if (!cb.pending && now - (cb.lastBuildAt ?? 0) >= quietMs) return { waitedMs: round(now - start) };
    if (now - start > maxMs) return { waitedMs: round(now - start), timedOut: true };
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export function frames(count = 2) {
  return new Promise((resolve) => {
    const step = (left) => (left ? requestAnimationFrame(() => step(left - 1)) : resolve(true));
    step(count);
  });
}

export function pdfState() {
  const cb = record();
  return { bytes: cb.pdf?.length ?? 0, error: cb.pdfError ?? null, fontFailures: cb.fontFailures ?? [], ms: round(cb.pdfMs ?? 0) };
}

/** The EPUBs the pen wrote (shim postext-epub.js), each read back. */
export function epubState() {
  return (record().epubs ?? []).map((epub) => ({ ...epub, ms: round(epub.ms) }));
}

export function pdfBase64() {
  const bytes = record().pdf;
  if (!bytes) return null;
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

// ─── Small helpers ──────────────────────────────────────────────────────────

function hexOf(color) {
  if (!color) return '';
  return String(typeof color === 'string' ? color : color.hex ?? '').toUpperCase();
}

/** A config value as JSON: functions dropped, maps as objects, bytes as a length. */
function plain(value) {
  const path = new Set();   // ancestors only: shared objects are fine, cycles are cut
  const walk = (v) => {
    if (v === null || typeof v !== 'object') return typeof v === 'function' || typeof v === 'symbol' ? undefined : v;
    if (path.has(v)) return undefined;
    if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return { bytes: v.byteLength };
    if (typeof Blob !== 'undefined' && v instanceof Blob) return { bytes: v.size };
    path.add(v);
    let out;
    if (v instanceof Map) out = Object.fromEntries([...v].map(([k, x]) => [String(k), walk(x)]));
    else if (Array.isArray(v)) out = v.map(walk);
    else {
      out = {};
      for (const [k, x] of Object.entries(v)) {
        const w = walk(x);
        if (w !== undefined) out[k] = w;
      }
    }
    path.delete(v);
    return out;
  };
  return walk(value);
}

function lineOf(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** '700 37.5px "Open Sans"' → { family, weight, style, px }. */
export function parseFont(font) {
  const m = /^(?:(italic|oblique)\s+)?(?:small-caps\s+)?(?:(\d+|bold|normal)\s+)?([\d.]+)px\s+(.+)$/.exec(String(font).trim());
  if (!m) return null;
  const weight = m[2] === 'bold' ? 700 : !m[2] || m[2] === 'normal' ? 400 : Number(m[2]);
  return { family: m[4].replace(/^["']|["']$/g, ''), weight, style: m[1] ? 'italic' : 'normal', px: Number(m[3]) };
}

function loadedFaces() {
  return [...document.fonts].filter((face) => face.status === 'loaded').map((face) => ({
    family: face.family.replace(/^["']|["']$/g, ''), weight: face.weight, style: face.style,
  }));
}

/** The code-point ranges of a FontFace's `unicodeRange` ("U+4E00-4FFF, U+3001"). */
function rangesOf(unicodeRange) {
  return String(unicodeRange ?? 'U+0-10FFFF').split(',').map((part) => {
    const [lo, hi = lo] = part.trim().replace(/^U\+/i, '').split('-');
    if (lo.includes('?')) return [parseInt(lo.replace(/\?/g, '0'), 16), parseInt(lo.replace(/\?/g, 'F'), 16)];
    return [parseInt(lo, 16), parseInt(hi, 16)];
  });
}

/** Families served by unicode-range slices that reach the Han ideographs
 *  or the hiragana (a kana-only Japanese display face has no kanji; the cjk
 *  kit block adds every file of such a face, loaded or not) or the
 *  Arabic letters (the arabic block adds each face's arabic file next to
 *  the latin ones loadFonts adds), with the code points their files cover:
 *  the PDF's cjkPdfProvider and arabicPdfProvider hand over whichever of
 *  those files the pages need. */
function slicedFamilies() {
  const out = new Map();
  for (const face of document.fonts) {
    const family = face.family.replace(/^["']|["']$/g, '');
    const ranges = rangesOf(face.unicodeRange);
    const list = out.get(family) ?? [];
    list.push(...ranges);
    out.set(family, list);
  }
  for (const [family, ranges] of out) {
    const reaches = (cp) => ranges.some(([lo, hi]) => lo <= cp && hi >= cp);
    if (!(reaches(0x4e00) || reaches(0x3042) || reaches(0x0627)) || ranges.some(([lo, hi]) => lo === 0 && hi >= 0x10ffff)) {
      out.delete(family);
    }
  }
  return out;
}

/** Families with loaded faces that declare a unicode-range of their own
 *  (Fontsource's latin and latin-ext files, as loadFonts adds them), with
 *  the code points those files cover. A face with no range (one built from
 *  a recipe's assets) is left out: the PDF provider decides what it holds. */
function rangedFamilies() {
  const out = new Map();
  for (const face of document.fonts) {
    if (face.status !== 'loaded') continue;
    const ranges = rangesOf(face.unicodeRange);
    if (ranges.some(([lo, hi]) => lo === 0 && hi >= 0x10ffff)) continue;
    const family = face.family.replace(/^["']|["']$/g, '');
    out.set(family, [...(out.get(family) ?? []), ...ranges]);
  }
  return out;
}

/** A loaded FontFace covers exactly this family, weight and style. */
function hasFace(faces, family, weight, style) {
  return faces.some((face) => {
    if (face.family !== family || face.style !== style) return false;
    const [low, high = low] = String(face.weight).split(' ').map(Number);
    return weight >= low && weight <= high;
  });
}

/** Dimension → pt (em against `basePt`). */
function dimPt(dim, dpi, basePt = 0) {
  if (!dim) return 0;
  const v = Number(dim.value);
  switch (dim.unit) {
    case 'pt': return v;
    case 'mm': return (v / 25.4) * 72;
    case 'cm': return (v / 2.54) * 72;
    case 'in': return v * 72;
    case 'px': return (v * 72) / dpi;
    case 'em': case 'rem': return v * basePt;
    default: return v;
  }
}

// ─── Walking what the renderer paints ───────────────────────────────────────

/** A block's font set: prefix '' → fontString…, 'caption' → captionFontString… */
function fontsOf(owner, prefix) {
  const key = (name) => (prefix ? prefix + name : name.charAt(0).toLowerCase() + name.slice(1));
  const n = owner[key('FontString')];
  const b = owner[key('BoldFontString')] ?? n;
  const i = owner[key('ItalicFontString')] ?? n;
  return { n, b, i, bi: owner[key('BoldItalicFontString')] ?? b };
}

/** Blocks laid out on a page: columns, floats, margin notes, footnotes. */
function pageBlocks(page) {
  return [
    ...(page.columns ?? []).flatMap((column) => column.blocks ?? []),
    ...(page.floats ?? []),
    ...(page.marginNotes ?? []),
    ...(page.footnoteArea?.notes ?? []),
  ];
}

/** Calls visit(font, text, where) for every run of text the renderer paints. */
function walkPainted(pages, visit) {
  const lines = (list, set, where) => {
    for (const line of list ?? []) {
      if (line.segments?.length) {
        for (const seg of line.segments) {
          if (seg.kind === 'text' && seg.text.trim()) {
            const font = seg.fontString
              ?? (seg.bold && seg.italic ? set.bi : seg.bold ? set.b : seg.italic ? set.i : set.n);
            visit(font, seg.text, where);
          } else if (seg.kind === 'chip') {
            for (const run of seg.chip?.runs ?? []) if (run.text.trim()) visit(run.fontString, run.text, where);
          }
        }
      } else if (line.text?.trim()) visit(set.n, line.text, where);
    }
  };
  const slot = (design, where) => {
    for (const el of design?.blocks ?? []) {
      if (el.kind !== 'text') continue;
      const text = (el.lines ?? []).map((l) => l.text).join(' ');
      if (text.trim()) visit(el.fontString, text, `${where} design`);
    }
  };
  for (const { page, n } of pages) {
    const where = `p${n}`;
    for (const block of pageBlocks(page)) {
      const at = `${where} ${block.type}`;
      if (block.designOverlay) slot(block.designOverlay, at);
      else if (!block.hidden) lines(block.lines, fontsOf(block, ''), at);
      if (block.bulletText?.trim()) visit(block.bulletFontString ?? block.fontString, block.bulletText, `${at} bullet`);
      if (block.separatorText?.trim()) visit(block.separatorFontString ?? block.fontString, block.separatorText, `${at} bullet`);
      const rb = block.resourceBlock;
      if (rb) {
        lines(rb.captionLines, fontsOf(rb, 'caption'), `${where} caption`);
        lines(rb.noteLines, fontsOf(rb, 'note'), `${where} note`);
        lines(rb.continuesLines, fontsOf(rb, 'note'), `${where} note`);
        for (const cell of rb.table?.cells ?? []) {
          lines(cell.lines, fontsOf(rb.table, cell.isHeader ? 'header' : ''), `${where} table`);
        }
      }
    }
    slot(page.header, `${where} header`);
    slot(page.footer, `${where} footer`);
    slot(page.openerBand, `${where} opener`);
  }
}

/** Every string under a key matching `keys`, with a readable path. */
function collectKeys(root, keys, skip = /^(sourceMap|mathRender|attrSources)$/) {
  const found = [];
  const seen = new WeakSet();
  const walk = (node, at) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      if (typeof node[0] === 'number') return;
      node.forEach((item, i) => walk(item, `${at}[${i}]`));
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (skip.test(key)) continue;
      if (typeof value === 'string' && keys.test(key)) { if (value) found.push({ key, value, at: at ? `${at}.${key}` : key }); }
      else if (value && typeof value === 'object') walk(value, at ? `${at}.${key}` : key);
    }
  };
  walk(root, '');
  return found;
}

// ─── Facts ──────────────────────────────────────────────────────────────────

/** What the pen gave the engine: its markdown, resources and (user) config. */
function sourceOf(build) {
  if (build.kind === 'bundle') {
    const bundle = build.content ?? {};
    return {
      known: true,
      markdowns: (bundle.chapters ?? []).map((chapter) => String(chapter?.markdown ?? '')),
      resources: [...(bundle.resources ?? [])],
      config: build.config ?? null,
    };
  }
  if (build.kind === 'document' || build.kind === 'worker') {
    return {
      known: true,
      markdowns: [String(build.content?.markdown ?? '')],
      resources: [...(build.content?.resources ?? [])],
      config: build.config ?? null,
    };
  }
  return { known: false, markdowns: [], resources: [], config: null };
}

function spansOf(blocks) {
  const out = [];
  const add = (spans, block) => {
    for (const span of spans ?? []) {
      out.push({ span, block });
      if (span.chip?.spans) add(span.chip.spans, block);
    }
  };
  for (const block of blocks) add(block.spans, block);
  return out;
}

/**
 * Everything the checks need, as JSON. `select` is capture.doc; `hero` the
 * 1-based hero pages (for C26).
 */
export function facts({ select = 'last', hero = [] } = {}) {
  const cb = record();
  const out = {
    builds: cb.builds.map((b) => ({
      kind: b.kind, shim: b.shim, ms: round(b.ms ?? 0, 0.1), at: round(b.at ?? 0),
      pages: (b.docs ?? []).reduce((sum, doc) => sum + (doc?.pages?.length ?? 0), 0),
    })),
    selected: -1,
    importedAt: round(cb.importedAt ?? 0),
    registered: [...new Set(cb.images ?? [])],
    state: document.documentElement.dataset.postext ?? null,
    status: document.getElementById('pt-status')?.textContent ?? null,
    pdfButton: !!document.querySelector('[data-postext-pdf]'),
  };
  const build = pick(select);
  if (!build || !build.docs?.length) return out;
  out.selected = indexOfBuild(build);
  if (build.picked) out.selectedBuilds = build.picked.map((b) => cb.builds.indexOf(b));
  const engine = engineOf(build);
  const docs = build.docs;
  const resolved = docs[0].config;
  const dpi = resolved.page.dpi;
  const pages = pagesOf(build);
  const source = sourceOf(build);
  const user = source.config ? plain(source.config) : null;
  // `resourceTypes: defaultResourceTypes(LANG)` is one setting, not dozens of leaves.
  if (Array.isArray(user?.resourceTypes) && typeof engine.defaultResourceTypes === 'function') {
    const given = JSON.stringify(user.resourceTypes);
    const lang = [...new Set([user.locale, 'en', 'es', 'zh'].filter((l) => typeof l === 'string'))]
      .find((l) => JSON.stringify(plain(engine.defaultResourceTypes(l))) === given);
    if (lang) user.resourceTypes = `defaultResourceTypes('${lang}')`;
  }
  out.sourceKnown = source.known;
  out.userConfig = user;
  out.markdowns = source.markdowns;
  out.resources = source.resources.map((r) => ({
    id: r.id, kind: r.kind, typeId: r.typeId, note: !!r.note,
    fileId: r.bitmap?.fileId ?? r.svg?.fileId ?? null,
    placement: r.placement ? plain(r.placement) : null,
    styleId: r.table?.styleId ?? null,
  }));

  // C7–C10: the markdown, parsed by the pinned engine.
  const known = {
    directives: engine.KNOWN_DIRECTIVES ? [...engine.KNOWN_DIRECTIVES] : FALLBACK_DIRECTIVES,
    containers: engine.KNOWN_CONTAINERS ? [...engine.KNOWN_CONTAINERS] : FALLBACK_CONTAINERS,
  };
  const fenceNames = new Set([...known.directives, ...known.containers]);
  const parseIssues = [];
  const badFences = [];
  const directives = new Set();
  const inline = new Set();
  const unknownStyles = [];
  const unknownRefs = [];
  const ids = (list) => new Set((list ?? []).map((s) => s.id));
  const styleIds = {
    callout: ids(resolved.calloutStyles), paragraphs: ids(resolved.paragraphStyles),
    chip: ids(resolved.chipStyles), heading: ids(resolved.headingStyles), table: ids(resolved.tableStyles),
  };
  const userCallouts = (user?.calloutStyles ?? []).length > 0;
  const paletteIds = new Set((user?.colorPalette ?? resolved.colorPalette ?? []).map((entry) => entry.id));
  const resourceIds = new Set(source.resources.map((r) => r.id));
  let partPalette = false;
  const parsed = source.markdowns.map((markdown, chapter) => {
    const body = engine.extractFrontmatter ? engine.extractFrontmatter(markdown).content : markdown;
    let result = { blocks: [], issues: [] };
    try {
      result = engine.parseMarkdownWithIssues(body);
    } catch (error) {
      parseIssues.push({ chapter, kind: 'parserError', line: 0, excerpt: String(error?.message ?? error) });
    }
    for (const issue of result.issues ?? []) {
      parseIssues.push({
        chapter, kind: issue.kind, line: lineOf(body, issue.sourceStart),
        excerpt: body.slice(issue.sourceStart, issue.sourceStart + 60).split('\n')[0],
      });
    }
    // A comic's body (:::page, :::strip) is read by the comic parser: its
    // ::panel lines and its script are not Markdown fences.
    let comicBody = false;
    body.split('\n').forEach((raw, i) => {
      const line = raw.trim();
      if (comicBody) {
        if (CLOSE_RE.test(line)) comicBody = false;
        return;
      }
      if (line.startsWith(':::')) {
        if (CLOSE_RE.test(line)) return;
        const m = DIRECTIVE_RE.exec(line);
        if (m && fenceNames.has(m[1])) {
          directives.add(m[1]);
          if (COMIC_FENCES.has(m[1])) comicBody = true;
          return;
        }
        badFences.push({ chapter, line: i + 1, text: line.slice(0, 80), name: /^:::\s*([\w-]*)/.exec(line)?.[1] ?? '' });
      } else if (/^::[a-z]/i.test(line)) {
        if (RESOURCE_RE.test(line)) { directives.add('resource'); return; }
        badFences.push({ chapter, line: i + 1, text: line.slice(0, 80), name: /^::([\w-]*)/.exec(line)?.[1] ?? '' });
      }
    });
    return { chapter, body, blocks: result.blocks ?? [] };
  });
  // Anchors a :ref may name besides resources (postext >= 1.12): headings
  // with an id and anchors set in the text, in any chapter.
  const anchorIds = new Set();
  for (const { blocks } of parsed) {
    for (const block of blocks) {
      if (block.type === 'heading' && block.attrs?.id) anchorIds.add(block.attrs.id);
      for (const mark of block.anchorMarks ?? []) anchorIds.add(mark.anchorId);
    }
  }
  const refTarget = (id) => resourceIds.has(id) || anchorIds.has(id)
    || /^(sec|fig|tbl|eq|lst):/.test(id) && (resourceIds.has(id.slice(id.indexOf(':') + 1)) || anchorIds.has(id.slice(id.indexOf(':') + 1)));
  for (const { chapter, body, blocks } of parsed) {
    const at = (block) => `chapter ${chapter + 1}, line ${lineOf(body, block.sourceStart)}`;
    for (const block of blocks) {
      const attrs = block.containerAttrs ?? {};
      if (block.type === 'containerStart' && block.containerName === 'callout'
        && attrs.type !== undefined && userCallouts && !styleIds.callout.has(attrs.type)) {
        unknownStyles.push({ what: 'callout type', id: attrs.type, at: at(block) });
      }
      if (block.type === 'containerStart' && block.containerName === 'paragraphs'
        && attrs.style !== undefined && !styleIds.paragraphs.has(attrs.style)) {
        unknownStyles.push({ what: 'paragraph style', id: attrs.style, at: at(block) });
      }
      if (block.type === 'containerStart' && block.containerName === 'part' && attrs.palette) {
        partPalette = true;
        for (const m of attrs.palette.matchAll(/([a-z0-9_-]+)\s*[=:]/gi)) {
          if (!paletteIds.has(m[1])) unknownStyles.push({ what: 'palette id', id: m[1], at: at(block) });
        }
      }
      if (block.type === 'heading' && block.attrs?.style !== undefined && !styleIds.heading.has(block.attrs.style)) {
        unknownStyles.push({ what: 'heading style', id: block.attrs.style, at: at(block) });
      }
      if (block.type === 'resourceBlock' && block.resourceId !== undefined && !resourceIds.has(block.resourceId)) {
        unknownRefs.push({ usage: '::resource', id: block.resourceId, at: at(block) });
      }
    }
    for (const { span, block } of spansOf(blocks)) {
      if (span.ref) {
        inline.add('ref');
        if (!refTarget(span.ref.resourceId)) unknownRefs.push({ usage: ':ref', id: span.ref.resourceId, at: at(block) });
      }
      if (span.chip) {
        inline.add('chip');
        if (span.chip.style !== undefined && !styleIds.chip.has(span.chip.style)) {
          unknownStyles.push({ what: 'chip style', id: span.chip.style, at: at(block) });
        }
      }
      if (span.swatch) inline.add('swatch');
      if (span.math) inline.add('math');
      if (span.script) inline.add(span.script);
    }
  }
  for (const r of source.resources) {
    if (r.table?.styleId && !styleIds.table.has(r.table.styleId)) {
      unknownStyles.push({ what: 'table style', id: r.table.styleId, at: `resource "${r.id}"` });
    }
  }
  // Resource ids named by the config (design images, callout icons and
  // markers) and by table cells.
  for (const { value, at } of [
    ...collectKeys(source.config, /^resourceId$/).map((x) => ({ ...x, at: `config.${x.at}` })),
    ...collectKeys(source.resources, /^resourceId$/).map((x) => ({ ...x, at: `resources${x.at}` })),
  ]) {
    if (typeof value === 'string' && value.includes('{')) {
      // A templated design image id (postext ≥ 1.8): '{attr.art}' names the
      // resource each heading or part gives it; check every value the
      // document fills in. Other placeholders are resolved at layout only.
      const ATTR = /\{attr\.([A-Za-z_][A-Za-z0-9_-]*)\}/g;
      const keys = [...value.matchAll(ATTR)].map((m) => m[1]);
      if (keys.length === 0) continue;
      for (const { chapter, body, blocks } of parsed) {
        for (const block of blocks) {
          const attrs = block.attrs ?? block.containerAttrs;
          if (!attrs || !keys.some((k) => attrs[k] !== undefined)) continue;
          const id = value.replace(ATTR, (_, k) => attrs[k] ?? '').trim();
          if (id && !id.includes('{') && !resourceIds.has(id)) {
            unknownRefs.push({ usage: `resourceId ${value}`, id, at: `chapter ${chapter + 1}, line ${lineOf(body, block.sourceStart)}` });
          }
        }
      }
      continue;
    }
    if (!resourceIds.has(value)) unknownRefs.push({ usage: 'resourceId', id: value, at });
  }
  const counts = new Map();
  for (const r of source.resources) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
  const duplicates = [...counts].filter(([, n]) => n > 1).map(([id]) => id);
  Object.assign(out, { known, parseIssues, badFences, unknownStyles, unknownRefs, duplicates,
    directives: [...directives].sort(), inline: [...inline].sort() });

  // C11: images the pages place but nobody registered (grey placeholders).
  const placed = new Map();
  // A video's own file is no picture: the pages draw its poster.
  const videoFiles = new Set(source.resources.map((r) => r.video?.fileId).filter(Boolean));
  for (const { page, n } of pages) {
    for (const { value } of collectKeys(page, /^(fileId|iconFileId|markerFileId)$/)) {
      if (!placed.has(value) && !videoFiles.has(value)) placed.set(value, n);
    }
  }
  const registered = (fileId) => (typeof engine.getResourceImage === 'function'
    ? !!engine.getResourceImage(fileId) : (cb.images ?? []).includes(fileId));
  out.unregistered = [...placed].filter(([fileId]) => !registered(fileId)).map(([fileId, n]) => ({ fileId, page: n }));

  // C12, C16, C25: the faces and text the renderer paints.
  const loaded = loadedFaces();
  const sliced = slicedFamilies();
  const ranged = rangedFamilies();
  const used = new Map();
  const garbage = [];
  const outside = new Map();
  // Characters outside latin that a loaded file of their own face holds
  // (ō from the latin-ext file loadFonts adds): set on screen from it, and
  // in the PDF when the provider adds that file too (cjkPdfProvider does).
  const ownFile = new Map();
  // C12: a character set in a CJK or Arabic face from a file that was not
  // loaded when the layout ran was measured in a fallback face (loadCjkFonts
  // was not given it, or loadArabicFonts not the weight). The shim notes the
  // faces loaded as each build starts.
  const atLayout = new Map();
  for (const [family, weight, style, range] of build.fonts ?? []) {
    if (!sliced.has(family)) continue;
    const list = atLayout.get(family) ?? [];
    list.push({ weight, style, ranges: rangesOf(range) });
    atLayout.set(family, list);
  }
  const late = new Map();
  const judged = new Set();
  const placeholders = new Set([engine.MATH_PLACEHOLDER, engine.SWATCH_PLACEHOLDER, engine.CHIP_PLACEHOLDER, '￼'].filter(Boolean));
  walkPainted(pages, (font, text, where) => {
    const face = font ? parseFont(font) : null;
    if (face) {
      const key = `${face.family}|${face.weight}|${face.style}`;
      if (!used.has(key)) used.set(key, { family: face.family, weight: face.weight, style: face.style, where });
    }
    if (/\bundefined\b|\bNaN\b/.test(text) && garbage.length < 10) garbage.push({ text: text.slice(0, 80), where });
    const covered = face ? sliced.get(face.family) : null;
    for (const ch of text) {
      if (placeholders.has(ch)) continue;
      const cp = ch.codePointAt(0);
      if (LATIN.some(([a, b]) => cp >= a && cp <= b) || outside.has(ch)) continue;
      // A CJK or Arabic face loaded by slices takes the character from its own files.
      if (covered?.some(([a, b]) => cp >= a && cp <= b)) continue;
      if (face && ranged.get(face.family)?.some(([a, b]) => cp >= a && cp <= b)) {
        if (!ownFile.has(ch)) ownFile.set(ch, where);
        continue;
      }
      outside.set(ch, where);
    }
    if (!face || !build.fonts || !atLayout.has(face.family)) return;
    const key = `${face.family}|${face.weight}|${face.style}`;
    for (const ch of new Set(text)) {
      if (!/\S/.test(ch) || placeholders.has(ch) || judged.has(`${key}|${ch}`)) continue;
      judged.add(`${key}|${ch}`);
      const cp = ch.codePointAt(0);
      // A character no file of the family has is C25's (nonLatin).
      if (!covered?.some(([a, b]) => cp >= a && cp <= b)) continue;
      const ready = atLayout.get(face.family).some((f) => {
        if (f.style !== face.style) return false;
        const [low, high = low] = String(f.weight).split(' ').map(Number);
        return face.weight >= low && face.weight <= high && f.ranges.some(([a, b]) => cp >= a && cp <= b);
      });
      if (ready) continue;
      const entry = late.get(key) ?? { family: face.family, weight: face.weight, style: face.style, chars: '', where };
      if ([...entry.chars].length < 12) entry.chars += ch;
      late.set(key, entry);
    }
  });
  out.faces = {
    used: [...used.values()].sort((a, b) => `${a.family}${a.weight}${a.style}`.localeCompare(`${b.family}${b.weight}${b.style}`)),
    loaded,
  };
  out.faces.missing = out.faces.used.filter((f) => !hasFace(loaded, f.family, f.weight, f.style));
  if (late.size) out.faces.late = [...late.values()];
  out.garbage = garbage;
  const codeOf = (ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
  out.nonLatin = [
    ...[...outside].map(([ch, where]) => ({ ch, code: codeOf(ch), where })),
    ...[...ownFile].filter(([ch]) => !outside.has(ch)).map(([ch, where]) => ({ ch, code: codeOf(ch), where, ownFile: true })),
  ].slice(0, 40);

  // C17: the default skin, read off the resolved config and the pages.
  const all = pages.flatMap((p) => pageBlocks(p.page).map((block) => ({ block, n: p.n, doc: p.doc })));
  const headingLevels = [...new Set(all
    .filter(({ block }) => block.type === 'heading' && !block.hidden && !block.designOverlay)
    .map(({ block }) => block.headingLevel))].sort();
  const bt = resolved.bodyText;
  out.defaultSkin = {
    body: bt.fontFamily === 'EB Garamond' && Number(bt.fontSize?.value) === 8 && bt.fontSize?.unit === 'pt',
    headingLevels: headingLevels.filter((level) => {
      const def = resolved.headings.levels.find((l) => l.level === level);
      return def && def.fontFamily === 'Open Sans' && hexOf(def.color) === MAIN_COLOR;
    }),
    header: user ? !('header' in user) : null,
    footer: user ? !('footer' in user) : null,
    colors: ['boldColor', 'italicColor', 'referenceColor'].filter((key) => hexOf(bt[key]) === MAIN_COLOR),
    callouts: all.filter(({ block }) => {
      if (!block.callout) return false;
      const style = (resolved.calloutStyles ?? []).find((s) => s.id === block.callout.styleId);
      return !!style && style.backgroundEnabled && hexOf(style.background) === '#F4F4F4' && !style.stripe?.enabled;
    }).length,
    tables: all.filter(({ block }) => {
      const table = block.resourceBlock?.table;
      return !!table && (table.rules ?? 'grid') === 'grid' && hexOf(table.headerBackground) === '#F0F0F0';
    }).length,
    lists: all.filter(({ block }) => block.type === 'listItem' && hexOf(block.bulletColor) === MAIN_COLOR).length,
    palette: user ? !(user.colorPalette?.length > 0) : null,
  };

  // C5, C6, C24: the engine's own diagnostics.
  // A document's page `pageIndex` is page `nOf(doc) + pageIndex`.
  const firstN = new Map();
  for (const p of pages) if (!firstN.has(p.doc)) firstN.set(p.doc, p.n - p.page.index);
  const nOf = (doc, pageIndex) => (firstN.get(doc) ?? 1) + pageIndex;
  out.warnings = docs.flatMap((doc) => (doc.warnings ?? []).map((w) => ({
    kind: w.kind, page: nOf(doc, w.pageIndex), overflowPx: round(w.overflowPx ?? 0, 0.1),
  })));
  // The index's own warnings are content warnings the source checks (C7–C10)
  // cannot see: the expansion raises them with the whole book's marks (#172).
  out.indexWarnings = docs.flatMap((doc) => (doc.contentWarnings ?? [])
    .filter((w) => /^index[A-Z]/.test(w.kind))
    .map((w) => ({
      kind: w.kind,
      page: w.pageIndex === undefined ? null : nOf(doc, w.pageIndex),
      detail: w.target ?? w.term ?? '',
    })));
  // Content warnings about how the text is set, which no source check sees
  // either: Arabic vowel marks that reach the next line (#376), a word wider
  // than its measure, letter-spacing a joining script ignores (#368), a line
  // number in the side column painted over a side box or float (#621), and a
  // comic's (a picture letterboxed in its cell, a balloon that found no
  // room, more panels than cells…), except a speaker with no anchor, which
  // is how an off-panel voice is written.
  out.textWarnings = docs.flatMap((doc) => (doc.contentWarnings ?? [])
    .filter((w) => TEXT_WARNING_KINDS.has(w.kind) || (/^comic[A-Z]/.test(w.kind) && w.kind !== 'comicUnknownSpeaker'))
    .map((w) => ({
      kind: w.kind,
      page: w.pageIndex === undefined ? null : nOf(doc, w.pageIndex),
      detail: w.text ?? (w.kind === 'lineNumberOverlap' ? `line ${w.number}` : comicDetail(w)),
    })));
  // C31: config values the engine replaced (a character grid cut to the
  // page, an unknown numbering format, a key no setting has). Every
  // chapter of a book carries its build's warnings: one entry per value.
  const configWarnings = new Map();
  for (const doc of docs) {
    for (const w of doc.configWarnings ?? []) {
      const key = `${w.kind}\0${w.path}\0${w.value}`;
      if (!configWarnings.has(key)) {
        configWarnings.set(key, { kind: w.kind, path: w.path, value: w.value, used: w.used ?? '', ...(w.suggestion ? { suggestion: w.suggestion } : {}) });
      }
    }
  }
  out.configWarnings = [...configWarnings.values()];
  out.converged = docs.every((doc) => doc.converged !== false);
  out.iterationCount = Math.max(...docs.map((doc) => doc.iterationCount ?? 0));
  let justified = 0;
  let worst = 0;
  const looseLines = [];
  // Lines of the CJK composer are justified between their characters (the
  // segments' tracking, capped at half an em or bodyText.maxJustifyTracking);
  // one past the cap is set short and flagged cjkLoose.
  let cjkJustified = 0;
  let cjkWorst = 0;
  const cjkShort = [];
  const trackingCap = (doc) => {
    const max = Number(doc.config.bodyText.maxJustifyTracking) || 0;
    return max > 0 ? Math.min(0.5, max / 1000) : 0.5;
  };
  for (const { block, doc, n } of all) {
    const max = doc.config.bodyText.maxWordSpacing ?? 2;
    const emPx = parseFont(block.fontString ?? '')?.px ?? 0;
    for (const line of block.lines ?? []) {
      if (line.cjkComposed || line.cjkLoose) {
        if (line.isLastLine || block.textAlign !== 'justify' || (line.ragged && !line.cjkLoose)) continue;
        cjkJustified++;
        const tracking = Math.max(0, ...(line.segments ?? []).map((seg) => seg.tracking ?? 0));
        if (emPx > 0) cjkWorst = Math.max(cjkWorst, tracking / emPx);
        if (line.cjkLoose) cjkShort.push({ page: n, tracking: emPx > 0 ? round(tracking / emPx, 0.01) : 0, text: (line.text ?? '').trim() });
        continue;
      }
      const ratio = line.justifiedSpaceRatio;
      if (ratio === undefined || line.isLastLine || line.ragged) continue;
      justified++;
      if (ratio > max) looseLines.push({ page: n, ratio: round(ratio, 0.01), text: (line.text ?? '').trim() });
      worst = Math.max(worst, ratio);
    }
  }
  // The loosest lines, for copy-fitting (C24 prints them).
  const loosest = [...looseLines].sort((a, b) => b.ratio - a.ratio).slice(0, 5);
  out.loose = { count: looseLines.length, total: justified, share: justified ? looseLines.length / justified : 0,
    worst: round(worst, 0.01), threshold: bt.maxWordSpacing ?? 2, lines: loosest };
  if (cjkJustified) {
    out.cjkLoose = { count: cjkShort.length, total: cjkJustified, share: cjkShort.length / cjkJustified,
      worst: round(cjkWorst, 0.01), threshold: trackingCap(docs[0]), lines: cjkShort.slice(0, 5) };
  }
  if (docs[0].binding === 'right') out.binding = 'right';
  // A right-to-left document (direction 'rtl', or 'auto' in an Arabic,
  // Hebrew or Persian locale): the resolved config says so only then.
  if (docs[0].config?.direction === 'rtl') out.direction = 'rtl';
  // The digits of a right-to-left document are the locale's choice even when
  // the config does not name them (٠–٩ for 'ar', 0–9 for 'ar-MA'): the resolved
  // config carries numerals only when they are not latn.
  if (docs[0].config?.numerals || out.direction) out.numerals = docs[0].config?.numerals ?? 'latn';

  // Pages: roles, emptiness, coverage, hero legibility, alt-text material.
  const heroSet = new Set(hero);
  out.pages = pages.map(({ doc, docIndex, page, n, book }) => {
    const blocks = pageBlocks(page);
    const role = page.role ?? (page.blankForParity || page.blankForForce ? 'blank' : 'body');
    const columns = (page.columns ?? []).filter((c) => c.kind !== 'side');
    const colArea = columns.reduce((sum, c) => sum + c.bbox.width * c.bbox.height, 0);
    const area = (b) => (b?.bbox ? Math.max(0, b.bbox.width) * Math.max(0, b.bbox.height) : 0);
    const inColumns = columns.flatMap((c) => c.blocks ?? []).filter((b) => !(b.containerId !== undefined && !b.callout));
    const covered = inColumns.reduce((sum, b) => sum + area(b), 0) + (page.floats ?? []).reduce((s, b) => s + area(b), 0);
    const headingBlock = blocks.find((b) => b.type === 'heading');
    let heading = headingBlock ? (headingBlock.lines ?? []).map((l) => l.text).join(' ').trim() : '';
    if (!heading && page.openerBand) {
      heading = (page.openerBand.blocks ?? []).filter((b) => b.kind === 'text')
        .map((b) => (b.lines ?? []).map((l) => l.text).join(' ')).join(' ').trim().slice(0, 120);
    }
    const captions = blocks.filter((b) => b.resourceBlock?.captionLines?.length)
      .map((b) => b.resourceBlock.captionLines.map((l) => l.text).join(' ').trim());
    const entry = {
      n, book, docIndex, index: page.index, label: page.pageLabel ?? String(book), role,
      w: round(page.width, 0.1), h: round(page.height, 0.1), trimOffset: doc.trimOffset ?? 0,
      blank: role === 'blank' || !!page.blankForParity || !!page.blankForForce,
      blocks: blocks.length + (page.openerBand?.blocks?.length ?? 0),
      coverage: colArea ? Math.min(1, covered / colArea) : 1,
      h1: blocks.some((b) => b.type === 'heading' && b.headingLevel === 1),
      heading, captions,
    };
    if (heroSet.has(n)) entry.legibility = legibility(page, doc, blocks, resolved);
    return entry;
  });

  // Specimen facts.
  const first = docs[0].pages[0];
  const trim = docs[0].trimOffset ?? 0;
  const mm = (px) => round((px / dpi) * 25.4, 0.1);
  const bodyPt = dimPt(bt.fontSize, dpi, 0);
  out.specimen = {
    trimMm: first ? [mm(first.width - 2 * trim), mm(first.height - 2 * trim)] : [0, 0],
    dpi, layoutType: resolved.layout.layoutType,
    // A grid of three or more columns names its count (absent otherwise, so older captures match).
    ...(resolved.layout.layoutType === 'multiple'
      ? { columnCount: Math.max(3, Math.min(8, Math.round(Number(resolved.layout.columnCount) || 3))) } : {}),
    gutterMm: resolved.layout.layoutType === 'single' ? undefined : round((dimPt(resolved.layout.gutterWidth, dpi, bodyPt) / 72) * 25.4, 0.1),
    mirror: !!resolved.page.margins?.mirror,
    body: { family: bt.fontFamily, sizePt: round(bodyPt, 0.1), leadingPt: round(dimPt(bt.lineHeight, dpi, bodyPt), 0.1) },
    families: [...new Set(out.faces.used.map((f) => f.family))].sort(),
    pages: pages.length,
  };

  // Level signals (spec §2.3).
  const rbs = all.map(({ block }) => block.resourceBlock).filter(Boolean);
  out.signals = {
    splitTables: rbs.some((rb) => !!rb.slice),
    rotated: rbs.some((rb) => !!rb.rotation) || source.resources.some((r) => !!r.placement?.rotate),
    sideFloats: resolved.layout.layoutType === 'oneAndHalf' && resolved.layout.sideColumnRole === 'floats',
    partPalette,
    placements: source.resources.some((r) => !!r.placement),
    chapters: Math.max(docs.length, all.filter(({ block }) => block.type === 'heading' && block.headingLevel === 1).length, 1),
  };

  out.vdt = vdtText(docs);
  return out;
}

/** Share of a page that is colour fields, images or display type (C26). */
function legibility(page, doc, blocks, resolved) {
  const dpi = resolved.page.dpi;
  const pageArea = page.width * page.height;
  let sum = 0;
  const box = (b) => (b ? Math.max(0, b.width) * Math.max(0, b.height) : 0);
  const display = (font) => {
    const face = font ? parseFont(font) : null;
    return !!face && (face.px * 72) / dpi >= 14;
  };
  const filled = (color) => {
    const hex = hexOf(color);
    return !!hex && hex !== 'TRANSPARENT' && hex !== '#FFFFFF' && hex !== '#FFF';
  };
  if (filled(resolved.page.backgroundColor)) return 1;
  const slot = (design) => {
    for (const el of design?.blocks ?? []) {
      if (el.kind === 'image') sum += box(el.bbox);
      else if (el.kind === 'box' && el.box?.backgroundColor) sum += box(el.bbox);
      else if (el.kind === 'text' && (el.box?.backgroundColor || display(el.fontString))) sum += box(el.bbox);
    }
  };
  slot(page.openerBand);
  slot(page.header);
  slot(page.footer);
  // Comic panels (a :::page, a :::strip in the flow): their pictures and fills.
  const comicPanels = (comic) => {
    for (const panel of comic?.panels ?? []) if (panel.art || filled(panel.background)) sum += box(panel.bbox);
  };
  comicPanels(page.comic);
  for (const block of blocks) {
    comicPanels(block.comic);
    const rb = block.resourceBlock;
    if (rb && (rb.kind === 'bitmap' || rb.kind === 'svg')) sum += box(rb.bodyRect);
    if (rb?.captionBar) sum += box(rb.captionBar.rect);
    // Table fills (header, body, per-cell) and cell pictures read at card size too.
    for (const cell of rb?.table?.cells ?? []) {
      const fill = cell.background ?? (cell.isHeader ? rb.table.headerBackground : rb.table.bodyBackground);
      if (filled(fill)) sum += box(cell.rect);
      else if (cell.image) sum += box(cell.image.rect);
    }
    if (block.designOverlay) slot(block.designOverlay);
    if (block.callout) {
      const style = (resolved.calloutStyles ?? []).find((s) => s.id === block.callout.styleId);
      if (style?.backgroundEnabled) sum += box(block.bbox);
    }
    if (block.type === 'heading' && !block.hidden && display(block.fontString)) {
      for (const line of block.lines ?? []) sum += box(line.bbox);
    }
  }
  return Math.min(1, sum / pageArea);
}

/** The text the VDT hash covers: pages → blocks → lines (text + bbox
 *  rounded to 0.5 px), plus the design slots' text. OS-independent. */
function vdtText(docs) {
  const r = (v) => round(Number(v) || 0, 0.5);
  const box = (b) => (b ? `${r(b.x)},${r(b.y)},${r(b.width)},${r(b.height)}` : '-');
  const out = [];
  const lines = (list) => { for (const l of list ?? []) out.push(`L${box(l.bbox)}|${l.text}`); };
  const slot = (tag, design) => {
    for (const el of design?.blocks ?? []) {
      out.push(`${tag}${el.kind}|${box(el.bbox)}|${el.kind === 'text' ? (el.lines ?? []).map((l) => l.text).join('/') : ''}`);
    }
  };
  for (const doc of docs) {
    for (const page of doc.pages) {
      out.push(`P${(doc.pageIndexOffset ?? 0) + page.index}|${r(page.width)}x${r(page.height)}|${page.pageLabel}|${page.role ?? ''}`);
      for (const block of pageBlocks(page)) {
        out.push(`B${block.type}|${box(block.bbox)}${block.hidden ? '|h' : ''}`);
        lines(block.lines);
        const rb = block.resourceBlock;
        if (rb) {
          lines(rb.captionLines);
          lines(rb.noteLines);
          for (const cell of rb.table?.cells ?? []) { out.push(`C${cell.row},${cell.col}`); lines(cell.lines); }
        }
        if (block.designOverlay) slot('O', block.designOverlay);
      }
      slot('H', page.header);
      slot('F', page.footer);
      slot('D', page.openerBand);
    }
  }
  return out.join('\n');
}

// ─── Pictures ───────────────────────────────────────────────────────────────

/** Paints one page at `scale` with the pen's engine, then the overlay hook
 *  (harness need H2: loose-line marks, reading-order numbers). The hook
 *  gets the context in canvas pixels (the renderer leaves it scaled), so it
 *  maps page px with `scale` itself: window.__postextOverlay(ctx, page, doc, scale). */
function paint(engine, p, scale) {
  const canvas = document.createElement('canvas');
  engine.renderPageToCanvas(p.page, p.doc, canvas, { scale });
  if (typeof window.__postextOverlay === 'function') {
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    window.__postextOverlay(ctx, p.page, p.doc, scale);
    ctx.restore();
  }
  return canvas;
}

function encode(canvas, type, quality) {
  return canvas.toDataURL(type, quality);
}

/** The published pages: pNN.webp (width) and pNN.s.webp (strip). */
export function renderPages({ select = 'last', pages: wanted, width = 1000, strip = 240, quality = 0.8,
  stripQuality = 0.72, png = false } = {}) {
  const build = pick(select);
  const engine = engineOf(build);
  const byN = new Map(pagesOf(build).map((p) => [p.n, p]));
  const out = [];
  try {
    for (const n of wanted) {
      const p = byN.get(n);
      if (!p) return { error: `page ${n} does not exist` };
      const full = paint(engine, p, width / p.page.width);
      out.push({
        n, w: full.width, h: full.height,
        full: encode(full, 'image/webp', quality),
        strip: encode(paint(engine, p, strip / p.page.width), 'image/webp', stripQuality),
        png: png ? encode(full, 'image/png') : null,
      });
    }
  } catch (error) {
    return { error: `${error?.name ?? 'Error'}: ${error?.message ?? error}`, taint: error?.name === 'SecurityError' };
  }
  return { pages: out };
}

/** Pages whose painting taints the canvas (C15), published or not: each is
 *  painted tiny and read back. */
export function taintedPages({ select = 'last' } = {}) {
  const build = pick(select);
  const engine = engineOf(build);
  const tainted = [];
  for (const p of pagesOf(build)) {
    try {
      paint(engine, p, 16 / p.page.width).getContext('2d').getImageData(0, 0, 1, 1);
    } catch (error) {
      if (error?.name === 'SecurityError') tainted.push(p.n);
    }
  }
  return tainted;
}

/** The kit's state and status line (read before the PDF button is used). */
export function kitState() {
  return {
    state: document.documentElement.dataset.postext ?? null,
    status: document.getElementById('pt-status')?.textContent ?? null,
  };
}

// ─── The card ───────────────────────────────────────────────────────────────

const W = 1200;
const H = 900;
const GILT = '#d8a21a';

function canvasOf(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  return canvas;
}

/** A white sheet with the card's shadow baked into the alpha channel. */
function sheet(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 18;
  ctx.fillRect(x, y, w, h);
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/** The spine's shade, fading from `x` towards `x + dir * width`. */
function spine(ctx, x, y, h, width, dir) {
  const gradient = ctx.createLinearGradient(x, 0, x + dir * width, 0);
  gradient.addColorStop(0, 'rgba(0,0,0,0.16)');
  gradient.addColorStop(0.4, 'rgba(0,0,0,0.05)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(Math.min(x, x + dir * width), y, width, h);
  ctx.restore();
}

/** Printer's crop marks just outside a rectangle's corners. */
function cropMarks(ctx, x, y, w, h, { len = 22, gap = 8, width = 2 } = {}) {
  ctx.save();
  ctx.strokeStyle = GILT;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (const [cx, cy, sx, sy] of [[x, y, -1, -1], [x + w, y, 1, -1], [x, y + h, -1, 1], [x + w, y + h, 1, 1]]) {
    ctx.moveTo(cx + sx * gap, cy);
    ctx.lineTo(cx + sx * (gap + len), cy);
    ctx.moveTo(cx, cy + sy * gap);
    ctx.lineTo(cx, cy + sy * (gap + len));
  }
  ctx.stroke();
  ctx.restore();
}

/** The focus rectangle in page px; fractions are of the trim box (H8). */
function focusRect(p, focus) {
  const t = p.doc.trimOffset ?? 0;
  const tw = p.page.width - 2 * t;
  const th = p.page.height - 2 * t;
  return { x: t + focus.x * tw, y: t + focus.y * th, w: focus.w * tw, h: focus.h * th };
}

/** The verso/recto pair a hero names: [a, b] as given, or the spread a
 *  single page sits in (an odd book page is a recto; page 1 stands alone). */
function heroPair(hero, byN) {
  if (hero.length >= 2) return [byN.get(hero[0]) ?? null, byN.get(hero[1]) ?? null];
  const n = hero[0];
  const p = byN.get(n) ?? null;
  if (!p) return [null, null];
  if (p.book % 2 === 1) return [byN.get(n - 1) ?? null, p];   // a recto
  return [p, byN.get(n + 1) ?? null];                        // a verso
}

/** The hero pair on the stage, [verso, recto] laid out as the book opens:
 *  a right-bound book (doc.binding) has its recto on the left. */
function drawSpread(ctx, engine, [verso, recto], right = false) {
  const pair = right ? [recto, verso] : [verso, recto];
  const present = pair.filter(Boolean);
  let h = 0.8 * H;
  let widths = present.map((p) => (p.page.width * h) / p.page.height);
  let total = widths.reduce((a, b) => a + b, 0);
  if (total > 0.94 * W) {
    const k = (0.94 * W) / total;
    h *= k;
    widths = widths.map((w) => w * k);
    total *= k;
  }
  const top = 0.46 * H - h / 2;
  const left = (W - total) / 2;
  sheet(ctx, left, top, total, h);
  let x = left;
  present.forEach((p, i) => {
    ctx.drawImage(paint(engine, p, h / p.page.height), x, top, widths[i], h);
    x += widths[i];
  });
  const shade = 0.015 * W;
  if (pair[0] && pair[1]) {
    spine(ctx, left + widths[0], top, h, shade, -1);
    spine(ctx, left + widths[0], top, h, shade, 1);
  } else if (pair[1]) spine(ctx, left, top, h, shade, 1);
  else if (pair[0]) spine(ctx, left + total, top, h, shade, -1);
}

function drawPage(ctx, engine, p, box) {
  let h = box.h;
  let w = (p.page.width * h) / p.page.height;
  if (w > box.w) {
    w = box.w;
    h = (w * p.page.height) / p.page.width;
  }
  const x = box.x + (box.w - w) / 2;
  const y = box.cy - h / 2;
  sheet(ctx, x, y, w, h);
  ctx.drawImage(paint(engine, p, h / p.page.height), x, y, w, h);
  return { x, y, w, h, scale: h / p.page.height };
}

function drawLoupe(ctx, engine, p, focus) {
  const at = drawPage(ctx, engine, p, { x: 0.035 * W, w: 0.385 * W, h: 0.86 * H, cy: 0.46 * H });
  const f = focusRect(p, focus);
  let fw = 0.52 * W;
  let fh = (fw * f.h) / f.w;
  if (fh > 0.8 * H) {
    fh = 0.8 * H;
    fw = (fh * f.w) / f.h;
  }
  // Right-aligned, leaving room for the crop marks (gap + length = 30 px).
  const fx = W - 36 - fw;
  const fy = 0.46 * H - fh / 2;
  const scale = fw / f.w;
  sheet(ctx, fx, fy, fw, fh);
  ctx.drawImage(paint(engine, p, scale), f.x * scale, f.y * scale, f.w * scale, f.h * scale, fx, fy, fw, fh);
  cropMarks(ctx, fx, fy, fw, fh);
  // The focus outlined on the page, and a leader to the magnified frame
  // (a white halo keeps it legible where it crosses text).
  const sx = at.x + f.x * at.scale;
  const sy = at.y + f.y * at.scale;
  const sw = f.w * at.scale;
  const sh = f.h * at.scale;
  const leader = () => {
    ctx.beginPath();
    ctx.moveTo(sx + sw, sy + sh / 2);
    ctx.lineTo(fx - 12, fy + fh / 2);
    ctx.stroke();
  };
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3;
  leader();
  ctx.strokeStyle = GILT;
  ctx.lineWidth = 1;
  ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
  leader();
  ctx.restore();
  return fw / sw;
}

function drawCrop(ctx, engine, p, focus) {
  const f = focusRect(p, focus);
  const k = Math.min((0.9 * W) / f.w, (0.9 * H) / f.h);
  const w = f.w * k;
  const h = f.h * k;
  const x = (W - w) / 2;
  const y = Math.max(0.05 * H, Math.min(0.46 * H - h / 2, H - 0.05 * H - h));
  sheet(ctx, x, y, w, h);
  ctx.drawImage(paint(engine, p, k), f.x * k, f.y * k, f.w * k, f.h * k, x, y, w, h);
  cropMarks(ctx, x, y, w, h);
}

async function drawScreenshot(ctx, dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  // A 4:3 crop, centred horizontally and taken from the top.
  let sw = img.naturalWidth;
  let sh = (sw * 3) / 4;
  if (sh > img.naturalHeight) {
    sh = img.naturalHeight;
    sw = (sh * 4) / 3;
  }
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, 0, sw, sh, 0, 0, W, H);
}

/** card.webp (960×720), card.480.webp and og.jpg (580×622 on the desk
 *  colour), composed on a 1200×900 transparent stage. */
export async function composeCard({ select = 'last', mode = 'spread', hero = [1], focus = null, screenshot = null,
  png = false } = {}) {
  const build = pick(select);
  const engine = engineOf(build);
  const byN = new Map(pagesOf(build).map((p) => [p.n, p]));
  const stage = canvasOf(W, H);
  const ctx = stage.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  let magnification = null;
  try {
    if (mode === 'screenshot') await drawScreenshot(ctx, screenshot);
    else if (mode === 'spread') drawSpread(ctx, engine, heroPair(hero, byN), build.docs[0]?.binding === 'right');
    else if (mode === 'page') drawPage(ctx, engine, byN.get(hero[0]), { x: 0.05 * W, w: 0.9 * W, h: 0.86 * H, cy: 0.46 * H });
    else if (mode === 'loupe') magnification = drawLoupe(ctx, engine, byN.get(focus.page) ?? byN.get(hero[0]), focus);
    else if (mode === 'crop') drawCrop(ctx, engine, byN.get(focus.page) ?? byN.get(hero[0]), focus);
    else return { error: `unknown card mode "${mode}"` };
    const scaled = (w, h) => {
      const canvas = canvasOf(w, h);
      const c = canvas.getContext('2d');
      c.imageSmoothingQuality = 'high';
      c.drawImage(stage, 0, 0, w, h);
      return canvas;
    };
    const card = scaled(960, 720);
    const og = canvasOf(580, 622);
    const o = og.getContext('2d');
    o.fillStyle = '#0e1014';
    o.fillRect(0, 0, 580, 622);
    o.imageSmoothingQuality = 'high';
    const k = Math.min(520 / W, 560 / H);
    o.drawImage(stage, (580 - W * k) / 2, (622 - H * k) / 2, W * k, H * k);
    return {
      card: encode(card, 'image/webp', 0.82),
      card480: encode(scaled(480, 360), 'image/webp', 0.82),
      og: encode(og, 'image/jpeg', 0.86),
      png: png ? encode(card, 'image/png') : null,
      ogPng: png ? encode(og, 'image/png') : null,
      magnification: magnification === null ? null : round(magnification, 0.01),
    };
  } catch (error) {
    return { error: `${error?.name ?? 'Error'}: ${error?.message ?? error}`, taint: error?.name === 'SecurityError' };
  }
}

// ─── The Sandbox bundle ─────────────────────────────────────────────────────

/** 1980-01-01 00:00 local time, the earliest date a zip holds: every file
 *  of the bundle carries it, so the same input gives the same bytes. */
const ZIP_EPOCH = new Date(1980, 0, 1, 0, 0, 0);

function base64Of(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

function bytesOfBase64(base64) {
  const text = atob(base64);
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}

/** A data: URL as SVG markup (a string) or bytes. */
function dataUrlFile(url) {
  const comma = url.indexOf(',');
  const head = url.slice(5, comma);
  const payload = url.slice(comma + 1);
  const svg = /^image\/svg\+xml/i.test(head);
  if (/;base64$/i.test(head)) {
    const bytes = bytesOfBase64(payload);
    return svg ? new TextDecoder().decode(bytes) : bytes;
  }
  const text = decodeURIComponent(payload);
  return svg ? text : new TextEncoder().encode(text);
}

/** The picture a fileId was registered with, as a file: SVG markup from a
 *  data: URL, the blob an ImageBitmap was decoded from, the bytes of the
 *  image's URL, else the pixels re-encoded (`format`: png or jpeg). */
async function imageFile(image, format) {
  const cb = record();
  if (!image) return null;
  const src = typeof image.currentSrc === 'string' && image.currentSrc ? image.currentSrc
    : typeof image.src === 'string' ? image.src
      : image.href?.baseVal ?? '';
  if (src.startsWith('data:')) return dataUrlFile(src);
  const blob = cb.bitmapBlobs?.get(image);
  if (blob) return new Uint8Array(await blob.arrayBuffer());
  if (/^(https?|blob):/.test(src)) {
    try {
      const res = await fetch(src);
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        return /svg/i.test(res.headers.get('content-type') ?? '') ? new TextDecoder().decode(bytes) : bytes;
      }
    } catch { /* fall back to the pixels */ }
  }
  const w = image.naturalWidth || image.videoWidth || image.width;
  const h = image.naturalHeight || image.videoHeight || image.height;
  if (!w || !h) return null;
  const canvas = canvasOf(w, h);
  canvas.getContext('2d').drawImage(image, 0, 0, w, h);
  const type = format === 'jpeg' || format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  const out = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));
  return out ? new Uint8Array(await out.arrayBuffer()) : null;
}

/** The plain text of a document's first `# ` heading, or ''. */
function headingTitle(markdown) {
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const text = m[1]
      .replace(/\{[^}]*\}\s*$/, '')
      .replace(/\s*\\\\\s*/g, ' ')
      .replace(/[*_`]/g, '')
      .replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1')
      .trim();
    if (text) return text;
  }
  return '';
}

/**
 * Builds chained into one publication (#540): `capture.doc` lists several
 * document builds and every one after the first continues the one before
 * it (`content.continuation`), as a pen that sets articles with numbering
 * of their own and renders one PDF from all of them. The bundle then holds
 * a book with one chapter per build — its markdown, titled after its first
 * heading — every build's resources (the first of an id wins) and files;
 * the configuration is the first build's (a build whose own differs is
 * reported in `notes`, as is what a later continuation sets: the Sandbox
 * chains the chapters itself). Null when the builds do not chain.
 */
export function chainedBundleParts(picked, name = '') {
  if (!Array.isArray(picked) || picked.length < 2) return null;
  if (picked.some((b) => b?.kind !== 'document' && b?.kind !== 'worker')) return null;
  if (!picked.slice(1).every((b) => b.content?.continuation && typeof b.content.continuation === 'object')) return null;
  const notes = [];
  const chapters = [];
  const resources = [];
  const seen = new Set();
  const files = [];
  const firstConfig = JSON.stringify(plain(picked[0].config ?? {}) ?? {});
  picked.forEach((b, i) => {
    const markdown = String(b.content?.markdown ?? '');
    chapters.push({ title: headingTitle(markdown) || `${name || 'Chapter'} ${i + 1}`, markdown });
    for (const r of b.content?.resources ?? []) {
      if (!r || seen.has(r.id)) continue;
      seen.add(r.id);
      resources.push(r);
    }
    if (b.content?.files instanceof Map) files.push(b.content.files);
    if (i === 0) return;
    if (JSON.stringify(plain(b.config ?? {}) ?? {}) !== firstConfig) {
      notes.push(`build ${i + 1}: its configuration differs from the first's, which the book keeps`);
    }
    for (const key of Object.keys(b.content.continuation)) {
      if (key !== 'pageIndexOffset') notes.push(`build ${i + 1}: continuation.${key} not carried (the Sandbox chains the chapters itself)`);
    }
  });
  return { chapters, resources, files, notes };
}

/**
 * The document `select` picks, as a `.postext` file for the Sandbox,
 * written by the pen's own engine (`createBundle`): its markdown (or its
 * chapters, for a buildBundle book), its configuration as JSON, its
 * resources and every file they name, plus `thumbnail` (base64 WebP, the
 * card). A continuation cannot travel in a bundle: its page numbering goes
 * into `page.pageNumbering`, the rest is reported in `notes`. Several
 * builds chained with `continuation` make a book, a chapter each (see
 * {@link chainedBundleParts}). Returns the
 * bundle as base64, or `error` when a resource's file cannot be found.
 */
export async function sandboxBundle({ select = 'last', id, name, description, locale, thumbnail = null, folio = null } = {}) {
  const cb = record();
  const build = pick(select);
  if (!build) return { error: 'no recorded build' };
  const engine = engineOf(build);
  if (typeof engine?.createBundle !== 'function' || typeof engine?.zipBundle !== 'function') {
    return { error: 'the engine has no createBundle / zipBundle' };
  }
  const source = sourceOf(build);
  if (!source.known) return { error: `a ${build.kind} build records no source` };
  // Several builds chained with `continuation`: a book, one chapter each.
  const chain = build.kind === 'bundle' ? null : chainedBundleParts(build.picked, name);
  const notes = [...(chain?.notes ?? [])];
  const content = build.content ?? {};
  const config = plain(source.config ?? {}) ?? {};
  // recipe.json `folio`: how the Sandbox's Folio view shows the publication.
  if (folio) {
    const own = config.folio ?? {};
    config.folio = { ...own };
    for (const [key, value] of Object.entries(folio)) {
      config.folio[key] = value && typeof value === 'object' ? { ...own[key], ...value } : value;
    }
  }

  const cont = build.kind === 'bundle' ? null : content.continuation;
  if (cont && typeof cont === 'object') {
    if (cont.pageNumbering) {
      config.page = { ...config.page, pageNumbering: { ...config.page?.pageNumbering, ...plain(cont.pageNumbering) } };
    }
    if (cont.pageIndexOffset) {
      notes.push(cont.pageIndexOffset % 2
        ? `continuation.pageIndexOffset ${cont.pageIndexOffset}: page 1 is a verso in the recipe, a recto in the Sandbox`
        : `continuation.pageIndexOffset ${cont.pageIndexOffset} dropped (even: same page sides)`);
    }
    if (cont.headings) notes.push(`continuation.headings ${JSON.stringify(plain(cont.headings))} dropped (chapter numbers restart)`);
    for (const key of Object.keys(cont)) {
      if (!['pageNumbering', 'pageIndexOffset', 'headings'].includes(key)) notes.push(`continuation.${key} dropped`);
    }
  }

  const resources = (chain?.resources ?? source.resources).map((r) => plain(r));
  // `styleId: null` means the house style; postext 1.5 reads only a missing one so.
  for (const r of resources) if (r.table && r.table.styleId === null) delete r.table.styleId;
  const owns = chain ? chain.files : content.files instanceof Map ? [content.files] : [];
  const files = new Map();
  const missing = [];
  const find = async (fileId, format) => {
    for (const own of owns) if (own.has(fileId)) return own.get(fileId);
    if (cb.bundleFiles?.has(fileId)) return cb.bundleFiles.get(fileId);
    if (cb.imageSources?.has(fileId)) return imageFile(cb.imageSources.get(fileId), format);
    return null;
  };
  for (const r of resources) {
    const wanted = [
      [r.svg?.fileId, 'svg'], [r.svg?.pdfFileId, 'pdf'], [r.bitmap?.fileId, r.bitmap?.format],
      // A video: its poster, and its own file when the pen has its bytes.
      [r.video?.poster?.fileId, r.video?.poster?.format], [r.video?.fileId, 'video'],
    ];
    for (const [fileId, format] of wanted) {
      if (!fileId || files.has(fileId)) continue;
      const data = await find(fileId, format);
      if (data != null) files.set(fileId, data);
      else if (format === 'pdf') {
        // A print master the pen hands renderToPdf only: the SVG stays.
        delete r.svg.pdfFileId;
        notes.push(`${r.id}: print master ${fileId} left out (the SVG stays)`);
      } else if (format === 'video') {
        // The Sandbox plays it from its production address (video.url).
        delete r.video.fileId;
        notes.push(`${r.id}: video file ${fileId} left out (it plays from video.url)`);
      } else missing.push(`${r.id}: ${fileId}`);
    }
  }
  // Fonts built from bytes: the recipe's own files, matched by face.
  const weightOf = (w) => String(parseInt(String(w), 10) || 400);
  for (const family of config.customFonts ?? []) {
    if (family.redistributable === false) continue; // createBundle leaves its files out
    for (const v of family.variants ?? []) {
      if (!v.fileId || files.has(v.fileId)) continue;
      let data = await find(v.fileId, v.format);
      if (data == null) {
        data = (cb.faces ?? []).find((f) => f.family === family.name && weightOf(f.weight) === weightOf(v.weight)
          && (f.style === 'italic') === (v.style === 'italic'))?.bytes ?? null;
      }
      if (data == null) missing.push(`font ${family.name} ${v.weight} ${v.style}: ${v.fileId}`);
      else files.set(v.fileId, data);
    }
  }
  if (missing.length) return { error: `no file for ${missing.join(', ')}`, notes };

  const input = {
    id,
    name,
    ...(description ? { description } : {}),
    locale,
    config,
    resources,
    files,
    ...(thumbnail ? { thumbnail: { data: bytesOfBase64(thumbnail), mime: 'image/webp' } } : {}),
  };
  if (build.kind === 'bundle') {
    input.chapters = (content.chapters ?? []).map((c) => ({
      ...(typeof c?.title === 'string' && c.title ? { title: c.title } : {}),
      markdown: String(c?.markdown ?? ''),
    }));
    input.canvasScope = 'book';
  } else if (chain) {
    input.chapters = chain.chapters;
    input.canvasScope = 'book';
  } else {
    // One chapter named after its first heading: the pinned engine keeps a
    // `\\` line break of the heading in the name it derives itself.
    const markdown = source.markdowns[0] ?? '';
    input.chapters = [{ title: headingTitle(markdown) || name, markdown }];
  }
  try {
    const created = await engine.createBundle(input);
    // Zip again with a fixed date: createBundle before 1.5 stamps the time
    // of the call, and fflate reads it from Date.now().
    const now = Date.now;
    let bytes;
    try {
      Date.now = () => ZIP_EPOCH.getTime();
      bytes = engine.zipBundle(created.files, { mtime: ZIP_EPOCH });
    } finally {
      Date.now = now;
    }
    return { base64: base64Of(bytes), warnings: created.warnings ?? [], notes, files: Object.keys(created.files).sort() };
  } catch (error) {
    return { error: `createBundle: ${error?.message ?? error}`, notes };
  }
}
