// Deterministic safe-respot search for the cue ball. Pure and DOM-free, like
// physics.ts --- reuses its constants/geometry directly rather than
// inventing a second geometry model.
//
// Legal-position predicate: a candidate is legal iff it is (1) within the
// existing rail bounds, (2) outside every pocket's existing capture radius
// (POCKET_CAPTURE_RADIUS, the same threshold isPocketed() uses), and (3) not
// touching/overlapping any active target ball --- "touching" defined exactly
// as resolveBallCollision does: centre distance <= 2 * BALL_RADIUS.
//
// Search: tries INITIAL_CUE_BALL first, then expands outward ring by ring
// (Chebyshev distance k = 1, 2, 3, ... on a SEARCH_STEP grid), scanning each
// ring in a fixed row-major order. No randomness and no dependence on
// iteration order beyond plain nested loops, so the same board state always
// produces the same result. Returns null if the bounded search exhausts
// without finding a legal spot --- unreachable in practice with only three
// target balls on this table, but the search must still terminate.

import {
  BALL_RADIUS,
  INITIAL_CUE_BALL,
  POCKET_CAPTURE_RADIUS,
  POCKETS,
  RAIL_MAX_X,
  RAIL_MAX_Y,
  RAIL_MIN_X,
  RAIL_MIN_Y,
  type Ball,
} from "./physics.ts";

export interface CueSpot {
  readonly x: number;
  readonly y: number;
}

// Grid spacing tied to the ball's own size rather than an arbitrary number.
const SEARCH_STEP = BALL_RADIUS;

// Large enough that the outward search covers the whole table from
// INITIAL_CUE_BALL, so it always terminates having covered every reachable
// position (table width 1.0 / SEARCH_STEP 0.03 ~= 34 rings needed at most).
const MAX_SEARCH_RING = 40;

export function isLegalCuePosition(point: CueSpot, activeTargetBalls: readonly Ball[]): boolean {
  if (
    point.x < RAIL_MIN_X ||
    point.x > RAIL_MAX_X ||
    point.y < RAIL_MIN_Y ||
    point.y > RAIL_MAX_Y
  ) {
    return false;
  }

  for (const pocket of POCKETS) {
    if (Math.hypot(point.x - pocket.x, point.y - pocket.y) <= POCKET_CAPTURE_RADIUS) {
      return false;
    }
  }

  for (const ball of activeTargetBalls) {
    if (Math.hypot(point.x - ball.x, point.y - ball.y) <= 2 * BALL_RADIUS) {
      return false;
    }
  }

  return true;
}

export function findSafeCuePosition(activeTargetBalls: readonly Ball[]): CueSpot | null {
  if (isLegalCuePosition(INITIAL_CUE_BALL, activeTargetBalls)) {
    return INITIAL_CUE_BALL;
  }

  for (let ring = 1; ring <= MAX_SEARCH_RING; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const candidate: CueSpot = {
          x: INITIAL_CUE_BALL.x + dx * SEARCH_STEP,
          y: INITIAL_CUE_BALL.y + dy * SEARCH_STEP,
        };
        if (isLegalCuePosition(candidate, activeTargetBalls)) {
          return candidate;
        }
      }
    }
  }

  return null;
}
