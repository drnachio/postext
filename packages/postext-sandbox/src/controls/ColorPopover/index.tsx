'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ColorPaletteEntry } from 'postext';
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

interface ColorPopoverProps {
  hex: string;
  onChange: (hex: string) => void;
  anchorRect: DOMRect;
  onClose: () => void;
  initialMode?: ColorMode;
  onModeChange?: (mode: ColorMode) => void;
  palette?: ColorPaletteEntry[];
  linkedPaletteId?: string;
  onLinkPalette?: (entryId: string) => void;
  onUnlinkPalette?: () => void;
  unlinkLabel?: string;
}

const TABS: { id: ColorMode; label: string }[] = [
  { id: 'hex', label: 'HEX' },
  { id: 'rgb', label: 'RGB' },
  { id: 'cmyk', label: 'CMYK' },
  { id: 'hsl', label: 'HSL' },
];

const POPOVER_WIDTH = 240;
const POPOVER_GAP = 6;

const CHECKER = `repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%) 0 0 / 10px 10px`;

export function ColorPopover({ hex, onChange, anchorRect, onClose, initialMode = 'hex', onModeChange, palette, linkedPaletteId, onLinkPalette, onUnlinkPalette, unlinkLabel }: ColorPopoverProps) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(hexWithoutAlpha(hex)));
  const [alpha, setAlpha] = useState(() => hexAlpha(hex));
  const [activeTab, setActiveTab] = useState<ColorMode>(initialMode);
  const [hexText, setHexText] = useState(() => hexWithoutAlpha(hex));
  const [previousHex] = useState(hex);
  const popoverRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

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
    if (/^#[0-9a-fA-F]{6}$/.test(hexText)) {
      const next = hexToHsv(hexText);
      updateHsv(next);
    } else {
      setHexText(currentHex);
    }
  };

  // Position — flip above anchor if not enough space below
  const estimatedHeight = 400;
  const fitsBelow = anchorRect.bottom + POPOVER_GAP + estimatedHeight < window.innerHeight;
  const top = fitsBelow
    ? anchorRect.bottom + POPOVER_GAP
    : Math.max(8, anchorRect.top - POPOVER_GAP - estimatedHeight);
  const left = Math.max(8, anchorRect.right - POPOVER_WIDTH);

  const previousHex6 = hexWithoutAlpha(previousHex);
  const previousAlpha = hexAlpha(previousHex);

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Color picker"
      style={{
        position: 'fixed',
        zIndex: 50,
        width: POPOVER_WIDTH,
        top,
        left,
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--rule)',
        borderRadius: 8,
        padding: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
      }}
    >
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
        <div style={{
          flex: 1,
          height: 20,
          borderRadius: 3,
          border: '1px solid var(--rule)',
          background: CHECKER,
          overflow: 'hidden',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: currentHex,
            opacity: alpha / 100,
          }} />
        </div>
        <div style={{
          flex: 1,
          height: 20,
          borderRadius: 3,
          border: '1px solid var(--rule)',
          background: CHECKER,
          overflow: 'hidden',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: previousHex6,
            opacity: previousAlpha / 100,
          }} />
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4,
        marginTop: 6,
      }}>
        <span style={{ fontSize: 9, color: 'var(--slate)' }}>Alpha</span>
        <input
          type="number"
          value={alpha}
          onChange={(e) => updateAlpha(clamp(Number(e.target.value), 0, 100))}
          min={0}
          max={100}
          style={{
            width: 42,
            padding: '2px 4px',
            fontSize: 10,
            textAlign: 'center',
            borderRadius: 3,
            border: '1px solid var(--rule)',
            backgroundColor: 'var(--background)',
            color: 'var(--foreground)',
            outline: 'none',
          }}
        />
        <span style={{ fontSize: 9, color: 'var(--slate)' }}>%</span>
      </div>

      <div
        role="tablist"
        style={{
          display: 'flex',
          marginTop: 8,
          borderBottom: '1px solid var(--rule)',
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => { setActiveTab(tab.id); onModeChange?.(tab.id); }}
            style={{
              flex: 1,
              padding: '4px 0',
              fontSize: 9,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: activeTab === tab.id ? 'var(--foreground)' : 'var(--slate)',
              borderBottom: activeTab === tab.id ? '2px solid var(--gilt)' : '2px solid transparent',
              transition: 'color 150ms, border-color 150ms',
            }}
          >
            {tab.label}
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
      />
    </div>
  );
}
