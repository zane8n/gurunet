import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site";

export const alt = "GURUnet daily technical challenge platform";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          color: "#0f172a",
          background:
            "linear-gradient(135deg, #f8fafc 0%, #eef2f7 52%, #ecfeff 100%)",
          fontFamily: "Arial",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.28,
            backgroundImage:
              "linear-gradient(rgba(15,23,42,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,.12) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -80,
            top: -80,
            width: 480,
            height: 480,
            borderRadius: 999,
            background: "rgba(59,130,246,.16)",
            filter: "blur(8px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -90,
            bottom: -120,
            width: 520,
            height: 520,
            borderRadius: 999,
            background: "rgba(45,212,191,.13)",
            filter: "blur(8px)",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              fontSize: 28,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "#334155",
            }}
          >
            <div
              style={{
                width: 50,
                height: 50,
                borderRadius: 10,
                background: "#0f172a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                fontWeight: 700,
              }}
            >
              G
            </div>
            {siteConfig.name}
          </div>
          <div
            style={{
              maxWidth: 850,
              fontSize: 72,
              lineHeight: 1.02,
              fontWeight: 700,
              letterSpacing: -1,
            }}
          >
            Daily technical challenges for disciplined growth.
          </div>
        </div>
        <div
          style={{
            maxWidth: 880,
            fontSize: 30,
            lineHeight: 1.35,
            color: "#475569",
          }}
        >
          Evidence-based grading, progress metrics, examiner feedback, and an
          engineering notebook for technical learners.
        </div>
      </div>
    ),
    size,
  );
}
