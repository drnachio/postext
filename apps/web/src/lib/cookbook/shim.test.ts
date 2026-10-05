import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SHIM_PATHS, importMapTag, resolveEngine, shimModules } from "../../../scripts/cookbook/shim.ts";
import { POSTEXT_EPUB_URL, POSTEXT_EPUB_WORKER_URL, POSTEXT_FOLIO_URL, isEngineUrl } from "./detect.ts";
import { ALLOWED_IMPORTS } from "./lint.ts";
import { REPO_DIR } from "./paths.ts";

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
    expect(importMapTag(npm)).toContain(`"${POSTEXT_EPUB_URL}":"/__shim/postext-epub.js"`);
    expect(importMapTag(npm)).toContain(`"${POSTEXT_FOLIO_URL}":"/__shim/postext-folio.js"`);
  });

  it("serve postext-epub/worker and record what its handle writes (#406)", () => {
    const npm = resolveEngine("npm");
    const shim = shimModules(npm)["/__shim/postext-epub-worker.js"];
    expect(shim).toContain(`https://esm.sh/postext-epub@${npm.postextEpub}/worker?deps=postext@${npm.postext}`);
    expect(shim).toContain("export function createEpubWorker(...args)");
    expect(shim).toContain("readEpub(bytes)");
    expect(shimModules(resolveEngine("local"))["/__shim/postext-epub-worker.js"]).toContain("'/__local/postext-epub/worker/client.js'");
    expect(importMapTag(npm)).toContain(`"${POSTEXT_EPUB_WORKER_URL}":"/__shim/postext-epub-worker.js"`);
  });
});
