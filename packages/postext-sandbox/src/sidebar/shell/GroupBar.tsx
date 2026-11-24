'use client';

import type { RefObject } from 'react';
import { ArrowLeft, ChevronsUpDown } from 'lucide-react';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { IconButton, Menu, MenuGroup, MenuItem, cn } from '../../ui/index.js';
import { SETTINGS_CLUSTERS, settingsGroup, type SettingsGroupId } from '../sections/registry.js';
import { GROUP_ICONS } from '../settings/groupIcons.js';

/** The bar over a settings group: back to the overview, and the group's
 *  name, which opens the list of every group (clustered as the overview
 *  clusters them), so another group is one step away. */
export function GroupBar({ group, counts, onBack, onOpen, headingRef }: {
  group: SettingsGroupId;
  /** Changed sections per group: a mark in the list. */
  counts: Record<SettingsGroupId, number>;
  onBack: () => void;
  onOpen: (id: SettingsGroupId) => void;
  /** The switcher: focused when the group opens. */
  headingRef: RefObject<HTMLButtonElement | null>;
}) {
  const labels = useSandboxLabels();
  const entry = settingsGroup(group);
  const Icon = GROUP_ICONS[group];
  return (
    <div className="flex h-10 pt-large:min-h-12 shrink-0 items-center gap-0.5 border-b border-(--rule) px-1.5">
      <IconButton
        label={labels.settingsBack}
        size={28}
        icon={<ArrowLeft size={14} className="rtl:-scale-x-100" />}
        onClick={onBack}
      />
      <h3 className="m-0 flex min-w-0 flex-1 font-[inherit]">
        <Menu
          align="start"
          trigger={(
            <button
              ref={headingRef}
              type="button"
              title={labels.settingsGroupSwitch}
              aria-description={labels.settingsGroupSwitch}
              className={cn(
                'group/switch inline-flex h-7 pt-large:h-11 min-w-0 cursor-pointer items-center gap-2 rounded-md px-1.5 text-start transition-colors',
                'hover:bg-(--surface) data-popup-open:bg-(--surface) focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
              )}
            >
              <Icon size={15} aria-hidden="true" className="shrink-0 text-(--brand)" />
              <span className="min-w-0 truncate text-[0.86rem] leading-[1.3] font-semibold text-(--foreground)">{String(labels[entry.labelKey])}</span>
              <ChevronsUpDown size={12} aria-hidden="true" className="shrink-0 text-(--slate) transition-colors group-hover/switch:text-(--foreground)" />
            </button>
          )}
        >
          {SETTINGS_CLUSTERS.map((cluster) => (
            <MenuGroup key={cluster.id} label={String(labels[cluster.labelKey])}>
              {cluster.groups.map((id) => {
                const ItemIcon = GROUP_ICONS[id];
                return (
                  <MenuItem
                    key={id}
                    icon={<ItemIcon size={13} />}
                    selected={id === group}
                    onClick={() => { if (id !== group) onOpen(id); }}
                    trailing={counts[id] > 0 ? <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-(--brand)" /> : undefined}
                  >
                    {String(labels[settingsGroup(id).labelKey])}
                  </MenuItem>
                );
              })}
            </MenuGroup>
          ))}
        </Menu>
      </h3>
    </div>
  );
}
