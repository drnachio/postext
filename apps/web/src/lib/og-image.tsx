import { ImageResponse } from "next/og";
import { HeroArt, HERO_ART_NIGHT } from "@/components/landing/HeroArt";
import { loadOgFonts } from "./og-fonts";
import { svgMarkup } from "./og-svg";

// The landing's hero in the dark theme, as a social card: night ground
// with the blue and gilt glows, the mark, a kicker, the title in Fraunces
// (an `<em>` word in gilt italic), a gilt rule, the lead in Lora italic,
// the hero's spread with its crop marks and model line, and the part
// colours along the foot.
const NIGHT = "#0e1014";
const BLUE = "#2b4acb";
const GILT = "#d8a21a";
const VERMILION = "#c0452f";
const MIST = "#b9bcc4";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

/** The spread with its crop marks, cropped out of HeroArt's 1080×840. */
const ART_VIEWBOX = { x: 44, y: 58, w: 992, h: 684 };
const ART_WIDTH = 560;
const ART_HEIGHT = Math.round((ART_WIDTH * ART_VIEWBOX.h) / ART_VIEWBOX.w);

/** The hero's glows, blue from the top right and gilt from the bottom
 *  left: an SVG, since Satori's radial gradients end in hard edges. */
const GLOWS = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs>` +
    `<radialGradient id="b"><stop offset="0" stop-color="${BLUE}" stop-opacity="0.34"/><stop offset="1" stop-color="${BLUE}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="g"><stop offset="0" stop-color="${GILT}" stop-opacity="0.13"/><stop offset="1" stop-color="${GILT}" stop-opacity="0"/></radialGradient>` +
    `</defs><circle cx="1080" cy="40" r="520" fill="url(#b)"/><circle cx="60" cy="660" r="440" fill="url(#g)"/></svg>`,
)}`;

let artSrc: string | undefined;
function heroArtSrc() {
  if (!artSrc) {
    const { x, y, w, h } = ART_VIEWBOX;
    const svg = svgMarkup(HeroArt({ label: "" }), HERO_ART_NIGHT).replace(/viewBox="[^"]*"/, `viewBox="${x} ${y} ${w} ${h}"`);
    artSrc = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
  return artSrc;
}

/** Words of a title, with those inside `<em>…</em>` flagged. */
function titleWords(title: string) {
  return title
    .split(/(<em>.*?<\/em>)/)
    .flatMap((part) => {
      const em = part.startsWith("<em>");
      const text = em ? part.slice(4, -5) : part;
      return text.split(/\s+/).filter(Boolean).map((word) => ({ word, em }));
    });
}

export async function generateOgImage({
  title,
  description,
  kicker = "Programmable typesetter · postext.dev",
  accent = GILT,
}: {
  /** May carry one `<em>…</em>` span, set in gilt italic like the hero's. */
  title: string;
  description?: string;
  kicker?: string;
  /** Kicker colour: gilt, or a docs part's colour. */
  accent?: string;
}) {
  const fonts = await loadOgFonts();
  const words = titleWords(title);
  const length = words.reduce((n, w) => n + w.word.length + 1, 0);
  const size = length <= 26 ? 66 : length <= 44 ? 58 : 48;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", backgroundColor: NIGHT }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={GLOWS} width={1200} height={630} style={{ position: "absolute", left: 0, top: 0 }} />
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={heroArtSrc()} width={ART_WIDTH} height={ART_HEIGHT} style={{ position: "absolute", left: 620, top: Math.round((630 - 8 - ART_HEIGHT) / 2) }} />

        <div style={{ display: "flex", flexDirection: "column", padding: "56px 0 64px 72px", width: 600, height: "100%" }}>
          {/* The mark and the wordmark, as in the navbar */}
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 50, height: 50, borderRadius: 11, backgroundColor: BLUE, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
              <div style={{ fontFamily: "Fraunces", fontSize: 38, fontWeight: 800, color: "#ffffff", marginTop: -5 }}>P</div>
              <div style={{ position: "absolute", left: 0, bottom: 0, width: 50, height: 7, backgroundColor: GILT }} />
            </div>
            <div style={{ fontFamily: "Fraunces", fontSize: 36, fontWeight: 800, color: "#ffffff", marginLeft: 16, letterSpacing: -0.8 }}>Postext</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
            <div style={{ fontFamily: "Geist", fontSize: 16, fontWeight: 600, color: accent, letterSpacing: 3, textTransform: "uppercase" }}>
              {kicker}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", columnGap: size * 0.24, marginTop: 16, maxWidth: 540, lineHeight: 1.02 }}>
              {words.map(({ word, em }, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily: "Fraunces",
                    fontSize: size,
                    fontWeight: em ? 600 : 800,
                    fontStyle: em ? "italic" : "normal",
                    color: em ? GILT : "#ffffff",
                    letterSpacing: em ? 0 : -size * 0.02,
                  }}
                >
                  {word}
                </div>
              ))}
            </div>
            <div style={{ width: 56, height: 4, backgroundColor: GILT, marginTop: 26 }} />
            {description && (
              <div style={{ fontFamily: "Lora", fontStyle: "italic", fontSize: 23, color: MIST, lineHeight: 1.42, marginTop: 20, maxWidth: 520 }}>
                {description}
              </div>
            )}
          </div>
        </div>

        {/* The part colours along the foot, as under the hero */}
        <div style={{ position: "absolute", left: 0, bottom: 0, width: 1200, height: 8, display: "flex" }}>
          <div style={{ flex: 1, backgroundColor: BLUE }} />
          <div style={{ flex: 1, backgroundColor: GILT }} />
          <div style={{ flex: 1, backgroundColor: VERMILION }} />
        </div>
      </div>
    ),
    { ...ogSize, fonts },
  );
}
