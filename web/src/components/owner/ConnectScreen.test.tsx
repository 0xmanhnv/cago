import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The channel-config screen (Telegram / Zalo / public URL / relay) is admin-only and was untested.
// We mock the backend (frappeCall) + the leaf UI deps and assert the wiring: it loads the config,
// renders the sections, and saves Telegram via the right endpoint with the typed token.

const frappeCall = vi.fn();
vi.mock("@/lib/api", () => ({ frappeCall: (...a: unknown[]) => frappeCall(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/Loading", () => ({ PageLoading: () => <div>loading</div> }));
vi.mock("@/components/owner/Shared", () => ({
  BackBar: () => <div />,
  goBackSmart: vi.fn(),
  Ok: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Warn: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { ConnectScreen } from "./ConnectScreen";

const baseConfig = {
  public_url: "",
  notify_webhook: "",
  has_notify_token: false,
  telegram_chat_id: "",
  has_telegram_bot: false,
  has_telegram_webhook: false,
  zalo_app_id: "",
  zalo_oa_id: "",
  has_zalo_secret: false,
  zalopay_merchant_id: "",
  has_zalopay_key: false,
};

function mockBackend(overrides: Partial<typeof baseConfig> = {}) {
  frappeCall.mockReset();
  frappeCall.mockImplementation((method: string) => {
    if (method === "cago.api.integrations.get_integrations") return Promise.resolve({ ...baseConfig, ...overrides });
    if (method === "cago.api.telegram.webhook_info") return Promise.resolve({ configured: false });
    if (method === "cago.api.notify.set_telegram") return Promise.resolve({ telegram_chat_id: "-100", has_telegram_bot: true });
    return Promise.resolve({});
  });
}

afterEach(cleanup);

describe("ConnectScreen (channel config, admin)", () => {
  it("loads config and renders all channel sections", async () => {
    mockBackend();
    render(<ConnectScreen />);
    expect(await screen.findByText(/Telegram cửa hàng/i)).toBeInTheDocument();
    // (text appears in both the heading and the help paragraph → use getAllByText)
    expect(screen.getAllByText(/Zalo Mini App/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Địa chỉ công khai/i).length).toBeGreaterThan(0);
    // get_integrations was actually called on mount
    expect(frappeCall).toHaveBeenCalledWith("cago.api.integrations.get_integrations", {}, { method: "GET" });
  });

  it("saves Telegram via set_telegram with the typed bot token + chat id", async () => {
    mockBackend();
    const user = userEvent.setup();
    render(<ConnectScreen />);
    await screen.findByText(/Telegram cửa hàng/i);

    await user.type(screen.getByPlaceholderText(/123456:ABC/i), "BOT-TOKEN-XYZ");
    await user.type(screen.getByPlaceholderText(/-1001234567890/i), "-100999");
    await user.click(screen.getByRole("button", { name: /Lưu Telegram/i }));

    await waitFor(() =>
      expect(frappeCall).toHaveBeenCalledWith(
        "cago.api.notify.set_telegram",
        expect.objectContaining({ bot_token: "BOT-TOKEN-XYZ", chat_id: "-100999" }),
      ),
    );
  });

  it("masks a saved secret (shows placeholder, never the value)", async () => {
    mockBackend({ has_telegram_bot: true });
    render(<ConnectScreen />);
    await screen.findByText(/Telegram cửa hàng/i);
    // The bot-token input is empty (we never receive the secret) and labelled '— đã lưu'.
    const tokenInput = screen.getByPlaceholderText(/để trống nếu giữ nguyên/i) as HTMLInputElement;
    expect(tokenInput.value).toBe("");
    expect(screen.getByText(/Bot Token — đã lưu/i)).toBeInTheDocument();
  });
});
