'use client';

// The bulk edit of the ticked anchors: the tick box and the fields that
// set one value on all of them (#1276: split out of LabelAnchorsPanel.tsx).
import { useId } from 'react';
import { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { Select } from '../../../../ui/index.js';
import { type PictureMarks, withLabelFields } from '../pictureMarks.js';
import { withTickedFields, sharedField } from '../LabelAnchorsPanel.js';

/** The checkbox that ticks an anchor for a change of several at once. */
export function TickBox({ checked, label, onChange }: { checked: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      className="size-3.5 shrink-0 cursor-pointer accent-(--brand) pt-large:size-5"
    />
  );
}

interface TickedFieldsProps {
  marks: PictureMarks;
  ticked: ReadonlySet<number>;
  styleOptions: { value: string; label: string }[];
  commit: (next: PictureMarks) => void;
}

const MIXED = '__mixed__';

/** A choice among a few words for the ticked anchors: pressed when they all
 *  have it, nothing pressed when they differ; every button can be reached
 *  by Tab, since no one of them is the current value. */
function BulkChoice<T extends string>({ labelId, label, current, options, onPick }: { labelId: string; label: string; current: T | undefined; options: readonly { value: T; label: string }[]; onPick: (value: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span id={labelId} className="w-24 shrink-0 text-(--slate)">{label}</span>
      <div role="group" aria-labelledby={labelId} className="inline-flex h-[1.3rem] items-stretch overflow-hidden rounded-full border pt-large:h-11" style={{ borderColor: 'var(--pt-control-border)' }}>
        {options.map((o) => {
          const on = current === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(o.value)}
              className={`inline-flex cursor-pointer items-center justify-center whitespace-nowrap px-2 text-[0.66rem] focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand) pt-large:min-w-11 ${on ? 'bg-(--brand-soft,var(--surface)) font-medium text-(--foreground)' : 'bg-transparent text-(--slate) hover:bg-(--surface) hover:text-(--foreground)'}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The fields of the ticked anchors, set for all of them in one change. */
export function TickedFields({ marks, ticked, styleOptions, commit }: TickedFieldsProps) {
  const labels = useSandboxLabels();
  const uid = useId();
  const set = (patch: Parameters<typeof withLabelFields>[2]) => commit(withTickedFields(marks, ticked, patch));
  const style = sharedField(marks.anchors, ticked, 'style', '');
  const align = sharedField(marks.anchors, ticked, 'align', 'center');
  const vertical = sharedField(marks.anchors, ticked, 'verticalAlign', 'middle');
  const writing = sharedField(marks.anchors, ticked, 'writingMode', 'horizontal-tb');
  const overlap = sharedField(marks.anchors, ticked, 'overlap', 'check');
  const gutter = sharedField(marks.anchors, ticked, 'gutter', 'keep');
  const options = style?.mixed ? [{ value: MIXED, label: labels.resourceLabelAnchorsMixed }, ...styleOptions] : styleOptions;
  return (
    <section aria-labelledby={`${uid}-title`} className="flex flex-col gap-1.5 rounded-md border p-2 text-xs" style={{ borderColor: 'var(--brand)' }}>
      <h3 id={`${uid}-title`} className="m-0 text-xs font-semibold">{labels.resourceLabelAnchorsBulkTitle.replace('__n__', String(ticked.size))}</h3>
      <div className="flex items-center gap-2">
        <span id={`${uid}-style`} className="w-24 shrink-0 text-(--slate)">{labels.resourceLabelAnchorsStyle}</span>
        <Select
          value={style?.mixed ? MIXED : (style?.value ?? '')}
          onValueChange={(v) => { if (v !== MIXED) set({ style: v || undefined }); }}
          options={options}
          ariaLabelledBy={`${uid}-style`}
          muted={!style?.mixed && !style?.value}
          className="min-w-0 flex-1"
        />
      </div>
      <BulkChoice<'start' | 'center' | 'end'>
        labelId={`${uid}-align`}
        label={labels.resourceLabelAnchorsAlign}
        current={align?.mixed ? undefined : (align?.value as 'start' | 'center' | 'end' | undefined)}
        onPick={(v) => set({ align: v })}
        options={[
          { value: 'start', label: labels.resourceLabelAnchorsAlignStart },
          { value: 'center', label: labels.resourceLabelAnchorsAlignCenter },
          { value: 'end', label: labels.resourceLabelAnchorsAlignEnd },
        ]}
      />
      <BulkChoice<'top' | 'middle' | 'bottom'>
        labelId={`${uid}-valign`}
        label={labels.resourceLabelAnchorsVerticalAlign}
        current={vertical?.mixed ? undefined : (vertical?.value as 'top' | 'middle' | 'bottom' | undefined)}
        onPick={(v) => set({ verticalAlign: v })}
        options={[
          { value: 'top', label: labels.resourceLabelAnchorsVerticalTop },
          { value: 'middle', label: labels.resourceLabelAnchorsVerticalMiddle },
          { value: 'bottom', label: labels.resourceLabelAnchorsVerticalBottom },
        ]}
      />
      <BulkChoice<'horizontal-tb' | 'vertical-rl'>
        labelId={`${uid}-writing`}
        label={labels.resourceLabelAnchorsWriting}
        current={writing?.mixed ? undefined : (writing?.value as 'horizontal-tb' | 'vertical-rl' | undefined)}
        onPick={(v) => set({ writingMode: v })}
        options={[
          { value: 'horizontal-tb', label: labels.resourceLabelAnchorsWritingHorizontal },
          { value: 'vertical-rl', label: labels.resourceLabelAnchorsWritingVertical },
        ]}
      />
      <BulkChoice<'check' | 'allow'>
        labelId={`${uid}-overlap`}
        label={labels.resourceLabelAnchorsOverlap}
        current={overlap?.mixed ? undefined : (overlap?.value as 'check' | 'allow' | undefined)}
        onPick={(v) => set({ overlap: v })}
        options={[
          { value: 'check', label: labels.resourceLabelAnchorsOverlapCheck },
          { value: 'allow', label: labels.resourceLabelAnchorsOverlapAllow },
        ]}
      />
      <BulkChoice<'keep' | 'cross'>
        labelId={`${uid}-gutter`}
        label={labels.resourceLabelAnchorsGutter}
        current={gutter?.mixed ? undefined : (gutter?.value as 'keep' | 'cross' | undefined)}
        onPick={(v) => set({ gutter: v })}
        options={[
          { value: 'keep', label: labels.resourceLabelAnchorsGutterKeep },
          { value: 'cross', label: labels.resourceLabelAnchorsGutterCross },
        ]}
      />
    </section>
  );
}
