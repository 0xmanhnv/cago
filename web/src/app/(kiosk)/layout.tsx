import { Chrome } from "@/components/kiosk/Chrome";

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return <Chrome>{children}</Chrome>;
}
