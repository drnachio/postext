// The options of a postext document shown as a book and the viewer it
// returns (#1276: split out of postext.ts).
import type { PrintPreview, VDTDocument } from 'postext';
import type { FolioOptions, FolioViewer, FolioAppearance, FolioPagePoint } from '../viewer.js';

export interface FolioDocumentOptions extends Omit<FolioOptions, "pages" | "firstPageRecto" | "binding" | "at" | "aspect"> {
  /** The page to open on (0-based). Default 0. */
  at?: number;
  /** Spreads painted on either side of the open one; pages farther away
   *  are let go (drawn as blank paper should a long turn sweep past them).
   *  Default 3. */
  window?: number;
  /** Passed to `renderPageToCanvas` (see its `RenderPageOptions`). */
  singleInk?: boolean;
  pageNegative?: boolean;
  /** The print preview (soft proof) of the pages (`createPrintPreview`).
   *  With `paper: true` the proof brings the paper's white: give the book
   *  a neutral paper shade meanwhile, or it tints that paper again. */
  printPreview?: PrintPreview;
  /** A page's text alternative. Default `Page n`. */
  alt?: (index: number) => string;
  /**
   * Draws over a painted page (a selection, a caret): `ctx` is set to the
   * page's own pixels (the untrimmed sheet, as the document's coordinates
   * are), over the page as painted. Returns whether it drew anything. Run
   * when a page is painted and on `redecorate`.
   */
  decorate?: (index: number, ctx: CanvasRenderingContext2D) => boolean;
  /**
   * Videos printed on the pages play there (#477): a click on a video's
   * poster plays it on the page (in every pointer mode), a click on it
   * again pauses it, and it goes on playing while its leaf turns. Several
   * may play at once (#507, up to eight drawn): starting a video stops the
   * other exclusive ones (`player.exclusive`, the default) and holds those
   * playing alongside (`exclusive: false`) until it pauses or ends; one
   * playing alongside pauses only the exclusive ones. A video with
   * `player.autoplay` starts by itself, muted: an exclusive one the first
   * time its spread is shown (with its sound once the reader has
   * interacted with the page), one playing alongside each time its page
   * comes into view, unless the reader asks for less motion
   * (`prefers-reduced-motion`). A video stops when the book comes to rest
   * on a spread that does not show it. Self-hosted videos only (a file, or its
   * address: MP4, WebM or an HLS stream); a YouTube or Vimeo poster turns
   * the page as any other. The video's server must allow cross-origin
   * reads (CORS) for WebGL to draw it. Default true.
   */
  videos?: boolean;
  /** The address a self-hosted video's file plays from (an object URL for
   *  its `fileId`); without one, its production address (`video.url`). */
  videoUrl?: (fileId: string) => string | undefined;
  /** Told when a video on a page starts playing, pauses, stops or cannot
   *  play (`error`: no address, a refused cross-origin read, no HLS). */
  onVideo?: (event: { resourceId: string; page: number; state: "playing" | "paused" | "stopped" | "error" }) => void;
}

export interface FolioDocumentViewer extends FolioViewer {
  /** Shows another layout of the book (after an edit), on the same page
   *  unless `at` says otherwise. A page that reads the same as before
   *  keeps its painting; `repaint` paints every page again (an image that
   *  came in after the pages were painted). `appearance` is laid over the
   *  host's own, as `setAppearance` does, for the new document (a chapter
   *  saying how many pages of the book lie round it). */
  setDocument(doc: VDTDocument, options?: { at?: number; repaint?: boolean; appearance?: FolioAppearance }): void;
  /** Draws the decorations (`decorate`) again on these pages, or on every
   *  painted page; the book shows them at once, on a turning leaf too. */
  redecorate(pages?: Iterable<number>): void;
  /** Plays or pauses the video printed at a point of a page, as a click
   *  there does; false when no playable video lies there. */
  toggleVideoAt(point: FolioPagePoint): boolean;
  /** Stops the videos playing on the pages (their posters show again). */
  stopVideo(): void;
}
