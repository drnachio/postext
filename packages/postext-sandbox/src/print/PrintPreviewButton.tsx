'use client';

import { Printer } from 'lucide-react';
import { useSandboxLabels } from '../context/SandboxContext.js';
import { ToolbarButton } from '../viewport/canvas/CanvasToolbar.js';
import { usePrintPreview } from './printPreviewToggle.js';

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
