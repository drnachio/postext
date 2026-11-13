/**
 * Special inks (#1563): what an ink is beyond its colour. The finish of a
 * spot colour comes from the ink table first, then from the colour; a
 * name like `Gold` or `Barniz UVI` only ever suggests one
 * ({@link guessInkFinish}), it never sets it.
 */

import type { InkFinish, InkSheen, ResolvedPrintInk, SpotColor } from '../types.js';
import { inkEntry } from './inks.js';

/** The finish a spot colour prints with: the ink table's, else its own. */
export function finishOfSpot(spot: SpotColor, inks: readonly ResolvedPrintInk[] = []): InkFinish | undefined {
  return inkEntry(spot.name, inks)?.finish ?? spot.finish;
}

/** The sheen a finish has once its default is filled in: gloss for a
 *  varnish and a foil, satin for a metallic ink; none for a fluorescent or
 *  white ink. */
export function finishSheen(f: InkFinish): InkSheen | undefined {
  if (f.kind === 'fluorescent' || f.kind === 'white') return undefined;
  if (f.sheen) return f.sheen;
  return f.kind === 'metallic' ? 'satin' : 'gloss';
}

/** Whether an ink of this finish overprints when nothing says otherwise:
 *  a white ink and a varnish do (a white lies under the colours, a
 *  varnish over them); every other ink knocks out. */
export function finishOverprintsByDefault(f: InkFinish | undefined): boolean {
  return f?.kind === 'white' || f?.kind === 'varnish';
}

/** Whether a finish puts colour on a screen page: a varnish does not. */
export function finishPaintsOnScreen(f: InkFinish | undefined): boolean {
  return f?.kind !== 'varnish';
}

/** Words that name each finish, in the site's ten languages and in the
 *  names inks carry in swatch books and separations. */
const FINISH_WORDS: Array<[InkFinish['kind'], RegExp]> = [
  ['varnish', /\b(varnish|spot ?uv|uvi?|barniz|vernis|lack|vernice|verniz|vernís|ニス|光油|上光|ورنيش)\b|varnish|barniz|ニス|光油|上光|ورنيش/i],
  ['foil', /\b(foil|hot ?stamp(ing)?|stamping|stamping ?foil|estampaci[oó]n|stamping|dorure|heißfolie|heissfolie|prägefolie|lamina|lámina|estampagem|stampa a caldo|烫金|烫银|箔押し|箔|رقائق)\b|烫金|烫银|箔押し|رقائق/i],
  ['white', /\b(opaque ?white|white|blanco|blanc|wei(ß|ss)|bianco|branco|blanc opac|白)\b|白墨|白インキ|أبيض/i],
  ['fluorescent', /\b(fluo(rescent|rescente|reszent|rescente)?|neon|ne[oó]n|flúor|fluor|80[1-7] ?c|蛍光|荧光)\b|蛍光|荧光|فلور/i],
  ['metallic', /\b(metal+ic|metal+i[cz]a?o?|metalizad[ao]|métallique|metallisch|metallizzat[ao]|metálic[ao]|gold|silver|copper|bronze|oro|plata|cobre|or|argent|cuivre|silber|kupfer|argento|rame|ouro|prata|87[1-7] ?c|8[0-9]{3} ?c|10[0-9]{3} ?c)\b|金|银|銀|ذهبي|فضي/i],
];

/**
 * The finish an ink's name suggests, or `undefined`: `Gold`, `PANTONE 871
 * C` and `Oro metalizado` suggest metallic; `Hot foil`, `Estampación oro`
 * foil; `Fluo pink`, `PANTONE 806 C` fluorescent; `Opaque white`, `Blanco`
 * white; `Varnish`, `Spot UV`, `Barniz` varnish. A foil or varnish word
 * wins over a colour word (`Gold foil` is a foil); `matte`, `satin` and
 * `soft touch` in the name set the sheen. Only ever a hint: the Sandbox
 * offers it and the port skill reports it; nothing sets it silently.
 */
export function guessInkFinish(name: string): InkFinish | undefined {
  const n = name.normalize('NFC');
  for (const [kind, re] of FINISH_WORDS) {
    if (!re.test(n)) continue;
    const out: InkFinish = { kind };
    if (kind === 'varnish' || kind === 'foil' || kind === 'metallic') {
      if (/soft[\s-]?touch|tacto suave|toucher doux|soft-?feel/i.test(n) && kind === 'varnish') out.sheen = 'softTouch';
      else if (/\b(matt?e?|mate|opaco|opaca|matt|satinad[oa]?)\b|マット|哑光/i.test(n)) out.sheen = /satin/i.test(n) ? 'satin' : 'matte';
      else if (/\bsatin|satinado|satiné|seidenmatt\b/i.test(n)) out.sheen = 'satin';
      else if (/\b(gloss|glossy|brillo|brillante|brillant|glänzend|lucido|brilhante)\b/i.test(n)) out.sheen = 'gloss';
    }
    return out;
  }
  return undefined;
}
