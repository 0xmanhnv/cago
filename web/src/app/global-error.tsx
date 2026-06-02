"use client";

import { useEffect } from "react";

// Last-resort boundary if the ROOT layout itself throws (so it must render its own <html>/<body>).
// Inline styles only — Tailwind/layout may not be available at this level.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="vi">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f0fdf4" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ maxWidth: 440, width: "100%", background: "#fff", borderRadius: 24, padding: 28, textAlign: "center", boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 56 }}>⚠️</div>
            <h1 style={{ color: "#14271b", fontSize: 26, margin: "8px 0" }}>Có lỗi nghiêm trọng</h1>
            <p style={{ color: "#64748b" }}>Xin lỗi, ứng dụng gặp trục trặc. Bác thử tải lại trang nhé.</p>
            <button
              onClick={() => reset()}
              style={{ marginTop: 20, minHeight: 56, width: "100%", border: "none", borderRadius: 16, background: "#16a34a", color: "#fff", fontSize: 18, fontWeight: 800 }}
            >
              🔄 Tải lại
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
