import type { ReactNode } from "react";

export type ColorKey = "blue" | "orange" | "green" | "purple" | "yellow" | "pink" | "teal";

export const colorTokens: Record<ColorKey, { fill: string; text: string; stroke: string }> = {
  blue: { fill: "var(--svg-blue-fill)", text: "var(--svg-blue-text)", stroke: "var(--svg-blue-stroke)" },
  orange: { fill: "var(--svg-orange-fill)", text: "var(--svg-orange-text)", stroke: "var(--svg-orange-stroke)" },
  green: { fill: "var(--svg-green-fill)", text: "var(--svg-green-text)", stroke: "var(--svg-green-stroke)" },
  purple: { fill: "var(--svg-purple-fill)", text: "var(--svg-purple-text)", stroke: "var(--svg-purple-stroke)" },
  yellow: { fill: "var(--svg-yellow-fill)", text: "var(--svg-yellow-text)", stroke: "var(--svg-yellow-stroke)" },
  pink: { fill: "var(--svg-pink-fill)", text: "var(--svg-pink-text)", stroke: "var(--svg-pink-stroke)" },
  teal: { fill: "var(--svg-teal-fill)", text: "var(--svg-teal-text)", stroke: "var(--svg-teal-stroke)" },
};

interface BoxProps {
  x: number;
  y: number;
  width: number;
  height: number;
  color: ColorKey;
  rx?: number;
  filter?: string;
  strokeWidth?: number;
  className?: string;
}

export function Box({ x, y, width, height, color, rx = 6, filter, strokeWidth = 2, className }: BoxProps) {
  const t = colorTokens[color];
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={t.fill}
      stroke={t.stroke}
      strokeWidth={strokeWidth}
      rx={rx}
      filter={filter}
      className={className}
    />
  );
}

export function DropShadowDef({ id }: { id: string }) {
  return (
    <filter id={id} x="-4%" y="-4%" width="108%" height="116%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
    </filter>
  );
}

interface ArrowMarkerProps {
  id: string;
  color?: string;
}

export function ArrowMarker({ id, color = "var(--svg-stroke)" }: ArrowMarkerProps) {
  return (
    <marker id={id} markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill={color} />
    </marker>
  );
}

interface LabelProps {
  x: number;
  y: number;
  color?: ColorKey | "dark" | "mid" | "light" | "faint" | "stroke";
  size?: number;
  bold?: boolean;
  anchor?: "start" | "middle" | "end";
  className?: string;
  children: ReactNode;
}

export function Label({ x, y, color = "dark", size = 10, bold, anchor = "start", className, children }: LabelProps) {
  const fill =
    color === "dark" ? "var(--svg-dark-text)" :
    color === "mid" ? "var(--svg-mid-text)" :
    color === "light" ? "var(--svg-light-text)" :
    color === "faint" ? "var(--svg-faint-text)" :
    color === "stroke" ? "var(--svg-stroke)" :
    colorTokens[color].text;
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fontWeight={bold ? "bold" : "normal"}
      textAnchor={anchor}
      fill={fill}
      className={className}
    >
      {children}
    </text>
  );
}
