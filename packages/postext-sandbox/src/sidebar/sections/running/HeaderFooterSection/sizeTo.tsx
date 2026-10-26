'use client';

import type { ElementSize, ElementSizeTo } from 'postext';
import { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { SelectInput } from '../../../../controls/index.js';
import type { Sibling } from './PlacementFields.js';
import { elementKindLabel } from './elementKind.js';
import type { SlotKind } from './placementAdapter.js';

/** A frame or a group of the page template whose decoration is being
 *  edited: a size can run to its edge (`#name`, #945). */
export interface FrameTarget {
  name: string;
  kind: 'frame' | 'group';
  /** A frame of a repeating grid (#1061): a connector can go to each of
   *  its instances (`[*]`). */
  repeated?: boolean;
}

export type SizeAxis = 'width' | 'height';

/** A size that runs to an edge of another box (#928), as opposed to a
 *  length, `'auto'` or `'fill'`. */
export function isSizeTo(size: ElementSize | undefined): size is ElementSizeTo {
  return !!size && typeof size === 'object' && 'to' in size;
}

/** The edges a side can stop at: left, middle or right for a width, top,
 *  middle or bottom for a height (#1055; the other pair reads as
 *  `'fill'`). */
export const EDGES_OF: Record<SizeAxis, readonly ElementSizeTo['edge'][]> = {
  width: ['left', 'center', 'right'],
  height: ['top', 'center', 'bottom'],
};

/** Where a side starts to run to when it is first set: the far edge of
 *  the slot's container. */
export function defaultSizeTo(axis: SizeAxis): ElementSizeTo {
  return { to: 'container', edge: axis === 'width' ? 'right' : 'bottom' };
}

/** The same target with an edge that fits the side. */
export function sizeToFor(axis: SizeAxis, to: ElementSizeTo['to'], edge?: ElementSizeTo['edge']): ElementSizeTo {
  return { to, edge: edge && EDGES_OF[axis].includes(edge) ? edge : defaultSizeTo(axis).edge };
}

export interface SizeTarget {
  value: ElementSizeTo['to'];
  kind: 'container' | 'page' | 'bleed' | 'outer' | 'element' | 'frame' | 'group';
  /** The element's or frame's own name. */
  name?: string;
}

/** The boxes a size can run to in a slot: the container, the trim, the
 *  bleed, the outer margin (running heads and folios), the other elements
 *  and, on a composed page's decoration, its frames and groups. */
export function sizeTargets(slotKind: SlotKind, siblings: readonly Sibling[], frames: readonly FrameTarget[]): SizeTarget[] {
  return [
    { value: 'container', kind: 'container' },
    { value: 'page', kind: 'page' },
    { value: 'bleed', kind: 'bleed' },
    ...(slotKind === 'header' || slotKind === 'footer' ? [{ value: 'outer' as const, kind: 'outer' as const }] : []),
    ...siblings.map((s) => ({ value: `#${s.id}` as const, kind: 'element' as const, name: s.id })),
    ...frames.map((f) => ({ value: `#${f.name}` as const, kind: f.kind, name: f.name })),
  ];
}

interface SizeToFieldsProps {
  axis: SizeAxis;
  value: ElementSizeTo | undefined;
  slotKind: SlotKind;
  siblings?: readonly Sibling[];
  frames?: readonly FrameTarget[];
  /** The picker offers «its own length» first (an editor whose length
   *  field stays beside it); without it a target is always chosen. */
  allowNone?: boolean;
  onChange: (next: ElementSizeTo | undefined) => void;
}

/** The two fields of a size that runs to an edge: the box it runs to and
 *  which of its edges (#945). */
export function SizeToFields({ axis, value, slotKind, siblings = [], frames = [], allowNone = false, onChange }: SizeToFieldsProps) {
  const labels = useSandboxLabels();
  const targets = sizeTargets(slotKind, siblings, frames);
  const label = (t: SizeTarget): string => {
    switch (t.kind) {
      case 'container': return labels.headerFooterElementAnchorContainer;
      case 'page': return labels.headerFooterAnchorToPage;
      case 'bleed': return labels.headerFooterAnchorToBleed;
      case 'outer': return labels.headerFooterAnchorToOuter;
      case 'frame': return labels.headerFooterSizeToFrame.replace('__name__', t.name ?? '');
      case 'group': return labels.headerFooterSizeToGroup.replace('__name__', t.name ?? '');
      default: {
        const s = siblings.find((x) => x.id === t.name);
        return s ? `${elementKindLabel(labels, s.kind)} #${s.index + 1}` : (t.name ?? '');
      }
    }
  };
  const options = [
    ...(allowNone ? [{ value: '', label: labels.headerFooterSizeToNone }] : []),
    // A box that is no longer there (a deleted element) stays selectable so
    // the size is not silently rewired.
    ...(value && !targets.some((t) => t.value === value.to) ? [{ value: value.to, label: labels.headerFooterImageMissing.replace('__id__', value.to.replace(/^#/, '')) }] : []),
    ...targets.map((t) => ({ value: t.value as string, label: label(t) })),
  ];
  const EDGE_LABELS: Partial<Record<ElementSizeTo['edge'], string>> = {
    // The middle of the box (#1055).
    center: labels.headerFooterSizeToEdgeCenter,
    top: labels.headerFooterFrameEdgeTop,
    bottom: labels.headerFooterFrameEdgeBottom,
    left: labels.headerFooterFrameEdgeLeft,
    right: labels.headerFooterFrameEdgeRight,
  };
  return (
    <>
      <SelectInput
        label={axis === 'width' ? labels.headerFooterSizeToWidth : labels.headerFooterSizeToHeight}
        tooltip={labels.headerFooterSizeToTooltip}
        value={value?.to ?? ''}
        options={options}
        onChange={(v) => onChange(v === '' ? undefined : sizeToFor(axis, v as ElementSizeTo['to'], value?.edge))}
        isDefault={value === undefined}
        onReset={allowNone ? () => onChange(undefined) : undefined}
      />
      {value && (
        <SelectInput
          variant="segmented"
          label={labels.headerFooterSizeToEdge}
          tooltip={labels.headerFooterSizeToEdgeTooltip}
          value={value.edge}
          options={EDGES_OF[axis].map((e) => ({ value: e, label: EDGE_LABELS[e] ?? e }))}
          onChange={(v) => onChange({ to: value.to, edge: v as ElementSizeTo['edge'] })}
        />
      )}
    </>
  );
}
