'use client';

import { Info } from 'lucide-react';
import { Tooltip } from '../ui';

interface InfoTipProps {
  text: string;
}

export function InfoTip({ text }: InfoTipProps) {
  return (
    <Tooltip content={text} side="right">
      <span
        tabIndex={0}
        className="inline-flex shrink-0 items-center justify-center rounded focus-visible:outline-1 focus-visible:outline-offset-1 outline-(--gilt-hover)"
        style={{ color: 'var(--slate)', cursor: 'help', width: 16, height: 16 }}
      >
        <Info size={13} aria-hidden="true" />
      </span>
    </Tooltip>
  );
}
