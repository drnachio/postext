// The videos on the document book's pages (#477, #507): their spots, the
// players, starting, stopping, autoplay and following the turns (#1276:
// split out of postext.ts).
import { type PageVideoSpot, pageVideoSpots, spotContains, makeWay, attachVideoSource, isHlsVideo, autoplayPlan, autoKey } from '../videos.js';
import { type PagePlayer, AUTOPLAY_SETTLE_MS, reducedMotion } from './constants.js';
import type { FolioPagePoint } from '../viewer.js';
import type { FolioDocumentOptions } from './types.js';
import type { FolioDocumentState, FolioDocumentLate } from './state.js';

/** What createDocumentVideos takes from createFolioFromDocument. */
export interface DocumentVideosDeps {
  options: FolioDocumentOptions;
  ds: FolioDocumentState;
  dlate: FolioDocumentLate;
}

export function createDocumentVideos(deps: DocumentVideosDeps) {
  const {
    options, ds, dlate
  } = deps;
  // ── Videos on the pages (#477, #507) ──
  /** The video spots of each page of the current document, as found. */
  let spots = new Map<number, PageVideoSpot[]>();
  /** The videos playing (or paused) on the pages, in the order they
   *  started. */
  ds.players = [];
  /** The videos that have started on their own once (`player.autoplay`
   *  with `exclusive`). */
  const autoplayed = new Set<string>();
  /** The videos playing alongside that have started on their own since
   *  their page last came into view (`page|key`). */
  const autoStarted = new Set<string>();

  const spotsOf = (i: number): PageVideoSpot[] => {
    let found = spots.get(i);
    if (!found) {
      const page = ds.current.pages[i];
      found = page ? pageVideoSpots(page, ds.current) : [];
      spots.set(i, found);
    }
    return found;
  };
  /** Where a self-hosted video plays from: its file, else its address. */
  const urlOf = (spot: PageVideoSpot): string | undefined => {
    const v = spot.video;
    if (v.source !== "file") return undefined;
    return (v.fileId ? options.videoUrl?.(v.fileId) : undefined) ?? v.link;
  };
  const spotAt = (point: FolioPagePoint): PageVideoSpot | undefined =>
    options.videos === false ? undefined : spotsOf(point.page).find((s) => urlOf(s) && spotContains(s, point.x, point.y));
  const playerOf = (page: number, spot: PageVideoSpot) => ds.players.find((p) => p.page === page && p.spot.key === spot.key);
  const onShow = (p: PagePlayer) => dlate.viewer.state.pages.includes(p.page);

  const report = (p: PagePlayer, state: "playing" | "paused" | "stopped" | "error") => {
    options.onVideo?.({ resourceId: p.spot.resourceId, page: p.page, state });
  };

  /** Shows the videos that have a frame to show on their pages. */
  function showVideos() {
    dlate.viewer.setPageVideos(
      ds.players
        .filter((p) => p.shown)
        .map((p) => ({ page: p.page, element: p.element, origin: p.spot.origin, across: p.spot.across, down: p.spot.down, ...(p.spot.crop ? { crop: p.spot.crop } : {}) })),
    );
  }

  /** Stops a video: its poster shows again, and the videos it held go on. */
  function stopPlayer(p: PagePlayer, state: "stopped" | "error" = "stopped") {
    if (!ds.players.includes(p)) return;
    ds.players = ds.players.filter((q) => q !== p);
    report(p, state);
    p.element.pause();
    p.release?.();
    if (p.shown) showVideos();
    resumeHeld(p);
  }

  function stopVideos() {
    for (const p of [...ds.players]) stopPlayer(p);
  }

  /** The videos playing alongside that `by` held go on (on show only),
   *  and those set to play on their own that have not started yet start. */
  function resumeHeld(by: PagePlayer) {
    if (by.alongside) return;
    for (const q of ds.players) {
      if (q.heldBy !== by) continue;
      q.heldBy = null;
      if (onShow(q)) void q.element.play().catch(() => {});
    }
    if (!ds.turning) autoplayOn(dlate.viewer.state.pages, { exclusive: false });
  }

  /** A video starts (or goes on): the others make way for it (see
   *  `makeWay`). */
  function makeWayFor(p: PagePlayer) {
    p.heldBy = null;
    // Those waiting for another exclusive video wait for this one now.
    if (!p.alongside) for (const q of ds.players) if (q.heldBy) q.heldBy = p;
    const list = [...ds.players.filter((q) => q !== p), p].map((q) => ({ q, alongside: q.alongside, paused: q.element.paused }));
    const way = makeWay(list[list.length - 1]!, list);
    for (const { q } of way.hold) {
      q.heldBy = p;
      q.element.pause();
    }
    for (const { q } of way.pause) q.element.pause();
    for (const { q } of way.stop) stopPlayer(q);
  }

  /** Plays the video at `spot` on `page`, from its start; `auto` when it
   *  starts on its own. */
  function startVideo(page: number, spot: PageVideoSpot, auto = false) {
    const url = urlOf(spot);
    if (!url) return;
    const player = spot.video.player;
    const alongside = player.exclusive === false;
    const element = document.createElement("video");
    element.playsInline = true;
    element.preload = "auto";
    // WebGL draws the picture only when its server allows the read.
    if (!/^(blob|data):/i.test(url)) element.crossOrigin = "anonymous";
    const range = { start: spot.video.start ?? 0, end: spot.video.end };
    // A loop from the file's start loops by itself (seamlessly); one from
    // later on is sent back by hand.
    element.loop = player.loop && !range.start;
    // A video that starts on its own has its sound once the reader has
    // clicked or typed on the page (the browser allows it then); before
    // that it starts muted, as browsers require, and a click unmutes it.
    // One playing alongside always starts muted on its own: a page of
    // living pictures is a quiet one.
    const activated = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? false;
    element.muted = player.muted || (auto && (alongside || !activated));
    const entry: PagePlayer = { page, spot, element, shown: false, autoMuted: !player.muted && element.muted, alongside, heldBy: null };
    // The others make way at once (an exclusive one, still loading, holds
    // the videos playing alongside from now).
    ds.players = [...ds.players, entry];
    makeWayFor(entry);
    const live = () => ds.players.includes(entry);
    element.addEventListener("error", () => live() && stopPlayer(entry, "error"));
    element.addEventListener("loadedmetadata", () => {
      if (range.start) element.currentTime = range.start;
    }, { once: true });
    element.addEventListener("loadeddata", () => {
      if (!live()) return;
      entry.shown = true;
      showVideos();
    }, { once: true });
    element.addEventListener("play", () => live() && makeWayFor(entry));
    element.addEventListener("playing", () => live() && report(entry, "playing"));
    element.addEventListener("pause", () => {
      if (!live() || element.ended) return;
      report(entry, "paused");
      resumeHeld(entry);
    });
    const atEnd = () => {
      if (!live()) return;
      if (player.loop) {
        element.currentTime = range.start;
        void element.play().catch(() => {});
      } else stopPlayer(entry);
    };
    element.addEventListener("ended", atEnd);
    element.addEventListener("timeupdate", () => {
      if (range.end && element.currentTime >= range.end) atEnd();
    });
    // The picture's height on screen: an HLS stream needs no larger variant.
    const size = dlate.viewer.pageSize;
    const maxHeight = Math.max(Math.hypot(spot.down.x * size.deviceWidth, spot.down.y * size.deviceHeight), Math.hypot(spot.across.x * size.deviceWidth, spot.across.y * size.deviceHeight));
    void attachVideoSource(element, url, { hls: isHlsVideo(spot.video, url), maxHeight, corsTag: true }).then(
      (release) => {
        if (!live()) return release();
        entry.release = release;
        // Held back already (an exclusive video started meanwhile).
        if (entry.heldBy) return;
        // The click's gesture lets it play with sound; a browser that still
        // refuses gets it muted.
        element.play().catch((err: unknown) => {
          if (!live()) return;
          if ((err as { name?: string })?.name === "NotAllowedError" && !element.muted) {
            element.muted = true;
            entry.autoMuted = !player.muted;
            return element.play();
          }
          throw err;
        }).catch(() => live() && stopPlayer(entry, "error"));
      },
      () => live() && stopPlayer(entry, "error"),
    );
  }

  /** A click at a point of a page: plays, pauses or resumes the video
   *  printed there. */
  function toggleVideoAt(point: FolioPagePoint): boolean {
    const spot = spotAt(point);
    if (!spot) return false;
    const p = playerOf(point.page, spot);
    if (p) togglePlaying(p);
    else startVideo(point.page, spot);
    return true;
  }

  /** A click (or Space) on a video playing: one that started on its own
   *  is unmuted first; otherwise it pauses or resumes. */
  function togglePlaying(p: PagePlayer) {
    if (p.autoMuted && !p.element.paused) {
      p.autoMuted = false;
      p.element.muted = false;
      return;
    }
    if (p.element.paused) void p.element.play().catch(() => {});
    else p.element.pause();
  }

  /** Autoplay waits for the book to settle: a host lays a book out in
   *  steps (a chapter, then the whole book), and only the spread the reader
   *  is left looking at counts as shown. */
  ds.autoTimer = 0;
  const scheduleAutoplay = () => {
    clearTimeout(ds.autoTimer);
    ds.autoTimer = window.setTimeout(() => {
      if (!ds.turning) autoplayOn(dlate.viewer.state.pages);
    }, AUTOPLAY_SETTLE_MS);
  };

  /**
   * The videos on show set to play on their own (`player.autoplay`) start,
   * muted. One playing alongside the others (`exclusive: false`) starts
   * each time its page comes into view (not while an exclusive video
   * plays there, nor when the reader asks for less motion); an exclusive
   * one, the first time its spread is shown and never again in this
   * viewer, when no other exclusive video is on.
   */
  function autoplayOn(pages: number[], { exclusive = true }: { exclusive?: boolean } = {}) {
    if (options.videos === false) return;
    const state = {
      players: ds.players.map((p) => ({ page: p.page, key: p.spot.key, alongside: p.alongside, paused: p.element.paused, shown: p.shown })),
      autoplayed,
      autoStarted,
    };
    for (const { page, spot } of autoplayPlan(pages, spotsOf, (s) => !!urlOf(s), state, { exclusive, reducedMotion: reducedMotion() })) {
      if (spot.video.player.exclusive === false) autoStarted.add(autoKey(page, spot.key));
      else autoplayed.add(spot.key);
      startVideo(page, spot, true);
    }
  }

  /** A new layout: each video follows its resource to where the layout
   *  puts it, or stops when it is gone (or, at rest, off the pages on
   *  show). */
  function followVideos() {
    spots = new Map();
    let moved = false;
    for (const p of [...ds.players]) {
      const near = [p.page, ...dlate.viewer.state.pages];
      for (let i = 0; i < ds.current.pages.length; i++) near.push(i);
      const at = near.find((i) => spotsOf(i).some((s) => s.key === p.spot.key && urlOf(s) === urlOf(p.spot)));
      if (at === undefined || (!ds.turning && !dlate.viewer.state.pages.includes(at))) {
        stopPlayer(p);
        continue;
      }
      p.page = at;
      p.spot = spotsOf(at).find((s) => s.key === p.spot.key && urlOf(s) === urlOf(p.spot))!;
      moved ||= p.shown;
    }
    if (moved) showVideos();
  }
  return {
    autoplayed, autoStarted, spotsOf, urlOf, spotAt, stopPlayer, stopVideos, startVideo,
    toggleVideoAt, togglePlaying, scheduleAutoplay, followVideos
  };
}
