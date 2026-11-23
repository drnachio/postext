// The print cover on the boards (#1685): the outside of the front and back
// covers as two board leaves wrapped round the document's pages, so the
// book closes on its printed cover and opens like the real one. The host
// keeps speaking of the document's own pages: page indexes, spreads and
// points are moved past the boards on the way in and back on the way out.
import { resolveFolioConfig, type VDTDocument } from 'postext';
import type { PageSource } from '../pageFlip.js';
import type { FolioAppearance, FolioLabels, FolioPage, FolioPagePoint, FolioState, FolioViewer } from '../viewer/types.js';
import { firstPageIsRecto } from './book.js';

/** Where the boards stand round the document's pages: `lead` pages before
 *  them (the front cover and its inside), `trail` after them (a blank
 *  verso when the last page is a recto, the inside of the back cover and
 *  the back cover). */
export interface CoverBoards {
  lead: number;
  trail: number;
  /** A blank page before the back board (the last page is a recto). */
  pad: number;
  front?: PageSource;
  back?: PageSource;
  frontAlt?: string;
  backAlt?: string;
}

export const NO_BOARDS: CoverBoards = { lead: 0, trail: 0, pad: 0 };

/** The boards a document is shown with: none unless the host gives the
 *  cover's faces, the book has no covers of its own (`binding.cover:
 *  'pages'`) and is bound with boards (not stapled, not a folded
 *  newspaper). The front board only before the book's first page (a
 *  chapter from the middle of the book has none), the back one only after
 *  its last. */
export function boardsOf(doc: VDTDocument, appearance: FolioAppearance | undefined): CoverBoards {
  const faces = appearance?.coverFaces;
  if (!faces || (!faces.front && !faces.back)) return NO_BOARDS;
  const binding = resolveFolioConfig(appearance && "folio" in appearance ? appearance.folio : doc.config.folio).binding;
  if (binding.cover === "pages" || binding.type === "saddleStitch" || binding.type === "folded") return NO_BOARDS;
  const n = doc.pages.length;
  const before = appearance?.extraPages?.before ?? doc.pageIndexOffset ?? 0;
  const after = appearance?.extraPages?.after ?? Math.max(0, (doc.bookPageCount ?? 0) - before - n);
  const front = faces.front && before === 0 && firstPageIsRecto(doc) ? faces.front : undefined;
  const back = faces.back && after === 0 ? faces.back : undefined;
  const lead = front ? 2 : 0;
  // The inside of the back cover is a recto: a blank verso goes before it
  // when the book ends on a recto.
  const firstRecto = front ? true : firstPageIsRecto(doc);
  const pad = back && (lead + n) % 2 === (firstRecto ? 1 : 0) ? 1 : 0;
  return {
    lead,
    trail: back ? pad + 2 : 0,
    pad,
    ...(front ? { front, ...(faces.frontAlt ? { frontAlt: faces.frontAlt } : {}) } : {}),
    ...(back ? { back, ...(faces.backAlt ? { backAlt: faces.backAlt } : {}) } : {}),
  };
}

/** The document's pages with the boards round them. */
export function withBoards(pages: FolioPage[], b: CoverBoards): FolioPage[] {
  if (!b.lead && !b.trail) return pages;
  const face = (src: PageSource, alt?: string): FolioPage => (alt ? { src, alt } : src);
  return [
    ...(b.front ? [face(b.front, b.frontAlt), ""] : []),
    ...pages,
    ...(b.back ? [...(b.pad ? [""] : []), "", face(b.back, b.backAlt)] : []),
  ];
}

/** The appearance the viewer is given: the boards turn as the book's own
 *  covers. */
export function boardedAppearance(appearance: FolioAppearance, b: CoverBoards): FolioAppearance {
  if (!b.lead && !b.trail) return appearance;
  return { ...appearance, covers: { front: !!b.front, back: !!b.back } };
}

/** Moves page indexes, spreads and points between the document's pages
 *  and the viewer's, which carries the boards too. */
export interface BoardMap {
  /** The viewer's page index of a document page. */
  toView(page: number): number;
  /** The document page a viewer page shows, or undefined for a board. */
  toDoc(page: number): number | undefined;
  state(s: FolioState): FolioState;
  point(p: FolioPagePoint | null): FolioPagePoint | null;
}

export function boardMap(b: () => CoverBoards, pageCount: () => number): BoardMap {
  const toDoc = (page: number) => {
    const d = page - b().lead;
    return d >= 0 && d < pageCount() ? d : undefined;
  };
  return {
    toView: (page) => page + b().lead,
    toDoc,
    state(s) {
      const { lead } = b();
      if (!lead && !b().trail) return s;
      const pages = s.pages.map(toDoc).filter((d): d is number => d !== undefined);
      const n = pageCount();
      // Only boards on show (the book closed on one, or the inside of a
      // cover): the page nearest them.
      const shown = s.pages[0] ?? 0;
      if (!pages.length && n) pages.push(shown < lead ? 0 : n - 1);
      // Closed: its cover's face alone on show.
      const last = lead + n + b().trail - 1;
      const closed = s.pages.length === 1 && b().front && shown === 0 ? ("front" as const) : s.pages.length === 1 && b().back && shown === last ? ("back" as const) : undefined;
      const cover = { front: !!b().front, back: !!b().back, ...(closed ? { closed } : {}) };
      return { spread: lead ? Math.max(0, s.spread - 1) : s.spread, pages, cover };
    },
    point(p) {
      if (!p) return p;
      const page = toDoc(p.page);
      return page === undefined ? null : { ...p, page };
    },
  };
}

/** The page count under the book in the document's own pages. */
export function boardedLabels(labels: Partial<FolioLabels> | undefined, count: FolioLabels["count"], map: BoardMap, pageCount: () => number): Partial<FolioLabels> {
  const own = labels?.count ?? count;
  return {
    ...labels,
    count: (pages) => {
      const shown = pages.map(map.toDoc).filter((d): d is number => d !== undefined);
      // On a board (the book closed) no page of the document is open.
      return shown.length ? own(shown, pageCount()) : "";
    },
  };
}

/** The viewer as the host sees it: in the document's pages. */
export function boardedViewer(viewer: FolioViewer, map: BoardMap, b: () => CoverBoards): FolioViewer {
  const wrapped: FolioViewer = Object.create(viewer);
  Object.assign(wrapped, {
    goToPage: (index: number, options?: { instant?: boolean }) => {
      // A position restored to the page under the board the book lies
      // closed on leaves it closed; the reader turning there opens it.
      const s = map.state(viewer.state);
      if (options?.instant && s.cover?.closed && s.pages[0] === index) return;
      viewer.goToPage(map.toView(index), options);
    },
    goToSpread: (index: number, options?: { instant?: boolean }) => viewer.goToSpread(index + (b().lead ? 1 : 0), options),
    setPages: (pages: FolioPage[], options?: Parameters<FolioViewer["setPages"]>[1]) => {
      const bb = b();
      viewer.setPages(withBoards(pages, bb), {
        ...options,
        ...(options?.at !== undefined ? { at: map.toView(options.at) } : {}),
        ...(bb.lead && options && "firstPageRecto" in options ? { firstPageRecto: true } : {}),
      });
    },
    setPageVideo: (video: Parameters<FolioViewer["setPageVideo"]>[0]) => viewer.setPageVideo(video ? { ...video, page: map.toView(video.page) } : null),
    setPageVideos: (videos: Parameters<FolioViewer["setPageVideos"]>[0]) => viewer.setPageVideos(videos.map((v) => ({ ...v, page: map.toView(v.page) }))),
    pageAt: (event: { clientX: number; clientY: number }) => map.point(viewer.pageAt(event)),
    pointOnScreen: (point: FolioPagePoint) => viewer.pointOnScreen({ ...point, page: map.toView(point.page) }),
  });
  Object.defineProperty(wrapped, "state", { get: () => map.state(viewer.state) });
  return wrapped;
}
