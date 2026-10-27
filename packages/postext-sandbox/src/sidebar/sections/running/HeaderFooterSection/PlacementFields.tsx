'use client';

import { useSandboxLabels } from '../../../../context/SandboxContext.js';
import type { AnchorEdge, DesignElement, Dimension, ElementPlacement, HAlign, PageRoleFilter } from 'postext';
import { DimensionInput, SelectInput, ToggleSwitch } from '../../../../controls/index.js';
import { elementKindLabel } from './elementKind.js';
import { SidePointFields } from './sidePoint.js';
import type { FrameTarget } from './sizeTo.js';
import {
  type SlotKind,
  CONTAINER_EDGES,
  LOGICAL_CONTAINER_EDGES,
  LOGICAL_ELEMENT_EDGES,
  alignForElementEdge,
  alignFromPlacement,
  anchorTargetId,
  applyAlign,
  type PlacementAlign,
  applyAnchorTarget,
  applyElementEdge,
  applyOffsetX,
  applyOffsetY,
  isElementAnchor,
  isPageFrameAnchor,
} from './placementAdapter.js';

const ZERO: Dimension = { value: 0, unit: 'pt' };

export interface Sibling {
  id: string;
  kind: DesignElement['kind'];
  index: number;
}

interface PlacementFieldsProps {
  placement: ElementPlacement;
  slotKind: SlotKind;
  siblings?: Sibling[];
  /** The frames and groups of the template, on a composed page's
   *  decoration: an element can be anchored to them (#1063). */
  frames?: readonly FrameTarget[];
  /** `impliedAlign` is set when an element-to-element edge suggests a text
   *  alignment (text elements apply it to their `align`). */
  onChange: (placement: ElementPlacement, impliedAlign?: HAlign) => void;
  /** The element's `pin` (#856), offered while it is anchored to one of
   *  `frames`: it stays where the template declares the frame. */
  pin?: boolean;
  onPinChange?: (pin: true | undefined) => void;
}

/** Anchor controls shared by the text, rule and box editors: the target
 *  picker (container / page / bleed / sibling element) followed by the
 *  fields that make sense for that target — relative edge and offsets for
 *  element and page-frame anchors, a simple alignment for the container. */
export function PlacementFields({ placement, slotKind, siblings = [], frames = [], onChange, pin, onPinChange }: PlacementFieldsProps) {
  const labels = useSandboxLabels();
  const anchoredToElement = isElementAnchor(placement);
  const anchoredToFrame = isPageFrameAnchor(placement);

  const kindLabel = (kind: Sibling['kind']): string => elementKindLabel(labels, kind);
  const target = anchorTargetId(placement);

  const targetOptions = [
    { value: 'container', label: labels.headerFooterElementAnchorContainer },
    { value: 'page', label: labels.headerFooterAnchorToPage },
    { value: 'bleed', label: labels.headerFooterAnchorToBleed },
    // The fore-edge: running heads and folios only.
    ...(slotKind === 'header' || slotKind === 'footer' ? [{ value: 'outer', label: labels.headerFooterAnchorToOuter }] : []),
    ...siblings.map((s) => ({ value: s.id, label: `${kindLabel(s.kind)} #${s.index + 1}` })),
    // The template's frames and groups (#1063), named as the size fields do.
    ...frames.filter((f) => !siblings.some((s) => s.id === f.name)).map((f) => ({
      value: f.name,
      label: (f.kind === 'group' ? labels.headerFooterSizeToGroup : labels.headerFooterSizeToFrame).replace('__name__', f.name),
    })),
  ];
  // An anchor on a name the lists lack (a frame instance, one taken out)
  // stays shown rather than read as another target.
  if (!targetOptions.some((o) => o.value === target)) targetOptions.push({ value: target, label: target });
  /** The point along the anchor's side (#1055), read on sides of other
   *  elements and of frames. */
  const atField = (
    <SidePointFields
      label={labels.headerFooterAnchorAt}
      tooltip={labels.headerFooterAnchorAtTooltip}
      ownLabel={labels.headerFooterAnchorAtOwn}
      value={placement.anchor.at}
      onChange={(at) => {
        const anchor = { ...placement.anchor };
        if (at === undefined) delete anchor.at;
        else anchor.at = at;
        onChange({ ...placement, anchor });
      }}
    />
  );

  const ELEMENT_EDGE_OPTIONS: { value: AnchorEdge; label: string }[] = [
    { value: 'right-of', label: labels.headerFooterElementEdgeRightOf },
    { value: 'left-of', label: labels.headerFooterElementEdgeLeftOf },
    { value: 'below', label: labels.headerFooterElementEdgeBelow },
    { value: 'above', label: labels.headerFooterElementEdgeAbove },
    { value: 'align-top', label: labels.headerFooterElementEdgeAlignTop },
    { value: 'align-bottom', label: labels.headerFooterElementEdgeAlignBottom },
    { value: 'align-left', label: labels.headerFooterElementEdgeAlignLeft },
    { value: 'align-right', label: labels.headerFooterElementEdgeAlignRight },
    // The page's start and end sides (#936).
    ...LOGICAL_ELEMENT_EDGES.map((edge) => ({ value: edge, label: edge === 'align-start' ? labels.headerFooterElementEdgeAlignStart : labels.headerFooterElementEdgeAlignEnd })),
  ];

  const FRAME_EDGE_LABELS: Record<string, string> = {
    'top-left': labels.headerFooterFrameEdgeTopLeft,
    top: labels.headerFooterFrameEdgeTop,
    'top-right': labels.headerFooterFrameEdgeTopRight,
    left: labels.headerFooterFrameEdgeLeft,
    center: labels.headerFooterFrameEdgeCenter,
    right: labels.headerFooterFrameEdgeRight,
    'bottom-left': labels.headerFooterFrameEdgeBottomLeft,
    bottom: labels.headerFooterFrameEdgeBottom,
    'bottom-right': labels.headerFooterFrameEdgeBottomRight,
    'top-start': labels.headerFooterFrameEdgeTopStart,
    start: labels.headerFooterFrameEdgeStart,
    'bottom-start': labels.headerFooterFrameEdgeBottomStart,
    'top-end': labels.headerFooterFrameEdgeTopEnd,
    end: labels.headerFooterFrameEdgeEnd,
    'bottom-end': labels.headerFooterFrameEdgeBottomEnd,
  };
  const FRAME_EDGE_OPTIONS = [...CONTAINER_EDGES, ...LOGICAL_CONTAINER_EDGES].map((edge) => ({
    value: edge,
    label: FRAME_EDGE_LABELS[edge] ?? edge,
  }));

  const ALIGN_OPTIONS = [
    { value: 'left', label: labels.headerFooterElementAlignLeft },
    { value: 'center', label: labels.headerFooterElementAlignCenter },
    { value: 'right', label: labels.headerFooterElementAlignRight },
    // The page's start and end sides: the right and the left of a
    // right-to-left page (#936).
    { value: 'start', label: labels.headerFooterElementAlignStart },
    { value: 'end', label: labels.headerFooterElementAlignEnd },
  ];

  const offsetFields = (
    <>
      <DimensionInput
        label={labels.headerFooterElementOffsetX}
        value={placement.offset?.x ?? ZERO}
        onChange={(dim: Dimension) => onChange(applyOffsetX(placement, dim))}
        min={-2000}
        step={1}
        tooltip={labels.headerFooterElementOffsetXTooltip}
      />
      <DimensionInput
        label={labels.headerFooterElementOffsetY}
        value={placement.offset?.y ?? ZERO}
        onChange={(dim: Dimension) => onChange(applyOffsetY(placement, dim))}
        min={-2000}
        step={1}
        tooltip={labels.headerFooterElementOffsetYTooltip}
      />
    </>
  );

  return (
    <>
      <SelectInput
        label={labels.headerFooterElementAnchorTo}
        value={target}
        options={targetOptions}
        onChange={(v) => {
          const next = applyAnchorTarget(placement, slotKind, v);
          onChange(next, isElementAnchor(next) ? alignForElementEdge(next.anchor.edge) : undefined);
        }}
        tooltip={labels.headerFooterElementAnchorToTooltip}
      />
      {anchoredToElement ? (
        <>
          <SelectInput
            label={labels.headerFooterElementEdge}
            value={placement.anchor.edge}
            options={ELEMENT_EDGE_OPTIONS}
            onChange={(v) => {
              const edge = v as AnchorEdge;
              onChange(applyElementEdge(placement, edge), alignForElementEdge(edge));
            }}
            tooltip={labels.headerFooterElementEdgeTooltip}
          />
          {atField}
          {offsetFields}
          {onPinChange && frames.some((f) => f.name === target) && (
            <ToggleSwitch
              label={labels.designElementPin}
              tooltip={labels.designElementPinTooltip}
              checked={pin === true}
              onChange={(v) => onPinChange(v ? true : undefined)}
              isDefault={pin === undefined}
              onReset={() => onPinChange(undefined)}
            />
          )}
        </>
      ) : anchoredToFrame ? (
        <>
          <SelectInput
            label={labels.headerFooterFrameEdge}
            value={placement.anchor.edge}
            options={FRAME_EDGE_OPTIONS}
            onChange={(v) => onChange(applyElementEdge(placement, v as AnchorEdge))}
            tooltip={labels.headerFooterFrameEdgeTooltip}
          />
          {offsetFields}
        </>
      ) : (
        <SelectInput
          label={labels.headerFooterElementAlign}
          value={alignFromPlacement(placement)}
          options={ALIGN_OPTIONS}
          onChange={(v) => onChange(applyAlign(placement, slotKind, v as PlacementAlign))}
          tooltip={labels.headerFooterElementAlignTooltip}
        />
      )}
    </>
  );
}

interface PagesSelectProps {
  value: PageRoleFilter | undefined;
  onChange: (next: PageRoleFilter | undefined) => void;
}

/** The `pages` role filter of a design element (`all` when unset). */
export function PagesSelect({ value, onChange }: PagesSelectProps) {
  const labels = useSandboxLabels();
  const options = [
    { value: 'all', label: labels.headerFooterElementPagesAll },
    { value: 'body', label: labels.headerFooterElementPagesBody },
    { value: 'opener', label: labels.headerFooterElementPagesOpener },
    { value: 'part', label: labels.headerFooterElementPagesPart },
    { value: 'blank', label: labels.headerFooterElementPagesBlank },
  ];
  return (
    <SelectInput
      label={labels.headerFooterElementPages}
      value={value ?? 'all'}
      options={options}
      onChange={(v) => onChange(v === 'all' ? undefined : (v as PageRoleFilter))}
      tooltip={labels.headerFooterElementPagesTooltip}
      isDefault={value === undefined || value === 'all'}
      onReset={() => onChange(undefined)}
    />
  );
}
