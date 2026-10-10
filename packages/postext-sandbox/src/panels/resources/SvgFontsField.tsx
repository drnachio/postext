'use client';

import { useEffect, useState } from 'react';
import { inlineSvgFontsDetailed, svgFontRequests, type Resource, type SvgFontFaceReport } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { ToggleSwitch } from '../../controls';
import { FieldRow } from '../../controls/FieldRow';
import { sandboxSvgFontProvider } from '../../controls/svgFontProvider';
import { getBlob } from '../../storage/blobStore';

// The fonts of an SVG resource (#630): the families its text names, whether
// each is embedded when the picture is shown or exported, and the
// resource's opt-out (`svg.inlineFonts: false`).

/** One face as listed: its name and what became of it. */
interface FaceRow {
  face: string;
  status: SvgFontFaceReport['status'] | 'kept';
  bytes?: number;
}

function faceName(f: { family: string; weight: number; style: string }): string {
  return `${f.family} ${f.weight}${f.style === 'italic' ? ' italic' : ''}`;
}

/** The faces of the SVG stored as `fileId`: inlined through the Sandbox's
 *  provider when `inline`, else only named. Null while loading. */
function useSvgFaces(fileId: string, inline: boolean): FaceRow[] | null {
  const [rows, setRows] = useState<FaceRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setRows(null);
    void (async () => {
      const rec = await getBlob(fileId).catch(() => null);
      if (!rec || rec.contentType !== 'image/svg+xml') {
        if (!cancelled) setRows([]);
        return;
      }
      const text = new TextDecoder().decode(rec.bytes);
      let next: FaceRow[];
      if (inline) {
        const result = await inlineSvgFontsDetailed(text, sandboxSvgFontProvider());
        next = result.faces.map((f) => ({ face: faceName(f), status: f.status, ...(f.bytes !== undefined ? { bytes: f.bytes } : {}) }));
      } else {
        next = svgFontRequests(text).map((r) => ({ face: faceName({ family: r.families[0]!, weight: r.weight, style: r.style }), status: 'kept' as const }));
      }
      if (!cancelled) setRows(next);
    })().catch(() => {
      if (!cancelled) setRows([]);
    });
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
            onChange={(v) => {
              const next = { ...svg };
              if (v) delete next.inlineFonts;
              else next.inlineFonts = false;
              onChange(next);
            }}
            isDefault={svg.inlineFonts === undefined}
            onReset={() => {
              const next = { ...svg };
              delete next.inlineFonts;
              onChange(next);
            }}
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
