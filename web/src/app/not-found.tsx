import Link from "next/link";

// 404 — shown when a route calls notFound() (e.g. a product/customer code that doesn't exist).
// Friendly + Vietnamese + big touch targets for low-tech users; offers both the customer kiosk
// and the staff/owner home so whoever lands here gets back in one tap.
export default function NotFound() {
  return (
    <div className="flex min-h-[88vh] items-center justify-center bg-[#f0fdf4] p-5">
      <div className="w-full max-w-[460px] rounded-3xl border border-emerald-100 bg-white p-7 text-center shadow-soft">
        <div className="text-6xl">🧭</div>
        <div className="mt-2 text-3xl font-extrabold text-brand-dark">Không tìm thấy trang</div>
        <p className="mt-2 text-slate-500">Trang bạn tìm không tồn tại hoặc đã được chuyển đi.</p>
        <div className="mt-6 grid grid-cols-1 gap-3">
          <Link href="/" className="min-h-touch flex items-center justify-center rounded-2xl bg-brand text-lg font-extrabold text-white">
            🌾 Về trang chủ
          </Link>
          <Link href="/pos" className="min-h-touch flex items-center justify-center rounded-2xl border-2 border-emerald-200 text-lg font-bold text-brand-dark">
            🧾 Khu bán hàng
          </Link>
        </div>
      </div>
    </div>
  );
}
