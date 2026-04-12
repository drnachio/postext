'use client';

import { useRef, useCallback } from 'react';
import { clamp } from './color-utils';

interface SaturationValueAreaProps {
  hue: number;
  saturation: number;
  value: number;
  onChange: (s: number, v: number) => void;
}

export function SaturationValueArea({ hue, saturation, value, onChange }: SaturationValueAreaProps) {
  const areaRef = useRef<HTMLDivElement>(null);

  const updateFromPointer = useCallback((e: PointerEvent | React.PointerEvent) => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    onChange(Math.round(x * 100), Math.round((1 - y) * 100));
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
      ref={areaRef}
      onPointerDown={handlePointerDown}
      style={{
        position: 'relative',
        width: '100%',
        height: 140,
        borderRadius: 4,
        cursor: 'crosshair',
        touchAction: 'none',
        overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: `hsl(${hue}, 100%, 50%)`,
      }} />
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(to right, #fff, transparent)',
      }} />
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(to bottom, transparent, #000)',
      }} />
      <div style={{
        position: 'absolute',
        left: `${saturation}%`,
        top: `${100 - value}%`,
        width: 12,
        height: 12,
        borderRadius: '50%',
        border: '2px solid white',
        boxShadow: '0 0 2px rgba(0,0,0,0.6)',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }} />
    </div>
  );
}
