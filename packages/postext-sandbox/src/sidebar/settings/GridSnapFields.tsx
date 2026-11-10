'use client';

import { useSandboxLabels } from '../../context/SandboxContext.js';
import { ToggleSwitch } from '../../controls/index.js';
import type { SandboxLabels } from '../../types/labels.js';

/** The baseline-grid switches a style can have. */
export type GridSnapKey = 'snapToGrid' | 'regainGrid' | 'snapTopToGrid';

/** Whose switches: each kind of style has its own wording. */
export type GridSnapKind = 'headings' | 'heading' | 'paragraph' | 'callout' | 'math' | 'resourceType' | 'body';

type LabelKey = keyof SandboxLabels;
const LABELS: Record<GridSnapKind, Partial<Record<GridSnapKey, [LabelKey, LabelKey]>>> = {
  headings: {
    snapToGrid: ['headingsSnapToGrid', 'headingsSnapToGridTooltip'],
    regainGrid: ['headingRegainGrid', 'headingRegainGridTooltip'],
    snapTopToGrid: ['headingsSnapTopToGrid', 'headingsSnapTopToGridTooltip'],
  },
  heading: {
    snapToGrid: ['headingLevelSnapToGrid', 'headingLevelSnapToGridTooltip'],
    regainGrid: ['headingRegainGrid', 'headingRegainGridTooltip'],
    snapTopToGrid: ['headingLevelSnapTopToGrid', 'headingLevelSnapTopToGridTooltip'],
  },
  paragraph: {
    snapToGrid: ['paragraphStyleSnapToGrid', 'paragraphStyleSnapToGridTooltip'],
    snapTopToGrid: ['paragraphStyleSnapTopToGrid', 'paragraphStyleSnapTopToGridTooltip'],
  },
  callout: {
    snapToGrid: ['calloutStyleSnapToGrid', 'calloutStyleSnapToGridTooltip'],
    snapTopToGrid: ['calloutStyleSnapTopToGrid', 'calloutStyleSnapTopToGridTooltip'],
  },
  math: {
    snapToGrid: ['mathSnapToGrid', 'mathSnapToGridTooltip'],
    snapTopToGrid: ['mathSnapTopToGrid', 'mathSnapTopToGridTooltip'],
  },
  resourceType: {
    snapToGrid: ['resourceTypeSnapToGrid', 'resourceTypeSnapToGridTooltip'],
    snapTopToGrid: ['resourceTypeSnapTopToGrid', 'resourceTypeSnapTopToGridTooltip'],
  },
  body: {
    snapTopToGrid: ['bodySnapTopToGrid', 'bodySnapTopToGridTooltip'],
  },
};

/**
 * A style's baseline-grid switches (#1482): whether the flow snaps back onto
 * the grid under it (`snapToGrid`), whether it opens on a grid line
 * (`snapTopToGrid`) and, for a heading off the grid, whether the text after
 * it regains the grid (`regainGrid`, shown only while `snapToGrid` is off).
 * `value` holds the switches the style has, resolved; `set(key, undefined)`
 * resets one.
 */
export function GridSnapFields<K extends GridSnapKey>({ kind, value, set, unset }: {
  kind: GridSnapKind;
  value: Partial<Record<K, boolean>>;
  set: (key: NoInfer<K>, v: boolean | undefined) => void;
  unset: (key: NoInfer<K>) => boolean;
}) {
  const labels = useSandboxLabels();
  const has = value as Partial<Record<GridSnapKey, boolean>>;
  const keys = (['snapToGrid', 'regainGrid', 'snapTopToGrid'] as K[]).filter((k) =>
    has[k] !== undefined && LABELS[kind][k] && (k !== 'regainGrid' || has.snapToGrid === false));
  return (
    <>
      {keys.map((k) => {
        const [label, tooltip] = LABELS[kind][k]!;
        return (
          <ToggleSwitch
            key={k}
            label={labels[label] as string}
            checked={has[k]!}
            onChange={(v) => set(k, v)}
            tooltip={labels[tooltip] as string}
            isDefault={unset(k)}
            onReset={() => set(k, undefined)}
          />
        );
      })}
    </>
  );
}
