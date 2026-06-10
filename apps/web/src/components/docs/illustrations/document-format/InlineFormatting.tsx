import { Figure } from "../Figure";
import { Label, ArrowMarker, DropShadowDef, colorTokens } from "../primitives";

export interface InlineFormattingLabels {
  title: string;
  desc?: string;
  caption?: string;
  rows: { markdown: string; rendered: string; style: "bold" | "italic" | "bold-italic" | "code" | "link" }[];
}

type Row = InlineFormattingLabels["rows"][number];

interface Segment {
  text: string;
  kind: "delim" | "content" | "url";
}

/** Split a raw markdown snippet into delimiter / content / url segments so the
 *  syntax characters can be tinted differently from the wrapped text. */
function splitMarkdown(md: string, style: Row["style"]): Segment[] {
  if (style === "link") {
    const m = md.match(/^\[(.*)\]\((.*)\)$/);
    if (m) {
      return [
        { text: "[", kind: "delim" },
        { text: m[1], kind: "content" },
        { text: "](", kind: "delim" },
        { text: m[2], kind: "url" },
        { text: ")", kind: "delim" },
      ];
    }
  }
  const m = md.match(/^([*_`]+)(.*?)([*_`]+)$/);
  if (m) {
    return [
      { text: m[1], kind: "delim" },
      { text: m[2], kind: "content" },
      { text: m[3], kind: "delim" },
    ];
  }
  return [{ text: md, kind: "content" }];
}

const SERIF = "Georgia, 'Times New Roman', serif";

function RenderedText({ row, x, y }: { row: Row; x: number; y: number }) {
  if (row.style === "code") {
    // Monospace pill, sized to the string (~0.62em per char at 12px).
    const w = row.rendered.length * 7.44 + 14;
    return (
      <g>
        <rect x={x - 7} y={y - 13} width={w} height={18} rx={4} fill={colorTokens.orange.fill} stroke={colorTokens.orange.stroke} strokeWidth={1} strokeOpacity={0.5} />
        <text x={x} y={y} fontSize={12} fill={colorTokens.orange.text}>{row.rendered}</text>
      </g>
    );
  }
  if (row.style === "link") {
    return (
      <text x={x} y={y} fontSize={14} fontFamily={SERIF} fill={colorTokens.blue.text} textDecoration="underline">
        {row.rendered}
      </text>
    );
  }
  const bold = row.style === "bold" || row.style === "bold-italic";
  const italic = row.style === "italic" || row.style === "bold-italic";
  return (
    <text
      x={x}
      y={y}
      fontSize={14}
      fontFamily={SERIF}
      fontWeight={bold ? "bold" : "normal"}
      fontStyle={italic ? "italic" : "normal"}
      fill="var(--svg-dark-text)"
    >
      {row.rendered}
    </text>
  );
}

export function InlineFormatting({ labels }: { labels: InlineFormattingLabels }) {
  const n = labels.rows.length;

  // ── Geometry ──
  const cardTop = 22;
  const headerBottom = cardTop + 30; //   52
  const firstBaseline = headerBottom + 32; //   84
  const rowStep = 40;
  const lastBaseline = firstBaseline + (n - 1) * rowStep;
  const cardBottom = lastBaseline + 30;
  const cardH = cardBottom - cardTop;
  const vbH = cardBottom + 22;

  const leftX = 36;
  const cardW = 308;
  const rightX = 416;
  const padX = 24;

  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox={`0 0 760 ${vbH}`} maxWidth={760}>
      <defs>
        <DropShadowDef id="ifmt-shadow" />
        <ArrowMarker id="ifmt-arrow" color="var(--svg-stroke)" />
      </defs>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .ifmt-flow { animation: ifmt-dash 2.4s linear infinite; }
          @keyframes ifmt-dash { to { stroke-dashoffset: -10; } }
        }
      `}</style>

      {/* ── Source card (markdown) ── */}
      <rect x={leftX} y={cardTop} width={cardW} height={cardH} rx={10} fill="var(--svg-legend-fill)" stroke="var(--svg-legend-stroke)" strokeWidth={1.5} filter="url(#ifmt-shadow)" />
      <line x1={leftX} y1={headerBottom} x2={leftX + cardW} y2={headerBottom} stroke="var(--svg-legend-stroke)" strokeWidth={1} />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={leftX + 20 + i * 14} cy={cardTop + 15} r={4} fill="var(--svg-faint-text)" opacity={0.45} />
      ))}
      <Label x={leftX + 64} y={cardTop + 19} size={11} bold color="mid">Markdown</Label>

      {/* ── Typeset card (rendered) ── */}
      <rect x={rightX} y={cardTop} width={cardW} height={cardH} rx={10} fill="var(--svg-legend-fill)" stroke="var(--svg-legend-stroke)" strokeWidth={1.5} filter="url(#ifmt-shadow)" />
      <line x1={rightX} y1={headerBottom} x2={rightX + cardW} y2={headerBottom} stroke="var(--svg-legend-stroke)" strokeWidth={1} />
      <text x={rightX + 20} y={cardTop + 20} fontSize={13} fontFamily={SERIF} fontWeight="bold" fill="var(--svg-mid-text)">
        Aa <tspan fontWeight="normal" fontStyle="italic">Aa</tspan>
      </text>
      <text x={rightX + cardW - 18} y={cardTop + 20} fontSize={12} fontFamily={SERIF} textAnchor="end" fill="var(--svg-faint-text)">¶</text>

      {labels.rows.map((row, i) => {
        const y = firstBaseline + i * rowStep;
        const segs = splitMarkdown(row.markdown, row.style);
        return (
          <g key={i}>
            {/* row separators inside both cards */}
            {i > 0 ? (
              <>
                <line x1={leftX + 16} y1={y - 20} x2={leftX + cardW - 16} y2={y - 20} stroke="var(--svg-grid)" strokeWidth={1} />
                <line x1={rightX + 16} y1={y - 20} x2={rightX + cardW - 16} y2={y - 20} stroke="var(--svg-grid)" strokeWidth={1} />
              </>
            ) : null}

            {/* markdown source: purple delimiters, dark content, faint url */}
            <text x={leftX + padX} y={y} fontSize={12} fill="var(--svg-dark-text)">
              {segs.map((s, j) => (
                <tspan
                  key={j}
                  fill={s.kind === "delim" ? colorTokens.purple.text : s.kind === "url" ? "var(--svg-faint-text)" : "var(--svg-dark-text)"}
                  fontWeight={s.kind === "delim" ? "bold" : "normal"}
                >
                  {s.text}
                </tspan>
              ))}
            </text>

            {/* flow arrow */}
            <line
              className="ifmt-flow"
              x1={leftX + cardW + 8}
              y1={y - 4}
              x2={rightX - 12}
              y2={y - 4}
              stroke="var(--svg-stroke)"
              strokeWidth={1.5}
              strokeDasharray="5 5"
              opacity={0.6}
              markerEnd="url(#ifmt-arrow)"
              style={{ animationDelay: `${i * -0.4}s` }}
            />

            {/* rendered result */}
            <RenderedText row={row} x={rightX + padX} y={y} />
          </g>
        );
      })}
    </Figure>
  );
}
