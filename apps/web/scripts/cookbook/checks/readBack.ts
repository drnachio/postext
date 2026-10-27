// C33, a bundle read back against the pen's documents, and C39, the pages
// against the approved capture (#1276: split out of checks.ts).
import { type Finding, type Severity, firstLines, dedupe } from './facts.ts';

// ─── The checks ─────────────────────────────────────────────────────────────

/** An EPUB the pen wrote, as the postext-epub shim recorded it and read it
 *  back with readEpub (check C30). */
export interface EpubRecord {
  layout: string | null;
  bytes: number;
  ms: number;
  /** Spine items, page-list entries and top-level contents entries readEpub found. */
  documents: number;
  pages: number;
  toc: number;
  /** The layout readEpub read from the package document. */
  readLayout: string | null;
  /** onWarning reports: `missingFont: Literata`, `missingImage: map.svg`. */
  warnings: string[];
  error: string | null;
}

/** A Sandbox bundle opened again by the pen's engine and laid out as the
 *  Sandbox lays a book out, beside the documents the pen built from the
 *  same source (lib/probe.js `readBundleBack`, check C33). */
export interface BundleReadBack {
  /** Why the engine could not read the bundle back (no `openBundle`). */
  skipped?: string;
  /** The bundle did not open, or its layout threw. */
  error?: string;
  /** One entry per chapter of the bundle or document of the pen: pages,
   *  layout hash and lines hash on each side (null where a side has none),
   *  and where the two layouts part. */
  chapters: {
    chapter: number;
    pen: { pages: number; hash: string; lines?: string } | null;
    bundle: { pages: number; hash: string; lines?: string } | null;
    difference: string | null;
    /** What gives the pen's pages back when the chapter is laid out again
     *  with it: the build's own `continuation` (its keys), which a bundle
     *  does not carry, or the configuration as the pen wrote it (the
     *  top-level keys that each do so alone, or only `together`). */
    cause?: { continuation?: string[]; configuration?: string[]; together?: boolean } | null;
  }[];
  /** Warnings the bundle's layout raises beyond the pen's (kind and what
   *  it names, positions aside). */
  extraWarnings: string[];
  /** How each side divides its words (the patterns of its resolved
   *  configuration and whether they run) and the language the bundle's
   *  configuration names, null when it names none (#660). Null or missing
   *  when a side has no resolved configuration to read. */
  language?: {
    pen: { locale: string; enabled: boolean };
    bundle: { locale: string; enabled: boolean };
    named: string | null;
  } | null;
}

/**
 * C33: the bundle against the pen (#690, check 1 of #660). The Sandbox
 * opens `<slug>.postext` and lays it out with the one configuration it
 * carries; the capture does the same with the pen's engine and fails when
 * a chapter comes out with another page count or another layout than the
 * pen's document, or raises a warning the pen's builds did not. It fails
 * as well when the bundle divides its words in another language than the
 * pen, or names no language at all (#660): the pen's engine sets such a
 * document in English, so its layout compares equal, while the Sandbox
 * reads it in the interface language and breaks its lines otherwise.
 */
export function readBackFindings(readBack: BundleReadBack | null | undefined): Finding[] {
  if (!readBack) return [];
  const out: Finding[] = [];
  const add = (severity: Severity, detail: string) => out.push({ check: "C33", severity, detail });
  if (readBack.skipped) {
    add("info", `the bundle was not read back: ${readBack.skipped}`);
    return out;
  }
  if (readBack.error) {
    add("fail", `the bundle does not open and lay out again: ${firstLines(readBack.error, 1)}`);
    return out;
  }
  const one = readBack.chapters.length === 1;
  const s = (n: number) => `${n} page${n === 1 ? "" : "s"}`;
  const keys = (list: string[], prefix = "") => list.map((key) => `${prefix}${key}`).join(", ");
  for (const c of readBack.chapters) {
    const chapter = one ? "the bundle" : `chapter ${c.chapter} of the bundle`;
    const built = one ? "the pen's document" : `the pen's document ${c.chapter}`;
    // Why, when laying the chapter out again found it.
    const why: string[] = [];
    if (c.cause?.configuration) {
      const named = c.cause.configuration.length ? ` in ${keys(c.cause.configuration)}${c.cause.together ? " (together)" : ""}` : "";
      why.push(`the configuration the bundle stores is not the pen's${named}`);
    }
    if (c.cause?.continuation?.length) why.push(`a bundle does not carry ${keys(c.cause.continuation, "continuation.")}`);
    const cause = why.length ? `. Cause: ${why.join(", and ")}` : "";
    if (!c.pen && c.bundle) add("fail", `${chapter} (${s(c.bundle.pages)}) has no document of the pen to compare with`);
    else if (c.pen && !c.bundle) add("fail", `${built} (${s(c.pen.pages)}) is no chapter of the bundle`);
    else if (c.pen && c.bundle && c.pen.pages !== c.bundle.pages) {
      add("fail", `${chapter} lays out to ${s(c.bundle.pages)}, ${built} to ${s(c.pen.pages)}${c.difference ? ` (${c.difference})` : ""}${cause}`);
    } else if (c.pen && c.bundle && c.pen.hash !== c.bundle.hash) {
      add("fail", `${chapter} is not laid out as ${built} (layout ${c.bundle.hash}, the pen's ${c.pen.hash})${c.difference ? `: ${c.difference}` : ""}${cause}`);
    }
  }
  for (const warning of readBack.extraWarnings) add("fail", `the bundle raises ${warning}, which the pen's builds do not`);
  const language = readBack.language;
  if (language) {
    const sets = (h: { locale: string; enabled: boolean }) => (h.enabled ? `hyphenates in ${h.locale}` : `sets its text without hyphenation (${h.locale})`);
    if (language.pen.locale !== language.bundle.locale || language.pen.enabled !== language.bundle.enabled) {
      add("fail", `the bundle ${sets(language.bundle)}, the pen ${sets(language.pen)}`);
    } else if (!language.named) {
      add("fail", `the bundle's configuration names no language, and the pen ${sets(language.pen)}: `
        + "the Sandbox reads such a document in the interface language and breaks its lines otherwise");
    }
  }
  return dedupe(out);
}

/**
 * C39: the pages against the approved capture (`--compare`): the committed
 * capture of the same sources. Its layout hash against the run's (every
 * block, line and running head with its place), and, unless `--no-pixels`,
 * each published page decoded beside its committed image and compared in
 * cells of 8 × 8 px (lib/probe.js `pageDifference`): a page with a cell
 * whose mean difference in a channel is over the threshold (`--max-diff`,
 * 12 of 255 by default: another Chrome's glyph edges stay under it, a
 * word moved by a pixel does not) differs. A difference fails on the
 * engine the capture records, or with `--strict`; on another engine (the
 * working tree, a newer release) it warns, since a change of layout on
 * purpose is captured again after its release (`capture --verify` lists
 * it). With no capture of these sources, a note.
 */
export function compareFindings(input: {
  approved: { vdtHash?: string; engine?: string } | null;
  run: { vdtHash: string; engine: string };
  changes: { n: number; detail: string }[] | null | undefined;
  pages: number;
  maxDiff: number;
  pixels: boolean;
  strict?: boolean;
  /** A layout hash that differs is a warning, not a failure: the run
   *  measures text on another system than the approved capture (CI's
   *  Linux Chrome against the capture machine), where widths differ by
   *  fractions of a pixel. */
  hashWarn?: boolean;
}): Finding[] {
  const add = (severity: Severity, detail: string): Finding => ({ check: "C39", severity, detail });
  const approved = input.approved;
  if (!approved) return [add("info", "no approved capture of these sources to compare with: capture the recipe, then compare")];
  const same = approved.engine === input.run.engine;
  const severity: Severity = same || input.strict ? "fail" : "warn";
  const on = same ? `on postext ${input.run.engine}, the engine it was approved on` : `on postext ${input.run.engine}; approved on ${approved.engine ?? "?"}`;
  const out: Finding[] = [];
  if (approved.vdtHash && input.run.vdtHash && approved.vdtHash !== input.run.vdtHash) {
    const hashSeverity: Severity = input.hashWarn && !input.strict ? "warn" : severity;
    out.push(add(hashSeverity, `the layout is not the approved one (layout hash ${input.run.vdtHash.slice(0, 8)}, approved ${approved.vdtHash.slice(0, 8)}) ${on}${input.hashWarn ? " (measured on another system: check the pages there)" : ""}`));
  }
  if (input.pixels) {
    if (!input.changes) out.push(add("info", "the pages were not compared with their images"));
    else for (const ch of input.changes) out.push(add(severity, `p. ${ch.n} is not the approved page: ${ch.detail} (threshold ${input.maxDiff}) ${on}`));
  }
  if (!out.length) {
    out.push(add("info", input.pixels
      ? `the layout and ${input.pages} page${input.pages === 1 ? "" : "s"} within ${input.maxDiff} of 255 of the approved capture`
      : "the layout is the approved one (pixels not compared)"));
  }
  return out;
}
