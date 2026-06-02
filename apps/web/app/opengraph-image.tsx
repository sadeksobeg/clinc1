import { ImageResponse } from "next/og";
import { brand } from "@/lib/brand";
import { brandMarkPaths } from "@/lib/brand-mark";

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
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #0D9488 0%, #0891B2 48%, #2563EB 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1, maxWidth: 720 }}>
          <div style={{ fontSize: 72, fontWeight: 700 }}>{brand.nameAr}</div>
          <div style={{ fontSize: 36, marginTop: 12, opacity: 0.9 }}>{brand.nameEn}</div>
          <div style={{ fontSize: 28, marginTop: 28, lineHeight: 1.45, opacity: 0.95 }}>{brand.taglineAr}</div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 220,
            height: 220,
            borderRadius: 52,
            background: "rgba(255,255,255,0.12)",
            border: "2px solid rgba(255,255,255,0.25)",
          }}
        >
          <svg width="140" height="140" viewBox="0 0 48 48" fill="none">
            <path d={brandMarkPaths.arc1} stroke="white" strokeWidth="2.6" strokeLinecap="round" opacity="0.55" />
            <path d={brandMarkPaths.arc2} stroke="white" strokeWidth="2.6" strokeLinecap="round" opacity="0.85" />
            <path d={brandMarkPaths.arc3} stroke="white" strokeWidth="2.6" strokeLinecap="round" />
            <circle cx="38" cy="14" r="4.5" fill="white" />
            <circle cx="38" cy="14" r="2.2" fill="#0891B2" />
          </svg>
        </div>
      </div>
    ),
    { ...size },
  );
}
