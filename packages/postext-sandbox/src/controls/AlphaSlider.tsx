'use client';

import { useRef, useCallback } from 'react';
import { clamp } from './color-utils';

interface AlphaSliderProps {
  alpha: number; // 0–100
  color: string; // 6-digit hex for the gradient
  onChange: (alpha: number) => void;
}

const CHECKER = `repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%) 0 0 / 8px 8px`;

export function AlphaSlider({ alpha, color, onChange }: AlphaSliderProps) {
  const barRef = useRef<HTMLDivElement>(null);

  const updateFromPointer = useCallback((e: PointerEvent | React.PointerEvent) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    onChange(Math.round(x * 100));
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
        background: CHECKER,
        cursor: 'pointer',
        marginTop: 8,
        touchAction: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Color gradient overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 7,
        background: `linear-gradient(to right, transparent, ${color})`,
      }} />
      {/* Thumb */}
      <div style={{
        position: 'absolute',
        left: `${alpha}%`,
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
