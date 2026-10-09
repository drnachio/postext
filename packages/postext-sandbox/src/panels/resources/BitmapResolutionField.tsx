'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  bitmapInfo,
  bitmapResolutionOf,
  effectiveBitmapResolution,
  isPlaceholderResolution,
  placedImageResolutions,
  resolvePageConfig,
  resolvePdfGenerationConfig,
  resolvePrintConfig,
  type BitmapInfo,
  type Resource,
} from 'postext';
import { useSandboxDispatch, useSandboxDocRef, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { NumberInput } from '../../controls';
import { Button } from '../../ui';
import { getBlob } from '../../storage/blobStore';
import { fill } from '../../print/fillTokens';

type Bitmap = NonNullable<Resource['bitmap']>;

const labelStyle = { color: 'var(--slate)', fontSize: 11, lineHeight: '14px' } as const;

/** The header of a stored bitmap: its real pixels and the resolution its
 *  file states. */
function useStoredBitmapInfo(fileId: string): BitmapInfo | undefined {
  const [info, setInfo] = useState<{ fileId: string; info: BitmapInfo | undefined }>();
  useEffect(() => {
    let live = true;
    getBlob(fileId).then(
      (record) => { if (live) setInfo({ fileId, info: record ? bitmapInfo(record.bytes) : undefined }); },
      () => undefined,
    );
    return () => { live = false; };
  }, [fileId]);
  return info?.fileId === fileId ? info.info : undefined;
}

interface BitmapResolutionFieldProps {
  bitmap: Bitmap;
  onChange: (bitmap: Bitmap) => void;
}

/** A bitmap's size in the Resources panel (#631): its pixels, the
 *  resolution its file states, its natural print size at the resolution it
 *  is laid out at, and the effective ppi where the current layout places
 *  it (the lowest of its placements), styled against the preflight
 *  thresholds; then the field that declares its own resolution. */
export function BitmapResolutionField({ bitmap, onChange }: BitmapResolutionFieldProps) {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const docRef = useSandboxDocRef();
  const docVersion = useSandboxSelector((s) => s.docVersion);
  const policyRaw = useSandboxSelector((s) => s.config.layout?.bitmapResolution);
  const pageRaw = useSandboxSelector((s) => s.config.page);
  const printRaw = useSandboxSelector((s) => s.config.print);
  const pdfGenRaw = useSandboxSelector((s) => s.config.pdfGeneration);
  const uiLocale = useSandboxSelector((s) => s.locale);
  const info = useStoredBitmapInfo(bitmap.fileId);

  const page = resolvePageConfig(pageRaw);
  const dpi = page.dpi;
  const policy = bitmapResolutionOf(policyRaw) ?? 'document';
  const preflight = resolvePrintConfig(printRaw).preflight;
  const pdfGen = resolvePdfGenerationConfig(pdfGenRaw);
  // The Checks panel lists the preflight for a book set up for print.
  const checked = resolvePrintConfig(printRaw).standard !== 'none'
    || (pdfGen.forceColorSpace && pdfGen.colorSpace === 'cmyk')
    || page.cutLines.enabled;

  const fileResolution = bitmap.fileResolution ?? info?.resolution?.x;
  const effective = effectiveBitmapResolution({ resolution: bitmap.resolution, fileResolution }, policy, dpi);
  const number = (v: number, digits: number) => new Intl.NumberFormat(uiLocale, { maximumFractionDigits: digits }).format(v);
  const mm = (pxCount: number) => number((pxCount / effective) * 25.4, 1);

  const realWidth = info?.width;
  const realHeight = info?.height;
  const placed = useMemo(() => {
    // Re-read whenever a layout lands.
    void docVersion;
    // (A host without a canvas, such as a test store, has no document.)
    const doc = docRef?.current;
    if (!doc) return [];
    const real = realWidth && realHeight ? { width: realWidth, height: realHeight } : undefined;
    return placedImageResolutions(doc, { imageSize: (id) => (id === bitmap.fileId ? real : undefined) })
      .filter((p) => p.fileId === bitmap.fileId);
  }, [docRef, docVersion, bitmap.fileId, realWidth, realHeight]);
  const lowest = placed.reduce<number | undefined>((min, p) => (min === undefined || p.ppi < min ? p.ppi : min), undefined);
  const level = lowest === undefined || !preflight.enabled ? 'ok'
    : lowest < preflight.criticalImageResolution - 0.5 ? 'critical'
      : lowest < preflight.minImageResolution - 0.5 ? 'warning' : 'ok';
  const levelColor = level === 'critical' ? 'var(--destructive)' : level === 'warning' ? 'var(--brand)' : undefined;

  const fileText = fileResolution === undefined
    ? labels.resourceBitmapFileResolutionNone
    : fill(isPlaceholderResolution(fileResolution) && bitmap.resolution === undefined ? labels.resourceBitmapFileResolutionPlaceholder : labels.resourceBitmapPpi, { ppi: number(fileResolution, 2) });
  const placedText = lowest === undefined
    ? labels.resourceBitmapNotPlaced
    : fill(placed.length > 1 ? labels.resourceBitmapPlacedLowest : labels.resourceBitmapPpi, { ppi: number(lowest, 0), count: placed.length });
  const mismatch = info && (Math.abs(info.width - bitmap.width) > 1 || Math.abs(info.height - bitmap.height) > 1);

  return (
    <div className="flex flex-col gap-1">
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5" style={labelStyle}>
        <dt>{labels.resourceBitmapPixels}</dt>
        <dd className="m-0" style={{ fontVariantNumeric: 'tabular-nums' }}>{`${bitmap.width} × ${bitmap.height} px · ${bitmap.format}`}</dd>
        <dt>{labels.resourceBitmapFileResolution}</dt>
        <dd className="m-0" style={{ fontVariantNumeric: 'tabular-nums' }}>{fileText}</dd>
        <dt>{labels.resourceBitmapNaturalSize}</dt>
        <dd className="m-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {fill(labels.resourceBitmapNaturalSizeValue, { width: mm(bitmap.width), height: mm(bitmap.height), ppi: number(effective, 2) })}
        </dd>
        <dt>{labels.resourceBitmapPlaced}</dt>
        <dd className="m-0 flex items-start gap-1" style={{ fontVariantNumeric: 'tabular-nums', ...(levelColor ? { color: levelColor } : {}) }}>
          {level !== 'ok' && <AlertTriangle size={12} aria-hidden="true" style={{ marginTop: 1, flexShrink: 0 }} />}
          <span>
            {placedText}
            {level !== 'ok' && (
              <> · {fill(level === 'critical' ? labels.resourceBitmapBelowCritical : labels.resourceBitmapBelowMinimum, {
                min: level === 'critical' ? preflight.criticalImageResolution : preflight.minImageResolution,
              })}</>
            )}
          </span>
        </dd>
      </dl>
      {mismatch && info && (
        <span className="flex items-start gap-1" style={{ ...labelStyle, color: 'var(--brand)' }}>
          <AlertTriangle size={12} aria-hidden="true" style={{ marginTop: 1, flexShrink: 0 }} />
          {fill(labels.preflightDeclaredPixelsMismatchDetail, { declared: `${bitmap.width}×${bitmap.height}`, actual: `${info.width}×${info.height}` })}
        </span>
      )}
      {level !== 'ok' && checked && (
        <div>
          <Button variant="outline" size="xs" onClick={() => dispatch({ type: 'SET_PANEL', payload: 'warnings' })}>
            {labels.resourceBitmapOpenChecks}
          </Button>
        </div>
      )}
      <NumberInput
        label={labels.resourceBitmapResolution}
        tooltip={labels.resourceBitmapResolutionTooltip}
        value={Math.round((bitmap.resolution ?? effective) * 100) / 100}
        onChange={(v) => onChange({ ...bitmap, resolution: Math.max(1, v) })}
        min={1}
        max={4800}
        step={1}
        suffix="ppi"
        isDefault={bitmap.resolution === undefined}
        onReset={() => {
          const next: Bitmap = { ...bitmap };
          delete next.resolution;
          onChange(next);
        }}
      />
      {fileResolution !== undefined && bitmap.resolution !== fileResolution && (
        <div>
          <Button
            variant="outline"
            size="xs"
            onClick={() => onChange({ ...bitmap, resolution: fileResolution, ...(bitmap.fileResolution === undefined ? { fileResolution } : {}) })}
          >
            {fill(labels.resourceBitmapResolutionFromFile, { ppi: number(fileResolution, 2) })}
          </Button>
        </div>
      )}
    </div>
  );
}
