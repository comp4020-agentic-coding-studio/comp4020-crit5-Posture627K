import { describe, expect, it } from "vitest";
import {
  computeShotVelocity,
  MAX_DRAG_DISTANCE,
  MAX_SHOT_SPEED,
  MIN_DRAG_DISTANCE,
  normalizedToRenderPercent,
  pointerToNormalized,
  type Point,
} from "./aim.ts";

describe("pointerToNormalized", () => {
  it("scales pixel offsets by the given pixels-per-unit", () => {
    expect(pointerToNormalized(100, 50, 200)).toEqual({ x: 0.5, y: 0.25 });
  });
});

describe("normalizedToRenderPercent", () => {
  it("matches the rendered cue ball's CSS percentages", () => {
    // .ball--cue is left: 22%; top: 50% --- the same point INITIAL_CUE_BALL
    // represents in physics.ts.
    expect(normalizedToRenderPercent({ x: 0.22, y: 0.25 })).toEqual({
      leftPercent: 22,
      topPercent: 50,
    });
  });
});

describe("computeShotVelocity", () => {
  const ball: Point = { x: 0.22, y: 0.25 };

  it("cancels a negligible drag", () => {
    const pointer: Point = { x: ball.x + 0.005, y: ball.y };
    expect(computeShotVelocity(ball, pointer)).toBeNull();
  });

  it("fires away from the pointer, toward the ball's side, scaled by drag distance", () => {
    const pointer: Point = { x: ball.x + 0.1, y: ball.y };
    const shot = computeShotVelocity(ball, pointer);
    expect(shot).not.toBeNull();
    expect(shot!.vx).toBeCloseTo((0.1 / MAX_DRAG_DISTANCE) * MAX_SHOT_SPEED * -1);
    expect(shot!.vy).toBeCloseTo(0);
  });

  it("clamps drags beyond the maximum distance to maximum speed", () => {
    const pointer: Point = { x: ball.x - 10, y: ball.y };
    const shot = computeShotVelocity(ball, pointer);
    expect(shot).not.toBeNull();
    expect(shot!.vx).toBeCloseTo(MAX_SHOT_SPEED);
    expect(shot!.vy).toBeCloseTo(0);
  });

  it("treats a drag just past the minimum threshold as a real shot", () => {
    const pointer: Point = { x: ball.x + MIN_DRAG_DISTANCE + 0.001, y: ball.y };
    expect(computeShotVelocity(ball, pointer)).not.toBeNull();
  });
});
