// The marks dialog's state: the marks and their Undo, the selection, the
// zoom and touch refs, and the reset each opening makes.
import { useSandboxStore, useSandboxDispatch } from '../../../../../context/SandboxContext.js';
import { type MarkdownLabel, anchorLabelState } from '../../figureLabels.js';
import type { LabelLeaderChoice } from '../../../../../editor/syntax/labelAttrs.js';
import { labelLeaderEdit } from '../../labelLeaderEdit.js';
import { applyViewerEdit } from '../../../../../editor/viewerEdits.js';
import { usePortalContainer } from '../../../../../ui/index.js';
import { useState, useRef, useMemo, useEffect } from 'react';
import type { Mode } from '../../SafeAreaEditor.js';
import { type PictureMarks, marksOf, type ZoneTarget, type MarkDrag, type Point, sameMarks, INITIAL_SAFE_AREA } from '../../pictureMarks.js';
import { DENSE_ANCHORS } from '../../LabelAnchorsPanel.js';
import type { Resource, LabelStyle } from 'postext';
import type { AnchorEditorRequest } from '../../anchorEditorRequest.js';

/** What useMarksState takes from PictureMarksDialog. */
export interface UseMarksStateDeps {
  open: boolean;
  initialMode: Mode;
  resource: Resource;
  withLettering: boolean;
  labelStyles: readonly LabelStyle[];
  figureLabels: readonly MarkdownLabel[];
  request: AnchorEditorRequest | null;
}

export function useMarksState(deps: UseMarksStateDeps) {
  const {
    open, initialMode, resource, withLettering, labelStyles, figureLabels, request
  } = deps;
  const store = useSandboxStore();
  const dispatch = useSandboxDispatch();
  /** A label's own `leader` attribute written into its chapter (#1064):
   *  the text's, so it is not part of the dialog's marks nor of its Undo. */
  const setLabelLeader = (label: MarkdownLabel, choice: LabelLeaderChoice) => {
    const s = store.getSnapshot();
    const edit = labelLeaderEdit({ chapters: s.chapters, activeChapterId: s.activeChapterId, markdown: s.markdown }, label, choice);
    if (edit) applyViewerEdit(dispatch, edit.chapterId, [edit.change], edit.baseLength);
  };
  const styleHasLeader = (id: string | undefined) => !!id && labelStyles.some((st) => st.id === id && st.leader !== undefined);
  const container = usePortalContainer();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [marks, setMarksState] = useState<PictureMarks>(() => marksOf(resource));
  const marksRef = useRef(marks);
  const [past, setPast] = useState<PictureMarks[]>([]);
  const [selAnchor, setSelAnchor] = useState<number | null>(null);
  /** The avoid zone or the bystander's face the Avoid zones mode acts on. */
  const [selZone, setSelZone] = useState<ZoneTarget | null>(null);
  const zoneSelected = (t: ZoneTarget) => selZone?.kind === t.kind && selZone.index === t.index;
  const [showIdErrors, setShowIdErrors] = useState(false);
  /** The name the text uses that the next click on the picture places
   *  (Anchors mode). */
  const [placing, setPlacing] = useState<string | null>(null);
  /** The anchors ticked to change their label fields together (#931), the
   *  point the pointer is over, and whether a dense map names every point
   *  (unset: only the points in hand). */
  const [ticked, setTicked] = useState<ReadonlySet<number>>(() => new Set());
  const [hoverAnchor, setHoverAnchor] = useState<number | null>(null);
  const [namesOnDense, setNamesOnDense] = useState(false);
  const placingRef = useRef<string | null>(null);
  placingRef.current = placing;
  /** The zoom of the picture (1 = the picture fits), the hand tool, and the
   *  scroll a zoom step keeps under its focus (#956). */
  const [zoom, setZoom] = useState(1);
  const [hand, setHand] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const zoomFocus = useRef<{ fx: number; fy: number; ox: number; oy: number } | null>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  /** The fingers on the stage, and the pinch two of them make (#970): the
   *  zoom and distance when the second went down and the point of the
   *  picture between them, as fractions of its extent. */
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ zoom: number; distance: number; fx: number; fy: number; last: number; ox: number; oy: number } | null>(null);
  const pinchFrame = useRef(0);
  /** The name being placed when the press that a second finger took back
   *  went down. */
  const placingAtDown = useRef<string | null>(null);
  const labelState = useMemo(() => anchorLabelState(marks.anchors, figureLabels), [marks.anchors, figureLabels]);
  const [loaded, setLoaded] = useState<{ width: number; height: number } | undefined>(undefined);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<(MarkDrag & { before: PictureMarks; client: Point; moved: boolean; created?: 'anchor' | 'placed' | 'avoid' | 'label' }) | null>(null);
  const lastNudge = useRef<{ key: string; at: number } | null>(null);
  const markEls = useRef(new Map<string, HTMLElement>());
  const idInputs = useRef(new Map<number, HTMLInputElement>());
  const addButton = useRef<HTMLButtonElement>(null);
  const zoneSwitches = useRef(new Map<string, HTMLElement>());
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
    const asked = request?.anchor !== undefined ? saved.anchors.findIndex((a) => a.id === request.anchor) : -1;
    setSelAnchor(asked >= 0 ? asked : saved.anchors.length && initialMode !== 'labels' ? 0 : null);
    setSelZone(null);
    setTicked(new Set());
    setNamesOnDense(false);
    setZoom(1);
    setHand(false);
    setShowIdErrors(false);
    // The Anchors mode starts placing the name asked for, else the first
    // name the text uses that the picture lacks: each click places one.
    const waiting = anchorLabelState(saved.anchors, figureLabels).waiting;
    setPlacing(initialMode !== 'labels' ? null : request?.place && waiting.includes(request.place) ? request.place : request?.anchor !== undefined ? null : (waiting[0] ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Focus requests made while changing the marks run once React drew them.
  useEffect(() => {
    const f = focusNext.current;
    if (!f) return;
    focusNext.current = null;
    requestAnimationFrame(f);
  });

  // Indices shift when an anchor is added or taken away: the ticks start over.
  const anchorCount = marks.anchors.length;
  useEffect(() => {
    setTicked((t) => (t.size === 0 ? t : new Set()));
  }, [anchorCount]);
  const tick = (indices: readonly number[], on: boolean) => {
    setTicked((t) => {
      const next = new Set(t);
      for (const i of indices) {
        if (on) next.add(i);
        else next.delete(i);
      }
      return next;
    });
  };
  const denseMap = marks.anchors.length > DENSE_ANCHORS;
  return {
    setLabelLeader, styleHasLeader, container, mode, setMode, marks, setMarksState, marksRef, past,
    selAnchor, setSelAnchor, setSelZone, zoneSelected, showIdErrors, setShowIdErrors, placing,
    setPlacing, ticked, hoverAnchor, setHoverAnchor, namesOnDense, setNamesOnDense, placingRef, zoom,
    setZoom, hand, setHand, spaceDown, setSpaceDown, viewportRef, zoomFocus, pan, touches, pinch,
    pinchFrame, placingAtDown, labelState, loaded, setLoaded, stageRef, drag, lastNudge, markEls,
    idInputs, addButton, zoneSwitches, focusNext, setMarks, record, commit, undo, idEdit, tick,
    denseMap
  };
}
