'use client';

import { ChevronRight, LayoutTemplate } from 'lucide-react';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { cn } from '../../ui/index.js';
import { SETTINGS_GROUPS, type SettingsGroupId } from '../sections/registry.js';
import { GROUP_ICONS } from './groupIcons.js';
import { DesignSummary } from './DesignSummary.js';

/** The Design panel's overview: a summary of the book, the designs, and
 *  the list of setting groups. */
export function SettingsHome({ counts, onOpen, onOpenDesigns, buttonRefs }: {
  counts: Record<SettingsGroupId, number>;
  onOpen: (id: SettingsGroupId) => void;
  /** Open the designs (#1523). */
  onOpenDesigns: () => void;
  buttonRefs: Map<SettingsGroupId, HTMLButtonElement>;
}) {
  const labels = useSandboxLabels();
  return (
    <>
      <DesignSummary onOpenGroup={onOpen} />
      <div className="px-1.5 pt-2">
        <button
          type="button"
          onClick={onOpenDesigns}
          className={cn(
            'group/row flex pt-large:min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-1.5 py-2 text-start transition-colors',
            'hover:bg-(--surface) focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-(--rule) bg-(--surface) text-(--brand)">
            <LayoutTemplate size={16} aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[0.8rem] leading-[1.35] font-medium text-(--foreground)">{labels.designsRow}</span>
            <span className="text-[0.68rem] leading-[1.35] text-(--slate) [text-wrap:pretty]">{labels.designsRowHint}</span>
          </span>
          <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-(--slate) transition-transform group-hover/row:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover/row:-translate-x-0.5" />
        </button>
      </div>
      <h3 className="px-3 pt-4 pb-1.5 text-[0.72rem] font-semibold tracking-[0.12em] text-(--slate) pt-caps">
        {labels.settingsGroupsHeading}
      </h3>
      <ul className="flex flex-col px-1.5 pb-3">
        {SETTINGS_GROUPS.map((g) => {
          const Icon = GROUP_ICONS[g.id];
          const count = counts[g.id];
          return (
            <li key={g.id}>
              <button
                type="button"
                ref={(el) => { if (el) buttonRefs.set(g.id, el); else buttonRefs.delete(g.id); }}
                onClick={() => onOpen(g.id)}
                className={cn(
                  'group/row flex pt-large:min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-1.5 py-2 text-start transition-colors',
                  'hover:bg-(--surface) focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-(--rule) bg-(--surface) text-(--brand)">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[0.8rem] leading-[1.35] font-medium text-(--foreground)">{String(labels[g.labelKey])}</span>
                  <span className="text-[0.68rem] leading-[1.35] text-(--slate) [text-wrap:pretty]">{String(labels[g.descriptionKey])}</span>
                </span>
                {count > 0 && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[0.66rem] text-(--brand) tabular-nums">
                    <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-(--brand)" />
                    <span aria-hidden="true">{count}</span>
                    <span className="sr-only">
                      {(count === 1 ? labels.settingsGroupModifiedOne : labels.settingsGroupModifiedMany).replace('__count__', String(count))}
                    </span>
                  </span>
                )}
                <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-(--slate) transition-transform group-hover/row:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover/row:-translate-x-0.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
