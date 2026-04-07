"use client";

export function HeroAnimation() {
  const pageX = 20;
  const pageY = 12;
  const pageW = 280;
  const pageH = 376;
  const margin = 20;
  const contentX = pageX + margin;
  const contentY = pageY + margin;
  const contentW = pageW - margin * 2;
  const gutter = 10;
  const colW = (contentW - gutter) / 2;
  const rightColX = contentX + colW + gutter;
  const lineH = 2.5;
  const lineGap = 11;

  // Every element snaps to this grid
  const row = (n: number) => contentY + n * lineGap;

  // Seeded pseudo-random for consistent line widths
  const w = (seed: number, min: number, max: number) =>
    min + (Math.sin(seed * 7.31 + 2.17) * 0.5 + 0.5) * (max - min);

  // --- Title area (on grid) ---
  // Row 0: title, Row 1: subtitle, Row 2: separator
  const titleRow = 0;
  const subtitleRow = 1;
  const separatorRow = 2;

  // --- Column content starts at row 4 ---
  const colRow0 = 4;

  // Drop cap spans 2 rows; lines beside it are indented
  const dropCapIndent = 16;

  // === LEFT COLUMN (grid rows relative to colRow0) ===
  // Paragraph 1: rows 0–5 (drop cap wraps rows 0–1)
  const leftP1 = Array.from({ length: 6 }, (_, i) => {
    const besideDropCap = i <= 1;
    const isLast = i === 5;
    return {
      x: besideDropCap ? contentX + dropCapIndent : contentX,
      y: row(colRow0 + i),
      width: besideDropCap
        ? colW - dropCapIndent
        : isLast
          ? w(i, colW * 0.4, colW * 0.6)
          : colW,
    };
  });

  // Paragraph 2: rows 7–12 (skip row 6 = paragraph gap)
  const leftP2 = Array.from({ length: 6 }, (_, i) => ({
    x: contentX,
    y: row(colRow0 + 7 + i),
    width: i === 5 ? w(i + 10, colW * 0.35, colW * 0.55) : colW,
  }));

  // Pull quote: rows 14–16 (skip row 13 = gap)
  const quoteStartRow = colRow0 + 14;
  const quoteContentW = colW - 12;
  const quoteLines = Array.from({ length: 3 }, (_, i) => ({
    x: contentX + 12,
    y: row(quoteStartRow + i),
    width: i === 2 ? w(i + 20, quoteContentW * 0.5, quoteContentW * 0.7) : quoteContentW,
  }));

  // Paragraph 3: rows 18–22 (skip row 17 = gap)
  const leftP3 = Array.from({ length: 5 }, (_, i) => ({
    x: contentX,
    y: row(colRow0 + 18 + i),
    width: i === 4 ? w(i + 30, colW * 0.35, colW * 0.55) : colW,
  }));

  // === RIGHT COLUMN (same grid rows) ===
  // Row 0: section heading
  const rightP1 = Array.from({ length: 5 }, (_, i) => ({
    x: rightColX,
    y: row(colRow0 + 1 + i),
    width: i === 4 ? w(i + 40, colW * 0.4, colW * 0.6) : colW,
  }));

  // Figure: rows 7–11 (5 rows tall = 5 * lineGap)
  const figRow = colRow0 + 7;
  const figY = row(figRow);
  const figW = colW;
  const figH = 5 * lineGap;

  // Paragraph 2: rows 13–17 (right after figure)
  const rightP2 = Array.from({ length: 5 }, (_, i) => ({
    x: rightColX,
    y: row(colRow0 + 13 + i),
    width: i === 4 ? w(i + 50, colW * 0.35, colW * 0.55) : colW,
  }));

  // Paragraph 3: rows 19–22
  const rightP3 = Array.from({ length: 4 }, (_, i) => ({
    x: rightColX,
    y: row(colRow0 + 19 + i),
    width: i === 3 ? w(i + 60, colW * 0.3, colW * 0.5) : colW,
  }));

  // --- Footer ---
  const footerRuleY = pageY + pageH - margin - 10;
  const pageNumY = footerRuleY + 8;

  // --- Baseline grid ---
  const gridLineCount = Math.floor((pageH - margin * 2) / lineGap);
  const gridLines = Array.from({ length: gridLineCount }, (_, i) => row(i));

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
        <style>{`
          @keyframes heroFadeIn {
            from { opacity: 0 }
            to { opacity: 1 }
          }
          @keyframes heroSlideIn {
            from { opacity: 0; transform: translateX(-8px) }
            to { opacity: 1; transform: translateX(0) }
          }
          @keyframes heroGrowY {
            from { transform: scaleY(0) }
            to { transform: scaleY(1) }
          }
          @keyframes heroGrowX {
            from { transform: scaleX(0) }
            to { transform: scaleX(1) }
          }
          @keyframes heroScaleIn {
            from { opacity: 0; transform: scale(0.88) }
            to { opacity: 1; transform: scale(1) }
          }
          @keyframes heroDropCap {
            from { opacity: 0; transform: scale(0.4) }
            to { opacity: 1; transform: scale(1) }
          }
          .hero-page { opacity: 0; animation: heroFadeIn 1s ease-out forwards }
          .hero-grid { opacity: 0; animation: heroFadeIn 0.8s ease-out 0.2s forwards }
          .hero-margins { opacity: 0; animation: heroFadeIn 0.6s ease-out 0.5s forwards }
          .hero-title { opacity: 0; animation: heroSlideIn 0.5s ease-out 0.8s forwards }
          .hero-subtitle { opacity: 0; animation: heroSlideIn 0.4s ease-out 1.0s forwards }
          .hero-sep { transform-origin: left center; transform: scaleX(0); animation: heroGrowX 0.5s ease-out 1.1s forwards }
          .hero-colrule { transform-origin: center top; transform: scaleY(0); animation: heroGrowY 0.6s ease-out 1.2s forwards }
          .hero-dropcap { opacity: 0; transform-origin: center; animation: heroDropCap 0.4s ease-out 1.4s forwards }
          .hero-ll { opacity: 0; animation: heroSlideIn 0.3s ease-out forwards }
          .hero-rl { opacity: 0; animation: heroSlideIn 0.3s ease-out forwards }
          .hero-rhead { opacity: 0; animation: heroSlideIn 0.35s ease-out 1.5s forwards }
          .hero-quote { opacity: 0; animation: heroFadeIn 0.5s ease-out forwards }
          .hero-quoteline { opacity: 0; animation: heroSlideIn 0.3s ease-out forwards }
          .hero-figure { opacity: 0; transform-origin: center; animation: heroScaleIn 0.5s ease-out forwards }
          .hero-footer { opacity: 0; animation: heroFadeIn 0.4s ease-out 3.6s forwards }
        `}</style>

        {/* Page frame */}
        <rect
          x={pageX}
          y={pageY}
          width={pageW}
          height={pageH}
          fill="none"
          stroke="var(--rule)"
          strokeWidth="0.75"
          className="hero-page"
        />

        {/* Baseline grid */}
        <g className="hero-grid">
          {gridLines.map((y, i) => (
            <line
              key={`g${i}`}
              x1={contentX}
              y1={y}
              x2={contentX + contentW}
              y2={y}
              stroke="var(--slate)"
              strokeWidth="0.4"
              opacity="0.05"
            />
          ))}
        </g>

        {/* Margin guides */}
        <g className="hero-margins">
          <line x1={contentX} y1={pageY} x2={contentX} y2={pageY + pageH} stroke="var(--gilt)" strokeWidth="0.4" opacity="0.1" strokeDasharray="3 3" />
          <line x1={contentX + contentW} y1={pageY} x2={contentX + contentW} y2={pageY + pageH} stroke="var(--gilt)" strokeWidth="0.4" opacity="0.1" strokeDasharray="3 3" />
          <line x1={pageX} y1={contentY} x2={pageX + pageW} y2={contentY} stroke="var(--gilt)" strokeWidth="0.4" opacity="0.1" strokeDasharray="3 3" />
          <line x1={pageX} y1={pageY + pageH - margin} x2={pageX + pageW} y2={pageY + pageH - margin} stroke="var(--gilt)" strokeWidth="0.4" opacity="0.1" strokeDasharray="3 3" />
        </g>

        {/* Title bar */}
        <rect
          x={contentX}
          y={row(titleRow)}
          width={contentW * 0.7}
          height={5}
          rx="1"
          fill="var(--foreground)"
          opacity="0.55"
          className="hero-title"
        />

        {/* Subtitle */}
        <rect
          x={contentX}
          y={row(subtitleRow)}
          width={contentW * 0.45}
          height={3}
          rx="1"
          fill="var(--slate)"
          opacity="0.3"
          className="hero-subtitle"
        />

        {/* Separator rule */}
        <line
          x1={contentX}
          y1={row(separatorRow)}
          x2={contentX + contentW}
          y2={row(separatorRow)}
          stroke="var(--rule)"
          strokeWidth="0.75"
          className="hero-sep"
        />

        {/* Column rule */}
        <line
          x1={contentX + colW + gutter / 2}
          y1={row(colRow0) - 4}
          x2={contentX + colW + gutter / 2}
          y2={footerRuleY}
          stroke="var(--rule)"
          strokeWidth="0.75"
          className="hero-colrule"
        />

        {/* ===== LEFT COLUMN ===== */}

        {/* Drop cap */}
        <rect
          x={contentX}
          y={row(colRow0) - 1}
          width={13}
          height={lineGap + 5}
          rx="1"
          fill="var(--gilt)"
          opacity="0.8"
          className="hero-dropcap"
        />

        {/* Left paragraph 1 */}
        {leftP1.map((l, i) => (
          <rect
            key={`lp1-${i}`}
            x={l.x}
            y={l.y}
            width={l.width}
            height={lineH}
            rx="1"
            fill="var(--foreground)"
            opacity="0.35"
            className="hero-ll"
            style={{ animationDelay: `${1.5 + i * 0.05}s` }}
          />
        ))}

        {/* Left paragraph 2 */}
        {leftP2.map((l, i) => (
          <rect
            key={`lp2-${i}`}
            x={l.x}
            y={l.y}
            width={l.width}
            height={lineH}
            rx="1"
            fill="var(--foreground)"
            opacity="0.35"
            className="hero-ll"
            style={{ animationDelay: `${1.85 + i * 0.05}s` }}
          />
        ))}

        {/* Pull quote block */}
        <line
          x1={contentX + 6}
          y1={row(quoteStartRow) - 3}
          x2={contentX + 6}
          y2={row(quoteStartRow + 2) + lineH + 3}
          stroke="var(--gilt)"
          strokeWidth="2"
          opacity="0.6"
          className="hero-quote"
          style={{ animationDelay: "2.2s" }}
        />
        {quoteLines.map((l, i) => (
          <rect
            key={`ql-${i}`}
            x={l.x}
            y={l.y}
            width={l.width}
            height={lineH}
            rx="1"
            fill="var(--foreground)"
            opacity="0.45"
            className="hero-quoteline"
            style={{ animationDelay: `${2.3 + i * 0.06}s` }}
          />
        ))}

        {/* Left paragraph 3 */}
        {leftP3.map((l, i) => (
          <rect
            key={`lp3-${i}`}
            x={l.x}
            y={l.y}
            width={l.width}
            height={lineH}
            rx="1"
            fill="var(--foreground)"
            opacity="0.35"
            className="hero-ll"
            style={{ animationDelay: `${2.6 + i * 0.05}s` }}
          />
        ))}

        {/* ===== RIGHT COLUMN ===== */}

        {/* Section heading */}
        <rect
          x={rightColX}
          y={row(colRow0)}
          width={colW * 0.6}
          height={3.5}
          rx="1"
          fill="var(--foreground)"
          opacity="0.5"
          className="hero-rhead"
        />

        {/* Right paragraph 1 */}
        {rightP1.map((l, i) => (
          <rect
            key={`rp1-${i}`}
            x={l.x}
            y={l.y}
            width={l.width}
            height={lineH}
            rx="1"
            fill="var(--foreground)"
            opacity="0.35"
            className="hero-rl"
            style={{ animationDelay: `${1.6 + i * 0.05}s` }}
          />
        ))}

        {/* Figure */}
        <g className="hero-figure" style={{ animationDelay: "2.1s" }}>
          <rect
            x={rightColX}
            y={figY}
            width={figW}
            height={figH}
            fill="var(--surface)"
            stroke="var(--gilt)"
            strokeWidth="0.75"
            opacity="0.6"
            rx="1"
          />
          {/* Mountain silhouette inside figure */}
          <path
            d={`M${rightColX + 6} ${figY + figH - 6}
                L${rightColX + figW * 0.3} ${figY + 14}
                L${rightColX + figW * 0.45} ${figY + 26}
                L${rightColX + figW * 0.6} ${figY + 10}
                L${rightColX + figW - 6} ${figY + figH - 6} Z`}
            fill="var(--gilt)"
            opacity="0.12"
          />
          {/* Sun circle */}
          <circle
            cx={rightColX + figW * 0.78}
            cy={figY + 16}
            r="6"
            fill="var(--gilt)"
            opacity="0.2"
          />
        </g>

        {/* Right paragraph 2 */}
        {rightP2.map((l, i) => (
          <rect
            key={`rp2-${i}`}
            x={l.x}
            y={l.y}
            width={l.width}
            height={lineH}
            rx="1"
            fill="var(--foreground)"
            opacity="0.35"
            className="hero-rl"
            style={{ animationDelay: `${2.45 + i * 0.05}s` }}
          />
        ))}

        {/* Right paragraph 3 */}
        {rightP3.map((l, i) => (
          <rect
            key={`rp3-${i}`}
            x={l.x}
            y={l.y}
            width={l.width}
            height={lineH}
            rx="1"
            fill="var(--foreground)"
            opacity="0.35"
            className="hero-rl"
            style={{ animationDelay: `${2.75 + i * 0.05}s` }}
          />
        ))}

        {/* ===== FOOTER ===== */}
        <g className="hero-footer">
          <line
            x1={contentX}
            y1={footerRuleY}
            x2={contentX + contentW}
            y2={footerRuleY}
            stroke="var(--rule)"
            strokeWidth="0.5"
          />
          {/* Page number */}
          <rect
            x={contentX + contentW / 2 - 6}
            y={pageNumY}
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
