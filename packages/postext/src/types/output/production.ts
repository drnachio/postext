import type { FolioPaperConfig } from './folio.js';

/** A measure of a binding profile, in millimetres, written so that one
 *  profile serves every trim:
 *  - a number: the same for any trim (a 3 mm square);
 *  - steps: the first whose `upTo` trim the book fits in, the last one
 *    (without `upTo`) for anything larger (board that the printer thickens
 *    on big books);
 *  - a ratio of the trim width or height, within `min` and `max` (flaps). */
export type ProductionLength =
  | number
  | ProductionLengthStep[]
  | { ratio: number; of?: 'width' | 'height'; min?: number; max?: number };

export interface ProductionLengthStep {
  /** Trim this step covers, mm; a book fits when both sides are within. */
  upTo?: { width: number; height: number };
  mm: number;
}

/** A trim size, mm. */
export interface TrimMm {
  width: number;
  height: number;
}

/** A paper as a profile of the user's library: the stock Folio already
 *  knows (`type`, `grammage`, `bulk`, finish, shade…) with a name, and who
 *  sells it. */
export interface PaperProfile extends FolioPaperConfig {
  id: string;
  name: string;
  supplier?: string;
  commercialName?: string;
}

/** How the cover is made: a softcover glued (`'perfect'`, PUR or hot
 *  melt) or sewn, or a case (hardcover) whose spine is flat or round. */
export type BindingStyle = 'perfect' | 'sewnSoftcover' | 'caseFlat' | 'caseRound';

/** The measures of a binding, every one a {@link ProductionLength}. Those of
 *  a softcover apply to a softcover, those of a case to a case; the jacket
 *  and the endpapers to whichever has them. */
export interface BindingMeasures {
  /** Added to the thickness of the block for the spine: glue, sewing and,
   *  on a softcover, the cover board round it. */
  spineAllowance: ProductionLength;
  /** Softcover: bleed round the cover sheet. */
  bleed: ProductionLength;
  /** Softcover: distance of the hinge scores from each spine fold (0: the
   *  cover is only scored at the spine). */
  hingeScore: ProductionLength;
  /** Softcover: width of each flap. */
  flapWidth: ProductionLength;
  /** Softcover with flaps: how much narrower than the trim each cover
   *  panel is made, so the flap folds just inside the fore-edge. */
  flapFoldInset: ProductionLength;
  /** Case: board thickness. */
  board: ProductionLength;
  /** Case: how far the boards stand out from the block at head, foot and
   *  fore-edge (the square). */
  square: ProductionLength;
  /** Case: the joint (hinge gap) between each board and the spine. */
  joint: ProductionLength;
  /** Case: the cover material turned in round the boards. */
  turnIn: ProductionLength;
  /** Case: how much narrower than the trim each board is cut at the spine
   *  side, before the square is added at the fore-edge. */
  boardSetback: ProductionLength;
  /** Case: added to block + 2 × board for the width of the spine board. */
  caseSpineAllowance: ProductionLength;
  /** Round case: added to the flat case spine for the round. */
  roundSpineAllowance: ProductionLength;
  /** Jacket: extra width at each fore-edge fold, for the board it wraps. */
  jacketFoldAllowance: ProductionLength;
  /** Jacket: width of each flap. */
  jacketFlapWidth: ProductionLength;
  /** Jacket: bleed round the sheet. */
  jacketBleed: ProductionLength;
  /** Endpapers: glue strip along the fold, tipped onto the block. */
  endpaperGlueStrip: ProductionLength;
  /** Endpapers: bleed at head, foot and fore-edge (none at the fold). */
  endpaperBleed: ProductionLength;
  /** Safe zone kept clear inside each fold, score, joint and trim. */
  safeMargin: ProductionLength;
  /** How far past the trim the design is drawn, mm: beyond it, out to the
   *  end of the bleed or the turn-in, the background and the movable
   *  elements are mirrored (`coverPage`'s `mirrorMargin`). */
  designMargin: ProductionLength;
}

/** What a binding profile can make; a book outside it gets a
 *  `profileOutOfRange` warning instead of a cover nobody can bind. */
export interface BindingAccepts {
  trim?: { min?: TrimMm; max?: TrimMm };
  spine?: { min?: number; max?: number };
}

/** A binding as a profile of the user's library: a style, its measures
 *  (any left out take the defaults of the style) and its limits. */
export interface BindingProfile {
  id: string;
  name: string;
  printer?: string;
  style: BindingStyle;
  /** Pages per signature: the page count is rounded up to it. */
  signature?: number;
  measures?: Partial<BindingMeasures>;
  accepts?: BindingAccepts;
}

/** A version of the book as it is manufactured: a binding, its own ISBN
 *  and cover, over the same text block as the other versions (a paperback
 *  and a hardcover of one book). */
export interface ProductionVersion {
  id: string;
  name: string;
  /** This version's ISBN: each binding has its own. */
  isbn?: string;
  /** Five-digit add-on printed after the barcode. In Spain it carries no
   *  price: the ISBN agency only allows it starting with 9, for the
   *  publisher's own use (90000: no price). */
  isbnAddOn?: string;
  /** The ISBN of the whole work, for a volume of a collection or of a work
   *  in several volumes: the barcode carries the volume's (`isbn`), and
   *  this one is printed as text beside it. */
  workIsbn?: string;
  /** A profile id of the library, or the profile itself. */
  binding: string | BindingProfile;
  /** Softcover: flaps; case: a dust jacket. */
  flaps?: boolean;
  /** Case: the cover printed and laminated over the boards, or cloth
   *  (stamped, usually under a jacket). Default `'printed'`. */
  caseMaterial?: 'printed' | 'cloth';
  /** Measures this version sets for itself, mm, over the profile's (the
   *  printer asks for a different joint on this one book). */
  overrides?: Partial<Record<keyof BindingMeasures, number>>;
  /** The spine as the printer gives it, mm: replaces the calculated one. */
  spineOverride?: number;
  /** How the spine is lettered: rising (`'bottomToTop'`, the usual way in
   *  Spain) or falling (`'topToBottom'`, ISO 6357), and the narrowest spine
   *  that takes text, mm. */
  spineText?: { direction?: 'bottomToTop' | 'topToBottom'; minSpine?: number };
}

/** The collection or multi-volume work a book belongs to: its own ISBN
 *  (printed as text next to the volume's), and its catalogue of
 *  advertisements for the endpapers. */
export interface ProductionCollection {
  name: string;
  isbn?: string;
  catalogue?: { id: string; title: string; resource?: string }[];
}
