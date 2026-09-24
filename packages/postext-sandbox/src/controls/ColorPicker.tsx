'use client';

import { useId, useRef, useState } from 'react';
import type { ColorValue } from 'postext';
import { useSandbox } from '../context/SandboxContext';
import { FieldRow } from './FieldRow';
import { useFieldIds } from './fieldContext';
import { cn } from '../ui/cn';
import { Link2 } from 'lucide-react';
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
    <div ref={controlsRef} className="flex shrink-0 items-center">
      <ColorTrigger
        open={popoverOpen}
        onToggle={() => setPopoverOpen((v) => !v)}
        label={label || state.labels.colorPickerOpen}
        standalone={!!hideLabel}
        displayText={displayText}
        modeLabel={modeLabel}
        isLinked={isLinked}
        muted={muted}
        hex6={hex6}
        alpha={alpha}
      />
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

interface ColorTriggerProps {
  open: boolean;
  onToggle: () => void;
  label: string;
  /** No enclosing field row: name the button with `label` directly. */
  standalone: boolean;
  displayText: string;
  modeLabel: string;
  isLinked: boolean;
  muted: boolean;
  hex6: string;
  alpha: number;
}

/** One button: swatch + value (the palette colour's name when linked). Its
 *  accessible name is the row label followed by the value. */
function ColorTrigger({ open, onToggle, label, standalone, displayText, modeLabel, isLinked, muted, hex6, alpha }: ColorTriggerProps) {
  const ids = useFieldIds();
  const valueId = useId();
  const named = ids && !standalone;
  return (
    <button
      type="button"
      id={named ? ids.controlId : undefined}
      onClick={onToggle}
      aria-labelledby={named ? `${ids.labelId} ${valueId}` : undefined}
      aria-label={named ? undefined : `${label}: ${displayText}`}
      aria-describedby={named ? ids.descriptionId : undefined}
      aria-expanded={open}
      aria-haspopup="dialog"
      className={cn(
        'inline-flex h-7 max-w-[10.5rem] cursor-pointer items-center gap-1.5 rounded-md border border-(--rule) bg-(--surface) pr-2 pl-1 transition-colors',
        'hover:border-(--rule-strong,var(--slate)) focus-visible:outline-2 focus-visible:outline-offset-0 outline-(--brand)',
        open && 'border-(--brand)',
        muted ? 'text-(--slate)' : 'text-(--foreground)',
      )}
    >
      <span
        aria-hidden="true"
        className="relative h-5 w-5 shrink-0 overflow-hidden rounded border border-(--rule)"
        style={{ background: CHECKER, opacity: muted ? 0.75 : 1 }}
      >
        <span className="absolute inset-0" style={{ backgroundColor: hex6, opacity: alpha / 100 }} />
      </span>
      {isLinked && <Link2 size={11} aria-hidden="true" className="shrink-0 text-(--brand)" />}
      <span id={valueId} className={cn('min-w-0 truncate text-[0.66rem]', !isLinked && 'font-mono')}>
        {modeLabel && <span className="mr-1 font-sans text-[0.55rem] text-(--slate)">{modeLabel}</span>}
        {displayText}
      </span>
    </button>
  );
}
