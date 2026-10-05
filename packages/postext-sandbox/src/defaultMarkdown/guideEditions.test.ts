import { describe, expect, it } from 'vitest';
import { DEFAULT_MARKDOWN_AR, DEFAULT_MARKDOWN_CA, DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES, DEFAULT_MARKDOWN_JA, DEFAULT_MARKDOWN_ZH_HANS } from '.';
import { sampleChapterTexts } from '../book/chapterOps';
import { DEFAULT_RESOURCE_IDS } from '../defaultResources';

const EDITIONS = { en: DEFAULT_MARKDOWN_EN, es: DEFAULT_MARKDOWN_ES, ca: DEFAULT_MARKDOWN_CA, 'zh-Hans': DEFAULT_MARKDOWN_ZH_HANS, ar: DEFAULT_MARKDOWN_AR, ja: DEFAULT_MARKDOWN_JA } as const;

// `:ref{id="…"}` in the prose is the syntax, not a reference.
const refsOf = (md: string): string[] => [...md.matchAll(/:ref\{id="([^"…]+)"/g)].map((m) => m[1]!);
const h1s = (md: string): string[] => [...md.matchAll(/^# (.+?)(?:\s*\{.*\})?$/gm)].map((m) => m[1]!.trim());
/** Han, kana and the CJK marks and full-width forms. */
const HAN = /[㐀-鿿　-〿぀-ヿ＀-￯]/;

describe('the six editions of the guide', () => {
  it('have the same chapters, headings levels and figure references', () => {
    const shape = (md: string) => ({
      chapters: sampleChapterTexts(md).length,
      h2: (md.match(/^## /gm) ?? []).length,
      refs: refsOf(md),
      directives: (md.match(/^:::[a-z]+/gm) ?? []).join(' '),
      maths: (md.match(/\$\$/g) ?? []).length,
    });
    const en = shape(DEFAULT_MARKDOWN_EN);
    expect(en.chapters).toBe(14);
    expect(shape(DEFAULT_MARKDOWN_ES)).toEqual(en);
    expect(shape(DEFAULT_MARKDOWN_CA)).toEqual(en);
    expect(shape(DEFAULT_MARKDOWN_ZH_HANS)).toEqual(en);
    expect(shape(DEFAULT_MARKDOWN_AR)).toEqual(en);
    expect(shape(DEFAULT_MARKDOWN_JA)).toEqual(en);
  });

  it('mention only resources the guide ships, the Chinese composition figure among them', () => {
    const ids = new Set<string>(Object.values(DEFAULT_RESOURCE_IDS));
    for (const md of Object.values(EDITIONS)) {
      for (const id of refsOf(md)) expect(ids.has(id), id).toBe(true);
      expect(refsOf(md)).toContain('cjk-composition');
    }
  });

  it('list each part’s chapters by their exact titles', () => {
    for (const md of Object.values(EDITIONS)) {
      const titles = h1s(md);
      const listed = [...md.matchAll(/^:::part\{[^}]*\}\n([\s\S]*?)\n:::$/gm)]
        .flatMap((m) => m[1]!.split('\n').map((l) => l.replace(/^\d+\.\s+/, '').trim()));
      expect(listed.length).toBe(11);
      for (const title of listed) expect(titles).toContain(title);
    }
  });

  it('keep braces and dollar signs out of heading attributes', () => {
    for (const md of Object.values(EDITIONS)) {
      for (const [, attrs] of md.matchAll(/^#+ .*?\{(.*)\}$/gm)) {
        for (const [, value] of attrs!.matchAll(/="([^"]*)"/g)) expect(value).not.toMatch(/[{}$]/);
      }
    }
  });

  it('set no Chinese or Japanese in the Latin and Arabic editions, whose faces have no glyphs for it', () => {
    expect(DEFAULT_MARKDOWN_EN).not.toMatch(HAN);
    expect(DEFAULT_MARKDOWN_ES).not.toMatch(HAN);
    expect(DEFAULT_MARKDOWN_CA).not.toMatch(HAN);
    expect(DEFAULT_MARKDOWN_AR).not.toMatch(HAN);
  });

  it('write the Arabic edition in Arabic, its title the Latin brand its cover sets in Fraunces', () => {
    const md = DEFAULT_MARKDOWN_AR;
    expect(md).toMatch(/^title: "Postext"$/m);
    // Every chapter title but the cover's (the brand), part title and the
    // subtitle are Arabic.
    const arabic = /\p{Script=Arabic}/u;
    for (const title of h1s(md).slice(1)) expect(title, title).toMatch(arabic);
    for (const [, title] of md.matchAll(/^:::part\{[^}]*title="([^"]*)"/gm)) expect(title, title).toMatch(arabic);
    expect(md.match(/^subtitle: "(.*)"$/m)?.[1]).toMatch(arabic);
    // No tatweel typed by hand: the engine draws the kashidas itself.
    expect(md).not.toContain('\u0640');
  });

  it('write the Chinese edition without spaces between Han and Latin and without underscore emphasis', () => {
    const prose = DEFAULT_MARKDOWN_ZH_HANS.replace(/`[^`]*`/g, 'x').replace(/\$[^$]*\$/g, 'x');
    expect(prose).not.toMatch(/[一-鿿] [A-Za-z0-9]|[A-Za-z0-9] [一-鿿]/);
    expect(prose).not.toMatch(/_[^_\s]+_/);
  });

  it('write the Japanese edition without spaces between Japanese and Latin, with `*…*` only where it sets 圏点', () => {
    const prose = DEFAULT_MARKDOWN_JA.replace(/`[^`]*`/g, 'x').replace(/\$[^$]*\$/g, 'x');
    // The engine sets the quarter em between Japanese and Latin itself.
    expect(prose).not.toMatch(/[぀-ヿ一-鿿] [A-Za-z0-9]|[A-Za-z0-9] [぀-ヿ一-鿿]/);
    expect(prose).not.toMatch(/_[^_\s]+_/);
    // `*…*` is emphasis marks in Japanese: used once, on purpose, beside the
    // ruby and the book title the same paragraph demonstrates.
    expect(prose.match(/(?<!\*)\*[^*\s][^*]*\*(?!\*)/g)).toEqual(['*ここ*']);
    expect(prose).toContain('{漢字|かん|じ}と{紅葉|もみじ}');
    expect(prose).toContain(':book[こころ]');
    // Every chapter but the Sandbox's is titled in Japanese.
    for (const title of h1s(DEFAULT_MARKDOWN_JA).slice(1)) if (title !== 'Sandbox') expect(title, title).toMatch(/[぀-ヿ一-鿿]/);
  });
});
