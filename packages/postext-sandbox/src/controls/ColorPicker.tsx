'use client';

import { useEffect, useRef, useState } from 'react';
import { Link2, Link2Off } from 'lucide-react';
import type { ColorValue } from 'postext';
import { useSandbox } from '../context/SandboxContext';
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
  /** When true, the palette link/unlink UI is hidden (e.g. inside the palette editor itself). */
  disablePalette?: boolean;
}

const CHECKER = `repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%) 0 0 / 6px 6px`;

const DEFAULT_COLOR: ColorValue = { hex: 'transparent', model: 'hex' };

export function ColorPicker({ label, value: rawValue, onChange, tooltip, isDefault, onReset, fieldId: _fieldId, disablePalette }: ColorPickerProps) {
  const { state } = useSandbox();
  const palette = disablePalette ? undefined : state.config.colorPalette;
  const linkLabel = state.labels.colorPaletteLink;
  const unlinkLabel = state.labels.colorPaletteUnlink;

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [paletteMenuOpen, setPaletteMenuOpen] = useState(false);
  const swatchRef = useRef<HTMLButtonElement>(null);
  const paletteMenuRef = useRef<HTMLDivElement>(null);
  const muted = isDefault ?? false;

  const value: ColorValue = rawValue?.hex ? rawValue : DEFAULT_COLOR;
  const mode = (value.model ?? 'hex') as ColorMode;
  const linkedEntry = value.paletteId ? palette?.find((e) => e.id === value.paletteId) : undefined;
  const isLinked = !!linkedEntry;
  const showPaletteControls = !disablePalette && !!palette && palette.length > 0;

  useEffect(() => {
    if (!paletteMenuOpen) return;
    const handle = (e: MouseEvent) => {
      if (paletteMenuRef.current && !paletteMenuRef.current.contains(e.target as Node)) {
        setPaletteMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [paletteMenuOpen]);

  const openPopover = () => {
    if (isLinked) return;
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

  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        {tooltip && <InfoTip text={tooltip} />}
        <label className="text-xs shrink-0" style={{ color: 'var(--slate)' }}>
          {label}
        </label>
      </div>
      <div className="relative flex items-center gap-1.5">
        {!muted && onReset && <ResetButton onClick={onReset} />}
        {showPaletteControls && (
          <button
            type="button"
            onClick={() => setPaletteMenuOpen((o) => !o)}
            aria-label={isLinked ? unlinkLabel : linkLabel}
            title={isLinked ? `${unlinkLabel} (${linkedEntry!.name})` : linkLabel}
            className="flex h-5 w-5 items-center justify-center rounded"
            style={{
              color: isLinked ? 'var(--foreground)' : 'var(--slate)',
              cursor: 'pointer',
              backgroundColor: paletteMenuOpen ? 'var(--surface)' : 'transparent',
            }}
          >
            {isLinked ? <Link2 size={12} aria-hidden="true" /> : <Link2Off size={12} aria-hidden="true" />}
          </button>
        )}
        <button
          type="button"
          onClick={openPopover}
          disabled={isLinked}
          className="flex items-center gap-1 rounded border px-1.5 py-1"
          style={{
            borderColor: 'var(--rule)',
            backgroundColor: 'var(--surface)',
            color: muted ? 'var(--slate)' : 'var(--foreground)',
            cursor: isLinked ? 'default' : 'pointer',
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
          ref={swatchRef}
          type="button"
          onClick={openPopover}
          disabled={isLinked}
          aria-label="Pick color"
          aria-expanded={popoverOpen}
          aria-haspopup="dialog"
          className="shrink-0 rounded border"
          style={{
            width: 24,
            height: 24,
            background: CHECKER,
            borderColor: 'var(--rule)',
            cursor: isLinked ? 'default' : 'pointer',
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
      {paletteMenuOpen && showPaletteControls && (
        <div
          ref={paletteMenuRef}
          role="menu"
          className="absolute z-50 mt-1 rounded border py-1 shadow-md"
          style={{
            top: '100%',
            right: 0,
            minWidth: 160,
            borderColor: 'var(--rule)',
            backgroundColor: 'var(--background)',
            fontSize: 11,
          }}
        >
          {palette!.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                linkToEntry(entry.id);
                setPaletteMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 px-2 py-1 text-left"
              style={{
                color: 'var(--foreground)',
                backgroundColor: entry.id === value.paletteId ? 'var(--surface)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  border: '1px solid var(--rule)',
                  backgroundColor: entry.value.hex,
                }}
              />
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {entry.name}
              </span>
            </button>
          ))}
          {isLinked && (
            <button
              type="button"
              onClick={() => {
                unlink();
                setPaletteMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 border-t px-2 py-1 text-left"
              style={{ color: 'var(--slate)', borderColor: 'var(--rule)', cursor: 'pointer' }}
            >
              <Link2Off size={12} aria-hidden="true" />
              <span>{unlinkLabel}</span>
            </button>
          )}
        </div>
      )}
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
