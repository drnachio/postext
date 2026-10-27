// What planDesign reads and returns: text looks and pieces, pictures,
// frames and the planned design (#1278: split out of pageDesign.ts).
import type { Dimension, ColorValue, DesignTextElement, DesignImageElement, DesignElement, ChipStyleConfig } from '../../types.js';
import type { PageSide } from '../../composed/types.js';

/** The look of a design text a paragraph style has to reproduce. */
export interface TextLook {
  fontFamily?: string;
  fontSize: Dimension;
  fontWeight: number;
  italic: boolean;
  color?: ColorValue;
  align: 'left' | 'center' | 'right' | 'justify' | 'start' | 'end';
  /** Leading as a multiple of the size. */
  lineHeight: number;
  uppercase: boolean;
  hyphenate: boolean;
  direction?: 'ltr' | 'rtl';
  writingMode?: 'vertical-rl';
  /** Tracking in ems of the text's size (#907); absent when none. */
  letterSpacing?: Dimension;
}

/** A text element that moves to the Markdown. */
export interface TextPiece {
  id: string;
  side?: PageSide;
  /** Top-left on the trim, mm; only for elements anchored to the page's
   *  top-left (the others keep their placement and are never merged). */
  x?: number;
  y?: number;
  width?: number;
  /** Estimated height (lines × leading). */
  height?: number;
  /** The height is the text's own lines (no line was guessed to wrap). */
  heightSure?: boolean;
  lineMm: number;
  look: TextLook;
  lookKey: string;
  element: DesignTextElement;
  /** The text as Markdown lines (inline marks kept, chips for highlights). */
  lines: string[];
  chars: number;
  notes: string[];
}

/** A picture of the design that carries labels (#918): it leaves the
 *  decoration for a picture frame at its box, its labels for the
 *  resource's anchors and `::label` lines. */
export interface PlannedPicture {
  element: DesignImageElement;
  /** Its box on the trim, mm. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The short texts on it, in their order in the design. */
  labels: TextPiece[];
  /** The frame's layer when it is not the default 0: -1 puts it below the
   *  decoration, for a design that paints decoration over the picture and
   *  none under it (#957). */
  layer?: number;
  /** Where the page may look different: `overPicture` (decoration painted
   *  over the picture lies under its frame, with decoration under the
   *  picture too, or over a label, so the frame cannot go below it). */
  notes: string[];
}

/** A frame the migration writes: one or more pieces of one look, under one
 *  another at an even spacing; or a picture with its labels (`picture`,
 *  no pieces). */
export interface PlannedFrame {
  side?: PageSide;
  pieces: TextPiece[];
  picture?: PlannedPicture;
  look: TextLook;
  lookKey: string;
  /** mm between pieces (paragraph spacing). */
  gap: number;
  width?: number;
  /** Assigned when templates are built. */
  name?: string;
  /** Geometry key for template sharing. */
  key: string;
}

export interface DesignInput {
  key: string;
  elements: DesignElement[];
  /** The slot each element comes from (same order as `elements`). */
  origins: ('header' | 'footer')[];
  page: { width: number; height: number };
  isContent: (content: string) => boolean;
  /** Existing chip styles, matched by background colour for highlights. */
  chipStyles: readonly ChipStyleConfig[];
  highlightsToChips: boolean;
  merge: boolean;
  /** Short texts on a picture become its labels (#918): one line, at most
   *  four words, set no larger than `maxSizeMm`, inside the picture's
   *  box. Unset: they are frames like the rest. */
  labelsOnPictures?: {
    maxSizeMm: number;
    /** The picture's own width and height (any unit, for its aspect), or
     *  undefined when the resource is not known: such a picture keeps its
     *  texts as frames. */
    pictureSize: (resourceId: string) => { width: number; height: number } | null | undefined;
  };
}

export interface PlannedDesign {
  key: string;
  frames: PlannedFrame[];
  /** Elements that stay, in their order (anchors to moved text remapped
   *  once frames have names: see {@link remapDecorationAnchors}). */
  decoration: DesignElement[];
  /** Element id → index of the frame its text went to. */
  movedTo: Map<string, number>;
  /** Elements that stay in the template's own running heads: anchored
   *  to the slot's container (or the outer margin), or to such an element. */
  header: DesignElement[];
  footer: DesignElement[];
  /** The full-page picture, replaced by `{attr.background}`. */
  background?: string;
  /** Text elements left in the decoration, and why. */
  kept: { id: string; reason: 'placeholder' | 'anchor' }[];
  /** Highlight boxes turned into chips. */
  chips: number;
  /** Chip styles this design needs that the book lacks, by id. */
  newChipStyles: Map<string, ChipStyleConfig>;
  notes: string[];
  movedChars: number;
  movedElements: number;
  /** Texts that became picture labels (among `movedElements`). */
  labelCount: number;
}
