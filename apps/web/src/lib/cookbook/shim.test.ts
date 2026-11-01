import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCapture, runSandboxOnly } from "../../../scripts/cookbook/capture.ts";
import os from "node:os";
import { pathToFileURL } from "node:url";
import {
  OWN_WOFF2_SINCE, SHIM_PATHS, WAWOFF2_IMPORTS, WAWOFF2_SHIM, WOFF2_BINDING_URL, forcedConfig, importMap, importMapTag, localImports,
  releasedVersion, resolveBare, resolveEngine, rewriteBareImports, shimModules, wawoff2Shim,
} from "../../../scripts/cookbook/shim.ts";
import { scormShim } from "../../../scripts/cookbook/shim/sources.ts";
import type { ScormRecord } from "../../../scripts/cookbook/checks.ts";
import { POSTEXT_EPUB_URL, POSTEXT_EPUB_WORKER_URL, POSTEXT_FOLIO_URL, POSTEXT_SCORM_URL, isEngineUrl } from "./detect.ts";
import { ALLOWED_IMPORTS } from "./lint.ts";
import { REPO_DIR, WEB_DIR } from "./paths.ts";
import { compareSemVer } from "./validate.ts";

// The capture page's import map: every module a pen may import has a shim.

const version = (pkg: string) =>
  (JSON.parse(fs.readFileSync(path.join(REPO_DIR, "packages", pkg, "package.json"), "utf-8")) as { version: string }).version;

describe("capture shims", () => {
  it("serve every allowed import", () => {
    expect(Object.keys(SHIM_PATHS).sort()).toEqual([...ALLOWED_IMPORTS].sort());
    for (const url of ALLOWED_IMPORTS) if (url !== "https://esm.sh/postext?bundle") expect(isEngineUrl(url)).toBe(true);
  });

  it("pin postext-epub to its package version and record what it writes (#404)", () => {
    const npm = resolveEngine("npm");
    expect(npm.postextEpub).toBe(version("postext-epub"));
    expect(resolveEngine("npm@1.20.0").postextEpub).toBe(version("postext-epub"));
    const shim = shimModules(npm)["/__shim/postext-epub.js"];
    expect(shim).toContain(`https://esm.sh/postext-epub@${npm.postextEpub}?deps=postext@${npm.postext}`);
    expect(shim).toContain("export async function renderToEpub(docs, options = {})");
    expect(shim).toContain("real.readEpub(bytes)");
    expect(shimModules(resolveEngine("local"))["/__shim/postext-epub.js"]).toContain("'/__local/postext-epub/index.js'");
    expect(importMapTag()).toContain(`"${POSTEXT_EPUB_URL}":"/__shim/postext-epub.js"`);
    expect(importMapTag()).toContain(`"${POSTEXT_FOLIO_URL}":"/__shim/postext-folio.js"`);
  });

  it("serve postext-epub/worker and record what its handle writes (#406)", () => {
    const npm = resolveEngine("npm");
    const shim = shimModules(npm)["/__shim/postext-epub-worker.js"];
    expect(shim).toContain(`https://esm.sh/postext-epub@${npm.postextEpub}/worker?deps=postext@${npm.postext}`);
    expect(shim).toContain("export function createEpubWorker(...args)");
    expect(shim).toContain("readEpub(bytes)");
    expect(shimModules(resolveEngine("local"))["/__shim/postext-epub-worker.js"]).toContain("'/__local/postext-epub/worker/client.js'");
    expect(importMapTag()).toContain(`"${POSTEXT_EPUB_WORKER_URL}":"/__shim/postext-epub-worker.js"`);
  });

  it("pin postext-scorm with its postext and postext-epub peers (#1346)", () => {
    const npm = resolveEngine("npm");
    expect(npm.postextScorm).toBe(version("postext-scorm"));
    expect(releasedVersion("postext-scorm")).toBe(version("postext-scorm"));
    expect(resolveEngine("npm@1.20.0").postextScorm).toBe(version("postext-scorm"));
    const shim = shimModules(npm)["/__shim/postext-scorm.js"];
    expect(shim).toContain(`https://esm.sh/postext-scorm@${npm.postextScorm}?deps=postext@${npm.postext},postext-epub@${npm.postextEpub}`);
    expect(shim).toContain("export async function renderToScorm(docs, options = {})");
    expect(shimModules(resolveEngine("local"))["/__shim/postext-scorm.js"]).toContain("'/__local/postext-scorm/index.js'");
    expect(importMapTag()).toContain(`"${POSTEXT_SCORM_URL}":"/__shim/postext-scorm.js"`);
    expect(localImports()["postext-scorm"]).toBe("/__local/postext-scorm/index.js");
  });

  it("read a SCORM package back: manifest, version, a launch page per SCO, missing files (#1346)", async () => {
    const manifest = (version: string) => `<?xml version="1.0"?><manifest><metadata><schema>ADL SCORM</schema><schemaversion>${version}</schemaversion></metadata>
<organizations default="org"><organization identifier="org"><item identifier="item-1" identifierref="res-1"><title>A</title></item>
<item identifier="item-2" identifierref="res-2"><title>B</title></item></organization></organizations><resources>
<resource identifier="res-1" type="webcontent" adlcp:scormType="sco" href="sco-1.html"><file href="sco-1.html"/><file href="content/a.xhtml"/></resource>
<resource identifier="res-2" type="webcontent" adlcp:scormType="sco" href="sco-2.html"><file href="sco-2.html"/><file href="content/b.xhtml"/></resource>
<resource identifier="shared" type="webcontent" adlcp:scormType="asset"><file href="player/player.js"/></resource></resources></manifest>`;
    const whole = { "imsmanifest.xml": manifest("2004 4th Edition"), "sco-1.html": "<p>1</p>", "sco-2.html": "<p>2</p>",
      "content/a.xhtml": "a", "content/b.xhtml": "b", "player/player.js": "//" };
    const run = async (files: Record<string, string>, options: Record<string, unknown>) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cb-scorm-"));
      const zipFile = path.join(dir, "zip.bin");
      fs.writeFileSync(zipFile, zipOf(files));
      const recorder = path.join(dir, "recorder.mjs");
      fs.writeFileSync(recorder, "export const cb = { scorms: [] };\n");
      const real = path.join(dir, "real.mjs");
      fs.writeFileSync(real, `import fs from 'node:fs';\nexport async function renderToScorm() { return new Uint8Array(fs.readFileSync(${JSON.stringify(zipFile)})); }\n`);
      const shim = path.join(dir, "shim.mjs");
      fs.writeFileSync(shim, scormShim(pathToFileURL(real).href).replace("'/__shim/recorder.js'", `'${pathToFileURL(recorder).href}'`));
      const mod = (await import(pathToFileURL(shim).href)) as { renderToScorm: (d: unknown[], o: unknown) => Promise<Uint8Array> };
      const { cb } = (await import(pathToFileURL(recorder).href)) as { cb: { scorms: ScormRecord[] } };
      await mod.renderToScorm([], options);
      fs.rmSync(dir, { recursive: true, force: true });
      return cb.scorms[0]!;
    };
    const good = await run(whole, { version: "2004", layout: "fixed" });
    expect(good).toMatchObject({ version: "2004", layout: "fixed", manifest: true, readVersion: "2004", scos: 2, launchPages: 2, items: 2, files: 6, missing: [], error: null });
    const { "sco-2.html": _gone, "content/b.xhtml": _too, ...partial } = whole;
    const broken = await run({ ...partial, "imsmanifest.xml": manifest("1.2") }, { version: "2004", layout: "fixed" });
    expect(broken).toMatchObject({ readVersion: "1.2", scos: 2, launchPages: 1, missing: ["sco-2.html", "content/b.xhtml"] });
    const { "imsmanifest.xml": _none, ...bare } = whole;
    expect(await run(bare, { version: "1.2", layout: "reflowable" })).toMatchObject({ manifest: false, scos: 0 });
  });
});

/** A zip of `files`, each deflated, as postext-scorm writes one. */
function zipOf(files: Record<string, string>): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const data = zlib.deflateRawSync(Buffer.from(text));
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(8, 8);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(text.length, 22);
    head.writeUInt16LE(nameBytes.length, 26);
    local.push(head, nameBytes, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(text.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, dir, end]);
}

// A run can force a configuration on every build (COOKBOOK_FORCE_CONFIG):
// the paint check of #764 laid the recipes out under
// `bodyText.shapingLanguage: 'document'`, which no pen names and which is
// the default from postext 1.30 (#770); `'host'` lays them out as before.
describe("a forced configuration", () => {
  const FORCE = { bodyText: { shapingLanguage: "document" } };

  it("is the JSON object of COOKBOOK_FORCE_CONFIG, or none", () => {
    expect(forcedConfig(undefined)).toBeNull();
    expect(forcedConfig("  ")).toBeNull();
    expect(forcedConfig(JSON.stringify(FORCE))).toEqual(FORCE);
    expect(() => forcedConfig("{bodyText")).toThrow(/COOKBOOK_FORCE_CONFIG is not JSON/);
    expect(() => forcedConfig("[1]")).toThrow(/expects a JSON object/);
    expect(() => forcedConfig("3")).toThrow(/expects a JSON object/);
  });

  /** The recorder's `forced` of a run, taken out of the module's text. */
  const forcedOf = (force: Record<string, unknown> | null): ((config: unknown) => unknown) => {
    const recorder = shimModules(resolveEngine("npm"), { force })["/__shim/recorder.js"]!;
    const tail = recorder.slice(recorder.indexOf("const FORCED")).replace("export function forced", "function forced");
    return new Function(`${tail}; return forced;`)() as (config: unknown) => unknown;
  };

  it("is merged key by key over each configuration a pen builds with", () => {
    const forced = forcedOf(FORCE);
    const config = { locale: "ar", bodyText: { fontFamily: "Amiri", hyphenation: { enabled: false } } };
    expect(forced(config)).toEqual({ locale: "ar", bodyText: { fontFamily: "Amiri", hyphenation: { enabled: false }, shapingLanguage: "document" } });
    // The pen's own object is left as it is.
    expect(config.bodyText).not.toHaveProperty("shapingLanguage");
    expect(forced(undefined)).toEqual(FORCE);
    expect(forced({ bodyText: { shapingLanguage: "host" } })).toEqual(FORCE);
  });

  it("leaves a configuration as given when none is forced", () => {
    const config = { locale: "ar" };
    expect(forcedOf(null)(config)).toBe(config);
    expect(forcedOf(null)(undefined)).toBeUndefined();
  });

  it("reaches buildDocument, buildDocumentWithFonts, buildBundle and the worker client's build", () => {
    const shims = shimModules(resolveEngine("local"), { force: FORCE });
    const engine = shims["/__shim/postext.js"]!;
    expect(engine.match(/config = forced\(config\);/g)).toHaveLength(2);
    expect(engine).toContain("config: forced(options?.config ?? bundle?.config)");
    expect(shims["/__shim/postext-worker.js"]).toContain("config = forced(config);");
    expect(shims["/__shim/recorder.js"]).toContain(`const FORCED = ${JSON.stringify(FORCE)};`);
  });

  it("is never captured: a run that would write stops", async () => {
    const before = process.env.COOKBOOK_FORCE_CONFIG;
    process.env.COOKBOOK_FORCE_CONFIG = JSON.stringify(FORCE);
    try {
      await expect(runCapture({ slugs: ["no-such-recipe"] })).rejects.toThrow(/COOKBOOK_FORCE_CONFIG is set: a forced configuration is never captured/);
      await expect(runSandboxOnly({ slugs: ["no-such-recipe"] })).rejects.toThrow(/COOKBOOK_FORCE_CONFIG is set/);
    } finally {
      if (before === undefined) delete process.env.COOKBOOK_FORCE_CONFIG;
      else process.env.COOKBOOK_FORCE_CONFIG = before;
    }
  });
});

// The local engine's bare imports (#742). `tsc` keeps the specifiers of the
// source; the page resolved them through its import map, which a module
// worker does not have: `web-worker-live-editor` failed with "Worker error"
// on `--engine local`. The pen server writes them as URLs instead.

describe("the local engine's bare imports (#742)", () => {
  const imports = {
    postext: "/__local/postext/index.js",
    "postext/worker": "/__local/postext/worker/client.js",
    "postext-citeproc/register": "/__local/postext-citeproc/register.js",
    fflate: "https://esm.sh/fflate@0.8.3",
    three: "https://esm.sh/three@0.186.1",
    "three/": "https://esm.sh/three@0.186.1/",
  };

  it("resolve as an import map would", () => {
    expect(resolveBare("postext", imports)).toBe("/__local/postext/index.js");
    expect(resolveBare("postext/worker", imports)).toBe("/__local/postext/worker/client.js");
    expect(resolveBare("three/examples/jsm/postprocessing/SMAAPass.js", imports)).toBe("https://esm.sh/three@0.186.1/examples/jsm/postprocessing/SMAAPass.js");
    // No entry, relative, absolute, a URL: not the server's to resolve.
    expect(resolveBare("postext/word", imports)).toBeNull();
    expect(resolveBare("./layout.js", imports)).toBeNull();
    expect(resolveBare("../measure/rich.js", imports)).toBeNull();
    expect(resolveBare("/__shim/recorder.js", imports)).toBeNull();
    expect(resolveBare("https://esm.sh/postext", imports)).toBeNull();
    expect(resolveBare("node:fs", imports)).toBeNull();
  });

  it("are written as URLs in every import form, and nothing else is touched", () => {
    const source = [
      "import { unzipSync, zipSync } from 'fflate';",
      'import * as THREE from "three";',
      "import {\n  buildDocument,\n  type Ignored,\n} from 'postext';",
      "export { createLayoutWorker } from 'postext/worker';",
      "export * from 'postext';",
      "import 'fflate';",
      "import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';",
      "import { pipeline } from './pipeline.js';",
      "import { rich } from '../measure/rich';",
      "import { known } from 'not-in-the-map';",
      "const hook = () => import('postext-citeproc/register').catch(() => null);",
      'const lazy = await import("fflate");',
      "const other = import(name);",
      "const from = Array.from('abc');",
    ].join("\n");
    expect(rewriteBareImports(source, imports).split("\n")).toEqual([
      "import { unzipSync, zipSync } from 'https://esm.sh/fflate@0.8.3';",
      'import * as THREE from "https://esm.sh/three@0.186.1";',
      "import {",
      "  buildDocument,",
      "  type Ignored,",
      "} from '/__local/postext/index.js';",
      "export { createLayoutWorker } from '/__local/postext/worker/client.js';",
      "export * from '/__local/postext/index.js';",
      "import 'https://esm.sh/fflate@0.8.3';",
      "import { SMAAPass } from 'https://esm.sh/three@0.186.1/examples/jsm/postprocessing/SMAAPass.js';",
      "import { pipeline } from './pipeline.js';",
      "import { rich } from '../measure/rich';",
      "import { known } from 'not-in-the-map';",
      "const hook = () => import('/__local/postext-citeproc/register.js').catch(() => null);",
      'const lazy = await import("https://esm.sh/fflate@0.8.3");',
      "const other = import(name);",
      "const from = Array.from('abc');",
    ]);
  });

  it("cover what the built packages import, at the installed versions", () => {
    const map = localImports();
    for (const name of ["postext", "postext/bundle", "postext/worker", "postext-pdf", "postext-citeproc/register", "postext-epub", "postext-folio"]) {
      expect(map[name], name).toMatch(/^\/__local\/postext[\w-]*\/.+\.js$/);
    }
    for (const name of ["@chenglou/pretext", "fflate", "gray-matter", "hypher", "hyphenation.es", "pdf-lib", "citeproc", "three"]) {
      expect(map[name], name).toMatch(/^https:\/\/esm\.sh\/.+@\d+\.\d+\.\d+/);
    }
    // The layout worker's own source: every bare import it has resolves.
    const worker = fs.readFileSync(path.join(REPO_DIR, "packages", "postext", "src", "worker", "layout.worker.ts"), "utf-8");
    for (const [, specifier] of worker.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) {
      if (!specifier!.startsWith(".")) expect(resolveBare(specifier!, map), specifier).not.toBeNull();
    }
  });

  it("are no longer the page's business: the import map holds the pen's own imports only", () => {
    const map = JSON.parse(/<script type="importmap">(.+)<\/script>/.exec(importMapTag())![1]!) as { imports: Record<string, string> };
    // The pen's imports, and wawoff2 as esm.sh's postext-pdf before 1.50 imports it (#1093).
    expect(map.imports).toEqual({ ...SHIM_PATHS, ...Object.fromEntries(WAWOFF2_IMPORTS.map((url) => [url, WAWOFF2_SHIM])) });
    // Left over from #384: postext-pdf loads harfbuzz.wasm with its own binding.
    expect(localImports().harfbuzzjs).toBeUndefined();
    expect(importMapTag()).not.toContain("harfbuzzjs");
  });
});

// postext-pdf up to 1.49 decodes WOFF2 through esm.sh's wawoff2, whose
// decoder never answers in a page since esm.sh's `process` polyfill
// stopped naming a Node version (#1092): a pen run on such a release
// waited for its PDF until C14 gave up. The capture page's import map
// sends that module to a shim over the decoder postext-pdf 1.50 ships
// (#1093), so a recipe keeps its pinned engine and its layout.

/** Every postext-pdf a recipe pins or was captured with, oldest first. */
function postextPdfVersionsInUse(): string[] {
  const versions = new Set<string>();
  for (const slug of fs.readdirSync(path.join(REPO_DIR, "cookbook"))) {
    const recipe = path.join(REPO_DIR, "cookbook", slug, "recipe.json");
    if (fs.existsSync(recipe)) {
      const pinned = (JSON.parse(fs.readFileSync(recipe, "utf-8")) as { engine?: { postextPdf?: string } }).engine?.postextPdf;
      if (pinned) versions.add(pinned);
    }
    const capture = path.join(WEB_DIR, "public", "cookbook", slug, "capture.json");
    if (fs.existsSync(capture)) {
      const captured = (JSON.parse(fs.readFileSync(capture, "utf-8")) as { engine?: { postextPdf?: string } }).engine?.postextPdf;
      if (captured) versions.add(captured);
    }
  }
  return [...versions].sort(compareSemVer);
}

describe("WOFF2 for a postext-pdf before 1.50 (#1093)", () => {
  it("maps esm.sh's wawoff2 module, as the browser resolves it from a postext-pdf module, to the shim", () => {
    const map = importMap();
    for (const url of WAWOFF2_IMPORTS) expect(map[url]).toBe(WAWOFF2_SHIM);
    // esm.sh writes the import as a root-relative path; the browser resolves
    // it with the caret percent-encoded and parses the map's key the same way.
    const resolved = new URL("/wawoff2@^2.0.1?target=es2022", "https://esm.sh/postext-pdf@1.49.0/es2022/dist/pdf-backend/fonts.mjs").href;
    expect(WAWOFF2_IMPORTS.map((url) => new URL(url).href)).toContain(resolved);
  });

  it("serves the shim on every engine, over the binding of the first release that has one", () => {
    for (const spec of ["npm", "npm@1.34.0", "npm@1.49.0", "local"]) {
      const shim = shimModules(resolveEngine(spec))[WAWOFF2_SHIM];
      expect(shim, spec).toBe(wawoff2Shim());
    }
    expect(wawoff2Shim()).toContain(`import instantiateWoff2 from '${WOFF2_BINDING_URL}'`);
    expect(WOFF2_BINDING_URL).toBe(`https://esm.sh/postext-pdf@${OWN_WOFF2_SINCE}/dist/woff2Binding.js`);
    // The released postext-pdf decodes WOFF2 itself: a default run never needs the shim.
    expect(compareSemVer(releasedVersion("postext-pdf"), OWN_WOFF2_SINCE)).toBeGreaterThanOrEqual(0);
  });

  it("is needed: recipes pin or were captured with postext-pdf before 1.50", () => {
    const older = postextPdfVersionsInUse().filter((v) => compareSemVer(v, OWN_WOFF2_SINCE) < 0);
    expect(older.length).toBeGreaterThan(0);
  });

  // The shim's module, run as postext-pdf up to 1.49 calls wawoff2, over the
  // binding the workspace builds (the same file 1.50 published).
  const binding = path.join(REPO_DIR, "packages", "postext-pdf", "dist", "woff2Binding.js");
  it.runIf(fs.existsSync(binding))("decodes a WOFF2 face as wawoff2's decompress did", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cb-wawoff2-"));
    try {
      const file = path.join(dir, "wawoff2.mjs");
      fs.writeFileSync(file, wawoff2Shim(pathToFileURL(binding).href));
      const mod = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as { decompress: (b: Uint8Array) => Promise<Uint8Array> };
      const woff2 = new Uint8Array(fs.readFileSync(path.join(WEB_DIR, "public", "fonts", "inter-bold.woff2")));
      expect(String.fromCharCode(...woff2.slice(0, 4))).toBe("wOF2");
      const sfnt = await mod.decompress(woff2);
      expect([[0, 1, 0, 0].join(), "79,84,84,79"]).toContain(Array.from(sfnt.slice(0, 4)).join());
      expect(sfnt.length).toBeGreaterThan(woff2.length);
      await expect(mod.decompress(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/WOFF2 decoder/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  // On the network (COOKBOOK_ESM_CHECK=1): every postext-pdf in use, as
  // esm.sh builds it for the capture page, imports wawoff2 only at a URL
  // the import map sends to the shim. A new esm.sh build that imported it
  // otherwise would hang the PDFs again; this says so before a capture does.
  it.runIf(process.env.COOKBOOK_ESM_CHECK === "1")("covers every wawoff2 import of esm.sh's builds of the versions in use", async () => {
    const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";
    const IMPORT = /\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;
    const mapped = WAWOFF2_IMPORTS.map((url) => new URL(url).href);
    const older = postextPdfVersionsInUse().filter((v) => compareSemVer(v, OWN_WOFF2_SINCE) < 0);
    for (const v of older) {
      const seen = new Set<string>();
      const found: string[] = [];
      const queue = [`https://esm.sh/postext-pdf@${v}?deps=postext@${v}`];
      while (queue.length) {
        const url = queue.shift()!;
        if (seen.has(url)) continue;
        seen.add(url);
        if (url.includes("wawoff2")) {
          found.push(url);
          continue;
        }
        if (!url.includes("postext-pdf")) continue;
        const text = await (await fetch(url, { headers: { "user-agent": UA } })).text();
        for (const m of text.matchAll(IMPORT)) {
          const specifier = m[1] ?? m[2] ?? m[3]!;
          if (/^[./]|^https?:/.test(specifier)) queue.push(new URL(specifier, url).href);
        }
      }
      expect(found.length, v).toBeGreaterThan(0);
      for (const url of found) expect(mapped, `${v}: ${url}`).toContain(url);
    }
  }, 600_000);
});
