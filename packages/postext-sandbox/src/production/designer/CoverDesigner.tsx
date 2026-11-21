'use client';

/**
 * The cover designer: the cover of the book's active version on a canvas
 * of its own, over the whole Sandbox. It opens on the preview — the sheet
 * as it will print, its guides and what to check before it goes to the
 * printer — and from there to editing, and back. Editing works in fixed
 * layers, bottom to top (./coverLayers.ts): the background, the movable
 * elements, the editable texts, the effects, the logos and the finishes.
 * Each layer can be hidden while working; one is open at a time (the
 * background with the cover's look, an item layer to edit). The canvas
 * picks and moves the items of every shown layer: picking one opens its
 * layer. It is opened from the Cover panel and from the
 * book's preview (./coverDesignerStore.ts). It has its own undo, and
 * copies, cuts, pastes and duplicates items (./coverEditing.ts), by the
 * usual keys while no text box has the focus.
 */

import { useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { ChevronRight, Eye, EyeOff, Image as ImageIcon, PenTool, Sparkles, Square, Stamp, Type } from 'lucide-react';
import { COVER_FINISH_INKS, resolveBodyTextConfig, resolveColorValue, type CoverFinishKind, type CoverZoneName, type Resource } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import { Button, IconButton, Select, cn, usePortalContainer } from '../../ui/index.js';
import { POPUP_Z_INDEX } from '../../ui/layout/surface.js';
import { fill } from '../../print/fillTokens.js';
import { bookTrimMm, coverDocumentInput, pickSheet, type CoverDesignSettings } from '../model/bookProduction.js';
import { PASTE_OFFSET_MM, copiedCoverItem, copyCoverItem, duplicateCoverItem, setCopiedCoverItem, type CoverItem } from './coverEditing.js';
import {
  newBasicShape,
  newShape,
  COVER_LAYERS,
  FINISH_KINDS,
  elementAt,
  elementRect,
  finishAsElement,
  finishFromElement,
  newElement,
  newFinish,
  newLogo,
  pictureAspect,
  restack,
  type CoverElementSetting,
  type CoverFinishSetting,
  type CoverLayer,
  type CoverLogoSetting,
  type ItemLayer,
} from '../model/coverLayers.js';
import { CoverCanvas } from '../canvas/CoverCanvas.js';
import { DesignSection, bookFamilies } from '../CoverDesignSections.js';
import { coverFields, fieldsIn, newTextBox, textBoxAsElement, textBoxesOf, textBoxFromElement, type CoverTextBox } from '../model/coverTexts.js';
import { CoverChecksList } from '../CoverChecksList.js';
import { coverChecks, overflowZones, type CoverCheck } from '../model/coverChecks.js';
import { outlineAsPath } from '../canvas/pathEditing.js';
import { galleryPictureOf, galleryPicturesFrom, galleryResource, galleryResourceId } from '../library/coverGallery.js';
import { maskedPicture } from './coverMasks.js';
import { pictureSize } from '../library/coverImages.js';
import { readPictureFile } from '../library/printFiles.js';
import { announce } from '../../ui/announcer.js';
import { closeCoverDesigner, useCoverDesignerOpen } from '../store/coverDesignerStore.js';
import { DEFAULT_LOGO_CLEARANCE, logoResourceId } from '../library/logoLibrary.js';
import { useCoverGallery, useCoverWorkspace, useLogos, useMirror } from '../store/useProduction.js';
import { LAYER_LABEL, LAYER_HINT, FINISH_LABEL, ZONE_LABEL, fieldLabel } from './designerLabels.js';
import { aspectOf, PictureAdder, GalleryUpload, ShapeAdder, TraceAdder, LogoAdder, TextAdder } from './adders.js';
import { useDesignerHistory, useDesignerKeys } from './useDesignerHistory.js';
import { DesignerHeader } from './DesignerHeader.js';
import { TextBoxProperties } from './TextBoxProperties.js';
import { ElementProperties, FinishProperties } from './ItemProperties.js';

const SIDE = 'flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-(--rule) p-3 text-xs';
const isPicture = (r: Resource) => r.kind === 'bitmap' || r.kind === 'svg';
const isItemLayer = (l: CoverLayer): l is ItemLayer => l === 'elements' || l === 'texts' || l === 'effects' || l === 'logos' || l === 'finishes';
export function CoverDesignerHost() {
  return useCoverDesignerOpen() ? <CoverDesigner /> : null;
}
function CoverDesigner() {
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const bookResources = useSandboxSelector((s) => s.resources);
  const container = usePortalContainer();
  const { record, update: saveRecord, version, sheets } = useCoverWorkspace();
  const library = useLogos();
  const [gallery, saveGallery] = useCoverGallery();
  // The designer's undo: the design and the gallery as they were before
  // each change (./useDesignerHistory.ts).
  const { history, update, updateGallery, travel } = useDesignerHistory(record, saveRecord, gallery, saveGallery);
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [hidden, setHidden] = useState<ReadonlySet<CoverLayer>>(new Set());
  const [active, setActive] = useState<ItemLayer>('elements');
  const [open, setOpen] = useState<CoverLayer>('elements');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Editing the selected shape's points instead of its box; picking
  // another item leaves it.
  const [points, setPoints] = useState(false);
  const selected = selectedId;
  const setSelected = (id: string | null) => {
    if (id !== selectedId) setPoints(false);
    setSelectedId(id);
  };

  const design = useMemo(() => record?.design ?? {}, [record]);
  const bookTextHex = useMemo(() => {
    const color = resolveBodyTextConfig(config.bodyText, config.locale).color;
    return resolveColorValue(color, config.colorPalette, { hex: '#000000', model: 'hex' }).hex.slice(0, 7).toLowerCase();
  }, [config]);
  const elements = useMemo(() => design.elements ?? [], [design]);
  const effects = useMemo(() => design.effects ?? [], [design]);
  const logos = useMemo(() => design.logos ?? [], [design]);
  const finishes = useMemo(() => design.finishes ?? [], [design]);
  const sheet = useMemo(() => (sheets ? pickSheet(sheets, 'cover', bookTrimMm(config)) : null), [sheets, config]);
  // The general texts, and the boxes that show them (the default ones
  // until the design keeps its own).
  const fields = useMemo(() => coverFields(record?.texts ?? {}), [record]);
  const textBoxes = useMemo(() => (sheet ? textBoxesOf(sheet, design, fields, version?.spineText) : []), [sheet, design, fields, version?.spineText]);
  const families = useMemo(() => bookFamilies(config), [config]);
  const mirror = useMirror(design, bookResources, sheets?.measures.designMargin, gallery);
  const input = useMemo(
    () => (sheet && version && record
      ? coverDocumentInput(sheet, version, record.texts, config, design, bookResources, { workIsbnLabel: labels.productionWorkIsbnCaption, hidden, logos: library, gallery, ...(mirror ? { mirror } : {}) })
      : null),
    [sheet, version, record, config, design, bookResources, hidden, library, gallery, mirror, labels.productionWorkIsbnCaption],
  );
  // The cover's own pictures (its gallery), apart from the book's figures;
  // a design made before the gallery may still place the book's.
  const pictures = useMemo(() => gallery.pictures.map(galleryResource), [gallery]);
  const allResources = useMemo(() => [...bookResources, ...pictures], [bookResources, pictures]);
  const backgroundChoices = useMemo(
    () => [...pictures, ...bookResources.filter((r) => isPicture(r) && r.id === design.image?.resourceId)],
    [pictures, bookResources, design.image?.resourceId],
  );
  const [overflow, setOverflow] = useState<string[]>([]);
  const checks = useMemo(() => (sheet ? coverChecks(sheet, design, {
    pictures: new Set([...allResources.map((r) => r.id), ...library.map((l) => logoResourceId(l.id))]),
    ...(version?.isbn ? { isbn: version.isbn } : {}),
    ...(version?.isbnAddOn ? { isbnAddOn: version.isbnAddOn } : {}),
    ...(config.print?.standard ? { standard: config.print.standard } : {}),
    mirror: !!input?.cover.designed,
    overflow,
  }) : []), [sheet, design, allResources, library, version, config.print?.standard, input, overflow]);

  const setDesign = (key: ItemLayer, next: unknown[], step?: string) => {
    if (!record) return;
    const d = { ...design, [key]: next } as CoverDesignSettings;
    // No boxes of its own would bring the default ones back: kept empty.
    if (next.length === 0 && key !== 'texts') delete d[key];
    update({ ...record, design: d }, step);
  };
  const finishLabel = (kind: CoverFinishKind) => String(labels[FINISH_LABEL[kind]]);
  /** The mask a picture element is masked with, from its gallery picture. */
  const maskOf = (el: CoverElementSetting) => {
    const m = galleryPictureOf(gallery, el.resourceId)?.masked;
    return m ? { mask: m.mask, invert: !!m.invert } : undefined;
  };
  /** A picture element masked (or unmasked): the masked picture made from
   *  its own, into the gallery; the one it had before dropped when nothing
   *  else places it. */
  const setMask = async (el: CoverElementSetting, maskId: string | undefined, invert: boolean) => {
    const current = galleryPictureOf(gallery, el.resourceId);
    const source = gallery.pictures.find((p) => p.id === (current?.masked?.source ?? current?.id));
    if (!current || !source) return;
    let pictures = gallery.pictures;
    let resourceId = galleryResourceId(source.id);
    if (maskId) {
      const mask = gallery.pictures.find((p) => p.id === maskId);
      if (!mask) return;
      try {
        const made = await maskedPicture(source, mask, invert);
        pictures = [...pictures, made];
        resourceId = galleryResourceId(made.id);
      } catch {
        return;
      }
    }
    const usedElsewhere = [design.image?.resourceId, ...[...elements, ...effects, ...logos].filter((e) => e.id !== el.id).map((e) => e.resourceId)].includes(el.resourceId);
    if (current.masked && !usedElsewhere) pictures = pictures.filter((p) => p.id !== current.id);
    updateGallery({ ...gallery, pictures }, `mask:${el.id}`);
    changeItem({ ...el, resourceId }, `mask:${el.id}`);
  };
  const settled = (el: CoverElementSetting): CoverElementSetting => {
    const r = sheet ? elementRect(sheet, el) : undefined;
    return sheet && r ? elementAt(sheet, el, r) : el;
  };

  // What the canvas moves: the active layer's items, a finish by its own
  // box (one shaped by an element follows that element).
  // What the canvas picks and moves: every shown layer's items, bottom to
  // top (a finish by its own box; one shaped by an element follows that
  // element). Picking one makes its layer the one edited.
  const { canvasItems, layerOfId } = useMemo(() => {
    const layerOf = new Map<string, ItemLayer>();
    const items: CoverElementSetting[] = [];
    const take = (layer: ItemLayer, list: readonly CoverElementSetting[]) => {
      if (hidden.has(layer)) return;
      for (const el of list) {
        layerOf.set(el.id, layer);
        items.push(el);
      }
    };
    take('elements', elements);
    take('texts', textBoxes.map(textBoxAsElement));
    take('effects', effects);
    take('logos', logos);
    take('finishes', finishes.flatMap((f) => finishAsElement(f, COVER_FINISH_INKS[f.kind].screen) ?? []));
    return { canvasItems: items, layerOfId: (id: string) => layerOf.get(id) };
  }, [hidden, elements, textBoxes, effects, logos, finishes]);
  /** A layer's items, back to front. */
  const listOf = (layer: ItemLayer): CoverItem[] => (layer === 'elements' ? elements : layer === 'texts' ? textBoxes : layer === 'effects' ? effects : layer === 'logos' ? logos : finishes);
  const changeBox = (box: CoverTextBox, step = `item:${box.id}`) => setDesign('texts', textBoxes.map((b) => (b.id === box.id ? box : b)), step);
  const pick = (id: string | null) => {
    const layer = id ? layerOfId(id) : undefined;
    if (layer) {
      setActive(layer);
      setOpen(layer);
    }
    setSelected(id);
  };

  const changeItem = (el: CoverElementSetting, step = `item:${el.id}`) => {
    const layer = layerOfId(el.id) ?? active;
    if (layer === 'elements') setDesign('elements', elements.map((e) => (e.id === el.id ? el : e)), step);
    else if (layer === 'texts') setDesign('texts', textBoxes.map((b) => (b.id === el.id ? textBoxFromElement(b, el) : b)), step);
    else if (layer === 'effects') setDesign('effects', effects.map((e) => (e.id === el.id ? el : e)), step);
    else if (layer === 'logos') setDesign('logos', logos.map((e) => (e.id === el.id ? { ...e, ...el, kind: 'image' as const } : e)), step);
    else setDesign('finishes', finishes.map((f) => (f.id === el.id ? finishFromElement(f, el) : f)), step);
  };
  const deleteItem = (id: string) => {
    const layer = layerOfId(id) ?? active;
    setDesign(layer, listOf(layer).filter((e) => e.id !== id));
    if (selected === id) setSelected(null);
  };
  /** An item as its layer keeps it (a finish, not its box). */
  const itemOf = (id: string): { layer: ItemLayer; item: CoverItem } | undefined => {
    const layer = layerOfId(id);
    if (!layer) return undefined;
    const item = listOf(layer).find((x) => x.id === id);
    return item ? { layer, item } : undefined;
  };
  /** A copy of an item into its layer, picked: moved a little, or put on
   *  `rect` (dragged there with Alt). */
  const duplicate = (id: string, rect?: { x: number; y: number; width: number; height: number }) => {
    const found = itemOf(id);
    if (!found || !sheet) return;
    add(found.layer, duplicateCoverItem(sheet, found.layer, found.item, rect ? { rect } : { offset: PASTE_OFFSET_MM }));
  };
  const paste = () => {
    const copied = copiedCoverItem();
    if (!copied || !sheet) return false;
    // Its pictures, when it was copied from another book's cover.
    const missing = copied.pictures.filter((p) => !gallery.pictures.some((g) => g.id === p.id));
    const item = duplicateCoverItem(sheet, copied.layer, copied.item, { offset: PASTE_OFFSET_MM });
    if (missing.length > 0) updateGallery({ ...gallery, pictures: [...gallery.pictures, ...missing] }, `paste:${item.id}`);
    setCopiedCoverItem({ ...copied, item });
    add(copied.layer, item, `paste:${item.id}`);
    return true;
  };
  // The keys, over the whole designer while no text box has the focus:
  // they are the designer's, not the Sandbox's history (window, capture).
  const keys = useRef<(ev: KeyboardEvent) => boolean>(() => false);
  keys.current = (ev) => {
    const key = ev.key.toLowerCase();
    if (key === 'z') { travel(ev.shiftKey ? 'redo' : 'undo'); return true; }
    if (key === 'y' && !ev.shiftKey) { travel('redo'); return true; }
    if (key === 'v' && !ev.shiftKey) return mode === 'edit' && paste();
    const found = selected && mode === 'edit' ? itemOf(selected) : undefined;
    if (!found || ev.shiftKey) return false;
    if (key === 'c' || key === 'x') {
      copyCoverItem(found.layer, found.item, gallery);
      if (key === 'x') deleteItem(found.item.id);
      return true;
    }
    if (key === 'd') { duplicate(found.item.id); return true; }
    return false;
  };
  useDesignerKeys(keys);
  const add = (layer: ItemLayer, item: { id: string } | undefined, step?: string) => {
    if (!item) return;
    setDesign(layer, [...listOf(layer), item], step);
    setActive(layer);
    setOpen(layer);
    setSelected(item.id);
    setMode('edit');
  };
  const toggle = (layer: CoverLayer) => {
    const next = new Set(hidden);
    if (next.has(layer)) next.delete(layer);
    else next.add(layer);
    setHidden(next);
  };
  // One layer open at a time, the rest a line each: an item layer opens
  // to be edited, the background to show its controls.
  const openLayer = (layer: CoverLayer) => {
    setOpen(layer);
    if (isItemLayer(layer) && layer !== active) {
      setActive(layer);
      setSelected(null);
      setMode('edit');
    }
  };
  const zoneName = (z: CoverZoneName) => (ZONE_LABEL[z] ? String(labels[ZONE_LABEL[z]!]) : z);
  const logoName = (l: CoverLogoSetting) => library.find((x) => l.logoId === x.id)?.name ?? l.resourceId ?? labels.coverItemLogo;
  const pictureName = (id: string | undefined) => galleryPictureOf(gallery, id)?.name ?? id ?? labels.coverElementPicture;
  const itemName = (layer: ItemLayer, item: CoverElementSetting | CoverFinishSetting): string => {
    if (item.name) return item.name;
    if (layer === 'finishes') return finishLabel((item as CoverFinishSetting).kind);
    if (layer === 'logos') return logoName(item as CoverLogoSetting);
    const el = item as CoverElementSetting;
    return el.kind === 'image' ? pictureName(el.resourceId) : el.kind === 'shape' ? labels.coverElementShape : labels.coverElementBox;
  };
  /** A box by its name, else the general texts it shows, else its first
   *  words. */
  const boxName = (b: CoverTextBox): string =>
    b.name || fieldsIn(b.text).map((f) => fieldLabel(labels, f)).join(' · ') || b.text.replace(/[#*_{}]/g, '').trim().slice(0, 30) || labels.coverTextBox;
  const checkName = (c: CoverCheck): string => {
    if (c.zone) return zoneName(c.zone as CoverZoneName);
    const layer = c.layer;
    const item = layer === 'finishes' ? finishes.find((f) => f.id === c.id) : [...elements, ...effects, ...logos].find((e) => e.id === c.id);
    return layer && item ? itemName(layer, item) : (c.id ?? '');
  };
  const shapeTargets = [...elements, ...effects, ...logos].map((e) => ({
    value: e.id,
    label: e.name ? e.name : e.kind === 'image' ? (logos.some((l) => l.id === e.id) ? logoName(e as CoverLogoSetting) : pictureName(e.resourceId)) : e.kind === 'shape' ? labels.coverElementShape : labels.coverElementBox,
  }));

  const selectedEl = canvasItems.find((e) => e.id === selected);
  const selectedFinish = active === 'finishes' ? finishes.find((f) => f.id === selected) : undefined;
  const activeList: CoverItem[] = listOf(active);
  const selectedBox = active === 'texts' ? textBoxes.find((b) => b.id === selected) : undefined;

  return (
    <Dialog.Root open onOpenChange={(next) => { if (!next) closeCoverDesigner(); }}>
      <Dialog.Portal container={container}>
        <Dialog.Popup
          data-postext-popup=""
          aria-label={labels.coverDesignerTitle}
          className="fixed inset-0 flex flex-col bg-(--background) text-(--foreground)"
          // Under the popovers and menus it opens itself (its selects).
          style={{ zIndex: POPUP_Z_INDEX - 1, fontSize: 13, lineHeight: '19px' }}
        >
          <DesignerHeader labels={labels} version={version?.name} canUndo={history.canUndo} canRedo={history.canRedo} mode={mode} onTravel={travel} onMode={setMode} />

          {!sheet || !input ? (
            <p className="m-auto max-w-sm p-4 text-center text-sm text-(--slate)">{labels.coverDesignerNoSheet}</p>
          ) : (
            <div className="flex min-h-0 flex-1">
              <aside className={cn(SIDE, 'border-e')} aria-label={labels.coverDesignerLayers}>
                <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-(--slate)">{labels.coverDesignerLayers}</h3>
                {[...COVER_LAYERS].reverse().map((layer) => {
                  const name = String(labels[LAYER_LABEL[layer]]);
                  const editing = isItemLayer(layer) && layer === active && mode === 'edit';
                  const expanded = layer === open;
                  const hint = LAYER_HINT[layer];
                  const list: CoverItem[] = isItemLayer(layer) ? listOf(layer) : [];
                  return (
                    <section key={layer} className={cn('flex flex-col gap-2 rounded-md border', expanded ? 'p-2' : 'px-2 py-1', editing ? 'border-(--brand)' : 'border-(--rule)')}>
                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => openLayer(layer)}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded border-0 bg-transparent px-0 py-0.5 text-start text-(--foreground) hover:text-(--brand)"
                        >
                          <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-(--slate) rtl:-scale-x-100" style={{ transform: expanded ? 'rotate(90deg)' : undefined, transition: 'transform 200ms ease' }} />
                          <span className={cn('truncate font-medium', hidden.has(layer) && 'text-(--slate) line-through')}>{name}</span>
                          {list.length > 0 && <span className="text-(--slate) tabular-nums">{list.length}</span>}
                        </button>
                        <IconButton
                          label={fill(hidden.has(layer) ? labels.coverLayerShow : labels.coverLayerHide, { layer: name })}
                          icon={hidden.has(layer) ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                          onClick={() => toggle(layer)}
                        />
                      </div>
                      {expanded && hint && <p className="m-0 text-(--slate)">{String(labels[hint])}</p>}
                      {expanded && layer === 'background' && record && (
                        <DesignSection
                          design={design}
                          resources={backgroundChoices}
                          bookTextHex={bookTextHex}
                          labels={labels}
                          onChange={(d) => update({ ...record, design: d })}
                          onUpload={async (file) => {
                            const { pictures: added, postscript } = await galleryPicturesFrom([file], pictureSize, readPictureFile);
                            if (!added[0]) {
                              announce(postscript.length ? fill(labels.productionPicturePostscript, { name: file.name }) : labels.productionPictureUnreadable);
                              return undefined;
                            }
                            updateGallery({ ...gallery, pictures: [...gallery.pictures, ...added] });
                            return galleryResourceId(added[0].id);
                          }}
                        />
                      )}

                      {expanded && layer === 'elements' && (
                        <>
                          <PictureAdder pictures={pictures} gallery={gallery} labels={labels} onPick={(p) => add('elements', newElement(sheet, 'image', p))} />
                          <GalleryUpload gallery={gallery} labels={labels} onAdded={(next, first) => { updateGallery(next); add('elements', newElement(sheet, 'image', galleryResource(first))); }} />
                          <Button variant="outline" size="sm" onClick={() => add('elements', newElement(sheet, 'box'))}>{labels.coverAddBox}</Button>
                          <ShapeAdder labels={labels} onPick={(k) => add('elements', newBasicShape(sheet, k, '#808080'))} />
                        </>
                      )}
                      {expanded && layer === 'texts' && (
                        <TextAdder labels={labels} onPick={(field) => add('texts', newTextBox(sheet, field, field ? '' : labels.coverTextBoxNewWords))} />
                      )}
                      {expanded && layer === 'effects' && (
                        <>
                          <PictureAdder pictures={pictures} gallery={gallery} labels={labels} onPick={(p) => add('effects', newElement(sheet, 'image', p))} />
                          <TraceAdder traces={gallery.traces} label={labels.coverAddTracedVeil} onPick={(t) => add('effects', newShape(sheet, t, '#000000', 0.4))} />
                          <ShapeAdder labels={labels} onPick={(k) => { const shape = newBasicShape(sheet, k, '#000000'); add('effects', shape ? { ...shape, ...(shape.color ? { opacity: 0.4 } : {}) } : undefined); }} />
                          <Button variant="outline" size="sm" onClick={() => { const box = newElement(sheet, 'box', undefined, '#000000'); add('effects', box ? ({ ...box, opacity: 0.4 } as CoverElementSetting) : undefined); }}>
                            {labels.coverAddVeil}
                          </Button>
                        </>
                      )}
                      {expanded && layer === 'logos' && (
                        <LogoAdder
                          library={library}
                          pictures={pictures}
                          labels={labels}
                          onLibrary={(l) => add('logos', newLogo(sheet, { logoId: l.id }, l.width / l.height, l.clearance))}
                          onBook={(p) => add('logos', newLogo(sheet, { resourceId: p.id }, pictureAspect(p), DEFAULT_LOGO_CLEARANCE))}
                        />
                      )}
                      {expanded && layer === 'finishes' && (
                        <Select
                          size="sm"
                          value=""
                          onValueChange={(kind) => { if (kind) add('finishes', newFinish(sheet, kind as CoverFinishKind, finishLabel(kind as CoverFinishKind))); }}
                          options={[{ value: '', label: labels.coverAddFinish }, ...FINISH_KINDS.map((k) => ({ value: k, label: finishLabel(k) }))]}
                          ariaLabel={labels.coverAddFinish}
                        />
                      )}
                      {expanded && layer === 'finishes' && (
                        <TraceAdder traces={gallery.traces} label={labels.coverAddTracedFinish} onPick={(t) => add('finishes', newFinish(sheet, 'varnish', finishLabel('varnish'), t))} />
                      )}

                      {expanded && isItemLayer(layer) && list.length > 0 && (
                        <ul className="m-0 flex list-none flex-col gap-1 p-0">
                          {[...list].reverse().map((item) => (
                            <li key={item.id} className="flex items-center gap-1">
                              <button
                                type="button"
                                aria-pressed={item.id === selected && layer === active}
                                onClick={() => { setActive(layer); setSelected(item.id); setMode('edit'); }}
                                className={cn('flex w-full items-center gap-2 rounded px-2 py-1 text-start hover:bg-(--surface)', item.id === selected && layer === active && 'bg-(--surface) font-medium text-(--brand)')}
                              >
                                {layer === 'texts'
                                  ? <Type size={12} aria-hidden="true" />
                                  : layer === 'finishes'
                                  ? <Sparkles size={12} aria-hidden="true" />
                                  : layer === 'logos'
                                    ? <Stamp size={12} aria-hidden="true" />
                                    : (item as CoverElementSetting).kind === 'image'
                                      ? <ImageIcon size={12} aria-hidden="true" />
                                      : (item as CoverElementSetting).kind === 'shape'
                                        ? <PenTool size={12} aria-hidden="true" />
                                      : <Square size={12} aria-hidden="true" fill={(item as CoverElementSetting).color} />}
                                <span className={cn('truncate', layer === 'texts' && (item as CoverTextBox).hidden && 'text-(--slate) line-through')}>{layer === 'texts' ? boxName(item as CoverTextBox) : itemName(layer, item as CoverElementSetting | CoverFinishSetting)}</span>
                              </button>
                              {layer === 'texts' && (
                                <IconButton
                                  label={fill((item as CoverTextBox).hidden ? labels.coverTextBoxShow : labels.coverTextBoxHide, { name: boxName(item as CoverTextBox) })}
                                  icon={(item as CoverTextBox).hidden ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
                                  onClick={() => { const b = item as CoverTextBox; const next = { ...b }; if (b.hidden) delete next.hidden; else next.hidden = true; changeBox(next, undefined); }}
                                />
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </aside>

              <main className="min-w-0 flex-1 bg-(--surface) p-6">
                <CoverCanvas
                  sheet={sheet}
                  input={input}
                  mode={mode}
                  elements={canvasItems}
                  clearance={(id) => logos.find((l) => l.id === id)?.clearance ?? 0}
                  selected={selected}
                  points={points}
                  onSelect={pick}
                  onChange={changeItem}
                  onDuplicate={(el, rect) => duplicate(el.id, rect)}
                  onDelete={deleteItem}
                  onLaid={(doc) => setOverflow(overflowZones(doc))}
                  label={labels.coverDesignerTitle}
                  failedLabel={labels.productionPreviewFailed}
                />
              </main>

              <aside className={cn(SIDE, 'w-72 border-s')}>
                {mode === 'preview' ? (
                  <>
                    <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-(--slate)">{labels.coverChecks}</h3>
                    <CoverChecksList
                      checks={checks}
                      labels={labels}
                      nameOf={checkName}
                      onPick={(c) => {
                        if (!c.layer || !c.id) return;
                        setActive(c.layer);
                        setOpen(c.layer);
                        setSelected(c.id);
                        setMode('edit');
                      }}
                    />
                    <p className="m-0 text-(--slate)">{labels.coverGuidesLegend}</p>
                    {input.cover.designed && <p className="m-0 text-(--slate)">{labels.coverGuideMirror}</p>}
                    {input.cover.mirrorSkipped && <p className="m-0">{fill(labels.coverMirrorSkipped, { pictures: input.cover.mirrorSkipped.map(pictureName).join(', ') })}</p>}
                    {input.cover.clipSkipped && <p className="m-0">{fill(labels.coverClipSkipped, { pictures: input.cover.clipSkipped.map(pictureName).join(', ') })}</p>}
                    <Button variant="primary" size="sm" onClick={() => setMode('edit')}>{labels.coverDesignerEdit}</Button>
                  </>
                ) : selectedBox ? (
                  <TextBoxProperties
                    key={selectedBox.id}
                    box={selectedBox}
                    zone={zoneName(selectedBox.zone)}
                    fields={fields}
                    families={families}
                    labels={labels}
                    canForward={textBoxes[textBoxes.length - 1]?.id !== selectedBox.id}
                    canBackward={textBoxes[0]?.id !== selectedBox.id}
                    onChange={(b) => changeBox(b)}
                    onRestack={(step) => setDesign('texts', restack(textBoxes, selectedBox.id, step))}
                    onDelete={() => deleteItem(selectedBox.id)}
                    onDuplicate={() => duplicate(selectedBox.id)}
                  />
                ) : selectedFinish ? (
                  <FinishProperties
                    finish={selectedFinish}
                    targets={shapeTargets}
                    traces={gallery.traces}
                    onTrace={(t) => { const shaped = newFinish(sheet, selectedFinish.kind, selectedFinish.ink, t); if (shaped) setDesign('finishes', finishes.map((x) => (x.id === selectedFinish.id ? { ...x, shape: 'box' in x.shape ? { outline: t.outline, box: x.shape.box } : shaped.shape } : x))); }}
                    labels={labels}
                    finishLabel={finishLabel}
                    onChange={(f) => setDesign('finishes', finishes.map((x) => (x.id === f.id ? f : x)))}
                    onBox={() => { const box = newFinish(sheet, selectedFinish.kind, selectedFinish.ink); if (box) setDesign('finishes', finishes.map((x) => (x.id === selectedFinish.id ? { ...x, shape: box.shape } : x))); }}
                    canForward={finishes[finishes.length - 1]?.id !== selectedFinish.id}
                    canBackward={finishes[0]?.id !== selectedFinish.id}
                    onRestack={(step) => setDesign('finishes', restack(finishes, selectedFinish.id, step))}
                    onDelete={() => deleteItem(selectedFinish.id)}
                    onDuplicate={() => duplicate(selectedFinish.id)}
                    {...(selectedEl ? { zone: zoneName(selectedEl.zone) } : {})}
                  />
                ) : selectedEl ? (
                  <ElementProperties
                    // As it stands on this sheet (scaled when the format
                    // changed since it was placed): what is edited is that.
                    el={settled(selectedEl)}
                    layer={active}
                    zone={zoneName(selectedEl.zone)}
                    aspect={selectedEl.kind === 'image' ? aspectOf(selectedEl, allResources, library) : undefined}
                    clearance={active === 'logos' ? logos.find((l) => l.id === selectedEl.id)?.clearance : undefined}
                    traces={gallery.traces}
                    masks={gallery.pictures.filter((p) => p.role === 'mask')}
                    mask={maskOf(selectedEl)}
                    onMask={galleryPictureOf(gallery, selectedEl.resourceId) ? (m, invert) => void setMask(settled(selectedEl), m, invert) : undefined}
                    canForward={activeList[activeList.length - 1]?.id !== selectedEl.id}
                    canBackward={activeList[0]?.id !== selectedEl.id}
                    labels={labels}
                    onChange={changeItem}
                    onClearance={(clearance) => setDesign('logos', logos.map((l) => (l.id === selectedEl.id ? { ...l, clearance } : l)))}
                    onSize={(width, height) => {
                      const r = elementRect(sheet, selectedEl);
                      if (r) changeItem(elementAt(sheet, selectedEl, { ...r, width, height }));
                    }}
                    onRestack={(step) => setDesign(active, restack(activeList, selectedEl.id, step))}
                    onDelete={() => deleteItem(selectedEl.id)}
                    onDuplicate={() => duplicate(selectedEl.id)}
                    points={points}
                    onPoints={(on) => {
                      // A traced outline becomes nodes the first time its points are edited.
                      if (on && selectedEl.kind === 'shape' && !selectedEl.path && selectedEl.outline) {
                        const next = { ...selectedEl, path: outlineAsPath(selectedEl.outline) };
                        delete next.outline;
                        changeItem(next);
                      }
                      setPoints(on);
                    }}
                  />
                ) : (
                  <p className="m-0 text-(--slate)">{labels.coverElementNone}</p>
                )}
                {mode === 'edit' && <p className="m-0 text-(--slate)">{labels.coverDesignerHint}</p>}
              </aside>
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
