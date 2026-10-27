import type { Dimension } from '../page.js';

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
}

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
}

export interface ResolvedPdfGenerationConfig {
  outlines: boolean;
  forceColorSpace: boolean;
  colorSpace: PdfColorSpace;
  accessible: boolean;
}
