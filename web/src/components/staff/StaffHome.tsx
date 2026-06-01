"use client";

import { useRouter } from "next/navigation";
import { logout } from "@/lib/api";
import { useSession } from "@/lib/session";

export function StaffHome() {
  const router = useRouter();
  const { boot } = useSession();
  const hasPos = !!boot?.has_posawesome;
  const doLogout = async () => {
    await logout();
    window.location.href = "/login"; // full reload → fresh guest session + CSRF
  };
  const Btn = ({ onClick, color, children }: { onClick: () => void; color: string; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={`flex min-h-[84px] items-center justify-center rounded-2xl p-2.5 text-center text-[19px] font-bold text-white ${color}`}
    >
      {children}
    </button>
  );

  return (
    <div>
      <div className="my-4 text-center text-2xl font-bold">NHÂN VIÊN BÁN HÀNG</div>
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
        {hasPos && (
          <a
            href="/desk/posapp"
            target="_blank"
            rel="noopener"
            className="flex min-h-[84px] items-center justify-center rounded-2xl bg-slate-500 p-2.5 text-center text-[19px] font-bold text-white"
          >
            🧾 Mở POS Awesome
          </a>
        )}
      </div>
      <button onClick={doLogout} className="mt-3.5 min-h-touch w-full rounded-2xl bg-red-600 py-3.5 text-lg font-bold text-white">
        🚪 Đăng xuất
      </button>
    </div>
  );
}
