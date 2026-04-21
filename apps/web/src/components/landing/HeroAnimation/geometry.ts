export interface HeroGeometry {
  pageX: number;
  pageY: number;
  pageW: number;
  pageH: number;
  margin: number;
  contentX: number;
  contentY: number;
  contentW: number;
  gutter: number;
  colW: number;
  rightColX: number;
  lineH: number;
  lineGap: number;
  row: (n: number) => number;
  titleRow: number;
  subtitleRow: number;
  separatorRow: number;
  colRow0: number;
  dropCapIndent: number;
  leftP1: { x: number; y: number; width: number }[];
  leftP2: { x: number; y: number; width: number }[];
  leftP3: { x: number; y: number; width: number }[];
  rightP1: { x: number; y: number; width: number }[];
  rightP2: { x: number; y: number; width: number }[];
  rightP3: { x: number; y: number; width: number }[];
  quoteStartRow: number;
  quoteLines: { x: number; y: number; width: number }[];
  figRow: number;
  figY: number;
  figW: number;
  figH: number;
  footerRuleY: number;
  pageNumY: number;
  gridLines: number[];
}

export function computeHeroGeometry(): HeroGeometry {
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

  const titleRow = 0;
  const subtitleRow = 1;
  const separatorRow = 2;

  const colRow0 = 4;

  // Drop cap spans 2 rows; lines beside it are indented
  const dropCapIndent = 16;

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

  // Row 0: section heading; rows 1-5: paragraph 1
  const rightP1 = Array.from({ length: 5 }, (_, i) => ({
    x: rightColX,
    y: row(colRow0 + 1 + i),
    width: i === 4 ? w(i + 40, colW * 0.4, colW * 0.6) : colW,
  }));

  // Figure: rows 7–11 (5 rows tall)
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

  const footerRuleY = pageY + pageH - margin - 10;
  const pageNumY = footerRuleY + 8;

  const gridLineCount = Math.floor((pageH - margin * 2) / lineGap);
  const gridLines = Array.from({ length: gridLineCount }, (_, i) => row(i));

  return {
    pageX, pageY, pageW, pageH, margin,
    contentX, contentY, contentW,
    gutter, colW, rightColX,
    lineH, lineGap, row,
    titleRow, subtitleRow, separatorRow,
    colRow0, dropCapIndent,
    leftP1, leftP2, leftP3,
    rightP1, rightP2, rightP3,
    quoteStartRow, quoteLines,
    figRow, figY, figW, figH,
    footerRuleY, pageNumY, gridLines,
  };
}
