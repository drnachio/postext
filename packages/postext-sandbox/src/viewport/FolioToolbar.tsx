'use client';

import type { FocusEventHandler } from 'react';
import { ChevronLeft, ChevronRight, Hand, Orbit, RefreshCw, Rotate3d, Save, TextCursor } from 'lucide-react';
import type { FolioInteraction } from 'postext-folio';
import { useSandboxLabels } from '../context/SandboxContext';
import {
  PageNumberInput,
  PinToolbarButton,
  ToolbarButton,
  ToolbarSeparator,
  useToolbarRootProps,
  PageTurnButtons,
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
  /** What the left button does on the book. */
  interaction: FolioInteraction;
  onSetInteraction: (mode: FolioInteraction) => void;
  onRegenerate: () => void;
  /** Back to the view the settings give, after the reader orbited it. */
  onResetView: () => void;
  /** Stores the view as it is seen now as the book's (`folio.tilt` and
   *  `folio.yaw`): Reset view comes back to it. */
  onSaveView: () => void;
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
  interaction,
  onSetInteraction,
  onRegenerate,
  onResetView,
  onSaveView,
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
      <ToolbarButton
        icon={<Save size={16} aria-hidden="true" />}
        label={labels.folioSaveView}
        onClick={onSaveView}
      />
      <ToolbarSeparator />
      <div role="group" aria-label={labels.folioModes} className="contents">
        <ToolbarButton
          icon={<Hand size={16} aria-hidden="true" />}
          label={labels.folioModeHand}
          onClick={() => onSetInteraction('hand')}
          active={interaction === 'hand'}
        />
        <ToolbarButton
          icon={<Orbit size={16} aria-hidden="true" />}
          label={labels.folioModeOrbit}
          onClick={() => onSetInteraction('orbit')}
          active={interaction === 'orbit'}
        />
        <ToolbarButton
          icon={<TextCursor size={16} aria-hidden="true" />}
          label={labels.folioModeSelect}
          onClick={() => onSetInteraction('select')}
          active={interaction === 'select'}
        />
      </div>
      <ToolbarSeparator />
      <PinToolbarButton
        pinned={pinned}
        onToggle={onTogglePin}
        pinLabel={labels.toolbarPin}
        unpinLabel={labels.toolbarUnpin}
      />
      <ToolbarSeparator />
      <PageTurnButtons>
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
      </PageTurnButtons>
    </div>
  );
}
