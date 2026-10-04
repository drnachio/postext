'use client';

import { Pointer } from 'lucide-react';
import { IconButton } from './icon-button';
import { useLargeTargets } from './largeTargets';
import type { TooltipSide } from './tooltip';
import { useSandboxLabels } from '../context/SandboxContext';

/** The "Large buttons and fields" switch beside the theme and language
 *  controls: a pressed/unpressed icon button (aria-pressed). */
export function LargeTargetsToggle({ tooltipSide = 'inline-end' }: { tooltipSide?: TooltipSide }) {
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
