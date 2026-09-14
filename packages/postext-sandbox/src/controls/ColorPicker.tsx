'use client';

import { useRef, useState } from 'react';
import type { ColorValue } from 'postext';
import { useSandbox } from '../context/SandboxContext';
import { FieldRow } from './FieldRow';
import { ColorPopover } from './ColorPopover';
import { formatColor, hexAlpha, hexWithoutAlpha, type ColorMode } from './color-utils';
import type { PopoverCloseReason } from '../ui';

interface ColorPickerProps {
  label: string;
  value: ColorValue;
  onChange: (color: ColorValue) => void;
  tooltip?: string;
  isDefault?: boolean;
  onReset?: () => void;
  fieldId?: string;
  /** When true, the palette link/unlink UI is hidden (e.g. inside the palette editor itself). */
  disablePalette?: boolean;
  /** Render only the value button + swatch (no row, no label) — for hosts
   *  that lay out their own row, like the palette entry list. */
  hideLabel?: boolean;
}

const CHECKER = `repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%) 0 0 / 6px 6px`;

const DEFAULT_COLOR: ColorValue = { hex: 'transparent', model: 'hex' };

export function ColorPicker({ label, value: rawValue, onChange, tooltip, isDefault, onReset, fieldId: _fieldId, disablePalette, hideLabel }: ColorPickerProps) {
  const { state } = useSandbox();
  const palette = disablePalette ? undefined : state.config.colorPalette;
  const unlinkLabel = state.labels.colorPaletteUnlink;

  const [popoverOpen, setPopoverOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const muted = isDefault ?? false;

  const value: ColorValue = rawValue?.hex ? rawValue : DEFAULT_COLOR;
  const mode = (value.model ?? 'hex') as ColorMode;
  const linkedEntry = value.paletteId ? palette?.find((e) => e.id === value.paletteId) : undefined;
  const isLinked = !!linkedEntry;

  const handleOpenChange = (next: boolean, reason: PopoverCloseReason, event: Event | undefined) => {
    // A press on the swatch/value button while open toggles instead of
    // closing-then-reopening.
    if (!next && reason === 'outside-press' && event && controlsRef.current?.contains(event.target as Node)) return;
    setPopoverOpen(next);
  };

  const handleHexChange = (hex: string) => {
    onChange({ hex, model: value.model });
  };

  const handleModeChange = (newMode: ColorMode) => {
    onChange({ hex: value.hex, model: newMode });
  };

  const linkToEntry = (paletteId: string) => {
    const entry = palette?.find((e) => e.id === paletteId);
    if (!entry) return;
    onChange({ hex: entry.value.hex, model: entry.value.model, paletteId });
  };

  const unlink = () => {
    onChange({ hex: value.hex, model: value.model });
  };

  const displayText = isLinked ? linkedEntry!.name : formatColor(value.hex, mode);
  const modeLabel = isLinked ? '' : mode.toUpperCase();
  const swatchHex = isLinked ? linkedEntry!.value.hex : value.hex;
  const alpha = hexAlpha(swatchHex);
  const hex6 = hexWithoutAlpha(swatchHex);

  const controls = (
    <div ref={controlsRef} className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={() => setPopoverOpen((v) => !v)}
        className="flex items-center gap-1 rounded border px-1.5 py-1"
        style={{
          borderColor: 'var(--rule)',
          backgroundColor: 'var(--surface)',
          color: muted ? 'var(--slate)' : 'var(--foreground)',
          cursor: 'pointer',
          fontSize: 10,
          fontFamily: isLinked ? 'var(--font-sans, sans-serif)' : 'monospace',
          lineHeight: '14px',
          fontStyle: isLinked ? 'italic' : 'normal',
        }}
      >
        {modeLabel && (
          <span style={{ color: 'var(--slate)', fontSize: 9, fontFamily: 'var(--font-sans, sans-serif)' }}>
            {modeLabel}
          </span>
        )}
        {displayText}
      </button>
      <button
        type="button"
        onClick={() => setPopoverOpen((v) => !v)}
        aria-label={label || state.labels.colorPickerOpen}
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
        <div style={{ position: 'absolute', inset: 0, backgroundColor: hex6, opacity: alpha / 100 }} />
      </button>
      <ColorPopover
        open={popoverOpen}
        onOpenChange={handleOpenChange}
        anchor={hideLabel ? controlsRef : rowRef}
        ariaLabel={label || state.labels.colorPickerOpen}
        hex={value.hex}
        onChange={handleHexChange}
        initialMode={mode}
        onModeChange={handleModeChange}
        palette={disablePalette ? undefined : palette}
        linkedPaletteId={value.paletteId}
        onLinkPalette={linkToEntry}
        onUnlinkPalette={unlink}
        unlinkLabel={unlinkLabel}
      />
    </div>
  );

  if (hideLabel) return controls;

  return (
    <FieldRow ref={rowRef} label={label} tooltip={tooltip} isDefault={muted} onReset={onReset} extraTerms={[displayText]}>
      {controls}
    </FieldRow>
  );
}
