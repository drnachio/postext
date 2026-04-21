"use client";

import { computeHeroGeometry } from './geometry';
import { HERO_ANIMATION_STYLES } from './animationStyles';
import { LeftColumn } from './LeftColumn';
import { RightColumn } from './RightColumn';

export function HeroAnimation() {
  const g = computeHeroGeometry();

  return (
    <div
      className="w-56 flex-shrink-0 md:w-72 2xl:w-80 4xl:w-96"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 320 400"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        className="h-auto w-full"
      >
        <style>{HERO_ANIMATION_STYLES}</style>

        {/* Page frame */}
        <rect
          x={g.pageX}
          y={g.pageY}
          width={g.pageW}
          height={g.pageH}
          fill="none"
          stroke="var(--rule)"
          strokeWidth="0.75"
          className="hero-page"
        />

        {/* Baseline grid */}
        <g className="hero-grid">
          {g.gridLines.map((y, i) => (
            <line
              key={`g${i}`}
              x1={g.contentX}
              y1={y}
              x2={g.contentX + g.contentW}
              y2={y}
              stroke="var(--slate)"
              strokeWidth="0.4"
              opacity="0.05"
            />
          ))}
        </g>

        {/* Margin guides */}
        <g className="hero-margins">
          <line x1={g.contentX} y1={g.pageY} x2={g.contentX} y2={g.pageY + g.pageH} stroke="var(--gilt)" strokeWidth="0.4" opacity="0.1" strokeDasharray="3 3" />
          <line x1={g.contentX + g.contentW} y1={g.pageY} x2={g.contentX + g.contentW} y2={g.pageY + g.pageH} stroke="var(--gilt)" strokeWidth="0.4" opacity="0.1" strokeDasharray="3 3" />
          <line x1={g.pageX} y1={g.contentY} x2={g.pageX + g.pageW} y2={g.contentY} stroke="var(--gilt)" strokeWidth="0.4" opacity="0.1" strokeDasharray="3 3" />
          <line x1={g.pageX} y1={g.pageY + g.pageH - g.margin} x2={g.pageX + g.pageW} y2={g.pageY + g.pageH - g.margin} stroke="var(--gilt)" strokeWidth="0.4" opacity="0.1" strokeDasharray="3 3" />
        </g>

        {/* Title bar */}
        <rect
          x={g.contentX}
          y={g.row(g.titleRow)}
          width={g.contentW * 0.7}
          height={5}
          rx="1"
          fill="var(--foreground)"
          opacity="0.55"
          className="hero-title"
        />

        {/* Subtitle */}
        <rect
          x={g.contentX}
          y={g.row(g.subtitleRow)}
          width={g.contentW * 0.45}
          height={3}
          rx="1"
          fill="var(--slate)"
          opacity="0.3"
          className="hero-subtitle"
        />

        {/* Separator */}
        <line
          x1={g.contentX}
          y1={g.row(g.separatorRow)}
          x2={g.contentX + g.contentW}
          y2={g.row(g.separatorRow)}
          stroke="var(--rule)"
          strokeWidth="0.75"
          className="hero-sep"
        />

        {/* Column rule */}
        <line
          x1={g.contentX + g.colW + g.gutter / 2}
          y1={g.row(g.colRow0) - 4}
          x2={g.contentX + g.colW + g.gutter / 2}
          y2={g.footerRuleY}
          stroke="var(--rule)"
          strokeWidth="0.75"
          className="hero-colrule"
        />

        <LeftColumn g={g} />
        <RightColumn g={g} />

        <g className="hero-footer">
          <line
            x1={g.contentX}
            y1={g.footerRuleY}
            x2={g.contentX + g.contentW}
            y2={g.footerRuleY}
            stroke="var(--rule)"
            strokeWidth="0.5"
          />
          <rect
            x={g.contentX + g.contentW / 2 - 6}
            y={g.pageNumY}
            width={12}
            height={2}
            rx="0.5"
            fill="var(--slate)"
            opacity="0.3"
          />
        </g>
      </svg>
    </div>
  );
}
