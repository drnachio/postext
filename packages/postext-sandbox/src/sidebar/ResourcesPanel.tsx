'use client';

import { FolderOpen } from 'lucide-react';
import { useSandbox } from '../context/SandboxContext';

export function ResourcesPanel() {
  const { state } = useSandbox();

  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <FolderOpen
        size={48}
        className="mb-4"
        style={{ color: 'var(--rule)' }}
      />
      <h2
        className="mb-2 text-sm font-semibold"
        style={{ color: 'var(--foreground)' }}
      >
        {state.labels.resources}
      </h2>
      <p className="text-xs" style={{ color: 'var(--slate)' }}>
        {state.labels.comingSoon}
      </p>
      <p className="mt-2 text-xs" style={{ color: 'var(--slate)' }}>
        {state.labels.resourcesComingSoonDescription}
      </p>
    </div>
  );
}
