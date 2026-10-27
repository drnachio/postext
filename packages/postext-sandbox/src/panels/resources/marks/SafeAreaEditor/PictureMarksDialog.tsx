'use client';

// The dialog that draws a picture's safe area, anchors, speakers and
// avoid zones over it (#1276: split out of SafeAreaEditor.tsx).
import { Dialog } from '@base-ui/react/dialog';
import { X, ZoomOut, ZoomIn, Maximize2, Hand, Smile, TriangleAlert, Crop, Trash2, Plus, Undo2 } from 'lucide-react';
import type { ResourceSafeArea } from 'postext';
import { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { NumberInput } from '../../../../controls/index.js';
import { IconButton, SegmentedControl, Button, Switch } from '../../../../ui/index.js';
import { POPUP_Z_INDEX, POPUP_SURFACE } from '../../../../ui/layout/surface.js';
import { SvgSymbolsReader } from '../../svg/SvgSymbolsReader.js';
import { addZones } from '../../svg/svgSymbols.js';
import { type ZoneTarget, leaderDrawn, type MarkTarget, anchorOutsideSafeArea, INITIAL_SAFE_AREA, anchorIdProblem, withAnchor, removeMark, addHead, addFace, MIN_SIDE, firstAnchorIdProblem } from '../pictureMarks.js';
import { labelStyleColor, LabelAnchorsPanel } from '../LabelAnchorsPanel.js';
import { zoomStep, MAX_STAGE_ZOOM, STAGE_NAMES_ZOOM } from '../stageZoom.js';
import type { Mode } from '../SafeAreaEditor.js';
import { RectHandles, MarkTag, LabelHandle, PointMark } from './markHandles.js';
import { boxStyle, BYSTANDER_COLOR, AVOID_COLOR, targetKey, AVOID_FILL, speakerColor, pct } from './markStyles.js';
import { useMarksState } from './PictureMarksDialog/useMarksState.js';
import { useStageZoom } from './PictureMarksDialog/useStageZoom.js';
import { createStagePointer } from './PictureMarksDialog/stagePointer.js';
import { createMarkEdits } from './PictureMarksDialog/markEdits.js';
import type { PictureMarksDialogProps } from './PictureMarksDialog/props.js';

export function PictureMarksDialog({ open, initialMode, url, resource, withLettering, labelStyles, figureLabels, request, onClose, onSave }: PictureMarksDialogProps) {
  const labels = useSandboxLabels();

  const { setLabelLeader, styleHasLeader, container, mode, setMode, marks, setMarksState, marksRef, past, selAnchor, setSelAnchor, setSelZone, zoneSelected,
    showIdErrors, setShowIdErrors, placing, setPlacing, ticked, hoverAnchor, setHoverAnchor, namesOnDense, setNamesOnDense, placingRef, zoom, setZoom, hand,
    setHand, spaceDown, setSpaceDown, viewportRef, zoomFocus, pan, touches, pinch, pinchFrame, placingAtDown, labelState, loaded, setLoaded, stageRef, drag,
    lastNudge, markEls, idInputs, addButton, zoneSwitches, focusNext, setMarks, record, commit, undo, idEdit, tick, denseMap } = useMarksState({
    open, initialMode, resource, withLettering, labelStyles, figureLabels, request });

  const { zoomTo, zoomValue, setViewport, panning } = useStageZoom({ zoom, setZoom, hand, spaceDown, viewportRef, zoomFocus });

  const { intrinsic, area, onPointerDown, onPointerMove, onPointerUp, onMarkKeyDown } = createStagePointer({
    resource, figureLabels, mode, marks, setMarksState, marksRef, selAnchor, setSelAnchor, setSelZone, setPlacing, ticked, placingRef, setZoom, viewportRef,
    zoomFocus, pan, touches, pinch, pinchFrame, placingAtDown, labelState, loaded, stageRef, drag, lastNudge, markEls, idInputs, addButton, focusNext, setMarks,
    record, commit, tick, zoomValue, panning });

  const { setField, addSpeakerAtCentre, addLabelAnchorAtCentre, removeLabelAnchor, beginAnchorEdit, anchorEdit, addAvoidAtCentre, addBystanderAtCentre,
    switchKind, save, previews, help, idMessage, nameOf, register } = createMarkEdits({
    figureLabels, onSave, labels, mode, setMode, marks, setMarksState, marksRef, selAnchor, setSelAnchor, setSelZone, setShowIdErrors, setPlacing, placingRef,
    markEls, idInputs, addButton, zoneSwitches, focusNext, setMarks, record, commit, idEdit, intrinsic, area });

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal container={container}>
        <Dialog.Backdrop className="fixed inset-0" style={{ zIndex: POPUP_Z_INDEX, backgroundColor: 'rgba(0, 0, 0, 0.4)' }} />
        <Dialog.Popup
          data-postext-popup=""
          data-testid="picture-marks-dialog"
          className="fixed left-1/2 top-1/2 flex max-h-[calc(100dvh-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto"
          style={{ ...POPUP_SURFACE, zIndex: POPUP_Z_INDEX, width: mode === 'labels' ? 'min(1240px, calc(100vw - 32px))' : 'min(920px, calc(100vw - 32px))',
            // The Anchors mode's list grows with every click: a fixed height
            // keeps the picture where the pointer is (a centred dialog would
            // move up as it grows).
            ...(mode === 'labels' ? { height: 'min(900px, calc(100dvh - 32px))' } : {}), padding: 16, fontSize: 13, lineHeight: '19px' }}
          onKeyDown={(e) => {
            // Undo inside the dialog; a text box keeps its own.
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !(e.target instanceof HTMLInputElement)) {
              e.preventDefault();
              undo();
              return;
            }
            // Zoom (+, -, 0) and Space for the hand, outside the controls
            // that use those keys themselves (#956).
            const t = e.target;
            const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);
            if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === '+' || e.key === '=') {
              e.preventDefault();
              zoomTo(zoomStep(zoom, 1));
            } else if (e.key === '-' || e.key === '_') {
              e.preventDefault();
              zoomTo(zoomStep(zoom, -1));
            } else if (e.key === '0') {
              e.preventDefault();
              zoomTo(1);
            } else if (e.key === ' ' && !(t instanceof HTMLButtonElement)) {
              e.preventDefault();
              setSpaceDown(true);
            }
          }}
          onKeyUp={(e) => { if (e.key === ' ') setSpaceDown(false); }}
          onBlur={() => setSpaceDown(false)}
        >
          <div className="flex items-start justify-between gap-2">
            <Dialog.Title style={{ fontSize: 15, lineHeight: '20px', fontWeight: 600, margin: 0 }}>
              {withLettering ? labels.resourceMarksLabel : labels.resourceSafeAreaLabel}
            </Dialog.Title>
            <IconButton label={labels.resourceSafeAreaCancel} icon={<X size={14} aria-hidden="true" />} onClick={onClose} />
          </div>
          {withLettering && (
            <SegmentedControl<Mode>
              value={mode}
              onValueChange={setMode}
              ariaLabel={labels.resourceMarksModeAria}
              options={[
                { value: 'safe', label: labels.resourceSafeAreaLabel },
                { value: 'labels', label: labels.resourceMarksModeAnchors },
                { value: 'speakers', label: labels.resourceMarksModeSpeakers },
                { value: 'avoid', label: labels.resourceMarksModeAvoid },
              ]}
              className="self-start"
            />
          )}
          <Dialog.Description className="text-xs text-(--slate)" style={{ margin: 0 }}>
            {help}
          </Dialog.Description>

          {/* In Anchors mode the row takes the fixed height that is left and
              scrolls by itself, so nothing in it spills over the footer
              (#1039). */}
          <div className={`flex flex-wrap items-start gap-4 ${mode === 'labels' ? 'min-h-0 flex-1 overflow-y-auto' : ''}`}>
            {/* The picture with the marks over it, in a viewport that
                scrolls when the picture is zoomed (#956). */}
            <div className="flex flex-col gap-1.5" style={{ maxWidth: '100%' }}>
              <div role="group" aria-label={labels.resourceMarksZoomAria} className="flex items-center gap-0.5 self-start" title={labels.resourceMarksZoomHint}>
                <IconButton label={labels.resourceMarksZoomOut} icon={<ZoomOut size={14} aria-hidden="true" />} disabled={zoom <= 1} onClick={() => zoomTo(zoomStep(zoom, -1))} />
                <span className="min-w-10 text-center text-xs tabular-nums text-(--slate)" aria-live="polite">{Math.round(zoom * 100)}%</span>
                <IconButton label={labels.resourceMarksZoomIn} icon={<ZoomIn size={14} aria-hidden="true" />} disabled={zoom >= MAX_STAGE_ZOOM} onClick={() => zoomTo(zoomStep(zoom, 1))} />
                <IconButton label={labels.resourceMarksZoomFit} icon={<Maximize2 size={14} aria-hidden="true" />} disabled={zoom === 1} onClick={() => zoomTo(1)} />
                <IconButton label={labels.resourceMarksZoomHand} icon={<Hand size={14} aria-hidden="true" />} active={hand} disabled={zoom === 1} onClick={() => setHand((h) => !h)} />
              </div>
              <div
                ref={setViewport}
                data-testid="picture-marks-viewport"
                className="relative overflow-auto"
                style={intrinsic && intrinsic.height > 0
                  ? { width: `min(600px, calc(55dvh * ${intrinsic.width / intrinsic.height}))`, maxWidth: '100%', aspectRatio: `${intrinsic.width} / ${intrinsic.height}` }
                  : { display: 'inline-block', maxWidth: 'min(600px, 100%)' }}
              >
            <div
              ref={stageRef}
              data-testid="picture-marks-stage"
              className="relative touch-none select-none"
              style={{ cursor: panning ? (pan.current ? 'grabbing' : 'grab') : 'crosshair', overflow: 'hidden', width: intrinsic && intrinsic.height > 0 ? `${zoom * 100}%` : undefined, display: intrinsic && intrinsic.height > 0 ? 'block' : 'inline-block', maxWidth: intrinsic && intrinsic.height > 0 ? undefined : '100%' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <img
                src={url}
                alt=""
                draggable={false}
                className="block"
                // Sized from the picture's ratio, so the stage the marks are
                // laid over is the picture's own box: a picture held back by
                // the height limit would otherwise leave the stage wider
                // than it, and every mark off (#866). The viewport is that
                // box; the stage fills it, or `zoom` times it.
                style={intrinsic && intrinsic.height > 0
                  ? { width: '100%', height: 'auto' }
                  : { maxWidth: 'min(600px, 100%)', maxHeight: '55dvh' }}
                onLoad={(e) => setLoaded({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
              />

              {/* Safe area: edited in its mode, a dimmed reference in the others. */}
              {area && mode === 'safe' && (
                <div
                  ref={register('safe')}
                  data-mark="safe"
                  role="group"
                  tabIndex={0}
                  aria-label={labels.resourceSafeAreaRectAria}
                  onKeyDown={onMarkKeyDown({ kind: 'safe' })}
                  className="absolute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--foreground)"
                  style={{ ...boxStyle(area), cursor: 'move', boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)', border: '2px solid var(--brand)' }}
                >
                  <RectHandles color="var(--brand)" />
                </div>
              )}
              {area && mode !== 'safe' && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute"
                  style={{ ...boxStyle(area), boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.28)', border: '1.5px dashed rgba(255, 255, 255, 0.85)' }}
                />
              )}

              {/* Avoid zones, and the faces of the people who do not speak. */}
              {withLettering && ([...marks.avoid.map((r, i) => [r, { kind: 'avoid', index: i }] as const), ...marks.faces.map((r, i) => [r, { kind: 'bystander', index: i }] as const)] as [ResourceSafeArea, ZoneTarget][]).map(([r, target]) => {
                const active = mode === 'avoid';
                const face = target.kind === 'bystander';
                const color = face ? BYSTANDER_COLOR : AVOID_COLOR;
                const label = (face ? labels.resourceBystanderFaceAria : labels.resourceAvoidZoneAria).replace('__n__', String(target.index + 1));
                const selected = active && zoneSelected(target);
                return (
                  <div
                    key={targetKey(target)}
                    ref={active ? register(targetKey(target)) : undefined}
                    data-mark={target.kind}
                    data-index={target.index}
                    role={active ? 'group' : undefined}
                    tabIndex={active ? 0 : undefined}
                    aria-label={active ? label : undefined}
                    aria-hidden={active ? undefined : true}
                    onKeyDown={active ? onMarkKeyDown(target) : undefined}
                    onFocus={active ? () => setSelZone(target) : undefined}
                    className={`absolute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--foreground) ${active ? '' : 'pointer-events-none'}`}
                    style={{
                      ...boxStyle(r),
                      cursor: active ? 'move' : undefined,
                      background: face ? `${color}33` : AVOID_FILL,
                      border: `2px ${selected ? 'solid' : 'dashed'} ${color}`,
                      opacity: active ? 1 : 0.55,
                    }}
                  >
                    <MarkTag color={color}>{face ? <><Smile size={10} aria-hidden="true" />{String(target.index + 1)}</> : String(target.index + 1)}</MarkTag>
                    {selected && <RectHandles color={color} />}
                  </div>
                );
              })}

              {/* Labels away from their points (#1064): the line to the point
                  as the leader runs (dashed when no leader is drawn) and the
                  label's handle; the anchor picked has a grip by its point
                  to set its label away. */}
              {withLettering && mode === 'labels' && (
                <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {marks.anchors.map((a, i) => {
                    if (!a.labelAt) return null;
                    const first = labelState.byAnchor.get(a.id)?.[0];
                    const drawn = leaderDrawn(a, styleHasLeader(first?.style ?? a.style), first?.leader);
                    return (
                      <line
                        key={`leader-${i}`}
                        data-leader={drawn ? 'drawn' : 'none'}
                        x1={a.labelAt.x * 100} y1={a.labelAt.y * 100} x2={a.x * 100} y2={a.y * 100}
                        stroke={drawn ? labelStyleColor(a.style, labelStyles) : 'rgba(255, 255, 255, 0.8)'}
                        strokeWidth={drawn ? 2 : 1.5}
                        strokeDasharray={drawn ? undefined : '4 3'}
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}
                </svg>
              )}
              {withLettering && mode === 'labels' && marks.anchors.map((a, i) => {
                if (!a.labelAt && selAnchor !== i) return null;
                const target: MarkTarget = { kind: 'label', index: i };
                const text = labelState.byAnchor.get(a.id)?.[0]?.text;
                return (
                  <LabelHandle
                    key={`label-${i}`}
                    markRef={register(targetKey(target))}
                    index={i}
                    point={a.labelAt ?? a}
                    away={!!a.labelAt}
                    color={labelStyleColor(a.style, labelStyles)}
                    text={text ?? (a.id || '…')}
                    label={(a.labelAt ? labels.labelAwayHandleAria : labels.labelAwayGripAria).replace('__id__', nameOf(i))}
                    onKeyDown={onMarkKeyDown(target)}
                    onFocus={() => setSelAnchor(i)}
                  />
                );
              })}

              {/* Speakers: face rectangle, head–mouth line, head and mouth.
                  Anchors (#866): the point alone, coloured by its label
                  style and named by its label's text. */}
              {withLettering && marks.anchors.map((a, i) => {
                const labelMode = mode === 'labels';
                const active = mode === 'speakers' || labelMode;
                const color = labelMode ? labelStyleColor(a.style, labelStyles) : speakerColor(i);
                const labelText = labelMode ? labelState.byAnchor.get(a.id)?.[0]?.text : undefined;
                const selected = active && selAnchor === i;
                const outside = anchorOutsideSafeArea(a, area);
                const face: MarkTarget = { kind: 'face', index: i };
                const head: MarkTarget = { kind: 'head', index: i };
                const mouth: MarkTarget = { kind: 'mouth', index: i };
                return (
                  <div key={`anchor-${i}`} className={active ? undefined : 'pointer-events-none'} style={{ opacity: active ? 1 : 0.55 }} aria-hidden={active ? undefined : true}>
                    {a.face && !labelMode && (
                      <div
                        ref={active ? register(targetKey(face)) : undefined}
                        data-mark="face"
                        data-index={i}
                        role={active ? 'group' : undefined}
                        tabIndex={active ? 0 : undefined}
                        aria-label={active ? labels.resourceAnchorFaceAria.replace('__id__', nameOf(i)) : undefined}
                        onKeyDown={active ? onMarkKeyDown(face) : undefined}
                        onFocus={active ? () => setSelAnchor(i) : undefined}
                        className="absolute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--foreground)"
                        style={{ ...boxStyle(a.face), cursor: active ? 'move' : undefined, border: `2px ${selected ? 'solid' : 'dashed'} ${color}`, background: `${color}22` }}
                      >
                        {selected && <RectHandles color={color} />}
                      </div>
                    )}
                    {a.head && !labelMode && (
                      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <line
                          x1={a.x * 100} y1={a.y * 100} x2={a.head.x * 100} y2={a.head.y * 100}
                          stroke={color} strokeWidth={2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    )}
                    {a.head && !labelMode && (
                      <PointMark
                        markRef={active ? register(targetKey(head)) : undefined}
                        kind="head"
                        index={i}
                        point={a.head}
                        color={color}
                        active={active}
                        label={labels.resourceAnchorHeadAria.replace('__id__', nameOf(i))}
                        onKeyDown={onMarkKeyDown(head)}
                        onFocus={() => setSelAnchor(i)}
                      />
                    )}
                    <PointMark
                      markRef={active ? register(targetKey(mouth)) : undefined}
                      kind="mouth"
                      index={i}
                      point={a}
                      color={color}
                      active={active}
                      selected={selected}
                      ticked={labelMode && ticked.has(i)}
                      onHover={labelMode ? (on) => setHoverAnchor((h) => (on ? i : h === i ? null : h)) : undefined}
                      label={(labelMode ? labels.resourceLabelAnchorsPointAria : labels.resourceAnchorMouthAria).replace('__id__', nameOf(i))}
                      onKeyDown={onMarkKeyDown(mouth)}
                      onFocus={() => setSelAnchor(i)}
                      tag={labelMode && denseMap && !namesOnDense && zoom < STAGE_NAMES_ZOOM && !selected && hoverAnchor !== i && !ticked.has(i) ? undefined : (
                        <>
                          {outside && <TriangleAlert size={10} aria-hidden="true" style={{ color: '#fbbf24' }} />}
                          <span dir="auto">{labelText ?? (a.id || '…')}</span>
                        </>
                      )}
                    />
                  </div>
                );
              })}
            </div>
              </div>
            </div>

            {/* The side panel of the mode. */}
            <div className={`flex min-w-[220px] flex-1 flex-col gap-2 ${mode === 'labels' ? 'max-h-full self-stretch' : ''}`}>
              {mode === 'safe' && !area && (
                <div className="flex flex-col items-start gap-2">
                  <span className="text-xs text-(--slate)">{labels.resourceSafeAreaNone}</span>
                  <Button size="sm" icon={<Crop size={13} aria-hidden="true" />} onClick={() => commit({ ...marksRef.current, safeArea: INITIAL_SAFE_AREA })}>
                    {labels.resourceSafeAreaMark}
                  </Button>
                </div>
              )}
              {mode === 'safe' && previews.length > 0 && (
                <div className="flex gap-3">
                  {previews.map((p) => (
                    <figure key={p.label} className="m-0 flex flex-col items-center gap-1">
                      <img src={url} alt="" className="block rounded-sm" style={{ width: p.width, height: p.height, ...p.style }} />
                      <figcaption className="text-[11px] text-(--slate)">{p.label}</figcaption>
                    </figure>
                  ))}
                </div>
              )}

              {mode === 'labels' && (
                <LabelAnchorsPanel
                  marks={marks}
                  area={area}
                  labelStyles={labelStyles}
                  byAnchor={labelState.byAnchor}
                  waiting={labelState.waiting}
                  waitingLabel={labelState.waitingLabel}
                  placing={placing}
                  onPlacing={setPlacing}
                  selected={selAnchor}
                  onSelect={setSelAnchor}
                  commit={commit}
                  edit={anchorEdit}
                  beginEdit={beginAnchorEdit}
                  remove={removeLabelAnchor}
                  addAtCentre={addLabelAnchorAtCentre}
                  showIdErrors={showIdErrors}
                  idInputs={idInputs}
                  addButton={addButton}
                  ticked={ticked}
                  onTick={tick}
                  showNames={namesOnDense}
                  onShowNames={setNamesOnDense}
                  denseMap={denseMap}
                  onLabelLeader={setLabelLeader}
                  styleHasLeader={styleHasLeader}
                />
              )}

              {mode === 'speakers' && (
                <>
                  {marks.anchors.length === 0 && <p className="m-0 text-xs text-(--slate)">{labels.resourceAnchorsEmpty}</p>}
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {marks.anchors.map((a, i) => {
                      const problem = anchorIdProblem(marks.anchors, i);
                      // A duplicate or a reserved word shows at once; an
                      // empty or half-typed id once Save was pressed.
                      const shown = problem && (showIdErrors || problem === 'duplicate' || problem === 'reserved' || problem === 'invalid') ? problem : undefined;
                      const outside = anchorOutsideSafeArea(a, area);
                      const inputId = `pt-anchor-id-${i}`;
                      const msgId = `pt-anchor-msg-${i}`;
                      return (
                        <li
                          key={i}
                          className="flex flex-col gap-1.5 rounded-md border p-2"
                          style={{ borderColor: selAnchor === i ? speakerColor(i) : 'var(--pt-control-border)', borderInlineStartWidth: 4, borderInlineStartColor: speakerColor(i) }}
                          onFocusCapture={() => setSelAnchor(i)}
                        >
                          <div className="flex items-center gap-2">
                            <label htmlFor={inputId} className="shrink-0 text-xs text-(--slate)">{labels.resourceAnchorIdLabel}</label>
                            <input
                              ref={(el) => { if (el) idInputs.current.set(i, el); else idInputs.current.delete(i); }}
                              id={inputId}
                              dir="auto"
                              type="text"
                              spellCheck={false}
                              autoCapitalize="off"
                              autoComplete="off"
                              value={a.id}
                              aria-invalid={shown ? true : undefined}
                              aria-describedby={shown || outside ? msgId : undefined}
                              onFocus={() => { idEdit.current = { index: i, before: marksRef.current, recorded: false }; }}
                              onChange={(e) => {
                                const edit = idEdit.current;
                                if (edit && edit.index === i && !edit.recorded) {
                                  record(edit.before);
                                  edit.recorded = true;
                                }
                                setMarks(withAnchor(marksRef.current, i, (x) => ({ ...x, id: e.target.value.replace(/\s+/g, '') })));
                              }}
                              className="h-7 min-w-0 flex-1 rounded-md border bg-(--surface) px-2 font-mono text-xs text-(--foreground) outline-none focus:outline-2 focus:outline-offset-1 focus:outline-(--brand) pt-large:h-11"
                              style={{ borderColor: shown ? AVOID_COLOR : 'var(--pt-control-border)' }}
                            />
                            <IconButton
                              label={labels.resourceAnchorDelete.replace('__id__', nameOf(i))}
                              icon={<Trash2 size={13} aria-hidden="true" />}
                              destructive
                              onClick={() => {
                                commit(removeMark(marksRef.current, { kind: 'mouth', index: i }));
                                setSelAnchor(null);
                                focusNext.current = () => addButton.current?.focus();
                              }}
                            />
                          </div>
                          {(shown || outside) && (
                            <div id={msgId} className="flex flex-col gap-0.5 text-xs">
                              {shown && <span style={{ color: 'var(--pt-error, #ef4444)' }}>{idMessage(shown, a.id)}</span>}
                              {outside && (
                                <span className="inline-flex items-start gap-1" style={{ color: 'var(--pt-warning, #d97706)' }}>
                                  <TriangleAlert size={12} aria-hidden="true" className="mt-[3px] shrink-0" />
                                  {labels.resourceAnchorOutsideSafeArea}
                                </span>
                              )}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => commit(a.head ? removeMark(marksRef.current, { kind: 'head', index: i }) : addHead(marksRef.current, i))}
                            >
                              {a.head ? labels.resourceAnchorRemoveHead : labels.resourceAnchorAddHead}
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => commit(a.face ? removeMark(marksRef.current, { kind: 'face', index: i }) : addFace(marksRef.current, i))}
                            >
                              {a.face ? labels.resourceAnchorRemoveFace : labels.resourceAnchorAddFace}
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <Button ref={addButton} size="sm" icon={<Plus size={13} aria-hidden="true" />} className="self-start" onClick={addSpeakerAtCentre}>
                    {labels.resourceAnchorAdd}
                  </Button>
                </>
              )}

              {mode === 'avoid' && (
                <>
                  {marks.avoid.length === 0 && marks.faces.length === 0 && <p className="m-0 text-xs text-(--slate)">{labels.resourceAvoidEmpty}</p>}
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {([...marks.avoid.map((r, i) => [r, { kind: 'avoid', index: i }] as const), ...marks.faces.map((r, i) => [r, { kind: 'bystander', index: i }] as const)] as [ResourceSafeArea, ZoneTarget][]).map(([r, target]) => {
                      const face = target.kind === 'bystander';
                      const n = String(target.index + 1);
                      const key = targetKey(target);
                      const switchId = `pt-zone-face-${key}`;
                      return (
                        <li
                          key={key}
                          className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-md border px-2 py-1 text-xs"
                          style={{ borderColor: zoneSelected(target) ? (face ? BYSTANDER_COLOR : AVOID_COLOR) : 'var(--pt-control-border)', borderInlineStartWidth: 4, borderInlineStartColor: face ? BYSTANDER_COLOR : AVOID_COLOR }}
                        >
                          <button
                            type="button"
                            className="min-h-7 flex-1 cursor-pointer text-start text-(--foreground) pt-large:min-h-11"
                            onClick={() => {
                              setSelZone(target);
                              markEls.current.get(key)?.focus();
                            }}
                          >
                            {(face ? labels.resourceBystanderFaceAria : labels.resourceAvoidZoneAria).replace('__n__', n)}
                            <span className="ms-2 text-(--slate)">{pct(r.width)} × {pct(r.height)} %</span>
                          </button>
                          <span className="inline-flex items-center gap-1.5">
                            <span id={switchId} className="text-(--slate)">{labels.resourceZoneIsFace}</span>
                            <span ref={(el) => {
                              const root = el?.querySelector<HTMLElement>('[role="switch"]');
                              if (root) zoneSwitches.current.set(key, root);
                              else zoneSwitches.current.delete(key);
                            }}>
                              <Switch checked={face} onCheckedChange={() => switchKind(target)} ariaLabelledBy={switchId} />
                            </span>
                          </span>
                          <IconButton
                            label={(face ? labels.resourceBystanderFaceDelete : labels.resourceAvoidZoneDelete).replace('__n__', n)}
                            icon={<Trash2 size={13} aria-hidden="true" />}
                            destructive
                            onClick={() => {
                              commit(removeMark(marksRef.current, target));
                              setSelZone(null);
                              focusNext.current = () => addButton.current?.focus();
                            }}
                          />
                        </li>
                      );
                    })}
                  </ul>
                  <div className="flex flex-wrap gap-1.5">
                    <Button ref={addButton} size="sm" icon={<Plus size={13} aria-hidden="true" />} onClick={addAvoidAtCentre}>
                      {labels.resourceAvoidAdd}
                    </Button>
                    <Button size="sm" icon={<Smile size={13} aria-hidden="true" />} onClick={addBystanderAtCentre}>
                      {labels.resourceBystanderAdd}
                    </Button>
                  </div>
                  {resource.kind === 'svg' && (
                    <SvgSymbolsReader
                      fileId={resource.svg?.fileId}
                      onAdd={(found) => {
                        const { zones, added } = addZones(marksRef.current.avoid, found);
                        if (added > 0) commit({ ...marksRef.current, avoid: zones });
                        return added;
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </div>

          {mode === 'safe' && area && (
            <div className="grid grid-cols-1 gap-x-4 gap-y-1 min-[480px]:grid-cols-2">
              {([
                ['x', labels.resourceSafeAreaLeft, 0],
                ['y', labels.resourceSafeAreaTop, 0],
                ['width', labels.resourceSafeAreaWidth, MIN_SIDE * 100],
                ['height', labels.resourceSafeAreaHeight, MIN_SIDE * 100],
              ] as const).map(([key, label, min]) => (
                <div key={key} className="@container">
                  <NumberInput label={label} value={pct(area[key])} onChange={(v) => setField(key, v)} min={min} max={100} step={1} suffix="%" isDefault />
                </div>
              ))}
            </div>
          )}

          {showIdErrors && firstAnchorIdProblem(marks.anchors) >= 0 && (
            <p role="alert" className="m-0 text-xs" style={{ color: 'var(--pt-error, #ef4444)' }}>{labels.resourceMarksFixIds}</p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" size="sm" icon={<Undo2 size={13} aria-hidden="true" />} disabled={!past.length} onClick={undo} className="me-auto">
              {labels.resourceMarksUndo}
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>
              {labels.resourceSafeAreaCancel}
            </Button>
            <Button variant="primary" size="sm" onClick={save}>
              {labels.resourceSafeAreaSave}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
