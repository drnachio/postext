'use client';

import type { ReactNode } from 'react';

interface NestedGroupProps {
  children: ReactNode;
}

export function NestedGroup({ children }: NestedGroupProps) {
  return (
    <div
      className="relative"
      style={{
        marginLeft: 8,
        paddingLeft: 12,
        borderLeft: '1px solid var(--gilt)',
      }}
    >
      {children}
    </div>
  );
}
