'use client';

import { memo, useMemo, useRef } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import { useSandboxLabels } from '../context/SandboxContext';
import { useCompactLayout } from '../hooks/useCompactLayout';
import { pdfPageFragment } from '../storage/viewHash';
import type { BuildProgress } from '../worker/useLayoutWorker';
import type { RenderProgress } from 'postext-pdf/worker';

interface PdfPreviewProps {
  bytesUrl: string | null;
  /** 0-based page of the rendered document to open the viewer at. */
  openPage: number | null;
  generating: boolean;
  /** Placement progress of the running generation (null before the first
   *  report), and which phase it is in. */
  progress: BuildProgress | null;
  /** How far the PDF itself is written (pages rendered), once in `render`. */
  renderProgress?: RenderProgress | null;
  phase: 'layout' | 'render' | null;
  error: string | null;
}

/** Whether the browser can show a PDF inside the page. Android browsers
 *  cannot (`pdfViewerEnabled` is false), and iOS draws only the first page
 *  of an embedded PDF, with no scrolling: phones and touch-only tablets
 *  open the file instead. */
function useInlinePdf(): boolean {
  const compact = useCompactLayout();
  return useMemo(() => {
    if (compact) return false;
    if (typeof window === 'undefined') return true;
    if (navigator.pdfViewerEnabled === false) return false;
    return !window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  }, [compact]);
}

export const PdfPreview = memo(function PdfPreview({ bytesUrl, openPage, generating, progress, renderProgress = null, phase, error }: PdfPreviewProps) {
  const labels = useSandboxLabels();
  const inline = useInlinePdf();
  // Open the viewer at the reader's page, resolved by the viewport for
  // each new document (a change of `openPage` alone must not reload it).
  const openPageRef = useRef(openPage);
  openPageRef.current = openPage;
  const src = useMemo(
    () => (bytesUrl ? bytesUrl + pdfPageFragment(openPageRef.current) : null),
    [bytesUrl],
  );

  if (error && !generating) {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center p-6 text-center"
        style={{ backgroundColor: 'var(--surface)' }}
      >
        <FileText
          size={48}
          className="mb-4"
          aria-hidden="true"
          style={{ color: 'var(--slate)' }}
        />
        <h2
          className="mb-2 text-sm font-semibold"
          style={{ color: 'var(--foreground)' }}
        >
          {labels.pdfError}
        </h2>
        <p className="max-w-md text-xs" style={{ color: 'var(--slate)' }}>
          {error}
        </p>
        <p className="mt-2 max-w-md text-xs" style={{ color: 'var(--slate)' }}>
          {labels.pdfErrorHint}
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full"
      style={{ backgroundColor: 'var(--surface)' }}
    >
      {src && !inline && !generating && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 pb-20 text-center">
          <FileText size={48} aria-hidden="true" style={{ color: 'var(--slate)' }} />
          <p className="max-w-xs text-sm" style={{ color: 'var(--slate)' }}>
            {labels.pdfInlineUnavailable}
          </p>
          <a
            href={bytesUrl!}
            target="_blank"
            rel="noopener"
            className="inline-flex h-10 pt-large:min-h-11 items-center gap-2 rounded-md px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 outline-(--brand)"
            style={{ backgroundColor: 'var(--brand)', color: 'var(--brand-contrast, var(--background))' }}
          >
            <ExternalLink size={16} aria-hidden="true" />
            {labels.pdfOpen}
            <span className="sr-only"> ({labels.opensInNewTab})</span>
          </a>
        </div>
      )}
      {src && inline && (
        <iframe
          data-postext-pdf="true"
          title={labels.pdf}
          src={src}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            border: 0,
            backgroundColor: 'var(--surface)',
          }}
        />
      )}
      {generating && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ backgroundColor: bytesUrl ? 'rgba(0,0,0,0.35)' : 'transparent' }}
        >
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
          <p className="mt-3 text-xs" style={{ color: 'var(--slate)' }}>
            {phase === 'render'
              ? labels.pdfProgressRender
              : progress
                ? labels.pdfProgressLayout.replace('__pass__', String(progress.pass)).replace('__page__', String(progress.pages + 1))
                : labels.pdfGenerating}
          </p>
          <GenerationBar progress={progress} renderProgress={renderProgress} phase={phase} label={labels.pdfGenerating} />
        </div>
      )}
    </div>
  );
});

/** A bar for the generation: the share of the document's blocks placed in
 *  the running pass (the engine re-places the document a few times, so the
 *  bar refills per pass), then full and pulsing while the PDF is written. */
function GenerationBar({ progress, renderProgress, phase, label }: { progress: BuildProgress | null; renderProgress: RenderProgress | null; phase: 'layout' | 'render' | null; label: string }) {
  // While the PDF is written the bar follows the pages rendered; it fills
  // and pulses for the parts that report nothing (fonts, the file itself).
  const fraction = phase === 'render'
    ? renderProgress && renderProgress.phase === 'pages' && renderProgress.totalPages > 0
      ? Math.min(1, renderProgress.pages / renderProgress.totalPages)
      : 1
    : progress && progress.totalBlocks > 0
      ? Math.min(1, progress.blocks / progress.totalBlocks)
      : 0;
  const pulse = phase === 'render' && !(renderProgress && renderProgress.phase === 'pages');
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      className="mt-3 h-1 w-48 overflow-hidden rounded-full"
      style={{ backgroundColor: 'var(--rule)' }}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${fraction * 100}%`,
          backgroundColor: 'var(--brand)',
          transition: 'width 120ms linear',
          animation: pulse ? 'postext-pulse 1s ease-in-out infinite' : undefined,
        }}
      />
    </div>
  );
}
