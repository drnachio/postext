import { Figure } from "../Figure";
import { Box, DropShadowDef, Label, colorTokens } from "../primitives";

export interface HyphenationExampleLabels {
  title: string;
  desc?: string;
  caption?: string;
  withoutTitle: string;
  withTitle: string;
  withoutCaption: string;
  withCaption: string;
}

function line(x: number, y: number, w: number, color: string, key?: number) {
  return <rect key={key} x={x} y={y} width={w} height={5} rx={1} fill={color} opacity={0.45} />;
}

export function HyphenationExample({ labels }: { labels: HyphenationExampleLabels }) {
  // without: very uneven ragged
  const withoutWidths = [240, 310, 140, 290, 200];
  // with: consistent width, hyphen on line 3
  const withWidths = [300, 298, 300, 296, 200];

  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 240" maxWidth={760}>
      <defs>
        <DropShadowDef id="hyShadow" />
      </defs>

      <Box x={20} y={30} width={340} height={180} color="pink" filter="url(#hyShadow)" />
      <Label x={190} y={55} anchor="middle" size={12} bold color="pink">{labels.withoutTitle}</Label>
      {withoutWidths.map((w, i) => line(40, 80 + i * 20, w, colorTokens.pink.text, i))}
      <Label x={40} y={195} size={9} color="mid">{labels.withoutCaption}</Label>

      <Box x={400} y={30} width={340} height={180} color="green" filter="url(#hyShadow)" />
      <Label x={570} y={55} anchor="middle" size={12} bold color="green">{labels.withTitle}</Label>
      {withWidths.map((w, i) => (
        <g key={i}>
          {line(420, 80 + i * 20, w, colorTokens.green.text)}
          {i === 2 ? (
            <text x={420 + w + 4} y={86 + i * 20} fontSize="10" fill={colorTokens.green.text} fontWeight="bold">-</text>
          ) : null}
        </g>
      ))}
      <Label x={420} y={195} size={9} color="mid">{labels.withCaption}</Label>
    </Figure>
  );
}
