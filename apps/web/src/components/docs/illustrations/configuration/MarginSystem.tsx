import { Figure } from "../Figure";
import { Label, DropShadowDef, colorTokens } from "../primitives";

export interface MarginSystemLabels {
  title: string;
  desc?: string;
  caption?: string;
  page: string;
  content: string;
  top: string;
  right: string;
  bottom: string;
  left: string;
}

/**
 * One idea: every side of the page has its OWN margin.
 * The four margins are drawn deliberately asymmetric (1 / 1.5 / 2 / 2.5 cm),
 * each annotated with a dimension arrow inside its hatched margin band,
 * so the independence of the four values is visible at a glance.
 */
export function MarginSystem({ labels }: { labels: MarginSystemLabels }) {
  // Page sheet
  const pX = 60;
  const pY = 44;
  const pW = 420;
  const pH = 280;

  // Asymmetric margins (px), annotated with proportional mock values
  const mT = 36; //   1 cm
  const mR = 56; // 1.5 cm
  const mB = 72; //   2 cm
  const mL = 96; // 2.5 cm

  // Content area
  const cX = pX + mL;
  const cY = pY + mT;
  const cW = pW - mL - mR;
  const cH = pH - mT - mB;
  const cMidX = cX + cW / 2; // 290
  const cMidY = cY + cH / 2; // 166

  const orange = colorTokens.orange;
  const blue = colorTokens.blue;

  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 540 348" maxWidth={540}>
      <defs>
        <DropShadowDef id="ms-shadow" />
        <pattern id="ms-hatch" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={6} stroke={orange.stroke} strokeWidth={1} opacity={0.25} />
        </pattern>
        <marker id="ms-arrow" markerWidth={9} markerHeight={7} refX={9} refY={3.5} orient="auto-start-reverse">
          <polygon points="0 0, 9 3.5, 0 7" fill={orange.stroke} />
        </marker>
      </defs>

      {/* Page label */}
      <Label x={pX} y={pY - 12} size={10} color="mid">{labels.page}</Label>

      {/* Page sheet */}
      <rect x={pX} y={pY} width={pW} height={pH} fill="var(--svg-legend-fill)" stroke="var(--svg-stroke)" strokeWidth={1.5} filter="url(#ms-shadow)" />

      {/* Margin bands (hatched = blank space) */}
      <rect x={pX} y={pY} width={pW} height={mT} fill="url(#ms-hatch)" />
      <rect x={pX} y={cY + cH} width={pW} height={mB} fill="url(#ms-hatch)" />
      <rect x={pX} y={cY} width={mL} height={cH} fill="url(#ms-hatch)" />
      <rect x={cX + cW} y={cY} width={mR} height={cH} fill="url(#ms-hatch)" />

      {/* Content area */}
      <rect x={cX} y={cY} width={cW} height={cH} fill={blue.fill} stroke={blue.stroke} strokeWidth={1.5} />
      <Label x={cMidX} y={cMidY + 4} anchor="middle" size={11} bold color="blue">{labels.content}</Label>

      {/* Top margin: 1cm */}
      <line x1={cMidX} y1={pY} x2={cMidX} y2={cY} stroke={orange.stroke} strokeWidth={1.5} markerStart="url(#ms-arrow)" markerEnd="url(#ms-arrow)" />
      <Label x={cMidX - 8} y={pY + mT / 2 + 3} anchor="end" size={10} bold color="orange">{labels.top}</Label>
      <Label x={cMidX + 8} y={pY + mT / 2 + 3} size={9} color="faint">1cm</Label>

      {/* Bottom margin: 2cm */}
      <line x1={cMidX} y1={cY + cH} x2={cMidX} y2={pY + pH} stroke={orange.stroke} strokeWidth={1.5} markerStart="url(#ms-arrow)" markerEnd="url(#ms-arrow)" />
      <Label x={cMidX - 8} y={cY + cH + mB / 2 + 3} anchor="end" size={10} bold color="orange">{labels.bottom}</Label>
      <Label x={cMidX + 8} y={cY + cH + mB / 2 + 3} size={9} color="faint">2cm</Label>

      {/* Left margin: 2.5cm */}
      <line x1={pX} y1={cMidY} x2={cX} y2={cMidY} stroke={orange.stroke} strokeWidth={1.5} markerStart="url(#ms-arrow)" markerEnd="url(#ms-arrow)" />
      <Label x={pX + mL / 2} y={cMidY - 12} anchor="middle" size={10} bold color="orange">{labels.left}</Label>
      <Label x={pX + mL / 2} y={cMidY + 19} anchor="middle" size={9} color="faint">2.5cm</Label>

      {/* Right margin: 1.5cm */}
      <line x1={cX + cW} y1={cMidY} x2={pX + pW} y2={cMidY} stroke={orange.stroke} strokeWidth={1.5} markerStart="url(#ms-arrow)" markerEnd="url(#ms-arrow)" />
      <Label x={cX + cW + mR / 2} y={cMidY - 12} anchor="middle" size={10} bold color="orange">{labels.right}</Label>
      <Label x={cX + cW + mR / 2} y={cMidY + 19} anchor="middle" size={9} color="faint">1.5cm</Label>
    </Figure>
  );
}
