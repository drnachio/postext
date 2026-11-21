'use client';

import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Collapsible, cn } from '../ui/index.js';

/** A part of the Cover panel or the designer that folds away: what is
 *  touched now and then (the printer's figures, the libraries) stays out
 *  of the way until it is wanted. `note` says, while it is closed, what
 *  it holds (a count, a value). */
export function Fold({ title, note, defaultOpen = false, children, className }: {
  title: string;
  note?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className={cn('rounded-lg border border-(--rule)', className)}>
      <Collapsible.Trigger
        className={cn(
          'flex w-full cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-3 py-2 text-start text-xs font-semibold text-(--foreground) transition-colors',
          'hover:bg-(--surface) focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
        )}
      >
        <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-(--slate) rtl:-scale-x-100" style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 200ms ease' }} />
        <span className="min-w-0 flex-1">{title}</span>
        {note && !open && <span className="min-w-0 truncate font-normal text-(--slate)">{note}</span>}
      </Collapsible.Trigger>
      <Collapsible.Panel data-postext-collapsible="">
        <div className="flex flex-col gap-2 px-3 pb-3 pt-1">{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
