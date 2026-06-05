import { describe, expect, it } from "vitest";
import { routeOnFloor, splitStrokes, type AislePt } from "./storemap";

const inBox = (p: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) =>
  p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;
const A = (x: number, y: number, b?: boolean): AislePt => ({ x, y, floor: "", ...(b ? { b: 1 } : {}) });

describe("store-map routing (owner-drawn aisle network)", () => {
  it("no aisle drawn → falls back to routing around the shelf box", () => {
    const box = { x: 4, y: 0, w: 2, h: 10 };
    const r = routeOnFloor([box], [], { x: 0, y: 5 }, { x: 10, y: 5 });
    expect(r.length).toBeGreaterThan(2);
    expect(r.every((p) => !inBox(p, box))).toBe(true);
    expect(r[0]).toEqual({ x: 0, y: 5 });
    expect(r[r.length - 1]).toEqual({ x: 10, y: 5 });
  });

  it("follows the owner-drawn aisle: snap on, walk along, snap off", () => {
    const aisle = [A(50, 0, true), A(50, 100)]; // one vertical corridor
    const r = routeOnFloor([], aisle, { x: 10, y: 20 }, { x: 90, y: 80 });
    expect(r[0]).toEqual({ x: 10, y: 20 });
    expect(r[r.length - 1]).toEqual({ x: 90, y: 80 });
    expect(r.some((p) => Math.abs(p.x - 50) < 0.01)).toBe(true); // travelled on the aisle
  });

  it("connects strokes that cross — a network junction", () => {
    // vertical corridor + a horizontal corridor crossing it at (50,50)
    const aisle = [A(50, 0, true), A(50, 100), A(50, 50, true), A(100, 50)];
    const r = routeOnFloor([], aisle, { x: 10, y: 50 }, { x: 90, y: 55 });
    expect(r.length).toBeGreaterThan(2);
    expect(r[0]).toEqual({ x: 10, y: 50 });
    expect(r[r.length - 1]).toEqual({ x: 90, y: 55 });
  });

  it("splitStrokes separates corridors at b=1", () => {
    expect(splitStrokes([A(0, 0, true), A(0, 10), A(20, 0, true), A(20, 10)]).length).toBe(2);
  });
});
