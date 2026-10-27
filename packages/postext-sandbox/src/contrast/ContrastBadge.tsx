'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import type { SandboxLabels } from '../types/index.js';
import { cn } from '../ui/cn.js';
import { Tooltip } from '../ui/overlays/tooltip.js';
import { fill } from '../print/fillTokens.js';
import { useContrastSnapshot } from './contrastStore.js';
import { counterpartsFor, counterpartsOn, measureField, ratioText, type Counterpart, type FieldContrast, type FieldMeasure } from './fieldContrast.js';

/** How long a field keeps the colours it was set with after its own
 *  colour changed and no laid-out page shows the new one yet. */
const STICKY_MS = 5000;

/** The contrast of a field's colour against the colours the book sets it
 *  with, or null when the pages use it neither as text nor as a ground.
 *  While the colour is being edited the last known counterparts stand in
 *  until the layout shows the new colour. */
export function useFieldContrast(hex: string, ground?: { hex: string; sizePt: number }): FieldContrast | null {
  const snapshot = useContrastSnapshot();
  // A colour set on a ground of its own (a number's disc) is measured
  // against that ground only (#1244).
  const groundHex = ground?.hex;
  const groundSize = ground?.sizePt ?? 10;
  const found = useMemo(
    () => (groundHex ? counterpartsOn(hex, groundHex, snapshot.pairs, groundSize, snapshot.level) : counterpartsFor(hex, snapshot.pairs)),
    [hex, groundHex, groundSize, snapshot.pairs, snapshot.level],
  );
  const [sticky, setSticky] = useState<Counterpart[] | null>(null);
  useEffect(() => {
    if (found.length > 0) setSticky(found);
  }, [found]);
  useEffect(() => {
    if (found.length > 0 || !sticky) return;
    const timer = setTimeout(() => setSticky(null), STICKY_MS);
    return () => clearTimeout(timer);
  }, [hex, found, sticky]);
  const counterparts = found.length > 0 ? found : sticky;
  return useMemo(
    () => (counterparts && snapshot.enabled ? measureField(hex, counterparts, snapshot) : null),
    [hex, counterparts, snapshot],
  );
}

/** What the badge says in words. */
export function contrastSummary(contrast: FieldContrast, level: string, labels: SandboxLabels): string {
  const w = contrast.worst;
  return w.failing
    ? fill(labels.contrastBadgeFail, { ratio: ratioText(w.ratio, 2), required: w.required, level })
    : fill(labels.contrastBadgePass, { ratio: ratioText(w.ratio, 2), level: w.reaches ?? level });
}

/** The ratio beside a colour field: the lowest the colour has in the book,
 *  with a mark that does not rest on colour alone. */
export function ContrastBadge({ contrast, labels, descriptionId }: { contrast: FieldContrast; labels: SandboxLabels; descriptionId: string }) {
  const { level } = useContrastSnapshot();
  const summary = contrastSummary(contrast, level, labels);
  const Icon = contrast.failing ? TriangleAlert : Check;
  return (
    <>
      <Tooltip content={summary} side="top">
        <span
          aria-hidden="true"
          data-contrast={contrast.failing ? 'fail' : 'pass'}
          className={cn(
            'inline-flex shrink-0 items-center gap-0.5 text-[0.62rem] font-medium tabular-nums',
            contrast.failing ? 'text-(--destructive)' : 'text-(--slate)',
          )}
        >
          <Icon size={11} aria-hidden="true" />
          <span dir="ltr">{ratioText(contrast.worst.ratio)}:1</span>
        </span>
      </Tooltip>
      <span id={descriptionId} className="sr-only">{summary}</span>
    </>
  );
}

const MAX_ROWS = 4;

function MeasureRow({ item, hex, labels, both }: { item: FieldMeasure; hex: string; labels: SandboxLabels; both: boolean }) {
  const text = item.role === 'text' ? hex : item.other;
  const ground = item.role === 'text' ? item.other : hex;
  const other = `⁦${item.other}⁩`;
  const Icon = item.failing ? TriangleAlert : Check;
  const ratios = both && item.screen !== undefined && item.print !== undefined
    ? `${fill(labels.contrastOnScreen, { ratio: ratioText(item.screen, 2) })} · ${fill(labels.contrastInPrint, { ratio: ratioText(item.print, 2) })}`
    : `${ratioText(item.ratio, 2)}:1`;
  return (
    <li className="flex items-start gap-2 py-1">
      <span
        aria-hidden="true"
        className="mt-px inline-flex h-6 w-7 shrink-0 items-center justify-center rounded border border-(--rule) text-[0.7rem]"
        style={{ backgroundColor: ground, color: text, fontWeight: item.large ? 700 : 400 }}
      >
        Aa
      </span>
      <span className="min-w-0 flex-1 text-[0.66rem] leading-[1.35]">
        <span className="block text-(--foreground)">
          {fill(item.role === 'text' ? labels.contrastAsText : labels.contrastAsGround, { other })}
          <span className="text-(--slate)"> · {fill(labels.contrastFromSize, { size: item.sizePt })}</span>
        </span>
        <span className={cn('flex items-center gap-1 tabular-nums', item.failing ? 'text-(--destructive)' : 'text-(--slate)')}>
          <Icon size={11} aria-hidden="true" className="shrink-0" />
          <span>
            {ratios}
            {' · '}
            {item.failing ? fill(labels.contrastNeeds, { required: item.required }) : item.reaches}
          </span>
        </span>
      </span>
    </li>
  );
}

/** The colour popover's contrast list: the field's colour against each
 *  colour it is set with, following the picker as it moves. */
export function ContrastDetails({ contrast, hex, labels }: { contrast: FieldContrast; hex: string; labels: SandboxLabels }) {
  const both = contrast.items.some((i) => i.screen !== undefined && i.print !== undefined);
  const shown = contrast.items.slice(0, MAX_ROWS);
  const more = contrast.items.length - shown.length;
  return (
    <section aria-label={labels.contrastSection} className="mt-2 border-t border-(--rule) pt-2">
      <h3 className="m-0 text-[0.62rem] font-semibold uppercase tracking-[0.05em] text-(--slate)">{labels.contrastSection}</h3>
      <p className="m-0 mt-0.5 text-[0.62rem] leading-[1.35] text-(--slate)">{labels.contrastHelp}</p>
      <ul className="m-0 mt-1 list-none p-0">
        {shown.map((item) => (
          <MeasureRow key={`${item.role}|${item.other}|${item.required}`} item={item} hex={hex} labels={labels} both={both} />
        ))}
      </ul>
      {more > 0 && <p className="m-0 text-[0.62rem] text-(--slate)">{fill(labels.contrastMore, { count: more })}</p>}
    </section>
  );
}
