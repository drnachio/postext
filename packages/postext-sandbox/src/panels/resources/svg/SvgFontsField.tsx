'use client';

import { useEffect, useState } from 'react';
import type { Resource } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { ToggleSwitch } from '../../../controls/index.js';
import { FieldRow } from '../../../controls/FieldRow.js';
import { svgWithInlineFonts } from '../resourceEdits.js';
import { readSvgFaces, type FaceRow } from './svgFaces.js';

// The fonts of an SVG resource (#630): the families its text names, whether
// each is embedded when the picture is shown or exported, and the
// resource's opt-out (`svg.inlineFonts: false`).

/** The faces of the SVG stored as `fileId` (see `readSvgFaces`). Null
 *  while loading. */
function useSvgFaces(fileId: string, inline: boolean): FaceRow[] | null {
  const [rows, setRows] = useState<FaceRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setRows(null);
    readSvgFaces(fileId, inline).then(
      (next) => {
        if (!cancelled) setRows(next);
      },
      () => {
        if (!cancelled) setRows([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fileId, inline]);
  return rows;
}

interface SvgFontsFieldProps {
  resource: Resource;
  onChange: (svg: NonNullable<Resource['svg']>) => void;
}

export function SvgFontsField({ resource, onChange }: SvgFontsFieldProps) {
  const labels = useSandboxLabels();
  const documentInlines = useSandboxSelector((s) => s.config.diagramStyle?.inlineFonts !== false);
  const svg = resource.svg!;
  const own = svg.inlineFonts !== false;
  const rows = useSvgFaces(svg.fileId, documentInlines && own);

  const statusText = (row: FaceRow): string => {
    switch (row.status) {
      case 'inlined': return labels.resourceSvgFontInlined.replace('__size__', String(Math.max(1, Math.round((row.bytes ?? 0) / 1024))));
      case 'declared': return labels.resourceSvgFontDeclared;
      case 'unavailable': return labels.resourceSvgFontUnavailable;
      case 'withheld': return labels.resourceSvgFontWithheld;
      case 'tooLarge': return labels.resourceSvgFontTooLarge;
      case 'kept': return labels.resourceSvgFontKept;
    }
  };

  return (
    <FieldRow stacked label={labels.resourceSvgFontsLabel} hint={labels.resourceSvgFontsHint} className="mb-0">
      <div className="flex flex-col gap-1.5">
        {documentInlines && (
          <ToggleSwitch
            label={labels.resourceSvgInlineFonts}
            tooltip={labels.resourceSvgInlineFontsTooltip}
            checked={own}
            onChange={(v) => onChange(svgWithInlineFonts(svg, v))}
            isDefault={svg.inlineFonts === undefined}
            onReset={() => onChange(svgWithInlineFonts(svg, true))}
          />
        )}
        {rows === null ? (
          <p className="text-xs" style={{ color: 'var(--slate)' }}>{labels.resourceSvgFontsLoading}</p>
        ) : rows.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--slate)' }}>{labels.resourceSvgFontsNone}</p>
        ) : (
          <ul className="flex flex-col gap-0.5 text-xs" aria-label={labels.resourceSvgFontsLabel}>
            {rows.map((row) => (
              <li key={row.face} className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span dir="auto" style={{ color: 'var(--foreground)' }}>{row.face}</span>
                <span
                  style={row.status === 'unavailable' || row.status === 'tooLarge'
                    ? { color: 'var(--foreground)', fontWeight: 600 }
                    : { color: 'var(--slate)' }}
                >
                  {statusText(row)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FieldRow>
  );
}
