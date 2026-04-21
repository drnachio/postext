import { Figure } from "../Figure";
import { ArrowMarker, Box, DropShadowDef, Label } from "../primitives";

export interface ContributionWorkflowLabels {
  title: string;
  desc?: string;
  caption?: string;
  steps: { name: string; sub: string }[]; // four entries
  branchLabel: string;
  branchSub: string;
}

export function ContributionWorkflow({ labels }: { labels: ContributionWorkflowLabels }) {
  const steps = labels.steps.slice(0, 4);
  const colors: ("blue" | "orange" | "green" | "purple")[] = ["blue", "orange", "green", "purple"];
  const boxW = 140;
  const gap = 40;
  const startX = 30;
  return (
    <Figure
      title={labels.title}
      desc={labels.desc}
      caption={labels.caption}
      viewBox="0 0 760 240"
      maxWidth={760}
    >
      <defs>
        <ArrowMarker id="cwArrow" />
        <DropShadowDef id="cwShadow" />
      </defs>

      {steps.map((s, i) => {
        const x = startX + i * (boxW + gap);
        const color = colors[i] ?? "blue";
        return (
          <g key={i}>
            <Box x={x} y={70} width={boxW} height={70} color={color} filter="url(#cwShadow)" />
            <Label x={x + boxW / 2} y={100} anchor="middle" size={12} bold color={color}>{s.name}</Label>
            <Label x={x + boxW / 2} y={120} anchor="middle" size={9} color={color}>{s.sub}</Label>
            {i < steps.length - 1 && (
              <line
                x1={x + boxW}
                y1={105}
                x2={x + boxW + gap}
                y2={105}
                stroke="var(--svg-stroke)"
                strokeWidth={2}
                markerEnd="url(#cwArrow)"
              />
            )}
          </g>
        );
      })}

      {/* Branch — good first issue / discussion */}
      <line
        x1={startX + boxW / 2}
        y1={140}
        x2={startX + boxW / 2}
        y2={185}
        stroke="var(--svg-yellow-stroke)"
        strokeWidth={1.5}
        strokeDasharray="4,3"
      />
      <rect
        x={startX + 10}
        y={185}
        width={boxW - 20}
        height={40}
        fill="var(--svg-yellow-fill)"
        stroke="var(--svg-yellow-stroke)"
        strokeWidth={1.2}
        rx={6}
      />
      <Label x={startX + boxW / 2} y={202} anchor="middle" size={10} bold color="yellow">{labels.branchLabel}</Label>
      <Label x={startX + boxW / 2} y={217} anchor="middle" size={8} color="yellow">{labels.branchSub}</Label>
    </Figure>
  );
}
