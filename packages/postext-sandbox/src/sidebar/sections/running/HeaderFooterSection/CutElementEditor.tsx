'use client';

/**
 * The editor of a cut element of a page template's decoration (#1565): a
 * hole the die cuts through the leaf of every composed page the template is
 * laid on, never painted. Its outline is a die shape of `dieCuts.shapes`
 * stretched to the element's box, else path data, else the box itself; its
 * leaves and wrap fall back to the die's. The box and placement are a shape
 * element's.
 */

import { dimensionsEqual, type DesignCutElement, type Dimension, type ElementSize } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../../../context/SandboxContext.js';
import { DimensionInput, NestedGroup, NumberInput, SelectInput, ToggleSwitch } from '../../../../controls/index.js';
import { PlacementFields, type Sibling } from './PlacementFields.js';
import { SizeToFields, isSizeTo, type FrameTarget } from './sizeTo.js';
import type { SlotKind } from './placementAdapter.js';
import { CheckedTextField } from './shapeFields.js';
import { checkPathData } from './shapeEdits.js';

const DEFAULT_SIZE_DIM: Dimension = { value: 20, unit: 'mm' };
const DEFAULT_GAP: Dimension = { value: 3, unit: 'mm' };
const NO_DIE = '';

function sizeDim(size: ElementSize | undefined, fallback: Dimension): Dimension {
  if (size && typeof size === 'object' && 'value' in size) return size;
  return fallback;
}

interface Props {
  raw: DesignCutElement;
  slotKind: SlotKind;
  siblings?: Sibling[];
  frames?: FrameTarget[];
  onChange: (next: DesignCutElement) => void;
}

export function CutElementEditor({ raw, slotKind, siblings = [], frames = [], onChange }: Props) {
  const labels = useSandboxLabels();
  const shapes = useSandboxSelector((s) => s.config.dieCuts?.shapes) ?? [];
  const update = (partial: Partial<DesignCutElement>) => {
    const next = { ...raw, ...partial } as Record<string, unknown>;
    for (const [k, v] of Object.entries(partial)) if (v === undefined) delete next[k];
    onChange(next as unknown as DesignCutElement);
  };
  const die = raw.die ? shapes.find((s) => s.id === raw.die) : undefined;
  const dieOptions = [
    { value: NO_DIE, label: labels.cutElementDieNone },
    ...shapes.map((s) => ({ value: s.id, label: s.name?.trim() ? `${s.name.trim()} (${s.id})` : s.id })),
    // A die the shapes no longer have stays visible, so it can be changed.
    ...(raw.die && !die ? [{ value: raw.die, label: raw.die }] : []),
  ];
  // What the element falls back to: its die's leaves and wrap, else 1 and 3 mm.
  const leaves = raw.leaves ?? die?.leaves ?? 1;
  const wrap = raw.wrap ?? die?.wrap;
  const wrapOn = wrap !== false;
  const gap = (wrap && wrap.gap) || DEFAULT_GAP;
  const viewBox = raw.viewBox ?? [1, 1];

  const placement = raw.placement;
  const widthSize = placement.size?.width;
  const heightSize = placement.size?.height;
  const widthTo = isSizeTo(widthSize) ? widthSize : undefined;
  const heightTo = isSizeTo(heightSize) ? heightSize : undefined;
  const width = sizeDim(widthSize, DEFAULT_SIZE_DIM);
  const height = sizeDim(heightSize, DEFAULT_SIZE_DIM);
  const updateSize = (next: { width?: ElementSize; height?: ElementSize }) =>
    update({ placement: { ...placement, size: { ...(placement.size ?? {}), ...next } } });

  return (
    <>
      <p className="mb-2 text-xs text-(--slate) [text-wrap:pretty]">{labels.cutElementIntro}</p>
      <SelectInput
        stacked
        label={labels.dieCutsPlacementDie}
        tooltip={labels.cutElementDieTooltip}
        value={raw.die ?? NO_DIE}
        options={dieOptions}
        onChange={(v) => update({ die: v === NO_DIE ? undefined : v })}
        isDefault={raw.die === undefined}
        onReset={() => update({ die: undefined })}
      />
      {!raw.die && (
        <>
          <CheckedTextField
            label={labels.dieCutsPathD}
            tooltip={labels.dieCutsPathDTooltip}
            value={raw.d ?? ''}
            monospace
            check={(text) => {
              if (!text.trim()) return null;
              const r = checkPathData(text);
              return r.ok ? null : labels.dieCutsPathDInvalid;
            }}
            onCommit={(d) => update({ d: d.trim() ? d : undefined })}
            isDefault={raw.d === undefined}
            onReset={() => update({ d: undefined })}
          />
          {raw.d && (
            <>
              <NumberInput label={labels.dieCutsViewBoxWidth} tooltip={labels.dieCutsViewBoxTooltip} value={viewBox[0]}
                onChange={(v) => v > 0 && update({ viewBox: [v, viewBox[1]] })} min={0.001} max={100000} step={1}
                isDefault={raw.viewBox === undefined} onReset={() => update({ viewBox: undefined })} />
              <NumberInput label={labels.dieCutsViewBoxHeight} value={viewBox[1]}
                onChange={(v) => v > 0 && update({ viewBox: [viewBox[0], v] })} min={0.001} max={100000} step={1}
                isDefault={raw.viewBox === undefined} onReset={() => update({ viewBox: undefined })} />
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
            </>
          )}
        </>
      )}
      <NumberInput label={labels.dieCutsLeaves} tooltip={labels.dieCutsLeavesTooltip} value={leaves}
        onChange={(v) => update({ leaves: Math.max(1, Math.floor(v)) })} min={1} max={999} step={1}
        isDefault={raw.leaves === undefined} onReset={() => update({ leaves: undefined })} />
      <ToggleSwitch label={labels.dieCutsWrap} tooltip={labels.dieCutsWrapTooltip} checked={wrapOn}
        onChange={(on) => update({ wrap: on ? { gap } : false })}
        isDefault={raw.wrap === undefined} onReset={() => update({ wrap: undefined })} />
      {wrapOn && (
        <NestedGroup>
          <DimensionInput label={labels.dieCutsWrapGap} tooltip={labels.dieCutsWrapGapTooltip} value={gap} step={0.5}
            onChange={(g) => update({ wrap: { gap: g } })}
            isDefault={raw.wrap === undefined || (raw.wrap !== false && dimensionsEqual(gap, DEFAULT_GAP))}
            onReset={() => update({ wrap: undefined })} />
        </NestedGroup>
      )}
      {!widthTo && (
        <DimensionInput label={labels.headerFooterElementWidth} tooltip={labels.headerFooterElementWidthTooltip} value={width} onChange={(d) => updateSize({ width: d })} min={0} step={1} />
      )}
      <SizeToFields axis="width" value={widthTo} slotKind={slotKind} siblings={siblings} frames={frames} allowNone onChange={(to) => updateSize({ width: to ?? width })} />
      {!heightTo && <DimensionInput label={labels.height} value={height} onChange={(d) => updateSize({ height: d })} min={0} step={1} />}
      <SizeToFields axis="height" value={heightTo} slotKind={slotKind} siblings={siblings} frames={frames} allowNone onChange={(to) => updateSize({ height: to ?? height })} />
      <PlacementFields placement={placement} slotKind={slotKind} siblings={siblings} frames={frames} pin={raw.pin} onPinChange={(pin) => update({ pin })} onChange={(p) => update({ placement: p })} />
    </>
  );
}
