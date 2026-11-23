'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { BuildCoverIssue } from 'postext/production';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { coverIssueText } from './coverLabels.js';

/** What the cover's build found, each in a line. */
export function CoverChecks({ issues }: { issues: readonly BuildCoverIssue[] }) {
  const labels = useSandboxLabels();
  if (issues.length === 0) {
    return (
      <p className="flex items-center gap-2 px-3 py-2 text-xs text-(--slate)">
        <CheckCircle2 size={14} aria-hidden="true" />
        {labels.coverChecksOk}
      </p>
    );
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-1 px-3 py-2 text-xs">
      {issues.map((issue, i) => (
        <li key={`${issue.kind}-${i}`} className="flex items-start gap-2">
          <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-(--brand)" />
          <span>{coverIssueText(labels, issue)}</span>
        </li>
      ))}
    </ul>
  );
}
