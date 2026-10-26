/**
 * German numbers in words, for heading templates (`{1:words}`,
 * `{1:ordinal}`, `{1:Ordinal-neuter}`) and the `{numberWords}` /
 * `{numberOrdinalWords}` design placeholders: „Kapitel einundzwanzig“,
 * „Das erste Kapitel“, „Erstes Kapitel“, „Erster Teil“.
 *
 * Cardinals are written as one word, as the Duden spells them below a
 * million (zweitausendvierundzwanzig), *eins* where the number ends in it
 * (hunderteins) and *ein* before *und* or *tausend* (einundzwanzig,
 * hunderteintausend). Ordinals take the weak ending *-e*, the form after
 * the article that serves every gender („der erste Teil“, „das erste
 * Kapitel“), unless a gender asks for the strong form a heading without
 * an article needs: *-er* masculine („Erster Teil“), *-e* feminine
 * („Erste Lektion“), *-es* neuter („Erstes Kapitel“). Swiss German
 * (`de-CH`, `de-LI`) writes *ss* for *ß*: dreissig.
 *
 * The caller keeps the numbers in range (up to 999 999). Number words are
 * not nouns, so they are lower case unless the template asks for a
 * capital.
 */

export type GermanGender = 'masculine' | 'feminine' | 'neuter';

const DE_BELOW_20 = [
  '', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn',
  'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn',
];
const DE_TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];

/** The units before *und*: ein-, zwei-, … (einundzwanzig). */
function unitBeforeUnd(unit: number): string {
  return unit === 1 ? 'ein' : DE_BELOW_20[unit]!;
}

function deBelow100(n: number): string {
  if (n < 20) return DE_BELOW_20[n]!;
  const unit = n % 10;
  const tens = DE_TENS[Math.floor(n / 10)]!;
  return unit ? `${unitBeforeUnd(unit)}und${tens}` : tens;
}

/** *Hundert*, not *einhundert*, as for *tausend*: hunderteins, zweihundert. */
function deBelow1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const head = hundreds === 0 ? '' : hundreds === 1 ? 'hundert' : `${unitBeforeUnd(hundreds)}hundert`;
  return head + deBelow100(n % 100);
}

/** The thousands of `n` written before what follows them. */
function deThousands(n: number): string {
  const thousands = Math.floor(n / 1000);
  if (thousands === 0) return '';
  if (thousands === 1) return 'tausend';
  return `${deBelow1000(thousands).replace(/eins$/, 'ein')}tausend`;
}

function swiss(words: string, locale: string | undefined): string {
  return /^de[-_](ch|li)\b/i.test(locale ?? '') ? words.replace(/ß/g, 'ss') : words;
}

export function germanCardinal(n: number, locale?: string): string {
  return swiss(deThousands(n) + deBelow1000(n % 1000), locale);
}

/** The ordinal stems of one to nineteen: erst-, zweit-, dritt-, siebt-, acht-. */
const DE_ORDINAL_STEMS = [
  '', 'erst', 'zweit', 'dritt', 'viert', 'fünft', 'sechst', 'siebt', 'acht', 'neunt', 'zehnt',
  'elft', 'zwölft', 'dreizehnt', 'vierzehnt', 'fünfzehnt', 'sechzehnt', 'siebzehnt', 'achtzehnt', 'neunzehnt',
];

const DE_ENDINGS: Readonly<Record<GermanGender, string>> = { masculine: 'er', feminine: 'e', neuter: 'es' };

/** *-t-* up to nineteen (zweite, neunzehnte, hundertzweite, tausenderste),
 *  *-st-* from twenty and after a round hundred or thousand (zwanzigste,
 *  einundzwanzigste, hundertste, tausendste), then the ending of `gender`
 *  (none: the weak *-e*). */
export function germanOrdinal(n: number, gender?: GermanGender, locale?: string): string {
  const last = n % 100;
  const stem = last > 0 && last < 20
    ? deThousands(n) + deBelow1000(n % 1000 - last) + DE_ORDINAL_STEMS[last]
    : `${germanCardinal(n)}st`;
  return swiss(stem + (gender ? DE_ENDINGS[gender] : 'e'), locale);
}
