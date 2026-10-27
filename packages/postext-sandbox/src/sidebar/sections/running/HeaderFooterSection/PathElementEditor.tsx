'use client';

/**
 * The editor of a shape (path) element of a design slot (#1063): a preset
 * (bar, ribbon, arrow, chevron, wave) or path data written by hand and
 * checked as it is typed, the space it is written in and how it fits the
 * box, its fill and outline, and its box and placement as a box element's.
 */

import { DEFAULT_MAIN_COLOR, type DesignPathElement, type Dimension, type ElementSize, type PageParity, type ResolvedDesignPathElement } from 'postext';
import { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { ColorPicker, DimensionInput, NumberInput, SelectInput, ToggleSwitch } from '../../../../controls/index.js';
import { FieldRow } from '../../../../controls/FieldRow.js';
import { useFieldIds } from '../../../../controls/fieldContext.js';
import { cn } from '../../../../ui/index.js';
import { PlacementFields, PagesSelect, type Sibling } from './PlacementFields.js';
import { SizeToFields, isSizeTo, type FrameTarget } from './sizeTo.js';
import type { SlotKind } from './placementAdapter.js';
import { CheckedTextField, DashField } from './shapeFields.js';
import { PATH_PRESETS, PATH_PRESET_NAMES, checkPathData, presetOf, type PathPreset } from './shapeEdits.js';

const DEFAULT_SIZE_DIM: Dimension = { value: 20, unit: 'pt' };
const DEFAULT_STROKE_WIDTH: Dimension = { value: 0.5, unit: 'pt' };
const STROKE_UNITS: Dimension['unit'][] = ['pt', 'mm', 'px'];

function sizeDim(size: ElementSize | undefined, fallback: Dimension): Dimension {
  if (size && typeof size === 'object' && 'value' in size) return size;
  return fallback;
}

interface Props {
  raw: DesignPathElement;
  resolved: ResolvedDesignPathElement;
  slotKind: SlotKind;
  siblings?: Sibling[];
  frames?: FrameTarget[];
  onChange: (next: DesignPathElement) => void;
}

export function PathElementEditor({ raw, resolved, slotKind, siblings = [], frames = [], onChange }: Props) {
  const labels = useSandboxLabels();
  const update = (partial: Partial<DesignPathElement>) => {
    const next = { ...raw, ...partial } as Record<string, unknown>;
    for (const [k, v] of Object.entries(partial)) if (v === undefined) delete next[k];
    onChange(next as unknown as DesignPathElement);
  };
  const presetName: Record<PathPreset, string> = {
    bar: labels.pathPresetBar,
    ribbon: labels.pathPresetRibbon,
    arrow: labels.pathPresetArrow,
    chevron: labels.pathPresetChevron,
    wave: labels.pathPresetWave,
  };
  const current = presetOf(raw.d ?? '', raw.viewBox);
  const viewBox = raw.viewBox ?? [1, 1];

  const widthSize = resolved.placement.size?.width;
  const heightSize = resolved.placement.size?.height;
  const widthTo = isSizeTo(widthSize) ? widthSize : undefined;
  const heightTo = isSizeTo(heightSize) ? heightSize : undefined;
  const width = sizeDim(widthSize, DEFAULT_SIZE_DIM);
  const height = sizeDim(heightSize, DEFAULT_SIZE_DIM);
  const updateSize = (next: { width?: ElementSize; height?: ElementSize }) =>
    update({ placement: { ...resolved.placement, size: { ...(resolved.placement.size ?? {}), ...next } } });

  return (
    <>
      <FieldRow stacked label={labels.pathPreset} tooltip={labels.pathPresetTooltip}>
        <PresetButtons
          label={labels.pathPreset}
          names={presetName}
          value={current}
          onPick={(p) => update({ d: PATH_PRESETS[p], viewBox: undefined })}
        />
      </FieldRow>
      <CheckedTextField
        label={labels.pathData}
        tooltip={labels.pathDataTooltip}
        value={raw.d ?? ''}
        monospace
        check={(text) => {
          const r = checkPathData(text);
          return r.ok ? null : labels.pathDataInvalid.replace('__at__', String(r.at));
        }}
        onCommit={(d) => update({ d })}
      />
      <NumberInput
        label={labels.pathViewBoxWidth}
        tooltip={labels.pathViewBoxTooltip}
        value={viewBox[0]}
        onChange={(v) => v > 0 && update({ viewBox: [v, viewBox[1]] })}
        min={0.001}
        max={100000}
        step={1}
        isDefault={raw.viewBox === undefined}
        onReset={() => update({ viewBox: undefined })}
      />
      <NumberInput
        label={labels.pathViewBoxHeight}
        value={viewBox[1]}
        onChange={(v) => v > 0 && update({ viewBox: [viewBox[0], v] })}
        min={0.001}
        max={100000}
        step={1}
        isDefault={raw.viewBox === undefined}
        onReset={() => update({ viewBox: undefined })}
      />
      <SelectInput
        variant="segmented"
        label={labels.pathAspect}
        tooltip={labels.pathAspectTooltip}
        value={raw.preserveAspectRatio ?? 'none'}
        options={[
          { value: 'none', label: labels.pathAspectNone },
          { value: 'meet', label: labels.pathAspectMeet },
        ]}
        onChange={(v) => update({ preserveAspectRatio: v === 'none' ? undefined : 'meet' })}
        isDefault={raw.preserveAspectRatio === undefined}
        onReset={() => update({ preserveAspectRatio: undefined })}
      />
      <ToggleSwitch
        label={labels.pathFill}
        tooltip={labels.pathFillTooltip}
        checked={raw.fill !== undefined}
        onChange={(on) => update({ fill: on ? (raw.fill ?? DEFAULT_MAIN_COLOR) : undefined })}
        isDefault={raw.fill === undefined}
        onReset={() => update({ fill: undefined })}
      />
      {raw.fill && (
        <ColorPicker label={labels.pathFillColor} value={raw.fill} onChange={(c) => update({ fill: c })} fieldId={`path-fill-${raw.id}`} />
      )}
      <ToggleSwitch
        label={labels.pathStroke}
        checked={raw.stroke !== undefined}
        onChange={(on) => update({ stroke: on ? (raw.stroke ?? DEFAULT_MAIN_COLOR) : undefined })}
        isDefault={raw.stroke === undefined}
        onReset={() => update({ stroke: undefined })}
      />
      {raw.stroke && (
        <>
          <ColorPicker label={labels.pathStrokeColor} value={raw.stroke} onChange={(c) => update({ stroke: c })} fieldId={`path-stroke-${raw.id}`} />
          <DimensionInput
            label={labels.pathStrokeWidth}
            value={raw.width ?? DEFAULT_STROKE_WIDTH}
            onChange={(d) => update({ width: d })}
            min={0}
            step={0.05}
            units={STROKE_UNITS}
            isDefault={raw.width === undefined}
            onReset={() => update({ width: undefined })}
          />
          <DashField label={labels.connectorDash} tooltip={labels.connectorDashTooltip} value={raw.dash} onChange={(dash) => update({ dash })} />
        </>
      )}
      {!widthTo && (
        <DimensionInput label={labels.headerFooterElementWidth} tooltip={labels.headerFooterElementWidthTooltip} value={width} onChange={(d) => updateSize({ width: d })} min={0} step={1} />
      )}
      <SizeToFields axis="width" value={widthTo} slotKind={slotKind} siblings={siblings} frames={frames} allowNone onChange={(to) => updateSize({ width: to ?? width })} />
      {!heightTo && <DimensionInput label={labels.height} value={height} onChange={(d) => updateSize({ height: d })} min={0} step={1} />}
      <SizeToFields axis="height" value={heightTo} slotKind={slotKind} siblings={siblings} frames={frames} allowNone onChange={(to) => updateSize({ height: to ?? height })} />
      <PlacementFields placement={resolved.placement} slotKind={slotKind} siblings={siblings} frames={frames} pin={raw.pin} onPinChange={(pin) => update({ pin })} onChange={(placement) => update({ placement })} />
      <SelectInput
        label={labels.headerFooterElementParity}
        value={raw.parity ?? 'all'}
        options={[
          { value: 'all', label: labels.headerFooterElementParityAll },
          { value: 'odd', label: labels.headerFooterElementParityOdd },
          { value: 'even', label: labels.headerFooterElementParityEven },
        ]}
        onChange={(v) => update({ parity: v === 'all' ? undefined : (v as PageParity) })}
        tooltip={labels.headerFooterElementParityTooltip}
        isDefault={raw.parity === undefined}
        onReset={() => update({ parity: undefined })}
      />
      <PagesSelect value={raw.pages} onChange={(pages) => update({ pages })} />
    </>
  );
}

/** The presets, each a button showing its shape and name (pressed: the
 *  path is that preset). */
function PresetButtons({ label, names, value, onPick }: { label: string; names: Record<PathPreset, string>; value: PathPreset | undefined; onPick: (p: PathPreset) => void }) {
  const ids = useFieldIds();
  return (
    <div id={ids?.controlId} role="group" aria-label={label} className="flex flex-wrap gap-1" data-path-presets="">
      {PATH_PRESET_NAMES.map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={value === p}
          onClick={() => onPick(p)}
          className={cn(
            'inline-flex min-h-7 cursor-pointer items-center gap-1 rounded border px-2 text-xs transition-colors pt-large:min-h-11',
            'focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
            value === p ? 'border-(--brand) bg-(--brand) text-(--background)' : 'border-(--rule) bg-transparent text-(--foreground) hover:bg-(--surface)',
          )}
        >
          <svg aria-hidden="true" width="18" height="10" viewBox="0 0 1 1" preserveAspectRatio="none" className="shrink-0">
            <path d={PATH_PRESETS[p]} fill="currentColor" />
          </svg>
          <span>{names[p]}</span>
        </button>
      ))}
    </div>
  );
}
