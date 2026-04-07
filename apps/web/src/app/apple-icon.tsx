import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const CORMORANT_GARAMOND_700_URL =
  "https://fonts.gstatic.com/s/cormorantgaramond/v21/co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_hg9GnM.ttf";

export default async function AppleIcon() {
  const fontData = await fetch(CORMORANT_GARAMOND_700_URL).then((res) =>
    res.arrayBuffer()
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#09090B",
          borderRadius: 36,
        }}
      >
        <span
          style={{
            fontFamily: "Cormorant Garamond",
            fontSize: 140,
            fontWeight: 700,
            color: "#E0A816",
            lineHeight: 1,
            marginTop: -8,
          }}
        >
          P
        </span>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Cormorant Garamond", data: fontData, weight: 700 as const },
      ],
    }
  );
}
