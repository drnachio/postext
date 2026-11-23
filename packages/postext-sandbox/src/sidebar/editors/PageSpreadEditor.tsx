'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { resolveBodyTextConfig, resolveColorValue, resolveLayoutConfig, resolvePageConfig } from 'postext';
import type { Dimension, DimensionUnit } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import { documentComicDirection, documentDirection, documentLanguage } from '../../context/documentDirection.js';
import { TO_PT, formatNumber, toPt } from '../../controls/inputs/units.js';
import { defaultDocumentLocale } from '../../controls/language/hyphenation.js';
import { cn } from '../../ui/index.js';
import { pageDrawingConfig, useCjkGrid } from '../sections/writing/cjkGridReadout.js';
import { PagePreview } from '../settings/PagePreview.js';
import { usePreviewHighlight } from '../settings/previewHighlight.js';
import { dragGuide, snapLength, spreadGap, spreadGuides, typeArea, type Guide, type GuidePart, type SpreadPage } from './spreadGeometry.js';

/** The tallest the drawing gets, in CSS px; a wide spread is drawn lower
 *  so that it fits the panel. */
const MAX_HEIGHT = 196;

/** A length being dragged: the part, and its value so far. */
interface Drag {
  part: GuidePart;
  value: Dimension;
}

/** The unit a read-back is written in: millimetres for metric pages,
 *  the page's own unit otherwise. */
function readUnit(unit: DimensionUnit): DimensionUnit {
  return unit === 'cm' || unit === 'mm' ? 'mm' : unit;
}

/** The drawing of the page at the top of the Page and Columns settings,
 *  as an editor: each margin and the gutter is a guide to drag, the value
 *  shown while it moves and written once on release (one undo step); the
 *  type area, its columns and the lines a page holds are read back under
 *  it. The fields below stay the way to set a margin from the keyboard,
 *  and tint their margin here when hovered. Guides are off while a
 *  character grid sets the margins. */
export function PageSpreadEditor() {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const config = useSandboxSelector((s) => s.config);
  const uiLocale = useSandboxSelector((s) => s.locale);
  const fieldHighlight = usePreviewHighlight();
  const grid = useCjkGrid();
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const [hover, setHover] = useState<GuidePart | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<{ guide: Guide; value: Dimension } | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setBoxWidth(entry!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The page as it is set: the character grid's margins when it is on.
  const drawn = useMemo(() => pageDrawingConfig(config), [config]);
  const language = documentLanguage(config, defaultDocumentLocale(uiLocale));
  const direction = documentDirection(config.direction, language);
  const baseLayout = resolveLayoutConfig(drawn.layout);
  const basePage = resolvePageConfig(drawn.page, language, baseLayout.writingMode, direction, documentComicDirection(config, language, baseLayout.writingMode, direction));
  const body = resolveBodyTextConfig(config.bodyText, config.locale);
  const ink = resolveColorValue(body.color, config.colorPalette, { hex: '#000000', model: 'hex' }).hex;

  // The value being dragged is drawn before it is written.
  const page = drag && drag.part !== 'gutter'
    ? { ...basePage, margins: { ...basePage.margins, [drag.part === 'inner' ? 'left' : drag.part === 'outer' ? 'right' : drag.part]: drag.value } }
    : basePage;
  const layout = drag?.part === 'gutter' ? { ...baseLayout, gutterWidth: drag.value } : baseLayout;

  const mirror = page.margins.mirror ?? false;
  const geometry: SpreadPage = {
    width: Math.max(toPt(page.width), 1),
    height: Math.max(toPt(page.height), 1),
    top: toPt(page.margins.top),
    bottom: toPt(page.margins.bottom),
    inner: toPt(page.margins.left),
    outer: toPt(page.margins.right),
    mirror,
  };
  const totalW = mirror ? geometry.width * 2 + spreadGap(geometry.width) : geometry.width;
  const height = boxWidth > 0 ? Math.min(MAX_HEIGHT, (boxWidth * geometry.height) / totalW) : MAX_HEIGHT;
  const width = (height * totalW) / geometry.height;
  /** Points of the drawing per CSS px. */
  const scale = geometry.height / height;
  const editable = !grid;
  const guides = editable ? spreadGuides(geometry, layout) : [];

  const current = (part: GuidePart): Dimension => (
    part === 'gutter' ? baseLayout.gutterWidth
      : part === 'inner' ? basePage.margins.left
        : part === 'outer' ? basePage.margins.right
          : basePage.margins[part]
  );

  const partLabel = (part: GuidePart): string => {
    switch (part) {
      case 'top': return labels.marginTop;
      case 'bottom': return labels.marginBottom;
      case 'inner': return mirror ? labels.pageMarginsInner : labels.marginLeft;
      case 'outer': return mirror ? labels.pageMarginsOuter : labels.marginRight;
      case 'gutter': return labels.gutterWidth;
    }
  };

  const point = (e: ReactPointerEvent): { x: number; y: number } => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) * totalW) / rect.width, y: ((e.clientY - rect.top) * geometry.height) / rect.height };
  };

  const onPointerDown = (guide: Guide) => (e: ReactPointerEvent<SVGLineElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const value = current(guide.part);
    dragRef.current = { guide, value };
    setDrag({ part: guide.part, value });
  };

  const onPointerMove = (e: ReactPointerEvent<SVGLineElement>) => {
    const held = dragRef.current;
    if (!held) return;
    const { x, y } = point(e);
    // Measured against the page as it was when the drag began: the other
    // margins do not move under the pointer.
    const base: SpreadPage = { ...geometry, top: toPt(basePage.margins.top), bottom: toPt(basePage.margins.bottom), inner: toPt(basePage.margins.left), outer: toPt(basePage.margins.right) };
    const points = dragGuide(held.guide, x, y, base, baseLayout);
    const unit = held.value.unit;
    const value: Dimension = { value: Math.max(0, snapLength(points, unit, e.altKey)), unit };
    if (value.value === held.value.value) return;
    held.value = value;
    setDrag({ part: held.guide.part, value });
  };

  const finish = (commit: boolean) => {
    const held = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!held || !commit) return;
    const before = current(held.guide.part);
    if (before.value === held.value.value && before.unit === held.value.unit) return;
    if (held.guide.part === 'gutter') {
      dispatch({ type: 'UPDATE_CONFIG', payload: { layout: { ...config.layout, gutterWidth: held.value } } });
    } else {
      const side = held.guide.part === 'inner' ? 'left' : held.guide.part === 'outer' ? 'right' : held.guide.part;
      dispatch({ type: 'UPDATE_CONFIG', payload: { page: { ...config.page, margins: { ...config.page?.margins, [side]: held.value } } } });
    }
  };

  const n = (v: number) => formatNumber(v, uiLocale);
  const unit = readUnit(page.width.unit);
  const len = (points: number) => `${n(Math.round((points / TO_PT[unit]) * 10) / 10)}`;
  const area = typeArea(geometry, layout, toPt(body.lineHeight));
  const shown = drag?.part ?? hover;
  const highlight = shown ?? fieldHighlight;

  const caption = shown
    ? `${partLabel(shown)}: ${n((drag ?? { value: current(shown) }).value.value)} ${current(shown).unit}`
    : editable ? labels.pageMarginsDragHint : [
      mirror ? labels.pagePreviewSpreadCaption : labels.pagePreviewPageCaption,
      page.binding === 'right' ? labels.pagePreviewBoundRight : '',
      layout.writingMode === 'vertical-rl' ? labels.pagePreviewVertical : '',
    ].filter(Boolean).join(' ');

  return (
    <figure className="mx-3 mb-1 flex flex-col rounded-lg border border-(--rule) bg-(--surface)">
      <div ref={boxRef} className="mx-3 mt-4 flex justify-center">
        <div className="group/spread relative" style={{ width, height }}>
          <PagePreview page={page} layout={layout} lineHeightPt={toPt(body.lineHeight)} inkHex={ink} height={height} highlight={highlight} folios />
          {editable && (
            <svg
              ref={svgRef}
              // Physical drawing, as the pages under it.
              direction="ltr"
              viewBox={`0 0 ${totalW} ${geometry.height}`}
              width={width}
              height={height}
              aria-hidden="true"
              className="absolute inset-0 overflow-visible"
              style={{ touchAction: 'none' }}
            >
              {guides.map((g, i) => {
                const active = shown === g.part;
                const line = g.axis === 'y'
                  ? { x1: g.from, x2: g.to, y1: g.at, y2: g.at }
                  : { x1: g.at, x2: g.at, y1: g.from, y2: g.to };
                return (
                  <g key={i}>
                    <line
                      {...line}
                      stroke="var(--brand)"
                      strokeWidth={(active ? 1.5 : 1) * scale}
                      strokeDasharray={active ? undefined : `${3 * scale} ${3 * scale}`}
                      className={cn('pointer-events-none transition-opacity', active ? 'opacity-100' : 'opacity-0 group-hover/spread:opacity-60')}
                    />
                    {/* The line to take hold of: 12 CSS px across. */}
                    <line
                      {...line}
                      stroke="transparent"
                      strokeWidth={12 * scale}
                      style={{ cursor: g.axis === 'y' ? 'ns-resize' : 'ew-resize' }}
                      onPointerEnter={() => setHover(g.part)}
                      onPointerLeave={() => setHover((h) => (h === g.part ? null : h))}
                      onPointerDown={onPointerDown(g)}
                      onPointerMove={onPointerMove}
                      onPointerUp={() => finish(true)}
                      onPointerCancel={() => finish(false)}
                    />
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
      <figcaption aria-live="off" className={cn('mx-3 mt-2 min-h-[2.1em] text-center text-[0.66rem] leading-[1.4] [text-wrap:pretty]', shown ? 'font-medium text-(--foreground) tabular-nums' : 'text-(--slate)')}>
        {caption}
      </figcaption>
      <dl className="mt-1.5 flex flex-col items-center gap-0.5 border-t border-(--rule) px-3 py-2 text-[0.66rem] leading-[1.4] text-(--slate) tabular-nums">
        <div className="flex items-baseline gap-1">
          <dt>{labels.pageTypeArea}</dt>
          <dd className="m-0 font-medium text-(--foreground)">{len(area.width)} × {len(area.height)} {unit}</dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-center gap-x-1.5">
          {area.columns > 1 && (
            <>
              <dt className="sr-only">{labels.layout}</dt>
              <dd className="m-0">{labels.pageColumnsOf.replace('__count__', n(area.columns)).replace('__width__', `${len(area.columnWidth)} ${unit}`)}</dd>
              <span aria-hidden="true">·</span>
            </>
          )}
          <dt className="sr-only">{labels.bodyText}</dt>
          <dd className="m-0">{labels.pageLinesPerPage.replace('__count__', n(area.lines))}</dd>
        </div>
      </dl>
    </figure>
  );
}
