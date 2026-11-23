'use client';

import { ArrowLeft, LayoutTemplate } from 'lucide-react';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { IconButton } from '../../ui/index.js';

/** The bar over the designs page (#1523): back to the overview and the
 *  page's name, as a settings group has. */
export function DesignsBar({ onBack }: { onBack: () => void }) {
  const labels = useSandboxLabels();
  return (
    <div className="flex h-10 pt-large:min-h-12 shrink-0 items-center gap-0.5 border-b border-(--rule) px-1.5">
      <IconButton label={labels.settingsBack} size={28} icon={<ArrowLeft size={14} className="rtl:-scale-x-100" />} onClick={onBack} />
      <h3 className="m-0 flex min-w-0 items-center gap-2 px-1.5 text-[0.86rem] leading-[1.3] font-semibold text-(--foreground)">
        <LayoutTemplate size={15} aria-hidden="true" className="shrink-0 text-(--brand)" />
        <span className="min-w-0 truncate">{labels.designsRow}</span>
      </h3>
    </div>
  );
}
