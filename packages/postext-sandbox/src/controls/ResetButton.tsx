'use client';

import { RotateCcw } from 'lucide-react';
import { useSandboxLabels } from '../context/SandboxContext';
import { IconButton } from '../ui';

interface ResetButtonProps {
  onClick: () => void;
  label?: string;
}

/** Inline "back to default" affordance shown next to overridden fields. */
export function ResetButton({ onClick, label }: ResetButtonProps) {
  const labels = useSandboxLabels();
  return (
    <IconButton
      size={18}
      label={label ?? labels.resetToDefault}
      tooltipSide="left"
      onClick={onClick}
      icon={<RotateCcw size={11} />}
    />
  );
}
