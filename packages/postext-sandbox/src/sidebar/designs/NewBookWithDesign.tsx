'use client';

import type { RefObject } from 'react';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { Popover, announce, cn } from '../../ui/index.js';
import { fill } from '../../print/fillTokens.js';
import { useDesignHost } from '../../designs/designHost.js';
import { storeDesignFiles } from '../../designs/designActions.js';
import { loadDesign } from '../../designs/designSources.js';
import type { Design } from 'postext';
import { useDesignEntries } from './useDesignEntries.js';

/** The Books panel's «With the design of…» (#1523): a blank book set in a
 *  design of the gallery. */
export function NewBookWithDesign({ open, onOpenChange, anchor, onCreate }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: RefObject<Element | null>;
  onCreate: (design: Design) => Promise<unknown>;
}) {
  const labels = useSandboxLabels();
  const host = useDesignHost();
  const entries = useDesignEntries(host);
  const pick = async (entryId: string, name: string) => {
    onOpenChange(false);
    try {
      const ready = await loadDesign(host.sources(), entryId);
      await storeDesignFiles(ready);
      await onCreate(ready.design);
      announce(fill(labels.projectNewWithDesignDone, { name }));
    } catch {
      announce(labels.designsLoadFailed);
    }
  };
  return (
    <Popover open={open} onOpenChange={(next) => onOpenChange(next)} anchor={anchor} side="bottom" align="end" width={280} ariaLabel={labels.projectNewWithDesign}>
      <div className="flex flex-col gap-1 text-xs">
        <p className="m-0 px-1 pb-1 text-(--slate)">{labels.projectNewWithDesignHint}</p>
        {entries === null && <p className="m-0 px-1 text-(--slate)">{labels.designsLoading}</p>}
        <ul className="m-0 flex max-h-80 list-none flex-col overflow-y-auto p-0">
          {(entries ?? []).map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => void pick(e.id, e.name)}
                className={cn(
                  'flex pt-large:min-h-11 w-full cursor-pointer flex-col items-start rounded-md px-2 py-1.5 text-start transition-colors',
                  'hover:bg-(--surface) focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
                )}
              >
                <span className="font-medium text-(--foreground)">{e.name}</span>
                {e.description && <span className="text-[0.68rem] text-(--slate)">{e.description}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Popover>
  );
}
