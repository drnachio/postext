import type { BindingMeasures, BindingProfile, BindingStyle, ProductionVersion } from '../../types/output/production.js';

// The defaults come from printers' and binders' published specifications
// (checked 6 Nov 2026); where they disagree, the value most of them give.
// They are a starting point: each printer's own go in a profile.

/** The measures every binding style starts from. */
const BASE: BindingMeasures = {
  // Perfect binding adds little to the block: 0.2–0.5 mm of cover board
  // (printsolution.es). No source gave a figure for sewn softcovers.
  spineAllowance: 0.5,
  // 3 mm is the most usual (laimprentacg.com, booksfactory.es, IngramSpark,
  // KDP); some German printers and Podiprint ask for 5.
  bleed: 3,
  // 4.8–7 mm from the spine fold (Puget Bindery and Mariano Press 6.35,
  // Reset St. Pauli 6, buecherdrucken24 5, Cevagraf «about 7»).
  hingeScore: 6,
  // No fixed width recurs: 2/3 of the block width is the one explicit rule
  // (buchdruckerei24.de), 65 mm the minimum Podiprint recommends.
  flapWidth: { ratio: 2 / 3, min: 65 },
  // Low confidence: sources disagree even on the direction. Ask the binder.
  flapFoldInset: 2,
  // Bookmobile's steps (0.079", 0.098", 0.120"); 2 mm is the European
  // default (laimprentacg.com, Sprinters, druck.de), 2.5 4Graph's.
  board: [
    { upTo: { width: 150, height: 230 }, mm: 2 },
    { upTo: { width: 216, height: 280 }, mm: 2.5 },
    { mm: 3 },
  ],
  // 3 mm (laimprentacg.com, booksfactory.es; Bookmobile and IngramSpark 3.2).
  square: 3,
  // 6–10 mm, the most scattered measure: 7 as in zxcprint and Spanish
  // practice; PDFPress widens it to 10 on spines of 30 mm or more.
  joint: 7,
  // 15 mm (KDP, print-assistant.de, Sprinters, Berliner Buchdruck;
  // IngramSpark 16, Lulu 19); laimprentacg.com and buecherdrucken24 use 20.
  turnIn: 15,
  // Board width = trim − joint + square (zxcprint): about 4 mm narrower than
  // the trim, between print-assistant.de (−3) and IngramSpark (−4.7).
  boardSetback: 7,
  // Flat case spine = block spine + 2 × board (print-assistant.de).
  caseSpineAllowance: 0,
  // A round spine about 3 mm wider than the flat one (print-assistant.de).
  roundSpineAllowance: 3,
  // About the board's thickness at each fold onto a flap (PDFPress 2–3,
  // Cevagraf 2; IngramSpark leaves a 6 mm band).
  jacketFoldAllowance: 3,
  // IngramSpark 82.5 mm, PDFPress 80–100.
  jacketFlapWidth: { ratio: 2 / 3, min: 80 },
  jacketBleed: 3,
  // 5 mm (printcolorweb, Wikibooks; 2–6 found).
  endpaperGlueStrip: 5,
  // Low confidence: no printer gives one for endpapers; booksfactory uses 3.
  endpaperBleed: 3,
  // Not from a source: 5 mm, between IngramSpark's spine margins (1–2 mm)
  // and KDP's 10 mm text-free band at a case's hinge.
  safeMargin: 5,
  // Not from a source: the 5–10 mm a designer draws past the trim (the
  // decision of 12 Nov 2026), its lower end. Past it, a case's turn-in is
  // filled by mirroring.
  designMargin: 5,
};

/** The measures each binding style starts from, before a profile's own. */
export const DEFAULT_BINDING_MEASURES: Readonly<Record<BindingStyle, BindingMeasures>> = {
  perfect: BASE,
  sewnSoftcover: BASE,
  caseFlat: { ...BASE, hingeScore: 0 },
  caseRound: { ...BASE, hingeScore: 0 },
};

/** The generic profiles that come with Postext, one per style, on offset
 *  signatures of 16 pages. A perfect-bound spine stays within 3 mm (below
 *  it, binders stop scoring: SGM) and 50 mm (Morgana; Horizon BQ-160 40,
 *  BQ-280 51). */
export const BUILT_IN_BINDING_PROFILES: readonly BindingProfile[] = [
  { id: 'perfect', name: 'Rústica fresada', style: 'perfect', signature: 16, accepts: { spine: { min: 3, max: 50 } } },
  { id: 'sewn-softcover', name: 'Rústica cosida', style: 'sewnSoftcover', signature: 16 },
  { id: 'case-flat', name: 'Cartoné, lomo recto', style: 'caseFlat', signature: 16 },
  { id: 'case-round', name: 'Cartoné, lomo redondo', style: 'caseRound', signature: 16 },
];

/** Spine lettering: rising, as most Spanish books are (ISO 6357 prefers
 *  falling), and none below 6 mm (booksfactory.es 6, Mariana Eguaras 7). */
export const DEFAULT_SPINE_TEXT: Required<NonNullable<ProductionVersion['spineText']>> = {
  direction: 'bottomToTop',
  minSpine: 6,
};
