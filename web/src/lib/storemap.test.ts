import { describe, expect, it } from "vitest";
import { routeOnFloor } from "./storemap";

const inBox = (p: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) =>
  p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;

describe("store-map routing", () => {
  it("HUGS the drawn aisle: drop on, walk along, step off (perpendicular feet)", () => {
    const aisle = [
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ]; // vertical lối đi down the middle
    const r = routeOnFloor([], aisle, { x: 10, y: 20 }, { x: 90, y: 80 });
    expect(r.length).toBeGreaterThan(2);
    // it walks on the aisle (x=50) rather than a single straight diagonal
    expect(r.some((p) => Math.abs(p.x - 50) < 1e-6)).toBe(true);
    expect(r[0]).toEqual({ x: 10, y: 20 });
    expect(r[r.length - 1]).toEqual({ x: 90, y: 80 });
  });

  it("no aisle: straight when nothing blocks", () => {
    expect(routeOnFloor([], [], { x: 0, y: 0 }, { x: 10, y: 10 })).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it("no aisle: detours around a box instead of cutting through it", () => {
    const box = { x: 4, y: 0, w: 2, h: 10 };
    const r = routeOnFloor([box], [], { x: 0, y: 5 }, { x: 10, y: 5 });
    expect(r.length).toBeGreaterThan(2);
    expect(r.every((p) => !inBox(p, box))).toBe(true);
    expect(r[0]).toEqual({ x: 0, y: 5 });
    expect(r[r.length - 1]).toEqual({ x: 10, y: 5 });
  });

  it("no aisle: does not treat the target's own zone as a wall", () => {
    const box = { x: 4, y: 4, w: 4, h: 4 };
    const target = { x: 6, y: 6 };
    const r = routeOnFloor([box], [], { x: 0, y: 6 }, target);
    expect(r[r.length - 1]).toEqual(target);
  });
});
