import { ImageResponse } from "next/og";
import { HeroArt, HERO_ART_NIGHT } from "@/components/landing/HeroArt";
import { cjkFamily, loadCjkOgFonts, loadOgFonts } from "./og-fonts";
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

/** The locale a card's texts are taken from. Satori neither shapes Arabic
 *  (its letters would print unjoined) nor orders right-to-left text, and
 *  the Arabic fallback face next/og fetches has contextual lookups its
 *  font parser rejects: an Arabic page's card is drawn with the English
 *  texts. */
export function ogTextLocale(locale: string): string {
  return /^ar(?:-|$)/.test(locale) ? "en" : locale;
}

/** Arabic-script characters other than the Arabic-Indic digits (which
 *  render, unjoined as they are anyway): the Arabic words an English text
 *  quotes (الليلة الأولى) make next/og fetch the face that breaks the
 *  build (see {@link ogTextLocale}). */
const ARABIC_SCRIPT = /\p{Script=Arabic}/u;
const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/g;

/** Whether a card can draw `text`: it holds no Arabic letters. */
export function ogDrawable(text: string | undefined): boolean {
  return !!text && !ARABIC_SCRIPT.test(text.replace(ARABIC_INDIC_DIGITS, ""));
}

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

/** The spread with its crop marks, cropped out of HeroArt's 1080×840. */
const ART_VIEWBOX = { x: 44, y: 58, w: 992, h: 684 };
const ART_WIDTH = 560;
const ART_HEIGHT = Math.round((ART_WIDTH * ART_VIEWBOX.h) / ART_VIEWBOX.w);

/** The hero's glows, blue from the top right and gilt from the bottom
 *  left: an SVG, since Satori's radial gradients end in hard edges. With
 *  `blue: false` only the gilt one, so a flat night picture on the right
 *  meets a flat night ground. */
function glows(blue: boolean) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs>` +
      `<radialGradient id="b"><stop offset="0" stop-color="${BLUE}" stop-opacity="0.34"/><stop offset="1" stop-color="${BLUE}" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="g"><stop offset="0" stop-color="${GILT}" stop-opacity="0.13"/><stop offset="1" stop-color="${GILT}" stop-opacity="0"/></radialGradient>` +
      `</defs>${blue ? `<circle cx="1080" cy="40" r="520" fill="url(#b)"/>` : ""}<circle cx="60" cy="660" r="440" fill="url(#g)"/></svg>`,
  )}`;
}
const GLOWS = glows(true);
const GILT_GLOW = glows(false);

let artSrc: string | undefined;
function heroArtSrc() {
  if (!artSrc) {
    const { x, y, w, h } = ART_VIEWBOX;
    const svg = svgMarkup(HeroArt({ label: "" }), HERO_ART_NIGHT).replace(/viewBox="[^"]*"/, `viewBox="${x} ${y} ${w} ${h}"`);
    artSrc = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
  return artSrc;
}

/** Chinese and Japanese letters: Han, 〆, kana and ー. */
const CJK_LETTER = "\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\u3006\u30FC";
/** Marks that may not start a line, so they ride on the letter before them:
 *  closing punctuation (页面，, （书眉）) and, for Japanese, the small kana,
 *  ー, the iteration marks and the middle dot (JLReq cl-11, cl-10, cl-09,
 *  cl-05: ショート breaks as ショー|ト, never before ョ or ー). */
const NO_LINE_START = "，。、：；！？）］〕】」』》”’),.:;!?\\]ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶㇰ-ㇿーゝゞヽヾ々〻・";
/** Opening brackets, which may not end a line. */
const NO_LINE_END = "（［〔【「『《“‘(\\[";
/** A Chinese or Japanese letter with the opening punctuation before it and
 *  the marks that may not start a line after it, or a run of anything else. */
const CJK_PIECE = new RegExp(`[${NO_LINE_END}]*[${CJK_LETTER}][${NO_LINE_START}]*|[^${CJK_LETTER}]+`, "gu");
const CJK = new RegExp(`[${CJK_LETTER}]`, "u");
const STARTS_BANNED = new RegExp(`^[${NO_LINE_START}]`, "u");

/** Words of a title, with those inside `<em>…</em>` flagged. Chinese and
 *  Japanese have no spaces to wrap at, so each character is a piece of its
 *  own; a piece is followed by a word space (`gap`) only where the title
 *  has one, so an `<em>` inside a Chinese phrase (与<em>下沉</em>章首)
 *  stays tight. */
function titlePieces(title: string) {
  const parts = title.split(/(<em>.*?<\/em>)/).map((part) => {
    const em = part.startsWith("<em>");
    return { em, text: em ? part.slice(4, -5) : part };
  });
  return parts.flatMap(({ em, text }, p) => {
    const words = text.split(/\s+/).filter(Boolean);
    const spaceAfter = /\s$/.test(text) || /^\s/.test(parts[p + 1]?.text ?? " ");
    return words.flatMap((word, w) => {
      const pieces = word.match(CJK_PIECE) ?? [word];
      const last = w === words.length - 1;
      return pieces.map((piece, i) => ({
        word: piece,
        em,
        cjk: CJK.test(piece),
        gap: i === pieces.length - 1 && (!last || spaceAfter),
      }));
    });
  });
}

export type TitlePiece = ReturnType<typeof titlePieces>[number];

/** The pieces of a title in clusters that never break apart: a piece that
 *  may not start a line and has no space before it joins the cluster before
 *  it, which happens where an `<em>` ends just before the mark
 *  (<em>熟語ルビ</em>、…), so 、 cannot open the second line. */
export function titleClusters(title: string): TitlePiece[][] {
  const clusters: TitlePiece[][] = [];
  for (const piece of titlePieces(title)) {
    const cluster = clusters[clusters.length - 1];
    if (cluster && !cluster[cluster.length - 1]!.gap && STARTS_BANNED.test(piece.word)) cluster.push(piece);
    else clusters.push([piece]);
  }
  return clusters;
}

export async function generateOgImage({
  title,
  description,
  kicker = "Programmable typesetter · postext.dev",
  accent = GILT,
  art,
}: {
  /** May carry one `<em>…</em>` span, set in gilt italic like the hero's. */
  title: string;
  description?: string;
  kicker?: string;
  /** Kicker colour: gilt, or a docs part's colour. */
  accent?: string;
  /** A picture for the right-hand side in place of the hero's spread (a
   *  Cookbook recipe's `og.jpg` as a data URL, 580 × 622), placed at the
   *  top of the card from x = 620. */
  art?: { src: string; width: number; height: number };
}) {
  // Last guard for the build: a text with Arabic letters is left out (a
  // title loses those words), as Satori cannot draw them.
  if (!ogDrawable(title)) title = title.replace(/[\p{Script=Arabic}]+/gu, "").replace(/\s{2,}/g, " ").trim();
  if (!ogDrawable(description)) description = undefined;
  if (!ogDrawable(kicker)) kicker = "Programmable typesetter · postext.dev";
  const plainTitle = title.replace(/<\/?em>/g, "");
  const [latin, cjk] = await Promise.all([
    loadOgFonts(),
    loadCjkOgFonts({ display: plainTitle, lead: description, kicker }),
  ]);
  const fonts = [...latin, ...cjk];
  const clusters = titleClusters(title);
  // In Latin letters: a Chinese or Japanese character is about as wide as two.
  const length = clusters.flat().reduce((n, w) => n + (w.cjk ? 2 * [...w.word].length : w.word.length + 1), 0);
  const size = length <= 26 ? 66 : length <= 44 ? 58 : 48;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", backgroundColor: NIGHT }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={art ? GILT_GLOW : GLOWS} width={1200} height={630} style={{ position: "absolute", left: 0, top: 0 }} />
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img src={art.src} width={art.width} height={art.height} style={{ position: "absolute", left: 620, top: 0 }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img src={heroArtSrc()} width={ART_WIDTH} height={ART_HEIGHT} style={{ position: "absolute", left: 620, top: Math.round((630 - 8 - ART_HEIGHT) / 2) }} />
        )}

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
            <div style={{ fontFamily: `Geist, ${cjkFamily(kicker, "sans")}`, fontSize: 16, fontWeight: 600, color: accent, letterSpacing: 3, textTransform: "uppercase" }}>
              {kicker}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", marginTop: 16, maxWidth: 540 + size * 0.24, lineHeight: 1.02 }}>
              {clusters.map((cluster, c) => (
                <div key={c} style={{ display: "flex" }}>
                  {cluster.map(({ word, em, cjk, gap }, i) => (
                    <div
                      key={i}
                      style={{
                        fontFamily: `Fraunces, ${cjkFamily(plainTitle, "serif")}`,
                        fontSize: size,
                        fontWeight: em ? 600 : 800,
                        fontStyle: em ? "italic" : "normal",
                        color: em ? GILT : "#ffffff",
                        letterSpacing: em || cjk ? 0 : -size * 0.02,
                        marginRight: gap ? size * 0.24 : 0,
                      }}
                    >
                      {word}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ width: 56, height: 4, backgroundColor: GILT, marginTop: 26 }} />
            {description && (
              <div style={{ fontFamily: `Lora, ${cjkFamily(description, "serif")}`, fontStyle: "italic", fontSize: 23, color: MIST, lineHeight: 1.42, marginTop: 20, maxWidth: 520 }}>
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
