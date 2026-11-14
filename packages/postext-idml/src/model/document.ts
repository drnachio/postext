// The typed model of an IDML package: what `readIdml` returns and both
// the importer and the inspection are written on. Lengths in points.

import type { XmlElement } from '../xml/read.js';
import type { Box, Matrix, Path } from './geometry.js';

/** The attributes and `<Properties>` an element sets itself (a style, a
 *  text range, a page item): raw, as written. A style's inherited values
 *  are added by `resolve/styles`. */
export interface Props {
  attrs: Record<string, string>;
  /** Children of `<Properties>` by name. */
  properties: Record<string, XmlElement>;
}

export interface IdmlWarning {
  code: string;
  message: string;
  /** Part of the package it concerns (`Stories/Story_u1a.xml`). */
  part?: string;
}

// ── Colour ────────────────────────────────────────────────────────────

export type ColourSpace = 'CMYK' | 'RGB' | 'LAB' | 'HSB' | 'MixedInk';

export interface IdmlColor {
  kind: 'color';
  self: string;
  name: string;
  model: 'Process' | 'Spot' | 'Registration' | 'MixedInkModel';
  space: ColourSpace;
  /** CMYK 0–100 ×4, RGB 0–255 ×3, Lab L 0–100 a/b −128–127. */
  value: number[];
  /** The alternate space of a spot colour, when written. */
  alternate?: { space: ColourSpace; value: number[] };
  /** InDesign's own (Black, Paper, Registration) or hidden reserved. */
  special?: 'black' | 'paper' | 'registration' | 'reserved';
  visible: boolean;
  /** The swatch's script label (`<Properties><Label>`), key → value:
   *  where an export from Postext records an ink's finish. */
  label?: Record<string, string>;
}

export interface IdmlTint {
  kind: 'tint';
  self: string;
  name: string;
  base: string;
  /** 0–100. */
  tint: number;
}

export interface IdmlGradient {
  kind: 'gradient';
  self: string;
  name: string;
  type: 'Linear' | 'Radial';
  stops: { color: string; location: number; midpoint: number }[];
}

export interface IdmlMixedInk {
  kind: 'mixedInk';
  self: string;
  name: string;
  inks: string[];
  values: number[];
  /** The process equivalent InDesign wrote for it. */
  space: ColourSpace;
  value: number[];
}

export interface IdmlNone {
  kind: 'none';
  self: string;
  name: string;
}

export type IdmlSwatch = IdmlColor | IdmlTint | IdmlGradient | IdmlMixedInk | IdmlNone;

export interface IdmlStrokeStyle {
  self: string;
  name: string;
  kind: 'solid' | 'dashed' | 'dotted' | 'striped' | 'other';
  /** Dash and gap lengths of a custom dashed style. */
  dashArray?: number[];
}

// ── Fonts and styles ──────────────────────────────────────────────────

export interface IdmlFont {
  family: string;
  style: string;
  postScriptName?: string;
  fullName?: string;
  type?: string;
  status?: string;
}

export type StyleKind = 'paragraph' | 'character' | 'object' | 'table' | 'cell';

export interface IdmlStyle extends Props {
  kind: StyleKind;
  self: string;
  /** The style's own name (`H1`). */
  name: string;
  /** The groups it sits in, outermost first (`['Heads']`). */
  groups: string[];
  basedOn?: string;
  /** InDesign's root style of its kind (`[No paragraph style]`, `[None]`…). */
  root: boolean;
  /** Nested, line and GREP styles of a paragraph style (reported). */
  nested?: { kind: 'nested' | 'line' | 'grep'; characterStyle: string; expression?: string; delimiter?: string; repetition?: number; inclusive?: boolean }[];
}

// ── Pages and page items ──────────────────────────────────────────────

export interface IdmlMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
  columnCount: number;
  columnGutter: number;
  /** Column edges from the left margin, pairs of start and end. */
  columnsPositions: number[];
  columnDirection: 'Horizontal' | 'Vertical';
}

export interface IdmlPage {
  self: string;
  /** Folio as InDesign named the page (`iv`, `12`). */
  name: string;
  /** In the page's own frame: `GeometricBounds`. */
  bounds: Box;
  /** Page frame → spread frame. */
  transform: Matrix;
  appliedMaster?: string;
  masterPageTransform: Matrix;
  margins: IdmlMargins;
  /** Master items overridden on this page (their `Self`). */
  overrideList: string[];
  /** Index in the document (0-based), -1 on a master. */
  index: number;
  /** Side in its spread: the page is at the left of the spine. */
  side: 'left' | 'right' | 'single';
}

export interface TextFrameData {
  story: string;
  previous?: string;
  next?: string;
  columns: number;
  gutter: number;
  /** Top, left, bottom, right. */
  inset: [number, number, number, number];
  firstBaseline: string;
  minFirstBaseline: number;
  verticalJustification: string;
  autoSizing: string;
  ignoreWrap: boolean;
  /** Column widths of a frame with fixed or unequal columns. */
  columnFixedWidth?: number;
}

export interface GraphicData {
  type: 'Image' | 'PDF' | 'EPS' | 'SVG' | 'WMF' | 'PICT' | 'ImportedPage' | 'Movie' | 'Sound' | 'Graphic';
  self: string;
  /** Picture frame → the frame of the item that holds it. */
  transform: Matrix;
  /** The picture's own box, in its frame (points). */
  bounds: Box;
  link?: { uri: string; stored: string; format?: string; name: string };
  /** Bytes carried inside the package (an embedded picture). */
  data?: Uint8Array;
  /** Colour space of the picture as InDesign names it. */
  space?: string;
  actualPpi?: [number, number];
  effectivePpi?: [number, number];
  /** Page of a placed PDF. */
  pageNumber?: number;
  clippingPath?: Path[];
  props: Props;
}

export interface AnchoredData {
  position: 'InlinePosition' | 'AboveLine' | 'Anchored';
  props: Record<string, string>;
}

export interface TextWrapData {
  mode: 'None' | 'JumpObjectTextWrap' | 'NextColumnTextWrap' | 'BoundingBoxTextWrap' | 'Contour';
  /** Top, left, bottom, right. */
  offset: [number, number, number, number];
  side: string;
  inverse: boolean;
  contour?: Path[];
}

export type PageItemKind = 'TextFrame' | 'Rectangle' | 'Oval' | 'Polygon' | 'GraphicLine' | 'Group' | 'Button' | 'MultiStateObject' | 'TextBox' | 'CheckBox' | 'RadioButton' | 'ComboBox' | 'ListBox' | 'SignatureField' | 'EPSText' | 'HtmlItem' | 'Other';

export interface IdmlPageItem extends Props {
  kind: PageItemKind;
  /** Element name as written, for kinds read as `Other`. */
  element: string;
  self: string;
  name?: string;
  /** Item frame → the frame of its parent (spread, group, or the text
   *  it is anchored in). */
  transform: Matrix;
  paths: Path[];
  layer?: string;
  visible: boolean;
  locked: boolean;
  nonprinting: boolean;
  objectStyle?: string;
  contentType?: string;
  /** Master item this item overrides on its page. */
  overrides?: string;
  textFrame?: TextFrameData;
  graphic?: GraphicData;
  /** Stories set on the item's path (`TextPath`). */
  textPaths: { story: string; props: Record<string, string> }[];
  children: IdmlPageItem[];
  anchored?: AnchoredData;
  wrap?: TextWrapData;
  /** 0–100; 100 when not set. */
  opacity: number;
  blendMode?: string;
  /** Effects the item carries (drop shadow, glow, feather…), by name. */
  effects: string[];
  /** Alt text for export, when set by hand. */
  altText?: string;
  /** States of a multi-state object or button, each a list of items. */
  states?: { name: string; active: boolean; items: IdmlPageItem[] }[];
}

export interface IdmlGuide {
  orientation: 'Horizontal' | 'Vertical';
  location: number;
  page?: number;
}

export interface IdmlSpread {
  self: string;
  master: boolean;
  /** Master spread only: `A-Master`, its prefix and base name, its parent. */
  name?: string;
  namePrefix?: string;
  baseName?: string;
  basedOn?: string;
  /** Spread frame → pasteboard. */
  transform: Matrix;
  pages: IdmlPage[];
  /** Back to front. */
  items: IdmlPageItem[];
  guides: IdmlGuide[];
  hidden: boolean;
  showMasterItems: boolean;
  bindingLocation: number;
  /** Part of the package it was read from. */
  part?: string;
}

// ── Stories ───────────────────────────────────────────────────────────

/** A character InDesign writes as an instruction or keeps by a code
 *  point of its own. */
export type SpecialCharacter =
  | 'pageNumber' | 'nextPageNumber' | 'previousPageNumber' | 'sectionMarker' | 'footnoteNumber'
  | 'rightIndentTab' | 'indentHere' | 'endNestedStyle' | 'forcedLineBreak' | 'discretionaryHyphen'
  | 'nonbreakingHyphen' | 'discretionaryLineBreak' | 'columnBreak' | 'frameBreak' | 'pageBreak' | 'oddPageBreak' | 'evenPageBreak' | 'unknown';

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'special'; char: SpecialCharacter; code?: string }
  | { kind: 'footnote' | 'endnote'; paragraphs: IdmlParagraph[]; /** `Self` of an endnote, when written. */ self?: string }
  | { kind: 'note'; paragraphs: IdmlParagraph[] }
  | { kind: 'table'; table: IdmlTable }
  | { kind: 'item'; item: IdmlPageItem }
  | { kind: 'indexMark'; topic: string; type?: string }
  | { kind: 'variable'; variable: string; result: string }
  | { kind: 'destination'; self: string; name: string; destinationType: 'text' | 'paragraph' };

export interface IdmlRun extends Props {
  characterStyle?: string;
  content: Inline[];
  /** `HyperlinkTextSource` or `CrossReferenceSource` the run stands in. */
  linkSource?: string;
  /** The source is a cross-reference; its format, when named. */
  crossReference?: { format?: string };
  /** Conditions applied (`Condition/…`). */
  conditions: string[];
  /** Tracked change the run is part of. */
  change?: 'inserted' | 'deleted' | 'moved';
  /** XML tags the run stands in, outermost first. */
  tags: string[];
  /** The run stands in a `HiddenText`: conditional text whose condition
   *  is switched off. */
  hidden?: boolean;
}

export interface IdmlParagraph extends Props {
  paragraphStyle?: string;
  runs: IdmlRun[];
  /** The break that ends it (`NextColumn`, `NextFrame`, `NextPage`…). */
  breakAfter?: string;
  /** `EndnoteRange` of an endnote story the paragraph stands in. */
  endnoteRange?: string;
}

export interface IdmlCell extends Props {
  self: string;
  /** Column and row, 0-based. */
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  cellStyle?: string;
  type: 'text' | 'graphic';
  paragraphs: IdmlParagraph[];
  /** Page items of a graphic cell. */
  items: IdmlPageItem[];
}

export interface IdmlTable extends Props {
  self: string;
  tableStyle?: string;
  headerRows: number;
  footerRows: number;
  bodyRows: number;
  columns: { width: number; props: Props }[];
  rows: { height: number; minHeight?: number; autoGrow: boolean; props: Props }[];
  cells: IdmlCell[];
}

export interface IdmlStory {
  self: string;
  title?: string;
  direction: 'ltr' | 'rtl';
  orientation: 'horizontal' | 'vertical';
  paragraphs: IdmlParagraph[];
  /** The story is InDesign's own for endnotes. */
  endnotes: boolean;
  trackChanges: boolean;
  opticalMargin: boolean;
  /** Part of the package it was read from. */
  part?: string;
}

// ── Document ──────────────────────────────────────────────────────────

export interface IdmlLayer {
  self: string;
  name: string;
  visible: boolean;
  locked: boolean;
  printable: boolean;
  ignoreWrap: boolean;
}

export interface IdmlSection {
  self: string;
  pageStart: string;
  length: number;
  continueNumbering: boolean;
  pageNumberStart?: number;
  pageNumberStyle: string;
  prefix: string;
  includePrefix: boolean;
  marker: string;
}

export interface IdmlHyperlink {
  self: string;
  name: string;
  source: string;
  destination?: string;
  hidden: boolean;
}

export interface IdmlDestination {
  self: string;
  name: string;
  kind: 'url' | 'page' | 'text' | 'paragraph' | 'external';
  url?: string;
  page?: string;
  /** Story a text or paragraph destination stands in. */
  story?: string;
  /** Document an external page destination points into, and its page. */
  documentPath?: string;
  pageIndex?: number;
}

export interface IdmlTopic {
  self: string;
  name: string;
  sortOrder: string;
  /** Ancestors' names, outermost first. */
  path: string[];
  crossReferences: { type: string; topic: string; customText?: string }[];
}

export interface IdmlCondition {
  self: string;
  name: string;
  visible: boolean;
}

export interface IdmlDocumentPreferences {
  pageWidth: number;
  pageHeight: number;
  facingPages: boolean;
  /** Right-bound: pages run right to left. */
  rightToLeft: boolean;
  bleed: { top: number; bottom: number; inside: number; outside: number };
  slug: { top: number; bottom: number; inside: number; outside: number };
  intent?: string;
  startPageNumber: number;
  columnDirection: 'Horizontal' | 'Vertical';
  baselineGrid: { start: number; division: number; relativeTo: string; shown: boolean };
  margins?: IdmlMargins;
  /** Every preference element of the part by its name (`FootnoteOption`,
   *  `TextPreference`, `TextDefault`…), as written. */
  all?: Record<string, Props>;
}

/** The parts the designmap names, by their path in the package. */
export interface IdmlParts {
  graphic?: string;
  fonts?: string;
  styles?: string;
  preferences?: string;
  tags?: string;
  backingStory?: string;
  masterSpreads: string[];
  spreads: string[];
  stories: string[];
}

export interface IdmlNumberingList {
  self: string;
  name: string;
  continueAcrossStories: boolean;
  continueAcrossDocuments: boolean;
}

export interface IdmlDocument {
  domVersion: string;
  /** `product` of the document's `<?aid … ?>` instruction (`21.6(57)`). */
  product?: string;
  name?: string;
  title?: string;
  author?: string;
  cmykProfile?: string;
  rgbProfile?: string;
  preferences: IdmlDocumentPreferences;
  /** `Language/…` → IETF tag when known, and InDesign's name. */
  languages: Map<string, { name: string; tag?: string }>;
  /** Bottom to top. */
  layers: IdmlLayer[];
  swatches: Map<string, IdmlSwatch>;
  strokeStyles: Map<string, IdmlStrokeStyle>;
  fonts: IdmlFont[];
  styles: Record<StyleKind, Map<string, IdmlStyle>>;
  masterSpreads: IdmlSpread[];
  spreads: IdmlSpread[];
  stories: Map<string, IdmlStory>;
  sections: IdmlSection[];
  hyperlinks: IdmlHyperlink[];
  destinations: Map<string, IdmlDestination>;
  bookmarks: { name: string; destination: string; children: IdmlDocument['bookmarks'] }[];
  topics: Map<string, IdmlTopic>;
  conditions: Map<string, IdmlCondition>;
  textVariables: Map<string, { name: string; type: string }>;
  crossReferenceFormats: Map<string, { name: string; blocks: { type: string; text?: string }[] }>;
  numberingLists: Map<string, IdmlNumberingList>;
  /** `StoryList` of the document: every story it holds, by `Self`. */
  storyList: string[];
  parts: IdmlParts;
  /** `Links/…` and other files the package carries beside its parts. */
  files: Map<string, Uint8Array>;
  /** What the reader met and could not read as written. */
  warnings: IdmlWarning[];
}
