import type { ColorValue, Dimension } from '../page.js';

/** How the address of an external link (`[official page](https://…)`) is
 *  printed (#1302). Every output keeps the link clickable; this decides
 *  what a reader of the printed page sees of it:
 *  - `'none'`: nothing (the link text alone, as on screen);
 *  - `'inline'`: the address in parentheses after the link text;
 *  - `'notes'`: a note marker after the link text, and a note numbered
 *    and placed with the footnotes (`footnotes.placement`) that prints the
 *    address, a QR code that opens it, or both ({@link LinksConfig.show}). */
export type LinkPrintMode = 'none' | 'inline' | 'notes';

/** What a link note prints: the address, a QR code, or both side by side. */
export type LinkNoteContent = 'url' | 'qr' | 'both';

/** The QR code of a link note (`links.show: 'qr' | 'both'`). */
export interface LinkQrConfig {
  /** Side of the code with its quiet zone. Default `15mm`. The note is at
   *  least that tall: its lines run beside the code. Keep each module at
   *  least a third of a millimetre for phone cameras. */
  size?: Dimension;
  /** Error-correction level `'L'`, `'M'` (the default), `'Q'` or `'H'`;
   *  raised automatically while the code stays the same size. */
  errorCorrection?: 'L' | 'M' | 'Q' | 'H';
  /** Light modules around the code, in modules (0–8). Default `1`: the
   *  note's paper and the gap beside it complete the quiet zone. */
  quietZone?: number;
  /** Dark modules. Default the notes' text colour. */
  color?: ColorValue;
  /** Where the code stands beside the note's text: at the end of the
   *  line (`'end'`, the right in left-to-right text, the default) or at
   *  its start. */
  side?: 'start' | 'end';
  /** Space between the code and the note's text. Default `1em` of the
   *  note size. */
  gap?: Dimension;
}

/** External links in print (#1302): what a printed page shows of the
 *  address a link points at. Only `http:` and `https:` links count; a
 *  `mailto:`, a `tel:` and a link inside the document stay as they are. */
export interface LinksConfig {
  /** Default `'none'` (see {@link LinkPrintMode}). */
  print?: LinkPrintMode;
  /** `print: 'notes'`: what each note prints. Default `'url'`. */
  show?: LinkNoteContent;
  /** How the address is written: in full (`'full'`, the default) or
   *  without its `https://`, a leading `www.` and a trailing `/`
   *  (`'short'`). The link itself keeps the full address. */
  urlDisplay?: 'full' | 'short';
  /** `print: 'notes'`: a link to an address an earlier link of the
   *  chapter already noted takes a note of its own (`'every'`, the
   *  default) or the earlier note's number (`'first'`). */
  repeat?: 'every' | 'first';
  /** A link whose text is its own address (`<https://…>`): left as it is
   *  (`'skip'`, the default), or given a note or parentheses like any
   *  other. With `show: 'qr'` or `'both'` it takes a note for the code. */
  visibleUrls?: 'skip' | 'note';
  qr?: LinkQrConfig;
  /** How the text of a link looks, in the outputs it lists (#1402). */
  style?: LinkStyleConfig;
}

/** An output a link style can be painted in: the Canvas preview, the Folio
 *  book, the PDF, the HTML viewer (`renderToHtml`), an EPUB and a SCORM
 *  package. */
export type LinkStyleOutput = 'canvas' | 'folio' | 'pdf' | 'html' | 'epub' | 'scorm';

/** The line under a link's text. */
export type LinkUnderline = 'none' | 'solid' | 'dotted' | 'dashed';

/** The look of a link's text (`[text](url)`, #1402): a colour and a line
 *  under it, painted in the outputs {@link outputs} lists. Paint only: the
 *  lines are the same with or without it, so outputs that share a layout
 *  can differ (coloured and underlined on screen, as set in print). A
 *  citation linked to its entry is not styled. */
export interface LinkStyleConfig {
  /** Colour of the link's text. Unset: the colour of the text around it. */
  color?: ColorValue;
  /** Default `'none'`. */
  underline?: LinkUnderline;
  /** Colour of the underline. Unset: the link's colour. */
  underlineColor?: ColorValue;
  /** Where the style is painted. Default `['html', 'epub', 'scorm']`: the
   *  outputs a reader clicks in. */
  outputs?: LinkStyleOutput[];
}

export interface ResolvedLinkStyleConfig {
  color?: ColorValue;
  underline: LinkUnderline;
  underlineColor?: ColorValue;
  outputs: LinkStyleOutput[];
}

export interface ResolvedLinkQrConfig {
  size: Dimension;
  errorCorrection: 'L' | 'M' | 'Q' | 'H';
  quietZone: number;
  color?: ColorValue;
  side: 'start' | 'end';
  gap: Dimension;
}

export interface ResolvedLinksConfig {
  print: LinkPrintMode;
  show: LinkNoteContent;
  urlDisplay: 'full' | 'short';
  repeat: 'every' | 'first';
  visibleUrls: 'skip' | 'note';
  qr: ResolvedLinkQrConfig;
  /** Present when the config sets `links.style`. */
  style?: ResolvedLinkStyleConfig;
}
