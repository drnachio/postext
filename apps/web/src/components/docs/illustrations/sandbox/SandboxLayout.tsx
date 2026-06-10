import { Figure } from "../Figure";
import { DropShadowDef, Label } from "../primitives";

export interface SandboxLayoutLabels {
  title: string;
  desc?: string;
  caption?: string;
  activityBar: string;
  activityIcons: string[];
  sidebarTitle: string;
  sidebarSubtitle: string;
  viewportTitle: string;
  tabs: string[];
  resizeHint: string;
}

const ICON_YS = [60, 98, 136, 174, 212];
const ROW_YS = [86, 124, 162, 200, 238];
const COL1_LINES = [166, 150, 162, 140, 166, 154, 160, 146, 166, 130, 158, 96];
const COL2_LINES = [166, 152, 160, 104];

export function SandboxLayout({ labels }: { labels: SandboxLayoutLabels }) {
  return (
    <Figure
      title={labels.title}
      desc={labels.desc}
      caption={labels.caption}
      viewBox="0 0 780 352"
      maxWidth={780}
    >
      <defs>
        <DropShadowDef id="sbxl-shadow" />
        <clipPath id="sbxl-frame-clip">
          <rect x={20} y={20} width={740} height={300} rx={10} />
        </clipPath>
      </defs>

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .sbxl-chev-l { animation: sbxl-nudge-l 4s ease-in-out infinite; }
          .sbxl-chev-r { animation: sbxl-nudge-r 4s ease-in-out infinite; }
          @keyframes sbxl-nudge-l {
            0%, 100% { transform: translateX(0); opacity: 0.45; }
            50% { transform: translateX(-3px); opacity: 1; }
          }
          @keyframes sbxl-nudge-r {
            0%, 100% { transform: translateX(0); opacity: 0.45; }
            50% { transform: translateX(3px); opacity: 1; }
          }
        }
      `}</style>

      {/* Window frame */}
      <rect
        x={20}
        y={20}
        width={740}
        height={300}
        rx={10}
        fill="var(--svg-legend-fill)"
        stroke="var(--svg-legend-stroke)"
        strokeWidth={1.5}
        filter="url(#sbxl-shadow)"
      />

      {/* Zone fills, clipped to the rounded frame */}
      <g clipPath="url(#sbxl-frame-clip)">
        <rect x={20} y={20} width={56} height={300} fill="var(--svg-purple-fill)" />
        <rect x={76} y={20} width={244} height={300} fill="var(--svg-blue-fill)" />
        <rect x={320} y={20} width={440} height={300} fill="var(--svg-teal-fill)" />
      </g>

      {/* ── Activity bar ── */}
      {labels.activityIcons.map((icon, i) => (
        <g key={i}>
          <rect
            x={34}
            y={ICON_YS[i]}
            width={28}
            height={28}
            rx={6}
            fill="var(--svg-legend-fill)"
            stroke="var(--svg-purple-stroke)"
            strokeWidth={1.5}
            opacity={i === 0 ? 1 : 0.55}
          />
          <text
            x={48}
            y={ICON_YS[i] + 18.5}
            textAnchor="middle"
            fontSize={10}
            fontWeight={i === 0 ? "bold" : "normal"}
            fill="var(--svg-purple-text)"
          >
            {icon}
          </text>
        </g>
      ))}
      {/* Active-panel marker next to first icon */}
      <rect x={21} y={62} width={3} height={24} rx={1.5} fill="var(--svg-purple-stroke)" />
      {/* Badge on the last (warnings) icon */}
      <circle cx={62} cy={212} r={4.5} fill="var(--svg-pink-stroke)" />
      <text
        x={48}
        y={275}
        transform="rotate(-90 48 272)"
        textAnchor="middle"
        fontSize={9}
        fontWeight="bold"
        fill="var(--svg-purple-text)"
      >
        {labels.activityBar}
      </text>

      {/* ── Sidebar ── */}
      <line x1={76} y1={21} x2={76} y2={319} stroke="var(--svg-legend-stroke)" strokeWidth={1} />
      <Label x={92} y={46} size={11} bold color="blue">{labels.sidebarTitle}</Label>
      <Label x={92} y={62} size={9} color="mid">{labels.sidebarSubtitle}</Label>
      <line x1={77} y1={72} x2={319} y2={72} stroke="var(--svg-blue-stroke)" strokeWidth={1} opacity={0.3} />
      {ROW_YS.map((y, i) => (
        <g key={i}>
          <rect
            x={90}
            y={y}
            width={200}
            height={28}
            rx={4}
            fill="var(--svg-legend-fill)"
            stroke="var(--svg-blue-stroke)"
            strokeWidth={1}
            opacity={0.65}
          />
          <rect x={98} y={y + 9.5} width={64} height={9} rx={2} fill="var(--svg-blue-text)" opacity={0.35} />
          <rect x={212} y={y + 9.5} width={70} height={9} rx={2} fill="var(--svg-blue-text)" opacity={0.18} />
        </g>
      ))}

      {/* ── Resize divider ── */}
      <line x1={320} y1={24} x2={320} y2={316} stroke="var(--svg-stroke)" strokeWidth={2} strokeDasharray="4,4" />
      <rect
        x={312}
        y={158}
        width={16}
        height={36}
        rx={8}
        fill="var(--svg-legend-fill)"
        stroke="var(--svg-stroke)"
        strokeWidth={1.5}
      />
      <polyline
        className="sbxl-chev-l"
        points="304,168 298,176 304,184"
        fill="none"
        stroke="var(--svg-stroke)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.45}
      />
      <polyline
        className="sbxl-chev-r"
        points="336,168 342,176 336,184"
        fill="none"
        stroke="var(--svg-stroke)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.45}
      />
      <line x1={320} y1={320} x2={320} y2={328} stroke="var(--svg-stroke)" strokeWidth={1} strokeDasharray="2,2" />
      <Label x={320} y={340} anchor="middle" size={9} color="light">{labels.resizeHint}</Label>

      {/* ── Viewport ── */}
      <Label x={344} y={46} size={11} bold color="teal">{labels.viewportTitle}</Label>
      {labels.tabs.map((tab, i) => {
        const x = 344 + i * 78;
        const active = i === 0;
        return (
          <g key={i}>
            <rect
              x={x}
              y={58}
              width={70}
              height={26}
              rx={4}
              fill={active ? "var(--svg-legend-fill)" : "none"}
              stroke={active ? "var(--svg-teal-stroke)" : "var(--svg-legend-stroke)"}
              strokeWidth={active ? 1.5 : 1}
            />
            {active ? (
              <rect x={x + 6} y={79} width={58} height={2.5} rx={1.25} fill="var(--svg-teal-stroke)" />
            ) : null}
            <Label x={x + 35} y={75} anchor="middle" size={10} bold={active} color={active ? "teal" : "mid"}>
              {tab}
            </Label>
          </g>
        );
      })}

      {/* Rendered page preview (two columns, echoing the engine output) */}
      <rect
        x={348}
        y={96}
        width={388}
        height={208}
        rx={4}
        fill="var(--svg-legend-fill)"
        stroke="var(--svg-teal-stroke)"
        strokeWidth={1.2}
        filter="url(#sbxl-shadow)"
      />
      {/* Heading bar */}
      <rect x={364} y={112} width={180} height={11} rx={2} fill="var(--svg-teal-text)" opacity={0.4} />
      {/* Column 1: text lines */}
      {COL1_LINES.map((w, i) => (
        <rect key={i} x={364} y={136 + i * 13} width={w} height={6.5} rx={1.5} fill="var(--svg-teal-text)" opacity={0.22} />
      ))}
      {/* Column 2: floated figure + caption + text lines */}
      <rect x={554} y={136} width={166} height={70} rx={3} fill="var(--svg-teal-fill)" stroke="var(--svg-teal-stroke)" strokeWidth={1} />
      <circle cx={592} cy={158} r={7} fill="none" stroke="var(--svg-teal-text)" strokeWidth={1.5} opacity={0.6} />
      <path
        d="M562 196 L598 168 L622 188 L644 162 L712 196 Z"
        fill="var(--svg-teal-text)"
        opacity={0.3}
      />
      <rect x={576} y={214} width={122} height={6} rx={1.5} fill="var(--svg-teal-text)" opacity={0.3} />
      {COL2_LINES.map((w, i) => (
        <rect key={i} x={554} y={234 + i * 13} width={w} height={6.5} rx={1.5} fill="var(--svg-teal-text)" opacity={0.22} />
      ))}
    </Figure>
  );
}
