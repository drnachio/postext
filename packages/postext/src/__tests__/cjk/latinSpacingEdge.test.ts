import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { createMeasurementCache } from '../../measure/index.js';
import { cjkCompositionKey, cjkCompositionOf } from '../../measure/cjk/cjkPunctuation.js';
import { cjkRegionOfConfig, defaultCjkLatinSpacingEdge, resolveCjkConfig, stripCjkDefaults } from '../../defaults/text/cjk.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import type { CjkConfig, PostextConfig } from '../../types.js';
import type { VDTDocument, VDTLine } from '../../vdt.js';
import { installSizedStub } from '../vertical/stub.js';

// #721: in the Japan region a Western word takes the quarter em (四分アキ,
// JLReq §3.2.6) on a side that ends in a bracket or a sign, as on a side
// that ends in a letter: `normalize()関数` is set like `abc関数`. Chinese
// text keeps clreq's rule, the space next to a letter or a digit only.
// The stub measures kana and kanji one em (20 px), Latin half an em, a
// space a quarter.
installSizedStub();

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (locale: string, cjk: CjkConfig = {}, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  locale,
  page: { width: pt(30 * 20 + 40), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(20), lineHeight: pt(30), textAlign: 'left', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  cjk,
  ...extra,
});
const paragraphLines = (doc: VDTDocument): VDTLine[] => doc.blocks.filter((b) => b.type === 'paragraph').flatMap((b) => b.lines);
const build = (md: string, locale: string, cjk: CjkConfig = {}, extra: Partial<PostextConfig> = {}): VDTDocument =>
  buildDocument({ markdown: md }, config(locale, cjk, extra), createMeasurementCache());
/** A line as its segments: `·` a Han–Latin space, `␣` a word space, else
 *  the text, consecutive text segments joined. */
function shape(line: VDTLine): string {
  let out = '';
  for (const s of line.segments ?? []) out += s.kind === 'space' ? (s.autospace ? '·' : '␣') : s.text;
  return out;
}
const first = (md: string, locale: string, cjk: CjkConfig = {}): string => shape(paragraphLines(build(md, locale, cjk))[0]!);
const width = (md: string, locale: string, cjk: CjkConfig = {}): number =>
  paragraphLines(build(md, locale, cjk))[0]!.segments!.reduce((w, s) => w + s.width, 0);

// The reproduction of the issue: how each line is set under `'letters'`
// (1.27, and Chinese text) and under `'western'` (Japanese text).
const ROWS: [string, string, string][] = [
  ['この関数abc関数です', 'この関数·abc·関数です', 'この関数·abc·関数です'],
  ['このnormalize()関数です', 'この·normalize()関数です', 'この·normalize()·関数です'],
  ['この`normalize()`関数です', 'この·normalize()関数です', 'この·normalize()·関数です'],
  ['この(abc)関数です', 'この(abc)関数です', 'この·(abc)·関数です'],
  ['このA+関数です', 'この·A+関数です', 'この·A+·関数です'],
  ['この100%関数です', 'この·100%関数です', 'この·100%·関数です'],
  ['価格は$100です', '価格は$100·です', '価格は·$100·です'],
  ['これはC++です', 'これは·C++です', 'これは·C++·です'],
  ['関数"abc"関数', '関数"abc"関数', '関数·"abc"·関数'],
  ['この normalize() 関数です', 'この·normalize()␣関数です', 'この·normalize()·関数です'],
  // A bracket or a sign with no letter or digit in its word: Japanese context.
  ['関数(かんすう)は', '関数(かんすう)は', '関数(かんすう)は'],
  ['今日は!です', '今日は!です', '今日は!です'],
  // Japanese brackets and marks: none next to them, as before.
  ['関数（abc）関数', '関数（abc）関数', '関数（abc）関数'],
  ['関数「abc」関数', '関数「abc」関数', '関数「abc」関数'],
  ['関数abc、関数', '関数·abc、関数', '関数·abc、関数'],
];

describe('the Han–Latin space next to a bracket or a sign (cjk.latinSpacingEdge, #721)', () => {
  it('Japanese text sets it on any side of a Western word that holds a letter or a digit', () => {
    for (const [md, , western] of ROWS) expect(first(md, 'ja'), md).toBe(western);
  });

  it('Chinese text keeps the space next to a letter or a digit only', () => {
    for (const locale of ['zh-Hans', 'zh-Hant']) {
      for (const [md, letters] of ROWS) expect(first(md, locale), `${locale} ${md}`).toBe(letters);
    }
  });

  it("'letters' in a Japanese document gives the lines of 1.27, 'western' in a Chinese one the new rule", () => {
    for (const [md, letters, western] of ROWS) {
      expect(first(md, 'ja', { latinSpacingEdge: 'letters' }), md).toBe(letters);
      expect(first(md, 'zh-Hans', { latinSpacingEdge: 'western' }), md).toBe(western);
    }
  });

  it('the space is a quarter em on each side, and the word is no wider', () => {
    // この (40) · (5) normalize() (110) · (5) 関数です (80)
    expect(width('このnormalize()関数です', 'ja')).toBeCloseTo(240, 6);
    expect(width('このnormalize()関数です', 'ja', { latinSpacingEdge: 'letters' })).toBeCloseTo(235, 6);
    for (const md of ['この(abc)関数です', 'このA+関数です', 'この100%関数です']) {
      const spaces = paragraphLines(build(md, 'ja'))[0]!.segments!.filter((s) => s.kind === 'space');
      expect(spaces.map((s) => [s.autospace, s.width]), md).toEqual([[true, 5], [true, 5]]);
    }
  });

  it('a space typed there is replaced, so the two spellings set alike', () => {
    expect(width('この normalize() 関数です', 'ja')).toBeCloseTo(width('このnormalize()関数です', 'ja'), 6);
    expect(first('この normalize() 関数です', 'ja')).toBe(first('このnormalize()関数です', 'ja'));
  });

  it('a mark that binds across the edge keeps its side solid', () => {
    // An opening bracket or a prefix sign that ends the word…
    expect(first('これはabc(関数です', 'ja')).toBe('これは·abc(関数です');
    expect(first('価格はUS$百です', 'ja')).toBe('価格は·US$百です');
    // …and a closing bracket, a pause, a stop or a postfix sign that opens it.
    expect(first('関数)abcです', 'ja')).toBe('関数)abc·です');
    expect(first('関数,abcです', 'ja')).toBe('関数,abc·です');
    expect(first('関数.abcです', 'ja')).toBe('関数.abc·です');
    expect(first('五%offです', 'ja')).toBe('五%off·です');
  });

  it('a bracket alone, a no-break space and a note marker take none', () => {
    expect(first('関数(は', 'ja')).toBe('関数(は');
    expect(first('関数)は', 'ja')).toBe('関数)は');
    expect(first('関数+関数', 'ja')).toBe('関数+関数');
    expect(first('関数abc 関数', 'ja')).toBe('関数·abc 関数');
  });

  it('sets none at a line start or a line end', () => {
    // Thirty characters to the line: the word opens the second line.
    const opens = paragraphLines(build(`${'あ'.repeat(30)}(abc)関数です`, 'ja'));
    expect(opens.map(shape)).toEqual(['あ'.repeat(30), '(abc)·関数です']);
    // 27 characters, the space and the word (50 px) fill 595 px; the space
    // after it goes at the line end.
    const ends = paragraphLines(build(`${'あ'.repeat(27)}(abc)関数です`, 'ja'));
    expect(ends.map(shape)[1]).toBe('関数です');
    expect(ends[0]!.segments!.filter((s) => s.kind === 'space' && s.autospace && s.width > 0).length).toBeLessThanOrEqual(2);
    const drawn = ends[0]!.segments!.reduce((w, s) => w + s.width, 0);
    expect(drawn).toBeLessThanOrEqual(600 + 1e-6);
  });

  it('holds in vertical text', () => {
    const vertical = { layout: { layoutType: 'single' as const, writingMode: 'vertical-rl' as const }, page: { width: pt(400), height: pt(30 * 20 + 40), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } } };
    const line = paragraphLines(build('このnormalize()関数です', 'ja', {}, vertical))[0]!;
    expect(shape(line)).toBe('この·normalize()·関数です');
    const letters = paragraphLines(build('このnormalize()関数です', 'ja', { latinSpacingEdge: 'letters' }, vertical))[0]!;
    expect(shape(letters)).toBe('この·normalize()関数です');
  });

  it('the copied text holds no added space', () => {
    const doc = build('このnormalize()関数です', 'ja');
    expect(paragraphLines(doc)[0]!.text).toBe('このnormalize()関数です');
    for (const s of paragraphLines(doc)[0]!.segments!.filter((x) => x.kind === 'space')) expect(s.text).toBe('');
  });
});

describe('cjk.latinSpacingEdge: the setting', () => {
  it('auto follows the region', () => {
    expect(defaultCjkLatinSpacingEdge('japan')).toBe('western');
    for (const region of ['mainland', 'taiwan', 'hongkong'] as const) expect(defaultCjkLatinSpacingEdge(region)).toBe('letters');
    expect(resolveCjkConfig({}, 'ja').latinSpacingEdge).toBe('western');
    expect(resolveCjkConfig({ latinSpacingEdge: 'auto' }, 'ja').latinSpacingEdge).toBe('western');
    expect(resolveCjkConfig({}, 'zh-Hans').latinSpacingEdge).toBe('letters');
    expect(resolveCjkConfig({}, 'en').latinSpacingEdge).toBe('letters');
    expect(resolveCjkConfig({ region: 'japan' }, 'zh-Hant').latinSpacingEdge).toBe('western');
    expect(resolveCjkConfig({ region: 'taiwan' }, 'ja').latinSpacingEdge).toBe('letters');
    // An explicit value wins in any region; an unknown one reads as auto.
    expect(resolveCjkConfig({ latinSpacingEdge: 'letters' }, 'ja').latinSpacingEdge).toBe('letters');
    expect(resolveCjkConfig({ latinSpacingEdge: 'western' }, 'zh-Hans').latinSpacingEdge).toBe('western');
    expect(resolveCjkConfig({ latinSpacingEdge: 'all' as never }, 'ja').latinSpacingEdge).toBe('western');
    expect(resolveCjkConfig({ latinSpacingEdge: 'all' as never }, 'zh-Hans').latinSpacingEdge).toBe('letters');
  });

  it('the strip drops auto and keeps a value, also where it restates the region', () => {
    expect(stripCjkDefaults({ latinSpacingEdge: 'auto' })).toBeUndefined();
    expect(stripCjkDefaults({ latinSpacingEdge: 'letters' })).toEqual({ latinSpacingEdge: 'letters' });
    expect(stripCjkDefaults({ latinSpacingEdge: 'western' })).toEqual({ latinSpacingEdge: 'western' });
    for (const [locale, value] of [['ja', 'western'], ['ja', 'letters'], ['zh-Hans', 'letters'], ['zh-Hans', 'western']] as const) {
      const full: PostextConfig = { locale, cjk: { latinSpacingEdge: value } };
      expect(stripConfigDefaults(full)).toEqual(full);
      expect(resolveAllConfig(stripConfigDefaults(full)).cjk.latinSpacingEdge).toBe(value);
    }
  });

  it('joins the composition key only under the Western rule', () => {
    const key = (cjk: CjkConfig, locale: string): string => cjkCompositionKey(cjkCompositionOf(resolveCjkConfig(cjk, locale), 72, locale));
    expect(cjkCompositionOf(resolveCjkConfig({}, 'zh-Hans'), 72, 'zh-Hans').latinSpacingEdge).toBeUndefined();
    expect(key({}, 'zh-Hans')).toBe('mainland:kaiming:1:1:none:0.25em:zh');
    expect(key({ latinSpacingEdge: 'western' }, 'zh-Hans')).toBe('mainland:kaiming:1:1:none:0.25em:zh:lw');
    expect(key({}, 'ja')).toBe(`${key({ latinSpacingEdge: 'letters' }, 'ja')}:lw`);
  });

  it('reads the region of a configuration as resolveAllConfig does', () => {
    expect(cjkRegionOfConfig({ locale: 'ja' })).toBe('japan');
    expect(cjkRegionOfConfig({ bodyText: { hyphenation: { locale: 'ja' } } })).toBe('japan');
    expect(cjkRegionOfConfig({ locale: 'zh-Hant' })).toBe('taiwan');
    expect(cjkRegionOfConfig({ locale: 'zh-Hant', cjk: { region: 'japan' } })).toBe('japan');
    expect(cjkRegionOfConfig({ locale: 'ja', cjk: { region: 'auto' } })).toBe('japan');
    expect(cjkRegionOfConfig({ locale: 'en' })).toBe('mainland');
    expect(cjkRegionOfConfig(undefined)).toBe('mainland');
    for (const config of [{ locale: 'ja' }, { locale: 'zh-Hans' }, { locale: 'zh-Hant-HK' }, { locale: 'ja', cjk: { region: 'mainland' as const } }, {}]) {
      expect(cjkRegionOfConfig(config), JSON.stringify(config)).toBe(resolveAllConfig(config).cjk.region);
    }
  });
});
