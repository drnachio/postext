'use client';

// What the preview shows while the Cover panel is open: the chosen sheet
// of the chosen version as it is now, instead of the book's pages, which
// are not what the panel works on.

import { useEffect, useRef, useState } from 'react';
import { hasWindow } from '../env/window.js';
import { useSandboxLabels } from '../context/SandboxContext.js';
import { useCoverDesigner, useCoverState } from './coverStore.js';
import { CoverDesignerOverlay } from './designer/CoverDesignerOverlay.js';
import { paintCoverPage } from './paintCover.js';

export default function CoverStage() {
  const labels = useSandboxLabels();
  const state = useCoverState();
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [shownSize, setShownSize] = useState({ width: 0, height: 0 });
  const designer = useCoverDesigner();

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setBox({ width: e.contentRect.width, height: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { doc, paintKey } = state;
  useEffect(() => {
    const canvas = canvasRef.current;
    const page = doc?.pages[0];
    if (!canvas || !doc || !page || box.width <= 0 || box.height <= 0) return;
    const fit = Math.min(box.width / page.width, box.height / page.height);
    const dpr = hasWindow() ? window.devicePixelRatio || 1 : 1;
    paintCoverPage(doc, canvas, fit * dpr);
    const size = { width: Math.round(page.width * fit), height: Math.round(page.height * fit) };
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    setShownSize((s) => (s.width === size.width && s.height === size.height ? s : size));
  }, [doc, paintKey, box]);

  const version = state.built?.sheets.version;
  const name = state.built ? (state.built.config.production?.versions ?? []).find((v) => v.id === version)?.name ?? version ?? '' : '';
  const busy = state.status === 'building';

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--surface)' }}>
      <div ref={boxRef} className="relative m-6 min-h-0 flex-1">
        {state.doc ? (
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={labels.coverStageLabel.replace('__version__', name)}
            className="absolute inset-0 m-auto shadow-md"
            style={{ opacity: busy ? 0.6 : 1, transition: 'opacity 150ms' }}
          />
        ) : (
          <p role="status" className="absolute inset-0 m-auto h-fit max-w-sm text-center text-sm text-(--slate)">
            {state.status === 'building' ? labels.coverBuilding : state.status === 'error' ? labels.coverPreviewFailed : labels.coverNoVersions}
          </p>
        )}
        {designer.open && state.doc && state.built && shownSize.width > 0 && (
          <div className="absolute inset-0 m-auto" style={{ width: shownSize.width, height: shownSize.height }}>
            <CoverDesignerOverlay built={state.built} doc={state.doc} cssWidth={shownSize.width} />
          </div>
        )}
        {state.doc && busy && <span role="status" className="sr-only">{labels.coverBuilding}</span>}
      </div>
    </div>
  );
}
