"use client";

import { useEffect } from "react";
import Link from "next/link";

// Runtime error boundary for any route under the root layout. Friendly Vietnamese message + a
// "thử lại" (reset) and a way home. Logs the error so it's not swallowed silently.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[88vh] items-center justify-center bg-[#f0fdf4] p-5">
      <div className="w-full max-w-[460px] rounded-3xl border border-amber-200 bg-white p-7 text-center shadow-soft">
        <div className="text-6xl">⚠️</div>
        <div className="mt-2 text-3xl font-extrabold text-brand-dark">Có lỗi xảy ra</div>
        <p className="mt-2 text-slate-500">Xin lỗi, đã có trục trặc. Bác thử lại giúp nhé.</p>
        <div className="mt-6 grid grid-cols-1 gap-3">
          <button onClick={() => reset()} className="min-h-touch rounded-2xl bg-brand text-lg font-extrabold text-white">
            🔄 Thử lại
          </button>
          <Link href="/" className="min-h-touch flex items-center justify-center rounded-2xl border-2 border-emerald-200 text-lg font-bold text-brand-dark">
            🌾 Về trang chủ
          </Link>
        </div>
        {error?.digest && <div className="mt-4 text-xs text-slate-400">Mã lỗi: {error.digest}</div>}
      </div>
    </div>
  );
}
