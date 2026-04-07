import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const CORMORANT_GARAMOND_700_URL =
  "https://fonts.gstatic.com/s/cormorantgaramond/v21/co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_hg9GnM.ttf";

export default async function Icon() {
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
          borderRadius: 6,
        }}
      >
        <span
          style={{
            fontFamily: "Cormorant Garamond",
            fontSize: 28,
            fontWeight: 700,
            color: "#E0A816",
            lineHeight: 1,
            marginTop: -2,
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
