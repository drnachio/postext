'use client';

import { useState, useEffect, useCallback, type RefObject } from 'react';
import type { ColorPaletteEntry } from 'postext';
import { Popover, type PopoverCloseReason } from '../../ui';
import { useSandboxLabels } from '../../context/SandboxContext';
import { useLargeTargets } from '../../ui/largeTargets';
import { SaturationValueArea } from '../SaturationValueArea';
import { HueSlider } from '../HueSlider';
import { AlphaSlider } from '../AlphaSlider';
import {
  hexToHsv, hsvToHex, hsvToRgb, rgbToHsv,
  rgbToHsl, hslToRgb, rgbToCmyk, cmykToRgb,
  clamp, hexAlpha, hexWithoutAlpha, hexWithAlpha,
  type HSV, type RGB, type HSL, type CMYK, type ColorMode,
} from '../color-utils';
import { PaletteChips } from './PaletteChips';
import { TabInputs } from './TabInputs';

interface ColorPopoverBodyProps {
  hex: string;
  onChange: (hex: string) => void;
  initialMode?: ColorMode;
  onModeChange?: (mode: ColorMode) => void;
  palette?: ColorPaletteEntry[];
  linkedPaletteId?: string;
  onLinkPalette?: (entryId: string) => void;
  onUnlinkPalette?: () => void;
  unlinkLabel?: string;
}

interface ColorPopoverProps extends ColorPopoverBodyProps {
  open: boolean;
  onOpenChange: (open: boolean, reason: PopoverCloseReason, event: Event | undefined) => void;
  anchor: RefObject<Element | null>;
  ariaLabel: string;
}

// Each notation is an abbreviation, expanded in its title (WCAG 3.1.4).
const TABS: { id: ColorMode; label: string; titleKey: 'colorModeHex' | 'colorModeRgb' | 'colorModeCmyk' | 'colorModeHsl' }[] = [
  { id: 'hex', label: 'HEX', titleKey: 'colorModeHex' },
  { id: 'rgb', label: 'RGB', titleKey: 'colorModeRgb' },
  { id: 'cmyk', label: 'CMYK', titleKey: 'colorModeCmyk' },
  { id: 'hsl', label: 'HSL', titleKey: 'colorModeHsl' },
];

const POPOVER_WIDTH = 260;

const CHECKER = `repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%) 0 0 / 10px 10px`;

/** Colour editor anchored beside its field. The body mounts only while open
 *  so its working state always starts from the current `hex`. */
export function ColorPopover({ open, onOpenChange, anchor, ariaLabel, ...body }: ColorPopoverProps) {
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      anchor={anchor}
      width={POPOVER_WIDTH}
      initialFocus={false}
      ariaLabel={ariaLabel}
    >
      <ColorPopoverBody {...body} />
    </Popover>
  );
}

function ColorPopoverBody({ hex, onChange, initialMode = 'hex', onModeChange, palette, linkedPaletteId, onLinkPalette, onUnlinkPalette, unlinkLabel }: ColorPopoverBodyProps) {
  const { large } = useLargeTargets();
  const labels = useSandboxLabels();
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(hexWithoutAlpha(hex)));
  const [alpha, setAlpha] = useState(() => hexAlpha(hex));
  const [activeTab, setActiveTab] = useState<ColorMode>(initialMode);
  const [hexText, setHexText] = useState(() => hexWithoutAlpha(hex));
  const [hexError, setHexError] = useState(false);
  const [previousHex] = useState(hex);

  // Sync from external hex changes (e.g., reset)
  useEffect(() => {
    const hex6 = hexWithoutAlpha(hex);
    const currentHex = hsvToHex(hsv);
    if (hex6.toLowerCase() !== currentHex.toLowerCase()) {
      setHsv(hexToHsv(hex6));
      setHexText(hex6);
    }
    setAlpha(hexAlpha(hex));
  }, [hex]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setHexText(hsvToHex(hsv));
  }, [hsv]);

  const emitColor = useCallback((nextHsv: HSV, nextAlpha: number) => {
    const hex6 = hsvToHex(nextHsv);
    onChange(hexWithAlpha(hex6, nextAlpha));
  }, [onChange]);

  const updateHsv = useCallback((next: HSV) => {
    setHsv(next);
    emitColor(next, alpha);
  }, [alpha, emitColor]);

  const updateAlpha = useCallback((a: number) => {
    setAlpha(a);
    emitColor(hsv, a);
  }, [hsv, emitColor]);

  const handleSvChange = useCallback((s: number, v: number) => {
    updateHsv({ ...hsv, s, v });
  }, [hsv, updateHsv]);

  const handleHueChange = useCallback((h: number) => {
    updateHsv({ ...hsv, h });
  }, [hsv, updateHsv]);

  const rgb = hsvToRgb(hsv);
  const hsl = rgbToHsl(rgb);
  const cmyk = rgbToCmyk(rgb);
  const currentHex = hsvToHex(hsv);

  const handleRgbChange = (channel: keyof RGB, v: number) => {
    const next = { ...rgb, [channel]: v };
    updateHsv(rgbToHsv(next));
  };

  const handleHslChange = (channel: keyof HSL, v: number) => {
    const next = { ...hsl, [channel]: v };
    updateHsv(rgbToHsv(hslToRgb(next)));
  };

  const handleCmykChange = (channel: keyof CMYK, v: number) => {
    const next = { ...cmyk, [channel]: v };
    updateHsv(rgbToHsv(cmykToRgb(next)));
  };

  const handleHexSubmit = () => {
    // A colour written another way is put back, and the error says how to
    // write one (WCAG 3.3.1, 3.3.3).
    if (/^#[0-9a-fA-F]{6}$/.test(hexText)) {
      const next = hexToHsv(hexText);
      updateHsv(next);
      setHexError(false);
    } else {
      setHexText(currentHex);
      setHexError(true);
    }
  };

  const previousHex6 = hexWithoutAlpha(previousHex);
  const previousAlpha = hexAlpha(previousHex);

  return (
    <>
      {palette && palette.length > 0 && (
        <PaletteChips
          palette={palette}
          linkedPaletteId={linkedPaletteId}
          onLinkPalette={onLinkPalette}
          onUnlinkPalette={onUnlinkPalette}
          unlinkLabel={unlinkLabel}
        />
      )}

      <SaturationValueArea
        hue={hsv.h}
        saturation={hsv.s}
        value={hsv.v}
        onChange={handleSvChange}
      />

      <HueSlider hue={hsv.h} onChange={handleHueChange} />

      <AlphaSlider alpha={alpha} color={currentHex} onChange={updateAlpha} />

      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        <div style={{ flex: 1, height: 20, borderRadius: 3, border: '1px solid var(--rule)', background: CHECKER, overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundColor: currentHex, opacity: alpha / 100 }} />
        </div>
        <div style={{ flex: 1, height: 20, borderRadius: 3, border: '1px solid var(--rule)', background: CHECKER, overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundColor: previousHex6, opacity: previousAlpha / 100 }} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 6 }}>
        <span style={{ fontSize: 9, color: 'var(--slate)' }}>{labels.colorAlpha}</span>
        <input
          type="number"
          value={alpha}
          onChange={(e) => updateAlpha(clamp(Number(e.target.value), 0, 100))}
          min={0}
          max={100}
          aria-label={labels.colorAlpha}
          style={{
            width: 42,
            padding: '2px 4px',
            fontSize: 10,
            textAlign: 'center',
            borderRadius: 3,
            border: '1px solid var(--pt-control-border)',
            backgroundColor: 'var(--background)',
            color: 'var(--foreground)',
          }}
        />
        <span style={{ fontSize: 9, color: 'var(--slate)' }}>%</span>
      </div>

      <div role="tablist" aria-label={labels.colorModes} style={{ display: 'flex', marginTop: 8, borderBottom: '1px solid var(--rule)' }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => { setActiveTab(tab.id); onModeChange?.(tab.id); }}
            style={{
              flex: 1,
              padding: '4px 0',
              minHeight: large ? 44 : undefined,
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: activeTab === tab.id ? 'var(--foreground)' : 'var(--slate)',
              borderBottom: activeTab === tab.id ? '2px solid var(--brand)' : '2px solid transparent',
              transition: 'color 150ms, border-color 150ms',
            }}
          >
            <abbr title={labels[tab.titleKey]} style={{ textDecoration: 'none' }}>{tab.label}</abbr>
          </button>
        ))}
      </div>

      <TabInputs
        activeTab={activeTab}
        hexText={hexText}
        setHexText={setHexText}
        handleHexSubmit={handleHexSubmit}
        rgb={rgb}
        hsl={hsl}
        cmyk={cmyk}
        handleRgbChange={handleRgbChange}
        handleHslChange={handleHslChange}
        handleCmykChange={handleCmykChange}
        hexLabel={labels.colorHexField}
        hexError={hexError ? labels.colorHexInvalid : null}
      />
    </>
  );
}
