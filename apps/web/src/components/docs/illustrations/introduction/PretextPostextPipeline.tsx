import type { ReactNode } from "react";
import { Figure } from "../Figure";
import { ArrowMarker, Box, DropShadowDef, Label, colorTokens } from "../primitives";

export interface PretextPostextLabels {
  title: string;
  desc?: string;
  caption?: string;
  pretextTitle: string;
  pretextSubtitle: string;
  pretextBullets: string[];
  bridge: string[];
  postextTitle: string;
  postextSubtitle: string;
  postextBullets: string[];
}

const PANEL_Y = 24;
const PANEL_W = 300;
const PANEL_H = 208;
const LEFT_X = 24;
const RIGHT_X = 496;
const ARROW_Y = 128;

/** One side of the pipeline: title + role pill, divider, glyph slot, bullets. */
function Panel({
  x,
  color,
  title,
  subtitle,
  bullets,
  children,
}: {
  x: number;
  color: "purple" | "orange";
  title: string;
  subtitle: string;
  bullets: string[];
  children?: ReactNode;
}) {
  const t = colorTokens[color];
  return (
    <g>
      <Box x={x} y={PANEL_Y} width={PANEL_W} height={PANEL_H} color={color} filter="url(#ppp-shadow)" />
      <Label x={x + 24} y={52} size={15} bold color={color}>{title}</Label>
      {/* role pill, right-aligned */}
      <rect x={x + PANEL_W - 82} y={40} width={58} height={17} rx={8.5} fill={t.fill} stroke={t.stroke} strokeWidth={1} />
      <Label x={x + PANEL_W - 53} y={51.5} size={9} anchor="middle" color={color}>{subtitle}</Label>
      <line x1={x + 20} y1={64} x2={x + PANEL_W - 20} y2={64} stroke={t.stroke} strokeWidth={1} opacity={0.25} />
      {children}
      {bullets.map((b, i) => (
        <g key={i}>
          <circle cx={x + 28} cy={172 + i * 19 - 3.5} r={2} fill={t.text} opacity={0.7} />
          <Label x={x + 36} y={172 + i * 19} size={10} color={color}>{b}</Label>
        </g>
      ))}
    </g>
  );
}

export function PretextPostextPipeline({ labels }: { labels: PretextPostextLabels }) {
  const purple = colorTokens.purple;
  const orange = colorTokens.orange;
  const green = colorTokens.green;
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 820 256" maxWidth={820}>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .ppp-flow { animation: ppp-dash 1.8s linear infinite; }
          @keyframes ppp-dash { to { stroke-dashoffset: -16; } }
        }
      `}</style>
      <defs>
        <ArrowMarker id="ppp-arrow" color="var(--svg-orange-stroke)" />
        <DropShadowDef id="ppp-shadow" />
        <linearGradient id="ppp-grad" gradientUnits="userSpaceOnUse" x1={332} y1={0} x2={482} y2={0}>
          <stop offset="0" stopColor="var(--svg-purple-stroke)" />
          <stop offset="1" stopColor="var(--svg-orange-stroke)" />
        </linearGradient>
      </defs>

      {/* ── Pretext: measure ── */}
      <Panel
        x={LEFT_X}
        color="purple"
        title={labels.pretextTitle}
        subtitle={labels.pretextSubtitle}
        bullets={labels.pretextBullets}
      >
        {/* glyph: a paragraph being measured */}
        {[
          { y: 80, w: 156 },
          { y: 96, w: 148 },
          { y: 112, w: 156 },
          { y: 128, w: 100 },
        ].map((l, i) => (
          <rect key={i} x={LEFT_X + 32} y={l.y} width={l.w} height={5} rx={2.5} fill={purple.text} opacity={0.4} />
        ))}
        {/* dimension bracket */}
        <line x1={LEFT_X + 204} y1={80} x2={LEFT_X + 204} y2={133} stroke={purple.stroke} strokeWidth={1.5} />
        <line x1={LEFT_X + 197} y1={80} x2={LEFT_X + 211} y2={80} stroke={purple.stroke} strokeWidth={1.5} />
        <line x1={LEFT_X + 197} y1={133} x2={LEFT_X + 211} y2={133} stroke={purple.stroke} strokeWidth={1.5} />
        <Label x={LEFT_X + 218} y={110} size={9} color="purple">144px</Label>
      </Panel>

      {/* ── bridge: exact dimensions flow left → right ── */}
      {labels.bridge.map((b, i) => (
        <Label key={i} x={410} y={120 - (labels.bridge.length - 1 - i) * 14} anchor="middle" size={10} color="mid">
          {b}
        </Label>
      ))}
      <line
        x1={332} y1={ARROW_Y} x2={482} y2={ARROW_Y}
        stroke="var(--svg-stroke)" strokeWidth={1.5} opacity={0.4}
        markerEnd="url(#ppp-arrow)"
      />
      <line
        className="ppp-flow"
        x1={332} y1={ARROW_Y} x2={476} y2={ARROW_Y}
        stroke="url(#ppp-grad)" strokeWidth={2.5}
        strokeDasharray="5 11" strokeLinecap="round"
      />

      {/* ── Postext: decide ── */}
      <Panel
        x={RIGHT_X}
        color="orange"
        title={labels.postextTitle}
        subtitle={labels.postextSubtitle}
        bullets={labels.postextBullets}
      >
        {/* glyph: a two-column page with a floated resource */}
        <rect x={RIGHT_X + 40} y={76} width={220} height={72} rx={3} fill="var(--svg-legend-fill)" stroke="var(--svg-legend-stroke)" strokeWidth={1} />
        {/* column 1: text bars */}
        {[96, 96, 96, 96, 96, 96, 58].map((w, i) => (
          <rect key={i} x={RIGHT_X + 50} y={84 + i * 9} width={w} height={4} rx={2} fill={orange.text} opacity={0.4} />
        ))}
        {/* column 2: floated resource at the top band */}
        <rect x={RIGHT_X + 154} y={84} width={96} height={20} rx={2} fill={green.fill} stroke={green.stroke} strokeWidth={1} />
        {/* column 2: text flows below the float */}
        {[96, 96, 96, 40].map((w, i) => (
          <rect key={i} x={RIGHT_X + 154} y={112 + i * 9} width={w} height={4} rx={2} fill={orange.text} opacity={0.4} />
        ))}
      </Panel>
    </Figure>
  );
}
