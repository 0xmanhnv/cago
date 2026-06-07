import { Shell } from "@/components/pos/Shell";
import { OfflineBadge } from "@/components/pos/OfflineBadge";

export const dynamic = "force-dynamic";

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      {/* 760px is the touch-first column (phone/tablet). Owner/staff also use a PC, so widen on a
          large screen (xl ≥1280px) to cut the empty side margins — the responsive product grid + lists
          fill it; forms stay readable. Phone/tablet are unaffected. */}
      <div className="mx-auto max-w-[760px] px-4 pb-4 pt-[env(safe-area-inset-top)] text-[18px] text-[#1b2733] md:max-w-[1040px] xl:max-w-[1120px]">{children}</div>
      <OfflineBadge />
    </Shell>
  );
}
