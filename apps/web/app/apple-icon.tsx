import { ImageResponse } from "next/og";
import { brand } from "@/lib/brand";
import { brandMarkPaths } from "@/lib/brand-mark";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0D9488 0%, #0891B2 48%, #2563EB 100%)",
          borderRadius: 40,
          color: "white",
        }}
      >
        <svg width="100" height="100" viewBox="0 0 48 48" fill="none">
          <path d={brandMarkPaths.arc1} stroke="white" strokeWidth="2.8" strokeLinecap="round" opacity="0.55" />
          <path d={brandMarkPaths.arc2} stroke="white" strokeWidth="2.8" strokeLinecap="round" opacity="0.85" />
          <path d={brandMarkPaths.arc3} stroke="white" strokeWidth="2.8" strokeLinecap="round" />
          <circle cx="38" cy="14" r="4.5" fill="white" />
          <circle cx="38" cy="14" r="2.2" fill="#0891B2" />
        </svg>
        <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700 }}>{brand.nameAr}</div>
      </div>
    ),
    { ...size },
  );
}
