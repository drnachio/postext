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
import { NumberInput, SelectInput, ToggleSwitch } from '../../controls';
import { ResourcePreview } from './ResourcePreview';
import { BitmapUploader, type BitmapUploadResult } from './BitmapUploader';
import { SvgUploader, type SvgUploadResult } from './SvgUploader';
import { PdfMasterUploader } from './PdfMasterUploader';
import { SafeAreaField } from './SafeAreaEditor';
import { VideoEditor } from './VideoEditor';
import { SvgSourceEditor, type SvgSourceCommit } from './SvgSourceEditor';
import { TableEditor, type TableFocusRequest } from './TableEditor/TableEditor';
import { slugify } from './slugify';
import type { TableCellPos, TableModel } from 'postext';
import { flowSideLabels, useRightToLeftFlow } from '../../sidebar/settings/flowSides';

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-2 py-1.5';
const inputStyle = { borderColor: 'var(--pt-control-border)', color: 'var(--foreground)', fontFamily: 'inherit', fontSize: 13, lineHeight: '20px' } as const;
const labelStyle = { color: 'var(--slate)', fontSize: 11, lineHeight: '14px' } as const;

interface FieldProps {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
  hint?: string;
}

function Field({ label, tooltip, children, hint }: FieldProps) {
  return (
    <FieldRow stacked label={label} tooltip={tooltip} hint={hint} className="mb-0">
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

  // Placement, resolved key by key as the engine does: the resource's own
  // value → its type's `defaultPlacement` → the built-in default. Each row
  // shows the effective value; a key the resource sets is marked and resets
  // back to the type's.
  const currentPlacement: ResourcePlacement = resource.placement ?? {};
  const typePlacement: ResourcePlacement = type?.defaultPlacement ?? {};
  const placementPosition: PlacementPosition = currentPlacement.position ?? typePlacement.position ?? 'auto';
  const placementSpan: PlacementSpan = currentPlacement.span ?? typePlacement.span ?? 'column';
  const placementRotate: ResourceRotation | 'none' = currentPlacement.rotate ?? typePlacement.rotate ?? 'none';
  /** Merge one placement key; `undefined` drops it so the resource falls
   *  back to its type's default placement. */
  const setPlacementKey = <K extends keyof ResourcePlacement>(key: K, value: ResourcePlacement[K] | undefined) => {
    const next: ResourcePlacement = { ...currentPlacement };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(touch({ placement: Object.keys(next).length > 0 ? next : undefined }));
  };
  const placementWidthPercent = Math.round((currentPlacement.width ?? typePlacement.width ?? 1) * 100);
  // An inline embed is never turned; a turned resource is a page-span float.
  const placementInline = placementPosition === 'here';
  const placementRotated = !placementInline && placementRotate !== 'none';
  // The alignment places a resource narrower than its slot: one narrowed by
  // Width, or a picture (bitmap or SVG) narrower than the column — smaller
  // than it, or shrunk by `layout.fitFiguresToPage` — at any width.
  const alignApplies = placementWidthPercent < 100 || resource.kind === 'bitmap' || resource.kind === 'svg' || resource.kind === 'video';

  // Named table style (`config.tableStyles`); unset = the document's table style.
  const tableStyles = useSandboxSelector((s) => s.config.tableStyles) ?? [];
  const tableStyleId = resource.table?.styleId;
  const setTableStyleId = (styleId: string | undefined) => {
    const table: NonNullable<Resource['table']> = { ...(resource.table ?? { model: { rows: [] } }) };
    if (styleId) table.styleId = styleId;
    else delete table.styleId;
    onChange(touch({ table }));
  };
  // `start` / `end` are synonyms of left / right for a float (#371).
  const rawAlign = currentPlacement.align ?? typePlacement.align;
  const placementAlign = rawAlign === 'start' ? 'left' : rawAlign === 'end' ? 'right' : rawAlign ?? 'left';
  // In a right-to-left book the body's sides are mirrored: a float's
  // `left` stands on the sheet's right.
  const rtlBook = useRightToLeftFlow();
  const floatSide = flowSideLabels(rtlBook, labels.headerFooterElementAlignLeft, labels.headerFooterElementAlignRight);
  // A table runs with the document unless it names its own direction.
  const tableDirection = resource.table?.direction;
  const tableRtl = tableDirection ? tableDirection === 'rtl' : rtlBook;
  const setTableDirection = (direction: string) => {
    const table: NonNullable<Resource['table']> = { ...(resource.table ?? { model: { rows: [] } }) };
    if (direction === 'ltr' || direction === 'rtl') table.direction = direction;
    else delete table.direction;
    onChange(touch({ table }));
  };

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
        video: undefined,
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
        video: undefined,
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
            <IconButton label={labels.resourceBack} icon={<ChevronLeft size={16} className="rtl:-scale-x-100" />} onClick={onBack} />
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
          label={labels.idLabel} tooltip={labels.styleIdHelp}
          hint={
            idEmpty
              ? labels.resourceIdHintSuggested.replace('__id__', suggestedId)
              : idTaken
                ? labels.resourceIdHintDuplicate
                : undefined
          }
        >
          <input
            dir="ltr"
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

        <Field label={labels.resourceCaptionLabel} hint={labels.resourceCaptionHint}>
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
            dir="auto"
            type="text"
            value={resource.altText ?? ''}
            onChange={(e) => onChange(touch({ altText: e.target.value }))}
            aria-label={labels.resourceAltLabel}
            className={inputClass}
            style={inputStyle}
          />
        </Field>

        {/* Placement: how the resource floats on the page. Referencing the
            resource (`:ref`) is what places it; these control where it lands.
            One row per key; rows that cannot apply are left out. */}
        <div role="group" aria-labelledby={`${resource.id}-placement`} className="@container flex flex-col gap-2">
          <div>
            <div id={`${resource.id}-placement`} className="text-xs leading-[1.3] text-(--slate)">
              {labels.resourcePlacementLabel}
            </div>
            <div className="mt-1 text-[0.66rem] leading-[1.35] text-(--slate)">
              {placementInline
                ? labels.resourcePlacementHintHere
                : placementRotated
                  ? labels.resourcePlacementHintRotated
                  : placementSpan === 'page'
                    ? labels.resourcePlacementHintPage
                    : labels.resourcePlacementHintColumn}
            </div>
          </div>
          <SelectInput
            stacked
            label={labels.resourceTypePlacementPosition}
            value={placementPosition}
            options={[
              { value: 'auto', label: labels.resourcePositionAuto },
              { value: 'top', label: labels.resourcePositionTop },
              { value: 'bottom', label: labels.resourcePositionBottom },
              { value: 'here', label: labels.resourcePositionHere },
            ]}
            onChange={(v) => setPlacementKey('position', v as PlacementPosition)}
            isDefault={currentPlacement.position === undefined}
            onReset={() => setPlacementKey('position', undefined)}
          />
          {!placementInline && (
            <SelectInput
              stacked
              label={labels.resourceTypePlacementRotate}
              tooltip={labels.resourceTypePlacementRotateTooltip}
              value={placementRotate}
              options={[
                { value: 'none', label: labels.resourceRotateNone },
                { value: 'ccw', label: labels.resourceRotateCcw },
                { value: 'cw', label: labels.resourceRotateCw },
              ]}
              onChange={(v) => setPlacementKey('rotate', v === 'ccw' || v === 'cw' ? v : undefined)}
              isDefault={currentPlacement.rotate === undefined}
              onReset={() => setPlacementKey('rotate', undefined)}
            />
          )}
          {!placementInline && !placementRotated && (
            <SelectInput
              stacked
              label={labels.resourceTypePlacementSpan}
              tooltip={labels.resourceTypePlacementSpanTooltip}
              value={placementSpan}
              options={[
                { value: 'column', label: labels.resourceSpanColumn },
                { value: 'page', label: labels.resourceSpanPage },
                { value: 'side', label: labels.resourceSpanSide },
              ]}
              onChange={(v) => setPlacementKey('span', v as PlacementSpan)}
              isDefault={currentPlacement.span === undefined}
              onReset={() => setPlacementKey('span', undefined)}
            />
          )}
          {/* Width fraction and alignment of a resource narrower than its
              slot (floats and inline embeds alike; a picture narrower than
              the column follows the alignment at full width too), and the
              caption beside a column float (side column of a
              column-and-a-half layout). */}
          {!placementRotated && (
            <NumberInput
              label={labels.resourceTypePlacementWidth}
              tooltip={labels.resourceTypePlacementWidthTooltip}
              value={placementWidthPercent}
              onChange={(v) => setPlacementKey('width', Math.min(100, Math.max(1, v)) / 100)}
              min={10}
              max={100}
              step={5}
              suffix="%"
              isDefault={currentPlacement.width === undefined}
              onReset={() => setPlacementKey('width', undefined)}
            />
          )}
          {!placementRotated && alignApplies && (
            <SelectInput
              variant="segmented"
              label={labels.resourceTypePlacementAlign}
              tooltip={labels.resourceTypePlacementAlignTooltip}
              value={placementAlign}
              options={[
                { value: 'left', label: floatSide.left },
                { value: 'center', label: labels.headerFooterElementAlignCenter },
                { value: 'right', label: floatSide.right },
              ]}
              onChange={(v) => setPlacementKey('align', v as ResourcePlacement['align'])}
              isDefault={currentPlacement.align === undefined}
              onReset={() => setPlacementKey('align', undefined)}
            />
          )}
          {!placementInline && !placementRotated && placementSpan === 'column' && (
            <ToggleSwitch
              label={labels.resourceTypePlacementCaptionSide}
              tooltip={labels.resourceTypePlacementCaptionSideTooltip}
              checked={currentPlacement.captionSide ?? typePlacement.captionSide ?? false}
              onChange={(v) => setPlacementKey('captionSide', v)}
              isDefault={currentPlacement.captionSide === undefined}
              onReset={() => setPlacementKey('captionSide', undefined)}
            />
          )}
        </div>

        {/* Kind-specific controls */}
        {resource.kind === 'video' && (
          <VideoEditor resource={resource} onChange={(partial) => onChange(touch(partial))} />
        )}
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
        {((resource.kind === 'bitmap' && resource.bitmap?.fileId) || (resource.kind === 'svg' && resource.svg?.fileId) || (resource.kind === 'video' && resource.video?.poster?.fileId)) && (
          <SafeAreaField
            resource={resource}
            onChange={(safeArea) => {
              const next = touch({});
              if (safeArea) next.safeArea = safeArea;
              else delete next.safeArea;
              onChange(next);
            }}
          />
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
          <Field label={labels.resourceTableDirectionLabel} hint={labels.resourceTableDirectionHint}>
            <select
              value={tableDirection ?? ''}
              onChange={(e) => setTableDirection(e.target.value)}
              aria-label={labels.resourceTableDirectionLabel}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">{labels.resourceTableDirectionDocument}</option>
              <option value="ltr">{labels.documentDirectionLtr}</option>
              <option value="rtl">{labels.documentDirectionRtl}</option>
            </select>
          </Field>
        )}
        {resource.kind === 'table' && (
          <Field label={labels.resourceTableLabel}>
            <TableEditor
              direction={tableRtl ? 'rtl' : 'ltr'}
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
