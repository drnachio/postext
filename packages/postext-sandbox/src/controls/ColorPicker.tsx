'use client';

import { useRef, useState } from 'react';
import type { ColorValue } from 'postext';
import { InfoTip } from './InfoTip';
import { ResetButton } from './ResetButton';
import { ColorPopover } from './ColorPopover';
import { formatColor, hexAlpha, hexWithoutAlpha, type ColorMode } from './color-utils';

interface ColorPickerProps {
  label: string;
  value: ColorValue;
  onChange: (color: ColorValue) => void;
  tooltip?: string;
  isDefault?: boolean;
  onReset?: () => void;
  fieldId?: string;
}

const CHECKER = `repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%) 0 0 / 6px 6px`;

const DEFAULT_COLOR: ColorValue = { hex: 'transparent', model: 'hex' };

export function ColorPicker({ label, value: rawValue, onChange, tooltip, isDefault, onReset, fieldId: _fieldId }: ColorPickerProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const swatchRef = useRef<HTMLButtonElement>(null);
  const muted = isDefault ?? false;

  const value: ColorValue = rawValue?.hex ? rawValue : DEFAULT_COLOR;
  const mode = (value.model ?? 'hex') as ColorMode;

  const openPopover = () => {
    if (swatchRef.current) {
      setAnchorRect(swatchRef.current.getBoundingClientRect());
    }
    setPopoverOpen(true);
  };

  const handleHexChange = (hex: string) => {
    onChange({ hex, model: value.model });
  };

  const handleModeChange = (newMode: ColorMode) => {
    onChange({ hex: value.hex, model: newMode });
  };

  const displayText = formatColor(value.hex, mode);
  const modeLabel = mode.toUpperCase();
  const alpha = hexAlpha(value.hex);
  const hex6 = hexWithoutAlpha(value.hex);

  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        {tooltip && <InfoTip text={tooltip} />}
        <label className="text-xs shrink-0" style={{ color: 'var(--slate)' }}>
          {label}
        </label>
      </div>
      <div className="flex items-center gap-1.5">
        {!muted && onReset && <ResetButton onClick={onReset} />}
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
            background: CHECKER,
            borderColor: 'var(--rule)',
            cursor: 'pointer',
            opacity: muted ? 0.6 : 1,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: hex6,
            opacity: alpha / 100,
          }} />
        </button>
      </div>
      {popoverOpen && anchorRect && (
        <ColorPopover
          hex={value.hex}
          onChange={handleHexChange}
          anchorRect={anchorRect}
          onClose={() => setPopoverOpen(false)}
          initialMode={mode}
          onModeChange={handleModeChange}
        />
      )}
    </div>
  );
}
