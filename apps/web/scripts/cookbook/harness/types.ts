// What a capture run takes and returns: rendered pages, cards, the bundle.
import type { SampleLocale, RecipeMeta } from "../../../src/lib/cookbook/types.ts";
import type { ProbeFacts, EpubRecord, BundleReadBack } from "../checks.ts";
import type { NetIssue } from "../net.ts";
import type { PenServer } from "../serve.ts";
import type { HarnessBrowser } from "./browser.ts";

// ─── One edition ────────────────────────────────────────────────────────────

export interface RenderedPage {
  n: number;
  w: number;
  h: number;
  full: Buffer;
  strip: Buffer;
  png: Buffer | null;
}

export interface CardImages {
  card: Buffer;
  card480: Buffer;
  og: Buffer;
  png: Buffer | null;
  ogPng: Buffer | null;
  magnification: number | null;
}

export interface VariantRun {
  slug: string;
  variant: SampleLocale;
  engine: PenServer["engine"];
  pen: ReturnType<PenServer["current"]>["pen"];
  done: "ok" | "error" | "timeout";
  err: string | null;
  loaderErrors: string[];
  console: { type: string; text: string }[];
  pageErrors: string[];
  net: NetIssue[];
  failedRequests: string[];
  settle: { waitedMs: number; timedOut?: boolean } | null;
  /** Waits that ended on their timer instead of their event (#743): the
   *  fonts that never settled, the animation frame that never came. */
  fallbacks: string[];
  /** `data-postext` and the status line once the pen settled, before the PDF. */
  kit: { state: string | null; status: string | null } | null;
  facts: ProbeFacts | null;
  /** Pages whose painting taints the canvas (C15). */
  tainted: number[];
  pdf: { wanted: boolean; button: boolean; timedOut: boolean; error: string | null; fontFailures: string[]; ms: number; bytes: Buffer | null } | null;
  /** The EPUBs the pen wrote while it ran (C30). */
  epubs: EpubRecord[];
  published: number[];
  publishError: string | null;
  cardErrors: string[];
  pages: RenderedPage[];
  /** The published pages that differ from the committed images; null when
   *  there was no committed folder to compare with. */
  pageChanges: PageChange[] | null;
  card: CardImages | null;
  renderError: { message: string; taint: boolean } | null;
  timings: { totalMs: number; runMs: number };
  netStats: { cached: number; fetched: number };
  /** Captured without request interception (a worker recipe). */
  passive: boolean;
  /** postext versions a worker imported (workers ignore the import map). */
  workerEngines: string[];
  /** The selected document as a `.postext` file for the Sandbox. */
  sandbox: SandboxBundle | null;
}

export interface SandboxBundle {
  bytes: Buffer | null;
  error: string | null;
  /** createBundle's warnings (a family left out, a skipped face). */
  warnings: string[];
  /** What the bundle cannot carry (a continuation's page sides, counters). */
  notes: string[];
  /** Builds left out because their configuration is another and the recipe
   *  did not say which to keep (`capture.sandbox`). */
  warns: string[];
  /** The warnings of the pen's builds the bundle holds (kind and what it
   *  names, positions aside): `sandbox.warnings` in capture.json (#736). */
  penWarnings: string[];
  /** The pages of the builds the bundle holds, and of every build the
   *  capture publishes. */
  pages: number;
  allPages: number;
  /** The bundle opened and laid out again against the pen's documents (C33). */
  readBack: BundleReadBack | null;
  /** The committed bundle, when its bytes are not the run's, read back the
   *  same way by the run's engine (#734); null when the bytes are equal or
   *  no committed bundle was given. */
  committedReadBack: BundleReadBack | null;
}

/** A published page whose image is not the committed one beyond rendering
 *  noise (#734, lib/probe.js `PAGE_DIFFERENCE`). */
export interface PageChange {
  n: number;
  /** The worst cell's mean difference (of 255), when both images decoded. */
  worst?: number;
  /** "worst cell 36.2 of 255, 14 cells over 12", "no committed image". */
  detail: string;
}

/** What the bundle is called: `recipe-<slug>`, the write-up's title. */
export interface SandboxMeta {
  id: string;
  name: string;
  description?: string;
  /** The card (480 px WebP), used as the bundle's thumbnail. */
  thumbnail?: Buffer | null;
  /** recipe.json `folio` as `config.folio`, over the pen's own. */
  folio?: Record<string, unknown>;
}

export interface RunOptions {
  hb: HarnessBrowser;
  slug: string;
  variant: SampleLocale;
  meta: RecipeMeta;
  engine?: string;
  refreshNet?: boolean;
  /** Also encode PNG copies (for --previewDir). */
  png?: boolean;
  /** Write the Sandbox bundle (the card becomes its thumbnail). */
  sandbox?: SandboxMeta;
  /** Only the facts and the Sandbox bundle: no PDF, pages or card. */
  sandboxOnly?: boolean;
  /** The edition's committed folder, when its sources are the capture's:
   *  the new pages are compared with its images and its bundle is read
   *  back by the run's engine, so files that say nothing new stay (#734). */
  committedDir?: string;
  /** The largest mean difference of a cell (of 255) a page may show
   *  against its committed image (`--max-diff`, C39); lib/probe.js
   *  `PAGE_DIFFERENCE.max` by default. */
  maxDiff?: number;
  /** Each content file of the edition as the pen inlines it: the stress
   *  test's longer text (#869). */
  transformContent?: (text: string, key: string) => string;
  /** Only the facts: no PDF, pages, card or bundle (the stretched run of
   *  the stress test). */
  factsOnly?: boolean;
  /** The facts and every page as a PNG, no PDF, card or bundle: the
   *  stretched run of the stress test with `--stress-out` (#915). */
  pagesOnly?: boolean;
}
