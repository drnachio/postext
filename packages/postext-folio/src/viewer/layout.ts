// The folio viewer's book and its box: the flipper's appearance, the fit of
// the spread on the device pixel grid and the DOM pages (#1276: split out of
// viewer.ts).
import type { FlipAppearance } from '../pageFlip.js';
import { paperOf, aspectOf, sourceOf, GAP, MIN_MARGIN_Y, altOf } from './constants.js';
import { resolveFolioConfig } from 'postext';
import type { FolioOptions } from './types.js';
import type { FolioViewerState, FolioViewerLate } from './state.js';

/** What createFolioLayout takes from createFolio. */
export interface FolioLayoutDeps {
  options: FolioOptions;
  controls: boolean;
  showCount: boolean;
  root: HTMLDivElement;
  prevBtn: HTMLButtonElement;
  spreadEl: HTMLDivElement;
  count: HTMLParagraphElement;
  rtl: () => boolean;
  singleGl: () => boolean;
  vs: FolioViewerState;
  vlate: FolioViewerLate;
}

export function createFolioLayout(deps: FolioLayoutDeps) {
  const {
    options, controls, showCount, root, prevBtn, spreadEl, count, rtl, singleGl, vs, vlate
  } = deps;
  /** The flipper's appearance: the leaves' own papers (a leaf takes its
   *  recto's, else its verso's) and the leaves outside the pages given. */
  function flipAppearance(): FlipAppearance {
    const extra = vs.appearance.extraPages ?? { before: 0, after: 0 };
    const leafPapers = vs.spreads.slice(0, -1).map((s, k) =>
      vs.single ? paperOf(vs.pages[s[1]!]) : (paperOf(vs.pages[s[1] ?? -1]) ?? paperOf(vs.pages[vs.spreads[k + 1]?.[0] ?? -1])),
    );
    return {
      folio: vs.appearance.folio,
      pageWidthMm: vs.appearance.pageWidthMm,
      extraLeaves: vs.single ? { before: extra.before, after: extra.after } : { before: Math.ceil(extra.before / 2), after: Math.ceil(extra.after / 2) },
      leafPapers,
      singlePage: vs.single,
      textureBaseUrl: vs.appearance.textureBaseUrl,
      coverLeaves: coverLeavesOf(),
      ...(vs.appearance.spineImage ? { spineImage: vs.appearance.spineImage } : {}),
    };
  }

  /** The leaves that are the covers: the first, when the book opens on its
   *  first page alone; the last, when the last page is a verso alone. */
  function coverLeavesOf(): FlipAppearance["coverLeaves"] {
    const c = vs.appearance.covers;
    if (!c || vs.spreads.length < 2) return undefined;
    const last = vs.spreads[vs.spreads.length - 1];
    return {
      ...(c.front && (vs.single || vs.spreads[0][0] === null) ? { front: 0 } : {}),
      ...(c.back && !vs.single && last[1] === null ? { back: vs.spreads.length - 2 } : {}),
    };
  }

  function aspect() {
    if (options.aspect) return options.aspect;
    for (const page of vs.pages) {
      const ar = aspectOf(sourceOf(page));
      if (ar) return ar;
    }
    return 1 / Math.SQRT2;
  }

  /**
   * Fits the book into the box, as large as it goes: the ‹ › buttons and
   * the count sit in the margins round it. The spread lies on the device
   * pixel grid, its page slots a whole number of device pixels wide, so a
   * page painted at that size is shown 1:1 in the DOM and on the canvas
   * alike. The WebGL canvas covers the box, centred on the spread (the
   * camera maps the spread onto it 1:1), with room for a lifted leaf.
   */
  function fit() {
    const dpr = window.devicePixelRatio || 1;
    const box = root.getBoundingClientRect();
    const boxW = Math.floor(box.width * dpr);
    const boxH = Math.floor(box.height * dpr);
    const ar = aspect();
    const gap = Math.round(GAP * dpr);
    // The widest page up to `max` device px whose width and height are
    // even: the spread's centre and the spine (the camera's centre in one
    // or the other mode) then lie on the pixel grid.
    const fitWidth = (max: number) => {
      let w = Math.max(2, Math.floor(max));
      while (w > 2 && (w % 2 || Math.round(w / ar) % 2)) w--;
      return w;
    };
    let deviceWidth: number;
    let left: number;
    let top: number;
    let across: number;
    if (vs.single) {
      // One page across the box, the buttons and the count in a bar below.
      const bar = controls ? Math.round((prevBtn.offsetWidth + 2 * GAP) * dpr) : gap;
      const availW = Math.max(0, boxW - 2 * gap);
      const availH = Math.max(0, boxH - gap - bar);
      deviceWidth = fitWidth(Math.min(availW, availH > 0 ? availH * ar : Infinity));
      const deviceHeight = Math.round(deviceWidth / ar);
      const pageLeft = gap + Math.floor((availW - deviceWidth) / 2);
      top = gap + Math.max(0, Math.floor((availH - deviceHeight) / 2));
      if (vs.flipper) {
        // The WebGL book is a spread whose other page lies off the box: the
        // spine on the page's inner edge (its left, or its right when the
        // book is bound on the right).
        across = 2;
        left = rtl() ? pageLeft : pageLeft - deviceWidth;
      } else {
        across = 1;
        left = pageLeft;
      }
    } else {
      across = 2;
      const marginX = Math.round((controls ? prevBtn.offsetWidth + 2 * GAP : GAP) * dpr);
      const marginY = Math.round(Math.max(MIN_MARGIN_Y, showCount ? count.offsetHeight + 2 * GAP : GAP) * dpr);
      const availW = Math.max(0, boxW - 2 * marginX);
      const availH = Math.max(0, boxH - 2 * marginY);
      // A tilted book is foreshortened: its pages may be taller than the
      // box before their image is.
      const tall = vs.flipper ? 1 / Math.max(0.7, Math.cos((resolveFolioConfig(vs.appearance.folio).tilt * Math.PI) / 180)) : 1;
      deviceWidth = fitWidth(Math.min(availW / 2, availH > 0 ? availH * tall * ar : Infinity));
      left = Math.floor((boxW - 2 * deviceWidth) / 2);
      // Centred even when the tilted book's spread is taller than the box
      // (it overflows both edges): the camera centres the book on it.
      top = Math.floor((boxH - Math.round(deviceWidth / ar)) / 2);
    }
    const deviceHeight = Math.max(1, Math.round(deviceWidth / ar));
    Object.assign(spreadEl.style, {
      left: `${left / dpr}px`,
      top: `${top / dpr}px`,
      width: `${(across * deviceWidth) / dpr}px`,
      height: `${deviceHeight / dpr}px`,
    });
    if (vs.flipCanvas) {
      // Centred on the spine (the camera maps the spread onto the canvas
      // 1:1 about its centre) and reaching every edge of the box; what
      // falls outside the box is clipped.
      const cx = left + deviceWidth;
      const cy = top + deviceHeight / 2;
      const hw = Math.max(cx, boxW - cx);
      const hh = Math.max(cy, boxH - cy);
      Object.assign(vs.flipCanvas.style, {
        left: `${(cx - hw) / dpr}px`,
        top: `${(cy - hh) / dpr}px`,
        width: `${(2 * hw) / dpr}px`,
        height: `${(2 * hh) / dpr}px`,
      });
    }
    const next = { width: deviceWidth / dpr, height: deviceHeight / dpr, deviceWidth, deviceHeight };
    if (next.deviceWidth !== vs.slot.deviceWidth || next.deviceHeight !== vs.slot.deviceHeight) {
      vs.slot = next;
      options.onLayout?.(vs.slot);
      vlate.scheduleDetail(300);
    }
    vlate.placeDomVideo();
    vs.flipper?.redraw();
  }

  function pageEl(i: number | null, slot: 0 | 1) {
    const el = document.createElement("div");
    el.className = "postext-folio-page";
    if (!vs.single || singleGl()) el.classList.add(slot === 0 ? "is-verso" : "is-recto");
    const src = i === null ? null : sourceOf(vs.pages[i]);
    if (src === null) {
      el.classList.add("is-empty");
      el.setAttribute("aria-hidden", "true");
    } else if (src === "") {
      el.classList.add("is-blank");
      el.setAttribute("aria-hidden", "true");
    } else {
      const alt = altOf(vs.pages[i!]) ?? "";
      if (typeof src === "string") {
        const img = document.createElement("img");
        img.src = src;
        img.alt = alt;
        img.draggable = false;
        img.decoding = "async";
        el.append(img);
      } else {
        // The page's own element (a canvas, or a decoded image), shown as is.
        src.classList.add("postext-folio-surface");
        if (src instanceof HTMLCanvasElement) {
          src.setAttribute("role", "img");
          if (alt) src.setAttribute("aria-label", alt);
        } else {
          src.alt = alt;
          src.draggable = false;
        }
        el.append(src);
      }
    }
    return el;
  }
  return {
    flipAppearance, aspect, fit, pageEl
  };
}
