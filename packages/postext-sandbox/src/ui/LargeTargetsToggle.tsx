'use client';

import { Pointer } from 'lucide-react';
import { IconButton } from './icon-button';
import { useLargeTargets } from './largeTargets';
import { useSandboxLabels } from '../context/SandboxContext';

/** The "Large buttons and fields" switch beside the theme and language
 *  controls: a pressed/unpressed icon button (aria-pressed). */
export function LargeTargetsToggle({ tooltipSide = 'right' }: { tooltipSide?: 'right' | 'top' | 'bottom' | 'left' }) {
  const { large, setLarge } = useLargeTargets();
  const labels = useSandboxLabels();
  return (
    <IconButton
      label={labels.largeTargets}
      icon={<Pointer size={16} />}
      size={28}
      active={large}
      tooltipSide={tooltipSide}
      onClick={() => setLarge(!large)}
    />
  );
}
