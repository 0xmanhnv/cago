"use client";

import { useRouter } from "next/navigation";
import { logout } from "@/lib/api";
import { useSession } from "@/lib/session";
import { BrandHeader } from "@/components/ui/BrandHeader";

export function StaffHome() {
  const router = useRouter();
  const { boot } = useSession();
  const posUrl = boot?.pos_url; // single source of truth from bootstrap (no hardcoded desk path)
  const doLogout = async () => {
    await logout();
    window.location.href = "/login"; // full reload → fresh guest session + CSRF
  };
  const Btn = ({ onClick, color, children }: { onClick: () => void; color: string; children: React.ReactNode }) => (
    <button onClick={onClick} className={`mt-tile ${color}`}>
      {children}
    </button>
  );

  return (
    <div>
      <BrandHeader subtitle="Nhân viên bán hàng" />
      <div className="grid grid-cols-2 gap-3.5">
        <Btn onClick={() => router.push("/staff/search")} color="bg-blue-600">
          🔎 Tra sản phẩm
        </Btn>
        <Btn onClick={() => router.push("/staff/orders")} color="bg-teal-600">
          📋 Khách đã chọn
        </Btn>
        <Btn onClick={() => router.push("/staff/assistant")} color="bg-violet-600">
          🤖 Hỏi trợ lý
        </Btn>
        <Btn onClick={() => router.push("/staff/sell")} color="bg-brand">
          🛒 Bán hàng
        </Btn>
        <Btn onClick={() => router.push("/staff/verify")} color="bg-amber-500">
          🙋 Xác nhận xem nợ
        </Btn>
        <Btn onClick={() => router.push("/staff/returns")} color="bg-rose-600">
          ↩ Trả hàng
        </Btn>
        {posUrl && (
          <a href={posUrl} target="_blank" rel="noopener" className="mt-tile bg-slate-500">
            🧾 Mở POS Awesome
          </a>
        )}
      </div>
      <button onClick={doLogout} className="mt-tile mt-3.5 w-full bg-red-600">
        🚪 Đăng xuất
      </button>
    </div>
  );
}
