import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRIVATE_PRESET_EXTENSIONS,
  contentTypeFor,
  extensionOf,
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
