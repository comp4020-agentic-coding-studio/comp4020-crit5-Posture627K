import { describe, expect, it } from "vitest";
import {
  BALL_RADIUS,
  INITIAL_CUE_BALL,
  POCKETS,
  RAIL_MAX_X,
  RAIL_MAX_Y,
  RAIL_MIN_X,
  RAIL_MIN_Y,
  type Ball,
} from "./physics.ts";
import { findSafeCuePosition, isLegalCuePosition } from "./respot.ts";

describe("isLegalCuePosition", () => {
  it("accepts a clear position with no target balls nearby", () => {
    expect(isLegalCuePosition({ x: 0.5, y: 0.25 }, [])).toBe(true);
  });

  it("rejects a position outside the rail bounds", () => {
    expect(isLegalCuePosition({ x: RAIL_MIN_X - 0.01, y: 0.25 }, [])).toBe(false);
  });

  it("rejects a position inside a pocket's capture geometry", () => {
    const pocket = POCKETS[0]!;
    expect(isLegalCuePosition({ x: pocket.x, y: pocket.y }, [])).toBe(false);
  });

  it("rejects a position touching/overlapping an active target ball", () => {
    const target: Ball = { x: 0.5, y: 0.25, vx: 0, vy: 0 };
    expect(isLegalCuePosition({ x: 0.5 + BALL_RADIUS, y: 0.25 }, [target])).toBe(false);
  });

  it("accepts a position just clear of an active target ball", () => {
    const target: Ball = { x: 0.5, y: 0.25, vx: 0, vy: 0 };
    expect(isLegalCuePosition({ x: 0.5 + 2 * BALL_RADIUS + 0.001, y: 0.25 }, [target])).toBe(true);
  });
});

describe("findSafeCuePosition", () => {
  it("returns INITIAL_CUE_BALL when it's unoccupied", () => {
    expect(findSafeCuePosition([])).toEqual(INITIAL_CUE_BALL);
  });

  it("finds a nearby legal alternative when a target ball occupies INITIAL_CUE_BALL", () => {
    const blocking: Ball = { ...INITIAL_CUE_BALL };
    const result = findSafeCuePosition([blocking]);
    expect(result).not.toBeNull();
    expect(result).not.toEqual({ x: INITIAL_CUE_BALL.x, y: INITIAL_CUE_BALL.y });
    expect(isLegalCuePosition(result!, [blocking])).toBe(true);
  });

  it("is deterministic: the same blocked board always returns the same result", () => {
    const blocking: Ball = { ...INITIAL_CUE_BALL };
    const first = findSafeCuePosition([blocking]);
    const second = findSafeCuePosition([blocking]);
    expect(second).toEqual(first);
  });

  it("finds a legal position clear of multiple active target balls", () => {
    const a: Ball = { ...INITIAL_CUE_BALL };
    const b: Ball = { x: INITIAL_CUE_BALL.x + 2 * BALL_RADIUS, y: INITIAL_CUE_BALL.y, vx: 0, vy: 0 };
    const result = findSafeCuePosition([a, b]);
    expect(result).not.toBeNull();
    expect(isLegalCuePosition(result!, [a, b])).toBe(true);
  });

  it("returns null when every position in the rail bounds is blocked (no-safe-position contract)", () => {
    // A grid spaced under 2 * BALL_RADIUS apart so every point in the rail
    // bounds is within blocking range of some grid ball --- guarantees
    // isLegalCuePosition fails everywhere the search could ever look,
    // deterministically exhausting the bounded ring search.
    const spacing = 0.05;
    const blockers: Ball[] = [];
    for (let x = RAIL_MIN_X; x <= RAIL_MAX_X + spacing; x += spacing) {
      for (let y = RAIL_MIN_Y; y <= RAIL_MAX_Y + spacing; y += spacing) {
        blockers.push({ x, y, vx: 0, vy: 0 });
      }
    }

    expect(findSafeCuePosition(blockers)).toBeNull();
  });
});
