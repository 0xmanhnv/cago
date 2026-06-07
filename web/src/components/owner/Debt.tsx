"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { confirmDialog } from "@/components/ui/dialog";
import { SearchInput } from "@/components/ui/ListUI";
import { groupVnd, parseVnd } from "@/lib/utils";
import { BackBar, goBackSmart, CustomerPicker, DraftModal, money, Ok, Warn } from "./Shared";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { PageLoading } from "@/components/ui/Loading";
import { toast } from "@/components/ui/toast";
import { useSession } from "@/lib/session";
import { hasCap } from "@/lib/caps";
import { ConfirmDebt, type DebtProof } from "@/components/pos/ConfirmDebt";

export function DebtAction({ mode }: { mode: "add" | "repay" }) {
  const router = useRouter();
  const [cust, setCust] = useState("");
  const [info, setInfo] = useState<{ customer_name: string; outstanding_text: string; debt_limit_text?: string } | null>(null);
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [qrCfg, setQrCfg] = useState(true);
  const [pending, setPending] = useState<number | null>(null); // amount awaiting the proof modal
  const { boot } = useSession();
  const policy = boot?.debt_proof?.[mode === "add" ? "debt" : "repay"];
  const method = mode === "add" ? "cago.api.debt.record_debt" : "cago.api.debt.record_repayment";
  const title = mode === "add" ? "GHI NỢ" : "KHÁCH TRẢ NỢ";

  if (!cust) {
    return (
      <CustomerPicker
        title={title}
        onBack={() => goBackSmart(router)}
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
  if (!info) return <PageLoading />;

  const save = async () => {
    // VND has no decimals and users may type grouping dots ("1.000"); parseVnd strips to digits
    // so "1.000" → 1000, never the parseFloat("1.000")=1 trap.
    const val = parseVnd(amt);
    if (busy) return;
    if (!val || val <= 0) {
      toast.error("Số tiền phải lớn hơn 0.");
      return;
    }
    // When the owner requires/offers a debt acknowledgement, the proof modal IS the confirmation;
    // otherwise just a yes/no confirm.
    if (policy && policy.mode !== "off") {
      setPending(val);
      return;
    }
    if (!(await confirmDialog(`${mode === "add" ? "Ghi nợ " : "Khách trả "}${money(val)} cho ${info.customer_name}?`))) return;
    await doSave(val, null);
  };

  const doSave = async (val: number, proof: DebtProof | null) => {
    setBusy(true);
    try {
      const r = await frappeCall<{ outstanding_text: string }>(method, {
        customer: cust,
        amount: val,
        signature: proof?.signature || undefined,
        photo: proof?.photo || undefined,
        witness: proof?.witness || undefined,
      });
      toast.success(`Xong. Nợ còn lại: ${r.outstanding_text}`);
      setAmt("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi: không lưu được.");
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <div>
      <BackBar onBack={() => setCust("")} title={info.customer_name} />
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
        <input autoFocus inputMode="numeric" value={amt} onChange={(e) => setAmt(groupVnd(e.target.value))} placeholder="0" className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-3 text-xl" />
        <button onClick={save} disabled={busy} className={`mt-3 min-h-touch w-full rounded-xl font-extrabold text-white disabled:opacity-50 ${mode === "add" ? "bg-red-600" : "bg-brand"}`}>
          {busy ? "Đang lưu..." : mode === "add" ? "Ghi nợ" : "Xác nhận trả"}
        </button>
        {mode === "repay" && (
          <button
            onClick={async () => {
              const r = await frappeCall<{ configured: boolean; url: string | null }>(
                "cago.api.payment.vietqr",
                { amount: parseVnd(amt), info: `${info.customer_name} tra no` },
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
      </div>

      {pending !== null && policy && (
        <ConfirmDebt
          amount={pending}
          kind={mode === "add" ? "debt" : "repay"}
          customerName={info.customer_name}
          policy={policy}
          onDone={(proof) => doSave(pending, proof)}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

export function DebtList() {
  const router = useRouter();
  const [list, setList] = useState<{ customer: string; slug?: string; customer_name: string; village?: string; outstanding_text: string; outstanding?: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"amount" | "name" | "village">("amount");
  const [openVil, setOpenVil] = useState<Set<string>>(new Set()); // expanded villages (collapsed by default)
  useEffect(() => {
    frappeCall<typeof list>("cago.api.reports.debt_list", {}, { method: "GET" }).then((r) => {
      setList(r || []);
      setLoading(false);
    });
  }, []);

  const text = q.trim().toLowerCase();
  const filtered = (text ? list.filter((c) => `${c.customer_name} ${c.village || ""}`.toLowerCase().includes(text)) : list).slice();
  filtered.sort((a, b) => {
    if (sort === "name") return a.customer_name.localeCompare(b.customer_name, "vi");
    // Theo xóm: nhóm theo xóm (khách chưa có xóm xuống cuối), trong xóm thì nợ nhiều lên trước.
    if (sort === "village") return (a.village || "~~~").localeCompare(b.village || "~~~", "vi") || (b.outstanding || 0) - (a.outstanding || 0);
    return (b.outstanding || 0) - (a.outstanding || 0); // nợ nhiều nhất trước
  });

  // A plain render fn (NOT a component defined in render) so the parent re-rendering on each search
  // keystroke doesn't remount all rows — important with hundreds of debtors.
  const cust = (c: (typeof list)[number]) => (
    <button
      key={c.customer}
      onClick={() => router.push(`/pos/debt/${encodeURIComponent(c.slug || c.customer)}`)}
      className="mb-2 flex w-full items-center justify-between rounded-xl bg-white p-3.5 text-left shadow"
    >
      <div>
        <div className="font-bold">{c.customer_name}</div>
        <div className="text-slate-500">{c.village || ""} · bấm xem chi tiết</div>
      </div>
      <div className="text-xl font-bold text-red-600">{c.outstanding_text}</div>
    </button>
  );

  // Group filtered customers by village (used by the collapsible "Theo xóm" view).
  const villages = Array.from(
    filtered.reduce((m, c) => {
      const v = c.village || "Chưa rõ xóm";
      const arr = m.get(v) || [];
      arr.push(c);
      m.set(v, arr);
      return m;
    }, new Map<string, typeof filtered>())
  );

  return (
    <div>
      <BackBar onBack={() => goBackSmart(router)} title="📒 Công nợ khách hàng" />
      {loading ? (
        <SkeletonRows rows={6} thumb={false} />
      ) : list.length === 0 ? (
        <Ok>Không có khách nào đang nợ. 🎉</Ok>
      ) : (
        <>
          <div className="mb-2 rounded-xl bg-red-50 p-2.5 text-center font-bold text-red-700">
            {list.length} khách đang nợ · tổng {money(list.reduce((s, c) => s + (c.outstanding || 0), 0))}
          </div>
          <SearchInput value={q} onChange={setQ} placeholder="🔎 Tìm khách theo tên / xóm..." />
          <div className="no-scrollbar mb-2 flex gap-2 overflow-x-auto">
            {([["amount", "💰 Nợ nhiều"], ["village", "🏘 Theo xóm"], ["name", "🔤 Tên A–Z"]] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`flex-none whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-bold ${sort === k ? "border-brand bg-brand text-white" : "border-emerald-300 bg-brand-light text-brand-dark"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <div className="rounded-xl bg-white p-6 text-center text-slate-400">Không tìm thấy khách.</div>
          ) : sort === "village" ? (
            // Each village is a COLLAPSIBLE section (collapsed by default) → a directory of villages
            // you can jump between, instead of scrolling through a 163-customer group. Searching
            // auto-expands so matches always show.
            <div>
              {villages.map(([vil, custs]) => {
                // Auto-expand while searching, or when there's only ONE group (no point collapsing it).
                const isOpen = openVil.has(vil) || !!text || villages.length === 1;
                const subtotal = custs.reduce((s, x) => s + (x.outstanding || 0), 0);
                return (
                  <div key={vil} className="mb-2">
                    <button
                      onClick={() => setOpenVil((p) => { const n = new Set(p); n.has(vil) ? n.delete(vil) : n.add(vil); return n; })}
                      className="flex w-full items-center justify-between gap-2 rounded-xl bg-[#eef9f0] px-3 py-2.5 text-left font-extrabold text-brand-dark"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={`transition-transform ${isOpen ? "rotate-90" : ""}`}>▸</span>
                        <span className="truncate">🏘 {vil} · {custs.length} khách</span>
                      </span>
                      <span className="shrink-0 text-red-600">{money(subtotal)}</span>
                    </button>
                    {isOpen && (
                      <div className="mt-1.5 xl:grid xl:grid-cols-2 xl:gap-x-3 xl:items-start">
                        {custs.map((c) => cust(c))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="xl:grid xl:grid-cols-2 xl:gap-x-3 xl:items-start">
              {filtered.map((c) => cust(c))}
            </div>
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
interface Proof {
  name: string;
  kind: string;
  signature?: string;
  photo?: string;
  witness?: string;
  posted_at?: string;
}

export function CustomerLedger({ customer }: { customer: string }) {
  const router = useRouter();
  type Ledger = { customer_name: string; phone?: string; outstanding_text: string; overpaid?: boolean; points?: number; wholesale?: boolean; entries: LedgerEntry[] };
  const { boot } = useSession();
  // Need the debt cap AND the owner's runtime "thu nợ" toggle (staff_can_collect_debt is already
  // owner-aware = true for the owner). Staff see the ledger but the record buttons hide when off.
  const canEdit = hasCap(boot, "debt") && !!boot?.staff_can_collect_debt;
  const [d, setD] = useState<Ledger | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [statement, setStatement] = useState<string | null>(null);
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [proofView, setProofView] = useState<Proof[] | null>(null); // null = closed; [] = none found
  const [quickPending, setQuickPending] = useState<{ amount: number; mode: "repay" | "add" } | null>(null);
  const load = async () => setD(await frappeCall<Ledger>("cago.api.debt.get_customer_ledger", { customer }, { method: "GET" }));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);
  if (!d) return <PageLoading />;

  // Record a repayment / extra debt right here (was two separate home screens) — server enforces cap.
  const record = async (mode: "repay" | "add") => {
    const val = parseVnd(amt);
    if (busy) return;
    if (!val || val <= 0) { toast.error("Nhập số tiền lớn hơn 0."); return; }
    // Acknowledgement policy → the proof modal IS the confirmation; else a plain yes/no.
    const pol = boot?.debt_proof?.[mode === "repay" ? "repay" : "debt"];
    if (pol && pol.mode !== "off") { setQuickPending({ amount: val, mode }); return; }
    const label = mode === "repay" ? "Khách trả" : "Ghi nợ thêm";
    if (!(await confirmDialog(`${label} ${money(val)} cho ${d.customer_name}?`, { confirmLabel: label }))) return;
    await doQuick(val, mode, null);
  };

  const doQuick = async (val: number, mode: "repay" | "add", proof: DebtProof | null) => {
    setBusy(true);
    try {
      const method = mode === "repay" ? "cago.api.debt.record_repayment" : "cago.api.debt.record_debt";
      const r = await frappeCall<{ outstanding_text: string }>(method, {
        customer,
        amount: val,
        signature: proof?.signature || undefined,
        photo: proof?.photo || undefined,
        witness: proof?.witness || undefined,
      });
      toast.success(`Xong. Nợ còn lại: ${r.outstanding_text}`);
      setAmt("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi: không lưu được.");
    } finally {
      setBusy(false);
      setQuickPending(null);
    }
  };

  return (
    <div>
      <BackBar onBack={() => goBackSmart(router, "/pos/debt")} title={d.customer_name} />
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
        {/* Thu tiền / Ghi nợ ngay tại sổ — không phải mở màn riêng. Chỉ hiện với người có quyền ghi nợ. */}
        {canEdit && (
          <div className="mt-3 rounded-xl border-2 border-slate-200 p-3">
            <div className="mb-1 font-bold text-slate-700">Thu tiền / Ghi nợ nhanh</div>
            <input
              inputMode="numeric"
              value={amt}
              onChange={(e) => setAmt(groupVnd(e.target.value))}
              placeholder="Số tiền (đồng)"
              className="w-full rounded-lg border-2 border-emerald-300 p-3 text-xl"
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button onClick={() => record("repay")} disabled={busy} className="min-h-touch rounded-xl bg-brand font-extrabold text-white disabled:opacity-50">
                💵 Khách trả
              </button>
              <button onClick={() => record("add")} disabled={busy} className="min-h-touch rounded-xl bg-red-600 font-extrabold text-white disabled:opacity-50">
                📝 Ghi nợ thêm
              </button>
            </div>
          </div>
        )}
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <button
            onClick={async () => {
              const r = await frappeCall<{ text: string }>("cago.api.owner.zalo_draft", { kind: "debt_reminder", customer });
              setDraft(r.text);
            }}
            className="min-h-touch rounded-xl bg-teal-600 font-extrabold text-white"
          >
            📩 Nhắc nợ (Zalo)
          </button>
          <button
            onClick={async () => {
              const r = await frappeCall<{ statement_text: string }>("cago.api.debt.customer_statement", { customer }, { method: "GET" });
              setStatement(r.statement_text);
            }}
            className="min-h-touch rounded-xl bg-blue-600 font-extrabold text-white"
          >
            📄 Sao kê (in/gửi)
          </button>
        </div>
        <div className="mt-3 font-extrabold">Lịch sử ghi nợ / trả nợ</div>
        {d.entries.length === 0 && <div className="text-slate-500">Chưa có giao dịch.</div>}
        {d.entries.map((e, i) => {
          // Group by month: a header starts each new "Tháng M/YYYY" (entries are newest-first).
          const ym = (e.date || "").slice(0, 7); // YYYY-MM
          const showMonth = ym && (i === 0 || (d.entries[i - 1].date || "").slice(0, 7) !== ym);
          const [yy, mm] = ym.split("-");
          return (
          <div key={i}>
          {showMonth && <div className="mt-2 text-sm font-extrabold text-slate-400">📅 Tháng {Number(mm)}/{yy}</div>}
          <div className="flex justify-between border-b border-slate-100 py-2">
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
                  const ps = await frappeCall<Proof[]>("cago.debt_proof.proofs_for", { voucher_no: e.voucher_no }, { method: "GET" }).catch(() => []);
                  setProofView(ps.length ? ps : []);
                }}
                className="mr-1 rounded bg-slate-100 px-2 py-1 text-[13px] font-bold text-slate-600"
              >
                ✍️ Bằng chứng
              </button>
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
          </div>
          );
        })}
      </div>
      {draft !== null && <DraftModal text={draft} phone={d.phone} onClose={() => setDraft(null)} />}
      {statement !== null && (
        <DraftModal text={statement} phone={d.phone} title="📄 Sao kê công nợ" allowPrint onClose={() => setStatement(null)} />
      )}
      {quickPending && boot?.debt_proof && (
        <ConfirmDebt
          amount={quickPending.amount}
          kind={quickPending.mode === "repay" ? "repay" : "debt"}
          customerName={d.customer_name}
          policy={boot.debt_proof[quickPending.mode === "repay" ? "repay" : "debt"]}
          onDone={(p) => doQuick(quickPending.amount, quickPending.mode, p)}
          onCancel={() => setQuickPending(null)}
        />
      )}
      {proofView !== null && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={() => setProofView(null)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-extrabold text-brand-dark">✍️ Bằng chứng xác nhận</div>
            {proofView.length === 0 ? (
              <div className="mt-3 text-slate-500">Giao dịch này chưa có chữ ký / ảnh xác nhận.</div>
            ) : (
              proofView.map((p) => (
                <div key={p.name} className="mt-3 rounded-2xl border border-slate-100 p-3">
                  <div className="text-sm font-bold text-slate-500">{p.kind === "repay" ? "Khách trả nợ" : "Ghi nợ"}{p.posted_at ? ` · ${p.posted_at.slice(0, 16).replace("T", " ")}` : ""}</div>
                  {p.signature && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.signature} alt="Chữ ký" className="mt-2 w-full rounded-lg border bg-slate-50" />
                  )}
                  {p.photo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo} alt="Ảnh" className="mt-2 w-full rounded-lg border" />
                  )}
                  {p.witness && <div className="mt-2 text-sm">👤 Người làm chứng: <b>{p.witness}</b></div>}
                </div>
              ))
            )}
            <button onClick={() => setProofView(null)} className="mt-4 min-h-touch w-full rounded-xl bg-slate-200 font-bold text-slate-600">Đóng</button>
          </div>
        </div>
      )}
    </div>
  );
}
