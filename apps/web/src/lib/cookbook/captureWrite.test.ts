import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { planEdition, withVerified, writeRecipe } from "../../../scripts/cookbook/capture.ts";
import type { Output } from "../../../scripts/cookbook/capture.ts";
import { pageDifference, pagesDiffer, PAGE_DIFFERENCE } from "../../../scripts/cookbook/lib/probe.js";
import type { EngineSpec } from "../../../scripts/cookbook/shim.ts";
import { pdfDateOf, resolveEngine, shimModules } from "../../../scripts/cookbook/shim.ts";
import type { CaptureManifest, CaptureVariant, RecipeMeta, SampleLocale } from "./types.ts";

// A recapture with an unchanged layout rewrites nothing (#734), and a run
// on a newer release records that it found the recipe unchanged (#735).
// Before: every file of a recipe was written again on another engine, and
// 56 PDFs changed in two dates alone.

const SLUG = "a-recipe";
const A = "1.27.0";
const B = "1.28.0";
const engineOf = (version: string): EngineSpec => ({ postext: version, postextPdf: version, postextCiteproc: version, postextFolio: "0.16.1", postextEpub: "0.13.1", postextScorm: "0.3.0", source: "npm" });
const meta = { sample: { locales: ["en", "es"] }, outputs: ["pdf"], downloads: { pdf: true }, engine: { postext: A, postextPdf: A } } as unknown as RecipeMeta;
const bytes = (text: string) => Buffer.from(text);

/** One edition's files: a page, its strip, the card, the OG image, the PDF and the bundle. */
function filesOf(tag: string): Map<string, Buffer> {
  return new Map([
    ["p01.webp", bytes(`page ${tag}`)], ["p01.s.webp", bytes(`strip ${tag}`)],
    ["card.webp", bytes(`card ${tag}`)], ["card.480.webp", bytes(`card480 ${tag}`)], ["og.jpg", bytes(`og ${tag}`)],
    [`${SLUG}.pdf`, bytes(`pdf ${tag}`)], [`${SLUG}.postext`, bytes(`bundle ${tag}`)],
  ]);
}

function variantOf(files: Map<string, Buffer>, vdtHash = "vdt-1"): CaptureVariant {
  return {
    hash8: "0ld0ld0l", vdtHash,
    timings: { importMs: 1, fontsMs: 2, buildMs: 3, totalMs: 4, builds: 1 },
    pages: [{ n: 1, label: "1", role: "body", w: 1000, h: 1400, file: "p01.webp", strip: "p01.s.webp", bytes: files.get("p01.webp")!.length, alt: "Page 1" }],
    spreads: [[null, 1]],
    card: { file: "card.webp", file480: "card.480.webp", w: 960, h: 720, mode: "page" },
    og: { file: "og.jpg", w: 580, h: 622 },
    pdf: { file: `${SLUG}.pdf`, bytes: files.get(`${SLUG}.pdf`)!.length, pages: 1 },
    sandbox: { file: `${SLUG}.postext`, bytes: files.get(`${SLUG}.postext`)!.length },
    detected: {}, diagnostics: { converged: true, iterationCount: 1, looseLines: { count: 0, share: 0, worst: 0 }, findings: [] },
  } as unknown as CaptureVariant;
}

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

/** A committed capture of two editions on release A, in a folder of its own. */
function committed(extra: Partial<CaptureManifest> = {}) {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cookbook-write-")), SLUG);
  roots.push(path.dirname(root));
  const variants: Partial<Record<SampleLocale, CaptureVariant>> = {};
  for (const locale of ["en", "es"] as const) {
    const files = filesOf(`${locale} A`);
    fs.mkdirSync(path.join(root, locale), { recursive: true });
    for (const [name, data] of files) fs.writeFileSync(path.join(root, locale, name), data);
    variants[locale] = variantOf(files);
  }
  const manifest: CaptureManifest = {
    schemaVersion: 1, slug: SLUG, sourceHash: "src-1", engine: { postext: A, postextPdf: A, source: "npm" }, chrome: "131.0.6778.204",
    capturedAt: "2026-10-01T10:00:00.000Z", ...extra, variants,
  } as CaptureManifest;
  fs.writeFileSync(path.join(root, "capture.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, manifest };
}

/** The folder as bytes, file by file. */
function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) walk(file);
      else out[path.relative(root, file)] = fs.readFileSync(file).toString("base64");
    }
  };
  walk(root);
  return out;
}

/** A run's output for an edition: the committed files, with some replaced. */
function output(locale: SampleLocale, changed: Record<string, string> = {}, more: Partial<Output> & { vdtHash?: string } = {}): Output {
  const files = filesOf(`${locale} A`);
  for (const [name, text] of Object.entries(changed)) files.set(name, bytes(text));
  const { vdtHash, ...rest } = more;
  return { variant: variantOf(files, vdtHash), files, previews: new Map(), sheet: {} as Output["sheet"], pageChanges: [], ...rest };
}

const run = (root: string, manifest: CaptureManifest, outputs: [SampleLocale, Output][], version = B, options: { force?: boolean; verifyOnly?: boolean } = {}) =>
  writeRecipe({ slug: SLUG, meta, sourceHash: "src-1", previous: manifest }, new Map(outputs), engineOf(version), "154.0.0.0", { ...options, root, now: () => new Date("2026-10-11T12:00:00.000Z") });

const read = (root: string) => JSON.parse(fs.readFileSync(path.join(root, "capture.json"), "utf-8")) as CaptureManifest;

describe("writeRecipe: a recapture on another release (#734)", () => {
  it("writes no file when the layout hash, the images, the PDF and the bundle are the same", () => {
    const { root, manifest } = committed();
    const before = snapshot(root);
    const outcome = run(root, manifest, [["en", output("en")], ["es", output("es")]]);
    expect(outcome.written.size).toBe(0);
    expect(outcome.manifestOnly).toBe(false);
    const after = snapshot(root);
    // Only capture.json differs, and only by the `verified` record (#735).
    expect({ ...after, "capture.json": "" }).toEqual({ ...before, "capture.json": "" });
    expect(read(root)).toEqual({ ...manifest, verified: { postext: B, postextPdf: B, chrome: "154.0.0.0", at: "2026-10-11T12:00:00.000Z" } });
  });

  it("keeps images whose bytes differ within rendering noise, and their entry", () => {
    const { root, manifest } = committed();
    const before = snapshot(root);
    // Another Chrome: other bytes, compared in the page and found within the threshold.
    const outcome = run(root, manifest, [["en", output("en", { "p01.webp": "page en, other pixels at glyph edges" })], ["es", output("es")]]);
    expect(outcome.written.size).toBe(0);
    expect(snapshot(root)["en/p01.webp"]).toBe(before["en/p01.webp"]);
    expect(read(root).engine.postext).toBe(A);
    expect(read(root).variants.en!.pages[0]!.bytes).toBe(manifest.variants.en!.pages[0]!.bytes);
  });

  it("writes the PDF alone when only its bytes changed, and moves the engine", () => {
    const { root, manifest } = committed({ verified: { postext: "1.27.1", postextPdf: "1.27.1", chrome: "131.0.6778.204", at: "2026-10-05T00:00:00.000Z" } });
    const before = snapshot(root);
    const outcome = run(root, manifest, [["en", output("en", { [`${SLUG}.pdf`]: "pdf en B, longer" })], ["es", output("es")]]);
    expect([...outcome.written]).toEqual([["en", new Set(["pdf"])]]);
    const after = snapshot(root);
    const changed = Object.keys(after).filter((name) => after[name] !== before[name]);
    expect(changed.sort()).toEqual(["capture.json", `en/${SLUG}.pdf`]);
    const written = read(root);
    expect(written.engine).toEqual({ postext: B, postextPdf: B, source: "npm" });
    expect(written.chrome).toBe("154.0.0.0");
    expect(written.capturedAt).toBe("2026-10-11T12:00:00.000Z");
    // The files say it themselves.
    expect(written.verified).toBeUndefined();
    expect(written.variants.en!.pdf!.bytes).toBe("pdf en B, longer".length);
    expect(written.variants.en!.hash8).not.toBe("0ld0ld0l");
    // The edition that wrote nothing keeps its hash and its timings.
    expect(written.variants.es!.hash8).toBe("0ld0ld0l");
    expect(written.variants.es!.timings).toEqual(manifest.variants.es!.timings);
  });

  it("writes the images when a page differs beyond the threshold, the PDF staying", () => {
    const { root, manifest } = committed();
    const before = snapshot(root);
    const outcome = run(root, manifest, [
      ["en", output("en", { "p01.webp": "page en repainted", "card.webp": "card en repainted" }, { pageChanges: [{ n: 1, detail: "worst cell 36.2 of 255, 14 cells over the threshold" }] })],
      ["es", output("es")],
    ]);
    expect([...outcome.written]).toEqual([["en", new Set(["images"])]]);
    const after = snapshot(root);
    expect(after["en/p01.webp"]).toBe(bytes("page en repainted").toString("base64"));
    expect(after["en/card.webp"]).toBe(bytes("card en repainted").toString("base64"));
    expect(after[`en/${SLUG}.pdf`]).toBe(before[`en/${SLUG}.pdf`]);
    expect(read(root).engine.postext).toBe(B);
  });

  it("writes the whole edition when the layout hash changed", () => {
    const { root, manifest } = committed();
    const outcome = run(root, manifest, [["en", output("en", { "p01.webp": "page en B", [`${SLUG}.pdf`]: "pdf en B" }, { vdtHash: "vdt-2" })], ["es", output("es")]]);
    expect([...outcome.written]).toEqual([["en", new Set(["images", "pdf", "bundle"])]]);
    expect(read(root).variants.en!.vdtHash).toBe("vdt-2");
    expect(read(root).engine.postext).toBe(B);
  });

  it("keeps a committed bundle of other bytes that reads back on the run's engine, and writes one that does not", () => {
    const { root, manifest } = committed();
    const before = snapshot(root);
    const kept = run(root, manifest, [["en", output("en", { [`${SLUG}.postext`]: "bundle en as B writes it" }, { committedBundleOk: true })], ["es", output("es")]]);
    expect(kept.written.size).toBe(0);
    expect(snapshot(root)[`en/${SLUG}.postext`]).toBe(before[`en/${SLUG}.postext`]);
    const { root: other, manifest: again } = committed();
    const written = run(other, again, [["en", output("en", { [`${SLUG}.postext`]: "bundle en as B writes it" }, { committedBundleOk: false })], ["es", output("es")]]);
    expect([...written.written]).toEqual([["en", new Set(["bundle"])]]);
    expect(read(other).variants.en!.sandbox!.bytes).toBe("bundle en as B writes it".length);
  });

  it("writes a bundle of other bytes on the recorded engine: it follows the tooling", () => {
    const { root, manifest } = committed();
    const outcome = run(root, manifest, [["en", output("en", { [`${SLUG}.postext`]: "bundle en, tooling changed" }, { committedBundleOk: true })], ["es", output("es")]], A);
    expect([...outcome.written]).toEqual([["en", new Set(["bundle"])]]);
  });

  it("writes everything with --force", () => {
    const { root, manifest } = committed();
    const outcome = run(root, manifest, [["en", output("en")], ["es", output("es")]], B, { force: true });
    expect([...outcome.written.keys()].sort()).toEqual(["en", "es"]);
    expect(read(root).engine.postext).toBe(B);
  });

  it("names why an edition is written", () => {
    const { root, manifest } = committed();
    const plan = (out: Output, sourceHash = "src-1") => planEdition(SLUG, "en", out, path.join(root, "en"), manifest, { sourceHash, engine: B, force: false });
    expect(plan(output("en")).reasons).toEqual([]);
    expect(plan(output("en", {}, { vdtHash: "vdt-2" })).reasons).toEqual(["layout hash"]);
    expect(plan(output("en", { [`${SLUG}.pdf`]: "x" })).reasons).toEqual(["PDF"]);
    expect(plan(output("en", { [`${SLUG}.postext`]: "x" })).reasons).toEqual(["bundle"]);
    expect(plan(output("en", {}, { pageChanges: [{ n: 1, detail: "worst cell 20 of 255, 2 cells over the threshold" }, { n: 3, detail: "…" }] })).reasons)
      .toEqual(["pixels (p01: worst cell 20 of 255, 2 cells over the threshold, and 1 more page)"]);
    expect(plan(output("en"), "src-2").reasons).toEqual(["sources"]);
    // A run that compared nothing falls back on the bytes.
    expect(plan(output("en", { "p01.webp": "other" }, { pageChanges: null })).write).toEqual(new Set(["images"]));
    expect(plan(output("en", {}, { pageChanges: null })).write.size).toBe(0);
  });
});

describe("writeRecipe: the release a recipe was last verified on (#735)", () => {
  it("adds `verified` on a newer release and changes no other byte of capture.json", () => {
    const { root, manifest } = committed();
    const text = fs.readFileSync(path.join(root, "capture.json"), "utf-8");
    const outcome = run(root, manifest, [["en", output("en")], ["es", output("es")]]);
    expect(outcome.verified).toBe(B);
    const after = fs.readFileSync(path.join(root, "capture.json"), "utf-8");
    const block = '  "verified": {\n    "postext": "1.28.0",\n    "postextPdf": "1.28.0",\n    "chrome": "154.0.0.0",\n    "at": "2026-10-11T12:00:00.000Z"\n  },\n';
    expect(after).toContain(block);
    expect(after.replace(block, "")).toBe(text);
    // A later release moves the record, again alone.
    const later = run(root, read(root), [["en", output("en")], ["es", output("es")]], "1.29.0");
    expect(later.verified).toBe("1.29.0");
    expect(fs.readFileSync(path.join(root, "capture.json"), "utf-8").replace(block.replace(/1\.28\.0/g, "1.29.0"), "")).toBe(text);
  });

  it("leaves the record alone on a release that is not newer", () => {
    const verified = { postext: B, postextPdf: B, chrome: "154.0.0.0", at: "2026-10-11T12:00:00.000Z" } as CaptureManifest["verified"];
    const { root, manifest } = committed({ verified });
    const before = snapshot(root);
    for (const version of [B, "1.27.1", A]) {
      const outcome = run(root, manifest, [["en", output("en")], ["es", output("es")]], version);
      expect(outcome.verified, version).toBeNull();
      expect(snapshot(root), version).toEqual(before);
    }
  });

  it("does not verify a recipe from some of its editions", () => {
    const { root, manifest } = committed();
    const before = snapshot(root);
    expect(run(root, manifest, [["en", output("en")]]).verified).toBeNull();
    expect(snapshot(root)).toEqual(before);
  });

  it("--verify lists a recipe whose files would change, and writes nothing for it", () => {
    const { root, manifest } = committed();
    const before = snapshot(root);
    const outcome = run(root, manifest, [["en", output("en", { [`${SLUG}.pdf`]: "pdf en B" })], ["es", output("es", {}, { vdtHash: "vdt-2" })]], B, { verifyOnly: true });
    expect(outcome.needs).toEqual([{ locale: "en", reasons: ["PDF"] }, { locale: "es", reasons: ["layout hash"] }]);
    expect(outcome.verified).toBeNull();
    expect(outcome.written.size).toBe(0);
    expect(snapshot(root)).toEqual(before);
  });

  it("--verify records an unchanged recipe, and on the recorded engine writes nothing at all", () => {
    const { root, manifest } = committed();
    expect(run(root, manifest, [["en", output("en")], ["es", output("es")]], B, { verifyOnly: true }).verified).toBe(B);
    const { root: other, manifest: same } = committed();
    const before = snapshot(other);
    // The tooling describes the files otherwise: a capture would update capture.json, --verify does not.
    const described = output("en");
    described.variant!.pages[0]!.alt = "Page 1, described anew";
    const outcome = run(other, same, [["en", described], ["es", output("es")]], A, { verifyOnly: true });
    expect(outcome).toMatchObject({ verified: null, manifestOnly: false, needs: [] });
    expect(snapshot(other)).toEqual(before);
    // The capture itself: capture.json alone, capturedAt and chrome staying.
    const updated = run(other, same, [["en", described], ["es", output("es")]], A);
    expect(updated.manifestOnly).toBe(true);
    expect(read(other).variants.en!.pages[0]!.alt).toBe("Page 1, described anew");
    expect(read(other)).toMatchObject({ capturedAt: same.capturedAt, chrome: same.chrome });
  });

  it("withVerified replaces an earlier record and survives a file formatted otherwise", () => {
    const first = { postext: "1.28.0", chrome: "c", at: "t1" } as NonNullable<CaptureManifest["verified"]>;
    const text = '{\n  "schemaVersion": 1,\n  "capturedAt": "2026-10-01T10:00:00.000Z",\n  "variants": {}\n}\n';
    const once = withVerified(text, first);
    expect(JSON.parse(once).verified).toEqual(first);
    const twice = withVerified(once, { ...first, postext: "1.29.0" as never, at: "t2" });
    expect(JSON.parse(twice).verified).toEqual({ postext: "1.29.0", chrome: "c", at: "t2" });
    expect(twice.match(/"verified"/g)).toHaveLength(1);
    const compact = JSON.stringify({ schemaVersion: 1, slug: "x", sourceHash: "h", engine: {}, chrome: "c", capturedAt: "t", variants: {} });
    expect(Object.keys(JSON.parse(withVerified(compact, first)))).toEqual(["schemaVersion", "slug", "sourceHash", "engine", "chrome", "capturedAt", "verified", "variants"]);
  });
});

describe("pagesDiffer: a page against its committed image (#734)", () => {
  const W = 64;
  const H = 48;
  /** A page: paper with rows of dark "text". */
  const page = () => {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ink = y % 12 >= 4 && y % 12 < 8 && x > 6 && x < W - 6 && x % 5 !== 0;
        const v = ink ? 30 : 250;
        data.set([v, v, v, 255], (y * W + x) * 4);
      }
    }
    return data;
  };

  it("keeps equal images", () => {
    expect(pagesDiffer(page(), page(), W, H)).toBe(false);
    expect(pageDifference(page(), page(), W, H)).toEqual({ worst: 0, cells: 0 });
  });

  it("keeps noise of ±6 on every edge pixel", () => {
    const a = page();
    const b = page();
    for (let y = 0; y < H; y++) {
      for (let x = 1; x < W; x++) {
        const i = (y * W + x) * 4;
        if (a[i] !== a[i - 4]) for (let c = 0; c < 3; c++) b[i + c] = a[i + c]! + ((x + y) % 2 ? 6 : -6);
      }
    }
    expect(pagesDiffer(a, b, W, H)).toBe(false);
    expect(pageDifference(a, b, W, H).worst).toBeGreaterThan(0);
    expect(pageDifference(a, b, W, H).worst).toBeLessThanOrEqual(PAGE_DIFFERENCE.max);
  });

  it("does not keep a page with a 12 × 20 px patch replaced", () => {
    const a = page();
    const b = page();
    for (let y = 10; y < 22; y++) for (let x = 20; x < 40; x++) b.set([250, 250, 250, 255], (y * W + x) * 4);
    expect(pagesDiffer(a, b, W, H)).toBe(true);
    expect(pageDifference(a, b, W, H).cells).toBeGreaterThan(0);
  });

  it("does not keep images of different sizes", () => {
    expect(pagesDiffer(page(), page().subarray(0, W * (H - 8) * 4), W, H)).toBe(true);
    expect(pagesDiffer(page(), page(), W, H - 8)).toBe(true);
  });

  it("judges a difference in one channel as it does a grey one", () => {
    const a = page();
    const b = page();
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) b[(y * W + x) * 4] = 200;
    expect(pagesDiffer(a, b, W, H)).toBe(true);
  });
});

describe("the capture dates a recipe's PDF the day it was written (#734)", () => {
  it("hands the shim `created` at 00:00 UTC, and the pen's own date wins", () => {
    expect(pdfDateOf("2026-09-26")).toBe("2026-09-26T00:00:00Z");
    expect(pdfDateOf(undefined)).toBeNull();
    expect(pdfDateOf("yesterday")).toBeNull();
    const shim = shimModules(resolveEngine("npm"), { pdfDate: pdfDateOf("2026-09-26") })["/__shim/postext-pdf.js"]!;
    expect(shim).toContain('const DATE = "2026-09-26T00:00:00Z";');
    expect(shim).toContain("const dated = DATE && options.date === undefined ? { date: DATE } : {};");
    expect(shim).toContain("real.renderToPdf(input, { ...dated, ...options, fontProvider");
    expect(shimModules(resolveEngine("npm"))["/__shim/postext-pdf.js"]).toContain("const DATE = null;");
    expect(shimModules(resolveEngine("local"), { pdfDate: "2026-09-26T00:00:00Z" })["/__shim/postext-pdf.js"]).toContain('const DATE = "2026-09-26T00:00:00Z";');
  });
});
