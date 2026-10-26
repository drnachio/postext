import type { ColorValue, Dimension } from '../page.js';

/** SMuFL music fonts a score can be engraved in (#1173). */
export type ScoreMusicFont = 'Bravura' | 'Leland' | 'Petaluma' | 'Leipzig' | 'Gootville';

/** Music scores (#1172/#1173): the look of every ```` ```abc ```` /
 *  ```` ```musicxml ```` / ```` ```mei ```` / ```` ```humdrum ```` score. A
 *  score is engraved at the width of its column and broken into systems;
 *  each system is a block the layout places, so a long score runs on over
 *  columns and pages. */
export interface ScoreStyleConfig {
  /** Read notation fences as scores. Default `true`; off, they are code
   *  listings. */
  enabled?: boolean;
  /** Height of a five-line staff (the rastral size). Default 6 mm. */
  staffSize?: Dimension;
  /** SMuFL font of the notes, clefs and signs. Default Bravura. */
  musicFont?: ScoreMusicFont;
  /** Font of the lyrics, tempo and directions. Defaults to the body text. */
  textFont?: string;
  /** Horizontal spacing of the notes: 1 is the engraver's default, more
   *  spreads them (fewer bars per system). Default 1. */
  spacing?: number;
  /** Bar numbers: none, at the start of each system, on every bar.
   *  Default `'system'`. */
  barNumbers?: 'none' | 'system' | 'every';
  /** Space between two systems of a score. Default 3 mm. */
  systemGap?: Dimension;
  /** Space above and below a score. Default 6 pt each. */
  marginTop?: Dimension;
  marginBottom?: Dimension;
  /** Ink of the notation. Defaults to the body text colour. */
  color?: ColorValue;
  /** Fewest systems a score leaves at the foot of a column when it runs
   *  on into the next one (and takes to the next). A score with fewer
   *  systems than twice this moves whole. Default 1. */
  minSystemsAtBreak?: number;
}

export interface ResolvedScoreStyleConfig {
  enabled: boolean;
  staffSize: Dimension;
  musicFont: ScoreMusicFont;
  textFont: string;
  spacing: number;
  barNumbers: 'none' | 'system' | 'every';
  systemGap: Dimension;
  marginTop: Dimension;
  marginBottom: Dimension;
  color: ColorValue;
  minSystemsAtBreak: number;
}

/** A named score style (`PostextConfig.scoreStyles`), picked per score by
 *  the fence's `style` attribute (```` ```abc {style="hymn"} ````); unset
 *  fields inherit `scoreStyle`. */
export interface NamedScoreStyleConfig extends Omit<ScoreStyleConfig, 'enabled'> {
  id: string;
  name?: string;
}

export interface ResolvedNamedScoreStyleConfig extends ResolvedScoreStyleConfig {
  id: string;
  name: string;
}
