'use client';

import { LayoutTemplate, TextWrap } from 'lucide-react';
import { useSandboxSelector } from '../context/SandboxContext';
import { EmptyState } from '../ui';

/** The EPUB 3 tab: the whole book as an EPUB, in the rendition picked in
 *  the tab bar (a fixed layout or a reflowable book). Loaded with the tab
 *  only (see `PostextSandbox`). For now a shell naming the rendition; the
 *  viewer and the export take its place. */
export function EpubViewport() {
  const labels = useSandboxSelector((s) => s.labels);
  const layout = useSandboxSelector((s) => s.epubLayout);
  const fixed = layout === 'fixed';
  return (
    <div
      role="region"
      aria-label={labels.epub}
      className="flex h-full w-full items-center justify-center"
      style={{ backgroundColor: 'var(--surface)' }}
    >
      <EmptyState
        icon={fixed ? <LayoutTemplate size={32} /> : <TextWrap size={32} />}
        title={fixed ? labels.epubLayoutFixed : labels.epubLayoutReflowable}
        description={fixed ? labels.epubLayoutFixedHint : labels.epubLayoutReflowableHint}
      />
    </div>
  );
}
