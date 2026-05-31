import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "AgriMate — Cửa hàng vật tư nông nghiệp",
  description: "Tra giá, sản phẩm, trợ lý cho cửa hàng vật tư nông nghiệp",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#16a34a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <PwaRegister />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
