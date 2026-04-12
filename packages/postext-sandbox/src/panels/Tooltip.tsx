'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';

interface TooltipProps {
  content: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactNode;
}

export function Tooltip({ content, side = 'right', children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, arrowTop: 0, arrowLeft: 0, arrowRotation: '' });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(true), 400);
  };

  const hide = () => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  useEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return;

    const trigger = triggerRef.current.getBoundingClientRect();
    const tooltip = tooltipRef.current.getBoundingClientRect();
    const gap = 10;

    let top = 0;
    let left = 0;
    let arrowTop = 0;
    let arrowLeft = 0;
    let arrowRotation = '';

    switch (side) {
      case 'right':
        top = trigger.top + trigger.height / 2 - tooltip.height / 2;
        left = trigger.right + gap;
        arrowTop = tooltip.height / 2;
        arrowLeft = 0;
        arrowRotation = 'translate(-50%, -50%) rotate(-45deg)';
        break;
      case 'left':
        top = trigger.top + trigger.height / 2 - tooltip.height / 2;
        left = trigger.left - tooltip.width - gap;
        arrowTop = tooltip.height / 2;
        arrowLeft = tooltip.width;
        arrowRotation = 'translate(-50%, -50%) rotate(135deg)';
        break;
      case 'top':
        top = trigger.top - tooltip.height - gap;
        left = trigger.left + trigger.width / 2 - tooltip.width / 2;
        arrowTop = tooltip.height;
        arrowLeft = tooltip.width / 2;
        arrowRotation = 'translate(-50%, -50%) rotate(-135deg)';
        break;
      case 'bottom':
        top = trigger.bottom + gap;
        left = trigger.left + trigger.width / 2 - tooltip.width / 2;
        arrowTop = 0;
        arrowLeft = tooltip.width / 2;
        arrowRotation = 'translate(-50%, -50%) rotate(45deg)';
        break;
    }

    setPosition({ top, left, arrowTop, arrowLeft, arrowRotation });
  }, [visible, side]);

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="contents"
      >
        {children}
      </div>
      {visible && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className="pointer-events-none fixed z-50 max-w-52 rounded-md px-2.5 py-1.5"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            backgroundColor: 'var(--surface)',
            color: 'var(--foreground)',
            border: '1px solid color-mix(in srgb, var(--gilt) 50%, transparent)',
            fontSize: 12,
            lineHeight: '16px',
          }}
        >
          {/* Arrow */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: `${position.arrowTop}px`,
              left: `${position.arrowLeft}px`,
              width: 10,
              height: 10,
              backgroundColor: 'var(--surface)',
              border: '1px solid color-mix(in srgb, var(--gilt) 50%, transparent)',
              borderRight: 'none',
              borderBottom: 'none',
              transform: position.arrowRotation,
            }}
          />
          {content}
        </div>
      )}
    </>
  );
}
