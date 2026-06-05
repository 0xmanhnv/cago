import { describe, expect, it } from "vitest";
import { formatVnd, groupVnd, parseVnd } from "./utils";

// VND has no sub-unit and is grouped with dots ("1.000.000") — so the classic
// parseFloat("1.000") === 1 trap must be structurally impossible here.
describe("VND money helpers", () => {
  it("parseVnd strips grouping dots — never misreads '1.000' as 1", () => {
    expect(parseVnd("1.000")).toBe(1000);
    expect(parseVnd("1.000.000")).toBe(1000000);
    expect(parseVnd("12.000đ")).toBe(12000);
    expect(parseVnd("  320.000 đ ")).toBe(320000);
    expect(parseVnd("")).toBe(0);
    expect(parseVnd(null)).toBe(0);
    expect(parseVnd(undefined)).toBe(0);
    expect(parseVnd(1500.7)).toBe(1501); // numbers are rounded
  });

  it("formatVnd groups vi-VN with đ suffix and no decimals", () => {
    expect(formatVnd(1000)).toBe("1.000đ");
    expect(formatVnd(0)).toBe("0đ");
    expect(formatVnd(1234567)).toBe("1.234.567đ");
    expect(formatVnd(1500.6)).toBe("1.501đ");
  });

  it("groupVnd live-groups digits as the user types", () => {
    expect(groupVnd("10000")).toBe("10.000");
    expect(groupVnd("1000000")).toBe("1.000.000");
    expect(groupVnd("")).toBe("");
    expect(groupVnd("abc")).toBe("");
  });

  it("round-trips group → parse without losing magnitude", () => {
    expect(parseVnd(groupVnd("250000"))).toBe(250000);
    expect(parseVnd(formatVnd(250000))).toBe(250000);
  });
});
