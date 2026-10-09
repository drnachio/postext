'use client';

import { memo, useRef, useState, type FocusEventHandler, type Ref } from 'react';
import { AArrowDown, AArrowUp, ArrowRight, ChevronLeft, ChevronRight, Download, ListTree, RefreshCw, TriangleAlert } from 'lucide-react';
import { useSandboxLabels } from '../context/SandboxContext';
import { useCompactLayout } from '../hooks/useCompactLayout';
import { useLargeTargets } from '../ui/largeTargets';
import { Popover } from '../ui';
import { formatBytes } from '../epub/viewer';
import type { SandboxLabels } from '../types';
import type { EpubNotice } from './EpubViewport';
import type { EpubReaderPosition } from './EpubReader';
import { PageNumberInput, PageTurnButtons, PinToolbarButton, ToolbarButton, ToolbarSeparator, useToolbarRootProps } from './CanvasToolbar';

const MIN_FONT_SCALE = 0.6;
const MAX_FONT_SCALE = 2.5;
const FONT_SCALE_STEP = 1.1;
const clampFontScale = (n: number): number => Math.max(MIN_FONT_SCALE, Math.min(MAX_FONT_SCALE, n));

interface EpubToolbarProps {
  generating: boolean;
  dirty: boolean;
  pinned: boolean;
  hidden: boolean;
  /** Size of the generated file, null while there is none. */
  fileSize: number | null;
  reflowable: boolean;
  position: EpubReaderPosition | null;
  fontScale: number;
  notices: readonly EpubNotice[];
  onRegenerate: () => void;
  onTogglePin: () => void;
  onDownload: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onGoToPosition: (position: number) => void;
  onGoTo: (href: string) => void;
  onFontScale: (scale: number) => void;
  /** The toolbar's root, measured by the tab where it docks on a phone. */
  rootRef?: Ref<HTMLDivElement>;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: FocusEventHandler<HTMLDivElement>;
  onBlur?: FocusEventHandler<HTMLDivElement>;
}

/** A warning as a sentence. */
export function noticeText(n: EpubNotice, labels: SandboxLabels): string {
  switch (n.kind) {
    case 'missingImage': return labels.epubWarningMissingImage.replace('__file__', n.fileId);
    case 'missingFont':
      return n.weight === undefined
        ? labels.epubWarningMissingFont.replace('__family__', n.family)
        : labels.epubWarningMissingFace.replace('__family__', n.family).replace('__face__', `${n.weight}${n.style === 'italic' ? ' italic' : ''}`);
    case 'fontWithheld': return labels.epubWarningFontWithheld.replace('__family__', n.family);
    case 'svgFontUnavailable':
      return labels.epubWarningSvgFontUnavailable.replace('__file__', n.fileId).replace('__family__', n.family);
    case 'svgFontsTooLarge':
      return labels.epubWarningSvgFontsTooLarge.replace('__file__', n.fileId).replace('__size__', String(Math.round(n.bytes / 1024)));
    case 'unsupported': return labels.epubWarningUnsupported.replace('__detail__', n.detail);
  }
}

export const EpubToolbar = memo(function EpubToolbar({
  generating,
  dirty,
  pinned,
  hidden,
  fileSize,
  reflowable,
  position,
  fontScale,
  notices,
  onRegenerate,
  onTogglePin,
  onDownload,
  onPrevious,
  onNext,
  onGoToPosition,
  onGoTo,
  onFontScale,
  rootRef,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}: EpubToolbarProps) {
  const labels = useSandboxLabels();
  const rootProps = useToolbarRootProps(hidden, true);
  const compact = useCompactLayout();
  const showDirtyArrow = dirty && !generating && !hidden && !compact;
  const rtl = position?.rightToLeft ?? false;
  const ready = fileSize !== null && !generating;
  const toc = position?.toc ?? [];
  return (
    <div
      ref={rootRef}
      role="toolbar"
      aria-label={labels.epubToolbar}
      {...rootProps}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {showDirtyArrow && (
        <span
          role="img"
          aria-label={labels.pdfDirty}
          title={labels.pdfDirty}
          // Beside the toolbar, pointing at it: mirrored with the toolbar
          // in a right-to-left interface (the bounce with it).
          className="rtl:-scale-x-100"
          style={{
            position: 'absolute',
            insetInlineEnd: 'calc(100% + 6px)',
            top: 6,
            color: 'var(--brand)',
            display: 'inline-flex',
            pointerEvents: 'none',
          }}
        >
          <span style={{ display: 'inline-flex', animation: 'postext-dirty-bounce 1s ease-in-out infinite' }}>
            <ArrowRight size={18} aria-hidden="true" />
          </span>
        </span>
      )}
      <ToolbarButton
        icon={<RefreshCw size={16} aria-hidden="true" />}
        label={labels.pdfRegenerate}
        onClick={onRegenerate}
        disabled={generating}
        spinning={generating}
        accent={generating}
      />
      <ToolbarSeparator />
      <PinToolbarButton pinned={pinned} onToggle={onTogglePin} pinLabel={labels.toolbarPin} unpinLabel={labels.toolbarUnpin} />
      <ToolbarSeparator />
      <ToolbarButton
        icon={<Download size={16} aria-hidden="true" />}
        label={fileSize !== null ? labels.epubDownloadSize.replace('__size__', formatBytes(fileSize)) : labels.epubDownload}
        onClick={onDownload}
        disabled={!ready}
      />
      {notices.length > 0 && !generating && <WarningsButton notices={notices} labels={labels} />}
      <ToolbarSeparator />
      <ContentsButton entries={toc} disabled={!ready || toc.length === 0} label={labels.epubContents} onGoTo={onGoTo} />
      {reflowable && (
        <>
          <ToolbarButton
            icon={<AArrowUp size={16} aria-hidden="true" />}
            label={labels.fontScaleUp}
            onClick={() => onFontScale(clampFontScale(fontScale * FONT_SCALE_STEP))}
            disabled={!ready || fontScale >= MAX_FONT_SCALE - 1e-6}
          />
          <ToolbarButton
            icon={<AArrowDown size={16} aria-hidden="true" />}
            label={labels.fontScaleDown}
            onClick={() => onFontScale(clampFontScale(fontScale / FONT_SCALE_STEP))}
            disabled={!ready || fontScale <= MIN_FONT_SCALE + 1e-6}
          />
        </>
      )}
      <ToolbarSeparator />
      <PageTurnButtons>
      <ToolbarButton
        icon={<ChevronLeft size={16} aria-hidden="true" />}
        label={rtl ? labels.nextPage : labels.previousPage}
        onClick={rtl ? onNext : onPrevious}
        disabled={!ready || !(rtl ? position?.canNext : position?.canPrevious)}
      />
      {!reflowable && position && (
        <PageNumberInput
          pageNumber={position.position}
          firstPageNumber={1}
          lastPageNumber={position.count}
          pageCount={ready ? position.count : 0}
          onJumpToPageNumber={onGoToPosition}
          label={labels.pageNumberInput}
        />
      )}
      <ToolbarButton
        icon={<ChevronRight size={16} aria-hidden="true" />}
        label={rtl ? labels.previousPage : labels.nextPage}
        onClick={rtl ? onPrevious : onNext}
        disabled={!ready || !(rtl ? position?.canPrevious : position?.canNext)}
      />
      </PageTurnButtons>
    </div>
  );
});

/** The table of contents of the file, as a jump list. */
function ContentsButton({ entries, disabled, label, onGoTo }: { entries: EpubReaderPosition['toc']; disabled: boolean; label: string; onGoTo: (href: string) => void }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const compact = useCompactLayout();
  const { large } = useLargeTargets();
  return (
    <>
      <span ref={anchorRef} className="inline-flex shrink-0">
        <ToolbarButton icon={<ListTree size={16} aria-hidden="true" />} label={label} onClick={() => setOpen((o) => !o)} active={open} disabled={disabled} />
      </span>
      <Popover open={open && !disabled} onOpenChange={setOpen} anchor={anchorRef} side={compact ? 'top' : 'inline-start'} align={compact ? 'center' : 'start'} width={320} ariaLabel={label} style={{ padding: 4 }}>
        <nav aria-label={label}>
          <ul className="m-0 list-none p-0">
            {entries.map((entry, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onGoTo(entry.href);
                  }}
                  dir="auto"
                  className="w-full cursor-pointer rounded-md text-start text-xs focus-visible:outline-2 focus-visible:-outline-offset-2 hover:bg-(--surface)"
                  style={{
                    minHeight: large ? 44 : 28,
                    paddingBlock: 4,
                    paddingInlineEnd: 8,
                    paddingInlineStart: 8 + entry.depth * 14,
                    color: entry.depth === 0 ? 'var(--foreground)' : 'var(--slate)',
                    fontWeight: entry.depth === 0 ? 600 : 400,
                    outlineColor: 'var(--brand)',
                  }}
                >
                  {entry.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </Popover>
    </>
  );
}

/** The warnings of the last generation, behind a button that counts them. */
function WarningsButton({ notices, labels }: { notices: readonly EpubNotice[]; labels: SandboxLabels }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const compact = useCompactLayout();
  const title = labels.epubWarnings.replace('__count__', String(notices.length));
  return (
    <>
      <span ref={anchorRef} className="inline-flex shrink-0">
        <ToolbarButton icon={<TriangleAlert size={16} aria-hidden="true" />} label={title} onClick={() => setOpen((o) => !o)} active={open} accent />
      </span>
      <Popover open={open} onOpenChange={setOpen} anchor={anchorRef} side={compact ? 'top' : 'inline-start'} align={compact ? 'center' : 'start'} width={340} ariaLabel={title}>
        <p className="mb-2 text-xs font-semibold" style={{ color: 'var(--foreground)' }}>{title}</p>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {notices.map((n, i) => (
            <li key={i} className="text-xs" style={{ color: 'var(--slate)' }}>{noticeText(n, labels)}</li>
          ))}
        </ul>
      </Popover>
    </>
  );
}
