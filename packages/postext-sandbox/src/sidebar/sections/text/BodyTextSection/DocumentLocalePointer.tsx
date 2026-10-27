'use client';

// The document language in Body text: a link to Writing system, where it
// is set.
import { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { ChevronRight } from 'lucide-react';
import { useFieldIds } from '../../../../controls/index.js';
import { documentLocaleLabel } from './constants.js';
import { useOpenSettingsGroup } from '../../../../context/settingsNavigation.js';

/** The document language, named in its own language: a link to Writing
 *  system, where it is set. Plain text outside the Design panel. */
export function DocumentLocalePointer({ tag }: { tag: string }) {
  const labels = useSandboxLabels();
  const openGroup = useOpenSettingsGroup();
  const ids = useFieldIds();
  const name = documentLocaleLabel(tag);
  if (!openGroup) return <span lang={tag} className="text-[0.8rem] text-(--foreground)">{name}</span>;
  return (
    <button
      id={ids?.controlId}
      type="button"
      onClick={() => openGroup('writing')}
      aria-describedby={ids?.descriptionId}
      title={labels.settingsOpenGroup.replace('__group__', labels.settingsGroupWriting)}
      className="inline-flex h-7 pt-large:h-11 max-w-[10.5rem] cursor-pointer items-center gap-1 rounded-md px-1.5 text-[0.8rem] text-(--foreground) transition-colors hover:bg-(--surface) focus-visible:outline-2 focus-visible:outline-offset-0 outline-(--brand)"
    >
      <span lang={tag} className="min-w-0 truncate">{name}</span>
      <span className="sr-only"> — {labels.settingsOpenGroup.replace('__group__', labels.settingsGroupWriting)}</span>
      <ChevronRight size={12} aria-hidden="true" className="shrink-0 text-(--slate) rtl:-scale-x-100" />
    </button>
  );
}
