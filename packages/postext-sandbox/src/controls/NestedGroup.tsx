'use client';

import type { ReactNode } from 'react';

interface NestedGroupProps {
  children: ReactNode;
}

/** Fields that only apply because of the row above them (e.g. the gutter
 *  of a two-column layout): indented under a quiet rule. A size container,
 *  so rows inside switch to label-above-control on their own width. */
export function NestedGroup({ children }: NestedGroupProps) {
  return (
    <div className="@container relative mb-1.5 ml-1 border-l-2 border-(--rule) pl-3">
      {children}
    </div>
  );
}
