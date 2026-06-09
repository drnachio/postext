'use client';

import { useState } from 'react';
import { ChevronLeft, Trash2 } from 'lucide-react';
import type {
  Resource,
  ResourceType,
  ResourcePlacement,
  ResourceFloatPosition as PlacementPosition,
  ResourceFloatSpan as PlacementSpan,
} from 'postext';
import { useSandboxLabels } from '../../context/SandboxContext';
import { InlineMarkdownInput } from '../../controls/InlineMarkdownInput';
import { ConfirmPopover } from '../ConfirmPopover';
import { ResourcePreview } from './ResourcePreview';
import { BitmapUploader, type BitmapUploadResult } from './BitmapUploader';
import { SvgUploader, type SvgUploadResult } from './SvgUploader';
import { TableEditor } from './TableEditor/TableEditor';
import { slugify } from './slugify';
import type { TableModel } from 'postext';

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
const inputStyle = { borderColor: 'var(--rule)', color: 'var(--foreground)' } as const;
const labelStyle = { color: 'var(--slate)', fontSize: 11, lineHeight: '14px' } as const;

interface FieldProps {
  label: string;
  children: React.ReactNode;
  hint?: string;
}

function Field({ label, children, hint }: FieldProps) {
  return (
    <label className="flex flex-col gap-0.5">
      <span style={labelStyle}>{label}</span>
      {children}
      {hint && (
        <span style={{ ...labelStyle, color: 'var(--slate)' }} className="opacity-80">
          {hint}
        </span>
      )}
    </label>
  );
}

interface ResourceDetailProps {
  resource: Resource;
  types: ResourceType[];
  /** Set of every existing id except this resource's, for uniqueness checks. */
  otherIds: Set<string>;
  /** How many times this resource is referenced in the document. */
  referenceCount: number;
  onChange: (next: Resource) => void;
  /** Rename: change the resource id (callers update selection + storage). */
  onRename: (oldId: string, next: Resource) => void;
  onDelete: () => void;
  /** Return to the resource list. */
  onBack: () => void;
}

/** Detail view: editable detail for the selected resource, with a back button. */
export function ResourceDetail({
  resource,
  types,
  otherIds,
  referenceCount,
  onChange,
  onRename,
  onDelete,
  onBack,
}: ResourceDetailProps) {
  const labels = useSandboxLabels();
  const type = types.find((t) => t.id === resource.typeId);
  const touch = (partial: Partial<Resource>): Resource => ({
    ...resource,
    ...partial,
    updatedAt: Date.now(),
  });

  // Placement (defaults mirror the engine: top / single column).
  const currentPlacement: ResourcePlacement = resource.placement ?? {};
  const placementPosition: PlacementPosition = currentPlacement.position ?? 'top';
  const placementSpan: PlacementSpan = currentPlacement.span ?? 'column';

  // The id is edited locally and committed (renamed) on blur / Enter so the
  // detail pane is not remounted on every keystroke.
  const [idDraft, setIdDraft] = useState(resource.id);
  const draftSlug = slugify(idDraft);
  const idTaken = draftSlug.length > 0 && otherIds.has(draftSlug);
  const idEmpty = draftSlug.length === 0;
  const suggestedId = slugify(resource.caption ?? '') || `resource-${resource.kind}`;

  const commitId = () => {
    const next = draftSlug || suggestedId;
    setIdDraft(next);
    if (next === resource.id) return;
    if (otherIds.has(next)) return; // keep editing; collision not committed
    onRename(resource.id, { ...resource, id: next, updatedAt: Date.now() });
  };

  const applyBitmap = (r: BitmapUploadResult) => {
    onChange(
      touch({
        kind: 'bitmap',
        bitmap: { fileId: r.fileId, format: r.format, width: r.width, height: r.height },
        svg: undefined,
        table: undefined,
      }),
    );
  };

  const applySvg = (r: SvgUploadResult) => {
    onChange(
      touch({
        kind: 'svg',
        svg: { fileId: r.fileId, width: r.width, height: r.height },
        bitmap: undefined,
        table: undefined,
      }),
    );
  };

  const deleteMessage = (
    <>
      <div style={{ fontWeight: 500, marginBottom: referenceCount > 0 ? 6 : 0 }}>
        {labels.resourceDeleteConfirm.replace('__id__', resource.id)}
      </div>
      {referenceCount > 0 && (
        <div style={{ color: 'var(--slate)', fontSize: 11, lineHeight: '14px' }}>
          {labels.resourceDeleteReferenced
            .replace('__id__', resource.id)
            .replace('__count__', String(referenceCount))}
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3">
      <div className="mb-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onBack}
          aria-label={labels.resourceBack}
          title={labels.resourceBack}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
          style={{ color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span
          className="min-w-0 flex-1 truncate text-xs font-semibold"
          style={{ color: 'var(--foreground)' }}
          title={resource.id}
        >
          {resource.id || labels.resourceUntitled}
        </span>
        <ConfirmPopover message={deleteMessage} onConfirm={onDelete}>
          {({ open }) => (
            <button
              type="button"
              onClick={open}
              aria-label={labels.resourceDelete}
              title={labels.resourceDelete}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
              style={{ color: 'var(--destructive)', background: 'none', border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          )}
        </ConfirmPopover>
      </div>

      <div className="flex flex-col gap-3">
        <Field
          label={labels.idLabel}
          hint={
            idEmpty
              ? labels.resourceIdHintSuggested.replace('__id__', suggestedId)
              : idTaken
                ? labels.resourceIdHintDuplicate
                : undefined
          }
        >
          <input
            type="text"
            value={idDraft}
            onChange={(e) => setIdDraft(e.target.value)}
            onBlur={commitId}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            aria-label={labels.resourceIdAria}
            placeholder={suggestedId}
            className={inputClass}
            style={{
              ...inputStyle,
              borderColor: idEmpty || idTaken ? 'var(--destructive)' : 'var(--rule)',
            }}
          />
        </Field>

        <Field label={labels.resourceTypeFieldLabel}>
          <select
            value={resource.typeId}
            onChange={(e) => onChange(touch({ typeId: e.target.value }))}
            aria-label={labels.resourceTypeFieldAria}
            className={inputClass}
            style={inputStyle}
          >
            {types.length === 0 && <option value="">{labels.resourceNoTypes}</option>}
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label={labels.resourceCaptionLabel}>
          <InlineMarkdownInput
            value={resource.caption ?? ''}
            onChange={(value) => onChange(touch({ caption: value }))}
            ariaLabel={labels.resourceCaptionAria}
            placeholder={labels.resourceCaptionPlaceholder}
            multiline
          />
        </Field>

        <Field label={labels.resourceAltLabel} hint={labels.resourceAltHint}>
          <input
            type="text"
            value={resource.altText ?? ''}
            onChange={(e) => onChange(touch({ altText: e.target.value }))}
            aria-label={labels.resourceAltLabel}
            className={inputClass}
            style={inputStyle}
          />
        </Field>

        {/* Placement: how the resource floats on the page. Referencing the
            resource (`:ref`) is what places it; these control where it lands. */}
        <Field
          label={labels.resourcePlacementLabel}
          hint={
            placementPosition === 'here'
              ? labels.resourcePlacementHintHere
              : placementSpan === 'page'
                ? labels.resourcePlacementHintPage
                : labels.resourcePlacementHintColumn
          }
        >
          <div className="flex gap-1.5">
            <select
              value={placementPosition}
              onChange={(e) =>
                onChange(touch({ placement: { ...currentPlacement, position: e.target.value as PlacementPosition } }))
              }
              aria-label={labels.resourcePositionAria}
              className={inputClass}
              style={inputStyle}
            >
              <option value="top">{labels.resourcePositionTop}</option>
              <option value="bottom">{labels.resourcePositionBottom}</option>
              <option value="here">{labels.resourcePositionHere}</option>
            </select>
            <select
              value={placementSpan}
              onChange={(e) =>
                onChange(touch({ placement: { ...currentPlacement, span: e.target.value as PlacementSpan } }))
              }
              aria-label={labels.resourceWidthAria}
              disabled={placementPosition === 'here'}
              className={inputClass}
              style={{ ...inputStyle, opacity: placementPosition === 'here' ? 0.5 : 1 }}
            >
              <option value="column">{labels.resourceSpanColumn}</option>
              <option value="page">{labels.resourceSpanPage}</option>
            </select>
          </div>
        </Field>

        {/* Kind-specific controls */}
        {resource.kind === 'bitmap' && (
          <Field label={labels.resourceImageLabel}>
            {resource.bitmap && (
              <span style={{ ...labelStyle }} className="mb-1">
                {resource.bitmap.width}×{resource.bitmap.height}px · {resource.bitmap.format}
              </span>
            )}
            <BitmapUploader onUploaded={applyBitmap} compact={!!resource.bitmap} />
          </Field>
        )}
        {resource.kind === 'svg' && (
          <Field label={labels.resourceSvgLabel}>
            <SvgUploader onUploaded={applySvg} compact={!!resource.svg} />
          </Field>
        )}
        {resource.kind === 'table' && (
          <Field label={labels.resourceTableLabel}>
            <TableEditor
              model={resource.table?.model ?? { rows: [] }}
              onModelChange={(model: TableModel) =>
                onChange(touch({ table: { model } }))
              }
            />
          </Field>
        )}

        <div className="mt-1 flex flex-col gap-1">
          <span style={labelStyle}>{labels.previewLabel}</span>
          <ResourcePreview resource={resource} type={type} />
        </div>
      </div>
    </div>
  );
}
