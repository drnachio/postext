import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, FocusEvent as ReactFocusEvent } from 'react';
import { loadToolbarPinned, saveToolbarPinned } from '../storage/persistence';

// Width of the invisible hover strip anchored to the right edge of the
// viewport. Narrow enough to not steal meaningful interaction space (PDF
// scrollbar etc.) while still catching a deliberate reach toward the toolbar.
const HOVER_STRIP_WIDTH_PX = 32;
// Short grace window between leaving the strip or the toolbar before we
// actually hide — lets the cursor cross the gap between them without blinking.
const HIDE_DELAY_MS = 180;

export interface FloatingToolbarShell {
  pinned: boolean;
  togglePin: () => void;
  hidden: boolean;
  containerProps: { onMouseLeave: () => void };
  // Props for an overlay div sitting on top of the content at the right edge.
  // Necessary because the PDF viewer is an iframe — mousemove events inside
  // it never bubble, so the only reliable way to detect approach is to have a
  // DOM element above the iframe listen for enter/leave.
  hoverStripProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    'aria-hidden': true;
    style: CSSProperties;
  };
  // Props passed through to the toolbar root so it participates in the same
  // hover tracking as the strip (hovering the toolbar itself keeps it open).
  toolbarHoverProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocus: (e: ReactFocusEvent<HTMLDivElement>) => void;
    onBlur: (e: ReactFocusEvent<HTMLDivElement>) => void;
  };
}

/**
 * Shared visibility behavior for the floating right-edge toolbars in the
 * Canvas/HTML/PDF viewports. When unpinned, the toolbar slides off-screen to
 * the right; an invisible strip at the right edge plus the toolbar itself
 * form the hover zone that brings it back. `forceVisible` pins it in place
 * regardless of hover state (used while recalculating or when the PDF is
 * dirty so the user can always see the recalc button).
 */
export function useFloatingToolbarShell(
  storageId: string,
  forceVisible: boolean,
): FloatingToolbarShell {
  const [pinned, setPinned] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const hydratedRef = useRef(false);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const saved = loadToolbarPinned(storageId);
    if (saved !== null) setPinned(saved);
    const id = requestAnimationFrame(() => {
      hydratedRef.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [storageId]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    saveToolbarPinned(storageId, pinned);
  }, [pinned, storageId]);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const startHideTimer = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setHovered(false);
      hideTimerRef.current = null;
    }, HIDE_DELAY_MS);
  }, [clearHideTimer]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, []);

  const onEnter = useCallback(() => {
    clearHideTimer();
    setHovered(true);
  }, [clearHideTimer]);
  const onLeave = useCallback(() => {
    startHideTimer();
  }, [startHideTimer]);

  const togglePin = useCallback(() => setPinned((p) => !p), []);

  const onFocus = useCallback(() => {
    clearHideTimer();
    setFocusWithin(true);
  }, [clearHideTimer]);
  const onBlur = useCallback(
    (e: ReactFocusEvent<HTMLDivElement>) => {
      // Focus moving between siblings inside the toolbar (e.g. Tab from the
      // page-number input to a nav button) fires blur on the outgoing node
      // before focus on the new one. Ignore those — we only care about focus
      // actually leaving the toolbar.
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setFocusWithin(false);
    },
    [],
  );

  const hidden = !pinned && !hovered && !focusWithin && !forceVisible;

  return {
    pinned,
    togglePin,
    hidden,
    containerProps: { onMouseLeave: onLeave },
    hoverStripProps: {
      onMouseEnter: onEnter,
      onMouseLeave: onLeave,
      'aria-hidden': true,
      style: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: HOVER_STRIP_WIDTH_PX,
        zIndex: 9,
        // Active whenever the toolbar is unpinned so the strip participates
        // in the hover zone even while the toolbar is visible. That closes
        // the gap between the toolbar's right edge (right:12) and the
        // viewport edge — previously, moving the pointer into that gap left
        // both the toolbar's and the strip's bounds, flipping the toolbar
        // back to hidden. When pinned, the strip is inert so the rightmost
        // content (e.g. PDF scrollbar) stays clickable.
        pointerEvents: pinned ? 'none' : 'auto',
      },
    },
    toolbarHoverProps: {
      onMouseEnter: onEnter,
      onMouseLeave: onLeave,
      onFocus,
      onBlur,
    },
  };
}
