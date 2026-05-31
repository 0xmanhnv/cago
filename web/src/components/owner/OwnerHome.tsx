"use client";

import { useRouter } from "next/navigation";
import { logout } from "@/lib/api";

export function OwnerHome() {
  const router = useRouter();
  const doLogout = async () => {
    await logout();
    window.location.href = "/login"; // full reload → fresh guest session + CSRF
  };
  const item = (label: string, color: string, href: string) => (
    <button
      onClick={() => router.push(href)}
      className={`flex min-h-[84px] items-center justify-center rounded-2xl p-2.5 text-center text-[19px] font-bold text-white ${color}`}
    >
      {label}
    </button>
  );
  return (
    <div>
      <div className="my-4 text-center text-2xl font-bold text-brand-dark">CHỦ CỬA HÀNG</div>
      <div className="grid grid-cols-2 gap-3.5">
        {item("🔎 Tra giá", "bg-blue-600", "/owner/price")}
        {item("✏️ Sửa sản phẩm", "bg-amber-500", "/owner/edit")}
        {item("➕ Thêm sản phẩm", "bg-teal-600", "/owner/products/new")}
        {item("🧾 Bán chịu (trừ tồn)", "bg-red-600", "/owner/credit-sale")}
        {item("📝 Ghi nợ (chỉ tiền)", "bg-red-500", "/owner/record-debt")}
        {item("💵 Khách trả nợ", "bg-brand", "/owner/record-payment")}
        {item("📒 Công nợ", "bg-violet-600", "/owner/debt")}
        {item("📦 Hàng sắp hết", "bg-teal-600", "/owner/low-stock")}
        {item("⏰ Lô & hạn dùng", "bg-orange-600", "/owner/expiry")}
        {item("📊 Báo cáo", "bg-blue-600", "/owner/reports")}
        {item("💳 QR thu tiền", "bg-violet-600", "/owner/settings")}
        <a
          href="/app/point-of-sale"
          target="_blank"
          rel="noopener"
          className="flex min-h-[84px] items-center justify-center rounded-2xl bg-brand p-2.5 text-center text-[19px] font-bold text-white"
        >
          🛒 Bán hàng (POS)
        </a>
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-3.5">
        <a href="/app" target="_blank" rel="noopener" className="flex min-h-[64px] items-center justify-center rounded-2xl bg-slate-500 p-2.5 text-center text-lg font-bold text-white">
          ⚙️ Quản lý ERPNext
        </a>
        <button onClick={doLogout} className="min-h-[64px] rounded-2xl bg-red-600 text-lg font-bold text-white">
          🚪 Đăng xuất
        </button>
      </div>
    </div>
  );
}
