import { createBundle, openBundle, openBundleZip } from "postext";
import type { PostextConfig } from "postext";
import { describe, expect, it } from "vitest";
import { editionBooks } from "../../../scripts/cookbook/editions.ts";
import type { SampleLocale } from "./types.ts";

// #1209: the capture puts a recipe's editions together as one book in
// several languages, each edition's folder getting the book in its own
// language first.

const pt = (value: number) => ({ value, unit: "pt" as const });
const EPOCH = new Date(1980, 0, 1);

async function edition(locale: string, markdown: string, config: PostextConfig, caption: string, coverMarkdown?: string): Promise<Buffer> {
  const created = await createBundle({
    id: "recipe-a", name: `Book ${locale}`, locale, chapters: [{ markdown }], config,
    ...(coverMarkdown ? { coverMarkdown } : {}),
    resources: [{ id: "fig", typeId: "figure", kind: "svg", caption, svg: { fileId: "fig.svg", width: 10, height: 10 } } as never],
    files: { "fig.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' },
    mtime: EPOCH,
  });
  return Buffer.from(created.bytes);
}

describe("editionBooks", () => {
  it("writes each edition's book with the shared settings once and reads every edition back as the pen wrote it", async () => {
    const en = await edition("en", "# One\n\nText.", { locale: "en-us", bodyText: { fontFamily: "Lora", fontSize: pt(11) } } as PostextConfig, "A figure");
    const ja = await edition("ja", "# 一\n\n本文。", { locale: "ja", bodyText: { fontFamily: "Noto Serif JP", fontSize: pt(11) } } as PostextConfig, "図");
    const order: SampleLocale[] = ["en", "ja"];
    const { books, notes } = await editionBooks(new Map([["en", en], ["ja", ja]]), order);
    const enBook = openBundleZip(new Uint8Array(books.get("en")!)).manifest as { locale: string; config: PostextConfig; localized: Record<string, { config?: unknown }> };
    expect(enBook.locale).toBe("en");
    expect(enBook.config.bodyText?.fontSize).toEqual(pt(11));
    expect(enBook.config.locale).toBeUndefined();
    expect(Object.keys(enBook.localized).sort()).toEqual(["en", "ja"]);
    const jaRead = await openBundle(books.get("ja")!);
    expect(jaRead.locale).toBe("ja");
    expect(jaRead.config.bodyText?.fontFamily).toBe("Noto Serif JP");
    const enInJa = await openBundle(books.get("ja")!, { locale: "en" });
    expect(enInJa.chapters[0]!.markdown).toBe("# One\n\nText.");
    expect(enInJa.resources[0]!.caption).toBe("A figure");
    expect(notes.get("en")).toEqual(["book in several languages: en, ja"]);
  });

  it("keeps one edition of a language and leaves a lone edition as it was", async () => {
    const config = { locale: "ar", bodyText: { fontFamily: "Amiri" } } as PostextConfig;
    const en = await edition("ar", "# كتاب", config, "شكل");
    const es = await edition("ar", "# كتاب", config, "شكل");
    const { books, notes } = await editionBooks(new Map([["en", en], ["es", es]]), ["en", "es"]);
    expect(books.get("en")!.equals(en)).toBe(true);
    expect(books.get("es")!.equals(es)).toBe(true);
    expect(notes.get("en")?.[0]).toMatch(/es left out/);
  });

  it("carries each edition's cover Markdown (#1671)", async () => {
    const cover = { background: { hex: "#16242a", model: "hex" } } as never;
    const en = await edition("en", "# One", { locale: "en-us", cover } as PostextConfig, "A", ':::frame{slot="back"}\nBlurb.\n:::');
    const es = await edition("es", "# Uno", { locale: "es", cover } as PostextConfig, "B", ':::frame{slot="back"}\nReseña.\n:::');
    const { books, notes } = await editionBooks(new Map([["en", en], ["es", es]]), ["en", "es"]);
    expect(notes.get("en")).toEqual(["book in several languages: en, es"]);
    expect((await openBundle(books.get("en")!)).coverMarkdown).toContain("Blurb.");
    expect((await openBundle(books.get("en")!, { locale: "es" })).coverMarkdown).toContain("Reseña.");
    expect((await openBundle(books.get("es")!)).coverMarkdown).toContain("Reseña.");
  });

  it("gives the same bytes when run again on the books it wrote", async () => {
    const en = await edition("en", "# One", { locale: "en-us" } as PostextConfig, "A");
    const es = await edition("es", "# Uno", { locale: "es" } as PostextConfig, "B");
    const first = await editionBooks(new Map([["en", en], ["es", es]]), ["en", "es"]);
    const again = await editionBooks(first.books, ["en", "es"]);
    expect(again.books.get("en")!.equals(first.books.get("en")!)).toBe(true);
    expect(again.books.get("es")!.equals(first.books.get("es")!)).toBe(true);
  });
});
