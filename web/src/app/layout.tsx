import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";
import { PwaRegister } from "@/components/PwaRegister";
import { InstallHint } from "@/components/ui/InstallHint";

// Friendly, highly-legible Vietnamese typeface; self-hosted by next/font so the kiosk works offline.
// Only the weights actually used on first paint (400 body / 700 bold / 800 extrabold). Loading the
// rarely-used 500/600/900 made next/font preload woff2 files the first screen never uses → the
// browser "preloaded … not used" warnings. The few font-medium/semibold spots map to the nearest.
const beVietnam = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "700", "800"],
  display: "swap",
  variable: "--font-be-vietnam",
});

export const metadata: Metadata = {
  title: "Minh Tuyết — Vật tư nông nghiệp",
  description: "Cửa hàng vật tư nông nghiệp Minh Tuyết — tra giá, xem sản phẩm, hỏi trợ lý",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  // iOS "Thêm vào Màn hình chính" → opens STANDALONE (no Safari bars, own icon, themed status bar) =
  // feels like a real native app. statusBarStyle "default" keeps the bar opaque + content below it, so
  // no edge-to-edge / safe-area work is needed (kept deliberately simple, like KiotViet's e-menu).
  // black-translucent → in the INSTALLED standalone app the content paints UNDER the status bar, so our
  // green app-bar fills behind it to the very top (light status-bar text on green). The safe-area padding
  // keeps content clear of the notch. (In a plain Safari TAB the status-bar strip is iOS-controlled and
  // not reliably paintable from a web page — the true "green to the top" is the installed experience.)
  // "default" (opaque bar, content below it) — NOT black-translucent, which needs viewport-fit:cover to
  // pad the notch; without cover (we dropped it) translucent would let the status bar overlap the header
  // in an installed PWA. Installed bar colour then comes from theme-color (green); a Safari tab still
  // gets the green tint from iOS sampling the top-of-viewport (canvas + sticky app-bar).
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Minh Tuyết" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "rgb(22, 163, 74)", // rgb() form (== #16a34a) — some iOS Safari builds tint the status bar more reliably with rgb() than hex
  // NOTE: deliberately NOT `viewport-fit: cover`. The green status bar comes from iOS sampling the
  // top-of-viewport colour (the canvas + the sticky green bar) — that works WITHOUT cover. Cover made
  // `env(safe-area-inset-bottom)` report the full Safari bottom-toolbar height in a TAB, which padded a
  // large empty band under the bottom nav. Dropping cover → insets are 0 in a tab (the OS keeps content
  // inside the safe area itself), so the bottom nav sits flush above the toolbar with no band.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={beVietnam.variable}>
      <body>
        {/* Telegram Mini App SDK — provides window.Telegram.WebApp (initData for one-tap login,
            full-screen expand). afterInteractive (NOT beforeInteractive) so it never blocks first
            paint — the in-shop kiosk must boot offline, and this is a cross-origin script the service
            worker can't cache; offline it just fails silently. The login screen polls briefly for
            initData to absorb the load delay. Outside Telegram it's an inert stub (we gate on real
            initData / platform, see miniapp.ts). */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
        <PwaRegister />
        <Providers>{children}</Providers>
        <InstallHint />
      </body>
    </html>
  );
}
