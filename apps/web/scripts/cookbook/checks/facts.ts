// What the checks judge: findings and their severity, the facts
// lib/probe.js returns from the page, composed pages included, and how a
// finding words a config warning (#1276: split out of checks.ts).


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

/** A `ConfigWarning` of the engine (`kind`, where it sits in the config,
 *  the value as written and the one used instead). */
export interface ProbeConfigWarning {
  kind: string;
  path: string;
  value: string;
  used: string;
  suggestion?: string;
  /** `contentInConfig` (#849): the design texts at fault and their letters. */
  count?: number;
  chars?: number;
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
  /** A page added by a composed page's continuation (#915): `heading` is
   *  the continued page fence's. */
  continued?: boolean;
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
  /** The characters of the pages that no loaded file of their own family
   *  holds, by face (lib/probe.js `systemFontChars`): the browser sets
   *  them in a font of the system (C36). */
  systemFont?: (ProbeFace & { chars: { ch: string; code: string; where: string }[] })[];
  /** Characters outside Fontsource's latin subset. `ownFile`: a loaded
   *  file of the face that sets it holds it (latin-ext, from loadFonts). */
  nonLatin?: { ch: string; code: string; where: string; ownFile?: boolean }[];
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
   *  words they name, `lineNumberOverlap` (a line number in the side
   *  column on a side box or float), with the number,
   *  `tabInVerticalText` (a `:tab` set as a word space in vertical text),
   *  `dropCap` (a paragraph whose drop cap could not be set as
   *  configured), with its reason and first line, `codeOverflow` (a
   *  code listing with lines wider than its box), with what was done, and
   *  `floatShrunk` when a picture runs past the text block even at its
   *  smallest scale, with the resource, the scale and the overrun, and
   *  `textWrap` (a picture or a box that did not wrap the text round it
   *  as asked), with the resource or box and the reason. */
  textWarnings?: { kind: string; page: number | null; detail: string }[];
  /** `doc.configWarnings` of the builds, one per value: settings the engine
   *  could not use as written and what it used instead (C31). */
  configWarnings?: ProbeConfigWarning[];
  /** Formulas the maths engine could not set, each painted as a small red
   *  box: the TeX and MathJax's message (C32). */
  mathErrors?: { page: number; tex: string; error: string }[];
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
  /** Justified lines set ragged because their word spaces would have
   *  stretched past 3× (the builds' `raggedLine` warnings, #732): how many,
   *  and the five that would have stretched most. Absent on an engine
   *  without the warning. */
  raggedLines?: { count: number; lines: { page: number | null; ratio: number; text: string }[] };
  /** Paragraphs set a line short to take up a runt (`VDTBlock.runtFix`,
   *  #733): `count` of them, `tracked` the ones that needed tracking,
   *  `worst` the most tracking (thousandths of an em), `atCap` when one
   *  sits at `bodyText.maxRuntTracking`, `blocks` the five most tracked
   *  with their first words. Absent when none was fixed. */
  runtFixes?: { count: number; tracked: number; worst: number; atCap?: boolean; blocks: { page: number; tracking: number; text: string }[] };
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
  /** The composed pages of the result (lib/probe.js `composedFacts`, #869):
   *  C37, C38 and C40 read them. Absent from a probe before the bench. */
  composed?: ComposedFacts;
}

/** A frame of a composed page as the bench reads it. */
export interface ComposedFrameFact {
  name: string;
  /** The frame's stable id (`cp0:dinero`, a continuation's `cp0:resto~2`). */
  id?: string;
  heightMm: number;
  /** x, y, width, height in mm on the page. */
  box?: [number, number, number, number];
  overflowMm?: number;
  scale?: number;
  imageScale?: number;
  continuesTo?: string;
  continuedFrom?: string;
  filled?: true;
  /** How far the reflow moved the frame past an edge of the type area,
   *  where the template had it inside (#911; the four edges and the spread
   *  sheet, #948). */
  pushedOutMm?: number;
  /** Which edge: `foot`, `head`, `left` or `right` (in the frame the page
   *  is laid out in). Absent from a probe before #948: the foot. */
  pushedOutEdge?: "foot" | "head" | "left" | "right";
  /** `bleed`: the template had the frame outside the area on that edge, and
   *  it ran past the bleed. Absent: past the type area. */
  pushedOutOf?: "bleed";
}

/** An entry of a composed page's reflow log (`VDTComposedPage.log`). */
export interface ComposedEventFact {
  frame: string;
  kind: string;
  fromMm?: number;
  toMm?: number;
  axis?: "x" | "y";
  scale?: number;
  cause?: string;
  /** `describeReflowEvent`, when the engine has it. */
  text?: string;
}

/** A proposal of a `frameOverflow` warning (#858): `{ kind, path, value }`
 *  and the engine's words for it. */
export interface ComposedProposalFact {
  kind: string;
  path?: string;
  value: unknown;
  text?: string;
}

export interface ComposedFacts {
  /** A Markdown of the build has a `::::page{template=…}` fence. */
  declared: boolean;
  /** `doc`: the build's index when the capture lays out several. */
  pages: { n: number; doc?: number; template: string; fenceIndex: number; frames: ComposedFrameFact[]; events: ComposedEventFact[] }[];
  /** `frameOverflow`, `templateUnknown`, `slotUnknown`, `slotEmpty`, `pageFenceLength`. */
  warnings: {
    kind: string;
    page: number | null;
    template?: string;
    frame?: string;
    slot?: string;
    overflowMm?: number;
    locale?: string;
    steps?: string[];
    proposals?: ComposedProposalFact[];
    /** `formatWarning`, when the engine has it. */
    text?: string;
  }[];
  tocSplits: { page: number | null; title: string; columns: number }[];
  /** The source-map round trip (#857); null on an engine without `sourceAt`. */
  roundTrip: { levels: Record<string, { checked: number; missed: number }>; misses: { page: number; level: string; id: string; text: string }[] } | null;
}

export const firstLines = (text: string, n = 3) => text.split("\n").slice(0, n).join(" ⏎ ").slice(0, 400);

/** How C31 judges each `ConfigWarning` kind of the engine. */
export const CONFIG_WARNING_SEVERITY: Record<string, Severity> = {
  cjkGridClamped: "fail",
  sideColumnPercentClamped: "fail",
  columnCountClamped: "fail",
  unknownNumberFormat: "fail",
  unknownNumerals: "fail",
  unknownConfigValue: "fail",
  unknownConfigKey: "fail",
  lineNumbersUnsupported: "fail",
  fontFamilyStack: "warn",
  // Text kept in a design (#849): the pages are as asked, the source is not.
  contentInConfig: "warn",
};

/** A config warning as C31 prints it: the kind, where, and what the engine did. */
export function configWarningText(w: ProbeConfigWarning): string {
  const value = JSON.stringify(w.value);
  switch (w.kind) {
    case "cjkGridClamped":
      return `cjkGridClamped: ${w.path} asks for ${w.value}, the margins leave room for ${w.used}; the grid sets ${w.used}`;
    case "sideColumnPercentClamped":
      return `sideColumnPercentClamped: ${w.path} ${value} leaves a column with no width; the columns are cut at ${w.used} %`;
    case "columnCountClamped":
      return `columnCountClamped: ${w.path} ${value} is not a column count from 3 to 8; the page is cut into ${w.used} columns`;
    case "unknownNumberFormat":
      return `unknownNumberFormat: ${w.path} ${value} is no format the engine knows; it numbers in ${w.used}`;
    case "unknownNumerals":
      return `unknownNumerals: ${w.path} ${value} names no digit system; the digits are ${w.used}`;
    case "unknownConfigValue":
      return `unknownConfigValue: ${w.path} ${value} is not one of its choices${w.suggestion ? ` (${w.suggestion}?)` : ""}; the engine used ${w.used}`;
    case "unknownConfigKey":
      return `unknownConfigKey: ${w.path} is no key of that setting${w.suggestion ? ` (${w.suggestion}?)` : ""}; the engine ignores it`;
    case "lineNumbersUnsupported":
      return `lineNumbersUnsupported: ${w.path}: vertical documents get no line numbers`;
    case "contentInConfig":
      return `contentInConfig: ${w.path} keeps ${w.count ?? 1} design text${w.count === 1 ? "" : "s"} of content (${w.chars ?? 0} letters, ${value}); move the text into the Markdown or list the phrase in checks.contentInConfig.allow`;
    case "fontFamilyStack":
      return `fontFamilyStack: ${w.path} ${value} is a font stack; the text is set in ${w.used} alone`;
    default:
      return `${w.kind}: ${w.path} ${value}${w.used ? `; the engine used ${w.used}` : ""}`;
  }
}

/** Folds identical findings into one, counted. */
export function dedupe(findings: Finding[]): Finding[] {
  const counts = new Map<string, { finding: Finding; n: number }>();
  for (const f of findings) {
    const key = `${f.check}\0${f.severity}\0${f.detail}`;
    const seen = counts.get(key);
    if (seen) seen.n++;
    else counts.set(key, { finding: f, n: 1 });
  }
  return [...counts.values()].map(({ finding, n }) => (n > 1 ? { ...finding, detail: `${finding.detail} (×${n})` } : finding));
}
