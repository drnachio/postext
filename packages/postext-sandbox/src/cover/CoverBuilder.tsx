'use client';

// Lays out the cover the panel has chosen and publishes it: mounted once,
// with the Cover panel, so the panel, its stage and the tools share one
// build.

import { useEffect } from 'react';
import { publishCoverState, useCoverChoice } from './coverStore.js';
import { useCover } from './useCover.js';

export function CoverBuilder() {
  const choice = useCoverChoice();
  const state = useCover(choice.version, choice.sheet);
  useEffect(() => { publishCoverState(state); }, [state]);
  return null;
}
