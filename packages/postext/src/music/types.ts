/** Notation formats a score can be written in. */
export type ScoreFormat = 'abc' | 'musicxml' | 'mei' | 'humdrum';

/** The fenced-block languages that open a score, with their format. */
export const SCORE_LANGUAGES: Readonly<Record<string, ScoreFormat>> = {
  abc: 'abc',
  musicxml: 'musicxml',
  mei: 'mei',
  humdrum: 'humdrum',
  kern: 'humdrum',
};

/** A fence opening a score: ```` ```abc ````, ```` ```musicxml ```` … (its
 *  info string's first word is a notation language). */
const SCORE_FENCE_RE = /^[ \t]{0,3}(?:`{3,}|~{3,})[ \t]*(abc|musicxml|mei|humdrum|kern)\b/im;

/** Whether `markdown` may set a music score: a host starts the engraver
 *  before laying it out (#1172). A fence marked `{listing}` gives a false
 *  positive, which only costs the load. */
export function markdownHasScore(markdown: string): boolean {
  return SCORE_FENCE_RE.test(markdown);
}

/** Notation files read as music examples, by extension (#1172). */
export const SCORE_FILE_FORMATS: Readonly<Record<string, ScoreFormat>> = {
  '.abc': 'abc',
  '.musicxml': 'musicxml',
  '.mei': 'mei',
  '.krn': 'humdrum',
};

/** The notation format of a file, from its extension. */
export function scoreFormatOfFile(file: string): ScoreFormat | undefined {
  const dot = file.lastIndexOf('.');
  return dot < 0 ? undefined : SCORE_FILE_FORMATS[file.slice(dot).toLowerCase()];
}

/** Whether laying out `content` engraves a score: a notation fence in its
 *  markdown, or a score resource (#1172). */
export function contentHasScore(content: { markdown: string; resources?: ReadonlyArray<{ kind: string }> }): boolean {
  return markdownHasScore(content.markdown) || (content.resources ?? []).some((r) => r.kind === 'score');
}

/** How a score is engraved: the renderer options `scoreStyle` resolves to. */
export interface ScoreRenderOptions {
  /** Height of a five-line staff, in px. */
  staffSizePx: number;
  /** SMuFL music font. */
  font: 'Bravura' | 'Leland' | 'Petaluma' | 'Gootville' | 'Leipzig';
  /** Font family for lyrics, titles and other text in the score. */
  textFont?: string;
  /** Horizontal spacing factor: 1 is the renderer's default. */
  spacing: number;
  /** Bar numbers: none, at each system start, every bar. */
  barNumbers: 'none' | 'system' | 'every';
  /** Space between the systems of one slice, in staff spaces. */
  systemSpacing: number;
}

/** A painted piece of a system, in px of the slice. */
export type ScoreItem =
  | {
    type: 'path';
    d: string;
    /** Filled when true; stroked `strokeWidth` px wide when false. */
    fill: boolean;
    strokeWidth?: number;
    lineCap?: 'butt' | 'round' | 'square';
  }
  | {
    type: 'text';
    /** Baseline origin. */
    x: number;
    y: number;
    text: string;
    sizePx: number;
    bold: boolean;
    italic: boolean;
    anchor?: 'middle' | 'end';
    /** Pieces at their own size and baseline shift (a raised figure beside
     *  a chord symbol), when the word is not one run. The engine lays them
     *  side by side into items of their own. */
    runs?: ScoreTextRun[];
  };

export interface ScoreTextRun {
  text: string;
  sizePx: number;
  /** Baseline shift, px down. */
  rise: number;
  /** Room before the run, px. */
  dx: number;
  bold?: boolean;
  italic?: boolean;
}

/** One system of an engraved score: the slice the layout breaks between. */
export interface ScoreSystem {
  widthPx: number;
  heightPx: number;
  /** Paths and words, painted in the score's ink. */
  items: ScoreItem[];
  /** The same as plain SVG (`currentColor` ink), for HTML and PDF. */
  svg: string;
  /** Font family of the words (lyrics, tempo, directions). */
  textFont: string;
}

/** A music score engraved: its systems, title and composer, or the error. */
export interface ScoreRender {
  systems: ScoreSystem[];
  /** The renderer's message when the source did not load. */
  error?: string;
  /** Title and composer read from the source, for alt text. */
  title?: string;
  composer?: string;
}
