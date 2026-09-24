'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { PagePreviewHighlight } from './PagePreview';

interface HighlightState {
  highlight: PagePreviewHighlight;
  setHighlight: (h: PagePreviewHighlight) => void;
}

const PreviewHighlightContext = createContext<HighlightState | null>(null);

/** Shares "which part of the page is being edited" between the fields of
 *  the Page group and the page drawing above them. */
export function PreviewHighlightProvider({ children }: { children: ReactNode }) {
  const [highlight, setHighlight] = useState<PagePreviewHighlight>(null);
  return <PreviewHighlightContext value={{ highlight, setHighlight }}>{children}</PreviewHighlightContext>;
}

export function usePreviewHighlight(): PagePreviewHighlight {
  return useContext(PreviewHighlightContext)?.highlight ?? null;
}

/** Wraps the field(s) that edit one part of the page: hovering or focusing
 *  inside tints that part in the drawing. A no-op outside the provider
 *  (e.g. in search results). */
export function HighlightZone({ part, children }: { part: Exclude<PagePreviewHighlight, null>; children: ReactNode }) {
  const ctx = useContext(PreviewHighlightContext);
  if (!ctx) return <>{children}</>;
  const on = () => ctx.setHighlight(part);
  const off = () => ctx.setHighlight(null);
  return (
    <div onMouseEnter={on} onMouseLeave={off} onFocusCapture={on} onBlurCapture={off}>
      {children}
    </div>
  );
}
