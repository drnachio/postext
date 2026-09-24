import { ImageResponse } from "next/og";
import { loadMarkFont } from "./og-fonts";

/** The Postext mark as a square PNG (favicon, touch icon): a blue band
 *  with the initial in Fraunces and a gilt foot. */
export async function markImage(size: number) {
  const fonts = await loadMarkFont();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#2b4acb",
          borderRadius: Math.round(size * 0.22),
        }}
      >
        <div style={{ fontFamily: "Fraunces", fontSize: Math.round(size * 0.78), fontWeight: 800, color: "#ffffff", lineHeight: 1, marginTop: -Math.round(size * 0.1) }}>
          P
        </div>
        <div style={{ position: "absolute", left: 0, bottom: 0, width: size, height: Math.max(3, Math.round(size * 0.13)), backgroundColor: "#d8a21a" }} />
      </div>
    ),
    { width: size, height: size, fonts },
  );
}
