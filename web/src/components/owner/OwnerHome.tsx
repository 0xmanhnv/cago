"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall, logout } from "@/lib/api";
import { useSession } from "@/lib/session";

interface Digest {
  low_stock: number;
  expiring: number;
  debtors: number;
  debt_total_text: string;
  has_tasks: boolean;
}

export function OwnerHome() {
  const router = useRouter();
  const { boot } = useSession();
  const posUrl = boot?.pos_url; // single source of truth from bootstrap
  const [digest, setDigest] = useState<Digest | null>(null);
  useEffect(() => {
    frappeCall<Digest>("cago.api.reports.daily_digest", {}, { method: "GET" }).then(setDigest).catch(() => {});
  }, []);
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
      {digest?.has_tasks && (
        <div className="mb-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3">
          <div className="font-extrabold text-amber-800">📌 Việc cần làm hôm nay</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {digest.low_stock > 0 && (
              <button onClick={() => router.push("/owner/low-stock")} className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-amber-800 shadow">
                📦 {digest.low_stock} hàng sắp hết
              </button>
            )}
            {digest.expiring > 0 && (
              <button onClick={() => router.push("/owner/expiry")} className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-orange-700 shadow">
                ⏰ {digest.expiring} lô sắp hết hạn
              </button>
            )}
            {digest.debtors > 0 && (
              <button onClick={() => router.push("/owner/debt")} className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-red-700 shadow">
                📒 {digest.debtors} khách nợ · {digest.debt_total_text}
              </button>
            )}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3.5">
        {item("🔎 Tra giá", "bg-blue-600", "/owner/price")}
        {item("✏️ Sửa sản phẩm", "bg-amber-500", "/owner/edit")}
        {item("➕ Thêm sản phẩm", "bg-teal-600", "/owner/products/new")}
        {item("🧾 Bán chịu (trừ tồn)", "bg-red-600", "/owner/credit-sale")}
        {item("📝 Ghi nợ (chỉ tiền)", "bg-red-500", "/owner/record-debt")}
        {item("💵 Khách trả nợ", "bg-brand", "/owner/record-payment")}
        {item("📒 Công nợ khách", "bg-violet-600", "/owner/debt")}
        {item("🚚 Công nợ NCC", "bg-violet-500", "/owner/supplier-debt")}
        {item("📦 Hàng sắp hết", "bg-teal-600", "/owner/low-stock")}
        {item("⏰ Lô & hạn dùng", "bg-orange-600", "/owner/expiry")}
        {item("🧮 Chốt ca / Sổ quỹ", "bg-blue-700", "/owner/cashbook")}
        {item("📊 Báo cáo", "bg-blue-600", "/owner/reports")}
        {item("💳 QR thu tiền", "bg-violet-600", "/owner/settings")}
        {item("🛒 Bán hàng", "bg-brand", "/staff/sell")}
        {posUrl && (
          <a
            href={posUrl}
            target="_blank"
            rel="noopener"
            className="flex min-h-[84px] items-center justify-center rounded-2xl bg-slate-600 p-2.5 text-center text-[19px] font-bold text-white"
          >
            🧾 POS Awesome (quầy)
          </a>
        )}
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-3.5">
        <a href="/desk" target="_blank" rel="noopener" className="flex min-h-[64px] items-center justify-center rounded-2xl bg-slate-500 p-2.5 text-center text-lg font-bold text-white">
          ⚙️ Quản lý ERPNext
        </a>
        <button onClick={doLogout} className="min-h-[64px] rounded-2xl bg-red-600 text-lg font-bold text-white">
          🚪 Đăng xuất
        </button>
      </div>
    </div>
  );
}
