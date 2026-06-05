import { describe, expect, it } from "vitest";
import { ALL_CAPS, hasCap, isInternal, isOwner } from "./caps";
import type { Bootstrap } from "./types";

// These helpers only read `caps`/`roles`, so a partial cast is enough for the test.
const boot = (o: Partial<Bootstrap>): Bootstrap => o as Bootstrap;

describe("capability checks", () => {
  it("hasCap reads boot.caps and is null-safe", () => {
    expect(hasCap(boot({ caps: ["sell", "debt"] }), "sell")).toBe(true);
    expect(hasCap(boot({ caps: ["sell"] }), "debt")).toBe(false);
    expect(hasCap(null, "sell")).toBe(false);
    expect(hasCap(boot({}), "sell")).toBe(false);
  });

  it("isInternal = holds at least one capability", () => {
    expect(isInternal(boot({ caps: ["sell"] }))).toBe(true);
    expect(isInternal(boot({ caps: [] }))).toBe(false);
    expect(isInternal(null)).toBe(false);
  });

  it("isOwner = owner ROLE, not 'has every capability'", () => {
    expect(isOwner(boot({ roles: ["Cago Owner"] }))).toBe(true);
    expect(isOwner(boot({ roles: ["System Manager"] }))).toBe(true);
    // A staffer granted every capability is still NOT the owner.
    expect(isOwner(boot({ caps: ALL_CAPS, roles: ["Cago Sell"] }))).toBe(false);
    expect(isOwner(null)).toBe(false);
  });
});
