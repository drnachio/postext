'use client';

import type { FocusEventHandler } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Rotate3d } from 'lucide-react';
import { useSandboxLabels } from '../context/SandboxContext';
import {
  PageNumberInput,
  PinToolbarButton,
  ToolbarButton,
  ToolbarSeparator,
  useToolbarRootProps,
} from './CanvasToolbar';

interface FolioToolbarProps {
  generating: boolean;
  pinned: boolean;
  hidden: boolean;
  pageCount: number;
  /** Book page number of the page the field shows (the right-hand page of
   *  the open spread), and the first / last ones it accepts. */
  pageNumber: number;
  firstPageNumber: number;
  lastPageNumber: number;
  canPrev: boolean;
  canNext: boolean;
  /** A right-bound book turns its leaves leftward: the left arrow goes on. */
  rightToLeft?: boolean;
  onRegenerate: () => void;
  /** Back to the view the settings give, after the reader orbited it. */
  onResetView: () => void;
  onTogglePin: () => void;
  onPrev: () => void;
  onNext: () => void;
  onJumpToPageNumber: (pageNumber: number) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: FocusEventHandler<HTMLDivElement>;
  onBlur?: FocusEventHandler<HTMLDivElement>;
}

/** The Folio tab's floating bar: the canvas's recalculate, pin and page
 *  field, with arrows that turn the book's spreads. */
export function FolioToolbar({
  generating,
  pinned,
  hidden,
  pageCount,
  pageNumber,
  firstPageNumber,
  lastPageNumber,
  canPrev,
  canNext,
  rightToLeft = false,
  onRegenerate,
  onResetView,
  onTogglePin,
  onPrev,
  onNext,
  onJumpToPageNumber,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}: FolioToolbarProps) {
  const labels = useSandboxLabels();
  const rootProps = useToolbarRootProps(hidden, true);
  const PrevIcon = rightToLeft ? ChevronRight : ChevronLeft;
  const NextIcon = rightToLeft ? ChevronLeft : ChevronRight;

  return (
    <div
      role="toolbar"
      aria-label={labels.folioToolbar}
      {...rootProps}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <ToolbarButton
        icon={<RefreshCw size={16} aria-hidden="true" />}
        label={labels.canvasRegenerate}
        onClick={onRegenerate}
        spinning={generating}
        accent={generating}
      />
      <ToolbarButton
        icon={<Rotate3d size={16} aria-hidden="true" />}
        label={labels.folioResetView}
        onClick={onResetView}
      />
      <ToolbarSeparator />
      <PinToolbarButton
        pinned={pinned}
        onToggle={onTogglePin}
        pinLabel={labels.toolbarPin}
        unpinLabel={labels.toolbarUnpin}
      />
      <ToolbarSeparator />
      <ToolbarButton
        icon={<PrevIcon size={16} aria-hidden="true" />}
        label={labels.folioPrev}
        onClick={onPrev}
        disabled={pageCount === 0 || !canPrev}
      />
      <PageNumberInput
        pageNumber={pageNumber}
        firstPageNumber={firstPageNumber}
        lastPageNumber={lastPageNumber}
        pageCount={pageCount}
        onJumpToPageNumber={onJumpToPageNumber}
        label={labels.pageNumberInput}
      />
      <ToolbarButton
        icon={<NextIcon size={16} aria-hidden="true" />}
        label={labels.folioNext}
        onClick={onNext}
        disabled={pageCount === 0 || !canNext}
      />
    </div>
  );
}
