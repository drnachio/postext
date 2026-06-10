import { Figure } from "../Figure";
import { Box, DropShadowDef, Label } from "../primitives";

export interface VdtStructureLabels {
  title: string;
  desc?: string;
  caption?: string;
  document: string;
  pageLabels: [string, string, string];
  columnLabels: [string, string];
  blockLabels: [string, string, string];
  lineLabels: [string, string];
  legendHeader: string;
  legendAttrs: string[];
  linesHeader: string;
  linesAttrs: string[];
}

/*
 * Layout grid (viewBox 608 x 364)
 *
 * Level 0  Document   y 16..52   center x 364
 * Level 1  Pages      y 88..122  centers 228 / 364 / 500
 * Level 2  Columns    y 158..192 centers 160 / 296   (children of page 0)
 * Level 3  Blocks     y 228..258 centers  66 / 160 / 254 (children of column 0)
 * Level 4  Lines      y 294..322 centers 123 / 197   (children of the paragraph)
 * Legend cards        x 372..584, y 170..266 and y 280..344
 */

const STROKE = "var(--svg-stroke)";

export function VdtStructure({ labels }: { labels: VdtStructureLabels }) {
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 608 364" maxWidth={640}>
      <defs>
        <DropShadowDef id="vdtstr-shadow" />
      </defs>

      {/* ── Elbow connectors (drawn first, under the boxes) ── */}
      {/* document → pages */}
      <path
        d="M364 52 V70 M228 70 H500 M228 70 V88 M364 70 V88 M500 70 V88"
        fill="none"
        stroke={STROKE}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* page[0] → columns */}
      <path
        d="M228 122 V140 M160 140 H296 M160 140 V158 M296 140 V158"
        fill="none"
        stroke={STROKE}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* column[0] → blocks */}
      <path
        d="M160 192 V210 M66 210 H254 M66 210 V228 M160 210 V228 M254 210 V228"
        fill="none"
        stroke={STROKE}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* paragraph block → lines */}
      <path
        d="M160 258 V276 M123 276 H197 M123 276 V294 M197 276 V294"
        fill="none"
        stroke={STROKE}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      {/* collapsed-subtree hints under page[1] and page[n] */}
      <path d="M364 122 V131 M500 122 V131" fill="none" stroke={STROKE} strokeWidth={1.5} strokeLinecap="round" opacity={0.55} />
      {[364, 500].map((cx) =>
        [139, 146, 153].map((cy) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.6} fill="var(--svg-faint-text)" />
        )),
      )}

      {/* ── Level 0: document root (focal point, only elevated node) ── */}
      <Box x={289} y={16} width={150} height={36} color="green" strokeWidth={1.5} filter="url(#vdtstr-shadow)" />
      <Label x={364} y={38} anchor="middle" size={12} bold color="green">{labels.document}</Label>

      {/* ── Level 1: pages ── */}
      <Box x={168} y={88} width={120} height={34} color="blue" strokeWidth={1.5} />
      <Label x={228} y={109} anchor="middle" size={11} bold color="blue">{labels.pageLabels[0]}</Label>
      <Box x={304} y={88} width={120} height={34} color="blue" strokeWidth={1.5} />
      <Label x={364} y={109} anchor="middle" size={11} bold color="blue">{labels.pageLabels[1]}</Label>
      <rect
        x={440}
        y={88}
        width={120}
        height={34}
        rx={6}
        fill="var(--svg-blue-fill)"
        stroke="var(--svg-blue-stroke)"
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />
      <Label x={500} y={109} anchor="middle" size={11} color="blue">{labels.pageLabels[2]}</Label>

      {/* ── Level 2: columns of page[0] ── */}
      <Box x={98} y={158} width={124} height={34} color="purple" strokeWidth={1.5} />
      <Label x={160} y={179} anchor="middle" size={11} bold color="purple">{labels.columnLabels[0]}</Label>
      <Box x={234} y={158} width={124} height={34} color="purple" strokeWidth={1.5} />
      <Label x={296} y={179} anchor="middle" size={11} bold color="purple">{labels.columnLabels[1]}</Label>

      {/* ── Level 3: blocks of column[0] ── */}
      <Box x={24} y={228} width={84} height={30} color="orange" strokeWidth={1.5} />
      <Label x={66} y={247} anchor="middle" size={10} color="orange">{labels.blockLabels[0]}</Label>
      <Box x={118} y={228} width={84} height={30} color="orange" strokeWidth={1.5} />
      <Label x={160} y={247} anchor="middle" size={10} color="orange">{labels.blockLabels[1]}</Label>
      <Box x={212} y={228} width={84} height={30} color="orange" strokeWidth={1.5} />
      <Label x={254} y={247} anchor="middle" size={10} color="orange">{labels.blockLabels[2]}</Label>

      {/* ── Level 4: measured lines of the paragraph ── */}
      <Box x={91} y={294} width={64} height={28} color="teal" strokeWidth={1.5} />
      <Label x={123} y={312} anchor="middle" size={10} color="teal">{labels.lineLabels[0]}</Label>
      <Box x={165} y={294} width={64} height={28} color="teal" strokeWidth={1.5} />
      <Label x={197} y={312} anchor="middle" size={10} color="teal">{labels.lineLabels[1]}</Label>

      {/* ── Legend card: attributes carried by every node ── */}
      <rect x={372} y={170} width={212} height={96} rx={6} fill="var(--svg-legend-fill)" stroke="var(--svg-legend-stroke)" strokeWidth={1} />
      <Label x={384} y={189} size={11} bold color="dark">{labels.legendHeader}</Label>
      {labels.legendAttrs.map((a, i) => (
        <Label key={i} x={384} y={207 + i * 16} size={10} color="mid">{a}</Label>
      ))}

      {/* ── Legend card: extra attributes on lines (teal = lines level) ── */}
      <rect x={372} y={280} width={212} height={64} rx={6} fill="var(--svg-legend-fill)" stroke="var(--svg-legend-stroke)" strokeWidth={1} />
      <Label x={384} y={299} size={11} bold color="teal">{labels.linesHeader}</Label>
      {labels.linesAttrs.map((a, i) => (
        <Label key={i} x={384} y={317 + i * 16} size={10} color="mid">{a}</Label>
      ))}
    </Figure>
  );
}
