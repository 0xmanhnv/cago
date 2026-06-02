"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const { boot, reload } = useSession();
  const brand = boot?.brand || "Minh Tuyết";
  const [usr, setUsr] = useState("");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!usr.trim() || !pwd) {
      setErr("Nhập tài khoản và mật khẩu.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await login(usr.trim(), pwd);
      const b = await reload();
      const roles = b?.roles || [];
      if (roles.includes("Cago Owner") || roles.includes("System Manager")) router.push("/owner");
      else if (roles.includes("Cago Staff")) router.push("/staff");
      else router.push("/");
    } catch {
      setErr("Sai tài khoản hoặc mật khẩu. Bác kiểm tra lại nhé.");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[90vh] items-center justify-center p-5">
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-7 shadow-xl">
        <div className="text-center text-3xl font-black text-brand">🌾 {brand}</div>
        <div className="mb-5 mt-1 text-center text-lg text-slate-500">Đăng nhập cửa hàng</div>

        <label className="mb-1 mt-3 block font-bold text-slate-700">Số điện thoại hoặc tài khoản</label>
        <input
          value={usr}
          onChange={(e) => setUsr(e.target.value)}
          autoComplete="username"
          inputMode="tel"
          placeholder="VD: 0987654321"
          className="w-full rounded-xl border-2 border-emerald-300 p-3.5 text-lg"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />

        <label className="mb-1 mt-3 block font-bold text-slate-700">Mật khẩu</label>
        <input
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          type="password"
          autoComplete="current-password"
          className="w-full rounded-xl border-2 border-emerald-300 p-3.5 text-lg"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />

        <button
          onClick={submit}
          disabled={busy}
          className="mt-4 min-h-[58px] w-full rounded-xl bg-brand text-xl font-extrabold text-white disabled:opacity-60"
        >
          {busy ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
        {err && <div className="mt-3.5 rounded-lg bg-red-100 p-3 text-red-700">{err}</div>}
      </div>
    </div>
  );
}
