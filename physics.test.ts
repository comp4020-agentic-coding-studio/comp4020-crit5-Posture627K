import { describe, expect, it } from "vitest";
import {
  allAtRest,
  applyFriction,
  BALL_RADIUS,
  FRICTION_DECELERATION,
  isAtRest,
  isPocketed,
  integratePosition,
  POCKET_CAPTURE_RADIUS,
  POCKET_RADIUS,
  POCKETS,
  RAIL_MAX_X,
  RAIL_MAX_Y,
  RAIL_MIN_X,
  RAIL_MIN_Y,
  resolveBallCollision,
  resolveRailCollision,
  type Ball,
} from "./physics.ts";

describe("integratePosition", () => {
  it("changes position according to velocity and time step", () => {
    const ball: Ball = { x: 0.2, y: 0.1, vx: 0.1, vy: 0.05 };
    const after = integratePosition(ball, 1);
    expect(after.x).toBeCloseTo(0.3);
    expect(after.y).toBeCloseTo(0.15);
    expect(after.vx).toBe(0.1);
    expect(after.vy).toBe(0.05);
  });
});

describe("applyFriction", () => {
  it("reduces speed", () => {
    const ball: Ball = { x: 0, y: 0, vx: 0.1, vy: 0 };
    const after = applyFriction(ball, 0.1);
    const speedBefore = Math.hypot(ball.vx, ball.vy);
    const speedAfter = Math.hypot(after.vx, after.vy);
    expect(speedAfter).toBeLessThan(speedBefore);
    expect(speedAfter).toBeGreaterThan(0);
  });

  it("produces the same decay for one long step as many short steps covering the same elapsed time", () => {
    const ball: Ball = { x: 0, y: 0, vx: 0.5, vy: 0 };
    const oneStep = applyFriction(ball, 1);

    let manySteps = ball;
    for (let i = 0; i < 10; i++) {
      manySteps = applyFriction(manySteps, 0.1);
    }

    expect(manySteps.vx).toBeCloseTo(oneStep.vx);
    expect(manySteps.vy).toBeCloseTo(oneStep.vy);
  });

  it("clamps to exactly zero once the deceleration would carry speed past it, rather than reversing or coasting", () => {
    const ball: Ball = { x: 0, y: 0, vx: 0.1, vy: 0 };
    // FRICTION_DECELERATION * dt (0.2 * 1 = 0.2) exceeds the ball's speed (0.1).
    const after = applyFriction(ball, 1);
    expect(after.vx).toBe(0);
    expect(after.vy).toBe(0);
  });

  it("reaches exactly zero after v0 / FRICTION_DECELERATION seconds, for a representative low/medium/max shot", () => {
    // Fixed simulated step, deterministic --- no dependency on real
    // wall-clock time.
    const dt = 1 / 60;

    for (const v0 of [0.04, 0.3, 0.6]) {
      const expectedStopTime = v0 / FRICTION_DECELERATION;
      let ball: Ball = { x: 0, y: 0, vx: v0, vy: 0 };
      let steps = 0;
      const maxSteps = Math.ceil((expectedStopTime + 1) / dt);
      while (!isAtRest(ball) && steps < maxSteps) {
        ball = applyFriction(ball, dt);
        steps++;
      }
      expect(isAtRest(ball)).toBe(true);
      // Quantized by the fixed step size, so allow at most one dt of slack.
      expect(steps * dt).toBeLessThan(expectedStopTime + dt * 2);
    }
  });
});

describe("isAtRest / allAtRest", () => {
  it("eventually reaches rest under repeated friction", () => {
    let ball: Ball = { x: 0, y: 0, vx: 0.01, vy: 0 };
    let steps = 0;
    while (!isAtRest(ball) && steps < 1000) {
      ball = applyFriction(ball, 1);
      steps++;
    }
    expect(isAtRest(ball)).toBe(true);
    expect(steps).toBeLessThan(1000);
  });

  it("distinguishes a moving set from a stationary set", () => {
    const stationary: Ball[] = [
      { x: 0.1, y: 0.1, vx: 0, vy: 0 },
      { x: 0.2, y: 0.2, vx: 0, vy: 0 },
    ];
    const moving: Ball[] = [
      { x: 0.1, y: 0.1, vx: 0, vy: 0 },
      { x: 0.2, y: 0.2, vx: 0.05, vy: 0 },
    ];
    expect(allAtRest(stationary)).toBe(true);
    expect(allAtRest(moving)).toBe(false);
  });
});

describe("resolveRailCollision", () => {
  it("reverses horizontal velocity off a vertical rail", () => {
    const ball: Ball = { x: RAIL_MAX_X + 0.01, y: 0.25, vx: 0.1, vy: 0.02 };
    const after = resolveRailCollision(ball);
    expect(after.vx).toBeCloseTo(-0.1);
    expect(after.vy).toBeCloseTo(0.02);
    expect(after.x).toBeCloseTo(RAIL_MAX_X);
  });

  it("reverses vertical velocity off a horizontal rail", () => {
    const ball: Ball = { x: 0.5, y: RAIL_MIN_Y - 0.01, vx: 0.02, vy: -0.1 };
    const after = resolveRailCollision(ball);
    expect(after.vy).toBeCloseTo(0.1);
    expect(after.vx).toBeCloseTo(0.02);
    expect(after.y).toBeCloseTo(RAIL_MIN_Y);
  });

  it("leaves a ball within bounds untouched", () => {
    const ball: Ball = { x: 0.5, y: 0.25, vx: 0.03, vy: -0.02 };
    expect(resolveRailCollision(ball)).toEqual(ball);
  });
});

describe("resolveBallCollision", () => {
  it("transfers motion in a head-on equal-mass collision", () => {
    const a: Ball = { x: 0.4, y: 0.25, vx: 0.1, vy: 0 };
    const b: Ball = { x: 0.4 + 2 * BALL_RADIUS, y: 0.25, vx: 0, vy: 0 };
    const [aAfter, bAfter] = resolveBallCollision(a, b);
    expect(aAfter.vx).toBeCloseTo(0);
    expect(aAfter.vy).toBeCloseTo(0);
    expect(bAfter.vx).toBeCloseTo(0.1);
    expect(bAfter.vy).toBeCloseTo(0);
  });

  it("leaves both balls unchanged when they are not touching", () => {
    const a: Ball = { x: 0.1, y: 0.1, vx: 0.1, vy: 0 };
    const b: Ball = { x: 0.9, y: 0.4, vx: 0, vy: 0 };
    expect(resolveBallCollision(a, b)).toEqual([a, b]);
  });
});

describe("isPocketed", () => {
  it("uses the pocket's actual visible radius, matching the rendered CSS geometry", () => {
    // .pocket is 7% of table width in styles.css --- half of that is the
    // pocket's visible radius, in the same normalized units as the table.
    expect(POCKET_RADIUS).toBeCloseTo(0.035);
  });

  it("captures on circle overlap: centre-to-centre distance <= sum of the pocket's and ball's radii", () => {
    expect(POCKET_CAPTURE_RADIUS).toBeCloseTo(POCKET_RADIUS + BALL_RADIUS);
  });

  it("keeps every corner pocket reachable: a rail-clamped ball's circle already overlaps the corner pocket's circle", () => {
    const corner = POCKETS[0]!; // (0, 0)
    const clampedAtCorner: Ball = { x: RAIL_MIN_X, y: RAIL_MIN_Y, vx: 0, vy: 0 };
    const distanceToCorner = Math.hypot(clampedAtCorner.x - corner.x, clampedAtCorner.y - corner.y);
    expect(distanceToCorner).toBeLessThanOrEqual(POCKET_CAPTURE_RADIUS);
    expect(isPocketed(clampedAtCorner)).toBe(true);
  });

  it("detects a ball inside the capture geometry", () => {
    const pocket = POCKETS[0]!;
    const ball: Ball = { x: pocket.x + 0.01, y: pocket.y, vx: 0, vy: 0 };
    expect(isPocketed(ball)).toBe(true);
  });

  it("does not detect a ball clearly outside the capture geometry", () => {
    const pocket = POCKETS[0]!;
    const ball: Ball = { x: pocket.x + 0.2, y: pocket.y + 0.2, vx: 0, vy: 0 };
    expect(isPocketed(ball)).toBe(false);
  });
});
