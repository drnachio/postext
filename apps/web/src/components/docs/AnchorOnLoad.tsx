"use client";

import { useEffect } from "react";
import { fragmentId } from "@/lib/anchors/oldAnchors";
import { anchorOffset, scrollToAnchor } from "@/lib/anchors/scrollToAnchor";

/** How far from its place a heading may be and still count as shown. */
const SLACK = 12;

/**
 * Puts a docs page on the heading its address names, when the browser's own
 * jump did not get there (#655).
 *
 * A docs page reaches the browser in pieces, and the jump to a `#fragment`
 * is tried while it loads: when the heading arrives after the last try, the
 * page stays at its top. That showed in about one load in eight after the
 * redirect of an old Configuration address. The page is checked when it
 * mounts, when it has loaded and a moment later, and moved only while it is
 * still at its top and the reader has not touched it. A reload or a step
 * back in history is left alone: there the browser restores where the reader
 * was, which need not be the heading.
 */
export function AnchorOnLoad() {
  useEffect(() => {
    const id = fragmentId(window.location.hash);
    if (!id) return;
    const arrival = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (arrival && arrival.type !== "navigate") return;
    let touched = false;
    const touch = () => {
      touched = true;
    };
    const inputs = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    for (const type of inputs) window.addEventListener(type, touch, { passive: true, once: true });

    const settle = () => {
      if (touched || window.scrollY > SLACK) return;
      const el = document.getElementById(id);
      if (el && Math.abs(anchorOffset(el)) > SLACK) scrollToAnchor(el, { instant: true });
    };
    settle();
    const timers = [window.setTimeout(settle, 400), window.setTimeout(settle, 1500)];
    window.addEventListener("load", settle, { once: true });
    return () => {
      for (const type of inputs) window.removeEventListener(type, touch);
      for (const timer of timers) window.clearTimeout(timer);
      window.removeEventListener("load", settle);
    };
  }, []);
  return null;
}
