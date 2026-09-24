import { ImageResponse } from "next/og";
import { loadOgFonts } from "./og-fonts";

// The guide's cover, as a social card: night ground, the part colours
// along the head, the mark, a gilt kicker, the title in Fraunces, a gilt
// rule, the lead in Lora italic, and a page with a Postext-blue opener
// band bleeding off the right edge.
const NIGHT = "#0e1014";
const PAGE = "#161920";
const EDGE = "#2a2f39";
const WORD = "#363d4a";
const BLUE = "#2b4acb";
const GILT = "#d8a21a";
const VERMILION = "#c0452f";
const CREAM = "#f4f1ea";
const MIST = "#b9bcc4";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

/** Word-box lines of a justified column (deterministic widths). */
function lines(count: number, width: number, seed: number) {
  const out: number[][] = [];
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < count; i++) {
    const row: number[] = [];
    let used = 0;
    const target = i % 6 === 5 ? width * 0.55 : width;
    while (used < target - 20) {
      const w = Math.min(10 + Math.floor(rnd() * 34), target - used);
      row.push(w);
      used += w + 6;
    }
    out.push(row);
  }
  return out;
}

function Column({ x, y, width, count, seed }: { x: number; y: number; width: number; count: number; seed: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, display: "flex", flexDirection: "column", gap: 9 }}>
      {lines(count, width, seed).map((row, i) => (
        <div key={i} style={{ display: "flex", gap: 6, width, justifyContent: "space-between" }}>
          {row.map((w, j) => (
            <div key={j} style={{ width: w, height: 6, borderRadius: 2, backgroundColor: WORD }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export async function generateOgImage({
  title,
  description,
  kicker = "Programmable typesetter · postext.dev",
}: {
  title: string;
  description?: string;
  kicker?: string;
}) {
  const fonts = await loadOgFonts();

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", backgroundColor: NIGHT }}>
        {/* The part colours along the head */}
        <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 10, display: "flex" }}>
          <div style={{ flex: 1, backgroundColor: BLUE }} />
          <div style={{ flex: 1, backgroundColor: GILT }} />
          <div style={{ flex: 1, backgroundColor: VERMILION }} />
        </div>

        {/* A page bleeding off the right edge: opener band + columns */}
        <div style={{ position: "absolute", left: 840, top: 90, width: 440, height: 600, display: "flex", backgroundColor: PAGE, border: `2px solid ${EDGE}` }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: 440, height: 170, backgroundColor: BLUE, display: "flex" }}>
            <div style={{ position: "absolute", left: 36, top: 42, width: 50, height: 5, backgroundColor: CREAM }} />
            <div style={{ position: "absolute", left: 36, top: 62, width: 190, height: 18, borderRadius: 3, backgroundColor: CREAM }} />
            <div style={{ position: "absolute", left: 36, top: 88, width: 130, height: 18, borderRadius: 3, backgroundColor: CREAM }} />
            <div style={{ position: "absolute", left: 250, top: 6, fontFamily: "Fraunces", fontSize: 150, fontWeight: 800, color: CREAM, lineHeight: 1 }}>1</div>
          </div>
          <div style={{ position: "absolute", left: 0, top: 170, width: 440, height: 6, backgroundColor: NIGHT }} />
          <Column x={36} y={206} width={150} count={24} seed={7} />
          <Column x={206} y={206} width={150} count={24} seed={31} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", padding: "64px 80px 60px", width: 820, height: "100%" }}>
          {/* The mark and the wordmark */}
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 58, height: 58, borderRadius: 13, backgroundColor: BLUE, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
              <div style={{ fontFamily: "Fraunces", fontSize: 44, fontWeight: 800, color: "#ffffff", marginTop: -6 }}>P</div>
              <div style={{ position: "absolute", left: 0, bottom: 0, width: 58, height: 8, backgroundColor: GILT }} />
            </div>
            <div style={{ fontFamily: "Fraunces", fontSize: 44, fontWeight: 800, color: "#ffffff", marginLeft: 18, letterSpacing: -1.2 }}>Postext</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
            <div style={{ fontFamily: "Geist", fontSize: 19, fontWeight: 600, color: GILT, letterSpacing: 4, textTransform: "uppercase" }}>
              {kicker}
            </div>
            <div style={{ fontFamily: "Fraunces", fontSize: title.length > 40 ? 58 : 70, fontWeight: 800, color: "#ffffff", lineHeight: 1.04, letterSpacing: -0.6, marginTop: 18, maxWidth: 720 }}>
              {title}
            </div>
            <div style={{ width: 80, height: 5, backgroundColor: GILT, marginTop: 28 }} />
            {description && (
              <div style={{ fontFamily: "Lora", fontStyle: "italic", fontSize: 25, color: MIST, lineHeight: 1.4, marginTop: 24, maxWidth: 700 }}>
                {description}
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    { ...ogSize, fonts },
  );
}
