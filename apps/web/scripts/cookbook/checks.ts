/**
 * The capture's checks (spec §8.5) and the detected facts of capture.json.
 * lib/probe.js gathers the facts in the page, with the pinned engine; this
 * module judges them. A FAIL blocks the write; WARN and INFO findings go to
 * `diagnostics.findings`.
 *
 * Run by Node's type stripping: erasable TypeScript, relative `.ts` imports.
 */
import zlib from "node:zlib";
import { markdownConstructs, usedApis } from "../../src/lib/cookbook/detect.ts";
import type { CaptureVariant, ComposedPen, Level, Registry, RecipeMeta } from "../../src/lib/cookbook/types.ts";

export type Severity = "fail" | "warn" | "info";

export interface Finding {
  check: string;
  severity: Severity;
  detail: string;
}

// ─── What lib/probe.js returns ──────────────────────────────────────────────

export interface ProbeFace {
  family: string;
  weight: number;
  style: "normal" | "italic";
  where?: string;
}

export interface ProbePage {
  /** 1-based from the build's first page. */
  n: number;
  /** The physical page number in the whole book (`continuation.pageIndexOffset` + 1 on the first page). */
  book: number;
  docIndex: number;
  index: number;
  label: string;
  role: "body" | "opener" | "part" | "blank";
  w: number;
  h: number;
  trimOffset: number;
  blank: boolean;
  blocks: number;
  coverage: number;
  h1: boolean;
  heading: string;
  captions: string[];
  legibility?: number;
}

export interface ProbeFacts {
  builds: { kind: "document" | "bundle" | "worker" | "rendered"; shim: string; ms: number; at: number; pages: number }[];
  /** Index of the build that is the result, or -1 when nothing was built. */
  selected: number;
  /** Every build that is the result, when `capture.doc` names several: their
   *  pages are published one build after the other. */
  selectedBuilds?: number[];
  importedAt: number;
  registered: string[];
  state: string | null;
  status: string | null;
  pdfButton: boolean;
  sourceKnown?: boolean;
  userConfig?: Record<string, unknown> | null;
  markdowns?: string[];
  resources?: { id: string; kind: string; typeId: string; note: boolean; fileId: string | null; placement: unknown; styleId: string | null }[];
  known?: { directives: string[]; containers: string[] };
  parseIssues?: { chapter: number; kind: string; line: number; excerpt: string }[];
  badFences?: { chapter: number; line: number; text: string; name: string }[];
  unknownStyles?: { what: string; id: string; at: string }[];
  unknownRefs?: { usage: string; id: string; at: string }[];
  duplicates?: string[];
  directives?: string[];
  inline?: string[];
  unregistered?: { fileId: string; page: number }[];
  faces?: {
    used: ProbeFace[];
    loaded: { family: string; weight: string; style: string }[];
    missing: ProbeFace[];
    /** Characters a CJK or Arabic face set from files not loaded when the layout ran. */
    late?: (ProbeFace & { chars: string })[];
  };
  garbage?: { text: string; where: string }[];
  nonLatin?: { ch: string; code: string; where: string }[];
  defaultSkin?: {
    body: boolean;
    headingLevels: number[];
    header: boolean | null;
    footer: boolean | null;
    colors: string[];
    callouts: number;
    tables: number;
    lists: number;
    palette: boolean | null;
  };
  warnings?: { kind: string; page: number; overflowPx: number }[];
  /** Warnings `:::index` raised (#172): `doc.contentWarnings` of the index kinds. */
  indexWarnings?: { kind: string; page: number | null; detail: string }[];
  /** Content warnings on how the text is set (`arabicMarksExceedLeading`,
   *  `unbreakableWordOverflow`, `joiningScriptLetterSpacing`), with the
   *  words they name. */
  textWarnings?: { kind: string; page: number | null; detail: string }[];
  converged?: boolean;
  iterationCount?: number;
  loose?: {
    count: number;
    total: number;
    share: number;
    worst: number;
    threshold: number;
    /** The loosest lines past the threshold, loosest first (at most 5). */
    lines?: { page: number; ratio: number; text: string }[];
  };
  /** Justified lines of the CJK composer (`VDTLine.cjkComposed`), judged by
   *  the space between their characters (`VDTLineSegment.tracking`, in em)
   *  instead of their word spaces: `count` lines past the cap, set short
   *  (`cjkLoose`), `worst` the widest spacing, `threshold` the cap. */
  cjkLoose?: {
    count: number;
    total: number;
    share: number;
    worst: number;
    threshold: number;
    /** The lines set short, in page order (at most 5). */
    lines?: { page: number; tracking: number; text: string }[];
  };
  /** `"right"` when the document is bound on its right edge (`doc.binding`). */
  binding?: "right";
  /** `"rtl"` when the document's text runs right to left (the resolved
   *  `config.direction`, also when the locale implied it). */
  direction?: "rtl";
  /** The digit system the engine writes numbers in, when the document is
   *  right to left or names one (`config.numerals`, resolved from the locale). */
  numerals?: "latn" | "arab" | "arabext";
  pages?: ProbePage[];
  specimen?: {
    trimMm: [number, number];
    dpi: number;
    layoutType: string;
    gutterMm?: number;
    mirror: boolean;
    body: { family: string; sizePt: number; leadingPt: number };
    families: string[];
    pages: number;
  };
  signals?: { splitTables: boolean; rotated: boolean; sideFloats: boolean; partPalette: boolean; placements: boolean; chapters: number };
  vdt?: string;
}

// ─── Detected facts (capture.json `detected`) ───────────────────────────────

type Detected = CaptureVariant["detected"];

function isLeafObject(value: Record<string, unknown>): boolean {
  return ("hex" in value && "model" in value) || ("value" in value && "unit" in value);
}

/** The user config's shape: dotted key paths (≤ 3 segments, arrays as
 *  `[]`), top-level sections, leaf count (a colour or a dimension is one
 *  leaf) and design elements (items of every `elements` array). */
export function configStats(config: Record<string, unknown> | null | undefined): {
  keys: string[];
  sections: string[];
  leaves: number;
  designElements: number;
  paths: string[];
} {
  const keys = new Set<string>();
  const paths = new Set<string>();
  let leaves = 0;
  let designElements = 0;
  const walk = (value: unknown, segs: string[]) => {
    // An array item repeats its array's key: record paths on entering the array.
    if (segs.length && !segs[segs.length - 1].endsWith("[]")) {
      if (segs.length <= 3) keys.add(segs.join("."));
      paths.add(segs.join(".").replace(/\[\]/g, ""));
    }
    if (value === null || typeof value !== "object" || isLeafObject(value as Record<string, unknown>)) {
      leaves++;
      return;
    }
    if (Array.isArray(value)) {
      const last = segs[segs.length - 1] ?? "";
      if (last.replace(/\[\]/g, "") === "elements") {
        designElements += value.filter((item) => item && typeof item === "object").length;
      }
      if (value.every((item) => item === null || typeof item !== "object")) {
        leaves++;
        return;
      }
      const itemSegs = [...segs.slice(0, -1), `${last}[]`];
      for (const item of value) walk(item, itemSegs);
      return;
    }
    for (const [key, item] of Object.entries(value)) walk(item, [...segs, key]);
  };
  if (config) walk(config, []);
  return {
    keys: [...keys].sort(),
    sections: Object.keys(config ?? {}).sort(),
    leaves,
    designElements,
    paths: [...paths],
  };
}

/** Registry features whose `detect` rule fires on this capture. */
export function detectFeatures(
  registry: Registry | null,
  input: { paths: string[]; markdown: string; apis: string[] },
): { detected: string[]; rules: Set<string> } {
  const detected: string[] = [];
  const rules = new Set<string>();
  if (!registry) return { detected, rules };
  const test = (source: string): boolean => {
    try {
      return new RegExp(source, "m").test(input.markdown);
    } catch {
      return input.markdown.includes(source);
    }
  };
  for (const [id, feature] of Object.entries(registry.features ?? {})) {
    const rule = feature.detect;
    if (!rule) continue;
    rules.add(id);
    const hit =
      (rule.config ?? []).some((key) => {
        const want = key.replace(/\[\]/g, "");
        return input.paths.some((p) => p === want || p.startsWith(`${want}.`));
      }) ||
      (rule.markdown ?? []).some(test) ||
      (rule.api ?? []).some((name) => input.apis.includes(name));
    if (hit) detected.push(id);
  }
  return { detected: detected.sort(), rules };
}

const NAMED_STYLES = ["headingStyles", "calloutStyles", "paragraphStyles", "chipStyles", "tableStyles"];

/** Spec §2.3, from what the capture saw. */
export function suggestLevel(
  meta: RecipeMeta,
  facts: ProbeFacts,
  stats: { leaves: number; designElements: number },
  apis: string[],
): Level {
  const kinds = new Set(facts.builds.map((b) => b.kind));
  const s = facts.signals;
  const advanced =
    kinds.has("bundle") || kinds.has("worker") || !!s?.partPalette || !!s?.rotated || !!s?.splitTables ||
    !!s?.sideFloats || !!meta.engine.math || !!meta.engine.worker || meta.outputs.includes("live") ||
    stats.leaves > 200 || stats.designElements > 12;
  if (advanced) return 3;
  const config = facts.userConfig ?? {};
  const named = NAMED_STYLES.some((key) => Array.isArray(config[key]) && (config[key] as unknown[]).length > 0);
  const intermediate =
    stats.designElements > 0 || !!s?.placements || named || meta.outputs.includes("pdf") || stats.leaves >= 60 ||
    (facts.resources?.length ?? 0) > 1 || apis.length > 4;
  return intermediate ? 2 : 1;
}

/** The detected facts of capture.json. APIs, directives and inline
 *  constructs come from lib/cookbook/detect.ts, like the static detection
 *  the site falls back to before a capture, so both speak the same names;
 *  the config facts come from the config the engine actually received. */
export function detect(meta: RecipeMeta, facts: ProbeFacts, pen: ComposedPen, registry: Registry | null): Detected & { paths: string[] } {
  const apis = usedApis(pen.js);
  const stats = configStats(facts.userConfig);
  const resources = { svg: 0, bitmap: 0, table: 0 };
  for (const r of facts.resources ?? []) if (r.kind in resources) resources[r.kind as keyof typeof resources]++;
  const fonts = (facts.faces?.used ?? []).map(({ family, weight, style }) => ({ family, weight, style }));
  // Vertical and right-to-left text bind a book on the right without
  // saying page.binding, and an Arabic locale sets the text right to left
  // without saying direction or numerals: the document's binding, direction
  // and digits count as the keys.
  const paths = [...stats.paths];
  if (facts.binding === "right" && !paths.includes("page.binding")) paths.push("page.binding");
  if (facts.direction === "rtl" && !paths.includes("direction")) paths.push("direction");
  if (facts.numerals && !paths.includes("numerals")) paths.push("numerals");
  const { detected } = detectFeatures(registry, { paths, markdown: (facts.markdowns ?? []).join("\n"), apis });
  const directives = new Set<string>();
  const inline = new Set<string>();
  for (const markdown of facts.markdowns ?? []) {
    const found = markdownConstructs(markdown);
    found.directives.forEach((d) => directives.add(d));
    found.inline.forEach((d) => inline.add(d));
  }
  return {
    apis,
    configKeys: stats.keys,
    configSections: stats.sections,
    configLeaves: stats.leaves,
    designElements: stats.designElements,
    directives: [...directives],
    inline: [...inline],
    resources,
    fonts,
    features: detected,
    suggestedLevel: suggestLevel(meta, facts, stats, apis),
    paths: stats.paths,
  };
}

// ─── PDF ────────────────────────────────────────────────────────────────────

const PAGE_OBJECT = /\/Type\s*\/Page(?![A-Za-z])/g;

/** Page objects in a PDF, including those packed in (Flate) object streams. */
export function pdfPageCount(bytes: Buffer): number {
  const text = bytes.toString("latin1");
  let count = (text.match(PAGE_OBJECT) ?? []).length;
  const stream = /(?<!end)stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = stream.exec(text))) {
    const start = match.index + match[0].length;
    const end = text.indexOf("endstream", start);
    if (end < 0) break;
    // The stream's dictionary: from its `obj` keyword to `stream`.
    const head = text.slice(Math.max(0, text.lastIndexOf(" obj", match.index)), match.index);
    if (/\/Type\s*\/ObjStm/.test(head) && /\/FlateDecode/.test(head)) {
      try {
        count += (zlib.inflateSync(bytes.subarray(start, end)).toString("latin1").match(PAGE_OBJECT) ?? []).length;
      } catch {
        // A stream we cannot inflate holds no page objects we can count.
      }
    }
    stream.lastIndex = end;
  }
  return count;
}

// ─── The checks ─────────────────────────────────────────────────────────────

export interface CheckInput {
  meta: RecipeMeta;
  facts: ProbeFacts | null;
  done: "ok" | "error" | "timeout";
  err: string | null;
  loaderErrors: string[];
  console: { type: string; text: string }[];
  pageErrors: string[];
  net: { severity: "fail" | "warn"; detail: string }[];
  failedRequests: string[];
  settleTimedOut: boolean;
  /** The kit's state before the PDF was built. */
  kit: { state: string | null; status: string | null } | null;
  tainted: number[];
  /** Captured without request interception (a worker recipe). */
  passive: boolean;
  /** postext versions the layout worker imported; the pinned one. */
  workerEngines: string[];
  engine: string;
  timeoutMs: number;
  totalMs: number;
  pdf: { button: boolean; timedOut: boolean; error: string | null; fontFailures: string[]; bytes: number; pages: number | null } | null;
  published: number[];
  publishError: string | null;
  cardErrors: string[];
  renderError: { message: string; taint: boolean } | null;
  magnification: number | null;
  /** Bytes of the edition's images (PDF excluded). */
  bytes: number;
  /** Bytes of card.webp, card.480.webp and og.jpg. */
  cardBytes: { card: number; card480: number; og: number } | null;
  assets: string[];
  detected: Detected & { paths: string[] };
  registry: Registry | null;
  previous: { chrome?: string; vdtHash?: string; sourceHash?: string } | null;
  chrome: string;
  vdtHash: string;
  sourceHash: string;
}

const MB = 1024 * 1024;
const ATTRIBUTION = new Set(["CC-BY-4.0", "CC-BY-SA-4.0"]);
const IMAGE_ASSET = /\.(svg|png|jpe?g|webp|gif|avif|pdf)$/i;

const firstLines = (text: string, n = 3) => text.split("\n").slice(0, n).join(" ⏎ ").slice(0, 400);
const pct = (share: number) => `${(share * 100).toFixed(1)} %`;
const stem = (file: string) => file.replace(/^.*\//, "").replace(/\.[^.]+$/, "").toLowerCase();

/** Folds identical findings into one, counted. */
function dedupe(findings: Finding[]): Finding[] {
  const counts = new Map<string, { finding: Finding; n: number }>();
  for (const f of findings) {
    const key = `${f.check}\0${f.severity}\0${f.detail}`;
    const seen = counts.get(key);
    if (seen) seen.n++;
    else counts.set(key, { finding: f, n: 1 });
  }
  return [...counts.values()].map(({ finding, n }) => (n > 1 ? { ...finding, detail: `${finding.detail} (×${n})` } : finding));
}

export function runChecks(input: CheckInput): Finding[] {
  return dedupe(collect(input));
}

function collect(input: CheckInput): Finding[] {
  const { meta, facts } = input;
  const out: Finding[] = [];
  const add = (check: string, severity: Severity, detail: string) => out.push({ check, severity, detail });
  const expect = meta.capture.expect ?? {};

  // C1: the script failed or never finished.
  if (input.done === "timeout") add("C1", "fail", `timed out after ${Math.round(input.timeoutMs / 1000)} s waiting for the pen to finish`);
  if (input.done === "error") add("C1", "fail", `the script threw: ${firstLines(input.err ?? "unknown error")}`);
  const errors = new Set([...input.pageErrors, ...input.loaderErrors].map((e) => firstLines(e, 2)));
  for (const error of [...errors].slice(0, 5)) add("C1", "fail", `uncaught: ${error}`);
  if (input.kit?.state === "error") add("C1", "fail", `the kit reported an error: ${input.kit.status ?? ""}`.trim());

  // C2: console errors (resource failures are C3's).
  const accepted = expect.console ?? [];
  const consoleErrors = input.console
    .filter((m) => m.type === "error" && !/Failed to load resource/i.test(m.text))
    .filter((m) => !accepted.some((s) => m.text.includes(s)));
  for (const m of consoleErrors.slice(0, 5)) add("C2", "fail", `console.error: ${firstLines(m.text, 2)}`);

  // C3: the network.
  for (const issue of input.net) add("C3", issue.severity, issue.detail);
  for (const failure of input.failedRequests.slice(0, 8)) add("C3", "fail", failure);

  // C13: the kit had to load faces FONTS does not list.
  for (const m of input.console.filter((x) => x.text.includes("[cookbook] FONTS does not list"))) {
    add("C13", "fail", m.text.replace(/^\[cookbook\]\s*/, ""));
  }

  if (input.settleTimedOut) add("H10", "warn", "builds kept arriving: no 500 ms quiet window within 10 s");
  if (input.passive) add("C3", "info", "a worker recipe: captured without request interception (hosts checked, network not cached)");
  const others = input.workerEngines.filter((v) => v !== input.engine);
  if (others.length) add("H6", "info", `the layout worker ran postext ${others.join(", ")} (workers ignore the import map; pages painted with ${input.engine})`);

  // C4: nothing built.
  if (!facts || facts.selected < 0) {
    if (input.done === "ok") add("C4", "fail", "nothing built: no buildDocument / buildBundle call reached the engine");
    return out;
  }
  const pages = facts.pages ?? [];
  if (!pages.length) {
    add("C4", "fail", "the document has no pages");
    return out;
  }
  if (facts.sourceKnown === false) {
    add("C7", "info", "the result was painted without a recorded build (a worker?): C7–C10 skipped");
  }

  // C5: layout warnings the recipe does not demonstrate on purpose.
  const expected = new Set(expect.warnings ?? []);
  for (const w of facts.warnings ?? []) {
    if (!expected.has(w.kind)) add("C5", "fail", `${w.kind} on page ${w.page} (${w.overflowPx} px over)`);
  }
  for (const w of [...(facts.indexWarnings ?? []), ...(facts.textWarnings ?? [])]) {
    if (!expected.has(w.kind)) add("C5", "fail", `${w.kind}${w.detail ? ` "${w.detail}"` : ""}${w.page ? ` on page ${w.page}` : ""}`);
  }
  for (const kind of expected) {
    const seen = [...(facts.warnings ?? []), ...(facts.indexWarnings ?? []), ...(facts.textWarnings ?? [])];
    if (!seen.some((w) => w.kind === kind)) add("C5", "info", `expect.warnings lists ${kind}, which did not occur`);
  }

  // C6: convergence.
  if (facts.converged === false) add("C6", "fail", `the layout did not converge (${facts.iterationCount} iterations)`);

  // C7–C11: the source against the engine and the config.
  for (const issue of facts.parseIssues ?? []) {
    add("C7", "fail", `${issue.kind} at chapter ${issue.chapter + 1}, line ${issue.line}: ${issue.excerpt}`);
  }
  for (const fence of facts.badFences ?? []) {
    add("C8", "fail", `chapter ${fence.chapter + 1}, line ${fence.line}: "${fence.text}" is not a known directive (printed as text)`);
  }
  for (const s of facts.unknownStyles ?? []) add("C9", "fail", `unknown ${s.what} "${s.id}" (${s.at})`);
  for (const r of facts.unknownRefs ?? []) add("C10", "fail", `unknown resource "${r.id}" in ${r.usage} (${r.at}): printed "?"`);
  for (const id of facts.duplicates ?? []) add("C10", "fail", `resource id "${id}" is declared more than once`);
  for (const u of facts.unregistered ?? []) {
    add("C11", "fail", `image "${u.fileId}" (page ${u.page}) is placed but never registered: a grey placeholder`);
  }

  // C12: faces the pages use that no FontFace covers, and characters a CJK
  // or Arabic face set from files that loaded after the layout (measured in
  // another face).
  const faceName = (face: ProbeFace) => `${face.family} ${face.weight}${face.style === "italic" ? " italic" : ""}`;
  for (const face of facts.faces?.missing ?? []) {
    add("C12", "fail", `${faceName(face)} is used (${face.where}) but not loaded`);
  }
  for (const face of facts.faces?.late ?? []) {
    add("C12", "fail", `${faceName(face)} sets ${[...face.chars].join(" ")} (${face.where}) from files not loaded when the layout ran: ` +
      (/\p{Script=Arabic}/u.test(face.chars)
        ? "list the weight in FONTS and load it with loadArabicFonts(FONTS, markdown) before the build"
        : "give loadCjkFonts the text this face sets, and list the weight in FONTS"));
  }

  // C14: the PDF.
  if (meta.downloads?.pdf) {
    const pdf = input.pdf;
    if (!pdf || !pdf.button) add("C14", "fail", "downloads.pdf is set but the page has no [data-postext-pdf] button (offerPdf)");
    else {
      if (pdf.timedOut) add("C14", "fail", "the PDF did not finish in time");
      if (pdf.error) add("C14", "fail", `renderToPdf threw: ${firstLines(pdf.error, 1)}`);
      for (const f of pdf.fontFailures) add("C14", "fail", `font provider failed: ${f}`);
      if (!pdf.error && !pdf.timedOut && !pdf.bytes) add("C14", "fail", "no PDF bytes were produced");
      if (pdf.bytes && pdf.pages !== null) {
        if (pdf.pages === 0) add("C14", "warn", "could not count the PDF's pages");
        else {
          // Of a capture of several builds, the PDF is one of them.
          const counts = (facts.selectedBuilds ?? []).map((i) => facts.builds[i]?.pages ?? 0);
          if (counts.length > 1) {
            if (!counts.includes(pdf.pages)) add("C14", "fail", `the PDF has ${pdf.pages} pages, the documents ${counts.join(" and ")}`);
          } else if (pdf.pages !== pages.length) add("C14", "fail", `the PDF has ${pdf.pages} pages, the document ${pages.length}`);
        }
      }
      if (pdf.bytes > 2 * MB) add("C20", "fail", `the PDF weighs ${(pdf.bytes / MB).toFixed(2)} MB (limit 2 MB)`);
    }
  }

  // C15 and the pictures.
  if (input.tainted.length) {
    add("C15", "fail", `page ${input.tainted.join(", ")} taints the canvas (a cross-origin image without CORS): no PNG export`);
  }
  if (input.renderError && !(input.renderError.taint && input.tainted.length)) {
    add(input.renderError.taint ? "C15" : "render", "fail",
      input.renderError.taint ? `canvas tainted (cross-origin image): ${input.renderError.message}` : input.renderError.message);
  }
  for (const problem of input.cardErrors) add("card", "fail", problem);
  if (input.publishError) add("C20", "fail", input.publishError);
  if (input.magnification !== null && (input.magnification < 1.5 || input.magnification > 4)) {
    add("card", "info", `the loupe magnifies ${input.magnification}×: aim for 2–3× (narrow or widen capture.focus)`);
  }

  // C16: printed garbage.
  for (const g of facts.garbage ?? []) add("C16", "fail", `"${g.text}" (${g.where})`);

  // C17: the default skin.
  const skin = facts.defaultSkin;
  if (skin) {
    const allowed = new Set(expect.defaultSkin ?? []);
    const hits: string[] = [];
    if (skin.body) hits.push("body text is the default EB Garamond 8 pt");
    if (skin.headingLevels.length && !allowed.has("headings")) {
      hits.push(`heading level ${skin.headingLevels.join(", ")} in the default Open Sans #295AA3`);
    }
    if (skin.header) hits.push("no header in the config (the default running heads)");
    if (skin.footer) hits.push("no footer in the config (the default folio)");
    if (skin.colors.length) hits.push(`${skin.colors.join(", ")} left at the default #295AA3`);
    if (skin.callouts && !allowed.has("callouts")) hits.push(`${skin.callouts} callout(s) in the default #f4f4f4 box without a stripe`);
    if (skin.tables && !allowed.has("tables")) hits.push(`${skin.tables} table(s) with the default grid and #f0f0f0 header`);
    if (skin.lists && !allowed.has("lists")) hits.push(`${skin.lists} list item(s) with the default #295AA3 bullets`);
    if (skin.palette) hits.push("no colorPalette");
    for (const hit of hits) add("C17", "fail", `default skin: ${hit}`);
  }

  // C18: empty pages that should not be.
  for (const p of pages) {
    if (!p.blank && (p.role === "body" || p.role === "opener") && p.blocks === 0) {
      add("C18", "fail", `page ${p.n} (${p.role}) is empty and is not a parity blank`);
    }
  }

  // C19: credits.
  const images = meta.credits?.images ?? [];
  for (const asset of input.assets.filter((a) => IMAGE_ASSET.test(a))) {
    const file = asset.replace(/^assets\//, "");
    if (!images.some((c) => c.file === file || c.file === asset)) add("C19", "fail", `${asset} has no credits.images entry`);
  }
  for (const credit of images.filter((c) => c.file && ATTRIBUTION.has(c.license))) {
    for (const r of (facts.resources ?? []).filter((x) => x.fileId && stem(x.fileId) === stem(credit.file ?? ""))) {
      if (!r.note) add("C19", "fail", `resource "${r.id}" shows ${credit.file} (${credit.license}) without a note crediting it`);
    }
  }

  // C20: budget. The warning grows with the pages published (0.1 MB each,
  // 0.9 MB at least): a dense text page weighs about 100 KB whatever it shows.
  const warnMb = Math.max(0.9, 0.1 * input.published.length);
  if (input.bytes > 1.4 * MB) add("C20", "fail", `the edition's images weigh ${(input.bytes / MB).toFixed(2)} MB (limit 1.4 MB)`);
  else if (input.bytes > warnMb * MB) add("C20", "warn", `the edition's images weigh ${(input.bytes / MB).toFixed(2)} MB (warning at ${warnMb.toFixed(1)} MB for ${input.published.length} pages)`);

  const cardLimits = { card: 90, card480: 35, og: 90 } as const;
  const cardNames = { card: "card.webp", card480: "card.480.webp", og: "og.jpg" } as const;
  for (const key of ["card", "card480", "og"] as const) {
    const size = input.cardBytes?.[key] ?? 0;
    if (size > cardLimits[key] * 1024) add("C20", "warn", `${cardNames[key]} weighs ${Math.round(size / 1024)} KB (aim for ≤ ${cardLimits[key]} KB)`);
  }

  // C21: performance, of each build that is the result.
  for (const i of facts.selectedBuilds ?? [facts.selected]) {
    const build = facts.builds[i];
    if (!build) continue;
    if (build.ms > 4000) add("C21", "fail", `the build took ${Math.round(build.ms)} ms (limit 4 s)`);
    else if (build.ms > 1500) add("C21", "warn", `the build took ${Math.round(build.ms)} ms (warning at 1.5 s)`);
  }
  if (input.totalMs > 30_000) add("C21", "warn", `the pen took ${(input.totalMs / 1000).toFixed(1)} s to finish (warning at 30 s)`);

  // C22: blank cascades.
  let run = 0;
  let longest = 0;
  for (const p of pages) {
    run = p.blank ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  const blanks = pages.filter((p) => p.blank).length;
  const chapters = facts.signals?.chapters ?? 1;
  if (longest > 2) add("C22", "warn", `${longest} blank pages in a row`);
  else if (blanks > chapters) add("C22", "warn", `${blanks} blank pages for ${chapters} chapter(s)`);

  // C23: near-empty pages.
  const sparse = new Set(expect.nearEmptyPages ?? []);
  pages.forEach((p, i) => {
    const next = pages[i + 1];
    const chapterEnd = !next || next.docIndex !== p.docIndex || next.h1 || next.blank || next.role !== "body";
    if (p.role !== "body" || p.blank || chapterEnd || sparse.has(p.n)) return;
    if (p.coverage < 0.25) add("C23", "warn", `page ${p.n} is only ${pct(p.coverage)} filled (not a chapter's last page)`);
  });

  // C24: loose lines. Latin lines by their word spaces; Chinese, Japanese
  // and Korean lines by the space between their characters, which is how
  // they are justified: only a line past the cap, set short, is loose.
  const clipText = (text: string) => (text.length > 48 ? `${text.slice(0, 47).trimEnd()}…` : text);
  const loose = facts.loose;
  if (loose && loose.total && loose.share > 0.02) {
    const where = (loose.lines ?? []).slice(0, 3).map((l) => `p. ${l.page} ${l.ratio}× “${clipText(l.text)}”`);
    add("C24", "warn", `${loose.count} of ${loose.total} justified lines (${pct(loose.share)}) stretch past ${loose.threshold}× (worst ${loose.worst}×)${where.length ? `; loosest: ${where.join(", ")}` : ""}`);
  }
  const cjkLoose = facts.cjkLoose;
  if (cjkLoose && cjkLoose.count > 0) {
    const where = (cjkLoose.lines ?? []).slice(0, 3).map((l) => `p. ${l.page} “${clipText(l.text)}”`);
    add("C24", "warn", `${cjkLoose.count} of ${cjkLoose.total} justified Chinese, Japanese or Korean lines needed more than ${cjkLoose.threshold} em between characters and end short (cjkLooseLine)${where.length ? `; ${where.join(", ")}` : ""}`);
  }

  // C25: characters a PDF recipe's fonts cannot set: those outside
  // Fontsource's latin subset that no loaded face covers (a CJK face the
  // cjk block loads by slices covers its own, an Arabic face the arabic
  // block completes covers the Arabic letters), and what postext-pdf drew
  // with no glyph (its missingGlyph warning, printed to the console).
  const pdfRecipe = meta.outputs.includes("pdf") || !!meta.downloads?.pdf;
  if (pdfRecipe && facts.nonLatin?.length) {
    add("C25", "warn", `outside the latin subset: ${facts.nonLatin.map((c) => `${c.ch} ${c.code}`).join(", ")}`);
  }
  if (pdfRecipe) {
    const MISSING = /^postext-pdf: "(.+?)" (\d+(?: italic)?) has no glyph for [^(]*\((.+?)\); the PDF draws them/;
    for (const m of input.console) {
      const hit = MISSING.exec(m.text);
      if (hit) add("C25", "warn", `the PDF has no glyph for "${hit[1]}" ${hit[2]}: ${hit[3]}`);
    }
    // HarfBuzz not loaded: the PDF still builds, its Arabic shaped by
    // fontkit with every mark misplaced, which no page count shows.
    // postext-pdf says so on the console (its complexShapingUnavailable
    // warning; the shim prints it even when the pen passes onWarning).
    const noShaper = input.console.find((m) => /^postext-pdf: HarfBuzz did not load/.test(m.text));
    if (noShaper) add("C14", "fail", `the PDF's right-to-left text was shaped without HarfBuzz: ${firstLines(noShaper.text, 1)}`);
  }

  // C26: hero legibility.
  const hero = pages.filter((p) => p.legibility !== undefined);
  if (hero.length) {
    const share = hero.reduce((sum, p) => sum + (p.legibility ?? 0), 0) / hero.length;
    if (share < 0.25) add("C26", "warn", `the hero is ${pct(share)} colour, pictures or display type (aim for 25 %+)`);
  }

  // C27: declared features whose detect rule did not fire.
  if (input.registry) {
    const fired = new Set(input.detected.features);
    for (const id of meta.features?.primary ?? []) {
      if (input.registry.features?.[id]?.detect && !fired.has(id)) add("C27", "warn", `features.primary lists ${id}, but its detect rule did not fire`);
    }
  }

  // C28: level sanity.
  if (Math.abs(meta.level - input.detected.suggestedLevel) >= 2) {
    add("C28", "warn", `declared level ${meta.level}, the capture suggests ${input.detected.suggestedLevel}`);
  }

  // C29: page-count drift.
  if (expect.pages && (pages.length < expect.pages[0] || pages.length > expect.pages[1])) {
    add("C29", "warn", `${pages.length} pages, outside expect.pages ${expect.pages[0]}–${expect.pages[1]}`);
  }

  // Against the committed capture.
  const prev = input.previous;
  if (prev?.chrome && prev.chrome !== input.chrome) {
    add("chrome", "warn", `Chrome ${input.chrome}, the committed capture used ${prev.chrome}: pixels may differ`);
  }
  if (prev?.vdtHash && prev.vdtHash !== input.vdtHash) {
    add("vdt", prev.sourceHash === input.sourceHash ? "warn" : "info",
      prev.sourceHash === input.sourceHash
        ? "the layout changed with the same sources (engine or font regression?)"
        : "the layout changed since the committed capture");
  }
  return out;
}
