import { PosShell } from "@/components/pos/PosShell";
import { OfflineBadge } from "@/components/pos/OfflineBadge";

export const dynamic = "force-dynamic";

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <PosShell>
      <div className="mx-auto max-w-[760px] p-4 text-[18px] text-[#1b2733]">{children}</div>
      <OfflineBadge />
    </PosShell>
  );
}
