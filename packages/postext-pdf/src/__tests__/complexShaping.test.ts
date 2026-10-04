import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import {
  clusterTexts,
  complexShaperReady,
  joinsLetters,
  loadComplexShaper,
  needsComplexShaping,
  shapeRun,
  type ShapedGlyph,
} from '../complexShaping';
import { lineRuns, resolveParagraph } from 'postext';

// Amiri and Noto Naskh Arabic cut to the test sentences (OFL, see
// fixtures/arabic/make_fixtures.py).
const AMIRI = new Uint8Array(readFileSync(new URL('./fixtures/arabic/amiri-subset.ttf', import.meta.url)));
const NOTO = new Uint8Array(readFileSync(new URL('./fixtures/arabic/noto-naskh-subset.ttf', import.meta.url)));

/** Glyphs in `hb-shape --no-glyph-names` notation
 *  (`gid=cluster@xOffset,yOffset+xAdvance`), as native HarfBuzz 13.0.1
 *  shaped these fixtures. */
function hbShape(serialized: string): Array<Omit<ShapedGlyph, 'yAdvance'>> {
  return serialized.slice(1, -1).split('|').map((item) => {
    const m = /^(\d+)=(\d+)(?:@(-?\d+),(-?\d+))?\+(-?\d+)$/.exec(item)!;
    return { gid: Number(m[1]), cluster: Number(m[2]), xOffset: Number(m[3] ?? 0), yOffset: Number(m[4] ?? 0), xAdvance: Number(m[5]) };
  });
}

function shaped(font: Uint8Array, text: string, direction: 'ltr' | 'rtl' = 'rtl') {
  const run = shapeRun(font, text, { direction });
  expect(run).toBeDefined();
  return run!.glyphs.map(({ gid, cluster, xOffset, yOffset, xAdvance }) => ({ gid, cluster, xOffset, yOffset, xAdvance }));
}

describe('needsComplexShaping', () => {
  it('flags right-to-left and joining scripts only', () => {
    expect(needsComplexShaping('السلام')).toBe(true);
    expect(needsComplexShaping('Latin 2024 (x)')).toBe(false);
    expect(needsComplexShaping('שָׁלוֹם')).toBe(true);
    expect(needsComplexShaping('ܫܠܡܐ')).toBe(true); // Syriac
    expect(needsComplexShaping('ދިވެހި')).toBe(true); // Thaana
    expect(needsComplexShaping('ߒߞߏ')).toBe(true); // N'Ko
    expect(needsComplexShaping('ﷲ')).toBe(true); // presentation form
    expect(needsComplexShaping('𞤀𞤣𞤤𞤢𞤥')).toBe(true); // Adlam (supplementary plane)
    expect(needsComplexShaping('中文 Ελληνικά русский')).toBe(false);
  });

  it('tells joining letters from right-to-left ones that do not join', () => {
    expect(joinsLetters('كتاب')).toBe(true);
    expect(joinsLetters('ܫܠܡܐ')).toBe(true);
    expect(joinsLetters('ߒߞߏ')).toBe(true);
    expect(joinsLetters('שָׁלוֹם')).toBe(false);
    expect(joinsLetters('ދިވެހި')).toBe(false);
    expect(joinsLetters('Latin ١٤٤٥')).toBe(true); // Arabic-Indic digits sit in the Arabic block
    expect(joinsLetters('Latin 2024')).toBe(false);
  });
});

// The PDF cuts text that comes without directions (a running head, a
// caption, a VDT from before #369) with the engine's UAX #9 (`bidi.ts`),
// as the layout resolves a paragraph.
describe('bidi runs of undirected text (engine bidi)', () => {
  const texts = (text: string, base: 'ltr' | 'rtl' | 'auto' = 'auto') =>
    lineRuns(resolveParagraph(text, base)).map((r) => `${r.level % 2 === 1 ? 'R' : 'L'}:${text.slice(r.start, r.end)}`);

  it('keeps numbers and Latin words left to right inside an Arabic line', () => {
    expect(texts('عام 2024 م')).toEqual(['R: م', 'L:2024', 'R:عام ']);
    expect(texts('سنة ١٤٤٥ هـ')).toEqual(['R: هـ', 'L:١٤٤٥', 'R:سنة ']);
    // A number after a Latin word joins it (W7); the brackets go with the
    // Arabic around them (N0).
    expect(texts('كلمة Latin 2024 كلمة (قوس)')).toEqual(['R: كلمة (قوس)', 'L:Latin 2024', 'R:كلمة ']);
    // Decimal and thousands separators stay inside the number (W4).
    expect(texts('بلغ 1,234.5 كم')).toEqual(['R: كم', 'L:1,234.5', 'R:بلغ ']);
    // A percent sign after European digits joins them (W5).
    expect(texts('AAA 50% ZZZ', 'rtl')).toEqual(['L:AAA 50% ZZZ']);
  });

  it('keeps an Arabic phrase whole inside a left-to-right line', () => {
    expect(texts('AAA السلام عليكم ZZZ')).toEqual(['L:AAA ', 'R:السلام عليكم', 'L: ZZZ']);
    expect(texts('AAA عام 2024 ZZZ')).toEqual(['L:AAA ', 'L:2024', 'R:عام ', 'L: ZZZ']);
  });

  it('honours isolates and embeddings the minimal splitter read as neutrals', () => {
    // An RLI … PDI isolate keeps the Latin word inside the Arabic run's
    // order; the old splitter took the controls as neutrals.
    expect(texts('AAA \u2067كتاب BBB\u2069 ZZZ').map((t) => t.replace(/[\u2066-\u2069]/g, ''))).toEqual(['L:AAA ', 'L:BBB', 'R:كتاب ', 'L: ZZZ']);
  });
});

describe('shapeRun (HarfBuzz)', () => {
  beforeAll(async () => {
    expect(await loadComplexShaper()).toBe(true);
    expect(complexShaperReady()).toBe(true);
  });

  it('shapes vocalised Amiri as native HarfBuzz does, marks raised and lowered', () => {
    // بِسْمِ ٱللَّهِ: the shadda and fatha of Allah stack (two y offsets in
    // one cluster), the kasra sits under the ba; a letter and its marks are
    // one cluster.
    const glyphs = shaped(AMIRI, 'بِسْمِ ٱللَّهِ');
    expect(glyphs).toEqual(hbShape('[29=12@-75,181+0|161=12+352|209=9@65,-164+0|30=9@-135,-215+0|160=9+230|159=8+155|44=7+217|1=6+292|29=4@76,0+0|527=4+565|31=2@-175,0+0|494=2+291|29=0@-133,0+0|491=0+219]'));
    expect(glyphs.filter((g) => g.yOffset !== 0).length).toBeGreaterThanOrEqual(3);
    // Visual order: the clusters run right to left.
    expect(glyphs[0]!.cluster).toBeGreaterThan(glyphs[glyphs.length - 1]!.cluster);
    expect(shaped(AMIRI, 'ٱلرَّحْمَٰنِ')).toEqual(hbShape('[29=10@56,-64+0|315=10+615|43=7@-223,88+0|28=7@-173,0+0|575=7+216|31=5@68,0+0|573=5+514|209=2@66,51+0|30=2@-134,0+0|483=2+292|482=1+216|44=0+217]'));
  });

  it('shapes Noto Naskh marks where native HarfBuzz puts them', () => {
    expect(shaped(NOTO, 'بِسْمِ ٱللَّهِ')).toEqual(hbShape('[125=12@149,-62+0|49=12+452|122=9@-3,104+0|118=9@-1,-18+0|36=9+245|38=8+212|113=7@11,-53+0|2=7+238|1=6+221|125=4@238,-62+0|43=4+528|123=2@294,-222+0|20=2+663|125=0@39,-201+0|114=0@70,-31+0|10=0+275]'));
    expect(shaped(NOTO, 'كتـــاب')).toEqual(hbShape('[114=6@308,-31+0|6=6+772|3=5+253|58=4+210|58=3+210|58=2+210|111=1@53,-444+0|9=1+360|33=0+415]'));
  });

  it('joins lam-alef and ligates Amiri tatweels', () => {
    expect(shaped(AMIRI, 'لا إله')).toEqual(hbShape('[567=5+404|565=4+141|10=3+217|1=2+292|375=1+340|373=0+302]'));
    expect(shaped(AMIRI, 'كتـــاب')).toEqual(hbShape('[12=6+926|694=2+786|296=1+244|307=0+659]'));
  });

  it('mirrors brackets in a right-to-left run but not the ornate Quranic ones', () => {
    const ltr = shaped(AMIRI, '()', 'ltr');
    const rtl = shaped(AMIRI, '(قوس)');
    expect(rtl).toEqual(hbShape('[2=4+458|17=3+992|321=2+345|297=1+295|3=0+458]'));
    // The leftmost glyph is the closing bracket's, drawn as an opening one.
    expect(rtl[0]!.gid).toBe(ltr[0]!.gid);
    expect(rtl[rtl.length - 1]!.gid).toBe(ltr[1]!.gid);
    // U+FD3E/U+FD3F are not mirrored (Unicode 14): each keeps its glyph.
    const ornate = shaped(AMIRI, '﴿﴾', 'ltr');
    expect(shaped(AMIRI, '﴿قوس﴾').map((g) => g.gid)).toEqual([ornate[1]!.gid, 17, 321, 297, ornate[0]!.gid]);
  });

  it('gives each cluster its characters, once', () => {
    const text = 'لا إله';
    // Noto Naskh sets إ as an alef and a hamza below: two glyphs of one
    // cluster, the first met carrying the letter.
    const run = shapeRun(NOTO, text, { direction: 'rtl' })!;
    expect(run.glyphs.map((g) => g.cluster)).toEqual([5, 4, 3, 3, 2, 1, 0]);
    expect(clusterTexts(run, text)).toEqual(['ه', 'ل', 'إ', '', ' ', 'ا', 'ل']);
    expect([...clusterTexts(run, text)].reverse().join('')).toBe(text);
  });

  it('caches runs per face, text and direction', () => {
    const a = shapeRun(AMIRI, 'السلام عليكم', { direction: 'rtl' });
    expect(shapeRun(AMIRI, 'السلام عليكم', { direction: 'rtl' })).toBe(a);
    expect(shapeRun(AMIRI, 'السلام عليكم', { direction: 'ltr' })).not.toBe(a);
    expect(shapeRun(NOTO, 'السلام عليكم', { direction: 'rtl' })).not.toBe(a);
  });

  it('applies the font features asked for', () => {
    const plain = shaped(AMIRI, 'Latin', 'ltr');
    const run = shapeRun(AMIRI, 'Latin', { direction: 'ltr', features: { kern: false, liga: false } })!;
    expect(run.glyphs.map((g) => g.gid)).toEqual(plain.map((g) => g.gid));
  });

  it('shapes a book of words far faster than fontkit', () => {
    const words = 'السلام عليكم ورحمة الله وبركاته لا إله إلا الله كتـــاب سنة عام كلمة قوس'.split(' ');
    const marks = ['', 'َ', 'ِ', 'ُ', 'ّ', 'ْ'];
    const book: string[] = [];
    for (let i = 0; i < 4000; i++) book.push(words[i % words.length]! + marks[i % marks.length]! + (i % 7 === 0 ? 'ـ' : ''));
    const face = fontkit.create(Buffer.from(AMIRI));
    let t = performance.now();
    for (const w of book) face.layout(w);
    const fontkitMs = performance.now() - t;
    t = performance.now();
    for (const w of book) shapeRun(AMIRI, `${w}​`, { direction: 'rtl' });
    const harfbuzzMs = performance.now() - t;
    expect(harfbuzzMs).toBeLessThan(fontkitMs);
  });
});
