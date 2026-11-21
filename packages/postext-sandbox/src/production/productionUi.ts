import type { useSandboxLabels } from '../context/SandboxContext.js';

/** What the Cover panel's parts share: labels, field and heading styles,
 *  and millimetres to one decimal. */

export type Labels = ReturnType<typeof useSandboxLabels>;

export const INPUT = 'rounded border border-(--pt-control-border) bg-(--background) px-2 py-1 text-xs text-(--foreground)';
export const HEADING = 'm-0 text-[0.72rem] font-semibold tracking-[0.12em] text-(--slate) pt-caps';

export const mm1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString();
