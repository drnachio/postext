'use client';

import { useMemo, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { isCjkLanguage, resolveBodyTextConfig, resolveColorValue, resolveLayoutConfig, resolvePageConfig } from 'postext';
import type { Dimension } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { formatNumber, toPt } from '../../controls/units';
import { cn } from '../../ui';
import type { SettingsGroupId } from '../sections/registry';
import { pageDrawingConfig } from '../sections/cjkGridReadout';
import { documentLocaleLabel } from '../sections/BodyTextSection/constants';
import { defaultDocumentLocale } from '../../controls/hyphenation';
import { documentDirection, documentLanguage } from '../../context/documentDirection';
import { PagePreview } from './PagePreview';
import { columnCountUsed } from './multipleColumns';

interface DesignSummaryProps {
  onOpenGroup: (id: SettingsGroupId) => void;
}

/** "This book" card at the top of the Design panel: a drawing of the page
 *  and the handful of decisions that define the book (trim size, columns,
 *  writing system, body type, palette). Each line opens the group that
 *  changes it. */
export function DesignSummary({ onOpenGroup }: DesignSummaryProps) {
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const uiLocale = useSandboxSelector((s) => s.locale);
  // The page as it is set: the character grid's margins when it is on.
  const drawn = useMemo(() => pageDrawingConfig(config), [config]);
  const layout = resolveLayoutConfig(drawn.layout);
  // The language and its direction: a right-to-left book is bound on the
  // right when the binding is Auto.
  const language = documentLanguage(config, defaultDocumentLocale(uiLocale));
  const direction = documentDirection(config.direction, language);
  const page = resolvePageConfig(drawn.page, language, layout.writingMode, direction);
  const body = resolveBodyTextConfig(config.bodyText, config.locale);
  const ink = resolveColorValue(body.color, config.colorPalette, { hex: '#000000', model: 'hex' }).hex;
  const palette = config.colorPalette ?? [];

  const n = (v: number) => formatNumber(v, uiLocale);
  const size = page.width.unit === page.height.unit
    ? `${n(page.width.value)} × ${n(page.height.value)} ${page.width.unit}`
    : `${dim(page.width, n)} × ${dim(page.height, n)}`;
  const columns =
    layout.layoutType === 'double' ? labels.settingsSummaryTwoColumns
      : layout.layoutType === 'oneAndHalf' ? labels.settingsSummaryOneAndHalf
        : layout.layoutType === 'multiple' ? labels.settingsSummaryColumns.replace('__count__', n(columnCountUsed(layout.columnCount)))
          : labels.settingsSummaryOneColumn;
  const type = `${body.fontFamily} · ${n(toPt(body.fontSize))}/${n(toPt(body.lineHeight))} pt`;
  // Writing system: the language, with the direction and the binding when
  // they are a choice (Chinese text, vertical lines, right-to-left text, a
  // right binding).
  const vertical = layout.writingMode === 'vertical-rl';
  const writing = [
    direction === 'rtl' ? labels.documentDirectionRtl : '',
    vertical || isCjkLanguage(language) ? (vertical ? labels.writingModeVerticalShort : labels.writingModeHorizontal) : '',
    vertical || page.binding === 'right' ? (page.binding === 'right' ? labels.settingsSummaryBoundRight : labels.settingsSummaryBoundLeft) : '',
  ].filter(Boolean);
  if (writing[0]) writing[0] = writing[0].charAt(0).toLocaleUpperCase(uiLocale) + writing[0].slice(1);

  return (
    <section
      aria-label={labels.settingsSummaryTitle}
      className="mx-3 mt-3 flex gap-3 rounded-lg border border-(--rule) bg-(--surface) p-3"
    >
      <button
        type="button"
        onClick={() => onOpenGroup('page')}
        aria-label={`${labels.settingsGroupPage}: ${size}, ${columns}`}
        className="shrink-0 cursor-pointer self-start rounded focus-visible:outline-2 focus-visible:outline-offset-2 outline-(--brand)"
      >
        <PagePreview page={page} layout={layout} lineHeightPt={toPt(body.lineHeight)} inkHex={ink} height={86} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className="mb-0.5 text-[0.72rem] font-semibold tracking-[0.12em] text-(--slate) pt-caps">
          {labels.settingsSummaryTitle}
        </h3>
        <SummaryLine onClick={() => onOpenGroup('page')} group={labels.settingsGroupPage}>
          {size}
        </SummaryLine>
        <SummaryLine onClick={() => onOpenGroup('page')} group={labels.settingsGroupPage}>
          {columns}
        </SummaryLine>
        <SummaryLine onClick={() => onOpenGroup('writing')} group={labels.settingsGroupWriting} wrap>
          {writing.map((w) => `${w} · `).join('')}
          <span lang={language} className="whitespace-nowrap">{documentLocaleLabel(language)}</span>
        </SummaryLine>
        <SummaryLine onClick={() => onOpenGroup('text')} group={labels.settingsGroupText}>
          <span style={{ fontFamily: `"${body.fontFamily}", serif` }}>{type}</span>
        </SummaryLine>
        {palette.length > 0 && (
          <SummaryLine onClick={() => onOpenGroup('colors')} group={labels.settingsGroupColors}>
            <span role="img" className="flex items-center gap-0.5" aria-label={palette.map((p) => p.name).join(', ')}>
              {palette.slice(0, 8).map((p) => (
                <span
                  key={p.id}
                  title={p.name}
                  className="inline-block h-3 w-3 rounded-sm border border-(--rule)"
                  style={{ backgroundColor: p.value.hex }}
                />
              ))}
              {palette.length > 8 && <span dir="ltr" className="ms-1 text-[0.66rem] text-(--slate)">+{palette.length - 8}</span>}
            </span>
          </SummaryLine>
        )}
      </div>
    </section>
  );
}

/** One line of the card; `wrap` lets a line whose end matters (the
 *  language after the direction and the binding) run on to a second one
 *  instead of being cut. */
function SummaryLine({ onClick, group, wrap, children }: { onClick: () => void; group: string; wrap?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group/line -mx-1 flex min-h-6 min-w-0 cursor-pointer items-center justify-between gap-2 rounded px-1 py-0.5 text-start text-xs text-(--foreground) transition-colors',
        'hover:bg-(--surface-2,var(--background)) focus-visible:outline-2 focus-visible:outline-offset-0 outline-(--brand)',
      )}
    >
      <span className={cn('min-w-0', wrap ? '[text-wrap:pretty]' : 'truncate')}>{children}</span>
      <span className="sr-only">— {group}</span>
      <ChevronRight size={12} aria-hidden="true" className="shrink-0 text-(--slate) opacity-0 transition-opacity rtl:-scale-x-100 group-hover/line:opacity-100 group-focus-visible/line:opacity-100" />
    </button>
  );
}

function dim(d: Dimension, n: (v: number) => string): string {
  return `${n(d.value)} ${d.unit}`;
}
