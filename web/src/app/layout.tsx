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
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Minh Tuyết" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#16a34a",
  // Let the app paint edge-to-edge INCLUDING behind the iOS status bar / Dynamic Island so a colored
  // top bar reaches the very top (no white strip). Content then uses env(safe-area-inset-*) to stay
  // clear of the notch/home-indicator. Insets are 0 on non-notch devices → no change there.
  viewportFit: "cover",
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
