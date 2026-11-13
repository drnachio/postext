'use client';

import { useMemo } from 'react';
import { Scissors, Sparkles } from 'lucide-react';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import type { SandboxLabels } from '../../types/labels.js';
import { usesSpecialInks } from '../../print/usedInkFinishes.js';
import { ToolbarButton, ToolbarSeparator } from './CanvasToolbar.js';
import { nextFinishesView, useDieLines, useFinishesView, type FinishesView } from './specialInksView.js';

export function finishesViewLabel(view: FinishesView, labels: SandboxLabels): string {
  const mode = view === 'map' ? labels.canvasFinishesMap : view === 'sheen' ? labels.canvasFinishesSheen : labels.canvasFinishesFlat;
  return labels.canvasFinishes.replace('__mode__', mode);
}

/** The Canvas toolbar's die lines switch and finishes view (#1570), shown
 *  for a book with die-cuts or special inks. */
export function SpecialInksButtons() {
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const [dieLines, setDieLines] = useDieLines();
  const [finishes, setFinishes] = useFinishesView();
  const hasDieCuts = config.dieCuts !== undefined;
  const hasInks = useMemo(() => usesSpecialInks(config), [config]);
  if (!hasDieCuts && !hasInks) return null;
  return (
    <>
      {hasDieCuts && (
        <ToolbarButton icon={<Scissors size={16} aria-hidden="true" />} label={labels.canvasDieLines} onClick={() => setDieLines(!dieLines)} active={dieLines} />
      )}
      {hasInks && (
        <ToolbarButton icon={<Sparkles size={16} aria-hidden="true" />} label={finishesViewLabel(finishes, labels)}
          onClick={() => setFinishes(nextFinishesView(finishes))} active={finishes !== 'flat'} />
      )}
      <ToolbarSeparator />
    </>
  );
}
