'use client';

import { resolveBodyTextConfig, resolveColorValue, resolveLayoutConfig, resolvePageConfig } from 'postext';
import { useMemo } from 'react';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { toPt } from '../../controls/units';
import { pageDrawingConfig } from '../sections/cjkGridReadout';
import { PagePreview } from './PagePreview';
import { usePreviewHighlight } from './previewHighlight';

/** The page drawing at the top of the "Page & columns" and "Writing
 *  system" settings pages. It follows every edit, tints the margin or
 *  gutter being edited, and draws a right-bound spread and vertical lines
 *  when the book has them. */
export function PageGroupPreview() {
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const highlight = usePreviewHighlight();
  // The page as it is set: the character grid's margins when it is on.
  const drawn = useMemo(() => pageDrawingConfig(config), [config]);
  const layout = resolveLayoutConfig(drawn.layout);
  const page = resolvePageConfig(drawn.page, config.locale, layout.writingMode);
  const body = resolveBodyTextConfig(config.bodyText, config.locale);
  const ink = resolveColorValue(body.color, config.colorPalette, { hex: '#000000', model: 'hex' }).hex;
  const mirror = page.margins.mirror ?? false;
  const caption = [
    mirror ? labels.pagePreviewSpreadCaption : labels.pagePreviewPageCaption,
    page.binding === 'right' ? labels.pagePreviewBoundRight : '',
    layout.writingMode === 'vertical-rl' ? labels.pagePreviewVertical : '',
  ].filter(Boolean).join(' ');
  return (
    <figure className="mx-3 mb-2 flex flex-col items-center gap-1.5 rounded-lg border border-(--rule) bg-(--surface) px-3 pt-4 pb-2">
      <PagePreview page={page} layout={layout} lineHeightPt={toPt(body.lineHeight)} inkHex={ink} height={132} highlight={highlight} folios />
      <figcaption className="text-center text-[0.62rem] text-(--slate) [text-wrap:pretty]">
        {caption}
      </figcaption>
    </figure>
  );
}
