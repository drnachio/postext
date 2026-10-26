import type { ColorValue } from './page.js';

/** A paper stock as the trade sells it (see {@link FolioPaperConfig.type}). */
export type FolioPaperType =
  | 'uncoated'
  | 'bookWove'
  | 'coatedMatte'
  | 'coatedSilk'
  | 'coatedGloss'
  | 'bible'
  | 'newsprint'
  | 'cardStock'
  | 'board';

/** How a paper's surface is finished: uncoated (fibre, no sheen), or
 *  coated and calendered to a matte, silk (satin) or gloss surface. */
export type FolioPaperFinish = 'auto' | 'uncoated' | 'matte' | 'silk' | 'gloss';

/** The relief of a paper's surface: smooth (calendered), vellum (a fine
 *  tooth), wove (the even felt-side texture of book papers), laid (the
 *  laid and chain lines of a dandy roll), linen (an embossed cross-weave),
 *  felt (irregular felt marks). */
export type FolioPaperTexture = 'auto' | 'smooth' | 'vellum' | 'wove' | 'laid' | 'linen' | 'felt';

/** How the book is bound: a hardcover (case bound, boards larger than the
 *  pages), a paperback (perfect bound: glued, opens less flat), a sewn
 *  softcover, a lay-flat binding that opens without a gutter dip, a
 *  saddle stitch (folded sheets stapled through the fold, as a magazine or
 *  a booklet: no flat spine), or folded (#506): sheets folded once and
 *  laid one inside the other with nothing holding them, as a newspaper —
 *  no staples, no spine, no cover board; the first page is the front. */
export type FolioBindingType = 'hardcover' | 'paperback' | 'sewn' | 'layflat' | 'saddleStitch' | 'folded';

/** What the cover is made of. `auto`: cloth on a hardcover, card on a
 *  softcover. */
export type FolioCoverMaterial = 'auto' | 'cloth' | 'paper' | 'leather';

/** What the book lies on. `none` leaves the host's background. */
export type FolioSurfaceType = 'oak' | 'walnut' | 'linen' | 'felt' | 'leather' | 'marble' | 'plain' | 'none';

/** The light the book is seen in: an environment (reflected by glossy
 *  paper) paired with a key light that casts the shadows. */
export type FolioEnvironment = 'studio' | 'daylight' | 'lamp' | 'overcast' | 'night';

export interface FolioPaperConfig {
  /** The stock: its defaults for grammage, bulk, finish, texture and
   *  shade. Default `'uncoated'` (woodfree offset). `cardStock` is cover
   *  card; `board` is rigid board (a board book, a hardcover's leaves) that
   *  turns without bending. */
  type?: FolioPaperType;
  /** Weight in g/m². Heavier paper is thicker, stiffer (it curls in a
   *  wider roll) and more opaque. Default: the stock's. */
  grammage?: number;
  /** Bulk in cm³/g: thickness per weight (caliper µm = grammage × bulk).
   *  Default: the stock's. */
  bulk?: number;
  /** Default `'auto'`: the stock's finish. */
  finish?: FolioPaperFinish;
  /** Default `'auto'`: the stock's texture. */
  texture?: FolioPaperTexture;
  /** How strongly the texture shows, 0 … 2. Default 1. */
  textureStrength?: number;
  /** The colour of the stock (white, natural, cream…); the pages are
   *  printed on it. Default: the stock's. */
  shade?: ColorValue;
  /** The reverse page shows faintly through thin paper. Default true. */
  showThrough?: boolean;
}

/** Where the book's covers come from: `'case'` draws a case round the
 *  pages; `'pages'` takes the document's first page as the front board and
 *  its last page, when it is a verso, as the back board. The book then
 *  lies closed until the cover is turned and closes again on the last
 *  leaf. The boards are rigid, except on a saddle stitch, where the cover
 *  is a sheet a little heavier than the pages and turns as they do. */
export type FolioCoverSource = 'case' | 'pages';

export interface FolioBindingConfig {
  /** Default `'hardcover'`. */
  type?: FolioBindingType;
  /** Default `'case'`. */
  cover?: FolioCoverSource;
  /** Default `'auto'`. */
  coverMaterial?: FolioCoverMaterial;
  /** Default a dark blue cloth. */
  coverColor?: ColorValue;
  /** `Resource.id` of a bitmap or SVG printed on the spine: the spine as
   *  seen with the book standing, head up and the front cover to the right
   *  (the picture's height runs from head to tail, its width across the
   *  block). It is fitted to cover the spine, centred. A saddle-stitched
   *  book has no spine and ignores it. Default none. */
  spineImage?: string;
}

export interface FolioSurfaceConfig {
  /** Default `'oak'`. */
  type?: FolioSurfaceType;
  /** Tints the surface (`plain`: its colour). Default: the surface's own. */
  color?: ColorValue;
}

export interface FolioLightingConfig {
  /** Default `'studio'`. */
  environment?: FolioEnvironment;
  /** Exposure, 0.25 … 2. Default 1. */
  intensity?: number;
  /** Shadows cast by the key light. Default true. */
  shadows?: boolean;
}

/** How the Folio viewer (`postext-folio`) presents the printed book in 3D:
 *  the view, the paper, the binding, the surface it lies on and the light.
 *  Canvas, PDF and HTML ignore it. */
export interface FolioConfig {
  /** How far the view is tilted from straight above, in degrees (0 … 70,
   *  the lowest the reader can orbit it): the foot of the pages comes
   *  closer. Default 22. */
  tilt?: number;
  /** How far the view is turned round the book, in degrees (−180 … 180;
   *  positive brings the eye round to the right of the book): 0 faces the
   *  foot of the pages.
   *  Default 0. */
  yaw?: number;
  paper?: FolioPaperConfig;
  binding?: FolioBindingConfig;
  surface?: FolioSurfaceConfig;
  lighting?: FolioLightingConfig;
}

export interface ResolvedFolioConfig {
  tilt: number;
  yaw: number;
  paper: {
    type: FolioPaperType;
    grammage: number;
    bulk: number;
    finish: Exclude<FolioPaperFinish, 'auto'>;
    texture: Exclude<FolioPaperTexture, 'auto'>;
    textureStrength: number;
    shade: ColorValue;
    showThrough: boolean;
  };
  binding: {
    type: FolioBindingType;
    cover: FolioCoverSource;
    coverMaterial: Exclude<FolioCoverMaterial, 'auto'>;
    coverColor: ColorValue;
    /** Absent without one, and on a saddle stitch. */
    spineImage?: string;
  };
  surface: { type: FolioSurfaceType; color?: ColorValue };
  lighting: { environment: FolioEnvironment; intensity: number; shadows: boolean };
}
