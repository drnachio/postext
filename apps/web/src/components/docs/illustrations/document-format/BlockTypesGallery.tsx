import { Figure } from "../Figure";
import { DropShadowDef, colorTokens, type ColorKey } from "../primitives";

export interface BlockTypesGalleryLabels {
  title: string;
  desc?: string;
  caption?: string;
  blocks: { name: string; syntax: string; color: string }[];
}

const palette: ColorKey[] = ["blue", "orange", "green", "purple", "pink", "teal", "yellow"];

function asColorKey(color: string, i: number): ColorKey {
  return (palette as string[]).includes(color) ? (color as ColorKey) : palette[i % palette.length]!;
}

type SketchKind = "heading" | "para" | "quote" | "ul" | "ol" | "task" | "math";

/** Infer which mini typeset preview to draw from the markdown syntax itself. */
function sketchFor(syntax: string): SketchKind {
  const s = syntax.trim();
  if (s.startsWith("#")) return "heading";
  if (s.startsWith(">")) return "quote";
  if (/^[-*+]\s*\[/.test(s)) return "task";
  if (/^[-*+]\s/.test(s)) return "ul";
  if (/^\d+[.)]/.test(s)) return "ol";
  if (s.startsWith("$$")) return "math";
  return "para";
}

const GRAY = "var(--svg-faint-text)";
const GRAY_OP = 0.4;

/** A faint placeholder text line. */
function Bar({ x, y, w }: { x: number; y: number; w: number }) {
  return <rect x={x} y={y} width={w} height={3.5} rx={1.75} fill={GRAY} opacity={GRAY_OP} />;
}

/** Mini typeset preview, drawn in a 176x48 area at (ox, oy). Colored ink = what the block produces. */
function Sketch({ kind, ox, oy, ink }: { kind: SketchKind; ox: number; oy: number; ink: string }) {
  switch (kind) {
    case "heading":
      return (
        <g>
          <rect x={ox} y={oy + 3} width={96} height={7} rx={2} fill={ink} />
          <Bar x={ox} y={oy + 20} w={176} />
          <Bar x={ox} y={oy + 28} w={176} />
          <Bar x={ox} y={oy + 36} w={132} />
        </g>
      );
    case "para":
      return (
        <g opacity={0.75}>
          <rect x={ox} y={oy + 4} width={176} height={3.5} rx={1.75} fill={ink} />
          <rect x={ox} y={oy + 14} width={176} height={3.5} rx={1.75} fill={ink} />
          <rect x={ox} y={oy + 24} width={176} height={3.5} rx={1.75} fill={ink} />
          <rect x={ox} y={oy + 34} width={112} height={3.5} rx={1.75} fill={ink} />
        </g>
      );
    case "quote":
      return (
        <g>
          <rect x={ox + 4} y={oy + 4} width={3} height={36} rx={1.5} fill={ink} />
          <Bar x={ox + 18} y={oy + 8} w={146} />
          <Bar x={ox + 18} y={oy + 18} w={146} />
          <Bar x={ox + 18} y={oy + 28} w={98} />
        </g>
      );
    case "ul":
      return (
        <g>
          {[8, 22, 36].map((dy, i) => (
            <g key={i}>
              <circle cx={ox + 6} cy={oy + dy} r={2.5} fill={ink} />
              <Bar x={ox + 16} y={oy + dy - 1.75} w={[140, 118, 130][i]!} />
            </g>
          ))}
        </g>
      );
    case "ol":
      return (
        <g>
          {[8, 22, 36].map((dy, i) => (
            <g key={i}>
              <text x={ox + 2} y={oy + dy + 3} fontSize={9} fontWeight="bold" fill={ink}>
                {i + 1}.
              </text>
              <Bar x={ox + 18} y={oy + dy - 1.75} w={[140, 118, 130][i]!} />
            </g>
          ))}
        </g>
      );
    case "task":
      return (
        <g>
          {[8, 22, 36].map((dy, i) => {
            const checked = i === 0;
            const bx = ox + 2;
            const by = oy + dy - 4.5;
            return (
              <g key={i}>
                <rect x={bx} y={by} width={9} height={9} rx={2} fill={checked ? ink : "none"} fillOpacity={checked ? 0.2 : undefined} stroke={ink} strokeWidth={1.5} />
                {checked ? (
                  <path d={`M ${bx + 2.2} ${by + 4.6} L ${bx + 4} ${by + 6.4} L ${bx + 7} ${by + 2.6}`} fill="none" stroke={ink} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                ) : null}
                <Bar x={ox + 18} y={oy + dy - 1.75} w={[140, 118, 130][i]!} />
              </g>
            );
          })}
        </g>
      );
    case "math":
      return (
        <g>
          <Bar x={ox} y={oy + 2} w={176} />
          <text x={ox + 80} y={oy + 27} fontSize={13} fontStyle="italic" textAnchor="middle" fill={ink}>
            {"∫ f(x) dx"}
          </text>
          <text x={ox + 176} y={oy + 26} fontSize={8} textAnchor="end" fill={GRAY}>
            (1)
          </text>
          <Bar x={ox} y={oy + 40} w={176} />
        </g>
      );
  }
}

export function BlockTypesGallery({ labels }: { labels: BlockTypesGalleryLabels }) {
  const cellW = 200;
  const cellH = 124;
  const cols = 4;
  const gap = 18;
  const margin = 20;
  const n = labels.blocks.length;
  const rows = Math.ceil(n / cols);
  const viewW = margin * 2 + cols * cellW + (cols - 1) * gap;
  const viewH = margin * 2 + rows * cellH + (rows - 1) * gap;

  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox={`0 0 ${viewW} ${viewH}`} maxWidth={860}>
      <defs>
        <DropShadowDef id="btg-shadow" />
      </defs>
      {labels.blocks.map((b, i) => {
        const r = Math.floor(i / cols);
        const itemsInRow = Math.min(cols, n - r * cols);
        const rowW = itemsInRow * cellW + (itemsInRow - 1) * gap;
        const c = i - r * cols;
        const x = (viewW - rowW) / 2 + c * (cellW + gap);
        const y = margin + r * (cellH + gap);
        const t = colorTokens[asColorKey(b.color, i)];
        const cx = x + 100; // card horizontal centre
        return (
          <g key={i}>
            {/* card */}
            <rect x={x} y={y} width={cellW} height={cellH} rx={8} fill="var(--svg-legend-fill)" stroke="var(--svg-legend-stroke)" strokeWidth={1.5} filter="url(#btg-shadow)" />
            {/* block name */}
            <circle cx={x + 17} cy={y + 15.5} r={3.5} fill={t.stroke} />
            <text x={x + 28} y={y + 19} fontSize={11} fontWeight="bold" fill={t.text}>
              {b.name}
            </text>
            {/* markdown source chip */}
            <rect x={x + 12} y={y + 28} width={176} height={20} rx={4} fill={t.fill} stroke={t.stroke} strokeWidth={1} strokeOpacity={0.35} />
            <text x={x + 20} y={y + 41.5} fontSize={10} fill={t.text}>
              {b.syntax}
            </text>
            {/* source -> rendered block */}
            <path d={`M ${cx - 5} ${y + 53} L ${cx} ${y + 58} L ${cx + 5} ${y + 53}`} fill="none" stroke={GRAY} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            {/* mini typeset preview */}
            <Sketch kind={sketchFor(b.syntax)} ox={x + 12} oy={y + 64} ink={t.text} />
          </g>
        );
      })}
    </Figure>
  );
}
