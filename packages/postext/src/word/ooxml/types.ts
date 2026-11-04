// The OOXML package writer (#1389) both Word variants build on. Callers
// produce WordprocessingML strings for the main parts; the package owns
// relationships, content types, media, fonts, properties, the export map
// and the zip.

import type { ExportMap } from '../anchors/types.js';

export interface DocxCoreProps {
  title?: string;
  author?: string;
  language?: string;
  /** ISO timestamp; absent = now. Tests pass a fixed value. */
  date?: string;
}

export interface DocxSettings {
  /** Word's own hyphenation (off for the formatted variant). */
  autoHyphenation?: boolean;
  /** Embed fonts (`w:embedTrueTypeFonts`). */
  embedFonts?: boolean;
  /** `w:compatSetting enableOpenTypeFeatures`. */
  openTypeFeatures?: boolean;
  /** Default tab stop in twips. */
  defaultTabStop?: number;
  /** Mirror margins / right-to-left book (gutter on the right). */
  rtlGutter?: boolean;
  evenAndOddHeaders?: boolean;
  /** Extra raw children for `w:settings`. */
  extra?: string;
}

export interface EmbeddedFontFace {
  /** Word family name (unique per embedded family). */
  family: string;
  slot: 'regular' | 'bold' | 'italic' | 'boldItalic';
  /** Static TrueType bytes (already merged/instanced, not obfuscated). */
  bytes: Uint8Array;
  /** `w:font` metadata from the font tables. */
  panose?: string;
  charset?: string;
  familyClass?: 'roman' | 'swiss' | 'modern' | 'script' | 'decorative' | 'auto';
  pitch?: 'variable' | 'fixed';
  sig?: { usb0: string; usb1: string; usb2: string; usb3: string; csb0: string; csb1: string };
}

export interface DocxPackageInput {
  /** Inner XML of `w:body` (paragraphs, tables, the final `w:sectPr`). */
  body: string;
  /** Inner XML of `w:styles` after `w:docDefaults` (or a full replacement via `stylesXml`). */
  styles: string;
  /** `w:docDefaults` element (or its inner XML). */
  docDefaults?: string;
  /** A whole `word/styles.xml` replacing `styles` + `docDefaults`. */
  stylesXml?: string;
  /** Inner XML of `w:numbering` (absent = no numbering part). */
  numbering?: string;
  /** `w:footnote` elements with ids ≥ 1 (separators are added). */
  footnotes?: string[];
  endnotes?: string[];
  /** Header/footer parts: id → inner XML of `w:hdr`/`w:ftr`. Referenced from
   *  `sectPr` with `r:id` = the returned relationship ids (see `rels`). */
  headers?: Record<string, string>;
  footers?: Record<string, string>;
  comments?: string;
  core?: DocxCoreProps;
  settings?: DocxSettings;
  fonts?: EmbeddedFontFace[];
  exportMap?: ExportMap;
  /** Extra custom document properties (string values). */
  customProps?: Record<string, string>;
}

/** Collects media, links and other relationships while the body is
 *  written; `build` assembles the package. */
export interface DocxPackageBuilder {
  /** Register a picture; returns the relationship id to use in `a:blip r:embed`. */
  addMedia(bytes: Uint8Array, ext: 'png' | 'jpeg' | 'gif' | 'svg' | 'emf'): string;
  /** External hyperlink; returns its relationship id (deduplicated). */
  addLink(url: string): string;
  /** Relationship id of the header/footer part registered under `id`. */
  headerRel(id: string): string;
  footerRel(id: string): string;
  /** Unique ids for `wp:docPr`, bookmarks and drawing objects. */
  nextDrawingId(): number;
  nextBookmarkId(): number;
  build(input: DocxPackageInput): Uint8Array;
}
