"use client";

import { NavButtons } from "./NavButtons";

const STEPS: { icon: string; title: string; desc: string }[] = [
  { icon: "🔎", title: "Tìm sản phẩm", desc: "Gõ tên hàng vào ô tìm kiếm ở trang đầu (vd: cám gà, NPK, thuốc cỏ), hoặc chạm vào loại hàng để xem." },
  { icon: "🏷", title: "Xem giá & thông tin", desc: "Chạm vào một sản phẩm để xem giá, hình ảnh, công dụng và vị trí kệ trong cửa hàng." },
  { icon: "🗺", title: "Xem sơ đồ cửa hàng", desc: "Bấm 'Sơ đồ cửa hàng' để biết món bác cần nằm ở kệ nào, đi đường nào tới." },
  { icon: "🤖", title: "Hỏi trợ lý", desc: "Bấm 'Hỏi trợ lý' và hỏi bằng lời như nói chuyện: 'cám cho gà giá bao nhiêu?', 'còn hàng không?'." },
  { icon: "📒", title: "Xem nợ của mình", desc: "Bấm 'Công nợ của tôi', nhập số điện thoại, nhờ người bán xác nhận là xem được." },
  { icon: "🔔", title: "Cần người giúp", desc: "Bấm 'Gọi người bán' để nhân viên ra hỗ trợ bác ngay." },
];

const SAFETY = "Lưu ý: Với thuốc trừ sâu, thuốc cỏ, thuốc chuột — đọc kỹ hướng dẫn trên nhãn. Không tự ý tăng liều hay pha trộn. Hỏi người bán hoặc người có chuyên môn khi chưa rõ.";

export function Guide() {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <NavButtons />
        <div className="flex-1 text-2xl font-extrabold text-brand-dark">❓ Hướng dẫn</div>
      </div>
      <p className="mb-4 rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-soft">
        Cửa hàng có máy này để bác <b>tự xem hàng, xem giá</b> và <b>tìm đường trong cửa hàng</b>. Rất dễ:
      </p>
      <div className="space-y-3">
        {STEPS.map((s) => (
          <div key={s.title} className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-white p-4 shadow-soft">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-3xl">{s.icon}</span>
            <div>
              <div className="text-xl font-extrabold text-brand-dark">{s.title}</div>
              <div className="mt-0.5 text-sm leading-relaxed text-slate-600">{s.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl border border-amber-200 border-l-4 border-l-amber-400 bg-amber-50 px-4 py-3 text-base font-medium leading-relaxed text-amber-900">
        ⚠️ {SAFETY}
      </div>
    </div>
  );
}
