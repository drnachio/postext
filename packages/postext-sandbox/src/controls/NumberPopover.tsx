'use client';

import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';

interface NumberPopoverProps {
  value: number;
  onChange: (value: number) => void;
  anchorRect: DOMRect;
  onClose: () => void;
  min: number;
  max: number;
  step: number;
  label: string;
}

const POPOVER_WIDTH = 200;
const POPOVER_GAP = 6;
const TYPE_COMMIT_DELAY_MS = 120;

export const NumberPopover = forwardRef<HTMLDivElement, NumberPopoverProps>(function NumberPopover({ value, onChange, anchorRect, onClose, min, max, step, label }, ref) {
  // Single source of truth for what the popover displays. Committing to the
  // upstream `onChange` is deferred so slider drags and keystrokes don't
  // each trigger a full pipeline run (T1-a in the perf plan).
  const [localValue, setLocalValue] = useState(value);
  const popoverRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const interactingRef = useRef(false);
  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestLocalRef = useRef(localValue);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  latestLocalRef.current = localValue;

  useImperativeHandle(ref, () => popoverRef.current!, []);

  // Mirror external updates unless the user is mid-interaction.
  useEffect(() => {
    if (!interactingRef.current) setLocalValue(value);
  }, [value]);

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

  const clampAndSnap = useCallback((raw: number) => {
    const clamped = Math.min(max, Math.max(min, raw));
    const snapped = Math.round(clamped / step) * step;
    const decimals = step < 1 ? String(step).split('.')[1]?.length ?? 0 : 0;
    return Number(snapped.toFixed(decimals));
  }, [min, max, step]);

  const flushCommit = useCallback(() => {
    if (typeTimerRef.current) {
      clearTimeout(typeTimerRef.current);
      typeTimerRef.current = null;
    }
    if (interactingRef.current) {
      interactingRef.current = false;
      onChangeRef.current(latestLocalRef.current);
    }
  }, []);

  const updateFromPointer = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const raw = min + ratio * (max - min);
    setLocalValue(clampAndSnap(raw));
  }, [min, max, clampAndSnap]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    interactingRef.current = true;
    if (typeTimerRef.current) {
      clearTimeout(typeTimerRef.current);
      typeTimerRef.current = null;
    }
    updateFromPointer(e.clientX);

    const onMove = (ev: PointerEvent) => updateFromPointer(ev.clientX);
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      // Commit once at the end of the gesture — single pipeline run instead
      // of ~60/s during the drag.
      interactingRef.current = false;
      onChangeRef.current(latestLocalRef.current);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [updateFromPointer]);

  const handleTypedChange = useCallback((raw: number) => {
    const v = clampAndSnap(raw);
    interactingRef.current = true;
    setLocalValue(v);
    if (typeTimerRef.current) clearTimeout(typeTimerRef.current);
    typeTimerRef.current = setTimeout(() => {
      typeTimerRef.current = null;
      interactingRef.current = false;
      onChangeRef.current(latestLocalRef.current);
    }, TYPE_COMMIT_DELAY_MS);
  }, [clampAndSnap]);

  const ratio = Math.min(1, Math.max(0, (localValue - min) / (max - min)));

  // Position — flip above anchor if not enough space below
  const estimatedHeight = 60;
  const fitsBelow = anchorRect.bottom + POPOVER_GAP + estimatedHeight < window.innerHeight;
  const top = fitsBelow
    ? anchorRect.bottom + POPOVER_GAP
    : anchorRect.top - POPOVER_GAP - estimatedHeight;
  const left = Math.max(8, anchorRect.right - POPOVER_WIDTH);

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={`${label} slider`}
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
      {/* Value display */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 10, color: 'var(--slate)' }}>{label}</span>
        <input
          type="number"
          value={localValue}
          onChange={(e) => handleTypedChange(Number(e.target.value))}
          onBlur={flushCommit}
          min={min}
          max={max}
          step={step}
          style={{
            width: 60,
            padding: '2px 4px',
            fontSize: 11,
            fontFamily: 'monospace',
            textAlign: 'right',
            borderRadius: 3,
            border: '1px solid var(--rule)',
            backgroundColor: 'var(--background)',
            color: 'var(--foreground)',
            outline: 'none',
          }}
        />
      </div>

      {/* Slider track */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        style={{
          position: 'relative',
          width: '100%',
          height: 14,
          borderRadius: 7,
          backgroundColor: 'var(--background)',
          border: '1px solid var(--rule)',
          cursor: 'pointer',
          touchAction: 'none',
        }}
      >
        {/* Filled track */}
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${ratio * 100}%`,
          borderRadius: 7,
          backgroundColor: 'var(--gilt)',
          opacity: 0.4,
        }} />
        {/* Thumb */}
        <div style={{
          position: 'absolute',
          left: `${ratio * 100}%`,
          top: '50%',
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: '2px solid var(--gilt)',
          backgroundColor: 'var(--surface)',
          boxShadow: '0 0 2px rgba(0,0,0,0.4)',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Range labels */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 4,
      }}>
        <span style={{ fontSize: 9, color: 'var(--slate)' }}>{min}</span>
        <span style={{ fontSize: 9, color: 'var(--slate)' }}>{max}</span>
      </div>
    </div>
  );
});
