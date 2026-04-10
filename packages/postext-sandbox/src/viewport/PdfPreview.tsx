'use client';

import { FileText } from 'lucide-react';
import { useSandbox } from '../context/SandboxContext';

export function PdfPreview() {
  const { state } = useSandbox();

  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <FileText
        size={48}
        className="mb-4"
        style={{ color: 'var(--rule)' }}
      />
      <h2
        className="mb-2 text-sm font-semibold"
        style={{ color: 'var(--foreground)' }}
      >
        {state.labels.pdf}
      </h2>
      <p className="text-xs" style={{ color: 'var(--slate)' }}>
        {state.labels.comingSoon}
      </p>
      <p className="mt-2 text-xs" style={{ color: 'var(--slate)' }}>
        {state.labels.pdfComingSoonDescription}
      </p>
    </div>
  );
}
