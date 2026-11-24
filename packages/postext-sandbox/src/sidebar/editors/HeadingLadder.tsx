'use client';

import { useEffect, useRef } from 'react';
import { baseFontFamily, fontVariantNumeric, featureFamilyParts, resolveColorValue, resolvePageConfig } from 'postext';
import type { ResolvedHeadingLevelConfig } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import { loadFont } from '../../controls/fonts/fontLoader.js';
import { formatNumber, toPt } from '../../controls/inputs/units.js';
import { cn } from '../../ui/index.js';
import { useSettingsSearch } from '../search/SearchContext.js';

/** The largest a level is drawn, in CSS px: the levels keep their sizes
 *  to scale with each other under it. */
const LARGEST = 26;
/** No level is drawn smaller than this, whatever the scale. */
const SMALLEST = 9;

/** Size and leading of a level in points; a leading in `em` is a multiple
 *  of the size. */
function metrics(level: ResolvedHeadingLevelConfig): { size: number; leading: number } {
  const size = toPt(level.fontSize);
  const relative = level.lineHeight.unit === 'em' || level.lineHeight.unit === 'rem';
  return { size, leading: relative ? level.lineHeight.value * size : toPt(level.lineHeight) };
}

/** Open the folded section `id` under `root` and bring it to the top of
 *  the panel that scrolls it. */
function showSection(root: HTMLElement, id: string): void {
  const scope = root.closest<HTMLElement>('[data-section-id]');
  const section = scope?.querySelector<HTMLElement>(`[data-section-id="${id}"]`);
  if (!section) return;
  const trigger = section.querySelector<HTMLElement>('button');
  const closed = section.hasAttribute('data-closed');
  if (closed) trigger?.click();
  trigger?.focus({ preventScroll: true });
  const scroll = () => {
    let scroller: HTMLElement | null = section.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (!scroller) return;
    const top = scroller.scrollTop + section.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
  };
  // A section that was folded grows as it opens (200 ms): scrolled to
  // once it has its height, or the panel could not scroll that far.
  if (closed) window.setTimeout(scroll, 230);
  else scroll();
}

/** The heading levels as a type specimen: one line per level, the name of
 *  its face set in that face, weight, slant, case and colour on the page's
 *  paper, the sizes to scale with each other, and its size over its
 *  leading beside it. A line opens the level's settings. Left out of the
 *  search results, where only the rows that match are shown. */
export function HeadingLadder({ levels }: { levels: readonly ResolvedHeadingLevelConfig[] }) {
  const labels = useSandboxLabels();
  const search = useSettingsSearch();
  const palette = useSandboxSelector((s) => s.config.colorPalette);
  const pageConfig = useSandboxSelector((s) => s.config.page);
  const uiLocale = useSandboxSelector((s) => s.locale);
  const rootRef = useRef<HTMLElement>(null);

  const cuts = levels.map((l) => `${baseFontFamily(l.fontFamily)}|${l.fontWeight}|${l.italic ? 'italic' : 'normal'}`).join(' ');
  useEffect(() => {
    for (const cut of new Set(cuts.split(' '))) {
      const [family, weight, style] = cut.split('|');
      if (family) loadFont(family, [{ weight: Number(weight), style: style === 'italic' ? 'italic' : 'normal' }]);
    }
  }, [cuts]);

  if (search.active || levels.length === 0) return null;

  const page = resolvePageConfig(pageConfig);
  const paper = page.backgroundColor.hex && page.backgroundColor.hex !== 'transparent' ? page.backgroundColor.hex : '#ffffff';
  const largest = Math.max(...levels.map((l) => metrics(l).size * (4 / 3)), 1);
  const scale = Math.min(1, LARGEST / largest);
  const n = (v: number) => formatNumber(Math.round(v * 10) / 10, uiLocale);

  return (
    <nav ref={rootRef} aria-label={labels.settingsJumpTo} className="mb-3 overflow-hidden rounded-md border border-(--rule)" style={{ backgroundColor: paper }}>
      <ul className="m-0 flex list-none flex-col p-0">
        {levels.map((level) => {
          const { size, leading } = metrics(level);
          const { family, features } = featureFamilyParts(level.fontFamily);
          const numeric = fontVariantNumeric(features);
          const ink = resolveColorValue(level.color, palette, { hex: '#000000', model: 'hex' }).hex;
          const px = Math.max(SMALLEST, size * (4 / 3) * scale);
          const figures = `${n(size)}/${n(leading)} pt`;
          return (
            <li key={level.level} className="border-b border-black/10 last:border-b-0">
              <button
                type="button"
                onClick={() => { if (rootRef.current) showSection(rootRef.current, `heading-h${level.level}`); }}
                aria-label={`${labels.headingLevel}${level.level}: ${family}, ${figures}`}
                className={cn(
                  'group/level flex min-h-8 pt-large:min-h-11 w-full cursor-pointer items-center gap-2 px-2.5 py-1 text-start transition-colors',
                  'hover:bg-black/5 focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
                  level.hidden && 'opacity-45',
                )}
              >
                <span aria-hidden="true" className="w-5 shrink-0 font-sans text-[0.62rem] font-semibold tabular-nums text-black/55">
                  {labels.headingLevel}{level.level}
                </span>
                <span
                  aria-hidden="true"
                  className="min-w-0 flex-1 truncate"
                  style={{
                    color: ink,
                    fontFamily: `"${family}", sans-serif`,
                    fontSize: `${px}px`,
                    lineHeight: 1.2,
                    fontWeight: level.fontWeight,
                    fontStyle: level.italic ? 'italic' : 'normal',
                    letterSpacing: toPt(level.letterSpacing) !== 0 ? `${(toPt(level.letterSpacing) / Math.max(size, 1)).toFixed(3)}em` : undefined,
                    ...(numeric ? { fontVariantNumeric: numeric } : {}),
                    ...(level.textTransform === 'uppercase' ? { textTransform: 'uppercase' as const } : {}),
                  }}
                >
                  {family}
                </span>
                <span aria-hidden="true" className="shrink-0 font-sans text-[0.62rem] tabular-nums text-black/55 transition-colors group-hover/level:text-black/80">
                  {figures}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
