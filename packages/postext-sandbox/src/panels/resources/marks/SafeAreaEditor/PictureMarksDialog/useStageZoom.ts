// The marks dialog's zoom: steps about a focus point, and Ctrl-scroll and
// pinch zoom on the viewport.
import { clamp } from '../../pictureMarks.js';
import { MAX_STAGE_ZOOM, wheelZoom } from '../../stageZoom.js';
import { useRef, useLayoutEffect, useCallback } from 'react';

/** What useStageZoom takes from PictureMarksDialog. */
export interface UseStageZoomDeps {
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  hand: boolean;
  spaceDown: boolean;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  zoomFocus: React.RefObject<{ fx: number; fy: number; ox: number; oy: number; } | null>;
}

export function useStageZoom(deps: UseStageZoomDeps) {
  const {
    zoom, setZoom, hand, spaceDown, viewportRef, zoomFocus
  } = deps;
  /** Zoom to `next`, keeping the point of the viewport at (`cx`, `cy`)
   *  (client pixels; the middle of it by default) under its place. */
  const zoomTo = (next: number, cx?: number, cy?: number) => {
    const v = viewportRef.current;
    const z = clamp(next, 1, MAX_STAGE_ZOOM);
    if (!v || z === zoom) return;
    const box = v.getBoundingClientRect();
    const ox = (cx ?? box.left + box.width / 2) - box.left;
    const oy = (cy ?? box.top + box.height / 2) - box.top;
    zoomFocus.current = { fx: (v.scrollLeft + ox) / Math.max(1, v.scrollWidth), fy: (v.scrollTop + oy) / Math.max(1, v.scrollHeight), ox, oy };
    setZoom(z);
  };
  const zoomRef = useRef(zoomTo);
  zoomRef.current = zoomTo;
  const zoomValue = useRef(zoom);
  zoomValue.current = zoom;
  // The scroll that keeps the focus of a zoom step where it was.
  useLayoutEffect(() => {
    const f = zoomFocus.current;
    const v = viewportRef.current;
    zoomFocus.current = null;
    if (!f || !v) return;
    v.scrollLeft = f.fx * v.scrollWidth - f.ox;
    v.scrollTop = f.fy * v.scrollHeight - f.oy;
    // The refs come from the dialog's state: stable, as when they were its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);
  // Ctrl-scroll and a pinch zoom about the pointer (a plain scroll moves
  // the picture when it is zoomed, natively). A native listener, attached
  // when the viewport mounts: React's wheel handlers cannot cancel the
  // page's own zoom.
  const wheelOff = useRef<(() => void) | null>(null);
  const setViewport = useCallback((el: HTMLDivElement | null) => {
    wheelOff.current?.();
    wheelOff.current = null;
    viewportRef.current = el;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomRef.current(zoomValue.current * wheelZoom(e.deltaY), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    wheelOff.current = () => el.removeEventListener('wheel', onWheel);
    // The refs come from the dialog's state: stable, as when they were its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const panning = hand || spaceDown;
  return {
    zoomTo, zoomValue, setViewport, panning
  };
}
