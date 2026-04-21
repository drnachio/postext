'use client';

import { memo } from 'react';
import { FileText } from 'lucide-react';
import { useSandboxLabels } from '../context/SandboxContext';

interface PdfPreviewProps {
  bytesUrl: string | null;
  generating: boolean;
  error: string | null;
}

export const PdfPreview = memo(function PdfPreview({ bytesUrl, generating, error }: PdfPreviewProps) {
  const labels = useSandboxLabels();

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
      {bytesUrl && (
        <iframe
          data-postext-pdf="true"
          title={labels.pdf}
          src={bytesUrl}
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
              borderTopColor: 'var(--gilt)',
              borderRadius: '50%',
              animation: 'postext-spin 0.8s linear infinite',
            }}
          />
          <p className="mt-3 text-xs" style={{ color: 'var(--slate)' }}>
            {labels.pdfGenerating}
          </p>
          <style>{`@keyframes postext-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
});
