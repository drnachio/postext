'use client';

import { useSandboxSelector } from '../context/SandboxContext';

/** What the Folio tab shows until the book is on the desk: while its code
 *  (three.js, `postext-folio`) loads on the first visit, then while the
 *  first layout is painted. One cover for both, so the wait reads as one. */
export function FolioLoading() {
  const label = useSandboxSelector((s) => s.labels.folioLoading);
  return (
    <div
      role="status"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-xs"
      style={{ backgroundColor: 'var(--surface)', color: 'var(--slate)' }}
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
      <span>{label}</span>
    </div>
  );
}
