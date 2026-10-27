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
import { useSandboxDispatch, useSandboxLabels, useSandboxResources, useSandboxSelector } from '../../../../context/SandboxContext.js';
import { SelectInput, DimensionInput, NumberInput, ToggleSwitch } from '../../../../controls/index.js';
import { FieldRow } from '../../../../controls/FieldRow.js';
import { useBlobObjectUrl } from '../../../../panels/resources/ResourcePreview.js';
import { resourceFromFile } from '../../../../panels/resources/uploads/uploadFiles.js';
import { IconButton } from '../../../../ui/index.js';
import { PlacementFields, PagesSelect, type Sibling } from './PlacementFields.js';
import { type SlotKind } from './placementAdapter.js';
import { SizeToFields, isSizeTo, type FrameTarget } from './sizeTo.js';
import { FOCUS_CENTER, focusFromPercent, focusFromPointer, focusPercent, type FocusPoint } from './focusPoint.js';

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
    // A templated id (`{attr.art}`) is resolved per heading: shown as written.
    ...(value && !selected ? [{ value, label: value.includes('{') ? value : labels.headerFooterImageMissing.replace('__id__', value) }] : []),
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
      hint={error ? <span role="alert" style={{ color: 'var(--destructive)' }}>{error}</span> : undefined}
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

/** Where a cover crop centres (#945): the picture, with its safe area
 *  outlined, and a cross at the point; a press or a drag on it moves the
 *  point, the two fields give it in percent. */
function FocusField({ resource, value, onChange }: { resource: Resource | undefined; value: FocusPoint | undefined; onChange: (next: FocusPoint | undefined) => void }) {
  const labels = useSandboxLabels();
  const url = useBlobObjectUrl(resource ? imageFileId(resource) : undefined);
  const point = value ?? FOCUS_CENTER;
  const safe = resource?.safeArea;
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const next = focusFromPointer(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY);
    if (next) onChange(next);
  };
  const nudge = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const d = e.key === 'ArrowLeft' ? [-step, 0] : e.key === 'ArrowRight' ? [step, 0] : e.key === 'ArrowUp' ? [0, -step] : e.key === 'ArrowDown' ? [0, step] : null;
    if (!d) return;
    e.preventDefault();
    onChange({ x: Math.min(1, Math.max(0, Math.round((point.x + d[0]!) * 100) / 100)), y: Math.min(1, Math.max(0, Math.round((point.y + d[1]!) * 100) / 100)) });
  };
  return (
    <>
      <FieldRow label={labels.headerFooterImageFocus} tooltip={labels.headerFooterImageFocusTooltip} stacked isDefault={value === undefined} onReset={() => onChange(undefined)}>
        {url ? (
          <div
            role="group"
            tabIndex={0}
            aria-label={labels.headerFooterImageFocusPick}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
            onPointerMove={(e) => { if (e.buttons === 1) move(e); }}
            onKeyDown={nudge}
            className="relative inline-block max-w-full cursor-crosshair touch-none select-none focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ outlineColor: 'var(--brand)' }}
            data-focus-picker=""
          >
            <img src={url} alt="" draggable={false} className="block max-h-40 max-w-full rounded border" style={{ borderColor: 'var(--rule)' }} />
            {safe && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute border border-dashed"
                style={{ left: `${safe.x * 100}%`, top: `${safe.y * 100}%`, width: `${safe.width * 100}%`, height: `${safe.height * 100}%`, borderColor: 'var(--brand)' }}
              />
            )}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
              style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, borderColor: '#fff', boxShadow: '0 0 0 1.5px var(--foreground)', opacity: value ? 1 : 0.55 }}
            />
          </div>
        ) : (
          <span className="text-xs" style={{ color: 'var(--slate)' }}>{labels.headerFooterImageFocusNoPicture}</span>
        )}
      </FieldRow>
      <NumberInput
        label={labels.headerFooterImageFocusX}
        value={focusPercent(point.x)}
        onChange={(v) => onChange({ x: focusFromPercent(v), y: point.y })}
        min={0}
        max={100}
        step={1}
        suffix="%"
        isDefault={value === undefined}
        onReset={() => onChange(undefined)}
      />
      <NumberInput
        label={labels.headerFooterImageFocusY}
        value={focusPercent(point.y)}
        onChange={(v) => onChange({ x: point.x, y: focusFromPercent(v) })}
        min={0}
        max={100}
        step={1}
        suffix="%"
        isDefault={value === undefined}
        onReset={() => onChange(undefined)}
      />
    </>
  );
}

interface Props {
  raw: DesignImageElement;
  resolved: ResolvedDesignImageElement;
  slotKind: SlotKind;
  siblings?: Sibling[];
  /** The frames and groups of the template, on a composed page's decoration. */
  frames?: FrameTarget[];
  onChange: (next: DesignImageElement) => void;
}

/** An image drawn from a bitmap / SVG resource (a publisher logo on a title
 *  page, a cover picture): the resource, whether it is decoration only (no
 *  alternative text in the output; heading and part designs only, since a
 *  running head's picture always is), the box it is fitted in (one side
 *  `auto` keeps the image's aspect ratio) and the shared placement fields. */
export function ImageElementEditor({ raw, resolved, slotKind, siblings = [], frames = [], onChange }: Props) {
  const labels = useSandboxLabels();
  const resources = useSandboxResources();

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
  // A side may run to an edge of another box (#945).
  const widthSize = resolved.placement.size?.width;
  const heightSize = resolved.placement.size?.height;
  const widthTo = isSizeTo(widthSize) ? widthSize : undefined;
  const heightTo = isSizeTo(heightSize) ? heightSize : undefined;

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
      {/* A running head's or footer's picture repeats on every page: always
          decoration, so the switch only shows in heading and part designs. */}
      {slotKind !== 'header' && slotKind !== 'footer' && <ToggleSwitch
        label={labels.headerFooterImageDecorative}
        checked={raw.decorative ?? false}
        onChange={(v) => {
          const next: DesignImageElement = { ...raw };
          if (v) next.decorative = true;
          else delete next.decorative;
          onChange(next);
        }}
        isDefault={!raw.decorative}
        onReset={() => {
          const next: DesignImageElement = { ...raw };
          delete next.decorative;
          onChange(next);
        }}
        tooltip={labels.headerFooterImageDecorativeTooltip}
      />}
      {!widthTo && (
        <DimensionInput
          label={labels.headerFooterElementWidth} tooltip={labels.headerFooterElementWidthTooltip}
          value={width}
          onChange={(dim: Dimension) => updateSize({ width: dim })}
          min={0}
          step={1}
          isDefault={widthAuto}
          onReset={() => updateSize({ width: 'auto' })}
        />
      )}
      <SizeToFields axis="width" value={widthTo} slotKind={slotKind} siblings={siblings} frames={frames} allowNone onChange={(to) => updateSize({ width: to ?? 'auto' })} />
      {!heightTo && (
        <DimensionInput
          label={labels.height}
          value={height}
          onChange={(dim: Dimension) => updateSize({ height: dim })}
          min={0}
          step={1}
          isDefault={heightAuto}
          onReset={() => updateSize({ height: 'auto' })}
        />
      )}
      <SizeToFields axis="height" value={heightTo} slotKind={slotKind} siblings={siblings} frames={frames} allowNone onChange={(to) => updateSize({ height: to ?? 'auto' })} />
      {/* Cover or contain (#923), for a box with both sides set. */}
      {!widthAuto && !heightAuto && (
        <SelectInput
          variant="segmented"
          label={labels.headerFooterImageFit}
          tooltip={labels.headerFooterImageFitTooltip}
          value={raw.fit ?? 'contain'}
          options={[
            { value: 'contain', label: labels.headerFooterImageFitContain },
            { value: 'cover', label: labels.headerFooterImageFitCover },
          ]}
          onChange={(v) => {
            const next: DesignImageElement = { ...raw };
            if (v === 'cover') next.fit = 'cover';
            else delete next.fit;
            onChange(next);
          }}
          isDefault={raw.fit === undefined}
          onReset={() => {
            const next: DesignImageElement = { ...raw };
            delete next.fit;
            onChange(next);
          }}
        />
      )}
      {/* The point a cover crop centres (#945). */}
      {!widthAuto && !heightAuto && raw.fit === 'cover' && (
        <FocusField
          resource={resources.find((r) => r.id === raw.resourceId)}
          value={raw.focus}
          onChange={(focus) => {
            const next: DesignImageElement = { ...raw };
            if (focus) next.focus = focus;
            else delete next.focus;
            onChange(next);
          }}
        />
      )}
      <PlacementFields
        placement={resolved.placement}
        slotKind={slotKind}
        siblings={siblings}
        frames={frames}
        pin={raw.pin}
        onPinChange={(pin) => update({ pin })}
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
