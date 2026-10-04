'use client';

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PostextSandboxProps } from './types';
import { SandboxProvider, useSandboxSelector, useSandboxDispatch, useSandboxProjects } from './context/SandboxContext';
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
import { DirectionProvider } from '@base-ui/react/direction-provider';
import { SandboxGlobalStyles, TooltipProvider, PortalProvider, PortalHost, uiDirectionOf, useUiRtl } from './ui';
import { BundleReplaceDialog } from './BundleReplaceDialog';
import { useCompactLayout } from './hooks/useCompactLayout';
import { SandboxAnnouncer } from './ui/announcer';
import { LargeTargetsProvider, useLargeTargets } from './ui/largeTargets';
import { LargeTargetsToggle } from './ui/LargeTargetsToggle';
import { FolioLoading } from './viewport/FolioLoading';
import type { PanelId } from './types';

// three.js loads with the Folio tab, not with the sandbox.
const FolioViewport = lazy(() => import('./viewport/FolioViewport').then((m) => ({ default: m.FolioViewport })));
// So does the EPUB writer with the EPUB tab.
const EpubViewport = lazy(() => import('./viewport/EpubViewport').then((m) => ({ default: m.EpubViewport })));

const PANEL_LABEL_KEYS: Record<PanelId, 'navBooks' | 'navChapters' | 'navManuscript' | 'navResources' | 'navFonts' | 'navDesign' | 'navWarnings'> = {
  projects: 'navBooks',
  chapters: 'navChapters',
  markdown: 'navManuscript',
  resources: 'navResources',
  fonts: 'navFonts',
  config: 'navDesign',
  warnings: 'navWarnings',
};

/** The page's one level-1 heading, read by assistive tech only: the
 *  sandbox's name and the open book. */
function SandboxHeading() {
  const labels = useSandboxSelector((s) => s.labels);
  const { projects, activeProjectId } = useSandboxProjects();
  const presetName = useSandboxSelector((s) => s.presetSummaries.find((p) => p.id === s.activePresetId)?.name);
  const book = activeProjectId ? projects.find((p) => p.id === activeProjectId)?.name : presetName;
  return <h1 className="sr-only">{book ? labels.sandboxHeadingBook.replace('__book__', book) : labels.sandboxHeading}</h1>;
}


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
  const labels = useSandboxSelector((s) => s.labels);
  const panelLabel = activePanel ? labels[PANEL_LABEL_KEYS[activePanel]] : undefined;
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
  const rtl = useUiRtl();
  const [fontsReady, setFontsReady] = useState(false);
  const configVersionRef = useRef(0);

  // Stable key derived from the config's font families to avoid
  // resetting fontsReady when non-font config fields change
  const fontKey = useMemo(
    () => getConfigFontFamilies(config).sort().join(','),
    [config],
  );

  // Only the first load waits behind the boot screen. A later change of
  // families (a book's own config arriving, a preset switch) keeps the app
  // mounted: every viewer awaits its config's fonts before laying out, and
  // dropping back to the boot screen remounted the viewers and their bars,
  // which bounced in and out while a book was opening.
  useEffect(() => {
    const version = ++configVersionRef.current;

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
        const sidebar = target.closest<HTMLElement>('[data-postext-sidebar]');
        if (!sidebar) return;
        // The sidebar grows away from its start edge: rightwards, or
        // leftwards in a right-to-left interface (where it sits at the right).
        const sidebarRect = sidebar.getBoundingClientRect();
        const minViewportWidth = 200;
        const maxSidebarPx = rtl
          ? sidebarRect.right - rect.left - minViewportWidth
          : rect.right - sidebarRect.left - minViewportWidth;
        const sidebarPx = Math.max(0, Math.min(rtl ? sidebarRect.right - ev.clientX : ev.clientX - sidebarRect.left, maxSidebarPx));
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
    [dispatch, rtl],
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
      case 'pdf':
        return <PdfViewport />;
      case 'folio':
        return (
          <Suspense fallback={<div className="relative h-full w-full"><FolioLoading /></div>}>
            <FolioViewport />
          </Suspense>
        );
      case 'html':
        return <HtmlViewport />;
      case 'epub':
        return (
          <Suspense fallback={<div className="h-full w-full" style={{ backgroundColor: 'var(--surface)' }} />}>
            <EpubViewport />
          </Suspense>
        );
      default:
        return null;
    }
  };

  // Until the fonts are in, and while the page opens on a link to another
  // book than the stored one (the stored book is never shown then).
  if (!fontsReady || booting) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="flex h-full w-full flex-col items-center justify-center gap-3 text-xs outline-none"
        style={{ backgroundColor: 'var(--background)', color: 'var(--slate)' }}
      >
        <h1 className="sr-only">{labels.sandboxHeading}</h1>
        <div role="status" className="flex flex-col items-center gap-3">
          <Spinner />
          <span className="sr-only">{loadingLabel}</span>
        </div>
      </main>
    );
  }

  const loadingCover = bookLoading && (
    // Another book is on its way: the one being left is covered
    // rather than shown as if it were the new one.
    <div
      role="status"
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
        {/* The open panel covers the preview but is a region of its own,
            beside the main landmark, as the side bar is on a wide screen. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
        <main id="main-content" tabIndex={-1} className="relative flex min-h-0 flex-1 flex-col outline-none">
          <SandboxHeading />
          <ChapterPaginator />
          {/* Covered by an open panel: out of the tab order and of the
              accessibility tree, so focus never lands under the panel
              (WCAG 2.4.11/2.4.12). */}
          <div className="flex min-h-0 flex-1 flex-col" inert={activePanel !== null}>
          <ViewportTabs
            compact
            leading={homeLink}
            trailing={(
              <>
                <div className="flex min-h-8 min-w-8 pt-large:min-h-11 pt-large:min-w-11 items-center justify-center"><LargeTargetsToggle tooltipSide="bottom" /></div>
                {themeToggle && <div className="flex min-h-8 min-w-8 pt-large:min-h-11 pt-large:min-w-11 items-center justify-center">{themeToggle}</div>}
                {languageSwitcher && <div className="flex min-h-8 min-w-8 pt-large:min-h-11 pt-large:min-w-11 items-center justify-center">{languageSwitcher}</div>}
              </>
            )}
          />
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {renderViewport()}
            {loadingCover}
          </div>
          </div>
          <SandboxAnnouncer />
          <PortalHost />
          <BundleReplaceDialog />
        </main>
        {activePanel !== null && (
          <section aria-label={panelLabel} className="absolute inset-0 z-30 flex flex-col" style={{ backgroundColor: 'var(--background)' }}>
            {renderPanel()}
          </section>
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

      <SidebarPanel
        label={panelLabel}
        handle={activePanel !== null && (
          <ResizableHandle
            onPointerDown={handlePointerDown}
            value={sidebarPercent}
            onValueChange={(v) => dispatch({ type: 'SET_SIDEBAR_PERCENT', payload: v })}
          />
        )}
      >
        {renderPanel()}
      </SidebarPanel>

      <main id="main-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
        <SandboxHeading />
        <ChapterPaginator />
        <ViewportTabs />
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {renderViewport()}
          {loadingCover}
        </div>
        <SandboxAnnouncer />
        <PortalHost />
        <BundleReplaceDialog />
      </main>
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
  const direction = uiDirectionOf(locale);

  return (
    <DirectionProvider direction={direction}>
    <LargeTargetsProvider>
    <SandboxRoot className={className} direction={direction}>
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
        <PortalProvider>
        <TooltipProvider>
          <SandboxLayout
            themeToggle={themeToggle}
            languageSwitcher={languageSwitcher}
            isDark={isDark}
            homeUrl={homeUrl}
            homeLink={homeLink}
          />
        </TooltipProvider>
        </PortalProvider>
      </SandboxProvider>
      </LayoutServiceProvider>
    </SandboxRoot>
    </LargeTargetsProvider>
    </DirectionProvider>
  );
}

/** The root element. `data-pt-targets="large"` turns on the 44×44 sizes
 *  (`pt-large:` variant and the floor in `ui/styles.ts`); `dir` is the
 *  interface's direction (right to left in Arabic). Popups portal into a
 *  layer inside it, so they follow both. */
function SandboxRoot({ className, direction, children }: { className?: string; direction: 'ltr' | 'rtl'; children: React.ReactNode }) {
  const { large } = useLargeTargets();
  return (
    <div className={className ?? 'h-full w-full'} dir={direction} data-postext-sandbox="" data-pt-targets={large ? 'large' : 'compact'}>
      {children}
    </div>
  );
}
