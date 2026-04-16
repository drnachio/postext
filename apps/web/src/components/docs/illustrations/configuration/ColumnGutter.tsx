import { Figure } from "../Figure";
import { Label, colorTokens } from "../primitives";

export interface ColumnGutterLabels {
  title: string;
  desc?: string;
  caption?: string;
  pageLabel: string;
  gutterLabel: string;
  columnLabel: string;
  marginLabel: string;
}

export function ColumnGutter({ labels }: { labels: ColumnGutterLabels }) {
  const pageX = 40;
  const pageY = 30;
  const pageW = 680;
  const pageH = 200;
  const margin = 60;
  const cols = 3;
  const gutter = 30;
  const colW = (pageW - margin * 2 - gutter * (cols - 1)) / cols;

  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 280" maxWidth={760}>
      <rect x={pageX} y={pageY} width={pageW} height={pageH} fill={colorTokens.blue.fill} stroke={colorTokens.blue.stroke} strokeWidth={2} rx={4} />
      <Label x={pageX + pageW / 2} y={pageY - 8} anchor="middle" size={10} color="blue">{labels.pageLabel}</Label>

      {Array.from({ length: cols }).map((_, i) => {
        const cx = pageX + margin + i * (colW + gutter);
        return (
          <g key={i}>
            <rect x={cx} y={pageY + margin / 2} width={colW} height={pageH - margin} fill={colorTokens.orange.fill} stroke={colorTokens.orange.stroke} strokeWidth={1.5} rx={3} />
            {i < cols - 1 ? (
              <rect x={cx + colW} y={pageY + margin / 2} width={gutter} height={pageH - margin} fill={colorTokens.yellow.fill} stroke={colorTokens.yellow.stroke} strokeWidth={1} rx={2} strokeDasharray="3,2" />
            ) : null}
          </g>
        );
      })}

      {/* Margin indicators */}
      <line x1={pageX} y1={pageY + pageH + 15} x2={pageX + margin} y2={pageY + pageH + 15} stroke={colorTokens.pink.stroke} strokeWidth={1.5} />
      <Label x={pageX + margin / 2} y={pageY + pageH + 28} anchor="middle" size={9} color="pink">{labels.marginLabel}</Label>

      {/* Column label */}
      <Label x={pageX + margin + colW / 2} y={pageY + margin / 2 - 6} anchor="middle" size={9} color="orange">{labels.columnLabel}</Label>

      {/* Gutter label */}
      <Label x={pageX + margin + colW + gutter / 2} y={pageY + pageH + 12} anchor="middle" size={9} color="yellow">{labels.gutterLabel}</Label>
    </Figure>
  );
}
