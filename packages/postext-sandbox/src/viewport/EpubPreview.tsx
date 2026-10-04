'use client';

import { memo, type MutableRefObject } from 'react';
import { BookOpen } from 'lucide-react';
import { useSandboxLabels } from '../context/SandboxContext';
import { EpubReader, type EpubReaderHandle, type EpubReaderPosition } from './EpubReader';

/** Where a generation stands: the chapters being laid out, the fonts,
 *  pictures and cover being gathered, then the writer's own phases. */
export interface EpubGenerationProgress {
  phase: 'layout' | 'inputs' | 'documents' | 'resources' | 'package';
  done: number;
  total: number;
}

interface EpubPreviewProps {
  bytes: Uint8Array | null;
  generating: boolean;
  progress: EpubGenerationProgress | null;
  error: string | null;
  fontScale: number;
  readerRef: MutableRefObject<EpubReaderHandle | null>;
  onPosition: (position: EpubReaderPosition | null) => void;
}

export const EpubPreview = memo(function EpubPreview({ bytes, generating, progress, error, fontScale, readerRef, onPosition }: EpubPreviewProps) {
  const labels = useSandboxLabels();

  if (error && !generating) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center" style={{ backgroundColor: 'var(--surface)' }}>
        <BookOpen size={48} className="mb-4" aria-hidden="true" style={{ color: 'var(--slate)' }} />
        <h2 className="mb-2 text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{labels.epubError}</h2>
        <p className="max-w-md text-xs" style={{ color: 'var(--slate)' }}>{error}</p>
        <p className="mt-2 max-w-md text-xs" style={{ color: 'var(--slate)' }}>{labels.pdfErrorHint}</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full" style={{ backgroundColor: 'var(--surface)' }}>
      {bytes && <EpubReader bytes={bytes} fontScale={fontScale} handleRef={readerRef} onPosition={onPosition} />}
      {generating && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ backgroundColor: bytes ? 'rgba(0,0,0,0.35)' : 'transparent' }}
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
            {progressText(progress, labels)}
          </p>
          <ProgressBar progress={progress} label={labels.epubGenerating} />
        </div>
      )}
    </div>
  );
});

function progressText(progress: EpubGenerationProgress | null, labels: ReturnType<typeof useSandboxLabels>): string {
  if (!progress) return labels.epubGenerating;
  switch (progress.phase) {
    case 'layout':
      return labels.epubProgressLayout
        .replace('__chapter__', String(Math.min(progress.total, progress.done + 1)))
        .replace('__count__', String(progress.total));
    case 'inputs':
    case 'resources':
      return labels.epubProgressInputs;
    case 'documents':
      return labels.epubProgressDocuments.replace('__done__', String(progress.done)).replace('__total__', String(progress.total));
    case 'package':
      return labels.epubProgressPackage;
  }
}

/** Share of the generation done: the layout fills the first half (one
 *  step per chapter), the writing the second; the steps that report no
 *  count pulse. */
function progressFraction(progress: EpubGenerationProgress | null): { fraction: number; pulse: boolean } {
  if (!progress) return { fraction: 0, pulse: false };
  const share = progress.total > 0 ? Math.min(1, progress.done / progress.total) : 0;
  switch (progress.phase) {
    case 'layout': return { fraction: 0.5 * share, pulse: false };
    case 'inputs': return { fraction: 0.5, pulse: true };
    case 'resources': return { fraction: 0.55, pulse: true };
    case 'documents': return { fraction: 0.55 + 0.4 * share, pulse: false };
    case 'package': return { fraction: 0.95 + 0.05 * share, pulse: true };
  }
}

function ProgressBar({ progress, label }: { progress: EpubGenerationProgress | null; label: string }) {
  const { fraction, pulse } = progressFraction(progress);
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
