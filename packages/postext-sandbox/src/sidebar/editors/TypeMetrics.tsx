'use client';

import { useEffect, useState } from 'react';
import { featureFamilyParts } from 'postext';
import type { ResolvedBodyTextConfig } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import { formatNumber } from '../../controls/inputs/units.js';
import { cn } from '../../ui/index.js';
import { bodyMetrics, bookSpread, spreadPageOf } from './bookSpread.js';
import { typeArea } from './spreadGeometry.js';
import { MEASURE_RANGE, alphabeticMeasure, charactersPerLine, measureVerdict } from './typeMeasure.js';

/** The average width of a character of `text` in `family`, in em; null
 *  until the face is loaded and measured (and where there is no canvas). */
function useAverageEm(family: string, weight: number, text: string): number | null {
  const [em, setEm] = useState<number | null>(null);
  useEffect(() => {
    if (typeof document === 'undefined' || !text) return;
    let alive = true;
    const font = `${weight} 100px "${family}"`;
    const measure = () => {
      if (!alive) return;
      const ctx = document.createElement('canvas').getContext('2d');
      if (!ctx) return;
      ctx.font = font;
      setEm(ctx.measureText(text).width / (100 * Array.from(text).length));
    };
    // Measured once the face is there, and again when faces finish
    // loading: the first answer may be the fallback's.
    void document.fonts.load(font, text).then(measure, measure);
    document.fonts.addEventListener('loadingdone', measure);
    return () => {
      alive = false;
      document.fonts.removeEventListener('loadingdone', measure);
    };
  }, [family, weight, text]);
  return em;
}

/** What the body text settings give, read back under the specimen: the
 *  measure (characters per line of the column, measured in the book's own
 *  face), the leading as a share of the size, and the lines a page holds.
 *  For alphabetic text the measure is placed on a scale with the range
 *  that reads comfortably, and said in words. */
export function TypeMetrics({ body, lang, sample }: {
  body: ResolvedBodyTextConfig;
  /** The document's language. */
  lang: string;
  /** Running text in that language, to measure the face with. */
  sample: string;
}) {
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const uiLocale = useSandboxSelector((s) => s.locale);
  const { page, layout } = bookSpread(config, uiLocale);
  const { size, leading } = bodyMetrics(body);
  const area = typeArea(spreadPageOf(page), layout, leading);
  const { family } = featureFamilyParts(body.fontFamily);
  const averageEm = useAverageEm(family, body.fontWeight, sample.replace(/\*/g, ''));
  const characters = averageEm === null ? null : charactersPerLine(area.columnWidth, size, averageEm);
  const judged = alphabeticMeasure(lang) && layout.writingMode !== 'vertical-rl';
  const verdict = characters !== null && judged ? measureVerdict(characters, area.columns) : null;
  const n = (v: number) => formatNumber(v, uiLocale);
  const ratio = size > 0 ? Math.round((leading / size) * 100) : 0;

  const [min, max] = area.columns > 1 ? MEASURE_RANGE.multi : MEASURE_RANGE.single;
  // The scale runs from 20 to 100 characters.
  const at = (v: number) => `${Math.min(100, Math.max(0, ((v - 20) / 80) * 100))}%`;

  return (
    <section aria-label={labels.typeMetricsTitle} className="mb-3 rounded-md border border-(--rule) bg-(--surface)">
      <dl className="m-0 grid grid-cols-3 divide-x divide-(--rule) rtl:divide-x-reverse">
        <Metric value={characters === null ? '–' : n(characters)} caption={labels.typeMetricCharsPerLine} tone={verdict === null || verdict === 'good' ? 'plain' : 'warn'} />
        <Metric value={`${n(ratio)} %`} caption={labels.typeMetricLeading} />
        <Metric value={n(area.lines)} caption={labels.typeMetricLinesPerPage} />
      </dl>
      {verdict !== null && characters !== null && (
        <div className="border-t border-(--rule) px-2.5 pt-2.5 pb-2">
          <div aria-hidden="true" dir="ltr" className="relative h-1.5 rounded-full bg-(--rule)">
            <span className="absolute inset-y-0 rounded-full bg-(--brand)/35" style={{ left: at(min), right: `calc(100% - ${at(max)})` }} />
            <span
              className={cn('absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left]', verdict === 'good' ? 'bg-(--brand)' : 'bg-(--foreground)')}
              style={{ left: at(characters) }}
            />
          </div>
          <p className="mt-1.5 text-[0.66rem] leading-[1.4] text-(--slate) [text-wrap:pretty]">
            {verdict === 'short' ? labels.typeMeasureShort : verdict === 'long' ? labels.typeMeasureLong : labels.typeMeasureGood}
          </p>
        </div>
      )}
    </section>
  );
}

function Metric({ value, caption, tone = 'plain' }: { value: string; caption: string; tone?: 'plain' | 'warn' }) {
  return (
    <div className="flex min-w-0 flex-col-reverse items-center justify-end gap-0.5 px-1.5 py-2 text-center">
      <dt className="text-[0.6rem] leading-[1.25] text-(--slate) [text-wrap:balance]">{caption}</dt>
      <dd className={cn('m-0 text-[0.95rem] leading-none font-semibold tabular-nums', tone === 'warn' ? 'text-(--brand)' : 'text-(--foreground)')}>{value}</dd>
    </div>
  );
}
