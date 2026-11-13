/**
 * Special inks (#1563): what an ink is beyond its colour. The finish of a
 * spot colour comes from the ink table first, then from the colour; a
 * name like `Gold` or `Barniz UVI` only ever suggests one
 * ({@link guessInkFinish}), it never sets it.
 */

import type { InkFinish, InkFinishKind, InkSheen, ResolvedPrintInk, SpotColor } from '../types.js';
import { inkEntry } from './inks.js';
import { resolveInkFinish } from './finishKinds.js';

export { finishSheen, finishOverprintsByDefault, finishPaintsOnScreen, resolveInkFinish, sameFinish, sheenLevel } from './finishKinds.js';

/** The finish a spot colour prints with: the ink table's, else its own. */
export function finishOfSpot(spot: SpotColor, inks: readonly ResolvedPrintInk[] = []): InkFinish | undefined {
  return inkEntry(spot.name, inks)?.finish ?? resolveInkFinish(spot.finish);
}

/**
 * A pattern that finds any of `words` as a whole word: not inside a longer
 * word of any script (`Gold` in `Goldenrod`, `or` in `Color`), so letters
 * with accents count as letters. The words are this module's constants,
 * never text from a document.
 */
function wholeWords(words: readonly string[]): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.join('|')})(?![\\p{L}\\p{N}])`, 'iu');
}

/** A pattern that finds any of `words` anywhere: for Chinese and Japanese,
 *  written without spaces, and Arabic, whose words take the article and
 *  other prefixes joined to them. */
function anywhere(words: readonly string[]): RegExp {
  return new RegExp(words.join('|'), 'u');
}

/**
 * Words that name each finish, in the site's ten languages (English,
 * Spanish, Catalan, French, German, Italian, Portuguese, Japanese, Chinese,
 * Arabic) and in the names inks carry in swatch books and separations. In
 * the order they are tried: a varnish or foil word wins over a colour word
 * (`Gold foil` is a foil, `Barniz oro` a varnish), a fluorescent word over
 * `white`, a metal over `white` (`白金`, platinum).
 *
 * French `or` (gold) is left out on purpose: it is also the English
 * conjunction and a piece of many names. `Or métallisé` still reads as
 * metallic by its second word, `Dorure` as a foil.
 */
const FINISH_WORDS: ReadonlyArray<[InkFinishKind, RegExp[]]> = [
  ['varnish', [
    wholeWords([
      'varnish', 'spot[ -]?uv', 'uv[ -]?(?:varnish|coating|lack)', 'overprint varnish', 'lacquer',
      'barniz', 'uvi', 'vern[ií]s', 'vernis', 'lack', 'drucklack', 'spot-?lack', 'vernice', 'verniz',
    ]),
    anywhere(['ニス', 'バーニッシュ', '光油', '上光', 'ورنيش']),
  ]],
  ['foil', [
    wholeWords([
      'foil', 'hot[ -]?foil', 'hot[ -]?stamp(?:ing)?', 'foil stamping', 'stamping foil',
      'estampaci[oó]n', 'estampat', 'estampado en caliente', 'estampagem', 'dorure', 'dorure à chaud', 'marquage à chaud',
      'hei(?:ß|ss)folie', 'folienpr[äa]gung', 'pr[äa]gefolie', 'lamina', 'lámina', 'stampa a caldo', 'estampagem a quente',
    ]),
    anywhere(['烫金', '烫银', '燙金', '箔押し', '箔', 'ホイル', 'رقائق', 'بصمة ساخنة', 'ختم حراري']),
  ]],
  ['fluorescent', [
    wholeWords([
      'fluo', 'fluor', 'flúor', 'fluorescent', 'fluorescente', 'fluoreszierend', 'fluoreszenz', 'leucht\\p{L}*', 'ne[oó]n',
      // Pantone's fluorescent inks: 801 to 814.
      '80[1-9] ?[cu]', '81[0-4] ?[cu]',
    ]),
    anywhere(['蛍光', '荧光', '螢光', 'ネオン', 'فلوري', 'فسفوري', 'فلورسنت', 'نيون']),
  ]],
  ['metallic', [
    wholeWords([
      'metallic', 'metallics', 'métallique', 'métallisée?', 'metallisch', 'metallic[oa]', 'metallizzat[oa]', 'met[aá]lic[oa]',
      'metalizad[oa]', 'metal·litzad[ae]', 'metal·litzat', 'metàl·lic[a]?', 'metal', 'métal',
      'gold', 'silver', 'copper', 'bronze', 'bronce', 'bronzo', 'oro', 'plata', 'cobre', 'argent', 'argento', 'cuivre',
      'silber', 'kupfer', 'rame', 'ouro', 'prata', 'daurat', 'daurada', 'coure', 'doré', 'dorée', 'argenté', 'argentée',
      'goldfarben', 'silbern', 'dorado', 'plateado', 'dourado', 'prateado', 'dorato', 'argentato',
      // Pantone's metallic inks: 871 to 877, the 8000s and the 10000s.
      '87[1-7] ?[cu]', '8[0-9]{3} ?[cu]', '10[0-9]{3} ?[cu]',
    ]),
    anywhere(['金色', '银色', '銀色', '专金', '专银', '金属', '金屬', 'ゴールド', 'シルバー', 'メタリック', 'カッパー', 'ブロンズ', '金', '銀', '银', '銅', '铜', 'ذهب', 'فضي', 'فضة', 'معدني', 'نحاس', 'برونز']),
  ]],
  ['white', [
    wholeWords([
      'white', 'opaque white', 'blanco', 'blanc', 'blanca', 'wei(?:ß|ss)', 'deckwei(?:ß|ss)', 'bianco', 'branco',
    ]),
    anywhere(['白', 'ホワイト', 'أبيض', 'بيضاء']),
  ]],
];

/** The words that name a sheen, in the order they are tried: soft touch,
 *  then satin (`Seidenmatt` is a satin, though it holds `matt`), then
 *  matte, then gloss. */
const SHEEN_WORDS: ReadonlyArray<[InkSheen, RegExp[]]> = [
  ['softTouch', [
    wholeWords(['soft[ -]?touch', 'soft[ -]?feel', 'tacto suave', 'toucher doux', 'tacte suau', 'toque suave', 'soft-?touch-?lack']),
    anywhere(['ソフトタッチ', '触感', '肤感', 'ملمس ناعم']),
  ]],
  ['satin', [
    wholeWords(['satin', 'satinado', 'satinada', 'satiné', 'satinée', 'setinat', 'setinada', 'satinato', 'acetinado', 'seidenmatt', 'seidenglanz']),
    anywhere(['サテン', '丝光', '絲光', 'ساتان']),
  ]],
  ['matte', [
    wholeWords(['matte?', 'mate', 'mat', 'opaco', 'fosco', 'mattiert']),
    anywhere(['マット', '哑光', '亚光', '啞光', 'مطفي']),
  ]],
  ['gloss', [
    wholeWords(['gloss', 'glossy', 'brillo', 'brillante', 'brillant', 'brilhante', 'brilho', 'glänzend', 'glanz', 'hochglanz', 'lucido']),
    anywhere(['グロス', '光沢', '亮光', 'لامع']),
  ]],
];

const matches = (patterns: readonly RegExp[], text: string): boolean => patterns.some((re) => re.test(text));

/**
 * The finish an ink's name suggests, or `undefined`: `Gold`, `PANTONE 871
 * C` and `Oro metalizado` suggest metallic; `Hot foil`, `Estampación oro`
 * foil; `Fluo pink`, `PANTONE 806 C` fluorescent; `Opaque white`, `Blanco`
 * white; `Varnish`, `Spot UV`, `Barniz` varnish. A varnish or foil word
 * wins over a colour word (`Gold foil` is a foil); `matte`, `satin` and
 * `soft touch` in the name set the sheen of a varnish, a foil or a
 * metallic ink (soft touch a varnish's only). Only ever a hint: the Sandbox
 * offers it and the port skill reports it; nothing sets it silently.
 */
export function guessInkFinish(name: string): InkFinish | undefined {
  const n = name.normalize('NFC');
  for (const [kind, patterns] of FINISH_WORDS) {
    if (!matches(patterns, n)) continue;
    const out: InkFinish = { kind };
    if (kind === 'varnish' || kind === 'foil' || kind === 'metallic') {
      for (const [sheen, sheenPatterns] of SHEEN_WORDS) {
        if (sheen === 'softTouch' && kind !== 'varnish') continue;
        if (!matches(sheenPatterns, n)) continue;
        out.sheen = sheen;
        break;
      }
    }
    return out;
  }
  return undefined;
}
