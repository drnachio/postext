'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PostextSandboxProps } from './types';
import { SandboxProvider, useSandbox } from './context/SandboxContext';
import { preloadConfigFonts, getConfigFontFamilies } from './controls/fontLoader';
import { ActivityBar } from './sidebar/ActivityBar';
import { SidebarPanel } from './sidebar/SidebarPanel';
import { ConfigPanel } from './sidebar/ConfigPanel';
import { ResourcesPanel } from './sidebar/ResourcesPanel';
import { MarkdownPanel } from './sidebar/MarkdownPanel';
import { ResizableHandle } from './panels/ResizableHandle';
import { ViewportTabs } from './viewport/ViewportTabs';
import { CanvasViewport } from './viewport/CanvasViewport';
import { HtmlViewport } from './viewport/HtmlViewport';
import { PdfPreview } from './viewport/PdfPreview';

function SandboxLayout({
  themeToggle,
  languageSwitcher,
  isDark,
  homeUrl,
  homeLink,
}: {
  themeToggle?: React.ReactNode;
  languageSwitcher?: React.ReactNode;
  isDark?: boolean;
  homeUrl?: string;
  homeLink?: React.ReactNode;
}) {
  const { state, dispatch } = useSandbox();
  const containerRef = useRef<HTMLDivElement>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const configVersionRef = useRef(0);

  // Stable key derived from the config's font families to avoid
  // resetting fontsReady when non-font config fields change
  const fontKey = useMemo(
    () => getConfigFontFamilies(state.config).sort().join(','),
    [state.config],
  );

  useEffect(() => {
    const version = ++configVersionRef.current;
    setFontsReady(false);

    preloadConfigFonts(state.config).then(() => {
      if (configVersionRef.current === version) setFontsReady(true);
    });
  }, [fontKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      dispatch({ type: 'SET_SIDEBAR_DRAGGING', payload: true });

      const onPointerMove = (ev: PointerEvent) => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const sidebar = target.previousElementSibling as HTMLElement | null;
        if (!sidebar) return;
        const sidebarLeft = sidebar.getBoundingClientRect().left;
        const minViewportWidth = 200;
        const maxSidebarPx = rect.width - (sidebarLeft - rect.left) - minViewportWidth;
        const sidebarPx = Math.max(0, Math.min(ev.clientX - sidebarLeft, maxSidebarPx));
        const percent = Math.max(5, (sidebarPx / rect.width) * 100);
        dispatch({ type: 'SET_SIDEBAR_PERCENT', payload: Math.round(percent * 10) / 10 });
      };

      const onPointerUp = () => {
        target.releasePointerCapture(e.pointerId);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        dispatch({ type: 'SET_SIDEBAR_DRAGGING', payload: false });
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
      };

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    },
    [dispatch],
  );

  const renderPanel = () => {
    switch (state.activePanel) {
      case 'config':
        return <ConfigPanel />;
      case 'resources':
        return <ResourcesPanel />;
      case 'markdown':
        return <MarkdownPanel isDark={isDark} />;
      default:
        return null;
    }
  };

  const renderViewport = () => {
    switch (state.activeViewport) {
      case 'canvas':
        return <CanvasViewport />;
      case 'html':
        return <HtmlViewport />;
      case 'pdf':
        return <PdfPreview />;
      default:
        return null;
    }
  };

  if (!fontsReady) {
    return (
      <div
        className="flex h-full w-full items-center justify-center"
        style={{ backgroundColor: 'var(--background)', color: 'var(--slate)' }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            border: '2px solid var(--rule)',
            borderTopColor: 'var(--gilt)',
            borderRadius: '50%',
            animation: 'postext-spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes postext-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full overflow-hidden"
      style={{ backgroundColor: 'var(--background)', fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)', overscrollBehavior: 'none' }}
    >
      <ActivityBar themeToggle={themeToggle} languageSwitcher={languageSwitcher} homeUrl={homeUrl} homeLink={homeLink} />

      <SidebarPanel>
        {renderPanel()}
      </SidebarPanel>

      {state.activePanel !== null && (
        <ResizableHandle onPointerDown={handlePointerDown} />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <ViewportTabs />
        <div className="min-h-0 flex-1 overflow-hidden">
          {renderViewport()}
        </div>
      </div>
    </div>
  );
}

export function PostextSandbox({
  initialMarkdown,
  initialConfig,
  className,
  labels,
  locale,
  onConfigChange,
  onMarkdownChange,
  themeToggle,
  languageSwitcher,
  homeUrl,
  homeLink,
}: PostextSandboxProps) {
  const isDark = typeof document !== 'undefined'
    ? document.documentElement.classList.contains('dark')
    : true;

  return (
    <div className={className ?? 'h-full w-full'}>
      <SandboxProvider
        initialMarkdown={initialMarkdown}
        initialConfig={initialConfig}
        labels={labels}
        locale={locale}
        onConfigChange={onConfigChange}
        onMarkdownChange={onMarkdownChange}
      >
        <SandboxLayout
          themeToggle={themeToggle}
          languageSwitcher={languageSwitcher}
          isDark={isDark}
          homeUrl={homeUrl}
          homeLink={homeLink}
        />
      </SandboxProvider>
    </div>
  );
}
