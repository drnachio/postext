'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, Trash2 } from 'lucide-react';
import type {
  Resource,
  ResourceType,
  ResourcePlacement,
  ResourceFloatPosition as PlacementPosition,
  ResourceFloatSpan as PlacementSpan,
} from 'postext';
import { useSandbox, type ResourceFocusTarget } from '../../context/SandboxContext';
import { InlineMarkdownInput, type InlineSelection } from '../../controls/InlineMarkdownInput';
import { ConfirmPopover } from '../ConfirmPopover';
import { ResourcePreview } from './ResourcePreview';
import { BitmapUploader, type BitmapUploadResult } from './BitmapUploader';
import { SvgUploader, type SvgUploadResult } from './SvgUploader';
import { SvgSourceEditor, type SvgSourceCommit } from './SvgSourceEditor';
import { TableEditor, type TableFocusRequest } from './TableEditor/TableEditor';
import { slugify } from './slugify';
import type { TableCellPos, TableModel } from 'postext';

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
  /** Host theme for the embedded SVG source editor. */
  isDark?: boolean;
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
  isDark = true,
}: ResourceDetailProps) {
  const { state, dispatch } = useSandbox();
  const labels = state.labels;
  const type = types.find((t) => t.id === resource.typeId);

  // Preview click → panel: the pending request addressed to this resource is
  // routed to the matching field by its target kind and cleared once applied;
  // every field reports its selection back for the preview highlight.
  const pending = state.pendingResourceFocus?.resourceId === resource.id ? state.pendingResourceFocus : null;
  const captionRequest = pending?.target.kind === 'caption' ? pending : null;
  const noteRequest = pending?.target.kind === 'note' ? pending : null;
  const svgRequest = pending?.target.kind === 'svgText' ? pending : null;
  const cellRequest = useMemo<TableFocusRequest | null>(() => {
    if (!pending || pending.target.kind !== 'cell') return null;
    const { row, col } = pending.target;
    return { row, col, anchor: pending.anchor, head: pending.head, selectWord: pending.selectWord };
  }, [pending]);
  const consumeFocus = useCallback(
    () => dispatch({ type: 'SET_PENDING_RESOURCE_FOCUS', payload: null }),
    [dispatch],
  );
  const reportSelection = useCallback(
    (target: ResourceFocusTarget, sel: InlineSelection | null) => {
      dispatch({
        type: 'SET_RESOURCE_SELECTION',
        payload: sel ? { resourceId: resource.id, target, from: sel.from, to: sel.to, head: sel.head } : null,
      });
    },
    [dispatch, resource.id],
  );
  const onCaptionSelection = useCallback((sel: InlineSelection | null) => reportSelection({ kind: 'caption' }, sel), [reportSelection]);
  const onNoteSelection = useCallback((sel: InlineSelection | null) => reportSelection({ kind: 'note' }, sel), [reportSelection]);
  const onSvgSelection = useCallback((sel: InlineSelection | null) => reportSelection({ kind: 'svgText' }, sel), [reportSelection]);
  const onCellSelection = useCallback(
    (pos: TableCellPos, sel: InlineSelection | null) => reportSelection({ kind: 'cell', row: pos.row, col: pos.col }, sel),
    [reportSelection],
  );
  const touch = (partial: Partial<Resource>): Resource => ({
    ...resource,
    ...partial,
    updatedAt: Date.now(),
  });

  // Placement (defaults mirror the engine: top / single column).
  const currentPlacement: ResourcePlacement = resource.placement ?? {};
  const placementPosition: PlacementPosition = currentPlacement.position ?? 'auto';
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

  // A source edit saved as a new blob: swap the id, keep the declared size
  // unless the source now says otherwise.
  const applySvgSource = useCallback(
    (c: SvgSourceCommit) => {
      onChange(
        touch({
          svg: {
            ...resource.svg,
            fileId: c.fileId,
            width: c.width ?? resource.svg?.width,
            height: c.height ?? resource.svg?.height,
          },
        }),
      );
    },
    // `touch` closes over `resource`, which is already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange, resource],
  );

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
            focusRequest={captionRequest}
            onFocusConsumed={consumeFocus}
            onSelectionChange={onCaptionSelection}
          />
        </Field>

        <Field label={labels.resourceNoteLabel} hint={labels.resourceNoteHint}>
          <InlineMarkdownInput
            value={resource.note ?? ''}
            onChange={(value) => onChange(touch({ note: value.length > 0 ? value : undefined }))}
            ariaLabel={labels.resourceNoteAria}
            placeholder={labels.resourceNotePlaceholder}
            multiline
            focusRequest={noteRequest}
            onFocusConsumed={consumeFocus}
            onSelectionChange={onNoteSelection}
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
              <option value="auto">{labels.resourcePositionAuto}</option>
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
        {resource.kind === 'svg' && resource.svg?.fileId && (
          <div className="flex flex-col gap-0.5">
            <span style={labelStyle}>{labels.svgSourceLabel}</span>
            <SvgSourceEditor
              key={resource.id}
              fileId={resource.svg.fileId}
              isDark={isDark}
              focusRequest={svgRequest}
              onFocusConsumed={consumeFocus}
              onSelectionChange={onSvgSelection}
              onCommit={applySvgSource}
            />
            <span style={{ ...labelStyle, color: 'var(--slate)' }} className="opacity-80">
              {labels.svgSourceHint}
            </span>
          </div>
        )}
        {resource.kind === 'table' && (
          <Field label={labels.resourceTableLabel}>
            <TableEditor
              model={resource.table?.model ?? { rows: [] }}
              onModelChange={(model: TableModel) =>
                onChange(touch({ table: { model } }))
              }
              focusRequest={cellRequest}
              onFocusConsumed={consumeFocus}
              onCellSelectionChange={onCellSelection}
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
