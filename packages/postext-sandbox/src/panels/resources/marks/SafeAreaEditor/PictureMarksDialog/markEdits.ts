// The marks dialog's edits from its side panel: safe area fields, marks
// added at the centre, anchor names, and Save.
import { type ResourceSafeArea, safeAreaHeightRange, safeAreaSource } from 'postext';
import { clamp, MIN_SIDE, addAnchor, labelFieldsOf, removeMark, type PictureMarks, zoneAround, addBystanderFace, type ZoneTarget, switchZone, firstAnchorIdProblem, type AnchorIdProblem } from '../../pictureMarks.js';
import { anchorLabelState, type MarkdownLabel } from '../../figureLabels.js';
import { targetKey, croppedStyle } from '../markStyles.js';
import type { SandboxLabels } from '../../../../../types/labels.js';
import type { Mode } from '../../SafeAreaEditor.js';

/** What createMarkEdits takes from PictureMarksDialog. */
export interface MarkEditsDeps {
  figureLabels: readonly MarkdownLabel[];
  onSave: (marks: PictureMarks) => void;
  labels: SandboxLabels;
  mode: Mode;
  setMode: React.Dispatch<React.SetStateAction<Mode>>;
  marks: PictureMarks;
  setMarksState: React.Dispatch<React.SetStateAction<PictureMarks>>;
  marksRef: React.RefObject<PictureMarks>;
  selAnchor: number | null;
  setSelAnchor: React.Dispatch<React.SetStateAction<number | null>>;
  setSelZone: React.Dispatch<React.SetStateAction<ZoneTarget | null>>;
  setShowIdErrors: React.Dispatch<React.SetStateAction<boolean>>;
  setPlacing: React.Dispatch<React.SetStateAction<string | null>>;
  placingRef: React.RefObject<string | null>;
  markEls: React.RefObject<Map<string, HTMLElement>>;
  idInputs: React.RefObject<Map<number, HTMLInputElement>>;
  addButton: React.RefObject<HTMLButtonElement | null>;
  zoneSwitches: React.RefObject<Map<string, HTMLElement>>;
  focusNext: React.RefObject<(() => void) | null>;
  setMarks: (next: PictureMarks) => void;
  record: (before: PictureMarks) => void;
  commit: (next: PictureMarks) => void;
  idEdit: React.RefObject<{ index: number; before: PictureMarks; recorded: boolean; } | null>;
  intrinsic: { width: number; height: number; } | undefined;
  area: ResourceSafeArea | undefined;
}

export function createMarkEdits(deps: MarkEditsDeps) {
  const {
    figureLabels, onSave, labels, mode, setMode, marks, setMarksState, marksRef, selAnchor,
    setSelAnchor, setSelZone, setShowIdErrors, setPlacing, placingRef, markEls, idInputs, addButton,
    zoneSwitches, focusNext, setMarks, record, commit, idEdit, intrinsic, area
  } = deps;
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
  /** Anchors mode: a new anchor in the middle of the picture (or the name
   *  being placed), its name to type. */
  const addLabelAnchorAtCentre = () => {
    const before = marksRef.current;
    const name = placingRef.current;
    const fields = labelFieldsOf(selAnchor !== null ? before.anchors[selAnchor] : undefined);
    const next = addAnchor(before, { x: 0.5, y: 0.5 }, { ...(name && !before.anchors.some((a) => a.id === name) ? { id: name } : { prefix: 'anchor' }), fields });
    const index = next.anchors.length - 1;
    commit(next);
    setSelAnchor(index);
    if (name) setPlacing(anchorLabelState(next.anchors, figureLabels).waiting[0] ?? null);
    focusNext.current = () => {
      idInputs.current.get(index)?.focus();
      idInputs.current.get(index)?.select();
    };
  };
  /** Anchors mode: the anchor `index` taken away. */
  const removeLabelAnchor = (index: number) => {
    commit(removeMark(marksRef.current, { kind: 'mouth', index }));
    setSelAnchor(null);
    focusNext.current = () => addButton.current?.focus();
  };
  /** Anchors mode: a text field's edit, one step of Undo from its first
   *  change. */
  const beginAnchorEdit = (index: number) => {
    if (idEdit.current?.index === index && !idEdit.current.recorded) return;
    idEdit.current = { index, before: marksRef.current, recorded: false };
  };
  const anchorEdit = (next: PictureMarks) => {
    const edit = idEdit.current;
    if (edit && !edit.recorded) {
      record(edit.before);
      edit.recorded = true;
    }
    setMarks(next);
  };
  const addAvoidAtCentre = () => {
    const next = { ...marksRef.current, avoid: [...marksRef.current.avoid, zoneAround({ x: 0.5, y: 0.5 }, 0.2)] };
    const index = next.avoid.length - 1;
    commit(next);
    setSelZone({ kind: 'avoid', index });
    focusNext.current = () => markEls.current.get(targetKey({ kind: 'avoid', index }))?.focus();
  };
  const addBystanderAtCentre = () => {
    const next = addBystanderFace(marksRef.current, { x: 0.5, y: 0.5 });
    const target: ZoneTarget = { kind: 'bystander', index: next.faces.length - 1 };
    commit(next);
    setSelZone(target);
    focusNext.current = () => markEls.current.get(targetKey(target))?.focus();
  };
  /** Move a rectangle to the other list (zone ⇄ bystander's face) and keep
   *  the keyboard on its switch. */
  const switchKind = (target: ZoneTarget) => {
    const moved = switchZone(marksRef.current, target);
    commit(moved.marks);
    setSelZone(moved.target);
    focusNext.current = () => zoneSwitches.current.get(targetKey(moved.target))?.focus();
  };

  const save = () => {
    const bad = firstAnchorIdProblem(marksRef.current.anchors);
    if (bad >= 0) {
      setShowIdErrors(true);
      setMode(mode === 'labels' ? 'labels' : 'speakers');
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

  const help = mode === 'safe' ? labels.resourceSafeAreaDialogHelp
    : mode === 'labels' ? labels.resourceLabelAnchorsHelp
      : mode === 'speakers' ? labels.resourceAnchorsHelp
        : labels.resourceAvoidHelp;
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
  return {
    setField, addSpeakerAtCentre, addLabelAnchorAtCentre, removeLabelAnchor, beginAnchorEdit,
    anchorEdit, addAvoidAtCentre, addBystanderAtCentre, switchKind, save, previews, help, idMessage,
    nameOf, register
  };
}
