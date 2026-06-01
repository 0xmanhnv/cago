"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { confirmDialog, alertDialog } from "@/components/ui/dialog";
import { SearchInput } from "@/components/ui/ListUI";
import { BackBar, CustomerPicker, DraftModal, money, Ok, Warn } from "./OwnerShared";

export function DebtAction({ mode }: { mode: "add" | "repay" }) {
  const router = useRouter();
  const [cust, setCust] = useState("");
  const [info, setInfo] = useState<{ customer_name: string; outstanding_text: string; debt_limit_text?: string } | null>(null);
  const [amt, setAmt] = useState("");
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [qrCfg, setQrCfg] = useState(true);
  const method = mode === "add" ? "cago.api.debt.record_debt" : "cago.api.debt.record_repayment";
  const title = mode === "add" ? "GHI NỢ" : "KHÁCH TRẢ NỢ";

  if (!cust) {
    return (
      <CustomerPicker
        title={title}
        onBack={() => router.push("/owner")}
        onPick={async (c) => {
          setCust(c);
          const d = await frappeCall<{ customer_name: string; outstanding_text: string; debt_limit_text?: string }>(
            "cago.api.debt.get_customer_debt",
            { customer: c },
            { method: "GET" },
          );
          setInfo(d);
        }}
      />
    );
  }
  if (!info) return <div className="py-8 text-center text-slate-500">Đang tải...</div>;

  const save = async () => {
    // VND has no decimals and users may type grouping dots ("1.000"); parseFloat("1.000") = 1,
    // which would record 1đ instead of 1000đ. Strip to digits like the rest of the money inputs.
    const val = parseInt((amt || "").replace(/[^\d]/g, ""), 10) || 0;
    setMsg(null);
    if (busy) return;
    if (!val || val <= 0) return setMsg(<Warn>Số tiền phải lớn hơn 0.</Warn>);
    if (!(await confirmDialog(`${mode === "add" ? "Ghi nợ " : "Khách trả "}${money(val)} cho ${info.customer_name}?`))) return;
    setBusy(true);
    try {
      const r = await frappeCall<{ outstanding_text: string }>(method, { customer: cust, amount: val });
      setMsg(<Ok>✅ Xong. Nợ còn lại: {r.outstanding_text}</Ok>);
      setAmt("");
    } catch (e) {
      setMsg(<Warn>{e instanceof Error ? e.message : "Lỗi: không lưu được."}</Warn>);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <BackBar onBack={() => setCust("")} label="Quay lại" />
      <div className="rounded-xl bg-white p-4">
        <h2 className="text-xl font-bold">{info.customer_name}</h2>
        <div className="flex justify-between border-b border-slate-100 py-2">
          <span className="text-slate-500">Đang nợ</span>
          <span className="font-bold text-red-600">{info.outstanding_text}</span>
        </div>
        {info.debt_limit_text && (
          <div className="flex justify-between border-b border-slate-100 py-2">
            <span className="text-slate-500">Hạn mức nợ</span>
            <b>{info.debt_limit_text}</b>
          </div>
        )}
        <p className="mt-2 text-slate-500">{mode === "add" ? "Số tiền ghi nợ thêm" : "Số tiền khách trả"} (đồng):</p>
        <input autoFocus inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0" className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-3 text-xl" />
        <button onClick={save} disabled={busy} className={`mt-3 min-h-touch w-full rounded-xl font-extrabold text-white disabled:opacity-50 ${mode === "add" ? "bg-red-600" : "bg-brand"}`}>
          {busy ? "Đang lưu..." : mode === "add" ? "Ghi nợ" : "Xác nhận trả"}
        </button>
        {mode === "repay" && (
          <button
            onClick={async () => {
              const r = await frappeCall<{ configured: boolean; url: string | null }>(
                "cago.api.payment.vietqr",
                { amount: parseFloat(amt) || 0, info: `${info.customer_name} tra no` },
                { method: "GET" },
              );
              setQrCfg(r.configured);
              setQr(r.url);
            }}
            className="mt-2.5 min-h-touch w-full rounded-xl bg-violet-600 font-extrabold text-white"
          >
            💳 Hiện QR thu tiền
          </button>
        )}
        {qr && (
          <div className="mt-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="VietQR" className="mx-auto w-56 rounded-lg border" />
            <div className="mt-1 text-sm text-slate-500">Khách quét mã bằng app ngân hàng để chuyển khoản.</div>
          </div>
        )}
        {!qrCfg && <Warn>Chưa cài đặt tài khoản QR. Vào &quot;💳 QR thu tiền&quot; ở trang chủ để cài.</Warn>}
        {msg}
      </div>
    </div>
  );
}

export function DebtList() {
  const router = useRouter();
  const [list, setList] = useState<{ customer: string; customer_name: string; village?: string; outstanding_text: string; outstanding?: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  useEffect(() => {
    frappeCall<typeof list>("cago.api.reports.debt_list", {}, { method: "GET" }).then((r) => {
      setList(r || []);
      setLoading(false);
    });
  }, []);

  const text = q.trim().toLowerCase();
  const filtered = text ? list.filter((c) => `${c.customer_name} ${c.village || ""}`.toLowerCase().includes(text)) : list;
  return (
    <div>
      <BackBar onBack={() => router.push("/owner")} title="CÔNG NỢ KHÁCH HÀNG" />
      {loading ? (
        <div className="py-6 text-center text-slate-500">Đang tải...</div>
      ) : list.length === 0 ? (
        <Ok>Không có khách nào đang nợ. 🎉</Ok>
      ) : (
        <>
          <div className="mb-2 rounded-xl bg-red-50 p-2.5 text-center font-bold text-red-700">{list.length} khách đang nợ</div>
          <SearchInput value={q} onChange={setQ} placeholder="🔎 Tìm khách theo tên / xóm..." />
          {filtered.length === 0 ? (
            <div className="rounded-xl bg-white p-6 text-center text-slate-400">Không tìm thấy khách.</div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.customer}
                onClick={() => router.push(`/owner/debt/${encodeURIComponent(c.customer)}`)}
                className="mb-2 flex w-full items-center justify-between rounded-xl bg-white p-3.5 text-left shadow"
              >
                <div>
                  <div className="font-bold">{c.customer_name}</div>
                  <div className="text-slate-500">{c.village || ""} · bấm xem chi tiết</div>
                </div>
                <div className="text-xl font-bold text-red-600">{c.outstanding_text}</div>
              </button>
            ))
          )}
        </>
      )}
    </div>
  );
}

interface LedgerEntry {
  type: "debt" | "repay";
  label: string;
  date: string;
  amount_text: string;
  voucher_type: string;
  voucher_no: string;
}

export function CustomerLedger({ customer }: { customer: string }) {
  const router = useRouter();
  type Ledger = { customer_name: string; outstanding_text: string; overpaid?: boolean; points?: number; wholesale?: boolean; entries: LedgerEntry[] };
  const [d, setD] = useState<Ledger | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const load = async () => setD(await frappeCall<Ledger>("cago.api.debt.get_customer_ledger", { customer }, { method: "GET" }));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);
  if (!d) return <div className="py-8 text-center text-slate-500">Đang tải...</div>;

  return (
    <div>
      <BackBar onBack={() => router.push("/owner/debt")} label="Quay lại" />
      <div className="rounded-xl bg-white p-4">
        <h2 className="text-xl font-bold">{d.customer_name}</h2>
        <div className="flex justify-between border-b border-slate-100 py-2">
          <span className="text-slate-500">{d.overpaid ? "Khách trả dư" : "Đang nợ"}</span>
          <span className="font-bold text-red-600">{d.outstanding_text}</span>
        </div>
        {!!d.points && (
          <div className="flex justify-between border-b border-slate-100 py-2">
            <span className="text-slate-500">🎁 Điểm tích lũy</span>
            <b className="text-amber-600">{d.points}</b>
          </div>
        )}
        <div className="flex items-center justify-between border-b border-slate-100 py-2">
          <span className="text-slate-500">🏷️ Khách sỉ (mua giá sỉ)</span>
          <button
            onClick={async () => {
              await frappeCall("cago.api.debt.set_wholesale", { customer, on: d.wholesale ? 0 : 1 });
              await load();
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-bold ${d.wholesale ? "bg-violet-600 text-white" : "bg-slate-200 text-slate-700"}`}
          >
            {d.wholesale ? "Đang bật" : "Đang tắt"}
          </button>
        </div>
        <button
          onClick={async () => {
            const r = await frappeCall<{ text: string }>("cago.api.owner.zalo_draft", { kind: "debt_reminder", customer });
            setDraft(r.text);
          }}
          className="mt-2.5 min-h-touch w-full rounded-xl bg-teal-600 font-extrabold text-white"
        >
          📩 Soạn tin nhắc nợ (Zalo)
        </button>
        <div className="mt-3 font-extrabold">Lịch sử ghi nợ / trả nợ</div>
        {d.entries.length === 0 && <div className="text-slate-500">Chưa có giao dịch.</div>}
        {d.entries.map((e, i) => (
          <div key={i} className="flex justify-between border-b border-slate-100 py-2">
            <span>
              <b>
                {e.type === "debt" ? "📝" : "💵"} {e.label}
              </b>
              <br />
              <span className="text-slate-500">{e.date}</span>
            </span>
            <span className="text-right">
              <b className={e.type === "debt" ? "text-red-600" : "text-brand"}>
                {e.type === "debt" ? "+" : "−"}
                {e.amount_text}
              </b>
              <br />
              <button
                onClick={async () => {
                  if (!(await confirmDialog("Huỷ bút toán này? (dùng khi ghi nhầm)", { danger: true, confirmLabel: "Huỷ bút toán" }))) return;
                  await frappeCall("cago.api.debt.cancel_entry", { voucher_type: e.voucher_type, voucher_no: e.voucher_no, customer });
                  await load();
                }}
                className="rounded bg-red-100 px-2 py-1 text-[13px] font-bold text-red-700"
              >
                Huỷ
              </button>
            </span>
          </div>
        ))}
      </div>
      {draft !== null && <DraftModal text={draft} onClose={() => setDraft(null)} />}
    </div>
  );
}
