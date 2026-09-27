"use client";

import { openSearchPalette } from "@/components/docs/DocsSearchPalette";
import { cn } from "@/lib/utils";

/** Opens the global ⌘K palette, prefilled with `query` when one is given. */
export function DocsSearchButton({
  label,
  query,
  shortcut,
  className,
}: {
  label: string;
  query?: string;
  /** Printed after the label ("⌘K"). */
  shortcut?: string;
  className?: string;
}) {
  return (
    <button type="button" onClick={() => openSearchPalette(query || undefined)} className={cn("inline-flex items-center gap-2", className)}>
      {label}
      {shortcut && (
        <kbd aria-hidden="true" className="cb-kbd">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}
