'use client';

// The selected item's fields: its box in millimetres on the sheet, and
// what its kind has — a text box's turn and alignment, a box's colour and
// opacity, a picture's fit, a logo's clear space, a finish's process and
// ink.

import type { ColorValue } from 'postext';
import type { CoverElement, CoverFinish, CoverLogo, CoverTextFrame, ProductionSheet, SheetRect } from 'postext/production';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { useEditedDesign } from '../useEditedDesign.js';
import { ColorPicker, NumberInput, SelectInput } from '../../controls/index.js';
import { CatalogueFields } from './CatalogueFields.js';
import { ElementExtras } from './ElementExtras.js';
import { TextBoxName } from './TextBoxName.js';
import { designerItems, itemOf, patchItem, placeItem, sameRef, type ItemRef } from './designerModel.js';

const INK: ColorValue = { hex: '#1f3a5f', model: 'hex' };
const r1 = (v: number) => Math.round(v * 10) / 10;

export function ItemFields({ sheet, refItem }: { sheet: ProductionSheet; refItem: ItemRef }) {
  const labels = useSandboxLabels();
  const { design: cover, write: writeDesign } = useEditedDesign();
  const item = itemOf(cover, refItem);
  const rect = designerItems(cover, sheet).find((i) => sameRef(i, refItem))?.rect;
  if (!item) return null;
  const write = (next: typeof cover) => writeDesign(next);
  const patch = (p: Record<string, unknown>) => write(patchItem(cover, refItem, p));
  const box = (p: Partial<SheetRect>) => rect && write(placeItem(cover, sheet, refItem, { ...rect, ...p }));
  const maxW = sheet.width;
  const maxH = sheet.height;

  return (
    <div className="mt-2 flex flex-col border-t border-(--rule) pt-1" role="group" aria-label={labels.coverItemFields.replace('__id__', refItem.id)}>
      <p className="m-0 px-3 py-1 text-xs font-semibold">{labels.coverItemFields.replace('__id__', refItem.id)}</p>
      {rect && (
        <>
          <NumberInput label={labels.coverItemX} value={r1(rect.x)} min={0} max={maxW} step={0.5} suffix="mm" onChange={(x) => box({ x })} />
          <NumberInput label={labels.coverItemY} value={r1(rect.y)} min={0} max={maxH} step={0.5} suffix="mm" onChange={(y) => box({ y })} />
          <NumberInput label={labels.coverItemWidth} value={r1(rect.width)} min={1} max={maxW} step={0.5} suffix="mm" onChange={(width) => box({ width })} />
          <NumberInput label={labels.coverItemHeight} value={r1(rect.height)} min={1} max={maxH} step={0.5} suffix="mm" onChange={(height) => box({ height })} />
        </>
      )}
      {refItem.layer === 'textBoxes' && (() => {
        const t = item as CoverTextFrame;
        return (
          <>
            <TextBoxName name={t.name} sheet={sheet} />
            <SelectInput
              label={labels.coverTextTurn}
              value={String(t.rotate ?? 0)}
              variant="segmented"
              options={[{ value: '0', label: labels.coverTextTurnNone }, { value: '-90', label: labels.coverSpineUp }, { value: '90', label: labels.coverSpineDown }]}
              onChange={(v) => patch({ rotate: v === '0' ? undefined : Number(v) })}
            />
            <SelectInput
              label={labels.coverDesignAlign.replace('__zone__', t.name)}
              value={t.verticalAlign ?? 'top'}
              variant="segmented"
              options={[{ value: 'top', label: labels.coverDesignAlignTop }, { value: 'middle', label: labels.coverDesignAlignMiddle }, { value: 'bottom', label: labels.coverDesignAlignBottom }]}
              onChange={(v) => patch({ verticalAlign: v === 'top' ? undefined : v })}
            />
            <p className="px-3 py-1 text-xs text-(--slate)">{labels.coverTextBoxHint}</p>
          </>
        );
      })()}
      {(refItem.layer === 'elements' || refItem.layer === 'effects' || refItem.layer === 'logos') && (() => {
        const e = item as CoverElement;
        return (
          <>
            {(e.kind === 'box' || e.kind === 'shape') && (
              <ColorPicker label={labels.coverItemColor} value={e.color ?? INK} onChange={(color) => patch({ color })} fieldId={`cover-item-color-${e.id}`} />
            )}
            <NumberInput label={labels.coverItemOpacity} value={Math.round((e.opacity ?? 1) * 100)} min={0} max={100} step={5} suffix="%" onChange={(v) => patch({ opacity: v === 100 ? undefined : v / 100 })} />
            {e.kind === 'image' && (
              <SelectInput
                label={labels.coverItemFit}
                value={e.fit ?? 'contain'}
                variant="segmented"
                options={[{ value: 'contain', label: labels.coverItemFitContain }, { value: 'cover', label: labels.coverItemFitCover }]}
                onChange={(v) => patch({ fit: v === 'cover' ? 'cover' : undefined })}
              />
            )}
            {e.kind === 'catalogue' && <CatalogueFields e={e} patch={patch} />}
            {refItem.layer === 'logos' && (
              <NumberInput label={labels.coverItemClearance} tooltip={labels.coverItemClearanceTooltip} value={(e as CoverLogo).clearance ?? 0} min={0} max={30} step={0.5} suffix="mm" onChange={(clearance) => patch({ clearance })} />
            )}
            <ElementExtras e={e} sheet={sheet} patch={patch} />
          </>
        );
      })()}
      {refItem.layer === 'finishes' && (() => {
        const f = item as CoverFinish;
        const inked = f.process === 'varnish' || f.process === 'foil';
        return (
          <>
            <SelectInput
              label={labels.coverFinishProcess}
              value={f.process}
              options={[
                { value: 'varnish', label: labels.coverFinishVarnish },
                { value: 'foil', label: labels.coverFinishFoil },
                { value: 'emboss', label: labels.coverFinishEmboss },
                { value: 'deboss', label: labels.coverFinishDeboss },
              ]}
              onChange={(process) => patch({ process })}
            />
            {inked && <ColorPicker label={labels.coverFinishInk} value={f.ink ?? INK} onChange={(ink) => patch({ ink })} onReset={() => patch({ ink: undefined })} isDefault={f.ink === undefined} fieldId={`cover-finish-ink-${f.id}`} />}
            {inked && (
              <SelectInput
                label={labels.coverFinishSheen}
                value={f.sheen ?? 'gloss'}
                options={[{ value: 'gloss', label: labels.coverSheenGloss }, { value: 'satin', label: labels.coverSheenSatin }, { value: 'matte', label: labels.coverSheenMatte }, { value: 'softTouch', label: labels.coverSheenSoftTouch }]}
                onChange={(v) => patch({ sheen: v === 'gloss' ? undefined : v })}
              />
            )}
            {!inked && <p className="px-3 py-1 text-xs text-(--slate)">{labels.coverFinishPlateHint}</p>}
            {'element' in f.shape && <p className="px-3 py-1 text-xs text-(--slate)">{labels.coverFinishOnItem.replace('__id__', f.shape.element)}</p>}
          </>
        );
      })()}
    </div>
  );
}
