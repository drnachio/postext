'use client';

import { resolveBodyTextConfig, resolveColorValue, resolveLayoutConfig, resolvePageConfig } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { toPt } from '../../controls/units';
import { PagePreview } from './PagePreview';
import { usePreviewHighlight } from './previewHighlight';

/** The page drawing at the top of the "Page & columns" settings page. It
 *  follows every edit and tints the margin or gutter being edited. */
export function PageGroupPreview() {
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const highlight = usePreviewHighlight();
  const page = resolvePageConfig(config.page);
  const layout = resolveLayoutConfig(config.layout);
  const body = resolveBodyTextConfig(config.bodyText, config.locale);
  const ink = resolveColorValue(body.color, config.colorPalette, { hex: '#000000', model: 'hex' }).hex;
  const mirror = page.margins.mirror ?? false;
  return (
    <figure className="mx-3 mb-2 flex flex-col items-center gap-1.5 rounded-lg border border-(--rule) bg-(--surface) px-3 pt-4 pb-2">
      <PagePreview page={page} layout={layout} lineHeightPt={toPt(body.lineHeight)} inkHex={ink} height={132} highlight={highlight} />
      <figcaption className="text-center text-[0.62rem] text-(--slate)">
        {mirror ? labels.pagePreviewSpreadCaption : labels.pagePreviewPageCaption}
      </figcaption>
    </figure>
  );
}
