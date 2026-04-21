import { Figure } from "../Figure";
import { Label, colorTokens } from "../primitives";

export interface InlineFormattingLabels {
  title: string;
  desc?: string;
  caption?: string;
  rows: { markdown: string; rendered: string; style: "bold" | "italic" | "bold-italic" | "code" | "link" }[];
}

export function InlineFormatting({ labels }: { labels: InlineFormattingLabels }) {
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 280" maxWidth={760}>
      <line x1={380} y1={30} x2={380} y2={260} stroke="var(--svg-grid)" strokeDasharray="3,3" />
      <Label x={200} y={22} anchor="middle" size={10} bold color="mid">Markdown</Label>
      <Label x={560} y={22} anchor="middle" size={10} bold color="mid">Rendered</Label>

      {labels.rows.map((r, i) => {
        const y = 55 + i * 40;
        let rendered: React.ReactNode;
        if (r.style === "bold") rendered = <tspan fontWeight="bold">{r.rendered}</tspan>;
        else if (r.style === "italic") rendered = <tspan fontStyle="italic">{r.rendered}</tspan>;
        else if (r.style === "bold-italic") rendered = <tspan fontWeight="bold" fontStyle="italic">{r.rendered}</tspan>;
        else if (r.style === "code") rendered = <tspan fontFamily="monospace" fill={colorTokens.orange.text}>{r.rendered}</tspan>;
        else rendered = <tspan fill={colorTokens.blue.text} textDecoration="underline">{r.rendered}</tspan>;
        return (
          <g key={i}>
            <text x={60} y={y} fontFamily="monospace" fontSize="12" fill={colorTokens.purple.text}>{r.markdown}</text>
            <text x={400} y={y} fontSize="13" fill="var(--svg-dark-text)">{rendered}</text>
          </g>
        );
      })}
    </Figure>
  );
}
