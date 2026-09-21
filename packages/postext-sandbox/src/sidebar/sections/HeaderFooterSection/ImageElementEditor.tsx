'use client';

import { useSandboxLabels } from '../../../context/SandboxContext';
import type {
  DesignImageElement,
  ResolvedDesignImageElement,
  PageParity,
  Dimension,
  ElementSize,
} from 'postext';
import { SelectInput, DimensionInput, TextInput } from '../../../controls';
import { PlacementFields, PagesSelect, type Sibling } from './PlacementFields';
import { type SlotKind } from './placementAdapter';

const DEFAULT_SIZE_DIM: Dimension = { value: 20, unit: 'mm' };

function sizeDim(size: ElementSize | undefined, fallback: Dimension): Dimension {
  if (size && typeof size === 'object' && 'value' in size) return size;
  return fallback;
}

interface Props {
  raw: DesignImageElement;
  resolved: ResolvedDesignImageElement;
  slotKind: SlotKind;
  siblings?: Sibling[];
  onChange: (next: DesignImageElement) => void;
}

/** An image drawn from a bitmap / SVG resource (a publisher logo on a title
 *  page): the resource id, the box it is fitted in (one side `auto` keeps
 *  the image's aspect ratio) and the shared placement fields. */
export function ImageElementEditor({ raw, resolved, slotKind, siblings = [], onChange }: Props) {
  const labels = useSandboxLabels();

  const update = (partial: Partial<DesignImageElement>) => {
    onChange({ ...raw, ...partial });
  };

  const PARITY_OPTIONS = [
    { value: 'all', label: labels.headerFooterElementParityAll },
    { value: 'odd', label: labels.headerFooterElementParityOdd },
    { value: 'even', label: labels.headerFooterElementParityEven },
  ];

  const width = sizeDim(resolved.placement.size?.width, DEFAULT_SIZE_DIM);
  const height = sizeDim(resolved.placement.size?.height, DEFAULT_SIZE_DIM);
  const widthAuto = resolved.placement.size?.width === undefined || resolved.placement.size?.width === 'auto';
  const heightAuto = resolved.placement.size?.height === undefined || resolved.placement.size?.height === 'auto';

  const updateSize = (next: { width?: ElementSize; height?: ElementSize }) => {
    update({
      placement: {
        ...resolved.placement,
        size: {
          ...(resolved.placement.size ?? {}),
          ...next,
        },
      },
    });
  };

  return (
    <>
      <TextInput
        label={labels.headerFooterImageResource}
        value={raw.resourceId}
        onChange={(v: string) => update({ resourceId: v })}
      />
      <DimensionInput
        label={labels.headerFooterElementWidth}
        value={width}
        onChange={(dim: Dimension) => updateSize({ width: dim })}
        min={0}
        step={1}
        isDefault={widthAuto}
        onReset={() => updateSize({ width: 'auto' })}
      />
      <DimensionInput
        label={labels.height}
        value={height}
        onChange={(dim: Dimension) => updateSize({ height: dim })}
        min={0}
        step={1}
        isDefault={heightAuto}
        onReset={() => updateSize({ height: 'auto' })}
      />
      <PlacementFields
        placement={resolved.placement}
        slotKind={slotKind}
        siblings={siblings}
        onChange={(placement) => update({ placement })}
      />
      <SelectInput
        label={labels.headerFooterElementParity}
        value={raw.parity ?? 'all'}
        options={PARITY_OPTIONS}
        onChange={(v) => update({ parity: v as PageParity })}
        tooltip={labels.headerFooterElementParityTooltip}
      />
      <PagesSelect
        value={raw.pages}
        onChange={(pages) => {
          const next: DesignImageElement = { ...raw };
          if (pages === undefined) delete next.pages;
          else next.pages = pages;
          onChange(next);
        }}
      />
    </>
  );
}
