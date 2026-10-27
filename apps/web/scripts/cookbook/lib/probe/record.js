// What the shims recorded in `window.__cb`: the builds, the engine, the
// pages, and the source a build was given.

/** Fontsource's `latin` subset (the kit's unicode-range): PDF text outside
 *  it falls back to another face (C25). */
export const LATIN = [
  [0x0000, 0x00ff], [0x0131, 0x0131], [0x0152, 0x0153], [0x02bb, 0x02bc], [0x02c6, 0x02c6],
  [0x02da, 0x02da], [0x02dc, 0x02dc], [0x0304, 0x0304], [0x0308, 0x0308], [0x0329, 0x0329],
  [0x2000, 0x206f], [0x20ac, 0x20ac], [0x2122, 0x2122], [0x2191, 0x2191], [0x2193, 0x2193],
  [0x2212, 0x2212], [0x2215, 0x2215], [0xfeff, 0xfeff], [0xfffd, 0xfffd],
];
export const MAIN_COLOR = '#295AA3';
/** Content warnings on how the text is set that C5 reports. */
export const TEXT_WARNING_KINDS = new Set(['arabicMarksExceedLeading', 'unbreakableWordOverflow', 'joiningScriptLetterSpacing', 'lineNumberOverlap', 'tabInVerticalText', 'dropCap', 'codeOverflow', 'textWrap',
  'afterText', 'unplaced', 'columnsTooNarrow', 'columnsFlowUnknown', 'fontFallback']);
/** What the page shows for the content warnings of postext 1.25: the side
 *  box or float left after the text or on no page (#639), a `:::columns`
 *  group too narrow or with an unknown flow (#634), a face measured in a
 *  fallback (#629). */
export function layoutDetail(w) {
  switch (w.kind) {
    case 'afterText': case 'unplaced': return w.resourceId ?? 'a side box';
    case 'columnsTooNarrow': return `${w.columns} columns of ${Math.round(w.widthPx)} px`;
    case 'columnsFlowUnknown': return `flow="${w.value}"`;
    case 'fontFallback': return `${w.family} ${w.weight}${w.style === 'italic' ? ' italic' : ''} (${w.reason})`;
    default: return undefined;
  }
}
/** What a comic warning names: the picture, the panel, the speaker, the style. */
export function comicDetail(w) {
  return [w.resourceId, w.anchorId, w.panel === undefined ? undefined : `panel ${w.panel + 1}`,
    w.style, w.speaker, w.reasons?.join('+'), w.message].filter((x) => x !== undefined && x !== '').join(' ');
}
export const FALLBACK_DIRECTIVES = ['pagebreak', 'numbering', 'columnbreak', 'space', 'toc'];
export const FALLBACK_CONTAINERS = ['callout', 'paragraphs', 'part', 'columns', 'paper'];
/** The parser's own fence patterns (packages/postext/src/parse/blockParser.ts). */
export const DIRECTIVE_RE = /^:::\s*([a-z][a-z0-9-]*)\s*(?:\{([^}]*)\})?\s*$/;
export const CLOSE_RE = /^:::\s*$/;
/** Raw-body fences whose lines belong to the comic parser. */
export const COMIC_FENCES = new Set(['page', 'strip']);
export const RESOURCE_RE = /^::resource\s*\{id="([^"]+)"\}\s*$/;
/** The embed sent to a slot of a composed page (#854): `id` and `slot` only. */
export const RESOURCE_SLOT_RE = /^::resource\s*\{\s*(?:id="[^"]+"\s+slot=(?:"[^"]*"|'[^']*'|[\w-]+)|slot=(?:"[^"]*"|'[^']*'|[\w-]+)\s+id="[^"]+")\s*\}\s*$/;
/** A composed page's fence (#854): four colons or more, `page` and its
 *  attributes, and the bare fence that closes it. Its body is Markdown. */
export const COMPOSED_OPEN_RE = /^:{4,}\s*page\s*(?:\{[^}]*\})?\s*$/;
export const COMPOSED_CLOSE_RE = /^:{4,}\s*$/;

// ─── The record ─────────────────────────────────────────────────────────────

export function record() {
  return window.__cb ?? { builds: [], images: [], engines: {}, pending: 0, lastBuildAt: 0, importedAt: 0 };
}

/** One recorded build: 'last' | 'first' | index. */
export function pickOne(builds, select) {
  const i = select === 'first' ? 0 : typeof select === 'number' ? select : builds.length - 1;
  return builds[Math.max(0, Math.min(builds.length - 1, i))];
}

/** The build that is "the result": capture.doc = 'last' | 'first' | index,
 *  or a list of them (two editions). Several builds make one: the first's
 *  source, config and engine, every build's documents, and `segments`, the
 *  documents of each build, whose pages {@link pagesOf} numbers on from
 *  one build to the next. */
export function pick(select = 'last') {
  const { builds } = record();
  if (!builds.length) return null;
  if (!Array.isArray(select)) return pickOne(builds, select);
  const picked = [...new Set(select.map((s) => pickOne(builds, s)))];
  if (picked.length === 1) return picked[0];
  return { ...picked[0], docs: picked.flatMap((b) => b.docs ?? []), segments: picked.map((b) => b.docs ?? []), picked };
}

/** A build's index in the record (the first one, for several). */
export function indexOfBuild(build) {
  return record().builds.indexOf(build?.picked?.[0] ?? build);
}

/** The engine module instance that built (or painted) a build. */
export function engineOf(build) {
  const { engines } = record();
  return engines[build?.shim] ?? engines.postext ?? engines['postext-bundle'] ?? Object.values(engines)[0];
}

/** Every page of a build in book order. `n` counts from 1 at the build's
 *  first page (capture.hero, capture.pages and the pNN files use it, so a
 *  document continued at `continuation.pageIndexOffset: 40` still has pages
 *  1–4); `book` is the physical page number in the whole book, whose parity
 *  decides versos and rectos. */
export function pagesOf(build) {
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

// ─── Facts ──────────────────────────────────────────────────────────────────

/** What the pen gave the engine: its markdown, resources and (user) config. */
export function sourceOf(build) {
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

export function spansOf(blocks) {
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
