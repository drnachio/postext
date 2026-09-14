'use client';

import { useState, useEffect, useRef, useCallback, type RefObject } from 'react';
import { Popover, type PopoverCloseReason } from '../ui';

interface NumberPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean, reason: PopoverCloseReason, event: Event | undefined) => void;
  /** Row (or input) the slider is positioned against. */
  anchor: RefObject<Element | null>;
  popupRef: RefObject<HTMLDivElement | null>;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  label: string;
}

const POPOVER_WIDTH = 200;
const TYPE_COMMIT_DELAY_MS = 120;

/** Slider + numeric field that opens beside a number input. The body only
 *  mounts while open, so its local state starts fresh from `value`. */
export function NumberPopover({ open, onOpenChange, anchor, popupRef, value, onChange, min, max, step, label }: NumberPopoverProps) {
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      anchor={anchor}
      popupRef={popupRef}
      width={POPOVER_WIDTH}
      initialFocus={false}
      finalFocus={false}
      ariaLabel={label}
    >
      <SliderBody value={value} onChange={onChange} min={min} max={max} step={step} label={label} />
    </Popover>
  );
}

function SliderBody({ value, onChange, min, max, step, label }: Omit<NumberPopoverProps, 'open' | 'onOpenChange' | 'anchor' | 'popupRef'>) {
  // Single source of truth for what the popover displays. Committing to the
  // upstream `onChange` is deferred so slider drags and keystrokes don't
  // each trigger a full pipeline run.
  const [localValue, setLocalValue] = useState(value);
  const trackRef = useRef<HTMLDivElement>(null);
  const interactingRef = useRef(false);
  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestLocalRef = useRef(localValue);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  latestLocalRef.current = localValue;

  // Mirror external updates unless the user is mid-interaction.
  useEffect(() => {
    if (!interactingRef.current) setLocalValue(value);
  }, [value]);

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
    // Keep focus on the input that opened us (a blur would close the popover).
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
      // Commit once at the end of the gesture.
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

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--slate)' }}>{label}</span>
        <input
          type="number"
          value={localValue}
          onChange={(e) => handleTypedChange(Number(e.target.value))}
          onBlur={flushCommit}
          min={min}
          max={max}
          step={step}
          aria-label={label}
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

      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={localValue}
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
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${ratio * 100}%`, borderRadius: 7, backgroundColor: 'var(--gilt)', opacity: 0.4 }} />
        <div style={{ position: 'absolute', left: `${ratio * 100}%`, top: '50%', width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--gilt)', backgroundColor: 'var(--surface)', boxShadow: '0 0 2px rgba(0,0,0,0.4)', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 9, color: 'var(--slate)' }}>{min}</span>
        <span style={{ fontSize: 9, color: 'var(--slate)' }}>{max}</span>
      </div>
    </>
  );
}
