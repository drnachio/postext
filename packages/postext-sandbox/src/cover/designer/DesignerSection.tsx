'use client';

/**
 * The designer's side of the Cover panel (#1669): the switch that puts
 * the designer on the sheet, the layers of the design (a list the keyboard
 * reaches: each item selects, moves back or forward, or goes), what can be
 * added, and the selected item's fields. Everything is written into the
 * design's `cover` part, one undo step at a time.
 */

import { ArrowDown, ArrowUp, Box, Image as ImageIcon, LayoutGrid, PenTool, Sparkles, Stamp, Trash2, Type } from 'lucide-react';
import type { CoverFinishProcess } from 'postext/production';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import { SelectInput, ToggleSwitch } from '../../controls/index.js';
import { Button, IconButton, cn } from '../../ui/index.js';
import { setCoverDesigner, useCoverDesigner, useCoverState } from '../coverStore.js';
import { useEditedDesign } from '../useEditedDesign.js';
import { addCatalogue, addElement, addFinish, addTextBox, designerItems, LAYERS, removeItem, reorderItem, sameRef, type Added, type DesignerLayer } from './designerModel.js';
import { ItemFields } from './ItemFields.js';
import { LAYER_LABEL, kindLabel } from './designerLabels.js';

const INK = { hex: '#1f3a5f', model: 'hex' as const };
const VEIL = { hex: '#000000', model: 'hex' as const };

export function DesignerSection() {
  const labels = useSandboxLabels();
  const { design: cover, write: writeDesign } = useEditedDesign();
  const resources = useSandboxSelector((s) => s.resources);
  const titles = useSandboxSelector((s) => s.config.production?.collection?.catalogue?.length ?? 0);
  const { open, selected } = useCoverDesigner();
  const { built } = useCoverState();
  const sheet = built?.sheet;
  const items = sheet ? designerItems(cover, sheet) : [];
  const pictures = resources.filter((r) => (r.kind === 'bitmap' && r.bitmap) || (r.kind === 'svg' && r.svg));
  const write = (next: typeof cover) => writeDesign(next, { merge: false });
  const added = ({ cover: next, ref }: Added) => {
    write(next);
    setCoverDesigner({ open: true, selected: ref });
  };
  const aspectOf = (id: string) => {
    const r = resources.find((x) => x.id === id);
    const size = r?.kind === 'bitmap' ? r.bitmap : r?.kind === 'svg' ? r.svg : undefined;
    return size?.width && size.height ? size.height / size.width : 1;
  };
  const finish = (process: CoverFinishProcess) => sheet && added(addFinish(cover, sheet, process, selected && selected.layer !== 'finishes' && selected.layer !== 'textBoxes' ? selected : undefined));

  return (
    <div className="flex flex-col pb-2">
      <ToggleSwitch label={labels.coverDesignerOn} tooltip={labels.coverDesignerKeys} checked={open} onChange={(on) => setCoverDesigner({ open: on, ...(on ? {} : { selected: null }) })} />
      {sheet && (
        <>
          <div className="flex flex-wrap gap-2 px-3 py-2">
            <Button variant="outline" size="sm" icon={<Type size={13} />} onClick={() => added(addTextBox(cover, sheet))}>{labels.coverAddTextBox}</Button>
            <Button variant="outline" size="sm" icon={<Box size={13} />} onClick={() => added(addElement(cover, sheet, 'elements', { color: INK }))}>{labels.coverAddBox}</Button>
            <Button variant="outline" size="sm" icon={<Sparkles size={13} />} onClick={() => added(addElement(cover, sheet, 'effects', { color: VEIL }))}>{labels.coverAddVeil}</Button>
            <Button variant="outline" size="sm" icon={<LayoutGrid size={13} />} title={labels.coverAddCatalogueTooltip} onClick={() => added(addCatalogue(cover, sheet, titles))}>{labels.coverAddCatalogue}</Button>
          </div>
          {pictures.length > 0 && (
            <div className="flex flex-col">
              <SelectInput
                label={labels.coverAddPicture}
                value=""
                options={[{ value: '', label: '—' }, ...pictures.map((r) => ({ value: r.id, label: r.id }))]}
                onChange={(id) => id && added(addElement(cover, sheet, 'elements', { resourceId: id, aspect: aspectOf(id) }))}
              />
              <SelectInput
                label={labels.coverAddLogo}
                value=""
                options={[{ value: '', label: '—' }, ...pictures.map((r) => ({ value: r.id, label: r.id }))]}
                onChange={(id) => id && added(addElement(cover, sheet, 'logos', { resourceId: id, aspect: aspectOf(id) }))}
              />
            </div>
          )}
          <SelectInput
            label={labels.coverAddFinish}
            tooltip={labels.coverAddFinishTooltip}
            value=""
            options={[
              { value: '', label: '—' },
              { value: 'varnish', label: labels.coverFinishVarnish },
              { value: 'foil', label: labels.coverFinishFoil },
              { value: 'emboss', label: labels.coverFinishEmboss },
              { value: 'deboss', label: labels.coverFinishDeboss },
            ]}
            onChange={(p) => p && finish(p as CoverFinishProcess)}
          />
          <h3 className="mt-2 px-3 text-xs font-semibold text-(--slate)">{labels.coverLayers}</h3>
          {items.length === 0 ? (
            <p className="px-3 py-1 text-xs text-(--slate)">{labels.coverLayersEmpty}</p>
          ) : (
            LAYERS.map((layer: DesignerLayer) => {
              const inLayer = items.filter((i) => i.layer === layer);
              if (inLayer.length === 0) return null;
              return (
                <section key={layer} aria-label={String(labels[LAYER_LABEL[layer]])} className="px-2">
                  <p className="m-0 px-1 pt-1 text-[11px] uppercase tracking-wide text-(--slate)">{String(labels[LAYER_LABEL[layer]])}</p>
                  <ul className="m-0 flex list-none flex-col p-0">
                    {[...inLayer].reverse().map((i) => {
                      const on = sameRef(i, selected);
                      return (
                        <li key={i.id} className={cn('flex items-center gap-1 rounded', on && 'bg-(--surface)')}>
                          <button
                            type="button"
                            aria-pressed={on}
                            onClick={() => setCoverDesigner({ open: true, selected: on ? null : { layer: i.layer, id: i.id } })}
                            className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 px-1 text-start text-xs outline-(--brand) focus-visible:outline-2"
                          >
                            {i.layer === 'textBoxes' ? <Type size={13} aria-hidden="true" /> : i.layer === 'finishes' ? <Stamp size={13} aria-hidden="true" /> : i.kind === 'image' ? <ImageIcon size={13} aria-hidden="true" /> : i.kind === 'shape' ? <PenTool size={13} aria-hidden="true" /> : i.kind === 'catalogue' ? <LayoutGrid size={13} aria-hidden="true" /> : <Box size={13} aria-hidden="true" />}
                            <span className="truncate">{i.id}</span>
                            <span className="text-(--slate)">{kindLabel(labels, i)}</span>
                          </button>
                          <IconButton label={labels.coverItemBackward} icon={<ArrowDown size={13} />} onClick={() => write(reorderItem(cover, i, -1))} />
                          <IconButton label={labels.coverItemForward} icon={<ArrowUp size={13} />} onClick={() => write(reorderItem(cover, i, 1))} />
                          <IconButton label={labels.coverItemDelete} icon={<Trash2 size={13} />} destructive onClick={() => { write(removeItem(cover, i)); if (on) setCoverDesigner({ selected: null }); }} />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
          {selected && <ItemFields sheet={sheet} refItem={selected} />}
        </>
      )}
    </div>
  );
}
