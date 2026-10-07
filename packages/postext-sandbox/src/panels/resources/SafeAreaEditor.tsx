'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Crop, MessageCircle, Plus, Trash2, TriangleAlert, Undo2, X } from 'lucide-react';
import type { Resource, ResourceSafeArea } from 'postext';
import { safeAreaHeightRange, safeAreaSource } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { NumberInput } from '../../controls';
import { FieldRow } from '../../controls/FieldRow';
import { Button, IconButton, SegmentedControl, usePortalContainer } from '../../ui';
import { POPUP_SURFACE, POPUP_Z_INDEX } from '../../ui/surface';
import { useBlobObjectUrl } from './ResourcePreview';
import {
  HANDLES, INITIAL_SAFE_AREA, MIN_SIDE,
  addAnchor, addFace, addHead, anchorIdProblem, anchorOutsideSafeArea, applyDrag, clamp, firstAnchorIdProblem,
  marksOf, normalizeMarks, nudge, removeMark, sameMarks, withAnchor, zoneAround,
  type AnchorIdProblem, type Handle, type MarkDrag, type MarkTarget, type PictureMarks, type Point,
} from './pictureMarks';

// ---------------------------------------------------------------------------
// Safe area & lettering marks of a picture. The field sums them up over a
// thumbnail; the dialog draws them over the picture in three modes:
// - Safe area (`Resource.safeArea`, #442): the rectangle that always shows
//   (drag to draw, move or resize; arrows and Shift+arrows on the focused
//   rectangle; numeric fields), with the tallest and the shortest crop the
//   layout may use;
// - Speakers (`Resource.anchors`, #557/#569): the mouth each balloon tail
//   points at, named by the speaker id the comic's script uses, with an
//   optional head point (thought balloons) and face rectangle;
// - Avoid zones (`Resource.avoid`): rectangles no balloon covers.
// Every mark is a focusable target (arrow keys move it, Delete removes it)
// and every pointer target is at least 44 px on touch screens.
// ---------------------------------------------------------------------------

type Mode = 'safe' | 'speakers' | 'avoid';

const pct = (v: number) => Math.round(v * 1000) / 10;

/** One colour per speaker, cycled, so a mouth, its head and its face read
 *  as one person. */
const SPEAKER_COLORS = ['#f97316', '#22d3ee', '#facc15', '#a3e635', '#e879f9', '#60a5fa'];
const speakerColor = (i: number) => SPEAKER_COLORS[i % SPEAKER_COLORS.length]!;
const AVOID_COLOR = '#ef4444';
const AVOID_FILL = 'repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.32) 0 5px, rgba(239, 68, 68, 0.08) 5px 10px)';

/** The picture's intrinsic size, from the resource or, failing that, the
 *  loaded image. */
function intrinsicOf(resource: Resource): { width: number; height: number } | undefined {
  if (resource.kind === 'bitmap' && resource.bitmap && resource.bitmap.width > 0 && resource.bitmap.height > 0) {
    return { width: resource.bitmap.width, height: resource.bitmap.height };
  }
  if (resource.kind === 'svg' && resource.svg?.width && resource.svg.height) {
    return { width: resource.svg.width, height: resource.svg.height };
  }
  const poster = resource.kind === 'video' ? resource.video?.poster : undefined;
  if (poster && poster.width > 0 && poster.height > 0) return { width: poster.width, height: poster.height };
  return undefined;
}

/** `object-fit` showing `source` of a picture in a box of the same ratio
 *  (as the HTML backend sets a cropped picture). */
function croppedStyle(source: ResourceSafeArea | undefined): CSSProperties {
  if (!source) return { objectFit: 'fill' };
  const x = source.width < 1 ? (source.x / (1 - source.width)) * 100 : 0;
  const y = source.height < 1 ? (source.y / (1 - source.height)) * 100 : 0;
  return { objectFit: 'cover', objectPosition: `${x}% ${y}%` };
}

/** The rectangle `r` of the shown picture, in % of its box. */
function boxStyle(r: ResourceSafeArea): CSSProperties {
  return { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` };
}

const targetKey = (t: MarkTarget) => (t.kind === 'safe' ? 'safe' : `${t.kind}-${t.index}`);

/** Lettering marks only mean something on a picture (a video poster is
 *  cropped like one but never lettered). */
const lettered = (resource: Resource) => resource.kind === 'bitmap' || resource.kind === 'svg';

interface SafeAreaFieldProps {
  resource: Resource;
  /** The new marks (safe area, speakers, avoid zones), normalised. */
  onChange: (marks: PictureMarks) => void;
}

/** The "Safe area & lettering" field of a bitmap or SVG resource, or the
 *  "Safe area" field of a video's poster (the engine crops a poster like a
 *  picture). */
export function SafeAreaField({ resource, onChange }: SafeAreaFieldProps) {
  const labels = useSandboxLabels();
  const fileId = resource.kind === 'bitmap'
    ? resource.bitmap?.fileId
    : resource.kind === 'video' ? resource.video?.poster?.fileId : resource.svg?.fileId;
  const url = useBlobObjectUrl(fileId);
  const marks = marksOf(resource);
  const area = marks.safeArea;
  const withLettering = lettered(resource);
  const [openIn, setOpenIn] = useState<Mode | null>(null);
  const uiLocale = useSandboxSelector((s) => s.locale);
  const share = (v: number) => new Intl.NumberFormat(uiLocale, { maximumFractionDigits: 1 }).format(pct(v));
  const count = (n: number) => new Intl.NumberFormat(uiLocale).format(n);

  return (
    <FieldRow
      stacked
      label={withLettering ? labels.resourceMarksLabel : labels.resourceSafeAreaLabel}
      hint={withLettering ? labels.resourceMarksHint : labels.resourceSafeAreaHint}
      className="mb-0"
    >
      <div className="flex w-full min-w-0 flex-col gap-2">
        {url && (
          <div className="relative inline-block self-start overflow-hidden rounded" style={{ maxWidth: '100%' }}>
            <img src={url} alt="" className="block" style={{ maxWidth: '100%', maxHeight: 140 }} />
            {area && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute"
                style={{ ...boxStyle(area), boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)', outline: '2px solid var(--brand)' }}
              />
            )}
            {withLettering && <ThumbnailMarks marks={marks} />}
          </div>
        )}
        <span className="text-xs text-(--slate)">
          {area
            ? labels.resourceSafeAreaSummary.replace('__w__', share(area.width)).replace('__h__', share(area.height))
            : labels.resourceSafeAreaNone}
        </span>
        {withLettering && (marks.anchors.length > 0 || marks.avoid.length > 0) && (
          <span className="text-xs text-(--slate)">
            {labels.resourceMarksSummary
              .replace('__speakers__', count(marks.anchors.length))
              .replace('__zones__', count(marks.avoid.length))}
          </span>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" icon={<Crop size={13} aria-hidden="true" />} disabled={!url} onClick={() => setOpenIn('safe')}>
            {area ? labels.resourceSafeAreaEdit : labels.resourceSafeAreaMark}
          </Button>
          {withLettering && (
            <Button size="sm" icon={<MessageCircle size={13} aria-hidden="true" />} disabled={!url} onClick={() => setOpenIn('speakers')}>
              {labels.resourceMarksEditLettering}
            </Button>
          )}
          {area && (
            <Button size="sm" variant="ghost" onClick={() => onChange(normalizeMarks({ ...marks, safeArea: undefined }))}>
              {labels.resourceSafeAreaRemove}
            </Button>
          )}
        </div>
      </div>
      {url && (
        <PictureMarksDialog
          open={openIn !== null}
          initialMode={openIn ?? 'safe'}
          url={url}
          resource={resource}
          withLettering={withLettering}
          onClose={() => setOpenIn(null)}
          onSave={(next) => {
            onChange(normalizeMarks(next));
            setOpenIn(null);
          }}
        />
      )}
    </FieldRow>
  );
}

/** Speakers (a dot at each mouth) and avoid zones over the field's
 *  thumbnail, subtly: the dialog is where they are read and edited. */
function ThumbnailMarks({ marks }: { marks: PictureMarks }) {
  if (!marks.anchors.length && !marks.avoid.length) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {marks.avoid.map((r, i) => (
        <div key={`a${i}`} className="absolute" style={{ ...boxStyle(r), border: `1px solid ${AVOID_COLOR}`, background: 'rgba(239, 68, 68, 0.18)' }} />
      ))}
      {marks.anchors.map((a, i) => (
        <span
          key={`s${i}`}
          className="absolute rounded-full"
          style={{
            left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: 7, height: 7, transform: 'translate(-50%, -50%)',
            background: speakerColor(i), boxShadow: '0 0 0 1.5px #fff, 0 0 0 2.5px rgba(0, 0, 0, 0.5)',
          }}
        />
      ))}
    </div>
  );
}

interface PictureMarksDialogProps {
  open: boolean;
  initialMode: Mode;
  url: string;
  resource: Resource;
  withLettering: boolean;
  onClose: () => void;
  onSave: (marks: PictureMarks) => void;
}

function PictureMarksDialog({ open, initialMode, url, resource, withLettering, onClose, onSave }: PictureMarksDialogProps) {
  const labels = useSandboxLabels();
  const container = usePortalContainer();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [marks, setMarksState] = useState<PictureMarks>(() => marksOf(resource));
  const marksRef = useRef(marks);
  const [past, setPast] = useState<PictureMarks[]>([]);
  const [selAnchor, setSelAnchor] = useState<number | null>(null);
  const [selAvoid, setSelAvoid] = useState<number | null>(null);
  const [showIdErrors, setShowIdErrors] = useState(false);
  const [loaded, setLoaded] = useState<{ width: number; height: number } | undefined>(undefined);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<(MarkDrag & { before: PictureMarks; client: Point; moved: boolean; created?: 'anchor' | 'avoid' }) | null>(null);
  const lastNudge = useRef<{ key: string; at: number } | null>(null);
  const markEls = useRef(new Map<string, HTMLElement>());
  const idInputs = useRef(new Map<number, HTMLInputElement>());
  const addButton = useRef<HTMLButtonElement>(null);
  const focusNext = useRef<(() => void) | null>(null);

  const setMarks = (next: PictureMarks) => {
    marksRef.current = next;
    setMarksState(next);
  };
  /** Remember `before` for Undo when it differs from the current marks. */
  const record = (before: PictureMarks) => {
    setPast((p) => (p.length && sameMarks(p[p.length - 1]!, before) ? p : [...p.slice(-49), before]));
  };
  /** Replace the marks, undoably. */
  const commit = (next: PictureMarks) => {
    record(marksRef.current);
    setMarks(next);
  };
  const undo = () => {
    if (!past.length) return;
    setMarks(past[past.length - 1]!);
    setPast(past.slice(0, -1));
  };
  /** Typing an id is one step of Undo, recorded at its first change. */
  const idEdit = useRef<{ index: number; before: PictureMarks; recorded: boolean } | null>(null);

  // Each opening starts from the saved marks, in the mode the field asked
  // for. "Mark safe area" opens with a proposal, as the field always did.
  useEffect(() => {
    if (!open) return;
    const saved = marksOf(resource);
    const start = initialMode === 'safe' && !saved.safeArea ? { ...saved, safeArea: INITIAL_SAFE_AREA } : saved;
    setMarks(start);
    setMode(withLettering ? initialMode : 'safe');
    setPast([]);
    setSelAnchor(saved.anchors.length ? 0 : null);
    setSelAvoid(null);
    setShowIdErrors(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Focus requests made while changing the marks run once React drew them.
  useEffect(() => {
    const f = focusNext.current;
    if (!f) return;
    focusNext.current = null;
    requestAnimationFrame(f);
  });

  const intrinsic = intrinsicOf(resource) ?? loaded;
  const area = marks.safeArea;

  const pointAt = (e: { clientX: number; clientY: number }): Point => {
    const box = stageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
  };

  /** The mark under the pointer that the current mode edits. */
  const markAt = (el: HTMLElement): { target: MarkTarget; handle: Handle } | null => {
    const host = el.closest<HTMLElement>('[data-mark]');
    if (!host) return null;
    const kind = host.dataset.mark as MarkTarget['kind'];
    const editable = mode === 'safe' ? kind === 'safe' : mode === 'speakers' ? kind === 'mouth' || kind === 'head' || kind === 'face' : kind === 'avoid';
    if (!editable) return null;
    const handle = (el.closest<HTMLElement>('[data-handle]')?.dataset.handle as Handle | undefined) ?? 'move';
    const target = kind === 'safe' ? { kind } : { kind, index: Number(host.dataset.index) };
    return { target: target as MarkTarget, handle };
  };

  const select = (t: MarkTarget) => {
    if (t.kind === 'mouth' || t.kind === 'head' || t.kind === 'face') setSelAnchor(t.index);
    if (t.kind === 'avoid') setSelAvoid(t.index);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const p = pointAt(e);
    const before = marksRef.current;
    const hit = markAt(e.target as HTMLElement);
    const base = { before, client: { x: e.clientX, y: e.clientY }, moved: false, origin: p };
    if (hit) {
      select(hit.target);
      drag.current = { ...base, ...hit, start: before };
    } else if (mode === 'safe') {
      // Outside the rectangle: draw a new one from here (its far corner
      // follows the pointer).
      const from = { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1), width: 0, height: 0 };
      drag.current = { ...base, target: { kind: 'safe' }, handle: 'se', start: before, from };
      setMarks(applyDrag(drag.current, { x: p.x + MIN_SIDE, y: p.y + MIN_SIDE }));
    } else if (mode === 'speakers') {
      // On the picture: a new speaker, its mouth here (dragging moves it).
      const start = addAnchor(before, p);
      const index = start.anchors.length - 1;
      setSelAnchor(index);
      setMarks(start);
      drag.current = { ...base, target: { kind: 'mouth', index }, handle: 'move', start, created: 'anchor' };
    } else {
      // A new avoid zone, drawn from here.
      const index = before.avoid.length;
      const from = { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1), width: 0, height: 0 };
      const start = { ...before, avoid: [...before.avoid, from] };
      setSelAvoid(index);
      drag.current = { ...base, target: { kind: 'avoid', index }, handle: 'se', start, from, created: 'avoid' };
      setMarks(applyDrag(drag.current, { x: p.x + MIN_SIDE, y: p.y + MIN_SIDE }));
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.client.x, e.clientY - d.client.y) < 3) return;
    d.moved = true;
    setMarks(applyDrag(d, pointAt(e)));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d) return;
    if (d.created === 'avoid' && !d.moved && d.target.kind === 'avoid') {
      // A plain click: a zone of a usable size around the point.
      const index = d.target.index;
      const zone = zoneAround(d.origin);
      setMarks({ ...marksRef.current, avoid: marksRef.current.avoid.map((r, i) => (i === index ? zone : r)) });
    }
    if (!sameMarks(d.before, marksRef.current)) record(d.before);
    if (d.created === 'anchor' && d.target.kind === 'mouth') {
      // Type the speaker id right away.
      const index = d.target.index;
      focusNext.current = () => {
        const input = idInputs.current.get(index);
        input?.focus();
        input?.select();
      };
      setMarksState({ ...marksRef.current });
    } else if (!d.created && e.pointerType !== 'mouse') {
      // Keep the keyboard where the finger left it.
      markEls.current.get(targetKey(d.target))?.focus({ preventScroll: true });
    }
  };

  /** Arrows nudge the focused mark (Shift: resize a rectangle, or a larger
   *  step for a point); Delete or Backspace removes it. */
  const onMarkKeyDown = (target: MarkTarget) => (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (target.kind === 'safe') return;
      e.preventDefault();
      commit(removeMark(marksRef.current, target));
      if (target.kind === 'mouth') setSelAnchor(null);
      if (target.kind === 'avoid') setSelAvoid(null);
      focusNext.current = () =>
        target.kind === 'head' || target.kind === 'face'
          ? markEls.current.get(targetKey({ kind: 'mouth', index: target.index }))?.focus()
          : addButton.current?.focus();
      setMarksState({ ...marksRef.current });
      return;
    }
    const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    // A run of nudges on one mark is one step of Undo.
    const key = targetKey(target);
    const now = Date.now();
    if (!lastNudge.current || lastNudge.current.key !== key || now - lastNudge.current.at > 1000) record(marksRef.current);
    lastNudge.current = { key, at: now };
    setMarks(nudge(marksRef.current, target, dx, dy, e.shiftKey));
  };

  /** Edit one side of the safe area numerically (in %). */
  const setField = (key: keyof ResourceSafeArea, value: number) => {
    const r = marksRef.current.safeArea;
    if (!r) return;
    const v = clamp(value / 100, 0, 1);
    const next = key === 'x' ? { ...r, x: Math.min(v, 1 - r.width) }
      : key === 'y' ? { ...r, y: Math.min(v, 1 - r.height) }
        : key === 'width' ? { ...r, width: clamp(v, MIN_SIDE, 1 - r.x) }
          : { ...r, height: clamp(v, MIN_SIDE, 1 - r.y) };
    commit({ ...marksRef.current, safeArea: next });
  };

  const addSpeakerAtCentre = () => {
    const next = addAnchor(marksRef.current, { x: 0.5, y: 0.5 });
    const index = next.anchors.length - 1;
    commit(next);
    setSelAnchor(index);
    focusNext.current = () => {
      idInputs.current.get(index)?.focus();
      idInputs.current.get(index)?.select();
    };
  };
  const addAvoidAtCentre = () => {
    const next = { ...marksRef.current, avoid: [...marksRef.current.avoid, zoneAround({ x: 0.5, y: 0.5 }, 0.2)] };
    const index = next.avoid.length - 1;
    commit(next);
    setSelAvoid(index);
    focusNext.current = () => markEls.current.get(targetKey({ kind: 'avoid', index }))?.focus();
  };

  const save = () => {
    const bad = firstAnchorIdProblem(marksRef.current.anchors);
    if (bad >= 0) {
      setShowIdErrors(true);
      setMode('speakers');
      setSelAnchor(bad);
      focusNext.current = () => idInputs.current.get(bad)?.focus();
      setMarksState({ ...marksRef.current });
      return;
    }
    onSave(marksRef.current);
  };

  // The extreme crops, at a preview width: the tallest keeps the whole
  // height (sides cut to the safe area), the shortest the whole width.
  const PREVIEW_W = 96;
  const PREVIEW_MAX_H = 150;
  const previews = intrinsic && area
    ? (() => {
        const range = safeAreaHeightRange(intrinsic.width, intrinsic.height, area, PREVIEW_W);
        return ([
          [labels.resourceSafeAreaTallest, range.max],
          [labels.resourceSafeAreaShortest, range.min],
        ] as const).map(([label, h]) => {
          const k = Math.min(1, PREVIEW_MAX_H / h);
          return {
            label,
            width: PREVIEW_W * k,
            height: h * k,
            style: croppedStyle(safeAreaSource(intrinsic.width, intrinsic.height, area, PREVIEW_W, h)),
          };
        });
      })()
    : [];

  const help = mode === 'safe' ? labels.resourceSafeAreaDialogHelp : mode === 'speakers' ? labels.resourceAnchorsHelp : labels.resourceAvoidHelp;
  const idMessage = (problem: AnchorIdProblem, id: string) =>
    problem === 'empty' ? labels.resourceAnchorIdEmpty
      : problem === 'invalid' ? labels.resourceAnchorIdInvalid
        : problem === 'reserved' ? labels.resourceAnchorIdReserved.replace('__id__', id)
          : labels.resourceAnchorIdDuplicate;
  const nameOf = (i: number) => marks.anchors[i]?.id || String(i + 1);
  const register = (key: string) => (el: HTMLElement | null) => {
    if (el) markEls.current.set(key, el);
    else markEls.current.delete(key);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal container={container}>
        <Dialog.Backdrop className="fixed inset-0" style={{ zIndex: POPUP_Z_INDEX, backgroundColor: 'rgba(0, 0, 0, 0.4)' }} />
        <Dialog.Popup
          data-postext-popup=""
          data-testid="picture-marks-dialog"
          className="fixed left-1/2 top-1/2 flex max-h-[calc(100dvh-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto"
          style={{ ...POPUP_SURFACE, zIndex: POPUP_Z_INDEX, width: 'min(920px, calc(100vw - 32px))', padding: 16, fontSize: 13, lineHeight: '19px' }}
          onKeyDown={(e) => {
            // Undo inside the dialog; a text box keeps its own.
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !(e.target instanceof HTMLInputElement)) {
              e.preventDefault();
              undo();
            }
          }}
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
                { value: 'speakers', label: labels.resourceMarksModeSpeakers },
                { value: 'avoid', label: labels.resourceMarksModeAvoid },
              ]}
              className="self-start"
            />
          )}
          <Dialog.Description className="text-xs text-(--slate)" style={{ margin: 0 }}>
            {help}
          </Dialog.Description>

          <div className="flex flex-wrap items-start gap-4">
            {/* The picture with the marks over it. */}
            <div
              ref={stageRef}
              data-testid="picture-marks-stage"
              className="relative inline-block touch-none select-none"
              style={{ cursor: 'crosshair', maxWidth: '100%', overflow: 'hidden' }}
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
                style={{ maxWidth: 'min(600px, 100%)', maxHeight: '55dvh' }}
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

              {/* Avoid zones. */}
              {withLettering && marks.avoid.map((r, i) => {
                const active = mode === 'avoid';
                const target: MarkTarget = { kind: 'avoid', index: i };
                const label = labels.resourceAvoidZoneAria.replace('__n__', String(i + 1));
                return (
                  <div
                    key={`avoid-${i}`}
                    ref={active ? register(targetKey(target)) : undefined}
                    data-mark="avoid"
                    data-index={i}
                    role={active ? 'group' : undefined}
                    tabIndex={active ? 0 : undefined}
                    aria-label={active ? label : undefined}
                    aria-hidden={active ? undefined : true}
                    onKeyDown={active ? onMarkKeyDown(target) : undefined}
                    onFocus={active ? () => setSelAvoid(i) : undefined}
                    className={`absolute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--foreground) ${active ? '' : 'pointer-events-none'}`}
                    style={{
                      ...boxStyle(r),
                      cursor: active ? 'move' : undefined,
                      background: AVOID_FILL,
                      border: `2px ${active && selAvoid === i ? 'solid' : 'dashed'} ${AVOID_COLOR}`,
                      opacity: active ? 1 : 0.55,
                    }}
                  >
                    <MarkTag color={AVOID_COLOR}>{String(i + 1)}</MarkTag>
                    {active && selAvoid === i && <RectHandles color={AVOID_COLOR} />}
                  </div>
                );
              })}

              {/* Speakers: face rectangle, head–mouth line, head and mouth. */}
              {withLettering && marks.anchors.map((a, i) => {
                const active = mode === 'speakers';
                const color = speakerColor(i);
                const selected = active && selAnchor === i;
                const outside = anchorOutsideSafeArea(a, area);
                const face: MarkTarget = { kind: 'face', index: i };
                const head: MarkTarget = { kind: 'head', index: i };
                const mouth: MarkTarget = { kind: 'mouth', index: i };
                return (
                  <div key={`anchor-${i}`} className={active ? undefined : 'pointer-events-none'} style={{ opacity: active ? 1 : 0.55 }} aria-hidden={active ? undefined : true}>
                    {a.face && (
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
                    {a.head && (
                      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <line
                          x1={a.x * 100} y1={a.y * 100} x2={a.head.x * 100} y2={a.head.y * 100}
                          stroke={color} strokeWidth={2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    )}
                    {a.head && (
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
                      label={labels.resourceAnchorMouthAria.replace('__id__', nameOf(i))}
                      onKeyDown={onMarkKeyDown(mouth)}
                      onFocus={() => setSelAnchor(i)}
                      tag={
                        <>
                          {outside && <TriangleAlert size={10} aria-hidden="true" style={{ color: '#fbbf24' }} />}
                          <span dir="auto">{a.id || '…'}</span>
                        </>
                      }
                    />
                  </div>
                );
              })}
            </div>

            {/* The side panel of the mode. */}
            <div className="flex min-w-[220px] flex-1 flex-col gap-2">
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
                  {marks.avoid.length === 0 && <p className="m-0 text-xs text-(--slate)">{labels.resourceAvoidEmpty}</p>}
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {marks.avoid.map((r, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs"
                        style={{ borderColor: selAvoid === i ? AVOID_COLOR : 'var(--pt-control-border)' }}
                      >
                        <button
                          type="button"
                          className="min-h-7 flex-1 cursor-pointer text-start text-(--foreground) pt-large:min-h-11"
                          onClick={() => {
                            setSelAvoid(i);
                            markEls.current.get(targetKey({ kind: 'avoid', index: i }))?.focus();
                          }}
                        >
                          {labels.resourceAvoidZoneAria.replace('__n__', String(i + 1))}
                          <span className="ms-2 text-(--slate)">{pct(r.width)} × {pct(r.height)} %</span>
                        </button>
                        <IconButton
                          label={labels.resourceAvoidZoneDelete.replace('__n__', String(i + 1))}
                          icon={<Trash2 size={13} aria-hidden="true" />}
                          destructive
                          onClick={() => {
                            commit(removeMark(marksRef.current, { kind: 'avoid', index: i }));
                            setSelAvoid(null);
                            focusNext.current = () => addButton.current?.focus();
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                  <Button ref={addButton} size="sm" icon={<Plus size={13} aria-hidden="true" />} className="self-start" onClick={addAvoidAtCentre}>
                    {labels.resourceAvoidAdd}
                  </Button>
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

/** The eight resize handles of a rectangle being edited: 12 px squares
 *  whose hit area grows to 28 px, and to 44 px with large targets or on a
 *  touch screen. */
function RectHandles({ color }: { color: string }) {
  return (
    <>
      {HANDLES.map((h) => (
        <span
          key={h}
          data-handle={h}
          aria-hidden="true"
          className="absolute h-3 w-3 rounded-sm border border-white after:absolute after:-inset-2 pointer-coarse:after:-inset-4 pt-large:after:-inset-4"
          style={{
            background: color,
            left: h.includes('w') ? -7 : h.includes('e') ? 'calc(100% - 5px)' : 'calc(50% - 6px)',
            top: h.includes('n') ? -7 : h.includes('s') ? 'calc(100% - 5px)' : 'calc(50% - 6px)',
            cursor: `${h === 'n' || h === 's' ? 'ns' : h === 'e' || h === 'w' ? 'ew' : h === 'ne' || h === 'sw' ? 'nesw' : 'nwse'}-resize`,
          }}
        />
      ))}
    </>
  );
}

/** A small label pinned to a mark's corner (a speaker id, a zone number). */
function MarkTag({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute start-0 top-0 inline-flex items-center gap-1 whitespace-nowrap rounded-br px-1 text-[10px] font-semibold leading-[14px] text-white"
      style={{ background: 'rgba(0, 0, 0, 0.72)', borderInlineStart: `3px solid ${color}` }}
    >
      {children}
    </span>
  );
}

interface PointMarkProps {
  markRef?: (el: HTMLElement | null) => void;
  kind: 'mouth' | 'head';
  index: number;
  point: Point;
  color: string;
  active: boolean;
  selected?: boolean;
  label: string;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  onFocus: () => void;
  tag?: ReactNode;
}

/** A draggable point: a 44 px target centred on it, drawn as a filled dot
 *  (mouth) or a ring (head), with the speaker id beside the mouth. */
function PointMark({ markRef, kind, index, point, color, active, selected, label, onKeyDown, onFocus, tag }: PointMarkProps) {
  const dot = kind === 'mouth' ? 14 : 12;
  return (
    <div
      ref={markRef}
      data-mark={kind}
      data-index={index}
      role={active ? 'group' : undefined}
      tabIndex={active ? 0 : undefined}
      aria-label={active ? label : undefined}
      onKeyDown={active ? onKeyDown : undefined}
      onFocus={active ? onFocus : undefined}
      className="group absolute flex items-center justify-center rounded-full outline-none"
      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, width: 44, height: 44, transform: 'translate(-50%, -50%)', cursor: active ? 'grab' : undefined }}
    >
      <span
        aria-hidden="true"
        className="block rounded-full group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-white"
        style={{
          width: dot,
          height: dot,
          background: kind === 'mouth' ? color : 'rgba(0, 0, 0, 0.35)',
          border: kind === 'mouth' ? '2px solid #fff' : `3px solid ${color}`,
          boxShadow: selected ? `0 0 0 3px rgba(0, 0, 0, 0.55), 0 0 0 6px ${color}` : '0 0 0 1.5px rgba(0, 0, 0, 0.6)',
        }}
      />
      {tag && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inline-flex items-center gap-1 whitespace-nowrap rounded px-1 text-[10px] font-semibold leading-[14px] text-white"
          style={{ left: 30, top: 2, background: 'rgba(0, 0, 0, 0.72)', borderInlineStart: `3px solid ${color}` }}
        >
          {tag}
        </span>
      )}
    </div>
  );
}
