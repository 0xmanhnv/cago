import { RoleGuard } from "@/components/RoleGuard";
import { ROLE_SETS } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard roles={ROLE_SETS.staff}>
      <div className="mx-auto max-w-[760px] p-4 text-[18px] text-[#1b2733]">{children}</div>
    </RoleGuard>
  );
}
