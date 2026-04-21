'use client';

import type { RGB, HSL, CMYK, ColorMode } from '../color-utils';
import { SmallInput } from './SmallInput';

interface Props {
  activeTab: ColorMode;
  hexText: string;
  setHexText: (v: string) => void;
  handleHexSubmit: () => void;
  rgb: RGB;
  hsl: HSL;
  cmyk: CMYK;
  handleRgbChange: (channel: keyof RGB, v: number) => void;
  handleHslChange: (channel: keyof HSL, v: number) => void;
  handleCmykChange: (channel: keyof CMYK, v: number) => void;
}

export function TabInputs({
  activeTab,
  hexText,
  setHexText,
  handleHexSubmit,
  rgb,
  hsl,
  cmyk,
  handleRgbChange,
  handleHslChange,
  handleCmykChange,
}: Props) {
  return (
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
  );
}
