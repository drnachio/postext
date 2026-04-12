'use client';

import { useRef, useState } from 'react';
import { InfoTip } from './InfoTip';
import { ResetButton } from './ResetButton';
import { ColorPopover } from './ColorPopover';
import { formatColor, type ColorMode } from './color-utils';
import { saveColorMode, loadColorMode } from '../storage/persistence';

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  tooltip?: string;
  isDefault?: boolean;
  onReset?: () => void;
  fieldId?: string;
}

export function ColorPicker({ label, value, onChange, tooltip, isDefault, onReset, fieldId }: ColorPickerProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [mode, setMode] = useState<ColorMode>(() => {
    if (fieldId) {
      const saved = loadColorMode(fieldId);
      if (saved === 'hex' || saved === 'rgb' || saved === 'cmyk' || saved === 'hsl') return saved;
    }
    return 'hex';
  });
  const swatchRef = useRef<HTMLButtonElement>(null);
  const muted = isDefault ?? false;

  const openPopover = () => {
    if (swatchRef.current) {
      setAnchorRect(swatchRef.current.getBoundingClientRect());
    }
    setPopoverOpen(true);
  };

  const handleModeChange = (newMode: ColorMode) => {
    setMode(newMode);
    if (fieldId) {
      saveColorMode(fieldId, newMode);
    }
  };

  const displayText = formatColor(value, mode);
  const modeLabel = mode.toUpperCase();

  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        {tooltip && <InfoTip text={tooltip} />}
        <label className="text-xs shrink-0" style={{ color: 'var(--slate)' }}>
          {label}
        </label>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={openPopover}
          className="flex items-center gap-1 rounded border px-1.5 py-1"
          style={{
            borderColor: 'var(--rule)',
            backgroundColor: 'var(--surface)',
            color: muted ? 'var(--slate)' : 'var(--foreground)',
            cursor: 'pointer',
            fontSize: 10,
            fontFamily: 'monospace',
            lineHeight: '14px',
          }}
        >
          <span style={{ color: 'var(--slate)', fontSize: 9, fontFamily: 'var(--font-sans, sans-serif)' }}>
            {modeLabel}
          </span>
          {displayText}
        </button>
        <button
          ref={swatchRef}
          type="button"
          onClick={openPopover}
          aria-label="Pick color"
          aria-expanded={popoverOpen}
          aria-haspopup="dialog"
          className="shrink-0 rounded border"
          style={{
            width: 24,
            height: 24,
            backgroundColor: value,
            borderColor: 'var(--rule)',
            cursor: 'pointer',
            opacity: muted ? 0.6 : 1,
          }}
        />
        {!muted && onReset && <ResetButton onClick={onReset} />}
      </div>
      {popoverOpen && anchorRect && (
        <ColorPopover
          hex={value}
          onChange={onChange}
          anchorRect={anchorRect}
          onClose={() => setPopoverOpen(false)}
          initialMode={mode}
          onModeChange={handleModeChange}
        />
      )}
    </div>
  );
}
