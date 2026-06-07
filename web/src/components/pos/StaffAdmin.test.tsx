import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The per-person admin promotion (set_staff_admin) is a sensitive, new RBAC control with no prior
// coverage. We mock the backend + confirm dialog and assert: opening a staff and clicking "Cấp quyền"
// asks for confirmation and calls set_staff_admin with on:1 for that user.

const frappeCall = vi.fn();
// Give the impl a rest param so the inferred signature accepts the `(...a) => confirmDialog(...a)`
// spread below — a no-arg impl infers a 0-arg type and spreading into it is ts(2556).
const confirmDialog = vi.fn((..._a: unknown[]) => Promise.resolve(true));
vi.mock("@/lib/api", () => ({ frappeCall: (...a: unknown[]) => frappeCall(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/Loading", () => ({ PageLoading: () => <div>loading</div> }));
vi.mock("@/components/ui/dialog", () => ({ confirmDialog: (...a: unknown[]) => confirmDialog(...a) }));
vi.mock("@/components/owner/Shared", () => ({ BackBar: () => <div />, goBackSmart: vi.fn() }));

import { StaffAdmin } from "./StaffAdmin";

const staffRow = {
  user: "ban@cago.local",
  full_name: "Nhân viên Bán",
  enabled: true,
  is_owner: false,
  is_admin: false,
  job_roles: [],
  caps: [],
  allow_price_edit: false,
  max_discount_pct: 0,
  blind_shift_close: false,
};

function mockBackend() {
  frappeCall.mockReset();
  confirmDialog.mockClear();
  frappeCall.mockImplementation((method: string, args?: { on?: number }) => {
    if (method === "cago.api.staff_admin.list_staff") return Promise.resolve([staffRow]);
    if (method === "cago.api.staff_admin.list_job_roles") return Promise.resolve([]);
    if (method === "cago.api.staff_admin.set_staff_admin") return Promise.resolve({ ...staffRow, is_admin: !!args?.on });
    return Promise.resolve({});
  });
}

afterEach(cleanup);

describe("StaffAdmin — admin promotion", () => {
  it("promotes a staff to Cago Admin via set_staff_admin after confirmation", async () => {
    mockBackend();
    const user = userEvent.setup();
    render(<StaffAdmin />);

    // staff list loads → click the (non-owner) staff to open the edit screen
    await user.click(await screen.findByText("Nhân viên Bán"));

    // the technical-admin switch + its "Cấp quyền" button
    const grant = await screen.findByRole("button", { name: /Cấp quyền/i });
    await user.click(grant);

    expect(confirmDialog).toHaveBeenCalled(); // must confirm such a sensitive change
    await waitFor(() =>
      expect(frappeCall).toHaveBeenCalledWith(
        "cago.api.staff_admin.set_staff_admin",
        expect.objectContaining({ user: "ban@cago.local", on: 1 }),
      ),
    );
  });
});
