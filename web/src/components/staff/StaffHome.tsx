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
    router.push("/login");
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
        <a
          href="/app/point-of-sale"
          className="flex min-h-[84px] items-center justify-center rounded-2xl bg-brand p-2.5 text-center text-[19px] font-bold text-white"
        >
          🛒 Mở POS gốc
        </a>
        {hasPos && (
          <a
            href="/app/posawesome"
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
