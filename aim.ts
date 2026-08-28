// Pure helpers for the pull-back aiming gesture: converting pointer pixel
// coordinates into the physics module's normalized coordinate system, and
// turning a drag vector into a cue-ball shot velocity. DOM-free, deterministic.
//
// These are gameplay-feel constants for the *input* layer only --- they do
// not change anything in physics.ts.

import { TABLE_HEIGHT } from "./physics.ts";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Velocity {
  readonly vx: number;
  readonly vy: number;
}

// Drags shorter than this (in normalized table-width units) cancel the shot
// with no shot consumed --- distinguishes "grabbed the ball" from "aimed".
export const MIN_DRAG_DISTANCE = 0.02;

// Drags at or beyond this distance are clamped to maximum power.
export const MAX_DRAG_DISTANCE = 0.3;

// Cue-ball speed (table-widths per second) at MAX_DRAG_DISTANCE or beyond.
export const MAX_SHOT_SPEED = 0.6;

// Converts a pointer position, already measured relative to the table's
// content-box origin in pixels, into the normalized coordinate system
// (TABLE_WIDTH = 1, TABLE_HEIGHT = 0.5). Both axes share the same
// pixels-per-unit scale, since the table's rendered aspect ratio (2/1)
// matches TABLE_WIDTH/TABLE_HEIGHT.
export function pointerToNormalized(localX: number, localY: number, pxPerUnit: number): Point {
  return { x: localX / pxPerUnit, y: localY / pxPerUnit };
}

// Converts a normalized position back into the CSS percentages used by the
// rendered `.ball` elements (`left: x%`, `top: y%` of the table).
export function normalizedToRenderPercent(point: Point): { leftPercent: number; topPercent: number } {
  return { leftPercent: point.x * 100, topPercent: (point.y / TABLE_HEIGHT) * 100 };
}

// Pull-back convention: the shot direction is FROM the pointer TOWARD the
// cue ball (dragging away from where you want to shoot pulls the cue back).
// Drag distance below MIN_DRAG_DISTANCE cancels the shot (returns null).
// Distance is clamped to MAX_DRAG_DISTANCE and mapped linearly to
// [0, MAX_SHOT_SPEED].
export function computeShotVelocity(ballPos: Point, pointerPos: Point): Velocity | null {
  const dx = ballPos.x - pointerPos.x;
  const dy = ballPos.y - pointerPos.y;
  const dragDistance = Math.hypot(dx, dy);

  if (dragDistance < MIN_DRAG_DISTANCE) {
    return null;
  }

  const clampedDistance = Math.min(dragDistance, MAX_DRAG_DISTANCE);
  const speed = (clampedDistance / MAX_DRAG_DISTANCE) * MAX_SHOT_SPEED;
  const nx = dx / dragDistance;
  const ny = dy / dragDistance;

  return { vx: nx * speed, vy: ny * speed };
}
