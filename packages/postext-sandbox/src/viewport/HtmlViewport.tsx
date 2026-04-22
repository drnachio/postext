'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { HtmlPreview, type HtmlPreviewHandle } from './HtmlPreview';
import { HtmlToolbar } from './HtmlToolbar';
import { useFloatingToolbarShell } from './useFloatingToolbarShell';
import {
  loadHtmlFontScale,
  saveHtmlFontScale,
  loadHtmlColumnMode,
  saveHtmlColumnMode,
} from '../storage/persistence';

type ColumnMode = 'single' | 'multi';

const MIN_FONT_SCALE = 0.6;
const MAX_FONT_SCALE = 2.5;
const FONT_SCALE_STEP = 1.1;

const clampFontScale = (n: number) =>
  Math.max(MIN_FONT_SCALE, Math.min(MAX_FONT_SCALE, n));

export function HtmlViewport() {
  const [fontScale, setFontScale] = useState(1);
  const [columnMode, setColumnMode] = useState<ColumnMode>('multi');
  const [generating, setGenerating] = useState(false);
  const [scrollBounds, setScrollBounds] = useState<{ canPrev: boolean; canNext: boolean }>({ canPrev: false, canNext: false });
  const previewRef = useRef<HtmlPreviewHandle | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    const savedScale = loadHtmlFontScale();
    if (savedScale !== null) {
      setFontScale(clampFontScale(savedScale));
    }
    const savedMode = loadHtmlColumnMode();
    if (savedMode === 'single' || savedMode === 'multi') {
      setColumnMode(savedMode);
    }
    const id = requestAnimationFrame(() => {
      hydratedRef.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    saveHtmlFontScale(fontScale);
  }, [fontScale]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    saveHtmlColumnMode(columnMode);
  }, [columnMode]);

  const handleFontScaleUp = () => {
    setFontScale((s) => clampFontScale(s * FONT_SCALE_STEP));
  };

  const handleFontScaleDown = () => {
    setFontScale((s) => clampFontScale(s / FONT_SCALE_STEP));
  };

  const handleSetColumnMode = (mode: ColumnMode) => {
    setColumnMode(mode);
  };

  const handleRegenerate = useCallback(() => {
    previewRef.current?.regenerate();
  }, []);

  const handleScrollColumn = useCallback((delta: number) => {
    previewRef.current?.scrollColumn(delta);
  }, []);

  const shell = useFloatingToolbarShell('html', generating);

  return (
    <div className="relative h-full w-full" {...shell.containerProps}>
      <HtmlPreview
        ref={previewRef}
        fontScale={fontScale}
        columnMode={columnMode}
        onGeneratingChange={setGenerating}
        onScrollBoundsChange={setScrollBounds}
      />
      <div {...shell.hoverStripProps} />
      <HtmlToolbar
        fontScale={fontScale}
        columnMode={columnMode}
        generating={generating}
        pinned={shell.pinned}
        hidden={shell.hidden}
        canScrollPrev={scrollBounds.canPrev}
        canScrollNext={scrollBounds.canNext}
        onRegenerate={handleRegenerate}
        onTogglePin={shell.togglePin}
        onFontScaleUp={handleFontScaleUp}
        onFontScaleDown={handleFontScaleDown}
        onSetColumnMode={handleSetColumnMode}
        onScrollColumn={handleScrollColumn}
        {...shell.toolbarHoverProps}
      />
    </div>
  );
}
