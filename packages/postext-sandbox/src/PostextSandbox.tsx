'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PostextSandboxProps } from './types';
import { SandboxProvider, useSandboxSelector, useSandboxDispatch } from './context/SandboxContext';
import { LayoutServiceProvider } from './worker/LayoutServiceContext';
import { preloadConfigFonts, getConfigFontFamilies } from './controls/fontLoader';
import { ActivityBar, MobileNavBar } from './sidebar/ActivityBar';
import { SidebarPanel } from './sidebar/SidebarPanel';
import { ConfigPanel } from './sidebar/ConfigPanel';
import { ResourcesPanel } from './sidebar/ResourcesPanel';
import { MarkdownPanel } from './sidebar/MarkdownPanel';
import { WarningsPanel } from './sidebar/WarningsPanel';
import { FontsPanel } from './sidebar/FontsPanel';
import { ProjectsPanel } from './sidebar/ProjectsPanel';
import { ChaptersPanel } from './sidebar/ChaptersPanel';
import { ResizableHandle } from './panels/ResizableHandle';
import { ViewportTabs } from './viewport/ViewportTabs';
import { CanvasViewport } from './viewport/CanvasViewport';
import { HtmlViewport } from './viewport/HtmlViewport';
import { PdfViewport } from './viewport/PdfViewport';
import { ChapterPaginator } from './viewport/ChapterPaginator';
import { useChapterHashSync } from './viewport/useChapterHashSync';
import { SandboxGlobalStyles, TooltipProvider } from './ui';
import { useCompactLayout } from './hooks/useCompactLayout';

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
  const dispatch = useSandboxDispatch();
  const config = useSandboxSelector((s) => s.config);
  const activePanel = useSandboxSelector((s) => s.activePanel);
  const sidebarPercent = useSandboxSelector((s) => s.sidebarPercent);
  const activeViewport = useSandboxSelector((s) => s.activeViewport);
  const booting = useSandboxSelector((s) => s.booting);
  const bookLoading = useSandboxSelector((s) => s.bookLoading);
  const loadingLabel = useSandboxSelector((s) => s.labels.bookLoading);
  useChapterHashSync();
  const compact = useCompactLayout();
  // A phone opens on the pages: a panel there covers the whole preview, so
  // the one left open last time is not reopened over it.
  const openedCompactRef = useRef(false);
  useEffect(() => {
    if (!compact || openedCompactRef.current) return;
    openedCompactRef.current = true;
    dispatch({ type: 'SET_PANEL', payload: null });
  }, [compact, dispatch]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const configVersionRef = useRef(0);

  // Stable key derived from the config's font families to avoid
  // resetting fontsReady when non-font config fields change
  const fontKey = useMemo(
    () => getConfigFontFamilies(config).sort().join(','),
    [config],
  );

  useEffect(() => {
    const version = ++configVersionRef.current;
    setFontsReady(false);

    preloadConfigFonts(config).then(() => {
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
    switch (activePanel) {
      case 'config':
        return <ConfigPanel />;
      case 'resources':
        return <ResourcesPanel isDark={isDark} />;
      case 'markdown':
        return <MarkdownPanel isDark={isDark} />;
      case 'warnings':
        return <WarningsPanel />;
      case 'fonts':
        return <FontsPanel />;
      case 'projects':
        return <ProjectsPanel />;
      case 'chapters':
        return <ChaptersPanel />;
      default:
        return null;
    }
  };

  const renderViewport = () => {
    switch (activeViewport) {
      case 'canvas':
        return <CanvasViewport />;
      case 'html':
        return <HtmlViewport />;
      case 'pdf':
        return <PdfViewport />;
      default:
        return null;
    }
  };

  // Until the fonts are in, and while the page opens on a link to another
  // book than the stored one (the stored book is never shown then).
  if (!fontsReady || booting) {
    return (
      <div
        className="flex h-full w-full items-center justify-center"
        style={{ backgroundColor: 'var(--background)', color: 'var(--slate)' }}
        role="status"
        aria-label={loadingLabel}
      >
        <Spinner />
      </div>
    );
  }

  const loadingCover = bookLoading && (
    // Another book is on its way: the one being left is covered
    // rather than shown as if it were the new one.
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 text-xs"
      style={{ backgroundColor: 'var(--background)', color: 'var(--slate)' }}
    >
      <Spinner />
      <span>{loadingLabel}</span>
    </div>
  );

  if (compact) {
    // Phone layout: the preview fills the window above the panel bar, and
    // an open panel covers it (the preview stays mounted underneath, so
    // going back finds it where it was).
    return (
      <div
        className="flex h-full w-full flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--background)', fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)', overscrollBehavior: 'none' }}
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          <ChapterPaginator />
          <ViewportTabs
            compact
            leading={homeLink}
            trailing={(
              <>
                {themeToggle && <div className="flex h-8 w-8 items-center justify-center">{themeToggle}</div>}
                {languageSwitcher && <div className="flex h-8 w-8 items-center justify-center">{languageSwitcher}</div>}
              </>
            )}
          />
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {renderViewport()}
            {loadingCover}
          </div>
          {activePanel !== null && (
            <div className="absolute inset-0 z-30 flex flex-col" style={{ backgroundColor: 'var(--background)' }}>
              {renderPanel()}
            </div>
          )}
        </div>
        <MobileNavBar />
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

      {activePanel !== null && (
        <ResizableHandle
          onPointerDown={handlePointerDown}
          value={sidebarPercent}
          onValueChange={(v) => dispatch({ type: 'SET_SIDEBAR_PERCENT', payload: v })}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <ChapterPaginator />
        <ViewportTabs />
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {renderViewport()}
          {loadingCover}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 24,
        height: 24,
        border: '2px solid var(--rule)',
        borderTopColor: 'var(--brand)',
        borderRadius: '50%',
        animation: 'postext-spin 0.8s linear infinite',
      }}
    />
  );
}

export function PostextSandbox({
  initialMarkdown,
  initialConfig,
  className,
  labels,
  locale,
  presetSources,
  hashBundles,
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
      <SandboxGlobalStyles />
      <LayoutServiceProvider>
      <SandboxProvider
        initialMarkdown={initialMarkdown}
        initialConfig={initialConfig}
        labels={labels}
        locale={locale}
        presetSources={presetSources}
        hashBundles={hashBundles}
        onConfigChange={onConfigChange}
        onMarkdownChange={onMarkdownChange}
      >
        <TooltipProvider>
          <SandboxLayout
            themeToggle={themeToggle}
            languageSwitcher={languageSwitcher}
            isDark={isDark}
            homeUrl={homeUrl}
            homeLink={homeLink}
          />
        </TooltipProvider>
      </SandboxProvider>
      </LayoutServiceProvider>
    </div>
  );
}
