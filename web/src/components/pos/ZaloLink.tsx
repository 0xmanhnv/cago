"use client";

import { useEffect, useState } from "react";
import { frappeCall } from "@/lib/api";

// Zalo channel card in the "Liên kết mạng xã hội" hub. Customer login via Zalo already exists
// (cago.api.zalo.login). A PERSONAL owner/staff Zalo link (login / private alerts) needs the shop's
// Zalo OA + Zalo Login app, so here we surface the real OA state: if the OA is configured, offer a
// "Theo dõi Zalo OA" follow link; otherwise point the owner to where the admin wires it.
export function ZaloLink() {
  const [oa, setOa] = useState<{ configured: boolean; oa_id?: string } | null>(null);

  useEffect(() => {
    frappeCall<{ configured: boolean; oa_id?: string }>("cago.api.zalo.oa_status", {}, { method: "GET" })
      .then(setOa)
      .catch(() => setOa({ configured: false }));
  }, []);

  return (
    <div className="rounded-xl bg-white p-4">
      <div className="font-extrabold">💬 Zalo</div>
      <p className="text-slate-500">
        Khách đã có thể đăng nhập + đặt hàng qua Zalo. Theo dõi Zalo OA của cửa hàng để nhận tin và
        nhắn trực tiếp.
      </p>
      {oa === null ? (
        <div className="mt-3 text-slate-400">Đang kiểm tra…</div>
      ) : oa.configured && oa.oa_id ? (
        <>
          <a
            href={`https://zalo.me/${oa.oa_id}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex min-h-touch w-full items-center justify-center rounded-xl bg-[#0068ff] font-extrabold text-white"
          >
            💬 Theo dõi Zalo OA cửa hàng
          </a>
          <p className="mt-2 text-sm text-slate-500">
            Liên kết Zalo cá nhân (đăng nhập bằng Zalo / nhận thông báo riêng) đang được hoàn thiện.
          </p>
        </>
      ) : (
        <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Chưa cấu hình Zalo OA. Nhờ quản trị nhập ở <b>🔌 Kết nối &amp; Kênh</b> để bật kênh Zalo.
        </div>
      )}
    </div>
  );
}
