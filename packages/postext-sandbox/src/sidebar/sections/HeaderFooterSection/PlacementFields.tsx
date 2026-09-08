'use client';

import { useSandboxLabels } from '../../../context/SandboxContext';
import type { AnchorEdge, Dimension, ElementPlacement, HAlign, PageRoleFilter } from 'postext';
import { DimensionInput, SelectInput } from '../../../controls';
import {
  type SlotKind,
  CONTAINER_EDGES,
  alignForElementEdge,
  alignFromPlacement,
  anchorTargetId,
  applyAlign,
  applyAnchorTarget,
  applyElementEdge,
  applyOffsetX,
  applyOffsetY,
  isElementAnchor,
  isPageFrameAnchor,
} from './placementAdapter';

const ZERO: Dimension = { value: 0, unit: 'pt' };

export interface Sibling {
  id: string;
  kind: 'text' | 'rule' | 'box';
  index: number;
}

interface PlacementFieldsProps {
  placement: ElementPlacement;
  slotKind: SlotKind;
  siblings?: Sibling[];
  /** `impliedAlign` is set when an element-to-element edge suggests a text
   *  alignment (text elements apply it to their `align`). */
  onChange: (placement: ElementPlacement, impliedAlign?: HAlign) => void;
}

/** Anchor controls shared by the text, rule and box editors: the target
 *  picker (container / page / bleed / sibling element) followed by the
 *  fields that make sense for that target — relative edge and offsets for
 *  element and page-frame anchors, a simple alignment for the container. */
export function PlacementFields({ placement, slotKind, siblings = [], onChange }: PlacementFieldsProps) {
  const labels = useSandboxLabels();
  const anchoredToElement = isElementAnchor(placement);
  const anchoredToFrame = isPageFrameAnchor(placement);

  const kindLabel = (kind: Sibling['kind']): string =>
    kind === 'text'
      ? labels.headerFooterElementText
      : kind === 'rule'
        ? labels.headerFooterElementRule
        : (labels.headerFooterElementBox ?? 'Box');

  const targetOptions = [
    { value: 'container', label: labels.headerFooterElementAnchorContainer ?? 'Container' },
    { value: 'page', label: labels.headerFooterAnchorToPage },
    { value: 'bleed', label: labels.headerFooterAnchorToBleed },
    ...siblings.map((s) => ({ value: s.id, label: `${kindLabel(s.kind)} #${s.index + 1}` })),
  ];

  const ELEMENT_EDGE_OPTIONS: { value: AnchorEdge; label: string }[] = [
    { value: 'right-of', label: labels.headerFooterElementEdgeRightOf ?? 'Right of' },
    { value: 'left-of', label: labels.headerFooterElementEdgeLeftOf ?? 'Left of' },
    { value: 'below', label: labels.headerFooterElementEdgeBelow ?? 'Below' },
    { value: 'above', label: labels.headerFooterElementEdgeAbove ?? 'Above' },
    { value: 'align-top', label: labels.headerFooterElementEdgeAlignTop ?? 'Align top' },
    { value: 'align-bottom', label: labels.headerFooterElementEdgeAlignBottom ?? 'Align bottom' },
    { value: 'align-left', label: labels.headerFooterElementEdgeAlignLeft ?? 'Align left' },
    { value: 'align-right', label: labels.headerFooterElementEdgeAlignRight ?? 'Align right' },
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
  };
  const FRAME_EDGE_OPTIONS = CONTAINER_EDGES.map((edge) => ({
    value: edge,
    label: FRAME_EDGE_LABELS[edge] ?? edge,
  }));

  const ALIGN_OPTIONS = [
    { value: 'left', label: labels.headerFooterElementAlignLeft },
    { value: 'center', label: labels.headerFooterElementAlignCenter },
    { value: 'right', label: labels.headerFooterElementAlignRight },
  ];

  const offsetFields = (
    <>
      <DimensionInput
        label={labels.headerFooterElementOffsetX ?? 'Offset X'}
        value={placement.offset?.x ?? ZERO}
        onChange={(dim: Dimension) => onChange(applyOffsetX(placement, dim))}
        step={1}
        tooltip={labels.headerFooterElementOffsetXTooltip ?? 'Horizontal distance from the reference edge. Positive values move right; negative, left.'}
      />
      <DimensionInput
        label={labels.headerFooterElementOffsetY ?? 'Offset Y'}
        value={placement.offset?.y ?? ZERO}
        onChange={(dim: Dimension) => onChange(applyOffsetY(placement, dim))}
        step={1}
        tooltip={labels.headerFooterElementOffsetYTooltip ?? 'Vertical distance from the reference edge. Positive values move down; negative, up.'}
      />
    </>
  );

  return (
    <>
      <SelectInput
        label={labels.headerFooterElementAnchorTo ?? 'Anchor to'}
        value={anchorTargetId(placement)}
        options={targetOptions}
        onChange={(v) => {
          const next = applyAnchorTarget(placement, slotKind, v);
          onChange(next, isElementAnchor(next) ? alignForElementEdge(next.anchor.edge) : undefined);
        }}
        tooltip={labels.headerFooterElementAnchorToTooltip ?? 'Anchor the element to the slot container, the page or bleed frame, or a sibling element. Element anchors are positioned relative to their target, so a box can push its neighbour when it grows.'}
      />
      {anchoredToElement ? (
        <>
          <SelectInput
            label={labels.headerFooterElementEdge ?? 'Relative position'}
            value={placement.anchor.edge}
            options={ELEMENT_EDGE_OPTIONS}
            onChange={(v) => {
              const edge = v as AnchorEdge;
              onChange(applyElementEdge(placement, edge), alignForElementEdge(edge));
            }}
            tooltip={labels.headerFooterElementEdgeTooltip ?? 'Edge of the reference element this block hangs from: right, left, above, below, or aligned to one of its sides.'}
          />
          {offsetFields}
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
          onChange={(v) => onChange(applyAlign(placement, slotKind, v as HAlign))}
          tooltip={labels.headerFooterElementAlignTooltip ?? 'Horizontal alignment of the element inside the container: left, center or right.'}
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
