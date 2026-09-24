'use client';

import { memo, useMemo, useRef } from 'react';
import { FileText } from 'lucide-react';
import { useSandboxLabels } from '../context/SandboxContext';
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

export const PdfPreview = memo(function PdfPreview({ bytesUrl, openPage, generating, progress, renderProgress = null, phase, error }: PdfPreviewProps) {
  const labels = useSandboxLabels();
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
          style={{ color: 'var(--rule)' }}
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
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full"
      style={{ backgroundColor: 'var(--surface)' }}
    >
      {src && (
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
          <GenerationBar progress={progress} renderProgress={renderProgress} phase={phase} />
        </div>
      )}
    </div>
  );
});

/** A bar for the generation: the share of the document's blocks placed in
 *  the running pass (the engine re-places the document a few times, so the
 *  bar refills per pass), then full and pulsing while the PDF is written. */
function GenerationBar({ progress, renderProgress, phase }: { progress: BuildProgress | null; renderProgress: RenderProgress | null; phase: 'layout' | 'render' | null }) {
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
