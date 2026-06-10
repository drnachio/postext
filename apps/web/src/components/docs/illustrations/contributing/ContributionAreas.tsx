import { Figure } from "../Figure";
import { Box, DropShadowDef, Label, colorTokens, type ColorKey } from "../primitives";

export interface ContributionAreasLabels {
  title: string;
  desc?: string;
  caption?: string;
  areas: { name: string; items: string[] }[]; // four entries
}

const colors: ColorKey[] = ["blue", "orange", "green", "purple"];

// 2x2 grid of area cards around a central project hub.
const CARD_W = 250;
const CARD_H = 136;
const CARD_POS: { x: number; y: number }[] = [
  { x: 24, y: 20 }, // top-left
  { x: 414, y: 20 }, // top-right
  { x: 24, y: 232 }, // bottom-left
  { x: 414, y: 232 }, // bottom-right
];

// Connectors run from the inner corner of each card to the hub edge.
const CONNECTORS: { x: number; y: number; dx: number; dy: number }[] = [
  { x: 274, y: 156, dx: 36, dy: 26 },
  { x: 414, y: 156, dx: -36, dy: 26 },
  { x: 274, y: 232, dx: 36, dy: -26 },
  { x: 414, y: 232, dx: -36, dy: -26 },
];

const DOT_CLASSES = ["ca-dot-tl", "ca-dot-tr", "ca-dot-bl", "ca-dot-br"];

const animationCss = `
.ca-dot { opacity: 0; }
@media (prefers-reduced-motion: no-preference) {
  .ca-dot { animation-duration: 6s; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
  .ca-dot-tl { animation-name: ca-flow-tl; animation-delay: 0s; }
  .ca-dot-tr { animation-name: ca-flow-tr; animation-delay: 1.5s; }
  .ca-dot-bl { animation-name: ca-flow-bl; animation-delay: 3s; }
  .ca-dot-br { animation-name: ca-flow-br; animation-delay: 4.5s; }
  @keyframes ca-flow-tl {
    0% { transform: translate(0, 0); opacity: 0; }
    6% { opacity: 0.9; }
    28% { opacity: 0.9; }
    34% { transform: translate(36px, 26px); opacity: 0; }
    100% { transform: translate(36px, 26px); opacity: 0; }
  }
  @keyframes ca-flow-tr {
    0% { transform: translate(0, 0); opacity: 0; }
    6% { opacity: 0.9; }
    28% { opacity: 0.9; }
    34% { transform: translate(-36px, 26px); opacity: 0; }
    100% { transform: translate(-36px, 26px); opacity: 0; }
  }
  @keyframes ca-flow-bl {
    0% { transform: translate(0, 0); opacity: 0; }
    6% { opacity: 0.9; }
    28% { opacity: 0.9; }
    34% { transform: translate(36px, -26px); opacity: 0; }
    100% { transform: translate(36px, -26px); opacity: 0; }
  }
  @keyframes ca-flow-br {
    0% { transform: translate(0, 0); opacity: 0; }
    6% { opacity: 0.9; }
    28% { opacity: 0.9; }
    34% { transform: translate(-36px, -26px); opacity: 0; }
    100% { transform: translate(-36px, -26px); opacity: 0; }
  }
}
`;

export function ContributionAreas({ labels }: { labels: ContributionAreasLabels }) {
  const areas = labels.areas.slice(0, 4);
  return (
    <Figure
      title={labels.title}
      desc={labels.desc}
      caption={labels.caption}
      viewBox="0 0 688 388"
      maxWidth={688}
    >
      <defs>
        <DropShadowDef id="caShadow" />
      </defs>
      <style>{animationCss}</style>

      {/* Connectors: each contribution front feeds the project hub */}
      {areas.map((_, i) => {
        const c = CONNECTORS[i];
        if (!c) return null;
        const color = colors[i] ?? "blue";
        return (
          <g key={`c${i}`}>
            <line
              x1={c.x}
              y1={c.y}
              x2={c.x + c.dx}
              y2={c.y + c.dy}
              stroke="var(--svg-stroke)"
              strokeWidth={1.5}
              strokeLinecap="round"
              opacity={0.5}
            />
            <circle
              className={`ca-dot ${DOT_CLASSES[i]}`}
              cx={c.x}
              cy={c.y}
              r={3}
              fill={colorTokens[color].text}
            />
          </g>
        );
      })}

      {/* Central hub */}
      <rect
        x={292}
        y={177}
        width={104}
        height={34}
        rx={17}
        fill="var(--svg-legend-fill)"
        stroke="var(--svg-legend-stroke)"
        strokeWidth={1.5}
        filter="url(#caShadow)"
      />
      <Label x={344} y={198} size={12} bold anchor="middle">postext</Label>

      {/* Area cards */}
      {areas.map((area, i) => {
        const pos = CARD_POS[i];
        if (!pos) return null;
        const color = colors[i] ?? "blue";
        const { x, y } = pos;
        return (
          <g key={i}>
            <Box
              x={x}
              y={y}
              width={CARD_W}
              height={CARD_H}
              color={color}
              rx={10}
              strokeWidth={1.5}
              filter="url(#caShadow)"
            />
            <Label x={x + 16} y={y + 26} size={12} bold color={color}>{area.name}</Label>
            <line
              x1={x + 16}
              y1={y + 38}
              x2={x + CARD_W - 16}
              y2={y + 38}
              stroke={colorTokens[color].stroke}
              strokeWidth={1}
              opacity={0.35}
            />
            {area.items.slice(0, 4).map((item, j) => (
              <g key={j}>
                <circle
                  cx={x + 21}
                  cy={y + 54.5 + j * 22}
                  r={2}
                  fill={colorTokens[color].text}
                />
                <Label x={x + 30} y={y + 58 + j * 22} size={10} color="mid">{item}</Label>
              </g>
            ))}
          </g>
        );
      })}
    </Figure>
  );
}
