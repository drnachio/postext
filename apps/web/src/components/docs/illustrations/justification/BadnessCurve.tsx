import { Figure } from "../Figure";
import { Label, colorTokens } from "../primitives";

export interface BadnessCurveLabels {
  title: string;
  desc?: string;
  caption?: string;
  xAxis: string;
  yAxis: string;
  zero: string;
  tight: string;
  loose: string;
  formula: string;
}

export function BadnessCurve({ labels }: { labels: BadnessCurveLabels }) {
  // badness(r) = 100 * |r|^3  — compute curve points
  const points: string[] = [];
  const maxR = 1.2;
  const width = 560;
  const height = 180;
  const left = 80;
  const bottom = 220;
  for (let i = 0; i <= 100; i++) {
    const r = -maxR + (2 * maxR * i) / 100;
    const b = Math.min(100 * Math.abs(r) ** 3, 200);
    const px = left + ((r + maxR) / (2 * maxR)) * width;
    const py = bottom - (b / 200) * height;
    points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }

  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 280" maxWidth={760}>
      {/* Axes */}
      <line x1={left} y1={bottom} x2={left + width} y2={bottom} stroke="var(--svg-stroke)" strokeWidth={1.5} />
      <line x1={left} y1={bottom} x2={left} y2={bottom - height - 10} stroke="var(--svg-stroke)" strokeWidth={1.5} />

      {/* zero line */}
      <line x1={left + width / 2} y1={bottom} x2={left + width / 2} y2={bottom - height - 10} stroke="var(--svg-grid)" strokeDasharray="3,3" />
      <Label x={left + width / 2} y={bottom + 15} anchor="middle" size={9} color="light">r = 0</Label>

      {/* curve */}
      <polyline points={points.join(" ")} fill="none" stroke={colorTokens.purple.stroke} strokeWidth={2} />

      {/* zones */}
      <rect x={left} y={bottom - height - 10} width={width / 2} height={height + 10} fill={colorTokens.pink.fill} opacity={0.25} />
      <rect x={left + width / 2} y={bottom - height - 10} width={width / 2} height={height + 10} fill={colorTokens.blue.fill} opacity={0.25} />
      <Label x={left + width / 4} y={bottom - height} anchor="middle" size={10} bold color="pink">{labels.tight}</Label>
      <Label x={left + (3 * width) / 4} y={bottom - height} anchor="middle" size={10} bold color="blue">{labels.loose}</Label>

      <Label x={left + width + 5} y={bottom + 5} size={10} color="mid">{labels.xAxis}</Label>
      <Label x={left - 5} y={bottom - height - 15} size={10} color="mid" anchor="end">{labels.yAxis}</Label>
      <Label x={left - 5} y={bottom + 5} size={9} color="light" anchor="end">{labels.zero}</Label>

      <text x={left + width / 2} y={bottom - height + 5} fontSize="11" fontFamily="monospace" textAnchor="middle" fill={colorTokens.purple.text} fontWeight="bold">{labels.formula}</text>
    </Figure>
  );
}
