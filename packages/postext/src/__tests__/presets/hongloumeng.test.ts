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
import { extractFrontmatter } from '../../frontmatter';
import type { VDTDocument } from '../../index';

const BUNDLE = join(__dirname, '../../../../../apps/web/public/presets/hongloumeng');
const EDITORIAL = join(__dirname, '../../../../../scripts/presets/showcase/hongloumeng/editorial.py');
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

/** Each edition's config as the Sandbox opens it: the edition's top-level
 *  keys replace the base ones. */
const configOf = (lang: string): any => ({ ...manifest.config, ...(manifest.localized[lang]?.config ?? {}) });

/** The chapter (回) a chapter file holds, `null` for the front and back matter. */
const chapterNumber = (file: string): number | null => {
  const m = /\/(\d{3})-(?:hui|chapter)\.md$/.exec(file);
  return m ? Number(m[1]) : null;
};

/** Index term → chapter of its mark, for one edition. */
async function markChapters(lang: string): Promise<Map<string, number>> {
  const book = await open(lang);
  const out = new Map<string, number>();
  book.chapters.forEach((c, i) => {
    const n = chapterNumber(manifest.chapters[lang][i].file);
    for (const e of contentOutline({ markdown: c.markdown }, book.config).outline) {
      if (e.kind === 'indexMark' && n !== null) out.set(e.indexMark!.path[0]!, n);
    }
  });
  return out;
}

const DIGITS = '〇一二三四五六七八九';
/** Informal Chinese numerals, as `第{1:一}回` prints them: 十二, 一百一十九. */
function cn(n: number): string {
  if (n < 10) return DIGITS[n]!;
  if (n < 20) return '十' + (n % 10 ? DIGITS[n % 10] : '');
  if (n < 100) return DIGITS[Math.floor(n / 10)] + '十' + (n % 10 ? DIGITS[n % 10] : '');
  const rest = n % 100;
  const tens = rest === 0 ? '' : rest < 10 ? '零' + DIGITS[rest] : DIGITS[Math.floor(rest / 10)] + '十' + (rest % 10 ? DIGITS[rest % 10] : '');
  return DIGITS[Math.floor(n / 100)] + '百' + tens;
}
function roman(n: number): string {
  let out = '';
  for (const [v, r] of [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']] as const) {
    while (n >= v) { out += r; n -= v; }
  }
  return out;
}
/** A dimension in points (`em` against `emPt`). */
function toPt(d: { value: number; unit: string }, emPt: number): number {
  return d.unit === 'pt' ? d.value : d.unit === 'mm' ? (d.value * 72) / 25.4 : d.unit === 'em' ? d.value * emPt : NaN;
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
    // 120 chapters read as one novel: the Sandbox opens the whole book.
    expect(manifest.view?.canvasScope).toBe('book');
  });

  it('ships every file it names, within 32 MB', () => {
    const files = [
      ...Object.values(manifest.chapters).flat().map((c: any) => c.file),
      ...manifest.resources.map((r: any) => r.file),
      ...manifest.fonts.flatMap((f: any) => f.variants.map((v: any) => v.file)),
      'CREDITS.md', 'thumbnail.jpg', 'fingerprint.json',
    ];
    for (const f of files) expect(existsSync(join(BUNDLE, f)), f).toBe(true);
    const size = (dir: string): number => readdirSync(dir, { withFileTypes: true })
      .reduce((n, e) => n + (e.isDirectory() ? size(join(dir, e.name)) : statSync(join(dir, e.name)).size), 0);
    // The painted covers and spines (#472) take it past 30 MB.
    expect(size(BUNDLE)).toBeLessThanOrEqual(32e6);
  });

  it('names an existing plate in every chapter', () => {
    const ids = new Set(manifest.resources.map((r: any) => r.id));
    for (const lang of ['zh-Hant', 'zh-Hans', 'en']) {
      const plates = manifest.chapters[lang]
        .map((c: any) => /plate="([^"]+)"/.exec(readFileSync(join(BUNDLE, c.file), 'utf8'))?.[1])
        .filter(Boolean);
      expect(plates).toHaveLength(lang === 'en' ? 56 : 120);
      for (const p of plates) expect(ids.has(p), `${lang} ${p}`).toBe(true);
    }
    // The vertical edition sets the plate on the verso before the opener, a
    // heading of the `plate` style named by the line the plate illustrates.
    const hui1 = readFileSync(join(BUNDLE, 'chapters/zh-Hant/001-hui.md'), 'utf8');
    expect(hui1).toMatch(/^# 甄士隱夢幻識通靈 \{style="plate" plate="plate-001"\}\n\n:::pagebreak\n\n:::numbering\{format="cjk-decimal" startAt=1\}\n\n# 甄士隱夢幻識通靈 \\\\ 賈雨村風塵懷閨秀\n/m);
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

  it('marks each character in the same chapter of Joly’s text as of the Chinese one', async () => {
    // The characters as editorial.py lists them, and the ones where Joly's
    // text differs (EN_CHAPTER_DIFFERS).
    const source = readFileSync(EDITORIAL, 'utf8');
    const pairs = [...source.matchAll(/\{"hant": "([^"]+)", "hans": "[^"]+", "en": (?:None|"([^"]+)")/g)]
      .filter((m) => m[2] !== undefined)
      .map((m) => [m[1]!, m[2]!] as const);
    const block = /EN_CHAPTER_DIFFERS = \{([\s\S]*?)\n\}/.exec(source)![1]!;
    const differs = new Set([...block.matchAll(/^\s+"([^"]+)":/gm)].map((m) => m[1]!));
    expect(pairs).toHaveLength(40);
    expect([...differs].sort()).toEqual(['李紈', '紫鵑']);

    const zh = await markChapters('zh-Hant');
    const en = await markChapters('en');
    for (const [hant, english] of pairs) {
      const z = zh.get(hant);
      const e = en.get(english);
      expect(z, hant).toBeDefined();
      expect(e, english).toBeDefined();
      if (differs.has(hant)) expect(e, `${english}: listed as differing`).not.toBe(z);
      else expect(e, `${english} (${hant})`).toBe(z);
    }
    // 賈環 is Chia Huan, first named in chapter 18; Chia Huang (賈璜) of
    // chapter 10 is another man.
    expect(en.get('Chia Huan')).toBe(18);
    const joly = manifest.chapters.en.map((c: any) => readFileSync(join(BUNDLE, c.file), 'utf8')).join('\n');
    expect(joly).not.toContain(':index[Chia Huang]');
    // Joly's names with the diaeresis the transcription dropped in places.
    for (const slip of ['She Yueh', 'Hsiang-yun', 'Tai yue', 'Pao yue', 'Tzu Chuan']) expect(joly, slip).not.toContain(slip);
  });

  it('says the index points at the first mention', () => {
    const index = (lang: string) => readFileSync(join(BUNDLE, manifest.chapters[lang].at(-2).file), 'utf8');
    expect(index('zh-Hans')).toContain('首次提到');
    expect(index('zh-Hant')).toContain('首次提到');
    expect(index('en')).toContain('first mentioned');
    for (const lang of ['zh-Hans', 'zh-Hant', 'en']) expect(index(lang)).not.toMatch(/出場|出场|first appears/);
  });

  it('opens each edition with its metadata and front-matter folios, then the chapters’ folios from chapter 1', async () => {
    // The vertical edition numbers its pages in Chinese numerals: 一, 二 … in
    // the front matter, 一〇三 from 第一回; the horizontal ones in roman and
    // Arabic numerals.
    for (const [lang, title, author, front, body] of [
      ['zh-Hant', '紅樓夢', '曹雪芹', 'trad-chinese-informal', 'cjk-decimal'],
      ['zh-Hans', '红楼梦', '曹雪芹', 'lower-roman', 'decimal'],
      ['en', 'Hung Lou Meng', 'Cao Xueqin', 'lower-roman', 'decimal'],
    ] as const) {
      const book = await open(lang);
      // The base format is the chapters': a chapter the Sandbox lays out
      // before the background pagination reaches it shows their folios.
      expect(book.config.page.pageNumbering.format, lang).toBe(body);
      const first = book.chapters[0]!.markdown;
      const { metadata, content } = extractFrontmatter(first);
      expect(metadata).toMatchObject({ title, author });
      expect(content.trimStart().startsWith(`:::numbering{format="${front}" startAt=1}`), lang).toBe(true);
      const one = book.chapters.find((_, i) => chapterNumber(manifest.chapters[lang][i].file) === 1)!;
      // The vertical edition restarts on the opener, after the plate's page.
      if (lang === 'zh-Hant') expect(one.markdown).toContain(`:::pagebreak\n\n:::numbering{format="${body}" startAt=1}\n\n# `);
      else expect(one.markdown.startsWith(`:::numbering{format="${body}" startAt=1}`), lang).toBe(true);
    }
  });

  it('centres the opener’s elements on the container in the horizontal editions', () => {
    for (const lang of ['zh-Hans', 'en']) {
      const config = configOf(lang);
      const front = config.headingStyles.find((s: any) => s.id === 'front');
      for (const design of [config.headings.levels[0].advancedDesign, front.advancedDesign]) {
        const onContainer = design.slot.elements.filter((e: any) => e.placement.anchor.to === 'container');
        expect(onContainer.length, lang).toBeGreaterThan(0);
        for (const e of onContainer) expect(`${lang} ${e.id} ${e.placement.anchor.edge}`).toBe(`${lang} ${e.id} top`);
      }
    }
  });

  it('gives the zh parts no design, so no {title} slot, and ships EB Garamond bold', () => {
    for (const lang of ['zh-Hant', 'zh-Hans']) expect(configOf(lang).parts).toEqual({ page: false, design: { elements: [] } });
    const garamond = manifest.fonts.find((f: any) => f.name === 'EB Garamond').variants.map((v: any) => `${v.weight} ${v.style}`);
    expect(garamond.sort()).toEqual(['400 italic', '400 normal', '600 normal', '700 italic', '700 normal']);
  });

  it('sets the poem heads of chapter 38 as headings: the title, the author set right, kept with the poem', async () => {
    for (const lang of ['zh-Hant', 'zh-Hans']) {
      const files = manifest.chapters[lang].map((c: any) => c.file as string);
      const hui38 = readFileSync(join(BUNDLE, files.find((f: string) => f.endsWith('/038-hui.md'))!), 'utf8');
      expect(hui38.match(/^## \S+\u3000\S+ \{style="poem" title="[^"]+" by="[^"]+"\}$/gm), lang).toHaveLength(12);
      for (const f of files) expect(readFileSync(join(BUNDLE, f), 'utf8'), f).not.toMatch(/\u3000{3,}/);
      const config = configOf(lang);
      const poem = config.headingStyles.find((s: any) => s.id === 'poem');
      expect(poem).toMatchObject({ numbered: false, toc: false });
      const [title, author] = poem.advancedDesign.slot.elements;
      expect([title.content, title.align, author.content, author.align]).toEqual(['{attr.title}', 'left', '{attr.by}', 'right']);
      // Horizontal: the name at the right of the line; vertical: at the foot
      // of the column, which the flow frame's `right` is.
      expect(author.placement.anchor.edge).toBe(lang === 'zh-Hans' ? 'top-right' : 'top-left');
      expect(config.headings.keepWithNext).toBe(true);
    }
    expect(readFileSync(join(BUNDLE, 'chapters/zh-Hans/038-hui.md'), 'utf8')).toContain('## 忆菊　蘅芜君 {style="poem" title="忆菊" by="蘅芜君"}\n\n:::paragraphs{style="verse"}\n怅望西风抱闷思');
    // Laid out, each head stands on the page of its poem's first line.
    const book = await open('zh-Hans');
    const doc = layout(book, manifest.chapters['zh-Hans'].findIndex((c: any) => c.file.endsWith('/038-hui.md')));
    const heads = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.map((b, i, all) => ({ b, next: all[i + 1] }))))
      .filter(({ b }) => b.type === 'heading' && (b as any).headingStyleId === 'poem');
    expect(heads).toHaveLength(12);
    for (const { b, next } of heads) expect(next?.type, JSON.stringify((b as any).text)).toBe('paragraph');
  });

  it('sets the Traditional edition vertically and right-bound on the character grid, the others horizontally', () => {
    const hant = configOf('zh-Hant');
    expect(hant.layout.writingMode).toBe('vertical-rl');
    // `page.binding` left at auto: right for a vertical book.
    expect(hant.page.binding ?? 'auto').toBe('auto');
    expect(hant.cjk.grid).toEqual({ enabled: true, charsPerLine: 38, linesPerPage: 15 });
    expect([hant.page.width, hant.page.height]).toEqual([{ value: 148, unit: 'mm' }, { value: 210, unit: 'mm' }]);
    for (const lang of ['zh-Hans', 'en']) {
      const c = configOf(lang);
      expect(c.layout.writingMode ?? 'horizontal-tb', lang).toBe('horizontal-tb');
      // Each edition restates every key of the base config, so the grid and
      // the writing mode stay the Traditional edition's.
      expect(c.cjk, lang).toEqual({});
      for (const k of Object.keys(manifest.config)) expect(c[k], `${lang} ${k}`).toBeDefined();
    }
  });

  it('sets each plate of the vertical edition on a page of its own, out of the running heads and the contents', () => {
    const hant = configOf('zh-Hant');
    const plate = hant.headingStyles.find((s: any) => s.id === 'plate');
    expect(plate).toMatchObject({ numbered: false, toc: false, runningChapter: false, span: 'page', breakBefore: { enabled: true, parity: 'even' } });
    expect(plate.header).toEqual({ elements: [] });
    expect(plate.footer).toEqual({ elements: [] });
    expect(plate.advancedDesign.slot.elements[0]).toMatchObject({ kind: 'image', resourceId: '{attr.plate}' });
    // The opener: a recto, the left page of a right-bound spread.
    expect(hant.headings.levels[0].breakBefore).toEqual({ enabled: true, parity: 'odd' });
    const plates = manifest.chapters['zh-Hant'].filter((c: any) => /\{style="plate" plate="plate-\d{3}"\}/.test(readFileSync(join(BUNDLE, c.file), 'utf8')));
    expect(plates).toHaveLength(120);
  });

  it('sets the song titles of chapter 5 as headings kept with their songs', () => {
    for (const lang of ['zh-Hant', 'zh-Hans']) {
      const hui5 = readFileSync(join(BUNDLE, `chapters/${lang}/005-hui.md`), 'utf8');
      expect(hui5.match(/^## 【[^】]+】 \{style="song"\}$/gm), lang).toHaveLength(14);
      expect(hui5, lang).not.toContain(':::paragraphs{style="song"}');
      expect(configOf(lang).headingStyles.find((s: any) => s.id === 'song'), lang).toMatchObject({ numbered: false, toc: false });
    }
  });

  it('fits the widest chapter number in the contents’ number column', () => {
    const labels: Record<string, string[]> = {
      'zh-Hans': Array.from({ length: 120 }, (_, i) => `第${cn(i + 1)}回`),
      'zh-Hant': Array.from({ length: 120 }, (_, i) => `第${cn(i + 1)}回`),
      en: Array.from({ length: 56 }, (_, i) => roman(i + 1)),
    };
    expect(cn(119)).toBe('一百一十九');
    expect(cn(101)).toBe('一百零一');
    for (const [lang, list] of Object.entries(labels)) {
      const level = configOf(lang).toc.levels[0];
      const size = toPt(level.numberFontSize, 0);
      expect(level.numberFontWeight, lang).toBe(700);
      const font = fontFor(level.numberFontFamily, level.numberFontWeight, false);
      const widest = Math.max(...list.map((s) => (font.layout(s).advanceWidth / font.unitsPerEm) * size));
      expect(widest, `${lang}: ${list.reduce((a, b) => (a.length >= b.length ? a : b))}`).toBeLessThanOrEqual(toPt(level.numberWidth, size));
    }
  });
});

// --- the page -------------------------------------------------------------------------------------

describe('hongloumeng pages', () => {
  it('sets the Simplified edition 28 ems by 28 lines, 第一回 on the opener', async () => {
    const book = await open('zh-Hans');
    const doc = layout(book, 7); // 第一回
    expect(JSON.stringify(doc.pages[0])).toContain('第一回');
    const page = bodyLines(doc, 1);
    expect(page).toHaveLength(28);
    const chars = (s: string) => [...s].length;
    // The measure is 28 ems: a justified line of Han characters alone holds
    // 28 of them, the first line of a paragraph 26 (two-em indent). The
    // mainland's Kaiming marks take half an em inside the line (#185), so a
    // line with marks holds a few more; the last line of a paragraph fewer.
    const blocks = doc.pages[1]!.columns.flatMap((c) => c.blocks).filter((b) => b.type === 'paragraph');
    const em = Number(/(\d*\.?\d+)px/.exec(blocks[0]!.fontString)![1]);
    // (103.72 mm: 28 ems to a thousandth.)
    for (const b of blocks) expect(b.bbox.width / em).toBeCloseTo(28, 2);
    const full = blocks.flatMap((b) => b.lines.slice(0, -1).map((l) => ({ l, b })));
    expect(full.length).toBeGreaterThan(20);
    for (const { l, b } of full) expect((l.bbox.x - b.bbox.x + l.bbox.width) / em).toBeCloseTo(28, 2);
    // Han characters advance one em each, plus any justification tracking.
    const han = full.flatMap(({ l }) => l.segments ?? []).filter((g) => g.kind === 'text' && /^[\u4e00-\u9fff]+$/.test(g.text));
    expect(han.length).toBeGreaterThan(20);
    for (const g of han) expect((g.width - (g.tracking ?? 0) * chars(g.text)) / em).toBeCloseTo(chars(g.text), 6);
    expect(Math.max(...page.map(chars))).toBeGreaterThanOrEqual(28);
    expect(page.filter((l) => chars(l) >= 26).length).toBeGreaterThan(20);
  });

  it('sets the Traditional edition 38 characters down each of 15 columns, right to left', async () => {
    const book = await open('zh-Hant');
    // After an odd number of pages the chapter's first page is a verso: the
    // plate, then the opener on the recto, then the text.
    const doc = buildDocument({ markdown: book.chapters[7]!.markdown, resources: book.resources, continuation: { pageIndexOffset: 1 } }, book.config);
    expect(doc.binding).toBe('right');
    const [plate, opener, body] = doc.pages;
    expect(plate!.columns.flatMap((c) => c.blocks).map((b: any) => b.headingStyleId)).toEqual(['plate']);
    expect(JSON.stringify(opener)).toContain('第一回');
    expect(body!.flow?.writingMode).toBe('vertical-rl');
    const blocks = body!.columns.flatMap((c) => c.blocks).filter((b) => b.type === 'paragraph');
    const em = Number(/(\d*\.?\d+)px/.exec(blocks[0]!.fontString)![1]);
    // A column is 38 ems long: the flow's x runs down the page.
    for (const b of blocks) expect(b.bbox.width / em).toBeCloseTo(38, 2);
    // Fifteen columns a page (a page may end a column early, where a
    // paragraph's first line would stand alone at its foot).
    const perPage = doc.pages.slice(2).map((p) => p.columns.flatMap((c) => c.blocks).filter((b) => b.type === 'paragraph').flatMap((b) => b.lines).length);
    expect(Math.max(...perPage)).toBe(15);
    expect(perPage.filter((n) => n === 15).length).toBeGreaterThan(perPage.length / 2);
    const full = blocks.flatMap((b) => b.lines.slice(0, -1).map((l) => ({ l, b })));
    expect(full.length).toBeGreaterThan(8);
    for (const { l, b } of full) expect((l.bbox.x - b.bbox.x + l.bbox.width) / em).toBeCloseTo(38, 2);
    // Full-width Taiwan punctuation, nothing compressed: a Han character or a
    // mark is one em down the column, plus the justification tracking.
    const chars = (t: string) => [...t].length;
    const cells = full.flatMap(({ l }) => l.segments ?? []).filter((g) => g.kind === 'text' && /^[\u4e00-\u9fff，。、：；！？「」『』]+$/.test(g.text));
    expect(cells.reduce((n, g) => n + chars(g.text), 0)).toBeGreaterThan(200);
    for (const g of cells) expect((g.width - (g.tracking ?? 0) * chars(g.text)) / em).toBeCloseTo(chars(g.text), 6);
    // Columns follow one another leftwards, from the right edge of the type
    // area: their flow y grows.
    const ys = blocks.flatMap((b) => b.lines.map((l) => l.bbox.y));
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
  });

  it('opens a 回 on a recto facing its plate, a blank page first when the chapter before ends on a verso', async () => {
    const book = await open('zh-Hant');
    const five = manifest.chapters['zh-Hant'].findIndex((c: any) => c.file.endsWith('/005-hui.md'));
    // Four pages before: the chapter's first page is the fifth, a recto.
    const doc = buildDocument({ markdown: book.chapters[five]!.markdown, resources: book.resources, continuation: { pageIndexOffset: 4 } }, book.config);
    expect(doc.pages[0]!.blankForParity).toBeTruthy();
    expect(doc.pages[1]!.columns.flatMap((c) => c.blocks).map((b: any) => b.headingStyleId)).toEqual(['plate']);
    // Page 6 (a verso, the right page) holds the plate, page 7 (a recto, the
    // left page) the opener.
    const opener = doc.pages[2]!.columns.flatMap((c) => c.blocks)[0] as any;
    expect([opener.type, opener.headingLevel, opener.headingStyleId]).toEqual(['heading', 1, undefined]);
    expect(JSON.stringify(doc.pages[2]!.openerBand)).toContain('賈寶玉神遊太虛境');
    // Every song title stands on the page of its song's first line.
    const heads = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.map((b, i, all) => ({ b, next: all[i + 1] }))))
      .filter(({ b }) => b.type === 'heading' && (b as any).headingStyleId === 'song');
    expect(heads).toHaveLength(14);
    for (const { b, next } of heads) expect(next?.type, JSON.stringify((b as any).text)).toBe('paragraph');
  });

  it('sets the title page’s imprint at the foot of its last column', async () => {
    const book = await open('zh-Hant');
    const doc = layout(book, 0);
    // The cover, its blank back, then the title page, a recto.
    // The type area of the grid (the cover's page): the title page's own
    // margins narrow its type area to the colophon's columns on the verso.
    const area = doc.pages[0]!.columns[0]!.bbox;
    const page = doc.pages[2]!;
    const imprint = page.openerBand!.blocks.find((b: any) => b.kind === 'text' && b.lines[0]?.text === 'Postext') as any;
    expect(imprint).toBeDefined();
    // The last column of the type area (the flow's y grows leftwards), and
    // the word ends where the column does (the flow's x runs down).
    expect(imprint.bbox.y + imprint.bbox.height).toBeCloseTo(area.y + area.height, 1);
    // A column is 38 characters of 10.5 pt; the word's 1 pt tracking
    // trails its last letter.
    const ptPx = area.width / 38 / 10.5;
    const line = imprint.lines[0];
    expect(Math.abs(imprint.bbox.x + line.xOffset + line.width - (area.x + area.width))).toBeLessThanOrEqual(1.01 * ptPx);
  });

  it('marks every proper name of the Traditional edition note, each time and whole', () => {
    const note = readFileSync(join(BUNDLE, 'chapters/zh-Hant/000b-edition.md'), 'utf8');
    // People, places, reigns and institutions (專名號, Taiwan usage).
    const names = ['曹雪芹', '乾隆', '程偉元', '高鶚', '喬利', '光緒', '上海', '同文書局', '東京大學', '改琦', '維基文庫', '維基共享資源', '知識共享', '古騰堡計畫', '大學數字圖書館國際合作計劃', '臺灣'];
    for (const name of names) {
      const all = note.split(name).length - 1;
      const marked = note.split(`:name[${name}]`).length - 1;
      expect(all, name).toBeGreaterThan(0);
      expect(marked, name).toBe(all);
    }
    // A name is marked whole: no mark covers part of one.
    const marks = [...note.matchAll(/:name\[([^\]]+)\]/g)].map((m) => m[1]);
    for (const m of marks) expect(names, m).toContain(m);
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
