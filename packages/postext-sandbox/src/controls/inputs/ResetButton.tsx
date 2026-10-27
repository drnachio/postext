'use client';

import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { IconButton } from '../../ui/index.js';

interface ResetButtonProps {
  onClick: () => void;
  label?: string;
  icon?: ReactNode;
}

/** Inline "back to default" affordance shown next to overridden fields. */
export function ResetButton({ onClick, label, icon }: ResetButtonProps) {
  const labels = useSandboxLabels();
  return (
    <IconButton
      size={18}
      label={label ?? labels.resetToDefault}
      tooltipSide="inline-start"
      onClick={onClick}
      icon={icon ?? <RotateCcw size={11} />}
    />
  );
}
