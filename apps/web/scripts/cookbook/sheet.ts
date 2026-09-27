/**
 * `--sheet <out.webp|png>`: a contact sheet for the design review gate. One
 * row per captured edition: its card (480 × 360) and its first spread, on
 * the viewer's desk colour. Composed in a blank Chrome page.
 *
 * Run by Node's type stripping: erasable TypeScript, relative `.ts` imports.
 */
import fs from "node:fs";
import path from "node:path";
import type { Browser } from "puppeteer-core";
import type { Locale } from "../../src/lib/cookbook/types.ts";

export interface SheetEntry {
  slug: string;
  variant: Locale;
  ok: boolean;
  /** card.480.webp */
  card: Buffer | null;
  /** The first spread's 240-wide strips: [verso, recto], either may be null. */
  spread: [Buffer | null, Buffer | null];
}

const dataUrl = (bytes: Buffer | null, type = "image/webp") => (bytes ? `data:${type};base64,${bytes.toString("base64")}` : null);

export async function writeSheet(browser: Browser, entries: SheetEntry[], outFile: string): Promise<{ file: string; bytes: number }> {
  const page = await browser.newPage();
  try {
    const type = /\.png$/i.test(outFile) ? "image/png" : "image/webp";
    const rows = entries.map((e) => ({
      label: `${e.slug} · ${e.variant}${e.ok ? "" : " · FAIL"}`,
      ok: e.ok,
      card: dataUrl(e.card),
      spread: e.spread.map((s) => dataUrl(s)),
    }));
    const url = await page.evaluate(
      async (list: { label: string; ok: boolean; card: string | null; spread: (string | null)[] }[], mime: string) => {
        const load = async (src: string | null) => {
          if (!src) return null;
          const img = new Image();
          img.src = src;
          await img.decode();
          return img;
        };
        const PAD = 28;
        const ROW = 360;
        const LABEL = 30;
        const WIDTH = 1180;
        const canvas = document.createElement("canvas");
        canvas.width = WIDTH;
        canvas.height = PAD + list.length * (ROW + LABEL + PAD);
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#0e1014";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        let y = PAD;
        for (const row of list) {
          ctx.fillStyle = row.ok ? "#b9bcc4" : "#e5484d";
          ctx.font = "600 15px system-ui, sans-serif";
          ctx.fillText(row.label, PAD, y + 18);
          y += LABEL;
          const card = await load(row.card);
          if (card) ctx.drawImage(card, PAD, y, 480, 360);
          let x = PAD + 480 + 40;
          const pages = await Promise.all(row.spread.map(load));
          const h = ROW - 20;
          const top = y + 10;
          for (const img of pages) {
            const w = img ? (img.naturalWidth * h) / img.naturalHeight : (h * 240) / 339;
            if (img) {
              ctx.save();
              ctx.shadowColor = "rgba(0,0,0,0.6)";
              ctx.shadowBlur = 18;
              ctx.shadowOffsetY = 8;
              ctx.fillStyle = "#fff";
              ctx.fillRect(x, top, w, h);
              ctx.restore();
              ctx.drawImage(img, x, top, w, h);
            }
            x += w;
          }
          y += ROW + PAD;
        }
        return canvas.toDataURL(mime, 0.9);
      },
      rows,
      type,
    );
    const bytes = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    const file = path.resolve(outFile);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    return { file, bytes: bytes.length };
  } finally {
    await page.close().catch(() => {});
  }
}
