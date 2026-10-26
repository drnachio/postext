'use client';

import { contourRowsOf, DEFAULT_CONTOUR_THRESHOLD, type Dimension, type Resource, type ResourceContour } from 'postext';
import { useSandboxLabels } from '../../../context/SandboxContext.js';
import { DimensionInput, NumberInput, ToggleSwitch } from '../../../controls/index.js';

const hintStyle = { color: 'var(--slate)', fontSize: 11, lineHeight: '14px' } as const;

interface ContourFieldsProps {
  resource: Resource;
  /** The contour as edited (`undefined` drops it). */
  onChange: (contour: ResourceContour | undefined) => void;
  /** The wrap gap the margin falls back to. */
  defaultMargin: Dimension;
}

/** `contour` with `key` set, or dropped when `value` is undefined; an
 *  empty contour stays (`{}`: trace the alpha channel at the defaults). */
function contourWith<K extends keyof ResourceContour>(contour: ResourceContour | undefined, key: K, value: ResourceContour[K] | undefined): ResourceContour {
  const next: ResourceContour = { ...(contour ?? {}) };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

/**
 * The contour a picture's text wrap runs round (#883): for a bitmap, the
 * alpha channel switch and its threshold; the margin kept round the shape.
 * The trace itself is made from the stored file (`useContourTraces`). A
 * polygon (`contour.points`) is edited in the configuration for now; a
 * picture with no known shape says so.
 */
export function ContourFields({ resource, onChange, defaultMargin }: ContourFieldsProps) {
  const labels = useSandboxLabels();
  const contour = resource.contour;
  const bitmap = resource.kind === 'bitmap';
  const alpha = bitmap && contour?.alpha !== false;
  const threshold = contour?.threshold ?? DEFAULT_CONTOUR_THRESHOLD;
  const hasPolygon = (contour?.points?.length ?? 0) >= 3;
  // A bitmap's trace arrives a moment after it is asked for; a JPEG, an
  // SVG with no polygon and a bitmap with the alpha channel off have none.
  const jpeg = bitmap && /^jpe?g$/i.test(resource.bitmap?.format ?? '');
  const noShape = !hasPolygon && (!bitmap || !alpha || jpeg) && !contourRowsOf(resource);
  const set = <K extends keyof ResourceContour>(key: K, value: ResourceContour[K] | undefined) => onChange(contourWith(contour, key, value));
  return (
    <>
      {bitmap && !hasPolygon && (
        <ToggleSwitch
          label={labels.resourceContourAlpha}
          tooltip={labels.resourceContourAlphaTooltip}
          checked={alpha}
          onChange={(v) => set('alpha', v ? undefined : false)}
          isDefault={contour?.alpha === undefined}
          onReset={() => set('alpha', undefined)}
        />
      )}
      {alpha && !hasPolygon && (
        <NumberInput
          label={labels.resourceContourThreshold}
          tooltip={labels.resourceContourThresholdTooltip}
          value={Math.round(threshold * 100)}
          onChange={(v) => set('threshold', Math.min(100, Math.max(1, v)) / 100)}
          min={1}
          max={100}
          step={5}
          suffix="%"
          isDefault={contour?.threshold === undefined}
          onReset={() => set('threshold', undefined)}
        />
      )}
      <DimensionInput
        label={labels.resourceContourMargin}
        tooltip={labels.resourceContourMarginTooltip}
        value={contour?.margin ?? defaultMargin}
        onChange={(v) => set('margin', v)}
        units={['pt', 'mm', 'em']}
        isDefault={contour?.margin === undefined}
        onReset={() => set('margin', undefined)}
      />
      {noShape && <p className="m-0" style={hintStyle}>{labels.resourceContourNoShape}</p>}
    </>
  );
}
