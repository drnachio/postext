'use client';

import { useId, useRef, useState } from 'react';
import { tintHex, type ColorValue, type SpotColor } from 'postext';
import { useSandbox } from '../../context/SandboxContext.js';
import { FieldRow } from '../FieldRow.js';
import { useFieldIds } from '../fieldContext.js';
import { cn } from '../../ui/cn.js';
import { Link2 } from 'lucide-react';
import { ColorPopover } from './ColorPopover/index.js';
import { formatColor, hexAlpha, hexWithoutAlpha, type ColorMode } from './color-utils.js';
import type { PopoverCloseReason } from '../../ui/index.js';
import { ContrastBadge, ContrastDetails, useFieldContrast } from '../../contrast/ContrastBadge.js';

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
  /** The ground the colour is painted on, when it has one of its own (a
   *  number on its disc): the contrast badge measures it there alone, at
   *  `sizePt` (#1244). */
  contrastGround?: { hex: string; sizePt: number };
}

const CHECKER = `repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%) 0 0 / 6px 6px`;

const DEFAULT_COLOR: ColorValue = { hex: 'transparent', model: 'hex' };

export function ColorPicker({ label, value: rawValue, onChange, tooltip, isDefault, onReset, fieldId: _fieldId, disablePalette, hideLabel, contrastGround }: ColorPickerProps) {
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

  // A colour that overprints in print (`ColorValue.overprint`) keeps doing
  // so whatever notation edits it.
  const over = value.overprint ? { overprint: true } : {};

  const handleHexChange = (hex: string) => {
    // A colour picked another way is no longer an ink.
    onChange({ hex, model: value.model === 'spot' ? 'hex' : value.model, ...over });
  };

  const handleModeChange = (newMode: ColorMode) => {
    // The authored CMYK stays with a colour shown in CMYK, the ink with a
    // spot colour.
    onChange({
      hex: value.hex,
      model: newMode === 'spot' && !value.spot ? value.model : newMode,
      ...(newMode === 'cmyk' && value.cmyk ? { cmyk: value.cmyk } : {}),
      ...(value.spot ? { spot: value.spot } : {}),
      ...over,
    });
  };

  // A spot colour: an ink of its own, on its own plate.
  const handleSpotChange = (spot: SpotColor, hex: string) => {
    onChange({ hex, model: 'spot', spot, ...over });
  };

  // A colour set in the CMYK tab keeps its exact values (#604).
  const handleCmykChange = (cmyk: { c: number; m: number; y: number; k: number }, hex: string) => {
    onChange({ hex, model: 'cmyk', cmyk, ...over });
  };

  const linkToEntry = (paletteId: string) => {
    const entry = palette?.find((e) => e.id === paletteId);
    if (!entry) return;
    onChange({ hex: entry.value.hex, model: entry.value.model, paletteId });
  };

  // Unlinking keeps the colour the page shows: the entry's, not the value
  // stored beside the link (which may predate a change of the entry).
  const unlink = () => {
    const source = linkedEntry ? linkedEntry.value : value;
    onChange({ hex: source.hex, model: source.model, ...(source.cmyk ? { cmyk: source.cmyk } : {}), ...(source.spot ? { spot: source.spot } : {}) });
  };

  // A linked colour at a tint (`ColorValue.tint`): the entry at that
  // strength, which follows the entry when the palette changes.
  const tint = isLinked && value.tint !== undefined && value.tint < 100 ? value.tint : undefined;
  const setTint = (next: number) => {
    if (!linkedEntry) return;
    const { tint: _drop, ...rest } = value;
    void _drop;
    const t = Math.round(Math.min(100, Math.max(0, next)));
    onChange(t >= 100
      ? { ...rest, hex: linkedEntry.value.hex, model: linkedEntry.value.model }
      : { ...rest, hex: tintHex(linkedEntry.value.hex, t), model: 'hex', tint: t });
  };

  const displayText = isLinked
    ? `${linkedEntry!.name}${tint !== undefined ? ` ${tint} %` : ''}`
    : mode === 'cmyk' && value.cmyk
      ? `${value.cmyk.c} ${value.cmyk.m} ${value.cmyk.y} ${value.cmyk.k}`
      : mode === 'spot' && value.spot
        ? `${value.spot.name}${(value.spot.tint ?? 100) < 100 ? ` ${value.spot.tint} %` : ''}`
        : formatColor(value.hex, mode);
  const modeLabel = isLinked ? '' : mode === 'spot' ? state.labels.colorModeSpotShort : mode.toUpperCase();
  const swatchHex = isLinked ? tintHex(linkedEntry!.value.hex, tint) : value.hex;
  const alpha = hexAlpha(swatchHex);
  const hex6 = hexWithoutAlpha(swatchHex);
  // The colour's contrast with what the book sets it with (#748).
  const contrast = useFieldContrast(swatchHex, contrastGround);
  const contrastId = useId();

  const controls = (
    <div ref={controlsRef} className="flex shrink-0 items-center gap-1.5">
      {contrast && <ContrastBadge contrast={contrast} labels={state.labels} descriptionId={contrastId} />}
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
        contrastId={contrast ? contrastId : undefined}
      />
      <ColorPopover
        open={popoverOpen}
        onOpenChange={handleOpenChange}
        anchor={hideLabel ? controlsRef : rowRef}
        ariaLabel={label || state.labels.colorPickerOpen}
        hex={value.hex}
        onChange={handleHexChange}
        {...(value.model === 'cmyk' && value.cmyk ? { cmyk: value.cmyk } : {})}
        onCmykChange={handleCmykChange}
        {...(value.model === 'spot' && value.spot ? { spot: value.spot } : {})}
        onSpotChange={handleSpotChange}
        initialMode={mode}
        onModeChange={handleModeChange}
        palette={disablePalette ? undefined : palette}
        linkedPaletteId={value.paletteId}
        onLinkPalette={linkToEntry}
        onUnlinkPalette={unlink}
        unlinkLabel={unlinkLabel}
        footer={
          <>
            {!isLinked && value.hex !== 'transparent' && value.model !== 'spot' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 10, color: 'var(--foreground)', cursor: 'pointer' }} title={state.labels.colorOverprintHint}>
                <input type="checkbox" checked={!!value.overprint} onChange={(e) => {
                  const { overprint: _drop, ...rest } = value;
                  void _drop;
                  onChange(e.target.checked ? { ...rest, overprint: true } : rest);
                }} />
                {state.labels.colorOverprint}
              </label>
            )}
            {isLinked && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 10, color: 'var(--foreground)' }} title={state.labels.colorPaletteTintHint}>
                {state.labels.colorPaletteTint}
                <input type="number" min={0} max={100} step={1} value={tint ?? 100} style={{ width: 48 }}
                  onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) setTint(n); }} />
                %
              </label>
            )}
            {contrast ? <ContrastDetails contrast={contrast} hex={swatchHex} labels={state.labels} /> : null}
          </>
        }
      />
    </div>
  );

  if (hideLabel) return controls;

  return (
    <FieldRow ref={rowRef} label={label} tooltip={tooltip ?? (disablePalette ? state.labels.paletteColorFieldHelp : state.labels.colorFieldHelp)} isDefault={muted} onReset={onReset} extraTerms={[displayText]}>
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
  /** id of the contrast summary, read with the field's description. */
  contrastId?: string;
}

/** One button: swatch + value (the palette colour's name when linked). Its
 *  accessible name is the row label followed by the value. */
function ColorTrigger({ open, onToggle, label, standalone, displayText, modeLabel, isLinked, muted, hex6, alpha, contrastId }: ColorTriggerProps) {
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
      aria-describedby={[named ? ids.descriptionId : undefined, contrastId].filter(Boolean).join(' ') || undefined}
      aria-expanded={open}
      aria-haspopup="dialog"
      className={cn(
        'inline-flex h-7 pt-large:h-11 max-w-[10.5rem] cursor-pointer items-center gap-1.5 rounded-md border border-(--pt-control-border) bg-(--surface) pe-2 ps-1 transition-colors',
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
        {modeLabel && <span className="me-1 font-sans text-[0.55rem] text-(--slate)">{modeLabel}</span>}
        {displayText}
      </span>
    </button>
  );
}
