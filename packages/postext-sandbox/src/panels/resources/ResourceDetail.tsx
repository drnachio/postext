'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, Trash2 } from 'lucide-react';
import type {
  Resource,
  ResourceType,
  ResourcePlacement,
  ResourceFloatPosition as PlacementPosition,
  ResourceFloatSpan as PlacementSpan,
  ResourceRotation,
} from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector, type ResourceFocusTarget } from '../../context/SandboxContext';
import { InlineMarkdownInput, type InlineSelection } from '../../controls/InlineMarkdownInput';
import { ConfirmPopover, IconButton, PanelBody, PanelHeader } from '../../ui';
import { FieldRow } from '../../controls/FieldRow';
import { ResourcePreview } from './ResourcePreview';
import { BitmapUploader, type BitmapUploadResult } from './BitmapUploader';
import { SvgUploader, type SvgUploadResult } from './SvgUploader';
import { PdfMasterUploader } from './PdfMasterUploader';
import { SvgSourceEditor, type SvgSourceCommit } from './SvgSourceEditor';
import { TableEditor, type TableFocusRequest } from './TableEditor/TableEditor';
import { slugify } from './slugify';
import type { TableCellPos, TableModel } from 'postext';

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-2 py-1.5';
const inputStyle = { borderColor: 'var(--rule)', color: 'var(--foreground)', fontFamily: 'inherit', fontSize: 13, lineHeight: '20px' } as const;
const labelStyle = { color: 'var(--slate)', fontSize: 11, lineHeight: '14px' } as const;

interface FieldProps {
  label: string;
  children: React.ReactNode;
  hint?: string;
}

function Field({ label, children, hint }: FieldProps) {
  return (
    <FieldRow stacked label={label} hint={hint} className="mb-0">
      {children}
    </FieldRow>
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
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const type = types.find((t) => t.id === resource.typeId);

  // Preview click → panel: the pending request addressed to this resource is
  // routed to the matching field by its target kind and cleared once applied;
  // every field reports its selection back for the preview highlight. Read
  // through a selector so unrelated state changes leave this pane alone.
  const pending = useSandboxSelector((s) => (s.pendingResourceFocus?.resourceId === resource.id ? s.pendingResourceFocus : null));
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
  const placementRotate: ResourceRotation | 'none' = currentPlacement.rotate ?? 'none';
  const setRotate = (value: string) => {
    const next: ResourcePlacement = { ...currentPlacement };
    if (value === 'ccw' || value === 'cw') next.rotate = value;
    else delete next.rotate;
    onChange(touch({ placement: next }));
  };
  /** Merge one placement key; `undefined` drops it so the resource falls
   *  back to its type's default placement. */
  const setPlacementKey = <K extends keyof ResourcePlacement>(key: K, value: ResourcePlacement[K] | undefined) => {
    const next: ResourcePlacement = { ...currentPlacement };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(touch({ placement: next }));
  };
  const placementWidthPercent = Math.round((currentPlacement.width ?? 1) * 100);

  // Named table style (`config.tableStyles`); unset = the document's table style.
  const tableStyles = useSandboxSelector((s) => s.config.tableStyles) ?? [];
  const tableStyleId = resource.table?.styleId;
  const setTableStyleId = (styleId: string | undefined) => {
    const table: NonNullable<Resource['table']> = { ...(resource.table ?? { model: { rows: [] } }) };
    if (styleId) table.styleId = styleId;
    else delete table.styleId;
    onChange(touch({ table }));
  };
  const placementAlign = currentPlacement.align ?? 'left';

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
        // A replaced SVG keeps its print master: the master is the
        // publisher's original and outlives screen-side re-exports.
        svg: { fileId: r.fileId, width: r.width, height: r.height, pdfFileId: resource.svg?.pdfFileId },
        bitmap: undefined,
        table: undefined,
      }),
    );
  };

  const applyPdfMaster = (pdfFileId: string | undefined) => {
    if (!resource.svg) return;
    onChange(touch({ svg: { ...resource.svg, pdfFileId } }));
  };

  // A source edit saved as a new blob: swap the id, keep the declared size
  // unless the source now says otherwise. The print master (if any) was made
  // for the source as it was, so it is detached: the PDF export follows the
  // edited SVG from here on instead of silently printing the old figure.
  const applySvgSource = useCallback(
    (c: SvgSourceCommit) => {
      onChange(
        touch({
          svg: {
            ...resource.svg,
            fileId: c.fileId,
            width: c.width ?? resource.svg?.width,
            height: c.height ?? resource.svg?.height,
            pdfFileId: undefined,
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
    <div className="flex h-full flex-col">
      <PanelHeader
        title={
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <IconButton label={labels.resourceBack} icon={<ChevronLeft size={16} />} onClick={onBack} />
            <span className="min-w-0 flex-1 truncate" title={resource.id}>
              {resource.id || labels.resourceUntitled}
            </span>
          </div>
        }
        actions={
          <ConfirmPopover message={deleteMessage} onConfirm={onDelete}>
            {({ open }) => (
              <IconButton label={labels.resourceDelete} icon={<Trash2 size={14} />} destructive onClick={open} />
            )}
          </ConfirmPopover>
        }
      />
      <PanelBody padded>
      <div className="flex flex-col gap-4">
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
              : placementRotate !== 'none'
                ? labels.resourcePlacementHintRotated
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
              disabled={placementPosition === 'here' || placementRotate !== 'none'}
              className={inputClass}
              style={{ ...inputStyle, opacity: placementPosition === 'here' || placementRotate !== 'none' ? 0.5 : 1 }}
            >
              <option value="column">{labels.resourceSpanColumn}</option>
              <option value="page">{labels.resourceSpanPage}</option>
              <option value="side">{labels.resourceSpanSide}</option>
            </select>
          </div>
          {/* Orientation: a turned resource is always a page-span float on
              a page of its own. */}
          <select
            value={placementRotate}
            onChange={(e) => setRotate(e.target.value)}
            aria-label={labels.resourceRotateAria}
            disabled={placementPosition === 'here'}
            className={`${inputClass} mt-1.5`}
            style={{ ...inputStyle, opacity: placementPosition === 'here' ? 0.5 : 1 }}
          >
            <option value="none">{labels.resourceRotateNone}</option>
            <option value="ccw">{labels.resourceRotateCcw}</option>
            <option value="cw">{labels.resourceRotateCw}</option>
          </select>
          {/* Width fraction, alignment of a narrower float and the caption
              beside the figure (side column of a column-and-a-half layout). */}
          {placementPosition !== 'here' && placementRotate === 'none' && (
            <div className="mt-1.5 flex flex-col gap-1.5">
              <div className="flex gap-1.5">
                <select
                  value={String(placementWidthPercent)}
                  onChange={(e) => {
                    const pct = Number(e.target.value);
                    setPlacementKey('width', pct >= 100 ? undefined : pct / 100);
                  }}
                  aria-label={labels.resourceTypePlacementWidth}
                  title={labels.resourceTypePlacementWidthTooltip}
                  className={inputClass}
                  style={inputStyle}
                >
                  {[100, 90, 80, 75, 70, 66, 60, 50, 40, 33, 30, 25].map((pct) => (
                    <option key={pct} value={String(pct)}>
                      {labels.resourceTypePlacementWidth} {pct}%
                    </option>
                  ))}
                  {![100, 90, 80, 75, 70, 66, 60, 50, 40, 33, 30, 25].includes(placementWidthPercent) && (
                    <option value={String(placementWidthPercent)}>
                      {labels.resourceTypePlacementWidth} {placementWidthPercent}%
                    </option>
                  )}
                </select>
                <select
                  value={placementAlign}
                  onChange={(e) => setPlacementKey('align', e.target.value === 'left' ? undefined : (e.target.value as ResourcePlacement['align']))}
                  aria-label={labels.resourceTypePlacementAlign}
                  title={labels.resourceTypePlacementAlignTooltip}
                  disabled={placementWidthPercent >= 100}
                  className={inputClass}
                  style={{ ...inputStyle, opacity: placementWidthPercent >= 100 ? 0.5 : 1 }}
                >
                  <option value="left">{labels.headerFooterElementAlignLeft}</option>
                  <option value="center">{labels.headerFooterElementAlignCenter}</option>
                  <option value="right">{labels.headerFooterElementAlignRight}</option>
                </select>
              </div>
              {placementSpan === 'column' && (
                <label className="flex cursor-pointer items-center gap-2 text-xs" style={{ color: 'var(--foreground)' }} title={labels.resourceTypePlacementCaptionSideTooltip}>
                  <input
                    type="checkbox"
                    checked={currentPlacement.captionSide ?? false}
                    onChange={(e) => setPlacementKey('captionSide', e.target.checked ? true : undefined)}
                    aria-label={labels.resourceTypePlacementCaptionSide}
                  />
                  {labels.resourceTypePlacementCaptionSide}
                </label>
              )}
            </div>
          )}
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
          <Field label={labels.resourcePdfMasterLabel} hint={labels.resourcePdfMasterHint}>
            <PdfMasterUploader
              key={resource.id}
              fileId={resource.svg.pdfFileId}
              onAttached={applyPdfMaster}
              onRemoved={() => applyPdfMaster(undefined)}
            />
          </Field>
        )}
        {resource.kind === 'svg' && resource.svg?.fileId && (
          <SvgSourceEditor
            key={resource.id}
            fileId={resource.svg.fileId}
            isDark={isDark}
            focusRequest={svgRequest}
            onFocusConsumed={consumeFocus}
            onSelectionChange={onSvgSelection}
            onCommit={applySvgSource}
          />
        )}
        {resource.kind === 'table' && (
          <Field label={labels.resourceTableStyleLabel} hint={labels.resourceTableStyleHint}>
            <select
              value={tableStyleId ?? ''}
              onChange={(e) => setTableStyleId(e.target.value || undefined)}
              aria-label={labels.resourceTableStyleLabel}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">{labels.resourceTableStyleDefault}</option>
              {tableStyles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.id}
                </option>
              ))}
              {tableStyleId && !tableStyles.some((s) => s.id === tableStyleId) && (
                <option value={tableStyleId}>{labels.resourceTableStyleMissing.replace('__id__', tableStyleId)}</option>
              )}
            </select>
          </Field>
        )}
        {resource.kind === 'table' && (
          <Field label={labels.resourceTableLabel}>
            <TableEditor
              model={resource.table?.model ?? { rows: [] }}
              onModelChange={(model: TableModel) =>
                onChange(touch({ table: { ...resource.table, model } }))
              }
              focusRequest={cellRequest}
              onFocusConsumed={consumeFocus}
              onCellSelectionChange={onCellSelection}
            />
          </Field>
        )}

        <div className="mt-2 flex flex-col gap-1.5">
          <span style={labelStyle}>{labels.previewLabel}</span>
          <ResourcePreview resource={resource} type={type} />
        </div>
      </div>
      </PanelBody>
    </div>
  );
}
