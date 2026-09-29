import { describe, expect, it, vi } from "vitest";
import { readKit } from "./sources.ts";

// The cjk kit block run in Node with a stubbed browser: Fontsource's API
// and stylesheets from fixtures, document.fonts as a list.

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => String(body),
});

/** A Fontsource stylesheet: one @font-face per [file, unicode-range]. */
const stylesheet = (id: string, slices: [string, string][]) =>
  slices.map(([file, range]) => `@font-face {\n  font-family: 'X';\n  src: url(./files/${id}-${file}.woff2) format('woff2');\n  unicode-range: ${range};\n}`).join("\n");

const CJK_META = { subsets: ["chinese-traditional", "latin"], weights: [400, 700], styles: ["normal"] };
const LATIN_META = { subsets: ["latin", "latin-ext"], weights: [400, 700], styles: ["normal", "italic"] };

function kitWith(fetch: Fetch) {
  const kit = readKit();
  const added: { family: string; range: string }[] = [];
  class FontFace {
    constructor(public family: string, public source: string, public descriptors: { unicodeRange: string }) {}
  }
  const document = {
    fonts: {
      add: (face: FontFace) => added.push({ family: face.family, range: face.descriptors.unicodeRange }),
      load: async () => [{}],
      check: () => true,
    },
  };
  const kitFail = vi.fn();
  const run = new Function(
    "fetch", "document", "FontFace", "kitStatus", "kitFail",
    `${kit.fonts}\n${kit.cjk}\nreturn { loadCjkFonts, cjkPdfProvider };`,
  ) as (...args: unknown[]) => { loadCjkFonts: (faces: Record<string, string[]>, text: string) => Promise<number> };
  return { ...run(vi.fn(fetch), document, FontFace, () => {}, kitFail), added, kitFail };
}

describe("kit block cjk: loadCjkFonts", () => {
  const css = stylesheet("noto-serif-tc-0", [["0-400-normal", "U+4E00-4E3F"], ["1-400-normal", "U+6B64-6B64, U+9577"]]);
  const serve = (meta: Record<string, unknown | null>): Fetch => async (url) => {
    const api = /api\.fontsource\.org\/v1\/fonts\/(.+)$/.exec(url);
    if (api) return meta[api[1]] === null ? response("", 503) : response(meta[api[1]] ?? {}, meta[api[1]] ? 200 : 404);
    if (url.includes("@fontsource/noto-serif-tc@5/400.css")) return response(css);
    return response("", 404);
  };

  it("loads the files of a CJK face and leaves Latin families to loadFonts", async () => {
    const { loadCjkFonts, added } = kitWith(serve({ "noto-serif-tc": CJK_META, newsreader: LATIN_META }));
    await loadCjkFonts({ Newsreader: ["400"], "Noto Serif TC": ["400"] }, "此一");
    expect(added.map((f) => f.family)).toEqual(["Noto Serif TC", "Noto Serif TC"]);
  });

  it("fails loudly when Fontsource does not describe a family", async () => {
    const { loadCjkFonts, kitFail, added } = kitWith(serve({ "noto-serif-tc": null }));
    await expect(loadCjkFonts({ "Noto Serif TC": ["400"] }, "此一")).rejects.toThrow(
      /api\.fontsource\.org did not describe Noto Serif TC/,
    );
    expect(kitFail).toHaveBeenCalled();
    expect(added).toEqual([]);
  });

  it("names the per-voice call when a face lacks a character of the text", async () => {
    const { loadCjkFonts } = kitWith(serve({ "noto-serif-tc": CJK_META }));
    await expect(loadCjkFonts({ "Noto Serif TC": ["400"] }, "此一媧")).rejects.toThrow(
      "Noto Serif TC 400 has no file for 媧: give each face the text it sets (loadCjkFonts({ 'Noto Serif TC': ['400'] }, text))",
    );
  });
});
