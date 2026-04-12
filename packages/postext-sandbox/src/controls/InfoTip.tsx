'use client';

import { Info } from 'lucide-react';
import { Tooltip } from '../panels/Tooltip';

interface InfoTipProps {
  text: string;
}

export function InfoTip({ text }: InfoTipProps) {
  return (
    <Tooltip content={text} side="right">
      <span
        className="inline-flex items-center justify-center"
        style={{ color: 'var(--slate)', cursor: 'help', width: 16, height: 16 }}
      >
        <Info size={13} aria-hidden="true" />
      </span>
    </Tooltip>
  );
}
