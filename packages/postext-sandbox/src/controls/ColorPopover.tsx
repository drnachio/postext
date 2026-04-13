'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { SaturationValueArea } from './SaturationValueArea';
import { HueSlider } from './HueSlider';
import { AlphaSlider } from './AlphaSlider';
import {
  hexToHsv, hsvToHex, hsvToRgb, rgbToHsv,
  rgbToHsl, hslToRgb, rgbToCmyk, cmykToRgb,
  clamp, hexAlpha, hexWithoutAlpha, hexWithAlpha,
  type HSV, type RGB, type HSL, type CMYK, type ColorMode,
} from './color-utils';

interface ColorPopoverProps {
  hex: string;
  onChange: (hex: string) => void;
  anchorRect: DOMRect;
  onClose: () => void;
  initialMode?: ColorMode;
  onModeChange?: (mode: ColorMode) => void;
}

const TABS: { id: ColorMode; label: string }[] = [
  { id: 'hex', label: 'HEX' },
  { id: 'rgb', label: 'RGB' },
  { id: 'cmyk', label: 'CMYK' },
  { id: 'hsl', label: 'HSL' },
];

const POPOVER_WIDTH = 240;
const POPOVER_GAP = 6;

function SmallInput({
  value,
  onChange,
  label,
  min = 0,
  max = 255,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  min?: number;
  max?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
        min={min}
        max={max}
        style={{
          width: 42,
          padding: '3px 4px',
          fontSize: 10,
          textAlign: 'center',
          borderRadius: 3,
          border: '1px solid var(--rule)',
          backgroundColor: 'var(--background)',
          color: 'var(--foreground)',
          outline: 'none',
        }}
      />
      <span style={{ fontSize: 9, color: 'var(--slate)' }}>{label}</span>
    </div>
  );
}

const CHECKER = `repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%) 0 0 / 10px 10px`;

export function ColorPopover({ hex, onChange, anchorRect, onClose, initialMode = 'hex', onModeChange }: ColorPopoverProps) {
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

  // Update hex text when HSV changes internally
  useEffect(() => {
    setHexText(hsvToHex(hsv));
  }, [hsv]);

  // Click-outside and Escape
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

  // Derived values
  const rgb = hsvToRgb(hsv);
  const hsl = rgbToHsl(rgb);
  const cmyk = rgbToCmyk(rgb);
  const currentHex = hsvToHex(hsv);

  // Handlers for tab inputs
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

  // Position
  const top = anchorRect.bottom + POPOVER_GAP;
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
      {/* SV Area */}
      <SaturationValueArea
        hue={hsv.h}
        saturation={hsv.s}
        value={hsv.v}
        onChange={handleSvChange}
      />

      {/* Hue Slider */}
      <HueSlider hue={hsv.h} onChange={handleHueChange} />

      {/* Alpha Slider */}
      <AlphaSlider alpha={alpha} color={currentHex} onChange={updateAlpha} />

      {/* Color preview */}
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

      {/* Alpha value display */}
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

      {/* Tab bar */}
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

      {/* Tab inputs */}
      <div style={{ marginTop: 8 }}>
        {activeTab === 'hex' && (
          <input
            type="text"
            value={hexText}
            onChange={(e) => setHexText(e.target.value)}
            onBlur={handleHexSubmit}
            onKeyDown={(e) => e.key === 'Enter' && handleHexSubmit()}
            style={{
              width: '100%',
              padding: '4px 6px',
              fontSize: 11,
              fontFamily: 'monospace',
              borderRadius: 3,
              border: '1px solid var(--rule)',
              backgroundColor: 'var(--background)',
              color: 'var(--foreground)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        )}

        {activeTab === 'rgb' && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            <SmallInput value={rgb.r} onChange={(v) => handleRgbChange('r', v)} label="R" max={255} />
            <SmallInput value={rgb.g} onChange={(v) => handleRgbChange('g', v)} label="G" max={255} />
            <SmallInput value={rgb.b} onChange={(v) => handleRgbChange('b', v)} label="B" max={255} />
          </div>
        )}

        {activeTab === 'cmyk' && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
            <SmallInput value={cmyk.c} onChange={(v) => handleCmykChange('c', v)} label="C" max={100} />
            <SmallInput value={cmyk.m} onChange={(v) => handleCmykChange('m', v)} label="M" max={100} />
            <SmallInput value={cmyk.y} onChange={(v) => handleCmykChange('y', v)} label="Y" max={100} />
            <SmallInput value={cmyk.k} onChange={(v) => handleCmykChange('k', v)} label="K" max={100} />
          </div>
        )}

        {activeTab === 'hsl' && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
            <SmallInput value={hsl.h} onChange={(v) => handleHslChange('h', v)} label="H" max={360} />
            <SmallInput value={hsl.s} onChange={(v) => handleHslChange('s', v)} label="S" max={100} />
            <SmallInput value={hsl.l} onChange={(v) => handleHslChange('l', v)} label="L" max={100} />
          </div>
        )}
      </div>
    </div>
  );
}
