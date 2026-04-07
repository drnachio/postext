import { ImageResponse } from "next/og";
import { loadOgFonts } from "./og-fonts";

const GILT = "#E0A816";
const BG = "#09090B";
const FG = "#EDEDED";
const SLATE = "#9E9EA8";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

export async function generateOgImage({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const fonts = await loadOgFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          backgroundColor: BG,
          padding: "80px 100px",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span
            style={{
              fontFamily: "Cormorant Garamond",
              fontSize: 96,
              fontWeight: 700,
              color: GILT,
              lineHeight: 1,
            }}
          >
            P
          </span>
          <span
            style={{
              fontFamily: "Fraunces",
              fontSize: 56,
              fontWeight: 600,
              color: FG,
              lineHeight: 1,
              marginLeft: -8,
            }}
          >
            ostext
          </span>
        </div>

        {/* Divider */}
        <div
          style={{
            width: 80,
            height: 2,
            backgroundColor: GILT,
            marginTop: 40,
            marginBottom: 40,
          }}
        />

        {/* Title */}
        <div
          style={{
            fontFamily: "Fraunces",
            fontSize: 44,
            fontWeight: 600,
            color: FG,
            lineHeight: 1.25,
            maxWidth: 900,
          }}
        >
          {title}
        </div>

        {/* Description */}
        {description && (
          <div
            style={{
              fontFamily: "Fraunces",
              fontSize: 22,
              fontWeight: 600,
              color: SLATE,
              lineHeight: 1.5,
              marginTop: 20,
              maxWidth: 800,
            }}
          >
            {description}
          </div>
        )}
      </div>
    ),
    {
      ...ogSize,
      fonts,
    }
  );
}
