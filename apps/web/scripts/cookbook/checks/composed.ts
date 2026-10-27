// The composed-page bench: page template warnings (C37), the source-map
// round trip (C40), the config size (C41) and the stretched edition (C38)
// (#1276: split out of checks.ts).
import type { RecipeMeta } from '../../../src/lib/cookbook/types.ts';
import { type ProbeFacts, type ComposedFacts, type ComposedProposalFact, type Finding, type Severity, configWarningText, type ComposedFrameFact, firstLines } from './facts.ts';

// ─── The composed-page bench (#869) ─────────────────────────────────────────

/** Configuration warnings of page templates (#853), as `ConfigWarning`
 *  kinds: on a recipe with composed pages, C37 failures. */
export const PAGE_TEMPLATE_WARNING_KINDS = [
  "templateDuplicate", "templateExtendsCycle", "templateExtendsUnknown", "frameDuplicate", "frameStyleUnknown",
  "frameAnchorUnknown", "frameMinMax", "groupFrameUnknown", "groupFrameTwice", "frameChainLoop",
  "overflowTargetUnknown", "labelStyleUnknown",
] as const;
export const C37_CONFIG_KINDS: ReadonlySet<string> = new Set(["contentInConfig", ...PAGE_TEMPLATE_WARNING_KINDS]);

/** The largest configuration a recipe may hand the engine (C41): what the
 *  Sandbox loads and a reader copies. */
export const CONFIG_LIMIT_BYTES = 1024 * 1024;

/** Whether the result has composed pages, or its Markdown declares them
 *  (a `::::page{template=…}` whose template is missing still does). */
export function usesComposedPages(facts: ProbeFacts | null | undefined): boolean {
  const c = facts?.composed;
  return !!c && (c.declared || c.pages.length > 0 || c.warnings.length > 0);
}

const pageOf = (page: number | null | undefined) => (page ? ` on page ${page}` : "");

/** A `frameOverflow` in a line: what did not fit and what would fit it. */
function overflowText(w: ComposedFacts["warnings"][number]): string {
  const where = `frame "${w.frame}" of template "${w.template}"${pageOf(w.page)}`;
  const fixes = (w.proposals ?? []).map((p) => p.text ?? `${p.kind} ${p.path ?? ""} ${JSON.stringify(p.value)}`.replace(/\s+/g, " ").trim());
  const steps = w.steps?.length ? ` after ${w.steps.join(", ")}` : "";
  return `frameOverflow: ${where} is ${w.overflowMm ?? "?"} mm short of its content${steps}${fixes.length ? `; to fit: ${fixes.join("; or ")}` : "; no proposal"}`;
}

/** A proposal says what to change and to what (#858): a kind and a value. */
export function usefulProposal(p: ComposedProposalFact): boolean {
  if (!p || typeof p.kind !== "string" || !p.kind) return false;
  const v = p.value;
  if (v === undefined || v === null || v === "") return false;
  if (typeof v === "number") return Number.isFinite(v) && v > 0;
  return true;
}

/**
 * C37: the warnings no recipe with composed pages may raise, on every
 * edition: `frameOverflow` (content cut at a frame's foot), `tocGroupSplit`
 * (a contents block cut between columns), `contentInConfig` (the book's
 * text kept in a design), the composed pages' source warnings
 * (`templateUnknown`, `slotUnknown`, `slotEmpty`, `pageFenceLength`) and the
 * page templates' configuration warnings. Failures on a recipe that uses
 * composed pages, whatever `expect.warnings` says; on any other recipe a
 * `tocGroupSplit` is a warning (`contentInConfig` stays C31's).
 */
export function composedFindings(meta: Pick<RecipeMeta, "capture">, facts: ProbeFacts | null | undefined): Finding[] {
  const out: Finding[] = [];
  if (!facts) return out;
  const c = facts.composed;
  const uses = usesComposedPages(facts);
  const add = (severity: Severity, detail: string) => out.push({ check: "C37", severity, detail });
  const expected = new Set(meta.capture.expect?.warnings ?? []);
  for (const w of c?.warnings ?? []) {
    if (w.kind === "frameOverflow") add("fail", overflowText(w));
    else add("fail", w.text ? `${w.kind}${pageOf(w.page)}: ${w.text}` : `${w.kind}${pageOf(w.page)}${w.slot ? ` (slot "${w.slot}")` : ""}${w.frame ? ` (frame "${w.frame}")` : ""}`);
  }
  for (const t of c?.tocSplits ?? []) {
    if (!uses && expected.has("tocGroupSplit")) continue;
    add(uses ? "fail" : "warn", `tocGroupSplit: the contents block "${t.title}" is cut into ${t.columns} columns${pageOf(t.page)}`);
  }
  if (uses) {
    for (const w of facts.configWarnings ?? []) {
      if (C37_CONFIG_KINDS.has(w.kind)) add("fail", configWarningText(w));
    }
    const excused = [...expected].filter((kind) => kind === "frameOverflow" || kind === "tocGroupSplit" || C37_CONFIG_KINDS.has(kind));
    if (excused.length) add("fail", `expect.warnings lists ${excused.join(", ")}: a recipe with composed pages cannot accept ${excused.length === 1 ? "it" : "them"}`);
  }
  return out;
}

/**
 * C40: the source-map round trip (#857). Every element a composed page's
 * fence laid out is clicked inside, and `sourceAt` must give back the same
 * element, or one of its level whose Markdown range holds its text. Each
 * one not found fails (at most five are named). On an engine without the
 * source map, a note: the check runs once the pinned engine has it.
 */
export function roundTripFindings(facts: ProbeFacts | null | undefined): Finding[] {
  const out: Finding[] = [];
  if (!facts || !usesComposedPages(facts)) return out;
  const trip = facts.composed!.roundTrip;
  const add = (severity: Severity, detail: string) => out.push({ check: "C40", severity, detail });
  if (trip === null) {
    add("info", "the engine has no source map (sourceAt, #857): the round trip is skipped until the pinned engine has it");
    return out;
  }
  const levels = Object.entries(trip.levels).sort(([a], [b]) => a.localeCompare(b));
  for (const miss of trip.misses.slice(0, 5)) {
    add("fail", `p. ${miss.page}: a click inside ${miss.level} ${miss.id}${miss.text ? ` “${miss.text}”` : ""} does not come back to it through sourceAt`);
  }
  if (trip.misses.length > 5) add("fail", `and ${trip.misses.length - 5} more elements the source map does not find again`);
  if (!trip.misses.length && levels.length) {
    add("info", `every element came back to its source: ${levels.map(([level, s]) => `${s.checked} ${level}`).join(", ")}`);
  }
  return out;
}

/** C41: the configuration the engine received is under 1 MB of JSON. */
export function configSizeFindings(facts: ProbeFacts | null | undefined): Finding[] {
  if (!facts?.userConfig) return [];
  const bytes = Buffer.byteLength(JSON.stringify(facts.userConfig), "utf8");
  if (bytes <= CONFIG_LIMIT_BYTES) return [];
  return [{ check: "C41", severity: "fail", detail: `the configuration weighs ${(bytes / CONFIG_LIMIT_BYTES).toFixed(2)} MB of JSON (limit 1 MB): move pictures and text out of it` }];
}

type ComposedPageFact = ComposedFacts["pages"][number];

/** Smallest change of a frame's box against the text as written, in mm. */
const MOVE_MM = 0.5;
const mmText = (v: number) => String(Math.round(v * 10) / 10);

/**
 * What the frames of a stretched page did against the same page on the
 * text as written, for the changes its reflow log does not say (#925): a
 * frame whose height follows its content and has no `minHeight` declares
 * no height, so the log reads nothing when it grows, nor when the frames
 * anchored to it move. «entradilla 6.2 mm taller than as written»,
 * «col-1 moved down 6.2 mm from where it was as written».
 */
export function changesAgainstBase(page: ComposedPageFact, base: ComposedPageFact | undefined): string[] {
  if (!base) return [];
  const logged = new Set(page.events.filter((e) => e.kind === "grew" || e.kind === "moved" || e.kind === "resized").map((e) => `${e.frame} ${e.kind}`));
  const before = new Map(base.frames.map((f) => [f.name, f]));
  const out: string[] = [];
  for (const f of page.frames) {
    const b = before.get(f.name);
    if (!f.box || !b?.box) continue;
    const [x, y, w, h] = f.box;
    const [bx, by, bw, bh] = b.box;
    if (Math.abs(h - bh) >= MOVE_MM && !logged.has(`${f.name} grew`) && !logged.has(`${f.name} resized`)) {
      out.push(`${f.name} ${mmText(Math.abs(h - bh))} mm ${h > bh ? "taller" : "shorter"} than as written`);
    } else if (Math.abs(w - bw) >= MOVE_MM && !logged.has(`${f.name} grew`) && !logged.has(`${f.name} resized`)) {
      out.push(`${f.name} ${mmText(Math.abs(w - bw))} mm ${w > bw ? "wider" : "narrower"} than as written`);
    }
    if (logged.has(`${f.name} moved`)) continue;
    if (Math.abs(y - by) >= MOVE_MM) out.push(`${f.name} moved ${y > by ? "down" : "up"} ${mmText(Math.abs(y - by))} mm from where it was as written`);
    else if (Math.abs(x - bx) >= MOVE_MM) out.push(`${f.name} moved ${x > bx ? "right" : "left"} ${mmText(Math.abs(x - bx))} mm from where it was as written`);
  }
  return out;
}

/** The base run's page for each stretched page: the same page fence and
 *  template, the k-th of them (a fence's added pages share its index). */
function basePages(pages: readonly ComposedPageFact[], base: readonly ComposedPageFact[] | undefined): (ComposedPageFact | undefined)[] {
  const key = (p: ComposedPageFact) => `${p.doc ?? 0}\u0000${p.fenceIndex}\u0000${p.template}`;
  const pool = new Map<string, ComposedPageFact[]>();
  for (const p of base ?? []) (pool.get(key(p)) ?? pool.set(key(p), []).get(key(p))!).push(p);
  const seen = new Map<string, number>();
  return pages.map((p) => {
    const k = seen.get(key(p)) ?? 0;
    seen.set(key(p), k + 1);
    return pool.get(key(p))?.[k];
  });
}

/** A continuation's receiving frame by its name, template and page (#925):
 *  «col-1 of seguido-par on p. 48», the id kept after it. */
function receiver(id: string, pages: readonly ComposedPageFact[]): string {
  for (const p of pages) {
    const f = p.frames.find((fr) => fr.id === id);
    if (f) return `${f.name} of ${p.template} on p. ${p.n} (${id})`;
  }
  return id;
}

/** A composed page of the stretched run in a line: what its frames did,
 *  from its reflow log and, where the log is silent, against `base` (the
 *  same page on the text as written). */
function pageStory(page: ComposedPageFact, base?: ComposedPageFact, pages: readonly ComposedPageFact[] = []): string {
  const events = page.events.filter((e) => e.kind !== "overflow");
  const continued = page.frames.filter((f) => f.continuesTo).map((f) => `${f.name} → ${receiver(f.continuesTo!, pages)}`);
  const said = events.map((e) => e.text ?? `${e.frame} ${e.kind}${e.fromMm !== undefined && e.toMm !== undefined ? ` ${e.fromMm}→${e.toMm} mm` : ""}${e.scale !== undefined ? ` ${Math.round(e.scale * 1000) / 10} %` : ""}`);
  const against = changesAgainstBase(page, base);
  const short = page.frames.filter((f) => (f.overflowMm ?? 0) > 0).map((f) => `${f.name} ${f.overflowMm} mm short`);
  const how = short.length ? "does not fit" : continued.length ? "goes on" : events.length || against.length ? "rearranged" : "fits as it was";
  const parts = [...said, ...against, ...continued.map((c) => `continues ${c}`), ...short];
  return `p. ${page.n} (${page.template}) ${how}${parts.length ? `: ${parts.slice(0, 6).join("; ")}${parts.length > 6 ? `; and ${parts.length - 6} more` : ""}` : ""}`;
}

export interface StressInput {
  meta: Pick<RecipeMeta, "capture">;
  factor: number;
  /** Characters of the edition's text before and after the stretch. */
  stretch: { before: number; after: number; unchanged: number };
  /** The stretched run: how it ended and what it found. */
  done: "ok" | "error" | "timeout";
  err?: string | null;
  pageErrors?: string[];
  facts: ProbeFacts | null;
  /** The run on the text as written: the page count, and each composed
   *  page's frames to compare with (#925). */
  base: ProbeFacts | null;
}

/** Where a frame was pushed to: "the foot of the type area", "the right
 *  edge of the bleed"… */
function pushedEdgeText(f: ComposedFrameFact): string {
  const edge = f.pushedOutEdge ?? "foot";
  const edgeName = edge === "head" ? "the head" : edge === "foot" ? "the foot" : `the ${edge} edge`;
  return `${edgeName} of the ${f.pushedOutOf === "bleed" ? "bleed" : "type area"}`;
}

/**
 * C38: the stress test (`--stress 1.3`). The edition laid out again with
 * every text `factor` times as long (lib/cookbook/bench.ts
 * `stretchMarkdown`). Each composed page must rearrange (frames grow,
 * move, scale their text) or go on elsewhere: a note per page says which.
 * A warning the text as written does not raise fails, except a
 * `frameOverflow` that carries proposals with values, which is a warning
 * naming them (the copy-fitter's next move); one without a useful proposal
 * fails. So does a stretched run that throws, does not converge or builds
 * nothing.
 */
export function stressFindings(input: StressInput): Finding[] {
  const out: Finding[] = [];
  const add = (severity: Severity, detail: string) => out.push({ check: "C38", severity, detail });
  const pctOf = (n: number) => `${(n * 100).toFixed(1)} %`;
  const { stretch, facts } = input;
  const grown = stretch.before ? stretch.after / stretch.before - 1 : 0;
  add("info", `the text made ${pctOf(grown)} longer (${stretch.before} → ${stretch.after} characters, asked ${pctOf(input.factor - 1)})${stretch.unchanged ? `; ${stretch.unchanged} paragraph${stretch.unchanged === 1 ? "" : "s"} with no plain word kept as written` : ""}`);
  if (input.done !== "ok") {
    add("fail", input.done === "timeout" ? "the stretched edition did not finish" : `the stretched edition threw: ${firstLines(input.err ?? "unknown error")}`);
    return out;
  }
  for (const e of [...new Set(input.pageErrors ?? [])].slice(0, 3)) add("fail", `the stretched edition: uncaught ${firstLines(e, 2)}`);
  if (!facts || facts.selected < 0 || !(facts.pages ?? []).length) {
    add("fail", "the stretched edition built nothing");
    return out;
  }
  if (facts.converged === false) add("fail", `the stretched edition did not converge (${facts.iterationCount} iterations)`);
  const expected = new Set(input.meta.capture.expect?.warnings ?? []);
  const c = facts.composed;
  const stretchedPages = c?.pages ?? [];
  const bases = basePages(stretchedPages, input.base?.composed?.pages);
  stretchedPages.forEach((page, i) => {
    add("info", pageStory(page, bases[i], stretchedPages));
    // A frame pushed past an edge of the type area (#911) or, on a spread,
    // of the sheet (#948): what it stands for (an answer space, a picture
    // slot) is off the page.
    for (const f of page.frames) {
      if ((f.pushedOutMm ?? 0) > 0) add("fail", `p. ${page.n} (${page.template}): frame "${f.name}" was pushed ${f.pushedOutMm} mm past ${pushedEdgeText(f)}`);
    }
  });
  for (const w of c?.warnings ?? []) {
    if (w.kind !== "frameOverflow") {
      add("fail", `${w.kind}${pageOf(w.page)}${w.text ? `: ${w.text}` : ""}`);
      continue;
    }
    const useful = (w.proposals ?? []).filter(usefulProposal);
    add(useful.length ? "warn" : "fail", useful.length ? overflowText({ ...w, proposals: useful }) : `${overflowText(w)}: a warning under stress must carry a proposal with a value`);
  }
  for (const t of c?.tocSplits ?? []) add("fail", `tocGroupSplit: the contents block "${t.title}" is cut into ${t.columns} columns${pageOf(t.page)}`);
  for (const w of facts.warnings ?? []) {
    if (!expected.has(w.kind)) add("fail", `${w.kind} on page ${w.page} (${w.overflowPx} px over)`);
  }
  for (const w of facts.textWarnings ?? []) {
    if (!expected.has(w.kind)) add("fail", `${w.kind}${w.detail ? ` "${w.detail}"` : ""}${pageOf(w.page)}`);
  }
  const before = input.base?.pages?.length;
  const after = facts.pages?.length ?? 0;
  if (before !== undefined && before !== after) add("info", `${after} pages, ${before} as written`);
  return out;
}
