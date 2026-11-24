// The measure of the body text: how many characters a line of the column
// holds, and whether that is a comfortable length to read.

/** Characters per line of a column `columnWidth` points wide, set at
 *  `size` points in a face whose average character is `averageEm` em wide
 *  (spaces counted, as a line counts them). */
export function charactersPerLine(columnWidth: number, size: number, averageEm: number): number {
  if (size <= 0 || averageEm <= 0) return 0;
  return Math.round(columnWidth / (size * averageEm));
}

export type MeasureVerdict = 'short' | 'good' | 'long';

/** The range a line of alphabetic text reads comfortably in: Bringhurst's
 *  45 to 75 characters for one column, and down to 40 for several, where
 *  the lines are short by design. */
export const MEASURE_RANGE = { single: [45, 75], multi: [40, 75] } as const;

export function measureVerdict(characters: number, columns: number): MeasureVerdict {
  const [min, max] = columns > 1 ? MEASURE_RANGE.multi : MEASURE_RANGE.single;
  return characters < min ? 'short' : characters > max ? 'long' : 'good';
}

/** Whether the measure of text in `language` is judged in characters of
 *  an alphabet: Latin, Greek, Cyrillic. Han and kana lines are counted in
 *  full-width characters, Arabic letters join, Indic scripts stack; their
 *  count is shown without a verdict. */
export function alphabeticMeasure(language: string): boolean {
  const base = language.toLowerCase().split(/[-_]/)[0] ?? '';
  return !['zh', 'ja', 'ko', 'ar', 'fa', 'ur', 'he', 'yi', 'hi', 'bn', 'th', 'ta', 'te', 'km', 'my', 'lo'].includes(base);
}
