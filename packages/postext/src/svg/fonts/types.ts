// Types of SVG font inlining: requests, providers, reports and options.

/** `'normal'` or `'italic'` (CSS `oblique` is set as italic). */
export type SvgFontStyle = 'normal' | 'italic';

/** The font file formats an `@font-face` in an SVG image can carry. */
export type SvgFontFormat = 'woff2' | 'woff' | 'ttf' | 'otf';

/** What a run of an SVG's text asks for: the named families of its
 *  `font-family` list in order (generic families such as `sans-serif` left
 *  out), its weight and style, and the characters it sets. Runs with the
 *  same list, weight and style are one request. */
export interface SvgFontRequest {
  families: string[];
  weight: number;
  style: SvgFontStyle;
  /** Unicode code points of the run's text (a space always included). */
  codePoints: Set<number>;
}

/** What a provider is told about a face: the characters the SVG sets in
 *  it (postext-pdf's `PdfFontRequest`). */
export interface SvgFontProviderRequest {
  codePoints: ReadonlySet<number>;
}

/** The bytes of a face: one file, or the several files (unicode-range
 *  slices) that hold the characters asked for. Reject for a face the
 *  provider cannot supply. Same contract as postext-pdf's
 *  `PdfFontProvider`, which can be passed as it is. */
export type SvgFontProvider = (
  family: string,
  weight: number,
  style: SvgFontStyle,
  request?: SvgFontProviderRequest,
) => Promise<Uint8Array | Uint8Array[]>;

/** A provider that answers from bytes in memory: nothing (`null` /
 *  `undefined`) for a face it does not hold. */
export type SvgFontSyncProvider = (
  family: string,
  weight: number,
  style: SvgFontStyle,
  request?: SvgFontProviderRequest,
) => Uint8Array | Uint8Array[] | null | undefined;

/** Why a face was or was not embedded in an SVG. */
export type SvgFontStatus =
  /** Embedded as `@font-face` data URIs. */
  | 'inlined'
  /** The SVG declares the family itself (its own `@font-face`). */
  | 'declared'
  /** The provider had no face for it: the image falls back. */
  | 'unavailable'
  /** Left out on purpose (`withhold`: not redistributable). */
  | 'withheld'
  /** Found, but the faces together exceed `maxBytes`: nothing embedded. */
  | 'tooLarge';

/** One face an SVG asks for and what became of it. */
export interface SvgFontFaceReport {
  family: string;
  weight: number;
  style: SvgFontStyle;
  status: SvgFontStatus;
  /** The family whose face was embedded under `family`'s name
   *  ({@link InlineSvgFontsOptions.standIn}). */
  standIn?: string;
  /** Bytes of the files found for it (inlined or too large). */
  bytes?: number;
  /** Number of files (slices) found for it. */
  files?: number;
}

/** A problem inlining fonts into one SVG, as hosts report it: a family
 *  its text names with no face to embed (`svgFontUnavailable`), or faces
 *  over the size cap (`svgFontsTooLarge`, nothing embedded). Hosts add the
 *  picture's `fileId` / `resourceId`. */
export type SvgFontWarning =
  | { kind: 'svgFontUnavailable'; family: string; weight: number; style: SvgFontStyle }
  | { kind: 'svgFontsTooLarge'; bytes: number; maxBytes: number };

export interface InlineSvgFontsOptions {
  /** Most font bytes embedded in one SVG (before base64, which adds a
   *  third). Faces that together exceed it are not embedded at all, and
   *  `svgFontsTooLarge` is reported. Default {@link DEFAULT_SVG_FONT_MAX_BYTES}. */
  maxBytes?: number;
  /** Formats to embed; files of other formats are skipped. Default all
   *  four (WOFF2, WOFF, TrueType, OpenType). */
  formats?: readonly SvgFontFormat[];
  /** Families to leave out, such as those marked not redistributable in a
   *  file that leaves the app: their reference stays and the reader falls
   *  back, as for the book's own font files. */
  withhold?: (family: string) => boolean;
  /** The open family whose faces take the place of a family `withhold`
   *  names (#993): the provider is asked for the stand-in's face of the
   *  same weight and slant and it is embedded under the withheld family's
   *  name, so the picture's text keeps its width and its reference. A
   *  family without a stand-in, or whose stand-in the provider has no face
   *  of, stays withheld. The stand-in is open by definition (see
   *  `exportStandInOf`). */
  standIn?: (family: string) => string | undefined;
  /** Told of each family left out by `withhold` (once per SVG). */
  onWithheld?: (family: string) => void;
  /** Told of a family with no face and of a size cap hit. */
  onWarning?: (warning: SvgFontWarning) => void;
}

/** The result of inlining fonts into one SVG. */
export interface SvgFontInlining {
  /** The markup with the faces embedded (the input itself when nothing
   *  was). */
  svg: string;
  /** Every face the text asks for, in first-seen order. */
  faces: SvgFontFaceReport[];
  /** Font bytes embedded (0 when none or over the cap). */
  bytes: number;
}

/** Default {@link InlineSvgFontsOptions.maxBytes}: 2 MiB of font files. */
export const DEFAULT_SVG_FONT_MAX_BYTES = 2 * 1024 * 1024;
