"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Camera barcode scanner overlay (phone/tablet). Decodes continuously with @zxing/browser (works on
 * iOS Safari 14.5+, where the native BarcodeDetector is absent). `onScan` fires per code, debounced
 * so one label isn't read 10×/sec — the caller keeps the overlay open for scan-add-scan.
 *
 * Camera needs a SECURE CONTEXT (HTTPS or localhost): over plain-HTTP LAN the browser blocks the
 * camera, so we detect that and show a clear "cần HTTPS" message instead of a dead black screen.
 */
export function BarcodeScanner({ onScan, onClose, title = "Quét mã vạch" }: { onScan: (code: string) => void; onClose: () => void; title?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<"insecure" | "denied" | "fail" | null>(null);
  const last = useRef<{ code: string; t: number }>({ code: "", t: 0 });

  useEffect(() => {
    let controls: { stop: () => void } | null = null;
    let cancelled = false;
    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError("insecure");
        return;
      }
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current!,
          (result) => {
            if (!result) return;
            const code = result.getText().trim();
            const now = Date.now();
            if (!code || (code === last.current.code && now - last.current.t < 1500)) return;
            last.current = { code, t: now };
            try { navigator.vibrate?.(80); } catch { /* not all devices */ }
            onScan(code);
          },
        );
        if (cancelled) controls.stop();
      } catch (e) {
        setError(e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError") ? "denied" : "fail");
      }
    })();
    return () => { cancelled = true; controls?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-black/90">
      <div className="flex items-center justify-between p-3 text-white">
        <span className="text-lg font-bold">📷 {title}</span>
        <button onClick={onClose} className="rounded-lg bg-white/20 px-4 py-2 font-bold">Đóng</button>
      </div>
      {error ? (
        <div className="m-4 rounded-2xl bg-white p-5 text-center">
          {error === "insecure" ? (
            <>
              <div className="text-lg font-bold text-red-600">Camera cần kết nối an toàn (HTTPS)</div>
              <p className="mt-2 text-slate-600">Bạn đang vào bằng địa chỉ HTTP trong mạng nội bộ nên trình duyệt khoá camera. Hãy mở app bằng <b>https://…</b> (đã cài chứng chỉ) rồi thử lại — hoặc dùng máy quét cắm USB/Bluetooth (gõ thẳng vào ô mã vạch).</p>
            </>
          ) : error === "denied" ? (
            <div className="text-lg font-bold text-red-600">Chưa cấp quyền camera. Vào cài đặt trình duyệt → cho phép Camera cho trang này, rồi thử lại.</div>
          ) : (
            <div className="text-lg font-bold text-red-600">Không mở được camera. Thử lại, hoặc dùng máy quét cắm.</div>
          )}
        </div>
      ) : (
        <div className="relative flex-1">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-[26%] -translate-y-1/2 rounded-2xl border-4 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          <p className="absolute inset-x-0 bottom-8 text-center text-base font-semibold text-white">Đưa mã vạch vào khung — quét liên tục</p>
        </div>
      )}
    </div>
  );
}
