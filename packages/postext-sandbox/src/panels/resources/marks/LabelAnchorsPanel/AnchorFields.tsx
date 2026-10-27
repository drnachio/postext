'use client';

// The fields of one anchor of a picture and of its label's leader line
// (#1276: split out of LabelAnchorsPanel.tsx).
import { type ReactNode, type MutableRefObject, useId } from 'react';
import { Trash2, TriangleAlert } from 'lucide-react';
import type { ResourceAnchor, LeaderStyle } from 'postext';
import { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { IconButton, Select, SegmentedControl, NumberField, Switch } from '../../../../ui/index.js';
import { type PictureMarks, type AnchorIdProblem, withLabelFields, withAnchor, leaderChoiceOf, withLeader, leaderDrawn, withLabelAway, withPoint, type LeaderChoice } from '../pictureMarks.js';
import type { MarkdownLabel } from '../figureLabels.js';
import type { LabelLeaderChoice } from '../../../../editor/syntax/labelAttrs.js';
import { labelLeaderChoice } from '../labelLeaderEdit.js';

interface AnchorFieldsProps {
  /** The checkbox that ticks the anchor, before its name. */
  tick: ReactNode;
  anchor: ResourceAnchor;
  index: number;
  marks: PictureMarks;
  texts: readonly MarkdownLabel[];
  styleOptions: { value: string; label: string }[];
  problem?: AnchorIdProblem;
  problemText?: string;
  outside: boolean;
  commit: (next: PictureMarks) => void;
  edit: (next: PictureMarks) => void;
  beginEdit: (index: number) => void;
  remove: (index: number) => void;
  idInputs: MutableRefObject<Map<number, HTMLInputElement>>;
  onLabelLeader?: (label: MarkdownLabel, choice: LabelLeaderChoice) => void;
  styleHasLeader: (id: string | undefined) => boolean;
}

export const noLeader = () => false;

/** The fields of the anchor picked in the list. */
export function AnchorFields({ tick, anchor: a, index: i, marks, texts, styleOptions, problem, problemText, outside, commit, edit, beginEdit, remove, idInputs, onLabelLeader, styleHasLeader }: AnchorFieldsProps) {
  const labels = useSandboxLabels();
  const uid = useId();
  const set = (patch: Parameters<typeof withLabelFields>[2]) => commit(withLabelFields(marks, i, patch));
  return (
    <div className="flex flex-col gap-1.5 py-1 text-xs">
      <div className="flex items-center gap-2">
        {tick}
        <label htmlFor={`${uid}-id`} className="shrink-0 text-(--slate)">{labels.resourceLabelAnchorsNameLabel}</label>
        <input
          ref={(el) => { if (el) idInputs.current.set(i, el); else idInputs.current.delete(i); }}
          id={`${uid}-id`}
          dir="auto"
          type="text"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          value={a.id}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem || outside ? `${uid}-msg` : undefined}
          onFocus={() => beginEdit(i)}
          onChange={(e) => edit(withAnchor(marks, i, (x) => ({ ...x, id: e.target.value.replace(/\s+/g, '') })))}
          className="h-7 min-w-0 flex-1 rounded-md border bg-(--surface) px-2 font-mono text-xs text-(--foreground) outline-none focus:outline-2 focus:outline-offset-1 focus:outline-(--brand) pt-large:h-11"
          style={{ borderColor: problem ? '#ef4444' : 'var(--pt-control-border)' }}
        />
        <IconButton
          label={labels.resourceLabelAnchorsDelete.replace('__id__', a.id || String(i + 1))}
          icon={<Trash2 size={13} aria-hidden="true" />}
          destructive
          onClick={() => remove(i)}
        />
      </div>
      {(problem || outside) && (
        <div id={`${uid}-msg`} className="flex flex-col gap-0.5">
          {problem && <span style={{ color: 'var(--pt-error, #ef4444)' }}>{problemText}</span>}
          {outside && (
            <span className="inline-flex items-start gap-1" style={{ color: 'var(--pt-warning, #d97706)' }}>
              <TriangleAlert size={12} aria-hidden="true" className="mt-[3px] shrink-0" />
              {labels.resourceAnchorOutsideSafeArea}
            </span>
          )}
        </div>
      )}
      <p dir="auto" className="m-0" style={{ color: texts.length ? 'var(--foreground)' : 'var(--slate)', fontStyle: texts.length ? undefined : 'italic' }}>
        {texts.length ? texts.map((t) => t.text).join(' · ') : labels.resourceLabelAnchorsNoLabel}
      </p>
      <div className="flex items-center gap-2">
        <span id={`${uid}-style`} className="w-24 shrink-0 text-(--slate)">{labels.resourceLabelAnchorsStyle}</span>
        <Select
          value={a.style ?? ''}
          onValueChange={(v) => set({ style: v || undefined })}
          options={styleOptions}
          ariaLabelledBy={`${uid}-style`}
          muted={!a.style}
          className="min-w-0 flex-1"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span id={`${uid}-align`} className="w-24 shrink-0 text-(--slate)">{labels.resourceLabelAnchorsAlign}</span>
        <SegmentedControl<'start' | 'center' | 'end'>
          size="sm"
          value={a.align ?? 'center'}
          onValueChange={(v) => set({ align: v })}
          ariaLabel={labels.resourceLabelAnchorsAlign}
          ariaLabelledBy={`${uid}-align`}
          options={[
            { value: 'start', label: labels.resourceLabelAnchorsAlignStart },
            { value: 'center', label: labels.resourceLabelAnchorsAlignCenter },
            { value: 'end', label: labels.resourceLabelAnchorsAlignEnd },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span id={`${uid}-valign`} className="w-24 shrink-0 text-(--slate)">{labels.resourceLabelAnchorsVerticalAlign}</span>
        <SegmentedControl<'top' | 'middle' | 'bottom'>
          size="sm"
          value={a.verticalAlign ?? 'middle'}
          onValueChange={(v) => set({ verticalAlign: v })}
          ariaLabel={labels.resourceLabelAnchorsVerticalAlign}
          ariaLabelledBy={`${uid}-valign`}
          options={[
            { value: 'top', label: labels.resourceLabelAnchorsVerticalTop },
            { value: 'middle', label: labels.resourceLabelAnchorsVerticalMiddle },
            { value: 'bottom', label: labels.resourceLabelAnchorsVerticalBottom },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span id={`${uid}-writing`} className="w-24 shrink-0 text-(--slate)">{labels.resourceLabelAnchorsWriting}</span>
        <SegmentedControl<'horizontal-tb' | 'vertical-rl'>
          size="sm"
          value={a.writingMode ?? 'horizontal-tb'}
          onValueChange={(v) => set({ writingMode: v })}
          ariaLabel={labels.resourceLabelAnchorsWriting}
          ariaLabelledBy={`${uid}-writing`}
          options={[
            { value: 'horizontal-tb', label: labels.resourceLabelAnchorsWritingHorizontal },
            { value: 'vertical-rl', label: labels.resourceLabelAnchorsWritingVertical },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span id={`${uid}-overlap`} className="w-24 shrink-0 text-(--slate)">{labels.resourceLabelAnchorsOverlap}</span>
        <SegmentedControl<'check' | 'allow'>
          size="sm"
          value={a.overlap ?? 'check'}
          onValueChange={(v) => set({ overlap: v })}
          ariaLabel={labels.resourceLabelAnchorsOverlap}
          ariaLabelledBy={`${uid}-overlap`}
          options={[
            { value: 'check', label: labels.resourceLabelAnchorsOverlapCheck },
            { value: 'allow', label: labels.resourceLabelAnchorsOverlapAllow },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span id={`${uid}-gutter`} className="w-24 shrink-0 text-(--slate)">{labels.resourceLabelAnchorsGutter}</span>
        <SegmentedControl<'keep' | 'cross'>
          size="sm"
          value={a.gutter ?? 'keep'}
          onValueChange={(v) => set({ gutter: v })}
          ariaLabel={labels.resourceLabelAnchorsGutter}
          ariaLabelledBy={`${uid}-gutter`}
          options={[
            { value: 'keep', label: labels.resourceLabelAnchorsGutterKeep },
            { value: 'cross', label: labels.resourceLabelAnchorsGutterCross },
          ]}
        />
      </div>
      {/* Typing a number is one step of Undo, recorded at its first change. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5" onFocusCapture={() => beginEdit(i)}>
        <span className="inline-flex items-center gap-2">
          <span id={`${uid}-rotate`} className="w-24 shrink-0 text-(--slate)">{labels.resourceLabelAnchorsRotate}</span>
          <NumberField
            value={a.rotate ?? 0}
            onValueChange={(v) => edit(withLabelFields(marks, i, { rotate: Number.isFinite(v) ? v : 0 }))}
            min={-360}
            max={360}
            step={1}
            widthCh={5}
            ariaLabelledBy={`${uid}-rotate`}
            muted={!a.rotate}
          />
          <span className="text-(--slate)">°</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span id={`${uid}-width`} className="shrink-0 text-(--slate)">{labels.resourceLabelAnchorsWidth}</span>
          <NumberField
            value={a.width !== undefined ? Math.round(a.width * 1000) / 10 : 0}
            onValueChange={(v) => edit(withLabelFields(marks, i, { width: v > 0 ? v / 100 : undefined }))}
            min={0}
            max={100}
            step={1}
            widthCh={5}
            ariaLabelledBy={`${uid}-width`}
            ariaDescribedBy={`${uid}-width-hint`}
            muted={a.width === undefined}
          />
          <span className="text-(--slate)">%</span>
        </span>
      </div>
      <p id={`${uid}-width-hint`} className="m-0 text-[11px] text-(--slate)">{labels.resourceLabelAnchorsWidthHint}</p>
      <LeaderFields anchor={a} index={i} marks={marks} texts={texts} commit={commit} edit={edit} beginEdit={beginEdit} onLabelLeader={onLabelLeader} styleHasLeader={styleHasLeader} />
    </div>
  );
}

const pctOf = (v: number) => Math.round(v * 1000) / 10;

type LeaderFieldsProps = Pick<AnchorFieldsProps, 'anchor' | 'index' | 'marks' | 'texts' | 'commit' | 'edit' | 'beginEdit' | 'onLabelLeader' | 'styleHasLeader'>;

/** Where the label of an anchor stands and its leader (#1064): set away
 *  from the point (`labelAt`, also dragged by its handle on the picture or
 *  nudged with the arrows), the anchor's leader (as the style says, on,
 *  off) and its line (routing, the mark at the point), and each label's own
 *  `leader` attribute, written in the chapter's Markdown. */
export function LeaderFields({ anchor: a, index: i, marks, texts, commit, edit, beginEdit, onLabelLeader, styleHasLeader }: LeaderFieldsProps) {
  const labels = useSandboxLabels();
  const uid = useId();
  const choice = leaderChoiceOf(a);
  const own: LeaderStyle = a.leader && typeof a.leader === 'object' ? a.leader : {};
  const setLook = (patch: Partial<LeaderStyle>) => {
    const next: LeaderStyle = { ...own, ...patch };
    for (const k of Object.keys(patch) as (keyof LeaderStyle)[]) if (patch[k] === undefined) delete next[k];
    commit(withLeader(marks, i, 'on', next));
  };
  const drawn = leaderDrawn(a, styleHasLeader(texts[0]?.style ?? a.style), texts[0]?.leader);
  const at = a.labelAt;
  return (
    <section aria-labelledby={`${uid}-title`} className="mt-1 flex flex-col gap-1.5 border-t pt-1.5" style={{ borderColor: 'var(--pt-control-border)' }}>
      <h4 id={`${uid}-title`} className="m-0 text-xs font-semibold">{labels.leaderSectionTitle}</h4>
      <div className="flex flex-wrap items-center gap-2">
        <span id={`${uid}-away`} className="w-24 shrink-0 text-(--slate)">{labels.labelAwayLabel}</span>
        <Switch checked={!!at} onCheckedChange={(on) => commit(withLabelAway(marks, i, on))} ariaLabelledBy={`${uid}-away`} ariaDescribedBy={`${uid}-away-hint`} />
      </div>
      {at && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5" onFocusCapture={() => beginEdit(i)}>
          <span className="inline-flex items-center gap-2">
            <span id={`${uid}-ax`} className="w-24 shrink-0 text-(--slate)">{labels.labelAwayX}</span>
            <NumberField value={pctOf(at.x)} onValueChange={(v) => edit(withPoint(marks, { kind: 'label', index: i }, { x: Number.isFinite(v) ? v / 100 : at.x, y: at.y }))} min={0} max={100} step={1} widthCh={5} ariaLabelledBy={`${uid}-ax`} />
            <span className="text-(--slate)">%</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span id={`${uid}-ay`} className="shrink-0 text-(--slate)">{labels.labelAwayY}</span>
            <NumberField value={pctOf(at.y)} onValueChange={(v) => edit(withPoint(marks, { kind: 'label', index: i }, { x: at.x, y: Number.isFinite(v) ? v / 100 : at.y }))} min={0} max={100} step={1} widthCh={5} ariaLabelledBy={`${uid}-ay`} />
            <span className="text-(--slate)">%</span>
          </span>
        </div>
      )}
      <p id={`${uid}-away-hint`} className="m-0 text-[11px] text-(--slate)">{labels.labelAwayHint}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span id={`${uid}-leader`} className="w-24 shrink-0 text-(--slate)">{labels.leaderLabel}</span>
        <SegmentedControl<LeaderChoice>
          size="sm"
          value={choice}
          onValueChange={(v) => commit(withLeader(marks, i, v))}
          ariaLabel={labels.leaderLabel}
          ariaLabelledBy={`${uid}-leader`}
          ariaDescribedBy={`${uid}-leader-state`}
          options={[
            { value: 'style', label: labels.leaderAsStyle },
            { value: 'on', label: labels.leaderOn },
            { value: 'off', label: labels.leaderOff },
          ]}
        />
      </div>
      <p id={`${uid}-leader-state`} role="status" className="m-0 text-[11px] text-(--slate)">{drawn ? labels.leaderStateDrawn : labels.leaderStateNone}</p>
      {choice === 'on' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span id={`${uid}-routing`} className="w-24 shrink-0 text-(--slate)">{labels.leaderRouting}</span>
            <SegmentedControl<'straight' | 'elbow'>
              size="sm"
              value={own.routing ?? 'straight'}
              onValueChange={(v) => setLook({ routing: v === 'straight' ? undefined : v })}
              ariaLabel={labels.leaderRouting}
              ariaLabelledBy={`${uid}-routing`}
              options={[
                { value: 'straight', label: labels.leaderRoutingStraight },
                { value: 'elbow', label: labels.leaderRoutingElbow },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span id={`${uid}-cap`} className="w-24 shrink-0 text-(--slate)">{labels.leaderEndCap}</span>
            <SegmentedControl<'dot' | 'arrow' | 'ring' | 'bar' | 'none'>
              size="sm"
              value={own.endCap ?? 'dot'}
              onValueChange={(v) => setLook({ endCap: v === 'dot' ? undefined : v })}
              ariaLabel={labels.leaderEndCap}
              ariaLabelledBy={`${uid}-cap`}
              options={[
                { value: 'dot', label: labels.leaderCapDot },
                { value: 'arrow', label: labels.leaderCapArrow },
                { value: 'ring', label: labels.connectorCapRing },
                { value: 'bar', label: labels.connectorCapBar },
                { value: 'none', label: labels.leaderCapNone },
              ]}
            />
          </div>
        </>
      )}
      {onLabelLeader && texts.length > 0 && (
        <>
          <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={labels.leaderPerLabel}>
            {texts.map((t) => (
              <li key={`${t.chapterId}:${t.start}`} className="flex flex-wrap items-center gap-2">
                <span dir="auto" className="w-24 shrink-0 truncate text-(--foreground)" title={t.text}>{t.text}</span>
                <SegmentedControl<LabelLeaderChoice>
                  size="sm"
                  value={labelLeaderChoice(t)}
                  onValueChange={(v) => onLabelLeader(t, v)}
                  ariaLabel={labels.leaderOfLabel.replace('__text__', t.text)}
                  options={[
                    { value: 'anchor', label: labels.leaderAsAnchor },
                    { value: 'on', label: labels.leaderOn },
                    { value: 'off', label: labels.leaderOff },
                  ]}
                />
              </li>
            ))}
          </ul>
          <p className="m-0 text-[11px] text-(--slate)">{labels.leaderPerLabelHint}</p>
        </>
      )}
    </section>
  );
}
