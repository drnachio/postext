import { Figure } from "../Figure";
import { Label, colorTokens } from "../primitives";

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

export function MarginSystem({ labels }: { labels: MarginSystemLabels }) {
  const pageX = 180;
  const pageY = 30;
  const pageW = 400;
  const pageH = 260;
  const mT = 40;
  const mR = 50;
  const mB = 55;
  const mL = 60;
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 320" maxWidth={760}>
      <rect x={pageX} y={pageY} width={pageW} height={pageH} fill={colorTokens.blue.fill} stroke={colorTokens.blue.stroke} strokeWidth={2} rx={4} />
      <Label x={pageX + pageW / 2} y={pageY - 8} anchor="middle" size={10} color="blue">{labels.page}</Label>

      <rect x={pageX + mL} y={pageY + mT} width={pageW - mL - mR} height={pageH - mT - mB} fill={colorTokens.orange.fill} stroke={colorTokens.orange.stroke} strokeWidth={1.5} rx={3} strokeDasharray="4,3" />
      <Label x={pageX + pageW / 2} y={pageY + pageH / 2 + 4} anchor="middle" size={11} bold color="orange">{labels.content}</Label>

      {/* Top arrow */}
      <line x1={pageX + pageW / 2} y1={pageY} x2={pageX + pageW / 2} y2={pageY + mT} stroke={colorTokens.pink.stroke} strokeWidth={1.5} />
      <Label x={pageX + pageW / 2 + 10} y={pageY + mT / 2 + 3} size={9} color="pink">{labels.top}</Label>
      {/* Right */}
      <line x1={pageX + pageW - mR} y1={pageY + pageH / 2} x2={pageX + pageW} y2={pageY + pageH / 2} stroke={colorTokens.pink.stroke} strokeWidth={1.5} />
      <Label x={pageX + pageW - mR / 2} y={pageY + pageH / 2 - 6} anchor="middle" size={9} color="pink">{labels.right}</Label>
      {/* Bottom */}
      <line x1={pageX + pageW / 2} y1={pageY + pageH - mB} x2={pageX + pageW / 2} y2={pageY + pageH} stroke={colorTokens.pink.stroke} strokeWidth={1.5} />
      <Label x={pageX + pageW / 2 + 10} y={pageY + pageH - mB / 2 + 3} size={9} color="pink">{labels.bottom}</Label>
      {/* Left */}
      <line x1={pageX} y1={pageY + pageH / 2} x2={pageX + mL} y2={pageY + pageH / 2} stroke={colorTokens.pink.stroke} strokeWidth={1.5} />
      <Label x={pageX + mL / 2} y={pageY + pageH / 2 - 6} anchor="middle" size={9} color="pink">{labels.left}</Label>
    </Figure>
  );
}
