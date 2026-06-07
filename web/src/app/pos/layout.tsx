import { Shell } from "@/components/pos/Shell";
import { OfflineBadge } from "@/components/pos/OfflineBadge";
import { BottomNav } from "@/components/pos/BottomNav";
import { DragScroll } from "@/components/ui/DragScroll";

export const dynamic = "force-dynamic";

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      {/* Mouse drag + wheel horizontal scroll for every chip/tab strip (PC has no swipe). */}
      <DragScroll />
      {/* 760px is the touch-first column (phone/tablet). Owner/staff also use a PC, so widen on a
          large screen (xl ≥1280px) to cut the empty side margins — the responsive product grid + lists
          fill it; forms stay readable. Phone/tablet are unaffected. */}
      {/* pb clears the fixed BottomNav so the last row isn't hidden behind it. */}
      <div className="mx-auto max-w-[760px] px-4 pb-[calc(64px+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] text-[18px] text-[#1b2733] md:max-w-[1040px] xl:max-w-[1120px]">{children}</div>
      <OfflineBadge />
      <BottomNav />
    </Shell>
  );
}
