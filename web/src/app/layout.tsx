import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { PwaRegister } from "@/components/PwaRegister";

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
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#16a34a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={beVietnam.variable}>
      <body>
        <PwaRegister />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
