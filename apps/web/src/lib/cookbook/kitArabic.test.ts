import { describe, expect, it, vi } from "vitest";
import { readKit } from "./sources.ts";

// The arabic and book kit blocks run in Node with a stubbed browser:
// Fontsource's API from fixtures, document.fonts as a list, woff2 files as
// their URLs.

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; arrayBuffer: () => Promise<ArrayBuffer> }>;

const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  arrayBuffer: async () => new TextEncoder().encode(String(body)).buffer as ArrayBuffer,
});

const AMIRI = { subsets: ["arabic", "latin", "latin-ext"], weights: [400, 700], styles: ["normal", "italic"] };
const NASKH = { subsets: ["arabic", "latin", "latin-ext", "math", "symbols"], weights: [400, 500, 600, 700], styles: ["normal"] };
const NEWSREADER = { subsets: ["latin", "latin-ext"], weights: [400, 700], styles: ["normal", "italic"] };

/** Fontsource with these families; every woff2 file exists unless listed in `missing`. */
const serve = (meta: Record<string, unknown | null>, missing: string[] = []): Fetch => async (url) => {
  const api = /api\.fontsource\.org\/v1\/fonts\/(.+)$/.exec(url);
  if (api) return meta[api[1]] === null ? response("", 503) : response(meta[api[1]] ?? {}, meta[api[1]] ? 200 : 404);
  if (url.endsWith(".woff2")) return missing.some((m) => url.includes(m)) ? response("", 404) : response(url);
  return response("", 404);
};

function kitWith(fetch: Fetch, { failLoads = false } = {}) {
  const kit = readKit();
  const added: { family: string; source: string; weight: string; style: string; range: string }[] = [];
  class FontFace {
    constructor(public family: string, public source: string, public descriptors: { weight: string; style: string; unicodeRange: string }) {}
    async load() {
      if (failLoads) throw new Error("404");
      return this;
    }
  }
  const document = {
    fonts: {
      add: (face: FontFace) => added.push({ family: face.family, source: face.source, weight: face.descriptors.weight, style: face.descriptors.style, range: face.descriptors.unicodeRange }),
    },
  };
  const kitFail = vi.fn();
  // The PDF block's provider and decoder, stubbed: the latin file of a
  // Latin family, and the "bytes" are the file's URL.
  const fontsourceProvider = vi.fn(async (family: string) => `latin:${family}`);
  const decompressWoff2 = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
  const run = new Function(
    "fetch", "document", "FontFace", "kitStatus", "kitFail", "fontsourceProvider", "decompressWoff2",
    `${kit.fonts}\n${kit.arabic}\nreturn { loadArabicFonts, arabicPdfProvider, inArabicRange };`,
  ) as (...args: unknown[]) => {
    loadArabicFonts: (faces: Record<string, string[]>, text?: string) => Promise<number>;
    arabicPdfProvider: (family: string, weight: number, style: string, request?: { codePoints: Set<number> }) => Promise<unknown>;
    inArabicRange: (cp: number) => boolean;
  };
  return { ...run(vi.fn(fetch), document, FontFace, () => {}, kitFail, fontsourceProvider, decompressWoff2), added, kitFail, fontsourceProvider };
}

const FILES = "https://cdn.jsdelivr.net/npm/@fontsource";
const codePoints = (text: string) => ({ codePoints: new Set([...text].map((ch) => ch.codePointAt(0)!)) });

describe("kit block arabic: loadArabicFonts", () => {
  it("adds the arabic file of every listed weight of an Arabic family, and leaves Latin families alone", async () => {
    const { loadArabicFonts, added } = kitWith(serve({ amiri: AMIRI, newsreader: NEWSREADER }));
    const loaded = await loadArabicFonts({ Newsreader: ["400"], Amiri: ["400", "700", "400i"] }, "الليلة الأولى (١) 1001");
    expect(loaded).toBe(3);
    expect(added.map((f) => [f.family, f.weight, f.style, f.source])).toEqual([
      ["Amiri", "400", "normal", `url(${FILES}/amiri@5/files/amiri-arabic-400-normal.woff2) format('woff2')`],
      ["Amiri", "700", "normal", `url(${FILES}/amiri@5/files/amiri-arabic-700-normal.woff2) format('woff2')`],
      ["Amiri", "400", "italic", `url(${FILES}/amiri@5/files/amiri-arabic-400-italic.woff2) format('woff2')`],
    ]);
    // The browser takes the file for exactly the characters Fontsource
    // declares for it: the Arabic letters, harakat, Arabic-Indic digits and
    // tatweel, the joiners, not the Latin letters or digits.
    expect(added[0]!.range).toMatch(/^U\+0600-06FF,U\+0750-077F,/);
  });

  it("covers the letters, marks, digits and presentation forms, and nothing Latin", () => {
    const { inArabicRange } = kitWith(serve({}));
    for (const ch of "ابتثـًٌٍَُِّْ٠٩،؛؟ﷺ﴾ﻻ‌‍") expect([ch, inArabicRange(ch.codePointAt(0)!)]).toEqual([ch, true]);
    for (const ch of "Aa1(«é") expect([ch, inArabicRange(ch.codePointAt(0)!)]).toEqual([ch, false]);
  });

  it("fails loudly when Fontsource does not describe a family or has no arabic file", async () => {
    const silent = kitWith(serve({ amiri: null }));
    await expect(silent.loadArabicFonts({ Amiri: ["400"] }, "ب")).rejects.toThrow(/api\.fontsource\.org did not describe Amiri/);
    expect(silent.kitFail).toHaveBeenCalled();
    expect(silent.added).toEqual([]);
    const missing = kitWith(serve({ "noto-naskh-arabic": NASKH }), { failLoads: true });
    await expect(missing.loadArabicFonts({ "Noto Naskh Arabic": ["400i"] }, "ب")).rejects.toThrow(
      "Fontsource has no arabic file for Noto Naskh Arabic 400 italic",
    );
  });

  it("fails on an Arabic-script character outside the arabic files", async () => {
    const { loadArabicFonts } = kitWith(serve({ amiri: AMIRI }));
    // U+10EC5 (Arabic Extended-C) is not in Fontsource's arabic subset.
    await expect(loadArabicFonts({ Amiri: ["400"] }, "ب \u{10EC5}")).rejects.toThrow("Fontsource's arabic files have no \u{10EC5}");
  });
});

describe("kit block arabic: arabicPdfProvider", () => {
  it("hands the PDF the arabic file first, then latin, and latin-ext only for letters beyond latin", async () => {
    const { arabicPdfProvider } = kitWith(serve({ amiri: AMIRI }));
    expect(await arabicPdfProvider("Amiri", 400, "normal", codePoints("كتاب (1) ١"))).toEqual([
      `${FILES}/amiri@5/files/amiri-arabic-400-normal.woff2`,
      `${FILES}/amiri@5/files/amiri-latin-400-normal.woff2`,
    ]);
    expect(await arabicPdfProvider("Amiri", 700, "normal", codePoints("ابن البَيْطار, al-Ḥasan ibn ʿAlī"))).toEqual([
      `${FILES}/amiri@5/files/amiri-arabic-700-normal.woff2`,
      `${FILES}/amiri@5/files/amiri-latin-700-normal.woff2`,
      `${FILES}/amiri@5/files/amiri-latin-ext-700-normal.woff2`,
    ]);
  });

  it("asks only for the latin file when the face sets no Arabic, and for both when it cannot tell", async () => {
    const { arabicPdfProvider } = kitWith(serve({ amiri: AMIRI }));
    expect(await arabicPdfProvider("Amiri", 400, "normal", codePoints("Chapter 1"))).toEqual([`${FILES}/amiri@5/files/amiri-latin-400-normal.woff2`]);
    expect(await arabicPdfProvider("Amiri", 400, "normal", { codePoints: new Set() })).toEqual([
      `${FILES}/amiri@5/files/amiri-arabic-400-normal.woff2`,
      `${FILES}/amiri@5/files/amiri-latin-400-normal.woff2`,
    ]);
  });

  it("snaps to a shipped weight, falls back from a missing italic and leaves Latin families to fontsourceProvider", async () => {
    const { arabicPdfProvider, fontsourceProvider } = kitWith(serve({ "noto-naskh-arabic": NASKH, newsreader: NEWSREADER }));
    expect(await arabicPdfProvider("Noto Naskh Arabic", 800, "italic", codePoints("ب"))).toEqual([
      `${FILES}/noto-naskh-arabic@5/files/noto-naskh-arabic-arabic-700-normal.woff2`,
      `${FILES}/noto-naskh-arabic@5/files/noto-naskh-arabic-latin-700-normal.woff2`,
    ]);
    expect(await arabicPdfProvider("Newsreader", 400, "normal", codePoints("A"))).toBe("latin:Newsreader");
    expect(fontsourceProvider).toHaveBeenCalledWith("Newsreader", 400, "normal", codePoints("A"));
  });
});

describe("kit block book: showBook", () => {
  /** showBook over a stubbed viewer: two spreads, the styles it injects. */
  function showBookWith(options: { binding?: "left" | "right" }, docs: unknown = []) {
    const spreads = [{ dir: "" }, { dir: "" }];
    const styles: string[] = [];
    const pages = { dataset: {} as Record<string, string> };
    const document = {
      getElementById: (id: string) => (id === "pages" ? pages : null),
      head: { insertAdjacentHTML: (_where: string, html: string) => styles.push(html) },
      querySelectorAll: () => spreads,
    };
    const showPages = vi.fn(() => 7);
    const run = new Function("document", "showPages", `${readKit().book}\nreturn showBook;`) as (
      ...args: unknown[]
    ) => (docs: unknown, options: unknown) => number;
    const count = run(document, showPages)(docs, { title: "Book", ...options });
    return { count, dirs: spreads.map((s) => s.dir), css: styles.join("\n"), binding: pages.dataset.binding, showPages };
  }

  it("reads the binding off the document: an Arabic book's doc.binding is 'right'", () => {
    const right = showBookWith({}, { binding: "right", pages: [] });
    expect(right).toMatchObject({ count: 7, dirs: ["rtl", "rtl"], binding: "right" });
    expect(right.showPages).toHaveBeenCalledWith({ binding: "right", pages: [] }, { title: "Book" });
    // A book of chapters takes the first chapter's binding.
    expect(showBookWith({}, [{ binding: "right" }, { binding: "right" }])).toMatchObject({ dirs: ["rtl", "rtl"] });
    expect(showBookWith({}, { binding: "left" })).toMatchObject({ dirs: ["ltr", "ltr"], binding: "left" });
  });

  it("lets the caller override the binding", () => {
    expect(showBookWith({ binding: "right" }, { binding: "left" })).toMatchObject({ dirs: ["rtl", "rtl"], binding: "right" });
    expect(showBookWith({ binding: "left" }, { binding: "right" })).toMatchObject({ dirs: ["ltr", "ltr"], binding: "left" });
  });

  it("keeps the canvases of a mirrored spread ltr", () => {
    expect(showBookWith({ binding: "right" }).css).toMatch(/\.pt-spread\[dir="rtl"\] canvas\s*\{\s*direction:\s*ltr;?\s*\}/);
  });
});
