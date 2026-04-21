'use client';

import { useMemo } from 'react';
import { AlertTriangle, Type, FileWarning, Heading, List, FileText, Sigma } from 'lucide-react';
import { useSandbox } from '../context/SandboxContext';
import { computeWarnings } from '../warnings/compute';
import type { Warning, WarningPayload } from '../warnings/types';
import type { SandboxLabels } from '../types';

function iconFor(kind: WarningPayload['kind']) {
  switch (kind) {
    case 'missingFont':
      return Type;
    case 'looseLine':
      return FileWarning;
    case 'headingHierarchy':
      return Heading;
    case 'consecutiveHeadings':
      return Heading;
    case 'listAfterHeading':
      return List;
    case 'invalidMath':
    case 'unclosedMath':
      return Sigma;
    default:
      return AlertTriangle;
  }
}

function titleFor(payload: WarningPayload, labels: SandboxLabels): string {
  switch (payload.kind) {
    case 'missingFont':
      return labels.warningsMissingFontTitle;
    case 'looseLine':
      return labels.warningsLooseLineTitle;
    case 'headingHierarchy':
      return labels.warningsHeadingHierarchyTitle;
    case 'consecutiveHeadings':
      return labels.warningsConsecutiveHeadingsTitle;
    case 'listAfterHeading':
      return labels.warningsListAfterHeadingTitle;
    case 'invalidMath':
      return labels.warningsInvalidMathTitle ?? 'Invalid LaTeX';
    case 'unclosedMath':
      return labels.warningsUnclosedMathTitle ?? 'Unclosed math delimiter';
  }
}

function detailFor(payload: WarningPayload, labels: SandboxLabels): string {
  switch (payload.kind) {
    case 'missingFont':
      return `"${payload.family}" — ${labels.warningsMissingFontDetail}`;
    case 'looseLine':
      return `${payload.ratio.toFixed(2)}× · ${labels.warningsThresholdLabel} ${payload.threshold.toFixed(2)}×`;
    case 'headingHierarchy':
      return `H${payload.from} → H${payload.to} · ${labels.warningsHeadingHierarchyDetail}`;
    case 'consecutiveHeadings':
      return labels.warningsConsecutiveHeadingsDetail;
    case 'listAfterHeading':
      return labels.warningsListAfterHeadingDetail;
    case 'invalidMath':
      return `${payload.tex.slice(0, 60)} — ${payload.message}`;
    case 'unclosedMath':
      return `${payload.delimiter}${payload.tex.slice(0, 40)}…`;
  }
}

function WarningItem({
  warning,
  labels,
  onClick,
}: {
  warning: Warning;
  labels: SandboxLabels;
  onClick: (w: Warning) => void;
}) {
  const Icon = iconFor(warning.payload.kind);
  const clickable = warning.sourceStart !== undefined;
  const title = titleFor(warning.payload, labels);
  const detail = detailFor(warning.payload, labels);
  const lineTag = warning.line !== undefined
    ? `${labels.warningsLineLabel} ${warning.line}`
    : null;

  return (
    <button
      type="button"
      onClick={clickable ? () => onClick(warning) : undefined}
      disabled={!clickable}
      className="flex w-full gap-3 border-b px-3 py-2 text-left transition-colors"
      style={{
        borderColor: 'var(--rule)',
        cursor: clickable ? 'pointer' : 'default',
        color: 'var(--foreground)',
      }}
      onMouseEnter={(e) => {
        if (clickable) e.currentTarget.style.backgroundColor = 'var(--surface)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <Icon size={16} aria-hidden="true" style={{ color: 'var(--gilt)', flexShrink: 0, marginTop: 2 }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>
            {title}
          </span>
          {lineTag && (
            <span
              className="text-[10px] font-medium"
              style={{
                color: 'var(--slate)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {lineTag}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs" style={{ color: 'var(--slate)', overflowWrap: 'anywhere' }}>
          {detail}
        </div>
      </div>
    </button>
  );
}

export function WarningsPanel() {
  const { state, dispatch, docRef } = useSandbox();
  const { markdown, config, labels, docVersion } = state;

  const warnings = useMemo(
    () => computeWarnings({ markdown, config, doc: docRef.current }),
    // docRef is a ref — rely on docVersion to re-compute when the doc changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markdown, config, docVersion],
  );

  const handleClick = (w: Warning) => {
    if (w.sourceStart === undefined) return;
    const anchor = w.sourceStart;
    const head = w.sourceEnd ?? w.sourceStart;
    dispatch({ type: 'SET_PANEL', payload: 'markdown' });
    dispatch({
      type: 'SET_PENDING_EDITOR_FOCUS',
      payload: { anchor, head, selectWord: false },
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex shrink-0 items-center justify-between border-b px-3 py-2"
        style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--background)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
          {labels.warnings}
        </h2>
        <span
          className="text-xs"
          style={{ color: 'var(--slate)', fontVariantNumeric: 'tabular-nums' }}
        >
          {warnings.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {warnings.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <FileText size={40} className="mb-3" style={{ color: 'var(--rule)' }} />
            <p className="text-xs" style={{ color: 'var(--slate)' }}>
              {labels.warningsEmpty}
            </p>
          </div>
        ) : (
          warnings.map((w) => (
            <WarningItem key={w.id} warning={w} labels={labels} onClick={handleClick} />
          ))
        )}
      </div>
    </div>
  );
}
