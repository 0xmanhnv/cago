import { describe, expect, it } from "vitest";
import { routeOnFloor } from "./storemap";

const inBox = (p: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) =>
  p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;

describe("store-map routing (corridors between shelves)", () => {
  it("no shelves: straight line", () => {
    expect(routeOnFloor([], { x: 0, y: 0 }, { x: 10, y: 10 })).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it("routes through the GAP between shelves with axis-aligned corridor turns", () => {
    const topWall = { x: 30, y: 0, w: 10, h: 40 };
    const botWall = { x: 30, y: 60, w: 10, h: 40 }; // wall with a gap at y 40–60
    const start = { x: 10, y: 10 };
    const target = { x: 75, y: 25 };
    const r = routeOnFloor([topWall, botWall], start, target);
    expect(r[0]).toEqual(start);
    expect(r[r.length - 1]).toEqual(target);
    expect(r.every((p) => !inBox(p, topWall) && !inBox(p, botWall))).toBe(true); // never inside a shelf
    for (let i = 1; i < r.length; i++) {
      const axisAligned = Math.abs(r[i].x - r[i - 1].x) < 0.01 || Math.abs(r[i].y - r[i - 1].y) < 0.01;
      expect(axisAligned).toBe(true); // right-angle corridor segments
    }
    expect(r.some((p) => Math.abs(p.y - 50) < 0.01)).toBe(true); // used the gap-centre lane
  });

  it("enters the target's own zone (target zone is not a wall)", () => {
    const box = { x: 4, y: 4, w: 4, h: 4 };
    const target = { x: 6, y: 6 };
    const r = routeOnFloor([box], { x: 0, y: 6 }, target);
    expect(r[r.length - 1]).toEqual(target);
  });
});
