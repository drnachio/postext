// The folio viewer's public types: its pages, options, labels and the viewer
// it returns (#1276: split out of viewer.ts).
import type { FolioPaperConfig, FolioConfig } from 'postext';
import type { PageSource, PageVideoFrame } from '../pageFlip.js';

/** A page of the book: its source, or its source with a text alternative
 *  and the paper it is printed on when that is not the book's (a plate
 *  section on gloss in a matte book). */
export type FolioPage = PageSource | { src: PageSource; alt?: string; paper?: FolioPaperConfig };

/** How the 3D book is presented. */
export interface FolioAppearance {
  /** View, paper, binding, desk and light (postext's `folio` config). */
  folio?: FolioConfig;
  /** The trim width of a page in mm (the paper's caliper and the cover's
   *  board are scaled against it). Default 150. */
  pageWidthMm?: number;
  /** Pages of the book before the first page given and after the last
   *  (the other chapters of a book shown a chapter at a time): they are
   *  never drawn, only counted for the thickness of the page block.
   *  `createFolioFromDocument` places the covers by them too: with pages
   *  before, the first page given is not the book's front cover, nor with
   *  pages after the last its back cover (a chapter from the middle of a
   *  book with its own covers turns paper leaves). */
  extraPages?: { before: number; after: number };
  /** Where the scanned desk textures are served (see
   *  `FlipAppearance.textureBaseUrl`). */
  textureBaseUrl?: string;
  /** The first page given is the book's front cover, the last its back
   *  cover (when it falls on a verso): they turn as boards and no case
   *  is drawn round the pages. */
  covers?: { front: boolean; back: boolean };
  /** The picture printed on the spine: the image the `folio.binding.
   *  spineImage` resource names, as a URL (or a drawn canvas or image).
   *  See `FlipAppearance.spineImage`. */
  spineImage?: PageSource;
}

/** What the left button (or one finger) does on the book: `hand` takes
 *  and turns the pages, `orbit` turns the view round the book (what the
 *  right button always does), `select` leaves the pointer to the host (to
 *  select text: `pageAt` says where on which page it is), `magnify` holds
 *  a magnifying glass over the book where the pointer is (#527; a finger
 *  holds it above itself while it touches the screen): the wheel, + and −
 *  change how much it magnifies, Esc puts it away. The pointer is left to
 *  the host under the glass too, a text cursor over the pages (#543):
 *  `pageAt` then says what lies under the glass's centre. */
export type FolioInteraction = "hand" | "orbit" | "select" | "magnify";

/** The magnifying glass (`interaction: 'magnify'`). */
export interface FolioMagnifier {
  /** How many times it magnifies the book at its centre (1.5 … 10).
   *  Default: enough to show the page at about 5.5 CSS px a millimetre
   *  (small print readable), between 2 and 8. */
  zoom?: number;
  /** The glass's diameter with its rim, in CSS px. Default 42 % of the
   *  viewer's shorter side, between 180 and 520. */
  diameter?: number;
}

/** Sharper paintings of the pages for the magnifying glass: without them
 *  it magnifies the pages as given (an image at its natural size, a
 *  canvas at its own). */
export interface FolioPageDetail {
  /** Page `index` painted `deviceWidth` px wide (or as near as the host
   *  can): the glass shows it in place of the page's own source. */
  paint(index: number, deviceWidth: number): PageSource | Promise<PageSource>;
  /** The glass was put away (another interaction): the paintings can be
   *  let go. */
  release?(): void;
}

/** A point on a page as printed: the page index and where on it, as
 *  fractions of its width and height from its top left corner. */
export interface FolioPagePoint {
  page: number;
  x: number;
  y: number;
}

/** A video drawn on a page of the book (#477): the element playing it and
 *  where its picture lies on the page (see `PageVideoFrame`). */
export interface FolioPageVideo extends PageVideoFrame {
  page: number;
  element: HTMLVideoElement;
}

export interface FolioLabels {
  /** The viewer's accessible name. */
  region: string;
  prev: string;
  next: string;
  /** The pages on show, for the live count under the book: page indexes
   *  (0-based) and the page count. */
  count: (pages: number[], total: number) => string;
}

export interface FolioOptions {
  pages: FolioPage[];
  /** Whether the first page is a recto (it opens alone, on the right of a
   *  left-bound book). Default true. */
  firstPageRecto?: boolean;
  /** The edge the book is bound on. A right-bound book lies mirrored: page
   *  1 alone on the left, pairs [3 | 2], and its pages turn leftward. */
  binding?: "left" | "right";
  /** The page to open on (0-based). Default 0. */
  at?: number;
  /** `double` shows spreads and turns leaves in 3D; `single` one page at a
   *  time; `auto` (default) is single in a box narrower than 560 px. */
  mode?: "auto" | "single" | "double";
  /** A page's width / height, when the pages cannot tell it yet (blank
   *  until painted). Default: the first sized page's, else 1 : √2. */
  aspect?: number;
  /** The colour of blank pages (any CSS colour). Default white. */
  paper?: string;
  /** Turns leaves in 3D when WebGL2 is there and the reader has not asked
   *  for reduced motion. Default true. */
  animate?: boolean;
  /** Draws the ‹ › buttons and the page count. Default true. */
  controls?: boolean;
  /** Shows the page count under the book. Default true. When false it is
   *  still announced to screen readers (a visually hidden live region). */
  showCount?: boolean;
  labels?: Partial<FolioLabels>;
  /** How the 3D book is presented (see {@link FolioAppearance}). */
  appearance?: FolioAppearance;
  /** What the left button does (see {@link FolioInteraction}). Default
   *  `hand`. */
  interaction?: FolioInteraction;
  /** The magnifying glass (see {@link FolioMagnifier}). */
  magnifier?: FolioMagnifier;
  /** Sharper paintings for the magnifying glass (see
   *  {@link FolioPageDetail}). */
  detail?: FolioPageDetail;
  /** Told of every spread that settles: its index and the pages on show. */
  onChange?: (state: FolioState) => void;
  /** Told as soon as the book is sent to another spread (a button, a key,
   *  a page let go past halfway), before its leaves have landed. */
  onTarget?: (state: FolioState) => void;
  /** A click on a page, before it turns the page (hand mode) or reaches
   *  the host (select mode): return true when the click did something else,
   *  such as playing a video printed there. In orbit and select modes it is
   *  asked only where `isPageAction` says a click acts. */
  onPageClick?: (point: FolioPagePoint) => boolean;
  /** Whether a click at this point of a page acts on it (`onPageClick`):
   *  the pointer shows a hand there. */
  isPageAction?: (point: FolioPagePoint) => boolean;
  /** Told when the page slots change size: a host painting pages for the
   *  viewer paints them at `deviceWidth` × `deviceHeight` pixels, so they
   *  are shown 1:1 both at rest and on a turning leaf. */
  onLayout?: (size: FolioPageSize) => void;
}

/** One page slot of the spread: its CSS size, and the device pixels it
 *  covers (the size a page bitmap is shown 1:1 at). */
export interface FolioPageSize {
  width: number;
  height: number;
  deviceWidth: number;
  deviceHeight: number;
}

export interface FolioState {
  spread: number;
  /** The page indexes on show (one or two). */
  pages: number[];
}

export interface FolioViewer {
  /** The viewer's root element. */
  readonly element: HTMLElement;
  /** Turns to the spread that shows page `index`; `instant` opens it
   *  there without turning the leaves (a link, a restored position). */
  goToPage(index: number, options?: { instant?: boolean }): void;
  /** Turns to spread `index` (`instant`: opens it there). */
  goToSpread(index: number, options?: { instant?: boolean }): void;
  next(): void;
  prev(): void;
  /** Replaces the pages (a relayout, or more pages painted), staying on
   *  the page on show unless `at` says otherwise. */
  setPages(pages: FolioPage[], options?: Pick<FolioOptions, "firstPageRecto" | "binding" | "at" | "paper" | "mode">): void;
  /** The page slot's size, as last laid out. */
  readonly pageSize: FolioPageSize;
  /** Swaps the labels (a host that changes language). */
  setLabels(labels: Partial<FolioLabels>): void;
  /** Changes how the 3D book is presented. */
  setAppearance(appearance: FolioAppearance): void;
  /** Eases the view back to the one the settings give (after the reader
   *  orbited it with a right-drag). */
  resetView(): void;
  /** The view as it is seen now, in degrees: `tilt` from straight above,
   *  `yaw` round the book (−180 … 180), ready to store as `folio.tilt` and
   *  `folio.yaw`; null without the 3D book. */
  getView(): { tilt: number; yaw: number } | null;
  /** Changes what the left button does. */
  setInteraction(mode: FolioInteraction): void;
  /** How many times the magnifying glass magnifies at its centre; null
   *  goes back to the default (see {@link FolioMagnifier.zoom}). */
  setMagnification(zoom: number | null): void;
  /** The magnifying glass as it is: how many times it magnifies at its
   *  centre, and whether it is held over the book now. */
  getMagnifier(): { zoom: number; held: boolean };
  /** Holds the glass over the middle of the open spread, as the + and −
   *  keys do (in the magnify interaction, on the 3D book), or puts it
   *  away, as Escape does. */
  holdMagnifier(held: boolean): void;
  /** A page's canvas was drawn again in place: shows it again. */
  refreshPage(src: PageSource): void;
  /** Plays a video on a page (#477): drawn over the page's painting, on
   *  the leaf that carries it as it lies or turns; `null` takes it off.
   *  The same as `setPageVideos` with one video or none. */
  setPageVideo(video: FolioPageVideo | null): void;
  /** Plays these videos on their pages together (#507), in place of the
   *  ones shown before; an empty list takes them all off. The WebGL book
   *  draws up to eight at once (any more show their posters); the DOM
   *  spread lays each element over its page. */
  setPageVideos(videos: readonly FolioPageVideo[]): void;
  /** The page under a pointer and where on it, as the book is seen (the
   *  tilted, orbited 3D book included); null off the open pages. In
   *  magnify mode, the point under the glass's centre (#543), which a
   *  finger holds above itself. */
  pageAt(event: { clientX: number; clientY: number }): FolioPagePoint | null;
  /** Where a point of a page lies on screen (client px), when the page
   *  lies open; null otherwise. */
  pointOnScreen(point: FolioPagePoint): { x: number; y: number } | null;
  readonly state: FolioState;
  dispose(): void;
}
