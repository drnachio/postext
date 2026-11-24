'use client';

import { ChevronRight, LayoutTemplate } from 'lucide-react';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { useHelpMode } from '../../controls/fieldContext.js';
import { Tooltip, cn } from '../../ui/index.js';
import { SETTINGS_CLUSTERS, settingsGroup, type SettingsGroupId } from '../sections/registry.js';
import { GROUP_ICONS } from '../settings/groupIcons.js';
import { DesignSummary } from '../settings/DesignSummary.js';

/** The Design panel's overview: the book at a glance, the designs, and
 *  the groups of settings clustered by stage of the work. The groups sit
 *  two abreast, named and no more; with "show every explanation" on they
 *  run one to a line, each with its sentence. */
export function SettingsOverview({ counts, onOpen, onOpenDesigns, buttonRefs }: {
  counts: Record<SettingsGroupId, number>;
  onOpen: (id: SettingsGroupId) => void;
  /** Open the designs (#1523). */
  onOpenDesigns: () => void;
  buttonRefs: Map<SettingsGroupId, HTMLButtonElement>;
}) {
  const labels = useSandboxLabels();
  const explained = useHelpMode();
  return (
    <div className="@container pb-4">
      <DesignSummary onOpenGroup={onOpen} />
      <div className="px-3 pt-2">
        <button
          type="button"
          onClick={onOpenDesigns}
          title={explained ? undefined : labels.designsRowHint}
          className={cn(
            'group/row flex min-h-9 pt-large:min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg border border-(--rule) px-2.5 py-1.5 text-start transition-colors',
            'hover:border-(--pt-control-border) hover:bg-(--surface) focus-visible:outline-2 focus-visible:outline-offset-1 outline-(--brand)',
          )}
        >
          <LayoutTemplate size={15} aria-hidden="true" className="shrink-0 text-(--brand)" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[0.78rem] leading-[1.3] font-medium text-(--foreground)">{labels.designsRow}</span>
            {explained && <span className="text-[0.68rem] leading-[1.35] text-(--slate) [text-wrap:pretty]">{labels.designsRowHint}</span>}
          </span>
          <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-(--slate) transition-transform group-hover/row:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover/row:-translate-x-0.5" />
        </button>
      </div>
      {SETTINGS_CLUSTERS.map((cluster) => (
        <section key={cluster.id} aria-labelledby={`pt-cluster-${cluster.id}`} className="px-3 pt-4">
          <h3 id={`pt-cluster-${cluster.id}`} className="mb-1 flex items-center gap-2 text-[0.72rem] font-semibold tracking-[0.12em] text-(--slate) pt-caps">
            {String(labels[cluster.labelKey])}
            <span aria-hidden="true" className="h-px flex-1 bg-(--rule)" />
          </h3>
          <ul className={cn('-mx-1.5 grid gap-x-1', explained ? 'grid-cols-1' : 'grid-cols-1 @[300px]:grid-cols-2')}>
            {cluster.groups.map((id) => {
              const g = settingsGroup(id);
              const Icon = GROUP_ICONS[id];
              const count = counts[id];
              const description = String(labels[g.descriptionKey]);
              const row = (
                <button
                  type="button"
                  ref={(el) => { if (el) buttonRefs.set(id, el); else buttonRefs.delete(id); }}
                  onClick={() => onOpen(id)}
                  className={cn(
                    'group/row flex min-h-9 pt-large:min-h-11 w-full cursor-pointer gap-2 rounded-lg px-1.5 py-1.5 text-start transition-colors',
                    explained ? 'items-start' : 'items-center',
                    'hover:bg-(--surface) focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
                  )}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-(--rule) bg-(--surface) text-(--brand) transition-colors group-hover/row:border-(--pt-control-border)">
                    <Icon size={13} aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[0.78rem] leading-[1.3] font-medium text-(--foreground) [text-wrap:balance]">{String(labels[g.labelKey])}</span>
                    {explained && <span className="text-[0.68rem] leading-[1.35] text-(--slate) [text-wrap:pretty]">{description}</span>}
                  </span>
                  {count > 0 && (
                    <span className={cn('inline-flex shrink-0 items-center', explained && 'mt-1.5')}>
                      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-(--brand)" />
                      <span className="sr-only">
                        {(count === 1 ? labels.settingsGroupModifiedOne : labels.settingsGroupModifiedMany).replace('__count__', String(count))}
                      </span>
                    </span>
                  )}
                </button>
              );
              return (
                <li key={id} className="min-w-0">
                  {explained ? row : <Tooltip content={description} side="bottom">{row}</Tooltip>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
