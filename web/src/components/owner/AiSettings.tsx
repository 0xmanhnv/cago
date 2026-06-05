"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { BackBar, goBackSmart, Ok, Warn } from "./Shared";
import { toast } from "@/components/ui/toast";

import { PageLoading } from "@/components/ui/Loading";
interface Cfg {
  provider: string;
  model: string;
  base_url: string;
  has_key: boolean;
  vision_model: string;
  fallback_provider: string;
  fallback_model: string;
  fallback_base_url: string;
  fallback_has_key: boolean;
  effective: { provider: string; model: string; vision_model: string; fallback_provider: string; fallback_model: string };
}

const PROVIDERS = ["deterministic", "openai", "anthropic", "gemini"];

export function AiSettings() {
  const router = useRouter();
  const [c, setC] = useState<Cfg | null>(null);
  const [key, setKey] = useState("");
  const [fbKey, setFbKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<Record<string, string>>({});

  const load = () => frappeCall<Cfg>("cago.api.ai_config.get_ai_config", {}, { method: "GET" }).then(setC).catch(() => {});
  useEffect(() => { void load(); }, []);
  if (!c) return <PageLoading />;

  const set = (patch: Partial<Cfg>) => setC({ ...c, ...patch });

  const save = async () => {
    setBusy(true);
    try {
      const r = await frappeCall<Cfg>("cago.api.ai_config.set_ai_config", {
        cago_llm_provider: c.provider,
        cago_llm_model: c.model,
        cago_llm_base_url: c.base_url,
        cago_llm_vision_model: c.vision_model,
        cago_llm_fallback_provider: c.fallback_provider,
        cago_llm_fallback_model: c.fallback_model,
        cago_llm_fallback_base_url: c.fallback_base_url,
        ...(key ? { cago_llm_api_key: key } : {}),
        ...(fbKey ? { cago_llm_fallback_api_key: fbKey } : {}),
      });
      setC(r);
      setKey("");
      setFbKey("");
      toast.success("Đã lưu. Áp dụng ngay, không cần khởi động lại.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi: không lưu được.");
    } finally {
      setBusy(false);
    }
  };

  const runTest = async (which: "primary" | "fallback") => {
    setTest({ ...test, [which]: "…" });
    try {
      const r = await frappeCall<{ ok: boolean; reply?: string; error?: string }>("cago.api.ai_config.test_ai", { which }, { method: "GET" });
      setTest({ ...test, [which]: r.ok ? `✅ ${r.reply}` : `❌ ${r.error}` });
    } catch (e) {
      setTest({ ...test, [which]: `❌ ${e instanceof Error ? e.message : "lỗi"}` });
    }
  };

  const ProviderSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select value={value || "deterministic"} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border-2 border-emerald-300 bg-white p-2.5">
      {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
    </select>
  );

  return (
    <div className="mx-auto max-w-[760px]">
      <BackBar onBack={() => goBackSmart(router)} title="🤖 Cấu hình trợ lý AI" />
      <Ok>
        Đang dùng: <b>{c.effective.provider}</b>
        {c.effective.model ? ` · ${c.effective.model}` : ""}
        {c.effective.fallback_provider ? ` · dự phòng: ${c.effective.fallback_provider}/${c.effective.fallback_model}` : ""}
        {c.effective.vision_model ? ` · đọc ảnh: ${c.effective.vision_model}` : ""}
      </Ok>

      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="font-extrabold">Model chính</div>
        <p className="text-slate-500">Đổi nhà cung cấp / model ở đây là áp dụng ngay, không phải cài lại.</p>
        <label className="mt-3 block font-bold text-slate-700">Nhà cung cấp</label>
        <ProviderSelect value={c.provider} onChange={(v) => set({ provider: v })} />
        <label className="mt-3 block font-bold text-slate-700">Model</label>
        <input value={c.model} onChange={(e) => set({ model: e.target.value })} placeholder="vd: gpt-4o-mini, deepseek-v4-flash" className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <label className="mt-3 block font-bold text-slate-700">Base URL</label>
        <input value={c.base_url} onChange={(e) => set({ base_url: e.target.value })} placeholder="vd: https://api.openai.com/v1" className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <label className="mt-3 block font-bold text-slate-700">API Key{c.has_key ? " — đã lưu" : ""}</label>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder={c.has_key ? "•••••• (để trống nếu giữ nguyên)" : "sk-..."} className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <button onClick={() => runTest("primary")} className="mt-3 min-h-touch w-full rounded-xl bg-violet-600 font-extrabold text-white">🧪 Kiểm tra model chính</button>
        {test.primary && <div className="mt-1 text-sm font-bold">{test.primary}</div>}
      </div>

      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="font-extrabold">📷 Model đọc ảnh (OCR hoá đơn)</div>
        <p className="text-slate-500">Phải là model có “thị giác”. <b>deepseek-v4-flash/pro KHÔNG đọc được ảnh</b> — hãy chọn gpt-4o, gemini-1.5-flash, claude-3-5-sonnet… Để trống = dùng model chính.</p>
        <input value={c.vision_model} onChange={(e) => set({ vision_model: e.target.value })} placeholder="vd: gpt-4o, gemini-1.5-flash" className="mt-2 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
      </div>

      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="font-extrabold">Model dự phòng (fallback)</div>
        <p className="text-slate-500">Khi model chính lỗi/timeout, hệ thống tự chuyển sang đây. Để trống nhà cung cấp = không dùng dự phòng.</p>
        <label className="mt-3 block font-bold text-slate-700">Nhà cung cấp</label>
        <ProviderSelect value={c.fallback_provider} onChange={(v) => set({ fallback_provider: v === "deterministic" ? "" : v })} />
        <label className="mt-3 block font-bold text-slate-700">Model</label>
        <input value={c.fallback_model} onChange={(e) => set({ fallback_model: e.target.value })} className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <label className="mt-3 block font-bold text-slate-700">Base URL</label>
        <input value={c.fallback_base_url} onChange={(e) => set({ fallback_base_url: e.target.value })} className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <label className="mt-3 block font-bold text-slate-700">API Key{c.fallback_has_key ? " — đã lưu" : ""}</label>
        <input value={fbKey} onChange={(e) => setFbKey(e.target.value)} placeholder={c.fallback_has_key ? "•••••• (để trống nếu giữ nguyên)" : "sk-..."} className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <button onClick={() => runTest("fallback")} className="mt-3 min-h-touch w-full rounded-xl bg-violet-600 font-extrabold text-white">🧪 Kiểm tra model dự phòng</button>
        {test.fallback && <div className="mt-1 text-sm font-bold">{test.fallback}</div>}
      </div>

      {c.provider === "deterministic" && <Warn>Đang để “deterministic” — trợ lý chỉ trả lời từ dữ liệu, không gọi AI. Chọn nhà cung cấp + nhập model/key để bật AI.</Warn>}

      <button onClick={save} disabled={busy} className="mt-4 min-h-touch w-full rounded-xl bg-brand text-lg font-extrabold text-white disabled:opacity-50">
        {busy ? "Đang lưu..." : "💾 Lưu cấu hình AI"}
      </button>
    </div>
  );
}
