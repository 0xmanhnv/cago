"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { BackBar, goBackSmart, Ok, Warn } from "./Shared";
import { toast } from "@/components/ui/toast";
import { PageLoading } from "@/components/ui/Loading";

// One admin-only surface for every external channel (docs/45). Secrets never come back from the
// server — only has_* flags — so a blank secret input means "keep what's saved". Mirrors AiSettings.
interface Cfg {
  public_url: string;
  notify_webhook: string;
  has_notify_token: boolean;
  telegram_chat_id: string;
  telegram_owner_ids: string;
  has_telegram_bot: boolean;
  has_telegram_webhook: boolean;
  zalo_app_id: string;
  zalo_oa_id: string;
  has_zalo_secret: boolean;
  zalopay_merchant_id: string;
  has_zalopay_key: boolean;
}

interface HookInfo {
  configured: boolean;
  url?: string;
  pending?: number;
  last_error?: string;
  error?: string;
}

const SECRET_PH = "•••••• (để trống nếu giữ nguyên)";

export function ConnectScreen() {
  const router = useRouter();
  const [c, setC] = useState<Cfg | null>(null);
  const [busy, setBusy] = useState("");
  // New-secret inputs (kept apart from c so a blank = keep existing).
  const [botToken, setBotToken] = useState("");
  const [notifyToken, setNotifyToken] = useState("");
  const [zaloSecret, setZaloSecret] = useState("");
  const [zalopayKey, setZalopayKey] = useState("");
  const [hook, setHook] = useState<HookInfo | null>(null);

  const load = () => frappeCall<Cfg>("cago.api.integrations.get_integrations", {}, { method: "GET" }).then(setC).catch(() => {});
  useEffect(() => {
    void load();
    frappeCall<HookInfo>("cago.api.telegram.webhook_info", {}, { method: "GET" }).then(setHook).catch(() => {});
  }, []);
  if (!c) return <PageLoading />;

  const set = (patch: Partial<Cfg>) => setC({ ...c, ...patch });

  // The webhook URL "Đăng ký nhận lệnh" will register with Telegram = the public origin + the fixed
  // endpoint path. Shown as a copyable suggestion (also usable to set the webhook by hand if needed).
  const webhookUrl = c.public_url
    ? `${c.public_url.replace(/\/+$/, "")}/api/method/cago.api.telegram.webhook`
    : "";

  // Each section saves on its own so a half-filled form elsewhere can't block the part you finished.
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi: không lưu được.");
    } finally {
      setBusy("");
    }
  };

  const savePublic = () =>
    run("public", async () => {
      setC(await frappeCall<Cfg>("cago.api.integrations.set_public_url", { public_url: c.public_url }));
      toast.success("Đã lưu địa chỉ công khai.");
    });

  const saveTelegram = () =>
    run("tg", async () => {
      const d = await frappeCall<{ telegram_chat_id: string; telegram_owner_ids: string; has_telegram_bot: boolean }>("cago.api.notify.set_telegram", {
        ...(botToken ? { bot_token: botToken } : {}),
        chat_id: c.telegram_chat_id,
        owner_ids: c.telegram_owner_ids,
      });
      setBotToken("");
      set({ telegram_chat_id: d.telegram_chat_id || "", telegram_owner_ids: d.telegram_owner_ids || "", has_telegram_bot: !!d.has_telegram_bot });
      toast.success("Đã lưu cấu hình Telegram.");
    });

  const testTelegram = () =>
    run("tgtest", async () => {
      await frappeCall("cago.api.notify.telegram_test", {});
      toast.success("Đã gửi tin thử — kiểm tra nhóm Telegram nhé.");
    });

  const registerHook = () =>
    run("tghook", async () => {
      const r = await frappeCall<{ url: string }>("cago.api.telegram.set_webhook", {});
      const info = await frappeCall<HookInfo>("cago.api.telegram.webhook_info", {}, { method: "GET" });
      setHook(info);
      set({ has_telegram_webhook: true });
      toast.success(`Đã đăng ký nhận lệnh: ${r.url}`);
    });

  const saveZalo = () =>
    run("zalo", async () => {
      const d = await frappeCall<Cfg>("cago.api.integrations.set_zalo", {
        app_id: c.zalo_app_id,
        oa_id: c.zalo_oa_id,
        ...(zaloSecret ? { app_secret: zaloSecret } : {}),
        zalopay_merchant_id: c.zalopay_merchant_id,
        ...(zalopayKey ? { zalopay_key: zalopayKey } : {}),
      });
      setZaloSecret("");
      setZalopayKey("");
      setC(d);
      toast.success("Đã lưu cấu hình Zalo.");
    });

  const saveNotify = () =>
    run("notify", async () => {
      const d = await frappeCall<{ webhook: string; has_token: boolean }>("cago.api.notify.set_webhook", {
        webhook: c.notify_webhook,
        ...(notifyToken ? { token: notifyToken } : {}),
      });
      setNotifyToken("");
      set({ notify_webhook: d.webhook || "", has_notify_token: !!d.has_token });
      toast.success("Đã lưu kênh gửi tin.");
    });

  const inputCls = "mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5";
  const label = "mt-3 block font-bold text-slate-700";

  return (
    <div className="mx-auto max-w-[760px]">
      <BackBar onBack={() => goBackSmart(router)} title="🔌 Kết nối & Kênh" />
      <Ok>
        Cấu hình kỹ thuật cho các kênh (Zalo, Telegram, thanh toán). Chỉ <b>quản trị</b> thấy màn này —
        token & mật khẩu không hiển thị cho người khác.
      </Ok>

      {/* 0. Public URL — the one origin every remote channel reuses. */}
      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="font-extrabold">🌐 Địa chỉ công khai (HTTPS)</div>
        <p className="text-slate-500">
          Địa chỉ khách & các kênh truy cập từ ngoài (vd Cloudflare Tunnel / tên miền). Cần cho webhook
          Telegram, Zalo Mini App và link chia sẻ. Để trống nếu app chỉ chạy nội bộ LAN.
        </p>
        <input value={c.public_url} onChange={(e) => set({ public_url: e.target.value })} placeholder="https://cuahang.example.com" className={inputCls} />
        <button onClick={savePublic} disabled={!!busy} className="mt-3 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white disabled:opacity-50">
          {busy === "public" ? "Đang lưu…" : "💾 Lưu địa chỉ"}
        </button>
      </div>

      {/* 1. Telegram ops bot. */}
      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="font-extrabold">🤖 Telegram cửa hàng (vận hành)</div>
        <p className="text-slate-500">
          Tạo bot ở <b>@BotFather</b> (gõ <code>/newbot</code>) lấy <b>Bot Token</b>. Tạo nhóm Telegram cho
          cửa hàng, thêm bot vào, lấy <b>Chat ID</b> nhóm. Xong: đơn mới & nhắc việc tự gửi vào nhóm; nhắn
          <code> /doanhthu</code> <code>/no</code> <code>/tonkho</code> <code>/viec</code> để hỏi nhanh.
        </p>
        <label className={label}>Bot Token{c.has_telegram_bot ? " — đã lưu" : ""}</label>
        <input value={botToken} onChange={(e) => setBotToken(e.target.value)} placeholder={c.has_telegram_bot ? SECRET_PH : "123456:ABC-DEF…"} className={inputCls} />
        <label className={label}>Chat ID (nhóm nhận tin)</label>
        <input value={c.telegram_chat_id} onChange={(e) => set({ telegram_chat_id: e.target.value })} placeholder="VD: -1001234567890" className={inputCls} />
        <label className={label}>Telegram ID của chủ (xem doanh thu/công nợ)</label>
        <input value={c.telegram_owner_ids} onChange={(e) => set({ telegram_owner_ids: e.target.value })} placeholder="VD: 123456789, 987654321" className={inputCls} />
        <p className="mt-1 text-xs text-slate-500">Chỉ những ID này được xem doanh thu/công nợ (nhắn riêng cho bot). Nhân viên trong nhóm chỉ thấy lệnh vận hành. Chủ gõ <code>/myid</code> trong bot để lấy ID.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button onClick={saveTelegram} disabled={!!busy} className="min-h-touch flex-1 rounded-xl bg-brand font-extrabold text-white disabled:opacity-50">
            {busy === "tg" ? "Đang lưu…" : "💾 Lưu Telegram"}
          </button>
          <button onClick={testTelegram} disabled={!!busy || !c.has_telegram_bot} className="min-h-touch flex-1 rounded-xl border-2 border-brand font-extrabold text-brand disabled:opacity-50">
            {busy === "tgtest" ? "Đang gửi…" : "📨 Gửi thử"}
          </button>
        </div>
        {/* Inbound commands need the public webhook registered with Telegram. */}
        <div className="mt-3 rounded-lg bg-slate-50 p-3">
          <div className="text-sm font-bold text-slate-700">Nhận lệnh (/doanhthu…) — cần đăng ký webhook</div>
          <p className="text-sm text-slate-500">Bấm để đăng ký tự động (dùng địa chỉ công khai ở trên). Cần Bot Token + HTTPS công khai.</p>

          {/* Suggested webhook URL — what "Đăng ký" will register; copyable for manual setup / verification. */}
          {c.public_url ? (
            <div className="mt-2">
              <div className="text-xs font-bold text-slate-500">Đường dẫn webhook (gợi ý)</div>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 break-all rounded-md bg-white px-2 py-1.5 font-mono text-xs text-slate-700 ring-1 ring-slate-200">{webhookUrl}</code>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(webhookUrl).then(
                      () => toast.success("Đã sao chép đường dẫn webhook."),
                      () => toast.error("Không sao chép được."),
                    );
                  }}
                  className="shrink-0 rounded-md border-2 border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-600"
                >
                  📋 Sao chép
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-amber-700">Nhập <b>Địa chỉ công khai</b> ở trên để có đường dẫn webhook.</p>
          )}

          <button onClick={registerHook} disabled={!!busy || !c.has_telegram_bot || !c.public_url} className="mt-2 min-h-touch w-full rounded-xl bg-slate-600 font-extrabold text-white disabled:opacity-50">
            {busy === "tghook" ? "Đang đăng ký…" : "🔗 Đăng ký nhận lệnh"}
          </button>
          {hook && hook.configured && (
            <div className="mt-2 text-sm">
              {hook.url ? <Ok>Đang nhận lệnh tại: <span className="break-all font-mono text-xs">{hook.url}</span>{hook.pending ? ` · ${hook.pending} chờ` : ""}</Ok> : <span className="text-slate-500">Chưa đăng ký webhook.</span>}
              {hook.last_error ? <Warn>Lỗi gần nhất: {hook.last_error}</Warn> : null}
            </div>
          )}
        </div>
      </div>

      {/* 2. Zalo Mini App + ZaloPay. */}
      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="font-extrabold">💬 Zalo Mini App</div>
        <p className="text-slate-500">
          Kênh khách hàng quan trọng nhất ở nông thôn. Đăng ký tại <b>Zalo for Developers</b> + tạo <b>OA</b>
          cho cửa hàng. Nhập App ID / OA ID / App Secret để app xác thực danh tính & số ĐT khách. (Dự án
          giao diện <code>zmp</code> tách riêng — xem docs/45.)
        </p>
        <label className={label}>App ID</label>
        <input value={c.zalo_app_id} onChange={(e) => set({ zalo_app_id: e.target.value })} placeholder="Zalo Mini App ID" className={inputCls} />
        <label className={label}>OA ID</label>
        <input value={c.zalo_oa_id} onChange={(e) => set({ zalo_oa_id: e.target.value })} placeholder="Official Account ID" className={inputCls} />
        <label className={label}>App Secret{c.has_zalo_secret ? " — đã lưu" : ""}</label>
        <input value={zaloSecret} onChange={(e) => setZaloSecret(e.target.value)} placeholder={c.has_zalo_secret ? SECRET_PH : "App Secret (server-side)"} className={inputCls} />
        <div className="mt-4 font-bold text-slate-700">💳 ZaloPay (tuỳ chọn — thanh toán online)</div>
        <label className={label}>Merchant ID</label>
        <input value={c.zalopay_merchant_id} onChange={(e) => set({ zalopay_merchant_id: e.target.value })} placeholder="Bỏ trống nếu chưa dùng" className={inputCls} />
        <label className={label}>Key{c.has_zalopay_key ? " — đã lưu" : ""}</label>
        <input value={zalopayKey} onChange={(e) => setZalopayKey(e.target.value)} placeholder={c.has_zalopay_key ? SECRET_PH : "Khoá ký ZaloPay"} className={inputCls} />
        <button onClick={saveZalo} disabled={!!busy} className="mt-4 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white disabled:opacity-50">
          {busy === "zalo" ? "Đang lưu…" : "💾 Lưu Zalo"}
        </button>
      </div>

      {/* 3. Zalo/SMS relay webhook (outbound messaging to customers). */}
      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="font-extrabold">📩 Kênh gửi tin Zalo/SMS (relay)</div>
        <p className="text-slate-500">
          Đường dẫn dịch vụ gửi tin (nhận POST <code>{"{phone, text}"}</code>) để app gửi nhắc nợ / báo
          hàng về cho khách. Trỏ tới relay Zalo ZNS / SMS bất kỳ. Số ĐT chủ nhận nhắc việc đặt ở
          <b> Cài đặt cửa hàng</b> (mục business).
        </p>
        <label className={label}>Webhook</label>
        <input value={c.notify_webhook} onChange={(e) => set({ notify_webhook: e.target.value })} placeholder="https://…" className={inputCls} />
        <label className={label}>Token (tuỳ chọn){c.has_notify_token ? " — đã lưu" : ""}</label>
        <input value={notifyToken} onChange={(e) => setNotifyToken(e.target.value)} placeholder={c.has_notify_token ? SECRET_PH : "Bearer token"} className={inputCls} />
        <button onClick={saveNotify} disabled={!!busy} className="mt-4 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white disabled:opacity-50">
          {busy === "notify" ? "Đang lưu…" : "💾 Lưu kênh gửi tin"}
        </button>
      </div>
    </div>
  );
}
