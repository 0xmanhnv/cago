"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall, logout } from "@/lib/api";
import { useSession } from "@/lib/session";
import { BrandHeader } from "@/components/ui/BrandHeader";
import { confirmDialog } from "@/components/ui/dialog";

export function StaffHome() {
  const router = useRouter();
  const { boot } = useSession();
  const posUrl = boot?.pos_url; // single source of truth from bootstrap (no hardcoded desk path)
  const [shiftOpen, setShiftOpen] = useState<boolean | null>(null);

  useEffect(() => {
    frappeCall<{ open: boolean }>("cago.api.shift.current_shift", {}, { method: "GET" })
      .then((s) => setShiftOpen(!!s.open))
      .catch(() => setShiftOpen(null));
  }, []);

  const doLogout = async () => {
    if (!(await confirmDialog("Đăng xuất khỏi máy này?", { danger: true, confirmLabel: "Đăng xuất" }))) return;
    // Always redirect even if the logout POST fails (offline) — never strand a logged-in shell on
    // a shared device. The full reload to /login forces a fresh guest session + CSRF.
    try {
      await logout();
    } finally {
      window.location.href = "/login";
    }
  };
  const Btn = ({ onClick, color, children }: { onClick: () => void; color: string; children: React.ReactNode }) => (
    <button onClick={onClick} className={`mt-tile ${color}`}>
      {children}
    </button>
  );

  // Shift-status chip in the brand header (accountability: is a till shift open?).
  const shiftChip =
    shiftOpen === null ? null : (
      <button
        onClick={() => router.push("/staff/sell")}
        className={`rounded-full px-3 py-1.5 text-sm font-bold ${shiftOpen ? "bg-white/20 text-white" : "bg-harvest text-brand-dark"}`}
      >
        {shiftOpen ? "🟢 Ca đang mở" : "⚪ Chưa mở ca"}
      </button>
    );

  return (
    <div>
      <BrandHeader subtitle={boot?.full_name ? `Nhân viên · ${boot.full_name}` : "Nhân viên bán hàng"} right={shiftChip} />

      {/* Primary action — the most-used button, big and first. */}
      <button onClick={() => router.push("/staff/sell")} className="mt-tile mb-3.5 min-h-[84px] w-full bg-brand text-2xl">
        🛒 Bán hàng
      </button>

      {/* 6 even tiles (2×3) so there's no lonely orphan. */}
      <div className="grid grid-cols-2 gap-3.5">
        <Btn onClick={() => router.push("/staff/search")} color="bg-blue-600">
          🔎 Tra sản phẩm
        </Btn>
        <Btn onClick={() => router.push("/staff/returns")} color="bg-rose-600">
          ↩ Trả hàng
        </Btn>
        <Btn onClick={() => router.push("/staff/orders")} color="bg-teal-600">
          📋 Khách đã chọn
        </Btn>
        <Btn onClick={() => router.push("/staff/verify")} color="bg-amber-500">
          🙋 Xem nợ khách
        </Btn>
        {boot?.staff_can_collect_debt && (
          <Btn onClick={() => router.push("/staff/record-payment")} color="bg-brand">
            💵 Khách trả nợ
          </Btn>
        )}
        <Btn onClick={() => router.push("/staff/assistant")} color="bg-violet-600">
          🤖 Hỏi trợ lý
        </Btn>
        {posUrl ? (
          <a href={posUrl} target="_blank" rel="noopener" className="mt-tile bg-slate-500">
            🧾 Mở POS Awesome
          </a>
        ) : (
          <div />
        )}
      </div>

      <button onClick={doLogout} className="mt-tile mt-3.5 w-full bg-red-600">
        🚪 Đăng xuất
      </button>
    </div>
  );
}
