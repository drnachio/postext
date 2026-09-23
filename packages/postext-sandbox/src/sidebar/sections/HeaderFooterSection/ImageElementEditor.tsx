'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, SquarePen } from 'lucide-react';
import { defaultResourceTypes } from 'postext';
import type {
  DesignImageElement,
  ResolvedDesignImageElement,
  PageParity,
  Dimension,
  ElementSize,
  Resource,
} from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxResources, useSandboxSelector } from '../../../context/SandboxContext';
import { SelectInput, DimensionInput } from '../../../controls';
import { FieldRow } from '../../../controls/FieldRow';
import { useBlobObjectUrl } from '../../../panels/resources/ResourcePreview';
import { resourceFromFile } from '../../../panels/resources/uploadFiles';
import { IconButton } from '../../../ui';
import { PlacementFields, PagesSelect, type Sibling } from './PlacementFields';
import { type SlotKind } from './placementAdapter';

const DEFAULT_SIZE_DIM: Dimension = { value: 20, unit: 'mm' };
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg';

function sizeDim(size: ElementSize | undefined, fallback: Dimension): Dimension {
  if (size && typeof size === 'object' && 'value' in size) return size;
  return fallback;
}

function imageFileId(r: Resource): string | undefined {
  return r.bitmap?.fileId ?? r.svg?.fileId;
}

/** The image an element draws: a pick among the bitmap / SVG resources of
 *  the book (with a thumbnail of the chosen one), an upload that becomes a
 *  new resource and selects it, and a jump to the Resources panel where the
 *  chosen resource's file can be replaced. */
function ImageResourceField({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const resources = useSandboxResources();
  const configTypes = useSandboxSelector((s) => s.config.resourceTypes);
  const locale = useSandboxSelector((s) => s.locale);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const images = resources.filter((r) => r.bitmap || r.svg);
  const selected = images.find((r) => r.id === value);
  const previewUrl = useBlobObjectUrl(selected ? imageFileId(selected) : undefined);
  const options = [
    { value: '', label: labels.headerFooterImageNone },
    // An id no resource carries (a deleted one, a typo) stays selectable so
    // the element is not silently rewired.
    ...(value && !selected ? [{ value, label: labels.headerFooterImageMissing.replace('__id__', value) }] : []),
    ...images.map((r) => ({ value: r.id, label: r.id })),
  ];

  const upload = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const typeId = (configTypes ?? defaultResourceTypes(locale))[0]?.id ?? '';
      const resource = await resourceFromFile(file, typeId, new Set(resources.map((r) => r.id)));
      if (!resource) {
        setError(labels.uploadImageInvalid);
        return;
      }
      dispatch({ type: 'UPSERT_RESOURCE', payload: resource });
      onChange(resource.id);
    } catch {
      setError(labels.uploadImageFailed);
    } finally {
      setBusy(false);
    }
  };

  const openInResources = () => {
    dispatch({ type: 'SET_PANEL', payload: 'resources' });
    dispatch({ type: 'SET_ACTIVE_RESOURCE', payload: value });
  };

  return (
    <FieldRow
      label={labels.headerFooterImageResource}
      tooltip={labels.headerFooterImageResourceTooltip}
      stacked
      extraTerms={images.map((r) => r.id)}
      hint={error ? <span style={{ color: 'var(--destructive)' }}>{error}</span> : undefined}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded border"
        style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--surface)' }}
        aria-hidden="true"
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <ImagePlus size={14} style={{ color: 'var(--slate)' }} />
        )}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={labels.headerFooterImageResource}
        className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"
        style={{
          borderColor: 'var(--rule)',
          backgroundColor: 'var(--surface)',
          color: selected ? 'var(--foreground)' : 'var(--slate)',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <IconButton
        label={labels.headerFooterImageUpload}
        icon={busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      />
      <IconButton
        label={labels.headerFooterImageEdit}
        icon={<SquarePen size={13} />}
        disabled={!selected}
        onClick={openInResources}
      />
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void upload(file);
        }}
      />
    </FieldRow>
  );
}

interface Props {
  raw: DesignImageElement;
  resolved: ResolvedDesignImageElement;
  slotKind: SlotKind;
  siblings?: Sibling[];
  onChange: (next: DesignImageElement) => void;
}

/** An image drawn from a bitmap / SVG resource (a publisher logo on a title
 *  page, a cover picture): the resource, the box it is fitted in (one side
 *  `auto` keeps the image's aspect ratio) and the shared placement fields. */
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
      <ImageResourceField value={raw.resourceId} onChange={(id) => update({ resourceId: id })} />
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
