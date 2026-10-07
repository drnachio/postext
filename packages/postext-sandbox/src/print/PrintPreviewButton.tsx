'use client';

import { Printer } from 'lucide-react';
import { useSandboxLabels } from '../context/SandboxContext';
import { ToolbarButton } from '../viewport/CanvasToolbar';
import { usePrintPreview } from './printPreviewToggle';

/** The print preview switch (#606), in the Canvas and Folio toolbars. */
export function PrintPreviewButton() {
  const labels = useSandboxLabels();
  const [on, setOn] = usePrintPreview();
  return (
    <ToolbarButton
      icon={<Printer size={16} aria-hidden="true" />}
      label={labels.printPreview}
      onClick={() => setOn(!on)}
      active={on}
    />
  );
}
