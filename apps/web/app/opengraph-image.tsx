import { ImageResponse } from "next/og";
import { brand } from "@/lib/brand";

export const runtime = "edge";
export const alt = brand.nameAr;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #0D9488 0%, #0891B2 48%, #2563EB 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 72, fontWeight: 700 }}>{brand.nameAr}</div>
        <div style={{ fontSize: 36, marginTop: 16, opacity: 0.9 }}>{brand.nameEn}</div>
        <div style={{ fontSize: 28, marginTop: 32, maxWidth: 800, lineHeight: 1.4, opacity: 0.95 }}>
          {brand.taglineAr}
        </div>
      </div>
    ),
    { ...size },
  );
}
