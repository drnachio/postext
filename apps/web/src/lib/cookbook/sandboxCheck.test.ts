import { describe, expect, it } from "vitest";
import { sandboxEntry } from "../../../scripts/cookbook/capture.ts";
import { fontsourceRange, keptOnDisk, repoAsset, routeFor, withFontsourceVersion } from "../../../scripts/cookbook/net.ts";
import { COOKBOOK_DIR, REPO_DIR } from "./paths.ts";
import { compareEdition, extraWarnings, variableFamilies, warningSince } from "../../../scripts/cookbook/sandbox.ts";
import type { SandboxExpected, SandboxRun } from "../../../scripts/cookbook/sandbox.ts";
import type { RecipeMeta } from "./types.ts";

// `pnpm cookbook sandbox` (#736): a bundle through the Sandbox's own font
// and layout path, against what capture.json records. The four defects it
// is for (#688 to #691) each showed as a warning the Sandbox raised and the
// pen did not, with every capture check green.

const expected = (sandbox: Partial<SandboxExpected["sandbox"]> = {}): SandboxExpected => ({
  slug: "balloon-kinds", variant: "en", pages: 2, engine: "1.28.0",
  sandbox: { file: "balloon-kinds.postext", bytes: 1000, chapters: [{ pages: 2, hash: "aaaa" }], ...sandbox },
});
const run = (over: Partial<SandboxRun> = {}): SandboxRun => ({
  chapters: [{ pages: 2, hash: "aaaa", warnings: [] }], fonts: {}, settled: true, errors: [], ...over,
});
const options = { strict: false, sameEngine: true };

describe("compareEdition (#736)", () => {
  it("passes a bundle the Sandbox lays out as recorded", () => {
    expect(compareEdition(expected(), run(), options)).toEqual([]);
    expect(compareEdition(expected(), run(), { ...options, strict: true })).toEqual([]);
  });

  it("fails on a warning the pen does not raise, with the family's faces for a fontFallback", () => {
    const fonts = { Bangers: { page: ["400 normal ×3", "600 900 normal ×3"], worker: ["400 normal ×3"] }, "Comic Neue": { page: ["400 normal"], worker: ["400 normal"] } };
    const got = run({ chapters: [{ pages: 2, hash: "aaaa", warnings: ["fontFallback Bangers 700 (synthesized)"] }], fonts });
    expect(compareEdition(expected(), got, options)).toEqual([{
      severity: "fail",
      detail: "the Sandbox raises a warning the pen does not: fontFallback Bangers 700 (synthesized) (Bangers on the page: 400 normal ×3, 600 900 normal ×3; in the worker: 400 normal ×3)",
    }]);
  });

  it("lets the Sandbox raise what the pen's builds raise, as often and no more", () => {
    const recorded = expected({ warnings: ["comicBalloonOverflow p2 shout", "unknownResourceId fig"] });
    const same = run({ chapters: [{ pages: 2, hash: "aaaa", warnings: ["unknownResourceId fig", "comicBalloonOverflow p2 shout"] }] });
    expect(compareEdition(recorded, same, options)).toEqual([]);
    const twice = run({ chapters: [{ pages: 2, hash: "aaaa", warnings: ["unknownResourceId fig", "unknownResourceId fig"] }] });
    expect(compareEdition(recorded, twice, options).map((f) => f.detail)).toEqual(["the Sandbox raises a warning the pen does not: unknownResourceId fig"]);
  });

  it("warns, not fails, on a warning kind newer than the recipe's engine (#887)", () => {
    const got = run({ chapters: [{ pages: 2, hash: "aaaa", warnings: ["contentInConfig header"] }] });
    expect(compareEdition(expected(), got, { ...options, sameEngine: false })).toEqual([{
      severity: "warn",
      detail: "the Sandbox raises contentInConfig header, a warning postext 1.34.0 added after the recipe's 1.28.0: capture again on 1.34.0 or later",
    }]);
    const pinned = { ...expected(), engine: "1.34.0" };
    expect(compareEdition(pinned, got, options)[0]).toMatchObject({ severity: "fail" });
  });

  it("reads a new reason of an older kind by its kind and reason (#883)", () => {
    expect(warningSince("textWrap pear noContour")).toBe("1.36.0");
    expect(warningSince("textWrap pear tooNarrow")).toBeUndefined();
    expect(warningSince("contentInConfig header")).toBe("1.34.0");
    const got = run({ chapters: [{ pages: 2, hash: "aaaa", warnings: ["textWrap pear noContour"] }] });
    expect(compareEdition({ ...expected(), engine: "1.35.2" }, got, { ...options, sameEngine: false })[0]).toMatchObject({ severity: "warn" });
  });

  it("fails on an error of the page or the worker, and on a layout that brought nothing", () => {
    expect(compareEdition(expected(), run({ chapters: [], errors: ["the bundle does not open and lay out in the Sandbox: Not a zip archive"] }), options))
      .toEqual([{ severity: "fail", detail: "the bundle does not open and lay out in the Sandbox: Not a zip archive" }]);
    expect(compareEdition(expected(), run({ errors: ["worker error: boom"] }), options)).toEqual([{ severity: "fail", detail: "worker error: boom" }]);
    expect(compareEdition(expected(), run({ chapters: [] }), options)).toEqual([{ severity: "fail", detail: "the Sandbox laid out no chapter" }]);
    expect(compareEdition(expected(), run({ settled: false }), options)[0]).toMatchObject({ severity: "fail" });
  });

  it("warns of another page count, and fails on it with --strict", () => {
    const got = run({ chapters: [{ pages: 3, hash: "bbbb", warnings: [] }] });
    const detail = "the Sandbox lays the bundle out to 3 pages, the capture records 2";
    expect(compareEdition(expected(), got, options)).toEqual([{ severity: "warn", detail }]);
    expect(compareEdition(expected(), got, { ...options, strict: true })).toEqual([{ severity: "fail", detail }]);
  });

  it("warns of another chapter count, and fails on it with --strict", () => {
    const got = run({ chapters: [{ pages: 1, hash: "x", warnings: [] }, { pages: 1, hash: "y", warnings: [] }] });
    const detail = "the Sandbox lays out 2 chapters, the capture records 1";
    expect(compareEdition(expected(), got, options)).toEqual([{ severity: "warn", detail }]);
    expect(compareEdition(expected(), got, { ...options, strict: true })).toEqual([{ severity: "fail", detail }]);
  });

  // The Sandbox measures with Google's variable files, a pen with the static
  // cuts of Fontsource: on 1.28.1, 134 of 334 editions came out with another
  // layout hash, 127 of them with every line the same.
  const withLines = expected({ chapters: [{ pages: 2, hash: "aaaa", lines: "1111" }] });
  const fonts = {
    "Nunito Sans": { page: ["200 900 italic (unloaded) ×4", "200 900 italic", "200 900 normal (unloaded) ×4", "200 900 normal"], worker: ["200 900 italic ×5", "200 900 normal ×5"] },
    Bangers: { page: ["400 normal ×3", "600 900 normal ×3"], worker: ["400 normal ×3"] },
    Amiri: { page: ["400 normal", "700 normal"], worker: ["400 normal", "700 normal"] },
  };

  it("reads the lines, not the layout hash: the same lines set to other widths are a note", () => {
    const got = run({ chapters: [{ pages: 2, hash: "bbbb", lines: "1111", warnings: [] }], fonts });
    for (const strict of [false, true]) {
      expect(compareEdition(withLines, got, { strict, sameEngine: true })).toEqual([{
        severity: "info",
        detail: "the Sandbox sets the bundle in the lines the capture records, some of them to another width (layout hash bbbb against aaaa): the Sandbox measures Nunito Sans from a variable file, a pen from the static cuts",
      }]);
    }
  });

  it("warns of a line that breaks elsewhere, and fails on it with --strict", () => {
    const got = run({ chapters: [{ pages: 2, hash: "bbbb", lines: "2222", warnings: [] }], fonts });
    const [finding] = compareEdition(withLines, got, { strict: true, sameEngine: true });
    expect(finding).toEqual({
      severity: "fail",
      detail: "the Sandbox breaks the lines of the bundle otherwise than the capture records (2 pages on both sides, lines hash 2222 against 1111); the Sandbox measures Nunito Sans from a variable file, a pen from the static cuts, and a line a fraction of a pixel from its measure breaks on either side of it",
    });
    expect(compareEdition(withLines, got, { strict: false, sameEngine: true })[0]).toMatchObject({ severity: "warn" });
    // `--site` reports no faces: the lines, and no more.
    expect(compareEdition(withLines, { ...got, fonts: {} }, { strict: true, sameEngine: true })[0]!.detail)
      .toBe("the Sandbox breaks the lines of the bundle otherwise than the capture records (2 pages on both sides, lines hash 2222 against 1111)");
  });

  it("reads the lines on the recorded engine only", () => {
    const got = run({ chapters: [{ pages: 2, hash: "bbbb", lines: "2222", warnings: [] }] });
    // Another release moves lines on purpose: they are its own.
    expect(compareEdition(withLines, got, { strict: true, sameEngine: false })).toEqual([]);
  });

  it("warns, strict or not, of another layout hash with no lines recorded to read it by", () => {
    const got = run({ chapters: [{ pages: 2, hash: "bbbb", lines: "2222", warnings: [] }] });
    for (const strict of [false, true]) {
      const findings = compareEdition(expected(), got, { strict, sameEngine: true });
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ severity: "warn" });
      expect(findings[0]!.detail).toContain("layout hash bbbb against aaaa");
      expect(findings[0]!.detail).toContain("capture with --sandbox-only");
    }
    // A run that brings no lines (an older page entry) is read the same way.
    expect(compareEdition(withLines, run({ chapters: [{ pages: 2, hash: "bbbb", warnings: [] }] }), { strict: true, sameEngine: true })[0]).toMatchObject({ severity: "warn" });
    expect(compareEdition(expected(), got, { strict: true, sameEngine: false })).toEqual([]);
  });

  it("names the families set from a variable file: every loaded face a range of weights", () => {
    expect(variableFamilies(fonts)).toEqual(["Nunito Sans"]);
    // One cut and its stand-in for the bold (#688) is a static family.
    expect(variableFamilies({ Bangers: fonts.Bangers })).toEqual([]);
    expect(variableFamilies({ Lora: { page: ["400 700 normal (unloaded) ×3"], worker: [] } })).toEqual([]);
    expect(variableFamilies({})).toEqual([]);
  });

  it("names the chapter of a book", () => {
    const book = expected({ chapters: [{ pages: 4, hash: "a" }, { pages: 6, hash: "b" }] });
    const got = run({ chapters: [{ pages: 4, hash: "a", warnings: [] }, { pages: 7, hash: "c", warnings: [] }] });
    expect(compareEdition(book, got, options).map((f) => f.detail)).toEqual(["the Sandbox lays chapter 2 out to 7 pages, the capture records 6"]);
    const lined = expected({ chapters: [{ pages: 4, hash: "a", lines: "x" }, { pages: 6, hash: "b", lines: "y" }] });
    const moved = run({ chapters: [{ pages: 4, hash: "a", lines: "x", warnings: [] }, { pages: 6, hash: "c", lines: "z", warnings: [] }] });
    expect(compareEdition(lined, moved, options).map((f) => f.detail)).toEqual(["the Sandbox breaks the lines of chapter 2 otherwise than the capture records (6 pages on both sides, lines hash z against y)"]);
  });

  it("compares an edition recorded before sandbox.chapters on its pages, its warnings as notes", () => {
    const old: SandboxExpected = { slug: "a-recipe", variant: "es", pages: 6, engine: "1.26.0", sandbox: { file: "a-recipe.postext", bytes: 10 } };
    const got = run({ chapters: [{ pages: 4, hash: "a", warnings: ["fontFallback Lora 600 (synthesized)"] }, { pages: 2, hash: "b", warnings: [] }] });
    const findings = compareEdition(old, got, options);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "info" });
    expect(findings[0]!.detail).toContain("fontFallback Lora 600 (synthesized)");
    // A bundle that holds some of the builds records its own page count.
    const part = { ...old, sandbox: { ...old.sandbox, pages: 5 } };
    expect(compareEdition(part, got, { ...options, strict: true })[0]).toEqual({ severity: "fail", detail: "the Sandbox lays the bundle out to 6 pages, the capture counts 5" });
  });

  it("--site: fails when the page fetched another edition's bundle (#737)", () => {
    const ownBundle = "/cookbook/balloon-kinds/zh/balloon-kinds.postext";
    expect(compareEdition(expected(), run({ bundleUrl: ownBundle }), { ...options, ownBundle })).toEqual([]);
    expect(compareEdition(expected(), run({ bundleUrl: "/cookbook/balloon-kinds/en/balloon-kinds.postext" }), { ...options, ownBundle })[0])
      .toEqual({ severity: "fail", detail: `the page fetched /cookbook/balloon-kinds/en/balloon-kinds.postext, not the edition's own ${ownBundle}` });
    expect(compareEdition(expected(), run(), { ...options, ownBundle })[0]!.detail).toContain("the page fetched no bundle");
  });

  it("extraWarnings counts each warning as often as it is over", () => {
    expect(extraWarnings(["a", "b"], ["b", "a"])).toEqual([]);
    expect(extraWarnings(["a"], ["a", "a", "c"])).toEqual(["a", "c"]);
    expect(extraWarnings([], [])).toEqual([]);
  });
});

describe("the network of the Sandbox check (#736)", () => {
  it("reaches Google Fonts and Fontsource's files, which a pen may not", () => {
    for (const url of [
      "https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400..700",
      "https://fonts.gstatic.com/s/lora/v35/abc.woff2",
      "https://cdn.jsdelivr.net/fontsource/fonts/commit-mono@latest/latin-400-normal.woff2",
    ]) {
      expect(routeFor(url), url).toMatchObject({ kind: "blocked" });
      expect(routeFor(url, "pen"), url).toMatchObject({ kind: "blocked" });
      expect(routeFor(url, "sandbox"), url).toEqual({ kind: "network" });
    }
  });

  it("keeps on disk the 404 of a font file Fontsource lists and jsDelivr has not, and no other error (#757)", () => {
    const file = "https://cdn.jsdelivr.net/npm/@fontsource/libertinus-sans@5/files/libertinus-sans-latin-700-italic.woff2";
    expect(keptOnDisk(file, 200)).toBe(true);
    // Asked of the network at every run otherwise, and waited for when it is slow to say no.
    expect(keptOnDisk(file, 404)).toBe(true);
    expect(keptOnDisk(file, 503)).toBe(false);
    expect(keptOnDisk("https://api.fontsource.org/v1/fonts/libertinus-sans", 404)).toBe(false);
    expect(keptOnDisk("https://cdn.jsdelivr.net/npm/@fontsource/libertinus-sans@5/700-italic.css", 404)).toBe(false);
  });

  it("keeps every other rule of the capture", () => {
    for (const profile of ["pen", "sandbox"] as const) {
      expect(routeFor("https://esm.sh/postext@1.27.1", profile)).toEqual({ kind: "network" });
      expect(routeFor("https://api.fontsource.org/v1/fonts/lora", profile)).toEqual({ kind: "network" });
      expect(routeFor("https://cdn.jsdelivr.net/npm/@fontsource/lora/files/x.woff2", profile)).toEqual({ kind: "network" });
      expect(routeFor("https://cdn.jsdelivr.net/gh/drnachio/postext@main/cookbook/x/a.png", profile)).toEqual({ kind: "repo", rel: "cookbook/x/a.png" });
      expect(routeFor("https://postext.dev/cookbook/x/en/p01.webp", profile)).toEqual({ kind: "public", rel: "cookbook/x/en/p01.webp" });
      expect(routeFor("https://example.com/tracker.js", profile)).toEqual({ kind: "blocked", host: "example.com" });
      expect(routeFor("https://cdn.jsdelivr.net/npm/left-pad/index.js", profile)).toMatchObject({ kind: "blocked" });
    }
  });

  it("finds a draft's assets in the folder its recipes are read from (#1671)", () => {
    const fixtures = `${REPO_DIR}/apps/web/src/lib/cookbook/fixtures/recipes`;
    const rel = "cookbook/composed-bench/recipe.json";
    // Not in the repository's cookbook/, found in COOKBOOK_RECIPES_DIR.
    expect(repoAsset(rel, COOKBOOK_DIR)).toBeNull();
    expect(repoAsset(rel, fixtures)).toBe(`${fixtures}/composed-bench/recipe.json`);
    // A repository file stays the repository's, and nothing leaves the folder.
    expect(repoAsset("cookbook/README.md", fixtures)).toBe(`${COOKBOOK_DIR}/README.md`);
    expect(repoAsset("cookbook/../../etc/passwd", fixtures)).toBeNull();
    expect(repoAsset("apps/web/package.json", fixtures)).toBe(`${REPO_DIR}/apps/web/package.json`);
  });
});

describe("capture.json's sandbox entry (#736)", () => {
  const meta = { capture: {}, folio: undefined } as unknown as Pick<RecipeMeta, "folio" | "capture">;
  const chapter = (pages: number, hash: string) => ({ chapter: 1, pen: { pages, hash }, bundle: { pages, hash }, difference: null });
  const bundle = { bytes: Buffer.from("zip"), pages: 6, allPages: 6, penWarnings: [] as string[], readBack: { chapters: [chapter(4, "aa"), chapter(2, "bb")], extraWarnings: [] } };

  it("records each chapter's pages and layout hash as the bundle reads back", () => {
    expect(sandboxEntry("a-recipe", bundle, meta)).toEqual({ file: "a-recipe.postext", bytes: 3, chapters: [{ pages: 4, hash: "aa" }, { pages: 2, hash: "bb" }] });
  });

  it("records each chapter's lines hash beside it, when the read-back brings one", () => {
    const lined = (pages: number, hash: string, lines: string) => ({ chapter: 1, pen: { pages, hash, lines }, bundle: { pages, hash, lines }, difference: null });
    const entry = sandboxEntry("a-recipe", { ...bundle, readBack: { chapters: [lined(4, "aa", "l1"), lined(2, "bb", "l2")], extraWarnings: [] } }, meta);
    expect(entry.chapters).toEqual([{ pages: 4, hash: "aa", lines: "l1" }, { pages: 2, hash: "bb", lines: "l2" }]);
  });

  it("records the warnings of the pen's builds, and leaves the field out when there are none", () => {
    const entry = sandboxEntry("a-recipe", { ...bundle, penWarnings: ["comicBalloonOverflow p2 shout"] }, meta);
    expect(entry.warnings).toEqual(["comicBalloonOverflow p2 shout"]);
    expect("warnings" in sandboxEntry("a-recipe", bundle, meta)).toBe(false);
  });

  it("records no chapters for a bundle that was not read back", () => {
    for (const readBack of [null, { skipped: "the engine has no openBundle / buildBundle", chapters: [], extraWarnings: [] }, { error: "boom", chapters: [], extraWarnings: [] }]) {
      expect("chapters" in sandboxEntry("a-recipe", { ...bundle, readBack }, meta)).toBe(false);
    }
  });

  it("keeps what it recorded before: the kept build and the pages of a bundle that holds some builds", () => {
    const some = sandboxEntry("a-recipe", { ...bundle, pages: 2, allPages: 6 }, { capture: { sandbox: "last" }, folio: undefined } as unknown as Pick<RecipeMeta, "folio" | "capture">);
    expect(some).toMatchObject({ keep: "last", pages: 2 });
  });
});

// #746: `@fontsource/<id>@5` is answered per file by whatever version each
// cache holds. Noto Sans TC 5.3.1 cut the family anew, and a 5.3.0 style
// sheet beside 5.3.1 files left characters in no file: a font of the system
// set them. The capture asks for one exact version of a package.
describe("one version of a Fontsource package (#746)", () => {
  const css = "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@5/700.css";
  const file = "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@5/files/noto-sans-tc-100-700-normal.woff2";

  it("reads the package and the range of a URL asked for by a range", () => {
    expect(fontsourceRange(css)).toEqual({ id: "noto-sans-tc", range: "5" });
    expect(fontsourceRange(file)).toEqual({ id: "noto-sans-tc", range: "5" });
    expect(fontsourceRange("https://cdn.jsdelivr.net/npm/@fontsource/source-serif-4@latest/400.css")).toEqual({ id: "source-serif-4", range: "latest" });
    expect(fontsourceRange("https://cdn.jsdelivr.net/npm/@fontsource/lora@5.3/400.css")).toEqual({ id: "lora", range: "5.3" });
  });

  it("leaves an exact version and every other URL alone", () => {
    expect(fontsourceRange("https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@5.3.1/700.css")).toBeNull();
    expect(fontsourceRange("https://api.fontsource.org/v1/fonts/noto-sans-tc")).toBeNull();
    expect(fontsourceRange("https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-tc@latest/latin-400-normal.woff2")).toBeNull();
    expect(fontsourceRange("https://esm.sh/postext@1.28.5")).toBeNull();
  });

  it("asks for the same path in the version", () => {
    expect(withFontsourceVersion(css, "5.3.1")).toBe("https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@5.3.1/700.css");
    expect(withFontsourceVersion(file, "5.3.1")).toBe("https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@5.3.1/files/noto-sans-tc-100-700-normal.woff2");
    expect(withFontsourceVersion("https://esm.sh/postext@1.28.5", "5.3.1")).toBe("https://esm.sh/postext@1.28.5");
  });
});
