'use client';

import { memo, type ReactNode } from 'react';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { useSandboxLabels } from '../context/SandboxContext';
import { Tooltip } from '../panels/Tooltip';

interface PdfToolbarProps {
  onRegenerate: () => void;
  onDownload: () => void;
  onPrint: () => void;
  canDownload: boolean;
  canPrint: boolean;
  generating: boolean;
}

function ToolbarButton({
  icon,
  label,
  onClick,
  disabled,
  spinning,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  spinning?: boolean;
}) {
  return (
    <Tooltip content={label} side="left">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        disabled={disabled}
        className="flex shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-1 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-40"
        style={{
          width: 28,
          height: 28,
          color: 'var(--slate)',
          backgroundColor: 'transparent',
          outlineColor: 'var(--gilt-hover)',
        }}
        onMouseEnter={(e) => {
          if (disabled) return;
          e.currentTarget.style.color = 'var(--foreground)';
          e.currentTarget.style.backgroundColor = 'var(--surface)';
        }}
        onMouseLeave={(e) => {
          if (disabled) return;
          e.currentTarget.style.color = 'var(--slate)';
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <span
          aria-hidden="true"
          style={spinning ? { animation: 'postext-spin 0.8s linear infinite', display: 'inline-flex' } : undefined}
        >
          {icon}
        </span>
      </button>
    </Tooltip>
  );
}

function Separator() {
  return (
    <div
      className="mx-1 w-full shrink-0"
      style={{ height: 1, backgroundColor: 'var(--rule)' }}
      aria-hidden="true"
    />
  );
}

export const PdfToolbar = memo(function PdfToolbar({
  onRegenerate,
  onDownload,
  onPrint,
  canDownload,
  canPrint,
  generating,
}: PdfToolbarProps) {
  const labels = useSandboxLabels();
  return (
    <div
      role="toolbar"
      aria-label={labels.pdfToolbar}
      className="flex flex-col items-center"
      style={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        zIndex: 10,
        gap: 2,
        backgroundColor: 'var(--background)',
        border: '1px solid var(--rule)',
        borderRadius: 8,
        padding: 4,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
      }}
    >
      <ToolbarButton
        icon={<RefreshCw size={16} />}
        label={labels.pdfRegenerate}
        onClick={onRegenerate}
        disabled={generating}
        spinning={generating}
      />
      <Separator />
      <ToolbarButton
        icon={<Download size={16} />}
        label={labels.pdfDownload}
        onClick={onDownload}
        disabled={!canDownload}
      />
      <ToolbarButton
        icon={<Printer size={16} />}
        label={labels.pdfPrint}
        onClick={onPrint}
        disabled={!canPrint}
      />
      <style>{`@keyframes postext-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
});
