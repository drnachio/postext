/**
 * The capture's checks (spec §8.5) and the detected facts of capture.json.
 * lib/probe.js gathers the facts in the page, with the pinned engine; this
 * module judges them. A FAIL blocks the write; WARN and INFO findings go to
 * `diagnostics.findings`.
 *
 * Run by Node's type stripping: erasable TypeScript, relative `.ts` imports.
 */
import { type RecipeMeta, type Registry, IMAGE_BUDGET, CARD_AIM_KB } from '../../src/lib/cookbook/types.ts';
import { usesComposedPages, C37_CONFIG_KINDS, composedFindings, roundTripFindings, configSizeFindings } from './checks/composed.ts';
import type { Detected } from './checks/detect.ts';
import { type ProbeFacts, type Finding, dedupe, type Severity, firstLines, CONFIG_WARNING_SEVERITY, configWarningText, type ProbeFace } from './checks/facts.ts';
import type { EpubRecord } from './checks/readBack.ts';

export { configWarningText } from './checks/facts.ts';
export type { Severity, Finding, ProbeFace, ProbeConfigWarning, ProbePage, ProbeFacts, ComposedFrameFact, ComposedEventFact, ComposedProposalFact, ComposedFacts } from './checks/facts.ts';
export { configStats, detectFeatures, suggestLevel, detect, pdfPageCount } from './checks/detect.ts';
export { readBackFindings, compareFindings } from './checks/readBack.ts';
export type { EpubRecord, BundleReadBack } from './checks/readBack.ts';
export { PAGE_TEMPLATE_WARNING_KINDS, CONFIG_LIMIT_BYTES, usesComposedPages, usefulProposal, composedFindings, roundTripFindings, configSizeFindings, changesAgainstBase, stressFindings } from './checks/composed.ts';
export type { StressInput } from './checks/composed.ts';

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
  /** The EPUBs the pen wrote with postext-epub (C30). */
  epubs?: EpubRecord[];
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
const ATTRIBUTION = new Set(["CC-BY", "CC-BY-3.0", "CC-BY-4.0", "CC-BY-SA-4.0"]);
const IMAGE_ASSET = /\.(svg|png|jpe?g|webp|gif|avif|pdf)$/i;
const pct = (share: number) => `${(share * 100).toFixed(1)} %`;
const stem = (file: string) => file.replace(/^.*\//, "").replace(/\.[^.]+$/, "").toLowerCase();

/** Whether a code point is in Fontsource's latin-ext file and not in its
 *  latin file (the cjk kit block's cjkLatinExtOnly). */
function latinExtOnly(cp: number): boolean {
  if (!((cp >= 0x100 && cp <= 0x2ff) || (cp >= 0x1e00 && cp <= 0x1eff))) return false;
  return ![0x131, 0x152, 0x153, 0x2bb, 0x2bc, 0x2c6, 0x2da, 0x2dc].includes(cp);
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

  // C13 (the kit had to load faces FONTS does not list) went with kit fonts
  // v2: since postext 1.25 the engine loads the faces a config names, and
  // reports one it could not load as a `fontFallback` warning (C5, C12).

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
    const seen = [...(facts.warnings ?? []), ...(facts.indexWarnings ?? []), ...(facts.textWarnings ?? []), ...(facts.configWarnings ?? [])];
    if (!seen.some((w) => w.kind === kind)) add("C5", "info", `expect.warnings lists ${kind}, which did not occur`);
  }

  // C31: config values the engine replaced. A clamped grid or side column,
  // a numbering format or digit system it does not know, a value outside a
  // setting's choices and a key no setting has all give a page other than
  // the one the recipe's config claims, and a reader copies that config: they
  // fail; so do line numbers asked of a vertical document, which prints none.
  // A font stack is set in its first family, the face the recipe loads, so
  // the page is the one shown: a warning. A kind this list does not know
  // yet (a newer engine) warns until it is judged here.
  const composed = usesComposedPages(facts);
  for (const w of facts.configWarnings ?? []) {
    if (expected.has(w.kind)) continue;
    // On a recipe with composed pages these are C37's, and fail.
    if (composed && C37_CONFIG_KINDS.has(w.kind)) continue;
    add("C31", CONFIG_WARNING_SEVERITY[w.kind] ?? "warn", configWarningText(w));
  }

  // C37, C40, C41: composed pages, the source map, the configuration's size.
  out.push(...composedFindings(meta, facts), ...roundTripFindings(facts), ...configSizeFindings(facts));

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

  // C32: formulas the maths engine could not set (#683). Each prints as a
  // small red box and takes the room of one, so the pages after it are not
  // the recipe's. One line per message: when the engine's MathJax is broken
  // (not a formula's TeX), every formula of the document fails alike.
  const mathErrors = new Map<string, { page: number; tex: string }[]>();
  for (const m of facts.mathErrors ?? []) mathErrors.set(m.error, [...(mathErrors.get(m.error) ?? []), m]);
  for (const [error, list] of mathErrors) {
    const first = list[0];
    const source = first.tex.replace(/\s+/g, " ").trim();
    const tex = source.length > 60 ? `${source.slice(0, 59)}…` : source;
    const more = list.length > 1 ? ` (and ${list.length - 1} more with the same message)` : "";
    add("C32", "fail", `the formula $${tex}$ on page ${first.page} is set as a red box: ${firstLines(error, 1)}${more}`);
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

  // C36: characters set in a font of the system (#746). No loaded file of
  // the family holds them, so the browser takes another font for each: one
  // of the reader's machine, with other widths on every system, and the
  // lines a reader gets are then not the published ones. A recipe gives
  // such a character a face or writes another; the one it may accept
  // (`capture.expect.systemFont`) is a mark the engine sets by itself and
  // no text face holds, the task box ☐, which its write-up then names.
  const acceptedMarks = new Set(expect.systemFont ?? "");
  const systemMarks = new Set<string>();
  for (const face of facts.systemFont ?? []) {
    for (const c of face.chars) systemMarks.add(c.ch);
    const chars = face.chars.filter((c) => !acceptedMarks.has(c.ch));
    if (!chars.length) continue;
    const shown = chars.slice(0, 12).map((c) => `${c.ch} ${c.code}`).join(", ");
    const more = chars.length > 12 ? ` and ${chars.length - 12} more` : "";
    add("C36", "fail", `${faceName(face)} sets ${shown}${more} (${chars[0]!.where}) in no file the page loaded: ` +
      "the browser takes a font of the system for them, another on every machine. Load the file of the family that holds them, " +
      "set them in a family that does, or write another character");
  }
  const taken = [...acceptedMarks].filter((ch) => systemMarks.has(ch));
  if (taken.length) add("C36", "info", `${taken.join(" ")} set in a font of the system, as capture.expect.systemFont accepts: the shape is the reader's machine's`);
  for (const ch of acceptedMarks) {
    if (facts.systemFont && !systemMarks.has(ch)) add("C36", "info", `capture.expect.systemFont lists ${ch}, which a face of the pages holds now`);
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
          // Of a capture of several builds, the PDF is one of them, or all
          // of them chained into one publication (#540): their pages summed.
          const counts = (facts.selectedBuilds ?? []).map((i) => facts.builds[i]?.pages ?? 0);
          if (counts.length > 1) {
            const sum = counts.reduce((a, b) => a + b, 0);
            if (!counts.includes(pdf.pages) && pdf.pages !== sum) {
              add("C14", "fail", `the PDF has ${pdf.pages} pages, the documents ${counts.join(" and ")} (${sum} together)`);
            }
          } else if (pdf.pages !== pages.length) add("C14", "fail", `the PDF has ${pdf.pages} pages, the document ${pages.length}`);
        }
      }
      if (pdf.bytes > 2 * MB) add("C20", "fail", `the PDF weighs ${(pdf.bytes / MB).toFixed(2)} MB (limit 2 MB)`);
    }
  }

  // C30: the EPUBs. A recipe with an "epub" output writes at least one
  // while its module runs, and every file reads back in its own layout.
  const epubs = input.epubs ?? [];
  if (meta.outputs.includes("epub") && !epubs.length) {
    add("C30", "fail", "outputs include \"epub\" but the pen wrote no EPUB before it settled (call renderToEpub at top level)");
  }
  for (const epub of epubs) {
    const name = `the ${epub.layout ?? "?"} EPUB`;
    if (epub.error) add("C30", "fail", `${name}: ${firstLines(epub.error, 1)}`);
    else if (!epub.bytes || !epub.documents) add("C30", "fail", `${name} has no content documents`);
    else if (epub.readLayout !== epub.layout) add("C30", "fail", `${name} reads back as ${epub.readLayout ?? "no layout"}`);
    for (const warning of epub.warnings) add("C30", "warn", `${name}: ${warning}`);
    if (epub.bytes > 2 * MB) add("C20", "warn", `${name} weighs ${(epub.bytes / MB).toFixed(2)} MB`);
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

  // C20: budget. The warning grows with the pages published (0.1 MB each
  // past nine, 0.9 MB at least): a dense text page weighs about 100 KB
  // whatever it shows. Pages that are paintings weigh more however the
  // assets are cut (the pages are the rendered webp), so a recipe states the
  // figure it means to publish (`capture.expect.imageMb`): no warning up to
  // it, a failure past it. The card files work the same way (`cardKb`).
  const warnMb = Math.max(IMAGE_BUDGET.warnMb, IMAGE_BUDGET.perPageMb * input.published.length);
  const stated = meta.capture.expect?.imageMb;
  const weight = `${(input.bytes / MB).toFixed(2)} MB`;
  if (stated !== undefined) {
    if (input.bytes > stated * MB) {
      add("C20", "fail", `the edition's images weigh ${weight}, past the ${stated} MB that capture.expect.imageMb states: lighten the pages or state the figure the recipe means to publish`);
    } else if (input.bytes <= warnMb * MB) {
      add("C20", "info", `capture.expect.imageMb states ${stated} MB, and the edition weighs ${weight}, inside the default budget of ${warnMb.toFixed(1)} MB: leave it out`);
    } else if (stated * MB > input.bytes * 1.15) {
      add("C20", "info", `capture.expect.imageMb states ${stated} MB, and the edition weighs ${weight}: state ${(Math.ceil(input.bytes / MB * 20) / 20).toFixed(2).replace(/0$/, "")} MB`);
    }
  } else if (input.bytes > IMAGE_BUDGET.failMb * MB) {
    add("C20", "fail", `the edition's images weigh ${weight} (limit ${IMAGE_BUDGET.failMb} MB; capture.expect.imageMb states the figure of a book of paintings)`);
  } else if (input.bytes > warnMb * MB) {
    add("C20", "warn", `the edition's images weigh ${weight} (warning at ${warnMb.toFixed(1)} MB for ${input.published.length} pages; capture.expect.imageMb states the figure of a book of paintings)`);
  }

  const cardNames = { card: "card.webp", card480: "card.480.webp", og: "og.jpg" } as const;
  for (const key of ["card", "card480", "og"] as const) {
    const size = input.cardBytes?.[key] ?? 0;
    const aim = CARD_AIM_KB[key];
    const figure = meta.capture.expect?.cardKb?.[key];
    if (figure === undefined) {
      if (size > aim * 1024) add("C20", "warn", `${cardNames[key]} weighs ${Math.round(size / 1024)} KB (aim for ≤ ${aim} KB; capture.expect.cardKb states the figure of a painted card)`);
    } else if (size > figure * 1024) {
      add("C20", "fail", `${cardNames[key]} weighs ${Math.round(size / 1024)} KB, past the ${figure} KB that capture.expect.cardKb states`);
    } else if (input.cardBytes && size <= aim * 1024) {
      add("C20", "info", `capture.expect.cardKb states ${figure} KB for ${cardNames[key]}, which weighs ${Math.round(size / 1024)} KB, inside its aim of ${aim} KB: leave it out`);
    }
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
  // A ratio to two decimals, whatever the probe recorded (#924: an older
  // probe left 2.8000000000000003).
  const times = (v: number) => `${Math.round(v * 100) / 100}×`;
  const loose = facts.loose;
  if (loose && loose.total && loose.share > 0.02) {
    const where = (loose.lines ?? []).slice(0, 3).map((l) => `p. ${l.page} ${times(l.ratio)} “${clipText(l.text)}”`);
    add("C24", "warn", `${loose.count} of ${loose.total} justified lines (${pct(loose.share)}) stretch past ${times(loose.threshold)} (worst ${times(loose.worst)})${where.length ? `; loosest: ${where.join(", ")}` : ""}`);
  }
  // C34: a justified line set ragged (its word spaces would have stretched
  // past 3×) is a line left short in the middle of a paragraph. A recipe
  // fits its copy, or accepts a count (`capture.expect.raggedLines`).
  const raggedLines = facts.raggedLines;
  if (raggedLines) {
    const accepted = meta.capture.expect?.raggedLines ?? 0;
    const s = (n: number) => `${n} justified line${n === 1 ? "" : "s"}`;
    if (raggedLines.count > accepted) {
      const where = raggedLines.lines.slice(0, 5).map((l) => `${l.page === null ? "" : `p. ${l.page} `}${times(l.ratio)} “${clipText(l.text)}”`);
      add("C34", "fail", `${s(raggedLines.count)} set ragged (word spaces past 3×)${accepted ? `, and the recipe accepts ${accepted}` : ""}: ${where.join(", ")}. Reword the copy, give the line a break it can take, or accept the count with capture.expect.raggedLines`);
    } else if (accepted > raggedLines.count) {
      add("C34", "info", `capture.expect.raggedLines accepts ${accepted}, and the edition has ${raggedLines.count}`);
    }
  }
  // C35: paragraphs set a line short to take up a runt, the ones that
  // needed tracking: a paragraph at the cap reads tight beside its
  // neighbours, and a few words less would have set it without.
  const runtFixes = facts.runtFixes;
  if (runtFixes && runtFixes.tracked > 0) {
    const where = runtFixes.blocks.map((b) => `p. ${b.page} −${b.tracking}‰ “${b.text}${b.text.length >= 48 ? "…" : ""}”`);
    add("C35", "info", `${runtFixes.tracked} paragraph${runtFixes.tracked === 1 ? "" : "s"} set a line short with tracking (worst −${runtFixes.worst}‰${runtFixes.atCap ? ", the cap" : ""}): ${where.join(", ")}`);
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
  // with no glyph (its missingGlyph warning, printed to the console). The
  // kit's providers also embed a face's latin-ext file (#466) and, in the
  // pdf block, its greek file (#541), so a letter of those files that the
  // face holds on screen is in the PDF.
  const pdfRecipe = meta.outputs.includes("pdf") || !!meta.downloads?.pdf;
  const embedded = (cp: number) => latinExtOnly(cp) || (!meta.kit.includes("cjk") && cp >= 0x370 && cp <= 0x3ff);
  const outside = (facts.nonLatin ?? []).filter((c) => !(c.ownFile && embedded(c.ch.codePointAt(0) ?? 0)));
  if (pdfRecipe && outside.length) {
    add("C25", "warn", `outside the latin subset: ${outside.map((c) => `${c.ch} ${c.code}`).join(", ")}`);
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
