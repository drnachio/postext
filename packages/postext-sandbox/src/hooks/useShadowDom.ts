'use client';

import { useEffect, useRef } from 'react';

export function useShadowDom() {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);

  useEffect(() => {
    if (hostRef.current && !shadowRef.current) {
      shadowRef.current = hostRef.current.attachShadow({ mode: 'open' });
    }
  }, []);

  return { hostRef, shadowRef };
}
