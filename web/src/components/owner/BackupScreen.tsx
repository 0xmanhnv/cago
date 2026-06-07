"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { BackBar, goBackSmart } from "./Shared";

interface Last {
  exists: boolean;
  when?: string;
  name?: string;
}

export function BackupScreen() {
  const router = useRouter();
  const [last, setLast] = useState<Last | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    frappeCall<Last>("cago.api.owner.last_backup", {}, { method: "GET" }).then(setLast).catch(() => {});
  useEffect(() => {
    void load();
  }, []);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await frappeCall("cago.api.owner.backup_now");
      toast.success("Đã bắt đầu sao lưu — chờ vài phút rồi kiểm lại.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi: không sao lưu được.");
    } finally {
      setBusy(false);
      setTimeout(() => void load(), 5000); // refresh "bản gần nhất" once the background job lands
    }
  };

  return (
    <div className="mx-auto max-w-[680px]">
      <BackBar onBack={() => goBackSmart(router)} title="💾 Sao lưu dữ liệu" />
      <div className="rounded-xl bg-white p-4">
        <p className="text-slate-600">
          Tạo bản sao lưu toàn bộ dữ liệu (bán hàng, công nợ, sản phẩm, ảnh). Nên sao lưu trước khi sửa lớn.
        </p>
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-center">
          {last?.exists ? (
            <>Bản gần nhất: <b className="text-brand-dark">{last.when}</b></>
          ) : (
            <span className="text-slate-500">Chưa có bản sao lưu nào.</span>
          )}
        </div>
        <button onClick={run} disabled={busy} className="mt-3 min-h-touch w-full rounded-xl bg-brand text-lg font-extrabold text-white disabled:opacity-50">
          {busy ? "Đang bắt đầu..." : "💾 Sao lưu ngay"}
        </button>
        <p className="mt-2 text-xs text-slate-400">
          Sao lưu chạy nền, có thể mất vài phút. Bản sao nằm trong máy chủ — nên bật sao lưu tự động và chép ra USB/ổ ngoài/Drive (xem Hướng dẫn go-live).
        </p>
      </div>
    </div>
  );
}
