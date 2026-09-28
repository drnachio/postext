/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any -- loose fontkit types */
// @ts-nocheck
/* The 紅樓夢 showcase bundle (apps/web/public/presets/hongloumeng, written by
   scripts/presets/showcase/hongloumeng/build.py): what the bundle holds, read
   through the engine's own bundle reader, and a chapter of each edition laid
   out with the bundle's fonts (fontkit metrics). */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import fontkit from '../../../../postext-pdf/node_modules/@pdf-lib/fontkit/dist/fontkit.es.js';
import { buildDocument } from '../../pipeline';
import { contentOutline } from '../../pipeline/continuation';
import { readBundle } from '../../bundle/codec';
import type { VDTDocument } from '../../index';

const BUNDLE = join(__dirname, '../../../../../apps/web/public/presets/hongloumeng');
const manifest = JSON.parse(readFileSync(join(BUNDLE, 'preset.json'), 'utf8'));
const readFile = async (file: string): Promise<ArrayBuffer> => {
  const b = readFileSync(join(BUNDLE, file));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

// --- measurement with the bundle's own faces -------------------------------------------------

type Face = { weight: number; style: string; file: string };
const faces = new Map<string, Face[]>();
for (const fam of manifest.fonts as { name: string; variants: Face[] }[]) faces.set(fam.name, fam.variants);
const loaded = new Map<string, any>();
function fontFor(family: string, weight: number, italic: boolean): any {
  const variants = faces.get(family) ?? faces.get('Noto Serif SC')!;
  const style = italic ? 'italic' : 'normal';
  const pool = variants.filter((v) => v.style === style);
  const list = pool.length > 0 ? pool : variants;
  const pick = list.reduce((b, v) => (Math.abs(v.weight - weight) < Math.abs(b.weight - weight) ? v : b), list[0]!);
  let f = loaded.get(pick.file);
  if (!f) { f = fontkit.create(readFileSync(join(BUNDLE, pick.file))); loaded.set(pick.file, f); }
  return f;
}
class Ctx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    const m = /^(?:(italic|oblique)\s+)?(?:(\d{3}|bold|normal)\s+)?([\d.]+)px\s+(.+)$/.exec(this.font.trim());
    if (!m) return { width: s.length * 7 };
    const size = Number(m[3]);
    const family = m[4]!.replace(/["']/g, '').split(',')[0]!.trim();
    const font = fontFor(family, m[2] === 'bold' ? 700 : m[2] ? Number(m[2]) : 400, m[1] !== undefined);
    return { width: (font.layout(s).advanceWidth / font.unitsPerEm) * size };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): Ctx { return new Ctx(); }
};

async function open(locale: string) {
  return readBundle(manifest, readFile, { locale, measureBitmap: async () => ({ width: 800, height: 1200 }) });
}

function layout(book: Awaited<ReturnType<typeof open>>, index: number): VDTDocument {
  return buildDocument({ markdown: book.chapters[index]!.markdown, resources: book.resources }, book.config);
}

function bodyLines(doc: VDTDocument, page: number): string[] {
  return doc.pages[page]!.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines.map((l) => l.text)));
}

// --- the bundle ------------------------------------------------------------------------------

describe('hongloumeng bundle', () => {
  it('holds three editions and opens the Traditional one', () => {
    expect(manifest.locales).toEqual(['zh-Hant', 'zh-Hans', 'en']);
    expect(manifest.locale).toBe('zh-Hant');
    expect(manifest.openLocale).toBe('zh-Hant');
    expect(manifest.configVersion).toBeGreaterThanOrEqual(8);
    // 7 front-matter files, the chapters, the index and the credits.
    expect(manifest.chapters['zh-Hant']).toHaveLength(7 + 120 + 2);
    expect(manifest.chapters['zh-Hans']).toHaveLength(7 + 120 + 2);
    expect(manifest.chapters.en).toHaveLength(5 + 56 + 2);
    expect(manifest.view?.canvasScope).toBeUndefined();
  });

  it('ships every file it names, within 30 MB', () => {
    const files = [
      ...Object.values(manifest.chapters).flat().map((c: any) => c.file),
      ...manifest.resources.map((r: any) => r.file),
      ...manifest.fonts.flatMap((f: any) => f.variants.map((v: any) => v.file)),
      'CREDITS.md', 'thumbnail.jpg', 'fingerprint.json',
    ];
    for (const f of files) expect(existsSync(join(BUNDLE, f)), f).toBe(true);
    const size = (dir: string): number => readdirSync(dir, { withFileTypes: true })
      .reduce((n, e) => n + (e.isDirectory() ? size(join(dir, e.name)) : statSync(join(dir, e.name)).size), 0);
    expect(size(BUNDLE)).toBeLessThanOrEqual(30e6);
  });

  it('names an existing plate on every chapter heading', () => {
    const ids = new Set(manifest.resources.map((r: any) => r.id));
    for (const lang of ['zh-Hant', 'zh-Hans', 'en']) {
      const plates = manifest.chapters[lang]
        .map((c: any) => /\{plate="([^"]+)"/.exec(readFileSync(join(BUNDLE, c.file), 'utf8'))?.[1])
        .filter(Boolean);
      expect(plates).toHaveLength(lang === 'en' ? 56 : 120);
      for (const p of plates) expect(ids.has(p), `${lang} ${p}`).toBe(true);
    }
  });

  it('reads each edition in its own language, wording and design', async () => {
    const hans = await open('zh-Hans');
    expect(hans.locale).toBe('zh-Hans');
    expect(hans.config.locale).toBe('zh-Hans');
    expect(hans.config.bodyText.fontFamily).toBe('Noto Serif SC');
    expect(hans.config.headings.levels[0].numberingTemplate).toBe('第{1:一}回');
    expect(hans.resources.find((r) => r.id === 'plate-001')!.caption).toBe('甄士隐梦幻识通灵');

    const hant = await open('zh-TW');
    expect(hant.locale).toBe('zh-Hant');
    expect(hant.config.bodyText.fontFamily).toBe('Noto Serif TC');
    expect(hant.resources.find((r) => r.id === 'plate-001')!.caption).toBe('甄士隱夢幻識通靈');

    const en = await open('en');
    expect(en.config.locale).toBe('en');
    expect(en.config.page.height).toEqual({ value: 216, unit: 'mm' });
    expect(en.resources.find((r) => r.id === 'plate-001')!.caption).toMatch(/^Chen Shih-yin, in a vision/);
    expect(en.resources.find((r) => r.id === 'portrait-jia-tanchun')!.caption).toBe('T’an Ch’un');
  });

  it('marks the first appearance of each principal character for the index', async () => {
    for (const [lang, count, sample] of [['zh-Hans', 41, '贾宝玉'], ['zh-Hant', 41, '賈寶玉'], ['en', 40, 'Chia Pao-yü']] as const) {
      const book = await open(lang);
      const terms = new Set<string>();
      let marks = 0;
      for (const c of book.chapters) {
        for (const e of contentOutline({ markdown: c.markdown }, book.config).outline) {
          if (e.kind === 'indexMark') { marks++; terms.add(e.indexMark!.path.join('!')); }
        }
      }
      expect(terms.size, lang).toBe(count);
      expect(marks, lang).toBe(count);
      expect(terms.has(sample)).toBe(true);
      expect(book.chapters.at(-2)!.markdown).toContain(':::index');
    }
  });
});

// --- the page -------------------------------------------------------------------------------------

describe('hongloumeng pages', () => {
  it('sets the Simplified edition 28 characters by 28 lines, 第一回 on the opener', async () => {
    const book = await open('zh-Hans');
    const doc = layout(book, 7); // 第一回
    expect(JSON.stringify(doc.pages[0])).toContain('第一回');
    const page = bodyLines(doc, 1);
    expect(page).toHaveLength(28);
    const chars = (s: string) => [...s].length;
    // A justified line holds 28 characters, the first line of a paragraph 26
    // (two-em indent); the last line of a paragraph fewer.
    expect(Math.max(...page.map(chars))).toBe(28);
    expect(page.filter((l) => chars(l) >= 26).length).toBeGreaterThan(20);
  });

  it('opens an English chapter with the couplet and both of Joly’s title lines', async () => {
    const book = await open('en');
    const doc = layout(book, 5); // Chapter I, after its part page
    const opener = doc.pages.find((p) => JSON.stringify(p).includes('甄士隱夢幻識通靈'));
    expect(opener).toBeDefined();
    const json = JSON.stringify(opener);
    expect(json).toContain('CHAPTER I');
    expect(json).toContain('apprehends perception');
    expect(json).toContain('cherishes fond thoughts');
  });
});
