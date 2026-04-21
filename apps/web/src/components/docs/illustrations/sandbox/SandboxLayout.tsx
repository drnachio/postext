import { Figure } from "../Figure";
import { Box, DropShadowDef, Label } from "../primitives";

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

export function SandboxLayout({ labels }: { labels: SandboxLayoutLabels }) {
  return (
    <Figure
      title={labels.title}
      desc={labels.desc}
      caption={labels.caption}
      viewBox="0 0 760 320"
      maxWidth={760}
    >
      <defs>
        <DropShadowDef id="slShadow" />
      </defs>

      {/* Outer window frame */}
      <rect x={20} y={20} width={720} height={280} fill="var(--svg-legend-fill)" stroke="var(--svg-legend-stroke)" strokeWidth={1.5} rx={8} filter="url(#slShadow)" />

      {/* Activity bar (48px wide) */}
      <Box x={20} y={20} width={48} height={280} color="purple" rx={8} />
      <Label x={44} y={40} anchor="middle" size={9} bold color="purple">{labels.activityBar}</Label>
      {labels.activityIcons.map((icon, i) => (
        <g key={i}>
          <rect x={32} y={58 + i * 34} width={24} height={24} fill="var(--svg-purple-fill)" stroke="var(--svg-purple-stroke)" strokeWidth={1.2} rx={4} />
          <text x={44} y={74 + i * 34} textAnchor="middle" fontSize="9" fill="var(--svg-purple-text)">{icon}</text>
        </g>
      ))}

      {/* Sidebar panel (resizable) */}
      <Box x={68} y={20} width={220} height={280} color="blue" rx={0} />
      <Label x={178} y={45} anchor="middle" size={11} bold color="blue">{labels.sidebarTitle}</Label>
      <Label x={178} y={62} anchor="middle" size={9} color="blue">{labels.sidebarSubtitle}</Label>
      {/* Fake form rows */}
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={84} y={85 + i * 40} width={188} height={28} fill="var(--svg-legend-fill)" stroke="var(--svg-blue-stroke)" strokeWidth={1} rx={3} opacity={0.7} />
          <rect x={92} y={94 + i * 40} width={60} height={10} fill="var(--svg-blue-text)" opacity={0.35} rx={2} />
          <rect x={200} y={94 + i * 40} width={64} height={10} fill="var(--svg-blue-text)" opacity={0.2} rx={2} />
        </g>
      ))}

      {/* Resize divider */}
      <line x1={290} y1={30} x2={290} y2={290} stroke="var(--svg-stroke)" strokeWidth={2} strokeDasharray="3,3" />
      <Label x={290} y={305} anchor="middle" size={8} color="light">{labels.resizeHint}</Label>

      {/* Viewport */}
      <Box x={292} y={20} width={448} height={280} color="teal" rx={0} />
      <Label x={516} y={45} anchor="middle" size={11} bold color="teal">{labels.viewportTitle}</Label>
      {/* Tabs */}
      {labels.tabs.map((tab, i) => (
        <g key={i}>
          <rect x={310 + i * 90} y={60} width={80} height={26} fill="var(--svg-teal-fill)" stroke="var(--svg-teal-stroke)" strokeWidth={1.2} rx={4} />
          <Label x={350 + i * 90} y={77} anchor="middle" size={10} bold color="teal">{tab}</Label>
        </g>
      ))}
      {/* Preview page */}
      <rect x={360} y={100} width={310} height={180} fill="var(--svg-legend-fill)" stroke="var(--svg-teal-stroke)" strokeWidth={1.2} rx={4} />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <rect key={i} x={375} y={118 + i * 16} width={i % 3 === 0 ? 200 : 280} height={8} fill="var(--svg-teal-text)" opacity={0.22} rx={1.5} />
      ))}
    </Figure>
  );
}
