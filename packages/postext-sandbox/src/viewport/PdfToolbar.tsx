'use client';

import { memo } from 'react';
import { ArrowRight, Download, Printer, RefreshCw } from 'lucide-react';
import { useSandboxLabels } from '../context/SandboxContext';
import {
  PinToolbarButton,
  TOOLBAR_STYLE_BASE,
  ToolbarButton,
  ToolbarSeparator,
  toolbarHiddenStyle,
} from './CanvasToolbar';

interface PdfToolbarProps {
  onRegenerate: () => void;
  onDownload: () => void;
  onPrint: () => void;
  onTogglePin: () => void;
  canDownload: boolean;
  canPrint: boolean;
  generating: boolean;
  pinned: boolean;
  hidden: boolean;
  dirty: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const PdfToolbar = memo(function PdfToolbar({
  onRegenerate,
  onDownload,
  onPrint,
  onTogglePin,
  canDownload,
  canPrint,
  generating,
  pinned,
  hidden,
  dirty,
  onMouseEnter,
  onMouseLeave,
}: PdfToolbarProps) {
  const labels = useSandboxLabels();
  const showDirtyArrow = dirty && !generating && !hidden;
  return (
    <div
      role="toolbar"
      aria-label={labels.pdfToolbar}
      className="flex flex-col items-center"
      style={{ ...TOOLBAR_STYLE_BASE, ...toolbarHiddenStyle(hidden) }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {showDirtyArrow && (
        <span
          aria-label={labels.pdfDirty}
          title={labels.pdfDirty}
          style={{
            position: 'absolute',
            right: 'calc(100% + 6px)',
            top: 6,
            color: 'var(--gilt)',
            display: 'inline-flex',
            animation: 'postext-dirty-bounce 1s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        >
          <ArrowRight size={18} aria-hidden="true" />
        </span>
      )}
      <ToolbarButton
        icon={<RefreshCw size={16} aria-hidden="true" />}
        label={labels.pdfRegenerate}
        onClick={onRegenerate}
        disabled={generating}
        spinning={generating}
        accent={generating}
      />
      <ToolbarSeparator />
      <PinToolbarButton
        pinned={pinned}
        onToggle={onTogglePin}
        pinLabel={labels.toolbarPin}
        unpinLabel={labels.toolbarUnpin}
      />
      <ToolbarSeparator />
      <ToolbarButton
        icon={<Download size={16} aria-hidden="true" />}
        label={labels.pdfDownload}
        onClick={onDownload}
        disabled={!canDownload}
      />
      <ToolbarButton
        icon={<Printer size={16} aria-hidden="true" />}
        label={labels.pdfPrint}
        onClick={onPrint}
        disabled={!canPrint}
      />
      <style>{`@keyframes postext-spin { to { transform: rotate(360deg); } } @keyframes postext-dirty-bounce { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(-4px); } }`}</style>
    </div>
  );
});
