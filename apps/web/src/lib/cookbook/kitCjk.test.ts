import { describe, expect, it, vi } from "vitest";
import { readKit } from "./sources.ts";

// The cjk kit block run in Node with a stubbed browser: Fontsource's API
// and stylesheets from fixtures, document.fonts as a list.

type Fetch = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}>;

const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => String(body),
  arrayBuffer: async () => new TextEncoder().encode(String(body)).buffer as ArrayBuffer,
});

/** A Fontsource stylesheet: one @font-face per [file, unicode-range]. */
const stylesheet = (id: string, slices: [string, string][]) =>
  slices.map(([file, range]) => `@font-face {\n  font-family: 'X';\n  src: url(./files/${id}-${file}.woff2) format('woff2');\n  unicode-range: ${range};\n}`).join("\n");

const CJK_META = { subsets: ["chinese-traditional", "latin"], weights: [400, 700], styles: ["normal"] };
const LATIN_META = { subsets: ["latin", "latin-ext"], weights: [400, 700], styles: ["normal", "italic"] };

type Kit = {
  loadCjkFonts: (faces: Record<string, string[]>, text: string, options?: { vertical?: boolean }) => Promise<number>;
  cjkPdfProvider: (family: string, weight: number, style: string, request?: { codePoints: number[] }) => Promise<unknown[]>;
};

function kitWith(fetch: Fetch, extra: Record<string, unknown> = {}) {
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
    "fetch", "document", "FontFace", "kitStatus", "kitFail", ...Object.keys(extra),
    `${kit.fonts}\n${kit.cjk}\nreturn { loadCjkFonts, cjkPdfProvider };`,
  ) as (...args: unknown[]) => Kit;
  return { ...run(vi.fn(fetch), document, FontFace, () => {}, kitFail, ...Object.values(extra)), added, kitFail };
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

describe("kit block cjk: showBook", () => {
  /** showBook over a stubbed viewer: two spreads, the styles it injects. */
  function showBookWith(binding: "left" | "right") {
    const spreads = [{ dir: "" }, { dir: "" }];
    const styles: string[] = [];
    const pages = { dataset: {} as Record<string, string> };
    const document = {
      getElementById: (id: string) => (id === "pages" ? pages : null),
      head: { insertAdjacentHTML: (_where: string, html: string) => styles.push(html) },
      querySelectorAll: () => spreads,
    };
    const run = new Function("document", "showPages", `${readKit().cjk}\nreturn showBook;`) as (
      ...args: unknown[]
    ) => (docs: unknown) => number;
    run(document, () => 7)({ binding });
    return { dirs: spreads.map((s) => s.dir), css: styles.join("\n"), binding: pages.dataset.binding };
  }

  it("lays a right-bound book's spreads right to left", () => {
    expect(showBookWith("right")).toMatchObject({ dirs: ["rtl", "rtl"], binding: "right" });
    expect(showBookWith("left")).toMatchObject({ dirs: ["ltr", "ltr"], binding: "left" });
  });

  it("keeps the canvases of a mirrored spread ltr", () => {
    // A canvas draws text in the direction its element inherits: under the
    // spread's rtl every sideways run and every bracket pair moved (Nº 081).
    expect(showBookWith("right").css).toMatch(/\.pt-spread\[dir="rtl"\] canvas\s*\{\s*direction:\s*ltr;?\s*\}/);
  });
});

// Japanese faces: Fontsource's metadata and stylesheet as they are served
// for Noto Serif JP (checked 2026-10-05). The subsets list `japanese` among
// others; the stylesheet declares about 120 numbered files by frequency,
// with lowercase ranges and no spaces, then cyrillic, vietnamese, latin-ext
// and latin, so a character in both a numbered file and latin (S, the
// space) is taken from latin, as the browser does.
const JP_META = { subsets: ["cyrillic", "japanese", "latin", "latin-ext", "vietnamese"], weights: [200, 300, 400, 500, 600, 700, 800, 900], styles: ["normal"] };
const JP_FILES: [string, string][] = [
  ["0-400-normal", "U+25ee8,U+25f23"],
  ["60-400-normal", "U+4e,U+a0,U+3000,U+300c-300d,U+4e00,U+4e0a,U+5148,U+751f,U+79c1"],
  ["118-400-normal", "U+21-22,U+2c-3b,U+41-4d,U+4f-5d"],
  ["119-400-normal", "U+20,U+2027,U+3001-3002,U+3041-307f,U+3081-308f,U+3091-3093,U+30a1-30e1,U+30fc"],
  ["latin-400-normal", "U+0000-00FF,U+2000-206F"],
];

describe("kit block cjk: Japanese faces", () => {
  const served = new Map([
    ["noto-serif-jp@5/400.css", stylesheet("noto-serif-jp", JP_FILES)],
    ["shippori-mincho-b1@5/400.css", stylesheet("shippori-mincho-b1", JP_FILES)],
  ]);
  const meta: Record<string, unknown> = {
    "noto-serif-jp": JP_META,
    "shippori-mincho-b1": { subsets: ["japanese", "latin", "latin-ext"], weights: [400, 500, 600, 700, 800], styles: ["normal"] },
    newsreader: LATIN_META,
  };
  const fetched: string[] = [];
  const serve: Fetch = async (url) => {
    fetched.push(url);
    const api = /api\.fontsource\.org\/v1\/fonts\/(.+)$/.exec(url);
    if (api) return meta[api[1]] ? response(meta[api[1]]) : response("", 404);
    for (const [path, css] of served) if (url.includes(`@fontsource/${path}`)) return response(css);
    const file = /\/files\/([\w-]+)\.woff2$/.exec(url);
    return file ? response(file[1]) : response("", 404);
  };
  const decompressWoff2 = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

  it("loads a Japanese face by its files, kana and kanji alike", async () => {
    const { loadCjkFonts, added } = kitWith(serve);
    await loadCjkFonts({ "Noto Serif JP": ["400"] }, "上　先生と私。こころ、Sensei");
    expect(added.map((f) => f.range)).toEqual(JP_FILES.map(([, range]) => range).reverse());
  });

  it("names a hentaigana no Japanese file holds", async () => {
    const { loadCjkFonts, kitFail } = kitWith(serve);
    await expect(loadCjkFonts({ "Noto Serif JP": ["400"] }, "こころ𛀁")).rejects.toThrow(
      "Noto Serif JP 400 has no file for 𛀁: give each face the text it sets (loadCjkFonts({ 'Noto Serif JP': ['400'] }, text))",
    );
    expect(kitFail).toHaveBeenCalled();
  });

  it("gives the vertical twin every file of the face", async () => {
    const twins: [string, { unicodeRange: string; weight: string }[]][] = [];
    const loadVerticalAlternates = async (family: string, faces: { unicodeRange: string; weight: string }[]) => {
      twins.push([family, faces]);
      return true;
    };
    const { loadCjkFonts } = kitWith(serve, { loadVerticalAlternates });
    await loadCjkFonts({ "Noto Serif JP": ["400"], Newsreader: ["400"] }, "「こころ」、先生。", { vertical: true });
    expect(twins.map(([family]) => family)).toEqual(["Noto Serif JP"]);
    expect(twins[0][1].map((f) => f.unicodeRange)).toEqual(JP_FILES.map(([, range]) => range).reverse());
    expect(new Set(twins[0][1].map((f) => f.weight))).toEqual(new Set(["400"]));
  });

  it("hands the PDF the files of the characters it sets, Latin from the latin file", async () => {
    const fontsourceProvider = vi.fn(async () => "latin face");
    const { cjkPdfProvider } = kitWith(serve, { decompressWoff2, fontsourceProvider });
    const files = await cjkPdfProvider("Noto Serif JP", 400, "normal", { codePoints: [..."先生とS 、"].map((ch) => ch.codePointAt(0)!) });
    expect(files).toEqual(["noto-serif-jp-latin-400-normal", "noto-serif-jp-119-400-normal", "noto-serif-jp-60-400-normal"]);
    expect(fontsourceProvider).not.toHaveBeenCalled();
    // A weight the family lacks takes the nearest; no italic, so upright.
    fetched.length = 0;
    await cjkPdfProvider("Shippori Mincho B1", 300, "italic", { codePoints: [0x3053] });
    expect(fetched.filter((url) => url.endsWith(".css"))).toEqual(["https://cdn.jsdelivr.net/npm/@fontsource/shippori-mincho-b1@5/400.css"]);
  });
});

// #466: a Latin face next to the CJK ones (the rōmaji of Nº 130, the pinyin
// of a dictionary) sets letters that are in Fontsource's latin-ext file only.
describe("kit block cjk: Latin faces in the PDF", () => {
  const meta: Record<string, unknown> = {
    newsreader: LATIN_META,
    "latin-only": { subsets: ["latin"], weights: [400], styles: ["normal"] },
  };
  const fetched: string[] = [];
  const serve = (missing: string[] = []): Fetch => async (url) => {
    fetched.push(url);
    const api = /api\.fontsource\.org\/v1\/fonts\/(.+)$/.exec(url);
    if (api) return meta[api[1]] ? response(meta[api[1]]) : response("", 404);
    const file = /\/files\/([\w-]+)\.woff2$/.exec(url);
    return file && !missing.includes(file[1]) ? response(file[1]) : response("", 404);
  };
  const decompressWoff2 = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
  const codes = (text: string) => ({ codePoints: [...text].map((ch) => ch.codePointAt(0)!) });

  it("adds the latin-ext file after latin for letters only it has", async () => {
    const fontsourceProvider = vi.fn(async () => "latin face");
    const { cjkPdfProvider } = kitWith(serve(), { decompressWoff2, fontsourceProvider });
    fetched.length = 0;
    expect(await cjkPdfProvider("Newsreader", 400, "normal", codes("Tōkyō, Rōmaji Nikki"))).toEqual([
      "latin face", "newsreader-latin-ext-400-normal",
    ]);
    expect(fontsourceProvider).toHaveBeenCalledWith("Newsreader", 400, "normal");
    // Pinyin tone marks, and a letter of Latin Extended Additional (ḥ).
    expect(await cjkPdfProvider("Newsreader", 700, "italic", codes("zhāi yǎn ḥ"))).toEqual([
      "latin face", "newsreader-latin-ext-700-italic",
    ]);
    // The nearest weight the family ships, as fontsourceProvider snaps it.
    await cjkPdfProvider("Newsreader", 600, "normal", codes("ū"));
    expect(fetched.filter((url) => url.endsWith(".woff2")).at(-1)).toMatch(/newsreader-latin-ext-700-normal\.woff2$/);
  });

  it("gives latin alone to a face that sets nothing beyond it", async () => {
    const fontsourceProvider = vi.fn(async () => "latin face");
    const { cjkPdfProvider } = kitWith(serve(), { decompressWoff2, fontsourceProvider });
    fetched.length = 0;
    // Latin-1 letters, curly quotes and dashes, and the few letters past
    // U+00FF that the latin file holds (ı Œ œ ʻ ˆ ˜).
    expect(await cjkPdfProvider("Newsreader", 400, "normal", codes("Café “déjà” — ı Œœ ʻ ˆ ˜ ô û"))).toBe("latin face");
    expect(await cjkPdfProvider("Newsreader", 400, "normal", undefined)).toBe("latin face");
    expect(fetched.some((url) => url.includes("latin-ext"))).toBe(false);
  });

  it("falls back to latin when there is no latin-ext file to add", async () => {
    const fontsourceProvider = vi.fn(async () => "latin face");
    const { cjkPdfProvider } = kitWith(serve(["newsreader-latin-ext-400-normal"]), { decompressWoff2, fontsourceProvider });
    fetched.length = 0;
    // The family ships no latin-ext: no file is asked for.
    expect(await cjkPdfProvider("Latin Only", 400, "normal", codes("Tōkyō"))).toBe("latin face");
    expect(fetched.some((url) => url.includes("latin-ext"))).toBe(false);
    // The file does not come: latin alone, and postext-pdf reports the ō.
    expect(await cjkPdfProvider("Newsreader", 400, "normal", codes("Tōkyō"))).toBe("latin face");
  });
});
