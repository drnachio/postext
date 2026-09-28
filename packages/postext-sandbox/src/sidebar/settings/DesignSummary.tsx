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
import { LOCALE_TO_HYPHENATION, documentLocaleLabel } from '../sections/BodyTextSection/constants';
import { PagePreview } from './PagePreview';

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
  const page = resolvePageConfig(drawn.page, config.locale, layout.writingMode);
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
        : labels.settingsSummaryOneColumn;
  const type = `${body.fontFamily} · ${n(toPt(body.fontSize))}/${n(toPt(body.lineHeight))} pt`;
  // Writing system: the language, with the direction and the binding when
  // they are a choice (Chinese text, vertical lines, a right binding).
  const language = config.locale ?? LOCALE_TO_HYPHENATION[uiLocale] ?? 'en-us';
  const vertical = layout.writingMode === 'vertical-rl';
  const writing = [
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
        <h3 className="mb-0.5 text-[0.6rem] font-semibold tracking-[0.12em] text-(--slate) uppercase">
          {labels.settingsSummaryTitle}
        </h3>
        <SummaryLine onClick={() => onOpenGroup('page')} group={labels.settingsGroupPage}>
          {size}
        </SummaryLine>
        <SummaryLine onClick={() => onOpenGroup('page')} group={labels.settingsGroupPage}>
          {columns}
        </SummaryLine>
        <SummaryLine onClick={() => onOpenGroup('writing')} group={labels.settingsGroupWriting}>
          {writing.map((w) => `${w} · `).join('')}
          <span lang={language}>{documentLocaleLabel(language)}</span>
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
              {palette.length > 8 && <span className="ml-1 text-[0.66rem] text-(--slate)">+{palette.length - 8}</span>}
            </span>
          </SummaryLine>
        )}
      </div>
    </section>
  );
}

function SummaryLine({ onClick, group, children }: { onClick: () => void; group: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group/line -mx-1 flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-xs text-(--foreground) transition-colors',
        'hover:bg-(--surface-2,var(--background)) focus-visible:outline-2 focus-visible:outline-offset-0 outline-(--brand)',
      )}
    >
      <span className="min-w-0 truncate">{children}</span>
      <span className="sr-only">— {group}</span>
      <ChevronRight size={12} aria-hidden="true" className="shrink-0 text-(--slate) opacity-0 transition-opacity group-hover/line:opacity-100 group-focus-visible/line:opacity-100" />
    </button>
  );
}

function dim(d: Dimension, n: (v: number) => string): string {
  return `${n(d.value)} ${d.unit}`;
}
