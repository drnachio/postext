// Which content warnings each engine release reports, and the font
// families a fallback or a variable face explains (#1276: split out of
// sandbox.ts).
import type { SandboxRun } from '../sandbox.ts';

/** The warnings in `got` beyond those in `expected`, each as often as it is over. */
export function extraWarnings(expected: readonly string[], got: readonly string[]): string[] {
  const left = new Map<string, number>();
  for (const w of expected) left.set(w, (left.get(w) ?? 0) + 1);
  const out: string[] = [];
  for (const w of got) {
    const n = left.get(w) ?? 0;
    if (n > 0) left.set(w, n - 1);
    else out.push(w);
  }
  return out;
}

/**
 * Warning kinds by the release that first raises them. A recipe pins the
 * engine of its capture; the Sandbox runs the tree's. A kind that came after
 * the pinned engine is one the pen could not raise: the edition is to be
 * captured again on the release that brings it (#887), not broken. A new
 * reason of an older kind is keyed `"<kind> <reason>"` (a word of the
 * warning after its kind).
 */
export const WARNING_SINCE: Readonly<Record<string, string>> = {
  contentInConfig: "1.34.0",
  tocGroupSplit: "1.34.0",
  templateUnknown: "1.34.0",
  slotUnknown: "1.34.0",
  slotEmpty: "1.34.0",
  pageFenceLength: "1.34.0",
  templateDuplicate: "1.34.0",
  templateExtendsCycle: "1.34.0",
  templateExtendsUnknown: "1.34.0",
  frameDuplicate: "1.34.0",
  frameStyleUnknown: "1.34.0",
  frameAnchorUnknown: "1.34.0",
  frameMinMax: "1.34.0",
  groupFrameUnknown: "1.34.0",
  groupFrameTwice: "1.34.0",
  frameChainLoop: "1.34.0",
  overflowTargetUnknown: "1.34.0",
  labelStyleUnknown: "1.34.0",
  frameOverflow: "1.34.1",
  unknownMarkStyle: "1.34.1",
  spreadMismatch: "1.35.0",
  "textWrap noContour": "1.36.0",
  frameContinuationLimit: "1.37.0",
  labelAnchorUnknown: "1.37.0",
  anchorUnlabelled: "1.37.0",
  pictureBelowPrintSize: "1.37.0",
  comicPanelFrame: "1.38.0",
  continueTargetMissing: "1.38.0",
  calloutStyleExtendsUnknown: "1.39.0",
  calloutStyleExtendsCycle: "1.39.0",
  labelOverflow: "1.39.0",
  labelOverlap: "1.39.0",
  figureWordsShared: "1.42.0",
  headingClaimsColumn: "1.43.0",
  frameCovered: "1.48.0",
  frameOutsideArea: "1.48.0",
  repeatOverflow: "1.48.0",
  moduleUnknown: "1.48.0",
  moduleAsPage: "1.48.0",
  moduleNested: "1.48.0",
  moduleNameRejected: "1.48.0",
  lookUnknown: "1.50.0",
  emptyCaption: "1.52.0",
  resourceMoved: "1.52.0",
  glyphFallback: "1.52.0",
  wordDividedByCharacter: "1.52.0",
  wordDividedBySyllable: "1.52.0",
  strayFence: "1.52.0",
  folioMissing: "1.53.0",
};

/** The release that first raises `warning` (its kind, or its kind and one
 *  of its words: a reason added later), if it is in {@link WARNING_SINCE}. */
export function warningSince(warning: string): string | undefined {
  const [kind = "", ...words] = warning.split(" ");
  for (const word of words) {
    const since = WARNING_SINCE[`${kind} ${word}`];
    if (since) return since;
  }
  return WARNING_SINCE[kind];
}

/** `a` is a later release than `b` ("1.34.0" against "1.33.11"). */
export function laterRelease(a: string, b: string): boolean {
  const pa = a.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

/** "fontFallback Bangers 700 (synthesized)" → "Bangers". */
export function fallbackFamily(warning: string, families: readonly string[]): string | null {
  if (!warning.startsWith("fontFallback ")) return null;
  const rest = warning.slice("fontFallback ".length);
  return [...families].sort((a, b) => b.length - a.length).find((family) => rest.startsWith(`${family} `)) ?? null;
}

/** "A", "A and B", "A, B and C". */
export const listed = (names: readonly string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/**
 * The families of a run the page set from a variable file: every loaded
 * face of theirs answers for a range of weights ("200 900 normal"). A
 * family with one cut and a stand-in for its bold (#688: "400 normal" and
 * "600 900 normal") is not one. Empty for a run that reports no faces
 * (`--site`).
 */
export function variableFamilies(fonts: SandboxRun["fonts"]): string[] {
  return Object.entries(fonts)
    .filter(([, held]) => {
      const loaded = held.page.filter((face) => !/\((unloaded|loading|error)\)/.test(face));
      return loaded.length > 0 && loaded.every((face) => /^\d+ \d+ /.test(face));
    })
    .map(([family]) => family);
}
