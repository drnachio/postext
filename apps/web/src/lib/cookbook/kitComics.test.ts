import { describe, expect, it, vi } from "vitest";
import { readKit } from "./sources.ts";

// The comics kit block run in Node with a stubbed browser: Fontsource's API
// and stylesheets from fixtures (the faces' metadata as api.fontsource.org
// served it on 2026-10-07), document.fonts as a list.

type Response = { ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> };
type Fetch = (url: string) => Promise<Response>;

const response = (body: unknown, status = 200): Response => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => String(body),
});

const COMIC_NEUE = { subsets: ["latin"], weights: [300, 400, 700], styles: ["italic", "normal"] };
const BANGERS = { subsets: ["latin", "latin-ext", "vietnamese"], weights: [400], styles: ["normal"] };
const ZEN_ANTIQUE = { subsets: ["cyrillic", "greek", "japanese", "latin", "latin-ext"], weights: [400], styles: ["normal"] };
const PLAYPEN_ARABIC = { subsets: ["arabic", "emoji", "latin", "latin-ext", "math"], weights: [100, 200, 300, 400, 500, 600, 700, 800], styles: ["normal"] };

const ZEN_CSS = [
  ["0-400-normal", "U+3041-3093"],
  ["1-400-normal", "U+5263,U+9053"],
  ["latin-400-normal", "U+0000-00FF"],
].map(([file, range]) => `@font-face {\n  src: url(./files/zen-antique-${file}.woff2) format('woff2');\n  unicode-range: ${range};\n}`).join("\n");

const serve = (meta: Record<string, unknown | null>): Fetch => async (url) => {
  const api = /api\.fontsource\.org\/v1\/fonts\/(.+)$/.exec(url);
  if (api) return meta[api[1]] === null ? response("", 503) : response(meta[api[1]] ?? {}, meta[api[1]] ? 200 : 404);
  if (url.endsWith("@fontsource/zen-antique@5/400.css")) return response(ZEN_CSS);
  return response("", 404);
};

const FILES = "https://cdn.jsdelivr.net/npm/@fontsource";

type Face = { family: string; source: string; weight: string; style: string; range: string; status: string };

/** The fonts and comics blocks (plus `blocks`, e.g. "cjk"), with `stubs`
 *  standing in for the functions of blocks left out. */
function kitWith(fetch: Fetch, { blocks = [] as string[], stubs = {} as Record<string, unknown>, loaded = [] as Face[] } = {}) {
  const kit = readKit() as Record<string, string>;
  const faces: Face[] = [...loaded];
  class FontFace {
    status = "unloaded";
    constructor(public family: string, public source: string, public descriptors: { weight: string; style: string; unicodeRange: string }) {}
  }
  const document = {
    fonts: {
      add: (face: FontFace) => faces.push({ family: face.family, source: face.source, weight: face.descriptors.weight, style: face.descriptors.style, range: face.descriptors.unicodeRange, status: "loaded" }),
      load: vi.fn(async () => [{}]),
      [Symbol.iterator]: () => faces[Symbol.iterator](),
    },
  };
  const kitFail = vi.fn();
  const names = ["fetch", "document", "FontFace", "kitStatus", "kitFail", ...Object.keys(stubs)];
  const run = new Function(
    ...names,
    `${kit.fonts}\n${blocks.map((b) => kit[b]).join("\n")}\n${kit.comics}\nreturn { loadComicFonts, comicPdfProvider, comicPanel };`,
  ) as (...args: unknown[]) => {
    loadComicFonts: (faces: Record<string, string[]>, text?: string) => Promise<number>;
    comicPdfProvider: (family: string, weight: number, style: string, request?: unknown) => Promise<unknown>;
    comicPanel: (id: string, url: string, meta?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
  const fn = run(vi.fn(fetch), document, FontFace, () => {}, kitFail, ...Object.values(stubs));
  return { ...fn, faces, added: () => faces.slice(loaded.length), kitFail, document };
}

describe("kit block comics: loadComicFonts", () => {
  it("declares the shipped file of a one-weight face for its bold and italics", async () => {
    const { loadComicFonts, added } = kitWith(serve({ bangers: BANGERS, "comic-neue": COMIC_NEUE }));
    expect(await loadComicFonts({ "Comic Neue": ["400", "700"], Bangers: ["400"] }, "KRAKOOM!")).toBe(3);
    const regular = `url(${FILES}/bangers@5/files/bangers-latin-400-normal.woff2) format('woff2')`;
    // Comic Neue ships all four; Bangers only its regular, now declared for each.
    expect(added().map((f) => [f.family, f.weight, f.style, f.source])).toEqual([
      ["Bangers", "700", "normal", regular],
      ["Bangers", "400", "italic", regular],
      ["Bangers", "700", "italic", regular],
    ]);
    expect(added()[0]!.range).toMatch(/^U\+0000-00FF,/);
  });

  it("adds the latin-ext file when the text needs it, and skips a variant already loaded", async () => {
    const loaded: Face[] = [{ family: "Bangers", source: "", weight: "700", style: "normal", range: "", status: "loaded" }];
    const { loadComicFonts, added } = kitWith(serve({ bangers: BANGERS }), { loaded });
    expect(await loadComicFonts({ Bangers: ["400"] }, "ŽUUUM")).toBe(2);
    expect(added().map((f) => [f.weight, f.style, f.source.replace(/^url\(.*\/files\/|\.woff2.*$/g, "")])).toEqual([
      ["400", "italic", "bangers-latin-400-normal"],
      ["400", "italic", "bangers-latin-ext-400-normal"],
      ["700", "italic", "bangers-latin-400-normal"],
      ["700", "italic", "bangers-latin-ext-400-normal"],
    ]);
  });

  it("takes the upright file of a face with several weights and no italic", async () => {
    const { loadComicFonts, added } = kitWith(serve({ "playpen-sans-arabic": PLAYPEN_ARABIC }), {
      stubs: { arabicRange: () => "U+0600-06FF" },
    });
    expect(await loadComicFonts({ "Playpen Sans Arabic": ["400", "700"] }, "ماذا؟ Maya!")).toBe(2);
    expect(added().map((f) => [f.weight, f.style, f.source.replace(/^url\(.*\/files\/|\.woff2.*$/g, ""), f.range.slice(0, 11)])).toEqual([
      ["400", "italic", "playpen-sans-arabic-arabic-400-normal", "U+0600-06FF"],
      ["400", "italic", "playpen-sans-arabic-latin-400-normal", "U+0000-00FF"],
      ["700", "italic", "playpen-sans-arabic-arabic-700-normal", "U+0600-06FF"],
      ["700", "italic", "playpen-sans-arabic-latin-700-normal", "U+0000-00FF"],
    ]);
  });

  it("declares every slice of a CJK face through the cjk block", async () => {
    const { loadComicFonts, added } = kitWith(serve({ "zen-antique": ZEN_ANTIQUE }), { blocks: ["cjk"] });
    expect(await loadComicFonts({ "Zen Antique": ["400"] }, "剣道だ！")).toBe(3);
    expect(added().filter((f) => f.weight === "700" && f.style === "normal").map((f) => f.range)).toEqual([
      "U+0000-00FF", "U+5263,U+9053", "U+3041-3093",
    ]);
  });

  it("fails loudly without the cjk block or Fontsource's description", async () => {
    const noCjk = kitWith(serve({ "zen-antique": ZEN_ANTIQUE }));
    await expect(noCjk.loadComicFonts({ "Zen Antique": ["400"] }, "剣")).rejects.toThrow("Zen Antique is a CJK face: list the cjk kit block");
    expect(noCjk.kitFail).toHaveBeenCalled();
    const silent = kitWith(serve({ bangers: null }));
    await expect(silent.loadComicFonts({ Bangers: ["400"] }, "POW")).rejects.toThrow(/api\.fontsource\.org did not describe Bangers/);
  });
});

describe("kit block comics: comicPdfProvider", () => {
  it("hands each face to the provider of its script", async () => {
    const stubs = {
      fontsourceProvider: vi.fn(async (family: string) => `latin:${family}`),
      cjkPdfProvider: vi.fn(async (family: string) => `cjk:${family}`),
      arabicPdfProvider: vi.fn(async (family: string) => `arabic:${family}`),
    };
    const { comicPdfProvider } = kitWith(serve({ bangers: BANGERS, "zen-antique": ZEN_ANTIQUE, "playpen-sans-arabic": PLAYPEN_ARABIC }), { stubs });
    const request = { codePoints: new Set([0x41]) };
    expect(await comicPdfProvider("Bangers", 700, "normal", request)).toBe("latin:Bangers");
    expect(stubs.fontsourceProvider).toHaveBeenCalledWith("Bangers", 700, "normal", request);
    expect(await comicPdfProvider("Zen Antique", 700, "italic", request)).toBe("cjk:Zen Antique");
    expect(await comicPdfProvider("Playpen Sans Arabic", 400, "normal", request)).toBe("arabic:Playpen Sans Arabic");
  });
});

describe("kit block comics: comicPanel", () => {
  const stubs = () => ({
    loadImage: vi.fn(async () => {}),
    imageBytes: vi.fn(() => new Uint8Array([1])),
    createImageBitmap: vi.fn(async () => ({ width: 640, height: 480, close: () => {} })),
    Blob: class {},
  });

  it("loads the picture and declares it with the manifest's safe area, anchors and avoid zones", async () => {
    const s = stubs();
    const { comicPanel } = kitWith(serve({}), { stubs: s });
    const url = "https://cdn.jsdelivr.net/gh/drnachio/postext@main/cookbook/balloon-kinds/assets/lh-arrive.jpg";
    const anchors = [{ id: "maya", x: 0.29, y: 0.52, head: { x: 0.27, y: 0.47 } }];
    const panel = await comicPanel("arrive", url, {
      file: "lh-arrive.jpg", width: 1100, height: 733, alt: "Maya walks up the path.",
      safeArea: { x: 0.2, y: 0.08, width: 0.42, height: 0.82 }, anchors, avoid: [],
    });
    expect(s.loadImage).toHaveBeenCalledWith("lh-arrive.jpg", url);
    expect(s.createImageBitmap).not.toHaveBeenCalled();
    expect(panel).toEqual({
      id: "arrive", typeId: "figure", kind: "bitmap", createdAt: 0, updatedAt: 0,
      bitmap: { fileId: "lh-arrive.jpg", format: "jpeg", width: 1100, height: 733 },
      altText: "Maya walks up the path.",
      safeArea: { x: 0.2, y: 0.08, width: 0.42, height: 0.82 },
      anchors,
    });
  });

  it("reads the size off the picture when the manifest has none", async () => {
    const s = stubs();
    const { comicPanel } = kitWith(serve({}), { stubs: s });
    const panel = await comicPanel("gull", "https://example.test/assets/sp-gull.png");
    expect(panel.bitmap).toEqual({ fileId: "sp-gull.png", format: "png", width: 640, height: 480 });
    expect(panel).not.toHaveProperty("safeArea");
  });
});
