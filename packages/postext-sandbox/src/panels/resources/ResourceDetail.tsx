'use client';

import { ChevronLeft, Trash2 } from 'lucide-react';
import { type Resource, type ResourceFloatPosition as PlacementPosition, type ResourceFloatSpan as PlacementSpan, type ResourcePlacement, resolveBodyTextConfig, type FloatShrinkMode, type TableModel } from 'postext';
import { useSandboxDispatch, useSandboxLabels } from '../../context/SandboxContext.js';
import { InlineMarkdownInput } from '../../controls/inputs/InlineMarkdownInput.js';
import { PanelHeader, IconButton, ConfirmPopover, PanelBody } from '../../ui/index.js';
import { SelectInput, NumberInput, ToggleSwitch, DimensionInput } from '../../controls/index.js';
import { captionSideValue, captionSideOf } from '../../sidebar/settings/captionSide.js';
import { ContourFields } from './marks/ContourFields.js';
import { ResourcePreview } from './ResourcePreview.js';
import { BitmapUploader } from './uploads/BitmapUploader.js';
import { BitmapResolutionField } from './uploads/BitmapResolutionField.js';
import { SvgUploader } from './svg/SvgUploader.js';
import { PdfMasterUploader } from './uploads/PdfMasterUploader.js';
import { SvgFontsField } from './svg/SvgFontsField.js';
import { SafeAreaField } from './marks/SafeAreaEditor.js';
import { applyMarks } from './marks/pictureMarks.js';
import { VideoEditor } from './video/VideoEditor.js';
import { ScoreEditor } from './ScoreEditor.js';
import { SvgSourceEditor } from './svg/SvgSourceEditor.js';
import { TableEditor } from './TableEditor/TableEditor.js';
import { MULTIPLE_COLUMNS_MAX } from '../../sidebar/settings/multipleColumns.js';
import { useFocusRequests } from './ResourceDetail/useFocusRequests.js';
import { usePlacementFields } from './ResourceDetail/usePlacementFields.js';
import { useResourceEdits } from './ResourceDetail/useResourceEdits.js';
import { Field, inputClass, inputStyle, labelStyle } from './ResourceDetail/Field.js';
import type { ResourceDetailProps } from './ResourceDetail/props.js';

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

  const { captionRequest, noteRequest, svgRequest, cellRequest, consumeFocus, onCaptionSelection, onNoteSelection, onSvgSelection, onCellSelection } = useFocusRequests({
    resource, dispatch });
  const touch = (partial: Partial<Resource>): Resource => ({
    ...resource,
    ...partial,
    updatedAt: Date.now(),
  });

  const { currentPlacement, typePlacement, placementPosition, placementSpan, placementRotate, setPlacementKey, placementColumns, severalColumns, layoutWrap,
    bodyLineHeight, placementWrapChoice, placementWrap, placementWidthPercent, placementInline, placementRotated, isPicture, alignApplies, placementShrink,
    placementMinScale, placementCaptionMeasure, placementCitingPage, tableStyles, tableStyleId, setTableStyleId, placementAlign, floatSide, tableDirection,
    tableRtl, setTableDirection } = usePlacementFields({ resource, onChange, labels, type, touch });

  const { idDraft, setIdDraft, idTaken, idEmpty, suggestedId, commitId, applyBitmap, applySvg, applyPdfMaster, applySvgSource } = useResourceEdits({
    resource, otherIds, onChange, onRename, touch });

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
          label={labels.idLabel} tooltip={labels.resourceIdHelp}
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
          {!placementInline && !placementRotated && placementSpan === 'column' && (severalColumns || currentPlacement.columns !== undefined) && (
            <NumberInput
              label={labels.resourceTypePlacementColumns}
              tooltip={labels.resourceTypePlacementColumnsTooltip}
              value={placementColumns}
              onChange={(v) => setPlacementKey('columns', Math.max(1, Math.round(v)))}
              min={1}
              max={MULTIPLE_COLUMNS_MAX}
              step={1}
              isDefault={currentPlacement.columns === undefined}
              onReset={() => setPlacementKey('columns', undefined)}
            />
          )}
          {/* A top or automatic float may head the page (column) where the
              line citing it lands, the text above the reference moving
              down under it (#633). Not for turned or side-column floats. */}
          {!placementInline && !placementRotated && placementPosition !== 'bottom' && placementSpan !== 'side' && (
            <ToggleSwitch
              label={labels.resourceTypePlacementCitingPage}
              tooltip={labels.resourceTypePlacementCitingPageTooltip}
              checked={placementCitingPage}
              onChange={(v) => setPlacementKey('citingPage', v)}
              isDefault={currentPlacement.citingPage === undefined}
              onReset={() => setPlacementKey('citingPage', undefined)}
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
          {/* A column float, and a resource set in the text (#729,
              `layout.inlineCaptionSide`). */}
          {!placementRotated && placementSpan === 'column' && (
            <SelectInput
              variant="segmented"
              label={labels.resourceTypePlacementCaptionSide}
              tooltip={labels.resourceTypePlacementCaptionSideTooltip}
              value={captionSideValue(currentPlacement.captionSide ?? typePlacement.captionSide)}
              options={[
                { value: 'off', label: labels.resourceCaptionSideOff },
                { value: 'margin', label: labels.resourceCaptionSideMargin },
                // Beside the picture inside its slot (#1106): pictures only.
                ...(isPicture || (currentPlacement.captionSide ?? typePlacement.captionSide) === 'inside'
                  ? [{ value: 'inside', label: labels.resourceCaptionSideInside }]
                  : []),
              ]}
              onChange={(v) => setPlacementKey('captionSide', captionSideOf(v))}
              isDefault={currentPlacement.captionSide === undefined}
              onReset={() => setPlacementKey('captionSide', undefined)}
            />
          )}
          {/* Text wrap (#627): an inline resource or a one-column float at
              a side of its column, the text running beside it; its gap. */}
          {!placementRotated && (placementInline || (placementSpan === 'column' && placementColumns <= 1)) && (
            <SelectInput
              variant="segmented"
              label={labels.resourceTypePlacementWrap}
              tooltip={labels.resourceTypePlacementWrapTooltip}
              value={placementWrapChoice}
              options={[
                { value: 'none', label: labels.resourceWrapNone },
                { value: 'left', label: floatSide.left },
                { value: 'right', label: floatSide.right },
                // The picture's own shape (#883), at the side its align names.
                ...(resource.kind === 'bitmap' || resource.kind === 'svg' ? [{ value: 'contour', label: labels.resourceWrapContour }] : []),
              ]}
              onChange={(v) => setPlacementKey('wrap', v === 'left' || v === 'right' || v === 'contour' ? v : 'none')}
              isDefault={currentPlacement.wrap === undefined}
              onReset={() => setPlacementKey('wrap', undefined)}
            />
          )}
          {/* Contour wrap (#883): the shape read from the bitmap's alpha
              channel at a threshold, the margin kept round it. */}
          {!placementRotated && placementWrapChoice === 'contour' && (
            <ContourFields resource={resource} onChange={(contour) => onChange(touch({ contour }))} defaultMargin={currentPlacement.wrapGap ?? typePlacement.wrapGap ?? layoutWrap?.gap ?? resolveBodyTextConfig({ ...(bodyLineHeight ? { lineHeight: bodyLineHeight } : {}) }).lineHeight} />
          )}
          {!placementRotated && placementWrap !== 'none' && (
            <DimensionInput
              label={labels.resourceTypePlacementWrapGap}
              tooltip={labels.resourceTypePlacementWrapGapTooltip}
              value={currentPlacement.wrapGap ?? typePlacement.wrapGap ?? layoutWrap?.gap ?? resolveBodyTextConfig({ ...(bodyLineHeight ? { lineHeight: bodyLineHeight } : {}) }).lineHeight}
              onChange={(v) => setPlacementKey('wrapGap', v)}
              units={['pt', 'mm', 'em']}
              isDefault={currentPlacement.wrapGap === undefined}
              onReset={() => setPlacementKey('wrapGap', undefined)}
            />
          )}
          {/* A floated picture scaled to the room of its slot instead of
              moving on (#626), never below its smallest scale; the caption
              at the slot's measure or the picture's. */}
          {isPicture && !placementInline && !placementRotated && (
            <SelectInput
              stacked
              label={labels.resourceTypePlacementShrink}
              tooltip={labels.resourceTypePlacementShrinkTooltip}
              value={placementShrink}
              options={[
                { value: 'never', label: labels.resourceShrinkNever },
                { value: 'page', label: labels.resourceShrinkPage },
                { value: 'slot', label: labels.resourceShrinkSlot },
              ]}
              onChange={(v) => setPlacementKey('shrink', v as FloatShrinkMode)}
              isDefault={currentPlacement.shrink === undefined}
              onReset={() => setPlacementKey('shrink', undefined)}
            />
          )}
          {isPicture && !placementInline && !placementRotated && placementShrink !== 'never' && (
            <NumberInput
              label={labels.resourceTypePlacementMinScale}
              tooltip={labels.resourceTypePlacementMinScaleTooltip}
              value={Math.round(placementMinScale * 100)}
              onChange={(v) => setPlacementKey('minScale', Math.min(100, Math.max(5, v)) / 100)}
              min={5}
              max={100}
              step={5}
              suffix="%"
              isDefault={currentPlacement.minScale === undefined}
              onReset={() => setPlacementKey('minScale', undefined)}
            />
          )}
          {isPicture && !placementRotated && (
            <SelectInput
              variant="segmented"
              label={labels.resourceTypePlacementCaptionMeasure}
              tooltip={labels.resourceTypePlacementCaptionMeasureTooltip}
              value={placementCaptionMeasure}
              options={[
                { value: 'slot', label: labels.resourceCaptionMeasureSlot },
                { value: 'body', label: labels.resourceCaptionMeasurePicture },
              ]}
              onChange={(v) => setPlacementKey('captionMeasure', v === 'body' ? 'body' : 'slot')}
              isDefault={currentPlacement.captionMeasure === undefined}
              onReset={() => setPlacementKey('captionMeasure', undefined)}
            />
          )}
        </div>

        {/* Kind-specific controls */}
        {resource.kind === 'video' && (
          <VideoEditor resource={resource} onChange={(partial) => onChange(touch(partial))} />
        )}
        {resource.kind === 'score' && (
          <ScoreEditor key={resource.id} resource={resource} onChange={(partial) => onChange(touch(partial))} />
        )}
        {resource.kind === 'bitmap' && (
          <Field label={labels.resourceImageLabel}>
            <BitmapUploader onUploaded={applyBitmap} compact={!!resource.bitmap} />
          </Field>
        )}
        {/* Pixels, file resolution, natural size, effective ppi where it
            is placed, and its own resolution (#631). */}
        {resource.kind === 'bitmap' && resource.bitmap?.fileId && (
          <Field label={labels.resourceBitmapSizeLabel}>
            <BitmapResolutionField bitmap={resource.bitmap} onChange={(bitmap) => onChange(touch({ bitmap }))} />
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
            // Saved marks (anchors, safe area, lettering) are one step of the
            // undo history (#866).
            onChange={(marks) => dispatch({ type: 'UPSERT_RESOURCE', payload: applyMarks(touch({}), marks), history: { merge: false } })}
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
          <SvgFontsField resource={resource} onChange={(svg) => onChange(touch({ svg }))} />
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
