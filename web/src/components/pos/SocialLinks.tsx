"use client";

import { TelegramLink } from "./TelegramLink";
import { ZaloLink } from "./ZaloLink";

// "Liên kết mạng xã hội" hub — one place to connect every channel (Telegram, Zalo, …) instead of a
// channel-specific tile. Telegram is a full self-service link today (bot commands by your real role +
// one-tap Mini App login); Zalo surfaces the shop's OA state. New channels = one more card here.
export function SocialLinks() {
  return (
    <div className="space-y-4">
      <p className="text-slate-500">
        Liên kết tài khoản mạng xã hội của bạn để nhắn lệnh cho trợ lý theo đúng quyền, nhận thông báo,
        và mở app nhanh (từ Telegram khỏi gõ mật khẩu).
      </p>
      <TelegramLink />
      <ZaloLink />
      <p className="px-1 text-sm text-slate-400">Sắp có thêm kênh khác.</p>
    </div>
  );
}
