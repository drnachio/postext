'use client';

import { type MutableRefObject, useState, useId, useRef, useEffect, useMemo } from 'react';
import { MapPin, X, TriangleAlert, Plus } from 'lucide-react';
import type { LabelStyle, ResourceSafeArea, ResourceAnchor } from 'postext';
import { useSandboxLabels } from '../../../context/SandboxContext.js';
import { IconButton, Button, Switch } from '../../../ui/index.js';
import { type PictureMarks, type LabelFields, withLabelFields, type AnchorIdProblem, anchorIdProblem, anchorOutsideSafeArea } from './pictureMarks.js';
import type { MarkdownLabel } from './figureLabels.js';
import type { LabelLeaderChoice } from '../../../editor/syntax/labelAttrs.js';
import { AnchorFields, noLeader } from './LabelAnchorsPanel/AnchorFields.js';
import { TickedFields, TickBox } from './LabelAnchorsPanel/TickedFields.js';

export { LeaderFields } from './LabelAnchorsPanel/AnchorFields.js';

// ---------------------------------------------------------------------------
// The Anchors mode of the picture marks dialog (#866): the anchors a map's
// or a diagram's `::label` lines stand at, as a list. The names the text
// uses that the picture has no anchor for are offered first; the one
// picked is placed by the next click on the picture. Each anchor has a
// name, a label style and the label fields a label set at it takes
// (alignment, vertical alignment, rotation, width, writing). Anchors can be
// ticked, in the list or Shift-clicked on the picture (#931), and the ticked
// ones take a style, an alignment or a writing mode together; a dense map
// names only the points picked, hovered or ticked.
// ---------------------------------------------------------------------------

/** One colour per label style (cycled), so the points of a style read as
 *  one kind of name; anchors with no style are white. */
const STYLE_COLORS = ['#f97316', '#22d3ee', '#facc15', '#a3e635', '#e879f9', '#60a5fa', '#f87171', '#34d399', '#c084fc'];
export function labelStyleColor(style: string | undefined, styles: readonly LabelStyle[]): string {
  if (!style) return '#f8fafc';
  const i = styles.findIndex((s) => s.id === style);
  return STYLE_COLORS[(i < 0 ? styles.length : i) % STYLE_COLORS.length]!;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface LabelAnchorsPanelProps {
  marks: PictureMarks;
  area: ResourceSafeArea | undefined;
  labelStyles: readonly LabelStyle[];
  /** The labels the text sets at each anchor. */
  byAnchor: Map<string, MarkdownLabel[]>;
  /** Names labels stand at that the picture lacks. */
  waiting: readonly string[];
  waitingLabel: Map<string, MarkdownLabel>;
  placing: string | null;
  onPlacing: (name: string | null) => void;
  selected: number | null;
  onSelect: (index: number | null) => void;
  /** Replace the marks, undoably. */
  commit: (next: PictureMarks) => void;
  /** Replace the marks while typing (one step of Undo per edit, recorded
   *  by `beginEdit`). */
  edit: (next: PictureMarks) => void;
  beginEdit: (index: number) => void;
  remove: (index: number) => void;
  addAtCentre: () => void;
  showIdErrors: boolean;
  idInputs: MutableRefObject<Map<number, HTMLInputElement>>;
  addButton: MutableRefObject<HTMLButtonElement | null>;
  /** The anchors ticked for a change of all at once. */
  ticked: ReadonlySet<number>;
  onTick: (indices: readonly number[], on: boolean) => void;
  /** The names on the picture: every point's, or those of the points picked,
   *  hovered or ticked. */
  showNames: boolean;
  onShowNames: (on: boolean) => void;
  denseMap: boolean;
  /** Write a label's own `leader` attribute into its chapter (#1064). */
  onLabelLeader?: (label: MarkdownLabel, choice: LabelLeaderChoice) => void;
  /** Whether label style `id` has a leader look (a label away from its
   *  point then gets a leader by default). */
  styleHasLeader?: (id: string | undefined) => boolean;
}

/** From how many anchors a map is dense: names are shown for the points in
 *  hand only unless asked for. */
export const DENSE_ANCHORS = 24;

/** The value of `field` the ticked anchors share, undefined when they differ
 *  (or when there are none). `undefined` as a value is read as the default
 *  by `fieldOf`. */
export function sharedField<K extends keyof LabelFields>(anchors: readonly ResourceAnchor[], indices: Iterable<number>, key: K, fallback: LabelFields[K]): { value: LabelFields[K]; mixed: boolean } | undefined {
  let first = true;
  let value: LabelFields[K] = fallback;
  for (const i of indices) {
    const a = anchors[i];
    if (!a) continue;
    const v = (a[key] ?? fallback) as LabelFields[K];
    if (first) {
      value = v;
      first = false;
    } else if (v !== value) {
      return { value: fallback, mixed: true };
    }
  }
  return first ? undefined : { value, mixed: false };
}

/** `marks` with `patch` set on every ticked anchor: one change. */
export function withTickedFields(marks: PictureMarks, indices: Iterable<number>, patch: Parameters<typeof withLabelFields>[2]): PictureMarks {
  let next = marks;
  for (const i of indices) next = withLabelFields(next, i, patch);
  return next;
}

export function LabelAnchorsPanel(props: LabelAnchorsPanelProps) {
  const { marks, area, labelStyles, byAnchor, waiting, waitingLabel, placing, onPlacing, selected, onSelect, commit, edit, beginEdit, remove, addAtCentre, showIdErrors, idInputs, addButton, ticked, onTick, showNames, onShowNames, denseMap, onLabelLeader, styleHasLeader } = props;
  const labels = useSandboxLabels();
  const [filter, setFilter] = useState('');
  const uid = useId();
  const rows = useRef(new Map<number, HTMLLIElement>());
  const list = useRef<HTMLUListElement>(null);

  // The anchor picked from elsewhere (the canvas, a warning, a click on
  // its point) comes into view in the list, which alone scrolls: the
  // picture stays where the pointer is.
  useEffect(() => {
    if (selected === null) return;
    const row = rows.current.get(selected);
    const box = list.current;
    if (!row || !box) return;
    const top = row.offsetTop;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (top + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top + row.offsetHeight - box.clientHeight;
  }, [selected]);

  const visible = useMemo(() => {
    const q = fold(filter.trim());
    return marks.anchors
      .map((a, i) => ({ a, i }))
      .filter(({ a, i }) => !q || i === selected || fold(a.id).includes(q) || (byAnchor.get(a.id) ?? []).some((l) => fold(l.text).includes(q)));
  }, [marks.anchors, filter, byAnchor, selected]);

  const styleOptions = [
    { value: '', label: labels.resourceLabelAnchorsStyleNone },
    ...labelStyles.map((s) => ({ value: s.id, label: s.name && s.name !== s.id ? `${s.name} (${s.id})` : s.id })),
  ];
  const idMessage = (problem: AnchorIdProblem, id: string) =>
    problem === 'empty' ? labels.resourceLabelAnchorsNameEmpty
      : problem === 'invalid' ? labels.resourceAnchorIdInvalid
        : problem === 'reserved' ? labels.resourceAnchorIdReserved.replace('__id__', id)
          : labels.resourceLabelAnchorsNameDuplicate;

  return (
    <>
      {waiting.length > 0 && (
        <section aria-labelledby={`${uid}-waiting`} className="flex flex-col gap-1.5 rounded-md border p-2" style={{ borderColor: 'var(--pt-control-border)' }}>
          <h3 id={`${uid}-waiting`} className="m-0 text-xs font-semibold">{labels.resourceLabelAnchorsWaiting.replace('__n__', String(waiting.length))}</h3>
          <p className="m-0 text-xs text-(--slate)">{labels.resourceLabelAnchorsWaitingHint}</p>
          <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
            {waiting.map((name) => {
              const label = waitingLabel.get(name);
              const on = placing === name;
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={on}
                  title={label?.text}
                  onClick={() => onPlacing(on ? null : name)}
                  className="inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-full border px-2 text-xs pt-large:min-h-11"
                  style={{
                    borderColor: on ? 'var(--brand)' : 'var(--pt-control-border)',
                    background: on ? 'var(--brand)' : 'var(--surface)',
                    color: on ? 'var(--background)' : 'var(--foreground)',
                  }}
                >
                  <MapPin size={11} aria-hidden="true" />
                  <span className="font-mono" dir="auto">{name}</span>
                  {label?.text && label.text !== name && <span dir="auto" className="max-w-[9rem] truncate opacity-75">{label.text}</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}
      <p role="status" aria-live="polite" className="m-0 flex min-h-5 items-center gap-1.5 text-xs" style={{ color: placing ? 'var(--brand)' : 'var(--slate)' }}>
        {placing && (
          <>
            <MapPin size={12} aria-hidden="true" />
            <span className="min-w-0 flex-1">{labels.resourceLabelAnchorsPlacing.replace('__id__', placing)}</span>
            <IconButton label={labels.resourceLabelAnchorsStopPlacing} icon={<X size={12} aria-hidden="true" />} onClick={() => onPlacing(null)} />
          </>
        )}
      </p>

      {marks.anchors.length === 0 && <p className="m-0 text-xs text-(--slate)">{labels.resourceLabelAnchorsEmpty}</p>}
      {marks.anchors.length > 8 && (
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label={labels.resourceLabelAnchorsFilter}
          placeholder={labels.resourceLabelAnchorsFilter}
          className="h-7 rounded-md border bg-(--surface) px-2 text-xs text-(--foreground) outline-none focus:outline-2 focus:outline-offset-1 focus:outline-(--brand) pt-large:h-11"
          style={{ borderColor: 'var(--pt-control-border)' }}
        />
      )}
      {marks.anchors.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          <Button size="sm" onClick={() => onTick(visible.map(({ i }) => i), true)}>{labels.resourceLabelAnchorsSelectShown}</Button>
          {ticked.size > 0 && (
            <>
              <span role="status" aria-live="polite" className="text-(--slate)">{labels.resourceLabelAnchorsSelected.replace('__n__', String(ticked.size))}</span>
              <Button size="sm" onClick={() => onTick([...ticked], false)}>{labels.resourceLabelAnchorsSelectClear}</Button>
            </>
          )}
          {denseMap && (
            <span className="ms-auto inline-flex items-center gap-2">
              <span id={`${uid}-names`} className="text-(--slate)">{labels.resourceLabelAnchorsNamesOnPicture}</span>
              <Switch checked={showNames} onCheckedChange={onShowNames} ariaLabelledBy={`${uid}-names`} ariaDescribedBy={`${uid}-names-hint`} />
            </span>
          )}
        </div>
      )}
      {marks.anchors.length > 1 && <p id={`${uid}-names-hint`} className="m-0 text-[11px] text-(--slate)">{ticked.size === 0 ? labels.resourceLabelAnchorsBulkHint : denseMap ? labels.resourceLabelAnchorsNamesHint : ''}</p>}
      {ticked.size > 0 && (
        <TickedFields marks={marks} ticked={ticked} styleOptions={styleOptions} commit={commit} />
      )}
      <ul ref={list} className="relative m-0 flex min-h-24 shrink list-none flex-col gap-1 overflow-y-auto p-0" aria-label={labels.resourceMarksModeAnchors}>
        {visible.map(({ a, i }) => {
          const open = selected === i;
          const color = labelStyleColor(a.style, labelStyles);
          const texts = byAnchor.get(a.id) ?? [];
          const problem = anchorIdProblem(marks.anchors, i);
          const shown = problem && (showIdErrors || problem !== 'empty') ? problem : undefined;
          const outside = anchorOutsideSafeArea(a, area);
          const styleName = a.style ? (labelStyles.find((s) => s.id === a.style)?.name ?? a.style) : '';
          return (
            <li
              key={i}
              ref={(el) => { if (el) rows.current.set(i, el); else rows.current.delete(i); }}
              className="flex flex-col gap-1.5 rounded-md border px-2 py-1"
              style={{ borderColor: open ? color : 'var(--pt-control-border)', borderInlineStartWidth: 4, borderInlineStartColor: color }}
              onFocusCapture={() => { if (!open) onSelect(i); }}
            >
              {!open ? (
                <div className="flex items-center gap-2">
                  <TickBox checked={ticked.has(i)} label={labels.resourceLabelAnchorsSelectRow.replace('__id__', a.id || String(i + 1))} onChange={(on) => onTick([i], on)} />
                  <button type="button" className="flex min-h-7 min-w-0 flex-1 cursor-pointer items-center gap-2 text-start text-xs pt-large:min-h-11" onClick={() => onSelect(i)}>
                    <span className="font-mono text-(--foreground)" dir="auto">{a.id || '…'}</span>
                    <span dir="auto" className="min-w-0 flex-1 truncate" style={{ color: texts.length ? 'var(--foreground)' : 'var(--slate)', fontStyle: texts.length ? undefined : 'italic' }}>
                      {texts.length ? texts[0]!.text : labels.resourceLabelAnchorsNoLabel}
                    </span>
                    {styleName && <span className="shrink-0 text-[11px] text-(--slate)">{styleName}</span>}
                    {(shown || outside) && <TriangleAlert size={12} aria-hidden="true" style={{ color: shown ? '#ef4444' : '#d97706' }} />}
                  </button>
                </div>
              ) : (
                <AnchorFields
                  tick={<TickBox checked={ticked.has(i)} label={labels.resourceLabelAnchorsSelectRow.replace('__id__', a.id || String(i + 1))} onChange={(on) => onTick([i], on)} />}
                  anchor={a}
                  index={i}
                  marks={marks}
                  texts={texts}
                  styleOptions={styleOptions}
                  problem={shown}
                  problemText={shown ? idMessage(shown, a.id) : undefined}
                  outside={outside}
                  commit={commit}
                  edit={edit}
                  beginEdit={beginEdit}
                  remove={remove}
                  idInputs={idInputs}
                  onLabelLeader={onLabelLeader}
                  styleHasLeader={styleHasLeader ?? noLeader}
                />
              )}
            </li>
          );
        })}
      </ul>
      <Button ref={addButton} size="sm" icon={<Plus size={13} aria-hidden="true" />} className="self-start" onClick={addAtCentre}>
        {labels.resourceLabelAnchorsAdd}
      </Button>
    </>
  );
}
