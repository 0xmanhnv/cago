"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BackBar } from "@/components/owner/OwnerShared";

interface Topic {
  icon: string;
  title: string;
  steps: string[];
}

// Plain, step-by-step help for a non-technical rural shopkeeper / staff. Vietnamese, short sentences,
// numbered actions. Static (works offline). Grouped by the everyday jobs in the shop.
const TOPICS: Topic[] = [
  {
    icon: "🛒",
    title: "Bán hàng",
    steps: [
      "Bấm 🛒 Bán hàng ở trang chủ.",
      "Gõ tên sản phẩm (hoặc quét mã vạch) rồi chạm để thêm vào giỏ. Bấm − / + để chỉnh số lượng.",
      "Muốn bán cho khách quen: chạm 'Chọn khách'.",
      "Bấm thanh tiền ở dưới → chọn Tiền mặt / Chuyển khoản / Ghi nợ. Chuyển khoản thì bấm 'Hiện QR' cho khách quét.",
      "Bấm Hoàn tất. Muốn in biên lai thì bấm In.",
    ],
  },
  {
    icon: "💵",
    title: "Mở ca & đóng ca (đếm tiền két)",
    steps: [
      "Đầu ngày: bấm 🟢 Mở ca, đếm tiền có sẵn trong két rồi nhập số đó.",
      "Trong ca, nếu lấy tiền ra / bỏ thêm tiền / chi vặt: bấm Nộp quỹ / Rút quỹ / Chi vặt và ghi lý do.",
      "Cuối ngày: bấm 🔴 Đóng ca, đếm lại tiền thật trong két rồi nhập.",
      "Hệ thống tự so 'tiền dự kiến' với 'tiền đếm' để biết lệch hay khớp.",
    ],
  },
  {
    icon: "📒",
    title: "Ghi nợ & thu nợ",
    steps: [
      "Khách lấy hàng chưa trả: bán xong chọn 'Ghi nợ' (phải chọn đúng khách).",
      "Khách trả nợ: trang chủ → 💵 Khách trả nợ → chọn khách → nhập số tiền.",
      "Xem ai đang nợ: 📒 Công nợ khách. Bấm vào một khách để xem chi tiết, nhắc nợ qua Zalo, hoặc in Sao kê.",
    ],
  },
  {
    icon: "📥",
    title: "Nhập hàng & gợi ý nhập",
    steps: [
      "Hàng sắp hết: 🔔 Cảnh báo hôm nay hoặc 🛒 Gợi ý nhập hàng — tích mặt cần nhập, ghi số lượng, tạo đơn gửi nhà cung cấp.",
      "Khi hàng VỀ tới cửa hàng: bấm 📥 Nhập hàng, chọn sản phẩm, nhập số lượng + giá nhập thật → tồn kho cập nhật.",
      "Nhập nhiều mặt từ ảnh hoá đơn: ⚡ Nhập hàng loạt (chụp ảnh, AI đọc giúp).",
    ],
  },
  {
    icon: "🏷",
    title: "Sản phẩm & giá",
    steps: [
      "Thêm sản phẩm mới: ➕ Thêm sản phẩm.",
      "Sửa giá nhanh: 🔎 Tra giá / sửa giá.",
      "In tem giá dán kệ: 🏷 In tem giá.",
      "Sắp xếp loại hàng: 🗂 Loại hàng.",
    ],
  },
  {
    icon: "📊",
    title: "Báo cáo & cuối ngày",
    steps: [
      "Xem doanh thu, lãi, bán chạy: 📊 Báo cáo.",
      "Chốt tiền cả ngày: 🧮 Chốt ca / Sổ quỹ.",
      "Mỗi sáng xem 🔔 Cảnh báo hôm nay: hàng đang hết, sắp hết hạn, khách nợ.",
    ],
  },
  {
    icon: "🤖",
    title: "Trợ lý & cài đặt",
    steps: [
      "Hỏi trợ lý: 🤖 Hỏi trợ lý (giá, dùng cho gì, còn hàng không). Câu hỏi về liều lượng/pha thuốc trợ lý sẽ không tự trả lời — hãy hỏi người có chuyên môn.",
      "Cài QR ngân hàng, tích điểm, cận hạn, nhắn tin: ở phần cài đặt.",
      "Đổi model AI / đọc ảnh hoá đơn: 🤖 Cấu hình trợ lý AI.",
    ],
  },
];

export function Guide() {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div>
      <BackBar onBack={() => router.push("/pos")} title="📖 Hướng dẫn sử dụng" />
      <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        Chạm vào từng mục để xem các bước. Đọc được cả khi không có mạng.
      </p>
      {TOPICS.map((t, i) => {
        const isOpen = open === i;
        return (
          <div key={t.title} className="mb-2.5 overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
            <button onClick={() => setOpen(isOpen ? null : i)} className="flex w-full items-center justify-between gap-2 p-4 text-left">
              <span className="text-lg font-extrabold text-brand-dark">{t.icon} {t.title}</span>
              <span className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
            </button>
            {isOpen && (
              <ol className="list-decimal space-y-2 px-7 pb-4 text-[17px] leading-relaxed text-[#1b2733] marker:font-bold marker:text-brand">
                {t.steps.map((s, j) => (
                  <li key={j}>{s}</li>
                ))}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );
}
