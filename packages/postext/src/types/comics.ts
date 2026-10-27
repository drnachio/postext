import type { ColorValue, Dimension, PageMargins } from './page.js';

// ---------------------------------------------------------------------------
// Comics (`:::page`, #555–#563)
// ---------------------------------------------------------------------------

/** The direction the panels of a comic page are read in: `'ltr'` (Western
 *  comics: the first panel of a tier at the left), `'rtl'` (manga and
 *  Arabic comics: at the right), `'auto'`: the direction of the edition's
 *  language, `'rtl'` in a right-to-left document (an Arabic edition), in
 *  a vertical one and in a Japanese or Traditional Chinese one
 *  (`comicsLocaleDirection`): a Japanese edition of a Western comic reads
 *  right to left. Otherwise the direction the art was drawn for
 *  (`artDirection`): a manga reads right to left in any language, a
 *  Western comic left to right in English, Simplified Chinese or Korean.
 *  With `page.binding: 'auto'` a book whose comics read right to left is
 *  bound on the right. A page's `direction` attribute wins. */
export type ComicReadingDirection = 'auto' | 'ltr' | 'rtl';

/** How a panel's border is drawn: a clean stroke, none, or a hand-drawn
 *  line (a stroke that wobbles, seeded from the panel, so the same page
 *  always draws the same line). */
export type ComicPanelBorderStyle = 'solid' | 'none' | 'rough';

/** How a panel's picture fills its cell: `'cover'` crops it (never into its
 *  safe area) to fill the cell, `'contain'` shows it whole, the rest of the
 *  cell in the panel background. */
export type ComicPanelFit = 'cover' | 'contain';

/** The look of a comic panel: its border, its background (the colour of an
 *  empty panel and of the bands a letterboxed picture leaves) and how its
 *  picture fills it. */
export interface PanelStyleConfig {
  /** Border width; `0` draws none. Default `1pt`. */
  borderWidth?: Dimension;
  /** Border colour. Default black. */
  borderColor?: ColorValue;
  /** Corner radius of a rectangular panel (a panel cut by a slanted line
   *  keeps straight corners). Default `0`. */
  borderRadius?: Dimension;
  /** Default `'solid'`. */
  borderStyle?: ComicPanelBorderStyle;
  /** Panel fill under the picture. Default white. */
  background?: ColorValue;
  /** Default `'cover'`. */
  fit?: ComicPanelFit;
  /** The panel's outer sides that touch the frame run to the trim (and the
   *  bleed past it, `page.cutLines.bleed`). Default `false`. */
  bleed?: boolean;
}

/** A named panel style (`:::page{style=…}`, `::panel{style=…}`): its unset
 *  fields follow `comics.panel`. */
export interface NamedPanelStyleConfig extends PanelStyleConfig {
  id: string;
  /** Human-readable name (editor UI only). Defaults to {@link id}. */
  name?: string;
}

export interface ResolvedPanelStyleConfig {
  borderWidth: Dimension;
  borderColor: ColorValue;
  borderRadius: Dimension;
  borderStyle: ComicPanelBorderStyle;
  background: ColorValue;
  fit: ComicPanelFit;
  bleed: boolean;
}

export interface ResolvedNamedPanelStyleConfig extends ResolvedPanelStyleConfig {
  id: string;
  name: string;
}

/** The lettering of a comic: one face and one size for the whole book
 *  (text is never shrunk to fit a balloon; the balloon changes shape
 *  instead). A balloon style may scale the size (`fontScale`). */
export interface LetteringConfig {
  /** Default: the lettering face of the document language
   *  (`defaultComicFont`): `Comic Neue`, `Zen Antique` for Japanese, `Noto
   *  Sans SC` for Simplified Chinese, `LXGW WenKai TC` for Traditional
   *  Chinese, `Playpen Sans Arabic` for Arabic. */
  fontFamily?: string;
  /** Default `7.5pt`. */
  fontSize?: Dimension;
  /** Line height, a multiple of the size. Default `1.15`. */
  lineHeight?: number;
  /** Default black. */
  color?: ColorValue;
  /** Default `false`. */
  bold?: boolean;
  /** Default `false`. */
  italic?: boolean;
  /** Default `0`. */
  letterSpacing?: Dimension;
  /** `'auto'` (default): vertical for Japanese and Traditional Chinese,
   *  horizontal otherwise. */
  writingMode?: 'auto' | 'horizontal' | 'vertical';
  /** `'uppercase'` sets the lettering in capitals (scripts without case
   *  keep theirs). Default `'none'`. */
  textTransform?: 'none' | 'uppercase';
  /** Drop the full stop that ends a balloon (`。` in Japanese and Chinese
   *  manga). `'auto'` (default): for Japanese and Chinese. */
  dropFinalStop?: 'auto' | boolean;
  /** Write an em dash as `--` (US lettering). Default `false`. */
  doubleDash?: boolean;
  /** Room kept between a balloon and its panel's border. Default `1.5mm`. */
  inset?: Dimension;
  /** How two balloons of the same speaker in a row join: their bodies
   *  merged (`'butt'`, default), a narrow neck between them
   *  (`'connector'`), or kept apart (`'none'`). */
  joinSameSpeaker?: 'butt' | 'connector' | 'none';
  /** Vertical lettering: the most characters in a column. Default `8`. */
  maxColumnChars?: number;
  /** A balloon reshaped to fit its panel does not part a Chinese word to
   *  do so (#728): each word its new lines cut, which its preferred shape
   *  leaves whole, costs more than a balloon read out of order, so the
   *  placement moves or reorders before it cuts 其|实. Japanese lettering
   *  is not touched (its breaks go by phrases). Default `true`; `false`
   *  letters as postext 1.27 did, which a configuration stored under
   *  `configVersion` 11 or lower is read with when its text may hold a
   *  comic (see `pinLegacyBalloonPlacement` in `postext/bundle`). */
  strictPlacement?: boolean;
}

export interface ResolvedLetteringConfig {
  fontFamily: string;
  fontSize: Dimension;
  lineHeight: number;
  color: ColorValue;
  bold: boolean;
  italic: boolean;
  letterSpacing: Dimension;
  writingMode: 'auto' | 'horizontal' | 'vertical';
  textTransform: 'none' | 'uppercase';
  dropFinalStop: 'auto' | boolean;
  doubleDash: boolean;
  inset: Dimension;
  joinSameSpeaker: 'butt' | 'connector' | 'none';
  maxColumnChars: number;
  strictPlacement: boolean;
}

/** The outline of a balloon body. */
export type ComicBalloonShape = 'oval' | 'rounded' | 'rectangle' | 'cloud' | 'burst' | 'wavy' | 'electric' | 'none';
/** The tail of a balloon. */
export type ComicBalloonTail = 'curved' | 'wedge' | 'bubbles' | 'zigzag' | 'none';
/** Where a balloon or caption sits when the script pins none: placed by
 *  the lettering (`'auto'`) or at a corner or edge of the panel. */
export type ComicBalloonPosition = 'auto' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end' | 'top' | 'bottom';

/** A kind of balloon (`speech`, `thought`, `whisper`…): its shape, tail and
 *  lettering. A script line names one with a bare flag (`ben{whisper}:
 *  …`); its unset fields follow the built-in style of the same id, then
 *  the lettering. */
export interface BalloonStyleConfig {
  /** The kind a script line names (`{thought}`, `style=thought`). */
  id: string;
  /** Human-readable name (editor UI only). Defaults to {@link id}. */
  name?: string;
  shape?: ComicBalloonShape;
  fill?: ColorValue;
  stroke?: ColorValue;
  strokeWidth?: Dimension;
  /** A dashed outline (whisper). */
  dash?: boolean;
  /** A double outline. */
  double?: boolean;
  /** Hand-drawn wobble of the outline, 0–1 (seeded from the balloon). */
  wobble?: number;
  /** Superellipse exponent of an oval (2 = ellipse). */
  roundness?: number;
  /** Spikes of a burst. */
  burstPoints?: number;
  /** Depth of a burst's spikes, a fraction of the body. */
  burstDepth?: number;
  /** Air between the text and the outline, in em of the balloon text. */
  padding?: Dimension;
  /** Target width / height of a horizontal text block. */
  aspect?: number;
  tail?: ComicBalloonTail;
  /** Width of the tail at the body. */
  tailWidth?: Dimension;
  /** How far the tail reaches toward its target: a fraction of the gap
   *  from the outline to the target. */
  tailReach?: number;
  /** What the tail points at: the anchor's mouth or its head. */
  target?: 'mouth' | 'head';
  position?: ComicBalloonPosition;
  /** Set flush against the panel border (captions). */
  butt?: boolean;
  /** Unset: the lettering face. */
  fontFamily?: string;
  /** Size, a multiple of the lettering size. */
  fontScale?: number;
  bold?: boolean;
  italic?: boolean;
  /** Text colour. Unset: the lettering colour. */
  color?: ColorValue;
  textTransform?: 'none' | 'uppercase';
  letterSpacing?: Dimension;
  align?: 'center' | 'start';
  /** An outline drawn around the letters (a sound effect, text set on the
   *  picture), its width. */
  halo?: Dimension;
  haloColor?: ColorValue;
  /** Rotation in degrees (sound effects). */
  rotate?: number;
  /** Lean of the letters' upright strokes, degrees (sound effects, text
   *  written on the art): positive leans them forward like italic, negative
   *  back. Applied before `rotate`, about the same centre, so a title on a
   *  book cover seen in perspective follows both the cover's top edge
   *  (`rotate`) and its sides (`skew`). Default `0`. */
  skew?: number;
}

export interface ResolvedBalloonStyleConfig {
  id: string;
  name: string;
  shape: ComicBalloonShape;
  fill: ColorValue;
  stroke: ColorValue;
  strokeWidth: Dimension;
  dash: boolean;
  double: boolean;
  wobble: number;
  roundness: number;
  burstPoints: number;
  burstDepth: number;
  padding: Dimension;
  aspect: number;
  tail: ComicBalloonTail;
  tailWidth: Dimension;
  tailReach: number;
  target: 'mouth' | 'head';
  position: ComicBalloonPosition;
  butt: boolean;
  fontScale: number;
  align: 'center' | 'start';
  rotate: number;
  skew: number;
  /** Unset: the lettering's. */
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  color?: ColorValue;
  textTransform?: 'none' | 'uppercase';
  letterSpacing?: Dimension;
  halo?: Dimension;
  haloColor?: ColorValue;
}

/** A character of a comic: the speaker id its script lines and the
 *  pictures' anchors use, with the lettering that sets them apart. */
export interface ComicCastMember {
  id: string;
  /** The character's name (editor UI, the reflowable EPUB's dialogue). */
  name?: string;
  /** The balloon style the character speaks in by default. */
  balloonStyle?: string;
  /** Text colour of the character's balloons. */
  color?: ColorValue;
  /** Fill of the character's balloons. */
  fill?: ColorValue;
  fontFamily?: string;
}

/** Comic pages (`:::page`): the frame and gutters of the panel grid, the
 *  panel styles, the lettering, the balloon styles and the cast. Only
 *  documents with comic pages read it. */
export interface ComicsConfig {
  /** The order panels are read in (see {@link ComicReadingDirection}).
   *  Default `'auto'`: the edition's language decides (right to left in
   *  Arabic, Japanese, Traditional Chinese and vertical documents), else
   *  {@link artDirection}. */
  readingDirection?: ComicReadingDirection;
  /** The direction the art was drawn for: what `'auto'` reads in when the
   *  edition's language has no direction of its own, and what
   *  {@link mirrorArt} compares the page's direction with. Default
   *  `'ltr'`. */
  artDirection?: 'ltr' | 'rtl';
  /** Mirror the pictures of a page read in the other direction than
   *  {@link artDirection} (a panel opts out with `mirror=false`). Default
   *  `false`. */
  mirrorArt?: boolean;
  /** The box the panels are cut from. Default: the page's content area
   *  (its margins). */
  frame?: { margins?: PageMargins };
  /** Room between tiers (`horizontal`, default `4mm`) and between panels
   *  side by side (`vertical`, default `2mm`). */
  gutter?: { horizontal?: Dimension; vertical?: Dimension };
  /** The default panel style. */
  panel?: PanelStyleConfig;
  /** Named panel styles. */
  panelStyles?: NamedPanelStyleConfig[];
  lettering?: LetteringConfig;
  /** Balloon styles, by kind. The built-in ones (`speech`, `thought`,
   *  `whisper`, `shout`, `radio`, `caption`, `inner`, `note`, `sfx`) are
   *  always there; an entry with one of their ids changes it. */
  balloonStyles?: BalloonStyleConfig[];
  cast?: ComicCastMember[];
  /** Print the running heads and folios on comic pages. Default `false`:
   *  a comic page is all panels (its folio still counts). */
  runningHeads?: boolean;
  /** For hosts whose page is not a leaf (the Sandbox's HTML viewer lays
   *  the book out on pages a screen wide and a scroll tall): comic pages
   *  are laid out on this leaf instead — the print page's size and
   *  margins — scaled to {@link ComicViewerLeafConfig.fitWidth} px wide
   *  (and at most `fitHeight` px tall) and set at the top of the page,
   *  centred across it. Every length of the comic page (margins, gutters,
   *  borders, lettering) is resolved at that scale, so the page shows its
   *  print geometry, never reflowed. Not saved with a document. */
  viewerLeaf?: ComicViewerLeafConfig;
}

/** See {@link PostextConfig.composedViewerLeaf}. */
export interface ComposedViewerLeafConfig {
  width: Dimension;
  height: Dimension;
  margins?: PageMargins;
}

/** See {@link ComicsConfig.viewerLeaf}. */
export interface ComicViewerLeafConfig {
  width: Dimension;
  height: Dimension;
  margins?: PageMargins;
  /** Width of the leaf on the page, px. */
  fitWidth: number;
  /** Height the leaf may take at most, px (the leaf is then narrower). */
  fitHeight?: number;
}

export interface ResolvedComicsConfig {
  readingDirection: ComicReadingDirection;
  artDirection: 'ltr' | 'rtl';
  mirrorArt: boolean;
  /** Set when the config gives the frame its own margins. */
  frame: { margins?: Required<PageMargins> };
  gutter: { horizontal: Dimension; vertical: Dimension };
  panel: ResolvedPanelStyleConfig;
  panelStyles: ResolvedNamedPanelStyleConfig[];
  lettering: ResolvedLetteringConfig;
  /** The built-in styles with the config's laid over them, then the
   *  config's other styles. */
  balloonStyles: ResolvedBalloonStyleConfig[];
  cast: ComicCastMember[];
  runningHeads: boolean;
  /** As the config gives it (hosts only). */
  viewerLeaf?: ComicViewerLeafConfig;
}
