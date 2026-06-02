import { describe, expect, it } from "vitest";
import { routeOnFloor } from "./storemap";

const inBox = (p: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) =>
  p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;

describe("store-map routing (around zone boxes)", () => {
  it("goes straight when nothing blocks", () => {
    expect(routeOnFloor([], { x: 0, y: 0 }, { x: 10, y: 10 })).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it("detours around a box instead of cutting through it", () => {
    const box = { x: 4, y: 0, w: 2, h: 10 }; // vertical wall between start and target
    const r = routeOnFloor([box], { x: 0, y: 5 }, { x: 10, y: 5 });
    expect(r.length).toBeGreaterThan(2); // it had to go around
    expect(r.every((p) => !inBox(p, box))).toBe(true); // no waypoint inside the wall
    expect(r[0]).toEqual({ x: 0, y: 5 });
    expect(r[r.length - 1]).toEqual({ x: 10, y: 5 });
  });

  it("does not treat the target's own zone as a wall (can enter it)", () => {
    const box = { x: 4, y: 4, w: 4, h: 4 };
    const target = { x: 6, y: 6 }; // inside the box
    const r = routeOnFloor([box], { x: 0, y: 6 }, target);
    expect(r[r.length - 1]).toEqual(target);
  });
});
