import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FINGERPRINT_MAX_DEPTH,
  PRIVATE_PRESET_EXTENSIONS,
  contentTypeFor,
  extensionOf,
  fingerprintDirectory,
  resolvePresetFile,
} from "./privatePresets";

const ROOT = path.resolve("/srv/private-presets");

describe("resolvePresetFile", () => {
  it("resolves a valid nested path under the root", () => {
    expect(resolvePresetFile(ROOT, ["acme", "fonts", "Body-Regular.woff2"])).toBe(
      path.join(ROOT, "acme", "fonts", "Body-Regular.woff2"),
    );
    expect(resolvePresetFile(ROOT, ["acme", "preset.json"])).toBe(path.join(ROOT, "acme", "preset.json"));
  });

  it("accepts spaces, dots and dashes inside a segment", () => {
    expect(resolvePresetFile(ROOT, ["My Brand", "logo v2.final.svg"])).toBe(
      path.join(ROOT, "My Brand", "logo v2.final.svg"),
    );
  });

  it("resolves relative roots against the current working directory", () => {
    const resolved = resolvePresetFile("presets", ["a.json"]);
    expect(resolved).toBe(path.resolve("presets", "a.json"));
  });

  it("rejects an empty segment list", () => {
    expect(resolvePresetFile(ROOT, [])).toBeNull();
  });

  it("rejects an empty root", () => {
    expect(resolvePresetFile("", ["a.json"])).toBeNull();
  });

  it("rejects empty segments", () => {
    expect(resolvePresetFile(ROOT, ["", "a.json"])).toBeNull();
    expect(resolvePresetFile(ROOT, ["acme", ""])).toBeNull();
  });

  it("rejects `..` and `.` segments", () => {
    expect(resolvePresetFile(ROOT, ["..", "secret.json"])).toBeNull();
    expect(resolvePresetFile(ROOT, ["acme", "..", "..", "etc", "passwd.json"])).toBeNull();
    expect(resolvePresetFile(ROOT, [".", "a.json"])).toBeNull();
  });

  it("rejects dotfiles and dot-prefixed directories", () => {
    expect(resolvePresetFile(ROOT, [".env.json"])).toBeNull();
    expect(resolvePresetFile(ROOT, [".git", "config.json"])).toBeNull();
  });

  it("rejects backslashes, slashes and null bytes", () => {
    expect(resolvePresetFile(ROOT, ["acme\\..\\x.json"])).toBeNull();
    expect(resolvePresetFile(ROOT, ["acme/../x.json"])).toBeNull();
    expect(resolvePresetFile(ROOT, ["a.json\0.png"])).toBeNull();
  });

  it("rejects encoded traversal and encoded separators", () => {
    expect(resolvePresetFile(ROOT, ["%2e%2e", "secret.json"])).toBeNull();
    expect(resolvePresetFile(ROOT, ["%2E%2E%2Fsecret.json"])).toBeNull();
    expect(resolvePresetFile(ROOT, ["acme%2F..%2Fsecret.json"])).toBeNull();
    expect(resolvePresetFile(ROOT, ["acme%5C..%5Csecret.json"])).toBeNull();
    expect(resolvePresetFile(ROOT, ["a%00.json"])).toBeNull();
  });

  it("rejects malformed percent-encoding", () => {
    expect(resolvePresetFile(ROOT, ["%E0%A4%A", "a.json"])).toBeNull();
  });

  it("rejects disallowed extensions", () => {
    expect(resolvePresetFile(ROOT, ["fonts", "Body.woff"])).toBeNull();
    expect(resolvePresetFile(ROOT, ["evil.js"])).toBeNull();
    expect(resolvePresetFile(ROOT, ["page.html"])).toBeNull();
    expect(resolvePresetFile(ROOT, ["README"])).toBeNull();
    expect(resolvePresetFile(ROOT, ["trailing."])).toBeNull();
  });

  it("rejects a bare directory even if named like a file type", () => {
    // Only the last segment's extension matters; an intermediate `.json` folder is fine,
    // but a last segment without an allowed extension is not.
    expect(resolvePresetFile(ROOT, ["bundle.json", "index"])).toBeNull();
  });

  it("does not allow the root itself or its parent to be returned", () => {
    expect(resolvePresetFile(ROOT, ["a.json", ".."])).toBeNull();
  });

  it("does not let a sibling directory with the same prefix pass", () => {
    // /srv/private-presets-other/a.json must not satisfy a root of /srv/private-presets
    const resolved = resolvePresetFile(ROOT, ["a.json"]);
    expect(resolved?.startsWith(ROOT + path.sep)).toBe(true);
  });
});

describe("extensionOf", () => {
  it("returns the lower-cased extension without the dot", () => {
    expect(extensionOf("Logo.SVG")).toBe("svg");
    expect(extensionOf("archive.tar.json")).toBe("json");
  });

  it("returns an empty string for names without a usable extension", () => {
    expect(extensionOf("README")).toBe("");
    expect(extensionOf(".hidden")).toBe("");
    expect(extensionOf("trailing.")).toBe("");
  });
});

describe("contentTypeFor", () => {
  it("maps every allow-listed extension to a concrete type", () => {
    const expected: Record<(typeof PRIVATE_PRESET_EXTENSIONS)[number], string> = {
      json: "application/json",
      md: "text/markdown",
      svg: "image/svg+xml",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      otf: "font/otf",
      ttf: "font/ttf",
      woff2: "font/woff2",
    };
    for (const ext of PRIVATE_PRESET_EXTENSIONS) {
      expect(contentTypeFor(ext)).toBe(expected[ext]);
    }
  });

  it("is case-insensitive", () => {
    expect(contentTypeFor("PNG")).toBe("image/png");
  });

  it("falls back to application/octet-stream", () => {
    expect(contentTypeFor("woff")).toBe("application/octet-stream");
    expect(contentTypeFor("js")).toBe("application/octet-stream");
    expect(contentTypeFor("")).toBe("application/octet-stream");
  });
});

describe("fingerprintDirectory", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "postext-fp-"));
  });

  afterEach(async () => {
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  const write = async (rel: string, content: string) => {
    const abs = path.join(dir, rel);
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    await fs.promises.writeFile(abs, content);
  };

  it("is a 40-hex sha1 that is stable across calls", async () => {
    await write("preset.json", "{}");
    await write("resources/fig.svg", "<svg/>");
    const a = await fingerprintDirectory(dir);
    const b = await fingerprintDirectory(dir);
    expect(a.fingerprint).toMatch(/^[0-9a-f]{40}$/);
    expect(a).toEqual(b);
    expect(a.files).toBe(2);
  });

  it("hashes the sorted relative paths with mtime and size", async () => {
    await write("b.md", "bb");
    await write("sub/a.svg", "<svg/>");
    const [b, a] = await Promise.all([
      fs.promises.stat(path.join(dir, "b.md")),
      fs.promises.stat(path.join(dir, "sub/a.svg")),
    ]);
    const expected = createHash("sha1")
      .update(`b.md:${b.mtimeMs}:${b.size}\n`)
      .update(`sub/a.svg:${a.mtimeMs}:${a.size}\n`)
      .digest("hex");
    expect((await fingerprintDirectory(dir)).fingerprint).toBe(expected);
  });

  it("changes when a file's size or mtime changes", async () => {
    await write("markdown.es.md", "hola");
    const before = await fingerprintDirectory(dir);
    await write("markdown.es.md", "hola mundo");
    const bigger = await fingerprintDirectory(dir);
    expect(bigger.fingerprint).not.toBe(before.fingerprint);

    const file = path.join(dir, "markdown.es.md");
    const stat = await fs.promises.stat(file);
    await fs.promises.utimes(file, stat.atime, new Date(stat.mtimeMs + 5000));
    const touched = await fingerprintDirectory(dir);
    expect(touched.fingerprint).not.toBe(bigger.fingerprint);
    expect(touched.files).toBe(1);
  });

  it("changes when files are added, removed or renamed", async () => {
    await write("preset.json", "{}");
    const one = await fingerprintDirectory(dir);
    await write("fonts/Body.woff2", "font");
    const two = await fingerprintDirectory(dir);
    expect(two.files).toBe(2);
    expect(two.fingerprint).not.toBe(one.fingerprint);
    await fs.promises.rename(path.join(dir, "fonts/Body.woff2"), path.join(dir, "fonts/Body-Regular.woff2"));
    const renamed = await fingerprintDirectory(dir);
    expect(renamed.fingerprint).not.toBe(two.fingerprint);
    await fs.promises.rm(path.join(dir, "fonts"), { recursive: true });
    expect((await fingerprintDirectory(dir)).fingerprint).toBe(one.fingerprint);
  });

  it("ignores dotfiles, dot-directories and node_modules", async () => {
    await write("preset.json", "{}");
    const clean = await fingerprintDirectory(dir);
    await write(".DS_Store", "x");
    await write(".git/HEAD", "ref");
    await write("node_modules/pkg/index.json", "{}");
    const noisy = await fingerprintDirectory(dir);
    expect(noisy).toEqual(clean);
  });

  it("stops descending below the maximum depth", async () => {
    await write("preset.json", "{}");
    const shallow = await fingerprintDirectory(dir);
    // depth 5 (a/b/c/d/e/file) is beyond FINGERPRINT_MAX_DEPTH = 4 ...
    const deep = Array.from({ length: FINGERPRINT_MAX_DEPTH + 1 }, (_, i) => `d${i}`).join("/");
    await write(`${deep}/deep.md`, "deep");
    expect(await fingerprintDirectory(dir)).toEqual(shallow);
    // ... while depth 4 still counts.
    const edge = Array.from({ length: FINGERPRINT_MAX_DEPTH }, (_, i) => `d${i}`).join("/");
    await write(`${edge}/edge.md`, "edge");
    expect((await fingerprintDirectory(dir)).files).toBe(2);
  });

  it("returns the empty-input hash for a missing or empty directory", async () => {
    const empty = createHash("sha1").digest("hex");
    expect(await fingerprintDirectory(dir)).toEqual({ fingerprint: empty, files: 0 });
    expect(await fingerprintDirectory(path.join(dir, "nope"))).toEqual({ fingerprint: empty, files: 0 });
  });
});
