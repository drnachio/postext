import type { Dimension, InkFinish } from '../page.js';

/** The colour space a PDF is written in. */
export type PdfColorSpace = 'rgb' | 'cmyk' | 'grayscale';

/** The PDF/X flavour postext-pdf writes: none (an ordinary PDF), PDF/X-1a
 *  (CMYK only, no transparency; PDF/X-1a:2003) or PDF/X-4 (transparency
 *  kept, colour-managed; PDF/X-4:2010). */
export type PdfXStandard = 'none' | 'pdfx1a' | 'pdfx4';

/** How colours outside the output gamut are mapped: relative colorimetric
 *  (in-gamut colours stay exact, paper white = white) or perceptual (the
 *  whole gamut is compressed). */
export type PrintRenderingIntent = 'relative' | 'perceptual';

/** A CMYK recipe in percent (0..100 each). */
export interface CmykPercent {
  c: number;
  m: number;
  y: number;
  k: number;
}

/** How black prints in a CMYK job. */
export interface PrintBlackConfig {
  /** Black and grey (neutral) colours print with black ink only, never as
   *  a four-colour grey. Defaults to true. */
  kOnlyNeutrals?: boolean;
  /** 100 % K text and strokes overprint (no knock-out, so misregistration
   *  never shows a white halo). Defaults to true. */
  overprint?: boolean;
  /** Large black areas (backgrounds, bands, boxes, shapes whose smaller
   *  side reaches `richBlackMinSize`) print in rich black instead of
   *  K only. Text never does. Defaults to true. */
  richBlack?: boolean;
  /** The rich-black recipe. Defaults to C60 M40 Y40 K100. */
  richBlackColor?: CmykPercent;
  /** The smaller side an area needs to print in rich black. Defaults to
   *  6 mm. */
  richBlackMinSize?: Dimension;
}

/** How blacks print with every default filled in. */
export interface ResolvedPrintBlackConfig {
  kOnlyNeutrals: boolean;
  overprint: boolean;
  richBlack: boolean;
  richBlackColor: CmykPercent;
  richBlackMinSize: Dimension;
}

/** Thresholds of the print preflight (the Sandbox's Review panel, and
 *  `preflightDocument`). */
export interface PrintPreflightConfig {
  /** Run the checks. Defaults to true. */
  enabled?: boolean;
  /** Placed images below this effective resolution (pixels per inch at
   *  their printed size) get a warning. Defaults to 300. */
  minImageResolution?: number;
  /** Below this they are critical. Defaults to 150. */
  criticalImageResolution?: number;
  /** Rules and strokes thinner than this get a warning. Defaults to
   *  0.25 pt. */
  minRuleWidth?: Dimension;
  /** Text smaller than this printed with more than one ink (a process
   *  colour, rich black) gets a warning. Defaults to 9 pt. */
  smallTextSize?: Dimension;
  /** Distance inside the trim where text and important elements risk the
   *  cut. Defaults to 5 mm. */
  safeZone?: Dimension;
  /** Backgrounds, pictures and bands whose edge stops this close to the
   *  trim without reaching the bleed should bleed. Defaults to 3 mm. */
  bleedSnap?: Dimension;
  /** Report fonts a placed PDF print master does not embed. Defaults to
   *  true. */
  checkFonts?: boolean;
}

/** The preflight limits with every default filled in. */
export interface ResolvedPrintPreflightConfig {
  enabled: boolean;
  minImageResolution: number;
  criticalImageResolution: number;
  minRuleWidth: Dimension;
  smallTextSize: Dimension;
  safeZone: Dimension;
  bleedSnap: Dimension;
  checkFonts: boolean;
}

/** The conformance level a contrast ratio is held to (WCAG 2): `'AA'`
 *  asks 4.5:1 of text and 3:1 of large text, `'AAA'` 7:1 and 4.5:1. */
export type ContrastLevel = 'AA' | 'AAA';

/** Which rendition the contrast check reads: `'screen'` (the sRGB colours,
 *  as the canvas, the HTML and an RGB PDF show them), `'print'` (the inks
 *  on the paper of the output profile), `'both'`, or `'auto'`: the screen
 *  always, and print as well for a book set up for print (a PDF/X
 *  standard, a CMYK PDF, or crop marks). */
export type ContrastMode = 'auto' | 'screen' | 'print' | 'both';

/** Reversed text (light text knocked out of an inked ground) fills in on
 *  press when it is small or its strokes are thin, whatever its contrast
 *  ratio: the sizes under which the print check reports it. */
export interface ContrastReversedTextConfig {
  /** Report reversed text. Defaults to true. */
  enabled?: boolean;
  /** Reversed text smaller than this is reported. Defaults to 8 pt. */
  minSize?: Dimension;
  /** The same for italics and light weights, whose strokes are thinner.
   *  Defaults to 12 pt. */
  minFineSize?: Dimension;
  /** A weight at or under this counts as light. Defaults to 300. */
  lightWeight?: number;
}

/** The limits for reversed text with every default filled in. */
export interface ResolvedContrastReversedTextConfig {
  enabled: boolean;
  minSize: Dimension;
  minFineSize: Dimension;
  lightWeight: number;
}

/** A text and ground pair the contrast check accepts (#1124): the
 *  colours a publisher's palette sets on purpose, which a port cannot
 *  change. Text that matches is still reported, as accepted with its
 *  reason, and no longer counts as a warning. An entry matches the text
 *  whose every field it gives matches; one that gives none of `fg`, `bg`
 *  and `style` matches nothing. */
export interface ContrastAllowEntry {
  /** The text colour (`#rrggbb`, or `#rgb`), as the configuration writes
   *  it or as it is painted (a translucent colour blended with its
   *  ground). */
  fg?: string;
  /** The ground the text is set on, the same way. */
  bg?: string;
  /** A style the text is set in: a box style (`calloutStyles[].id`, the
   *  `style` of a composed page's frame too), a paragraph style, a heading
   *  style, a chip style or a figure label style. Every colour pair of the
   *  text set in it is accepted, unless `fg` or `bg` narrow it. */
  style?: string;
  /** Why the pair stays: listed beside the accepted finding. */
  reason: string;
}

/** The contrast check (`contrastDocument`): the text of the laid-out pages
 *  against the ground it is set on. Layout ignores it. */
export interface ContrastConfig {
  /** Run the check. Defaults to true. */
  enabled?: boolean;
  /** Defaults to `'AA'`. */
  level?: ContrastLevel;
  /** Defaults to `'auto'`. */
  mode?: ContrastMode;
  reversedText?: ContrastReversedTextConfig;
  /** Pairs the check accepts (#1124), each with its reason. Defaults to
   *  none. */
  allow?: ContrastAllowEntry[];
}

/** The contrast check with every default filled in. */
export interface ResolvedContrastConfig {
  enabled: boolean;
  level: ContrastLevel;
  mode: ContrastMode;
  reversedText: ResolvedContrastReversedTextConfig;
  /** The entries that match something, their colours written
   *  `#rrggbb` in lower case. */
  allow: ContrastAllowEntry[];
}

/** The content check (`checks.contentInConfig`, #849): a design text
 *  element of the configuration — a running head, a heading or part
 *  design, a contents part row — whose `content` holds more literal text
 *  than a short label. The text of a book belongs in its Markdown; a design
 *  keeps placeholders (`{titleText}`, `{chapterTitle}`…) and, at most, a
 *  word or two of its own ("Chapter {chapterNumber}"). Layout ignores it. */
export interface ContentInConfigCheckConfig {
  /** Run the check. Defaults to true. */
  enabled?: boolean;
  /** Literal text a design may carry whatever its length: the book's
   *  title, the publisher's name. Compared without case, spacing or
   *  punctuation, after the placeholders are removed; an entry found inside
   *  a longer text is taken out before the rest is counted. */
  allow?: string[];
  /** Most words a design text may hold beyond its placeholders. Defaults
   *  to 2. */
  maxWords?: number;
  /** Most letters and digits a design text may hold beyond its
   *  placeholders. Defaults to 24. */
  maxChars?: number;
}

/** The check for reader-facing text kept in the configuration, with every
 *  default filled in. */
export interface ResolvedContentInConfigCheckConfig {
  enabled: boolean;
  allow: string[];
  maxWords: number;
  maxChars: number;
}

/** Checks that read the configuration itself and change no page (#849). */
export interface ChecksConfig {
  contentInConfig?: ContentInConfigCheckConfig;
}

/** The checks on the configuration with every default filled in. */
export interface ResolvedChecksConfig {
  contentInConfig: ResolvedContentInConfigCheckConfig;
}

/** An ICC output profile the user uploaded (their printer's), stored
 *  out-of-band like a font or a picture. */
export interface CustomOutputProfile {
  /** The profile's name (its `desc` tag, or the file name). */
  name: string;
  /** Identifier of the stored `.icc` file. */
  fileId: string;
  /** The printing condition's registry name when the profile is one
   *  (e.g. `FOGRA51`), for the PDF/X OutputConditionIdentifier; else
   *  `Custom`. */
  registryName?: string;
  /** Total ink limit of the condition, percent. */
  inkLimit?: number;
}

/** One ink of the job's ink table (`print.inks`): what the plate of a spot
 *  ink is called in the PDF and how it prints, whatever the colours, SVGs
 *  and imports call it. */
export interface PrintInk {
  /** The ink as a colour's `spot.name` (or an SVG) names it. Matched
   *  ignoring case and runs of spaces. */
  name: string;
  /** Other names of the same ink (`Pantone 286C`, `Corporate blue`):
   *  colours naming any of them print on this ink's plate. */
  aliases?: string[];
  /** The name the plate carries in the PDF, the one the printer sees.
   *  Defaults to `name`. */
  pdfName?: string;
  /** `'spot'` (default) prints the ink on its own plate; `'process'`
   *  prints every colour of it in CMYK, from its alternate at the tint. */
  output?: 'spot' | 'process';
  /** The ink's alternate at full strength, percent, over the one the
   *  colours give. */
  cmyk?: CmykPercent;
  /** Whether the ink overprints, over what the colours say. */
  overprint?: boolean;
  /** The ink's finish, over what the colours say (#1563): an SVG or an
   *  imported file that names `Gold` gets its metallic finish here. */
  finish?: InkFinish;
}

export interface ResolvedPrintInk {
  name: string;
  aliases: string[];
  pdfName: string;
  output: 'spot' | 'process';
  cmyk?: CmykPercent;
  overprint?: boolean;
  finish?: InkFinish;
}

/** The die line (#1566): the path the die-maker cuts, stroked on a plate
 *  of its own that prints nothing, on every page with a die-cut. */
export interface PrintDieLineConfig {
  /** `'page'` (default) strokes the die line on each page with a die-cut,
   *  overprinting, on its own plate (and, outside PDF/X-1a, in an optional
   *  content group a reader can hide); `'none'` leaves it out. */
  output?: 'page' | 'none';
  /** The plate's name, as the printer and the die-maker call it. Default
   *  `'Die'` (`CutContour`, `Dieline`, `Troquel`…). */
  ink?: string;
  /** The plate's alternate, how proofs show it. Default 100 % magenta. */
  cmyk?: CmykPercent;
  /** Stroke width. Default 0.25 pt. */
  width?: Dimension;
}

export interface ResolvedPrintDieLineConfig {
  output: 'page' | 'none';
  ink: string;
  cmyk: CmykPercent;
  width: Dimension;
}

/** The plates a job prints on (`print.plates`): a two-ink (or one-ink)
 *  book. Every colour is set on these plates only — a colour of another
 *  ink is projected onto them, the closest mix of their tints — and
 *  pictures print as monotones or duotones on `images`. */
export interface PrintPlatesConfig {
  /** The plates, as the PDF names them: `Cyan`, `Magenta`, `Yellow` and
   *  `Black` for the process inks, a spot ink by its plate name (or a
   *  name or alias the ink table gives it). Empty or absent: every
   *  plate, as before. */
  inks?: string[];
  /** The plates pictures print on: one makes a monotone, two a duotone.
   *  Defaults to `Black` when the job prints it, else to the first plate. */
  images?: string[];
  /** The tone curve of each picture plate, by plate name: points
   *  `[tone, ink]` in percent, tone 0 the paper and 100 the darkest
   *  shadow. A monotone defaults to a straight line; a duotone puts the
   *  first plate on the shadows and the second on the middle tones. */
  curves?: Record<string, Array<[number, number]>>;
}

export interface ResolvedPrintPlatesConfig {
  inks: string[];
  images: string[];
  curves: Record<string, Array<[number, number]>>;
}

/** How pictures' colours are read and printed (`print.imageColor`). */
export interface PrintImageColorConfig {
  /** A picture's own ICC profile (a PNG's `iCCP`, a JPEG's `ICC_PROFILE`):
   *  `'use'` reads its pixels through it, so an Adobe RGB or Display P3
   *  photograph separates as it looks; `'ignore'` (default) reads every
   *  RGB picture as sRGB. */
  embeddedProfile?: 'use' | 'ignore';
  /** A profile every RGB picture is read through instead of its own or
   *  sRGB: a stored `.icc` (`fileId`, its bytes from `resourceBytes`). */
  assignedRgbProfile?: { name: string; fileId: string };
  /** How greyscale pictures print, on black alone: `'profile'` matches
   *  their tones through the output profile's black, its dot gain
   *  included; a number is the press's dot gain at the 50 % tone, percent
   *  (10–30 typically), compensated instead; `'none'` (default) writes
   *  their values as they are, as before. */
  grayDotGain?: 'profile' | 'none' | number;
  /** A CMYK picture whose own profile is another press condition's
   *  (a photograph separated for SWOP in a FOGRA book): `'convert'`
   *  separates it again for the output condition — a TIFF or Photoshop
   *  picture from its pixels; a JPEG, whose CMYK pixels are not decoded
   *  here, is tagged with its own profile in PDF/X-4 for the printer's
   *  RIP to convert, and passed through in PDF/X-1a (the preflight says
   *  so) — `'keep'` (default) prints its values as they are. */
  cmykProfile?: 'convert' | 'keep';
}

export interface ResolvedPrintImageColorConfig {
  embeddedProfile: 'use' | 'ignore';
  assignedRgbProfile?: { name: string; fileId: string };
  grayDotGain: 'profile' | 'none' | number;
  cmykProfile: 'convert' | 'keep';
}

/** Print production: the PDF/X standard, the output profile CMYK is
 *  separated with, how black prints, and the preflight thresholds. Layout
 *  ignores it; postext-pdf and the preflight read it. */
export interface PrintConfig {
  /** PDF/X flavour. Defaults to `'none'`. Any PDF/X standard writes CMYK
   *  through the output profile whatever `pdfGeneration.colorSpace` says. */
  standard?: PdfXStandard;
  /** The output profile, by catalogue id (`OUTPUT_PROFILES`), or
   *  `'custom'` for `customProfile`. Defaults to `'fogra39'`. */
  outputProfile?: string;
  customProfile?: CustomOutputProfile;
  /** Defaults to `'relative'`. */
  renderingIntent?: PrintRenderingIntent;
  /** Map sRGB black to the darkest printable black (relative intent).
   *  Defaults to true. */
  blackPointCompensation?: boolean;
  /** Convert RGB pictures to the output CMYK. PDF/X-1a always does; in
   *  PDF/X-4 false keeps them RGB, tagged sRGB, for the printer's RIP.
   *  Defaults to true. */
  convertImages?: boolean;
  /** Total area coverage limit, percent. Defaults to the profile's. */
  inkLimit?: number;
  black?: PrintBlackConfig;
  preflight?: PrintPreflightConfig;
  /** The ink table: renames, merges and process conversions of the job's
   *  spot inks. An ink it does not list prints as its colours define it. */
  inks?: PrintInk[];
  /** The plates the job prints on: two-ink printing. */
  plates?: PrintPlatesConfig;
  /** How pictures' colours are read: their profiles, greyscale. */
  imageColor?: PrintImageColorConfig;
  /** The die line of the book's die-cuts (`dieCuts`, #1566). */
  dieLine?: PrintDieLineConfig;
}

/** Print production with every default filled in. */
export interface ResolvedPrintConfig {
  standard: PdfXStandard;
  outputProfile: string;
  customProfile?: CustomOutputProfile;
  renderingIntent: PrintRenderingIntent;
  blackPointCompensation: boolean;
  convertImages: boolean;
  /** The configured limit, else the profile's. */
  inkLimit: number;
  black: ResolvedPrintBlackConfig;
  preflight: ResolvedPrintPreflightConfig;
  inks: ResolvedPrintInk[];
  plates: ResolvedPrintPlatesConfig;
  imageColor: ResolvedPrintImageColorConfig;
  dieLine: ResolvedPrintDieLineConfig;
}

/** How postext-pdf writes the file. Layout ignores it; the VDT carries it
 *  (`doc.config.pdfGeneration`), and `renderToPdf` takes each setting from
 *  its own options first, then from here (the first document's, for a
 *  book), then from the defaults. */
export interface PdfGenerationConfig {
  /** Emit PDF outlines (bookmarks) so readers can jump between headings. */
  outlines?: boolean;
  /** When true, convert every colour in the rendered PDF to `colorSpace`. */
  forceColorSpace?: boolean;
  /** Target colour space when `forceColorSpace` is true. */
  colorSpace?: PdfColorSpace;
  /** Emit an accessible, tagged PDF (PDF/UA-1 oriented): a logical structure
   *  tree (headings, paragraphs, lists, tables, figures with alt text,
   *  formulas, links), the document language and title, and every purely
   *  decorative mark (backgrounds, rules, running headers and footers, cut
   *  marks) flagged as an artifact so assistive technology skips it.
   *  Defaults to true. */
  accessible?: boolean;
  /** Draw the baseline grid (`page.baselineGrid`, while it is on) in the
   *  PDF, as the canvas and HTML do on screen. `false` keeps the grid a
   *  screen guide for checking the page, out of a file meant for print.
   *  Defaults to true. */
  baselineGrid?: boolean;
  /** How form fields (chips with a `field`) write numbers and the face
   *  they show values in. Output only: the layout does not read it. The
   *  host's own `forms` option of `renderToPdf` and of the canvas
   *  (`RenderPageOptions.forms`) wins field by field. */
  forms?: PdfFormsConfig;
}

/** The face form fields show their values in: `'chip'` the face each
 *  field's chip is set in, `'helvetica'` (nothing embedded), or a face of
 *  the document's fonts. */
export type PdfFormFieldFont = 'chip' | 'helvetica' | { family: string; weight?: number; style?: 'normal' | 'italic' };

/** `pdfGeneration.forms`: the number style of form fields (as
 *  `FormNumberOptions`) and their face. */
export interface PdfFormsConfig {
  /** The currency symbol for `format="currency"`. Default `'€'`. */
  currency?: string;
  /** The symbol before the number (`€ 12,50`), else after it. Default
   *  true. */
  currencyBefore?: boolean;
  /** Acrobat's separator style: 0 `1,234.56`, 1 `1234.56`, 2 `1.234,56`,
   *  3 `1234,56`. Default from the document language. */
  separatorStyle?: 0 | 1 | 2 | 3;
  /** The face of the fields in the PDF. Default `'chip'`. */
  font?: PdfFormFieldFont;
}

/** What goes into a generated PDF with every default filled in. */
export interface ResolvedPdfGenerationConfig {
  outlines: boolean;
  forceColorSpace: boolean;
  colorSpace: PdfColorSpace;
  accessible: boolean;
  baselineGrid: boolean;
  /** As set (its defaults depend on the document language). */
  forms?: PdfFormsConfig;
}
