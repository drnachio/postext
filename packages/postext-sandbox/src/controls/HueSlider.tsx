'use client';

import { useRef, useCallback } from 'react';
import { clamp } from './color-utils';

interface HueSliderProps {
  hue: number;
  onChange: (hue: number) => void;
}

export function HueSlider({ hue, onChange }: HueSliderProps) {
  const barRef = useRef<HTMLDivElement>(null);

  const updateFromPointer = useCallback((e: PointerEvent | React.PointerEvent) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    onChange(Math.round(x * 360));
  }, [onChange]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromPointer(e);

    const onMove = (ev: PointerEvent) => updateFromPointer(ev);
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [updateFromPointer]);

  return (
    <div
      ref={barRef}
      onPointerDown={handlePointerDown}
      style={{
        position: 'relative',
        width: '100%',
        height: 14,
        borderRadius: 7,
        background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
        cursor: 'pointer',
        marginTop: 8,
        touchAction: 'none',
      }}
    >
      <div style={{
        position: 'absolute',
        left: `${(hue / 360) * 100}%`,
        top: '50%',
        width: 14,
        height: 14,
        borderRadius: '50%',
        border: '2px solid white',
        boxShadow: '0 0 2px rgba(0,0,0,0.6)',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }} />
    </div>
  );
}
