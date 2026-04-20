'use client';

import { useState, useEffect, useRef } from 'react';
import { HtmlPreview } from './HtmlPreview';
import { HtmlToolbar } from './HtmlToolbar';
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
  const [columnMode, setColumnMode] = useState<ColumnMode>('single');
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

  return (
    <div className="relative h-full w-full">
      <HtmlPreview fontScale={fontScale} columnMode={columnMode} />
      <HtmlToolbar
        fontScale={fontScale}
        columnMode={columnMode}
        onFontScaleUp={handleFontScaleUp}
        onFontScaleDown={handleFontScaleDown}
        onSetColumnMode={handleSetColumnMode}
      />
    </div>
  );
}
