// Engine releases against a recipe: semver order, preview drafts, retired
// gotchas and the notes and gaps a release fixed (#1276: split out of
// validate.ts).
import type { RecipeMeta, Gotcha, Registry, GotchaId, GapId } from '../types.ts';
import { asStrings } from './recipeMeta.ts';

// ─── Small helpers ──────────────────────────────────────────────────────────

/** Compares "1.4.1"-style versions; missing parts count as 0. */
export function compareSemVer(a: string, b: string): number {
  const pa = a.split(".").map((part) => parseInt(part, 10) || 0);
  const pb = b.split(".").map((part) => parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

/** The furthest version a draft may preview: the next major release
 *  (1.8.4 → 2.0.0), which covers the next minor and patch too. */
export function nextRelease(released: string): string {
  const major = parseInt(released.split(".")[0] ?? "0", 10) || 0;
  return `${major + 1}.0.0`;
}

/** A draft that pins a postext newer than the released one: it previews
 *  the next release on the workspace engine (`--engine local`) and is
 *  captured from npm once that release is out. */
export function previewDraft(
  meta: Pick<RecipeMeta, "status" | "engine">,
  released: { postext?: string; postextPdf?: string },
): boolean {
  if (meta.status !== "draft" || !released.postext || typeof meta.engine?.postext !== "string") return false;
  return compareSemVer(meta.engine.postext, released.postext) > 0;
}

/** Whether a pitfall the engine has fixed (`fixedIn`) is behind a recipe:
 *  the recipe pins that version or a later one, so the pitfall no longer
 *  describes the engine its script was written for. */
export function gotchaRetired(gotcha: Pick<Gotcha, "fixedIn"> | undefined, pinned: string | undefined): boolean {
  return Boolean(gotcha?.fixedIn && pinned && compareSemVer(pinned, gotcha.fixedIn) >= 0);
}

/** The pitfalls of `recipe.json` `gotchas` a recipe shows and is searched
 *  by. One with `fixedIn` stays on a recipe pinned below the fix (its script
 *  still routes around it; the card says "fixed in postext X") and is left
 *  out of a recipe pinned at the fix or later. */
export function shownGotchas(meta: Pick<RecipeMeta, "gotchas" | "engine">, gotchas: Registry["gotchas"]): GotchaId[] {
  const pinned = typeof meta.engine?.postext === "string" ? meta.engine.postext : undefined;
  return (meta.gotchas ?? []).filter((id) => !gotchaRetired(gotchas[id], pinned));
}

/** One thing `recipe.json` still says about a pitfall the engine fixed. */
export interface FixedNote {
  /** Where it is: `gotchas` or `workarounds[5]`. */
  at: string;
  kind: "gotcha" | "workaround";
  /** The fixed pitfalls behind it (one for a `gotchas` id). */
  pitfalls: GotchaId[];
  /** The earliest version that fixed one of them. */
  fixedIn: string;
  /** A workaround's follow-up ("EF-66"). */
  followup?: string;
  /** Pitfalls with the same follow-up that still apply (a partial fix). */
  open: GotchaId[];
  message: string;
}

/**
 * The notes of a recipe that describe pitfalls fixed at or before the engine
 * it pins (#641): the ids in `gotchas`, which the page no longer shows
 * (`shownGotchas`), and the `workarounds` whose `followup` is the follow-up
 * of such a pitfall, which then explain code by a bug the recipe's engine
 * does not have. `asOf` judges the recipe as if it pinned at least that
 * version: the release a clean-up brings the Cookbook up to.
 */
export function fixedNotes(
  meta: Pick<RecipeMeta, "gotchas" | "workarounds" | "engine">,
  gotchas: Registry["gotchas"],
  asOf?: string,
): FixedNote[] {
  const own = typeof meta.engine?.postext === "string" ? meta.engine.postext : undefined;
  const pinned = asOf && (!own || compareSemVer(asOf, own) > 0) ? asOf : own;
  if (!pinned) return [];
  const pins = pinned === own ? `this recipe pins ${pinned}` : `the recipe is read as of ${pinned}`;
  const notes: FixedNote[] = [];
  for (const id of meta.gotchas ?? []) {
    const gotcha = gotchas[id];
    if (!gotcha?.fixedIn || !gotchaRetired(gotcha, pinned)) continue;
    notes.push({
      at: "gotchas", kind: "gotcha", pitfalls: [id], fixedIn: gotcha.fixedIn, open: [],
      message: `gotchas: "${id}" is fixed in postext ${gotcha.fixedIn} and ${pins}: take it out of the list`,
    });
  }
  const byFollowup = new Map<string, GotchaId[]>();
  for (const [id, gotcha] of Object.entries(gotchas)) {
    if (gotcha.followup) byFollowup.set(gotcha.followup, [...(byFollowup.get(gotcha.followup) ?? []), id]);
  }
  (meta.workarounds ?? []).forEach((workaround, index) => {
    const sharing = workaround.followup ? byFollowup.get(workaround.followup) ?? [] : [];
    const fixed = sharing.filter((id) => gotchaRetired(gotchas[id], pinned));
    if (!workaround.followup || fixed.length === 0) return;
    const open = sharing.filter((id) => !gotchas[id].fixedIn);
    const fixedIn = fixed.map((id) => gotchas[id].fixedIn as string).sort(compareSemVer)[0];
    const still = open.length ? `; ${open.map((id) => `"${id}"`).join(", ")} (same follow-up) still applies, and a note about it stays without "followup"` : "";
    notes.push({
      at: `workarounds[${index}]`, kind: "workaround", pitfalls: fixed, fixedIn, followup: workaround.followup, open,
      message:
        `workarounds[${index}] (${workaround.followup}): its follow-up is fixed in postext ${fixedIn} (pitfall ${fixed.map((id) => `"${id}"`).join(", ")}) and ${pins}: ` +
        `delete the note, or keep what is a design choice today without "followup"${still}`,
    });
  });
  return notes;
}

/** One closed gap `recipe.json` still lists. */
export interface FixedGap {
  gap: GapId;
  /** The version that closed it. */
  fixedIn: string;
  message: string;
}

/**
 * The ids in a recipe's `gaps` that the engine closed at or before the
 * version the recipe pins (#641): the recipe no longer works around them, so
 * each one leaves the list, like a fixed pitfall leaves `gotchas`
 * (`fixedNotes`). A recipe pinned below the fix keeps the id: its script
 * still takes the way round. `asOf` reads the recipe as if it pinned at
 * least that version.
 */
export function fixedGaps(meta: Pick<RecipeMeta, "gaps" | "engine">, gaps: Registry["gaps"] | undefined, asOf?: string): FixedGap[] {
  const own = typeof meta.engine?.postext === "string" ? meta.engine.postext : undefined;
  const pinned = asOf && (!own || compareSemVer(asOf, own) > 0) ? asOf : own;
  if (!pinned) return [];
  const pins = pinned === own ? `this recipe pins ${pinned}` : `the recipe is read as of ${pinned}`;
  return asStrings(meta.gaps).flatMap((id) => {
    const fixedIn = gaps?.[id]?.fixedIn;
    if (!fixedIn || !gotchaRetired({ fixedIn }, pinned)) return [];
    return [{ gap: id, fixedIn, message: `gaps: "${id}" is closed in postext ${fixedIn} and ${pins}: take it out of the list` }];
  });
}
