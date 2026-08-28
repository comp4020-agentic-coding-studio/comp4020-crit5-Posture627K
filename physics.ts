// Pure, viewport-independent physics core for Six Pockets. DOM-free and
// deterministic --- no rendering, no pointer input, no game rules.
//
// Coordinate system: the table is 1.0 unit wide and 0.5 units tall (matching
// the rendered table's 2/1 aspect ratio in styles.css), with both axes in
// the SAME unit (a fraction of table width) so distances and circles behave
// correctly. x maps directly from CSS `left%` (x = left% / 100); y maps from
// CSS `top%` compressed into the same unit (y = (top% / 100) * TABLE_HEIGHT).
//
// Time contract: every `dt` in this module is elapsed time in SECONDS.
// Velocity (vx, vy) is therefore in table-widths per second. Passing the
// real elapsed time between frames (however that's measured) keeps the
// simulation frame-rate independent --- see FRICTION_DECELERATION below.

export interface Ball {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

export interface Pocket {
  readonly x: number;
  readonly y: number;
}

// Table geometry, derived from the rendered table's CSS (styles.css: `.table`
// is aspect-ratio 2/1; `.pocket` is 7% of table width; `.ball` is 6%).
export const TABLE_WIDTH = 1;
export const TABLE_HEIGHT = 0.5;

export const BALL_RADIUS = 0.03;

// The pocket's actual visible radius --- half of the CSS `.pocket` diameter
// (7% of table width), in the same normalized units as everything else here.
export const POCKET_RADIUS = 0.035;

// Capture threshold: two circles overlap exactly when the distance between
// their centres is no more than the sum of their radii. A rail-clamped ball's
// centre can get no closer to a corner pocket than (RAIL_MIN_X, RAIL_MIN_Y)
// --- a diagonal distance of BALL_RADIUS * sqrt(2) from the corner (RAIL_MIN_X
// = RAIL_MIN_Y = BALL_RADIUS, below). POCKET_RADIUS + BALL_RADIUS (≈0.065)
// comfortably exceeds that (≈0.042), so every corner pocket is reachable ---
// derived from the two actual radii, not an arbitrary multiplier.
export const POCKET_CAPTURE_RADIUS = POCKET_RADIUS + BALL_RADIUS;

// Six pockets: four corners and two side-mid pockets, matching
// .pocket--top-left/top-mid/top-right/bottom-left/bottom-mid/bottom-right.
export const POCKETS: readonly Pocket[] = [
  { x: 0, y: 0 },
  { x: TABLE_WIDTH / 2, y: 0 },
  { x: TABLE_WIDTH, y: 0 },
  { x: 0, y: TABLE_HEIGHT },
  { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT },
  { x: TABLE_WIDTH, y: TABLE_HEIGHT },
];

// Playable rail bounds: a ball's centre stays one radius inside each edge, so
// its rendered edge (not its centre) is what touches the rail.
export const RAIL_MIN_X = BALL_RADIUS;
export const RAIL_MAX_X = TABLE_WIDTH - BALL_RADIUS;
export const RAIL_MIN_Y = BALL_RADIUS;
export const RAIL_MAX_Y = TABLE_HEIGHT - BALL_RADIUS;

// Constant deceleration (table-widths per second^2) applied opposite the
// ball's direction of travel, modelling rolling friction the way a real
// table does: speed decreases at a fixed rate and reaches EXACTLY zero in
// finite time (v0 / FRICTION_DECELERATION seconds), rather than asymptotically
// approaching it. This deliberately replaces an earlier proportional
// (exponential) decay model, whose speed never truly reached zero --- only
// approached it in a long, decreasingly-visible tail that kept isAtRest()
// reporting "still moving" long after a ball looked stopped on screen.
// Frame-rate independent: a fixed deceleration integrates the same total
// speed loss over an elapsed dt regardless of how that dt is subdivided
// (0.2 units/sec of speed lost per second, however many steps it's split into).
// Chosen so a maximum-power shot (0.6, see aim.ts's MAX_SHOT_SPEED) travels
// close to the full table width before stopping in exactly 3 seconds --- a
// baseline for playability, not final gameplay feel.
export const FRICTION_DECELERATION = 0.2;

// Speed (table-widths per second) at or below which a ball counts as at rest
// rather than asymptotically coasting.
export const REST_SPEED_THRESHOLD = 0.001;

// Starting layout, matching the rendered .ball--cue / .ball--target-* percentages.
export const INITIAL_CUE_BALL: Ball = { x: 0.22, y: 0.25, vx: 0, vy: 0 };
export const INITIAL_TARGET_BALLS: readonly Ball[] = [
  { x: 0.68, y: 0.19, vx: 0, vy: 0 },
  { x: 0.76, y: 0.25, vx: 0, vy: 0 },
  { x: 0.68, y: 0.31, vx: 0, vy: 0 },
];

// dt: elapsed time in seconds.
export function integratePosition(ball: Ball, dt: number): Ball {
  return { ...ball, x: ball.x + ball.vx * dt, y: ball.y + ball.vy * dt };
}

// dt: elapsed time in seconds. Reduces speed by FRICTION_DECELERATION * dt,
// preserving direction, and clamps to exactly zero rather than reversing
// past it or coasting on asymptotically.
export function applyFriction(ball: Ball, dt: number): Ball {
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed === 0) {
    return ball;
  }

  const newSpeed = Math.max(0, speed - FRICTION_DECELERATION * dt);
  if (newSpeed === 0 || newSpeed < REST_SPEED_THRESHOLD) {
    return { ...ball, vx: 0, vy: 0 };
  }

  const scale = newSpeed / speed;
  return { ...ball, vx: ball.vx * scale, vy: ball.vy * scale };
}

// One physics step: move by the current velocity, then let friction act on
// velocity for the next step, both scaled by the same elapsed dt (seconds).
export function step(ball: Ball, dt: number): Ball {
  return applyFriction(integratePosition(ball, dt), dt);
}

export function isAtRest(ball: Ball): boolean {
  return Math.hypot(ball.vx, ball.vy) <= REST_SPEED_THRESHOLD;
}

export function allAtRest(balls: readonly Ball[]): boolean {
  return balls.every(isAtRest);
}

// Reflects a ball off whichever rail(s) it has crossed, clamping its centre
// back inside the playable bounds.
export function resolveRailCollision(ball: Ball): Ball {
  let { x, y, vx, vy } = ball;

  if (x < RAIL_MIN_X) {
    x = RAIL_MIN_X;
    vx = -vx;
  } else if (x > RAIL_MAX_X) {
    x = RAIL_MAX_X;
    vx = -vx;
  }

  if (y < RAIL_MIN_Y) {
    y = RAIL_MIN_Y;
    vy = -vy;
  } else if (y > RAIL_MAX_Y) {
    y = RAIL_MAX_Y;
    vy = -vy;
  }

  return { x, y, vx, vy };
}

// Equal-mass elastic collision: when two balls are touching or overlapping,
// swap the velocity components along the line of centres; components
// tangential to that line are untouched. Balls that are not touching are
// returned unchanged.
export function resolveBallCollision(a: Ball, b: Ball): [Ball, Ball] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);

  if (distance === 0 || distance > 2 * BALL_RADIUS) {
    return [a, b];
  }

  const nx = dx / distance;
  const ny = dy / distance;

  const aNormalSpeed = a.vx * nx + a.vy * ny;
  const bNormalSpeed = b.vx * nx + b.vy * ny;

  const aTangentVx = a.vx - aNormalSpeed * nx;
  const aTangentVy = a.vy - aNormalSpeed * ny;
  const bTangentVx = b.vx - bNormalSpeed * nx;
  const bTangentVy = b.vy - bNormalSpeed * ny;

  return [
    { ...a, vx: aTangentVx + bNormalSpeed * nx, vy: aTangentVy + bNormalSpeed * ny },
    { ...b, vx: bTangentVx + aNormalSpeed * nx, vy: bTangentVy + aNormalSpeed * ny },
  ];
}

// A ball is captured once its circle overlaps a pocket's circle: centre-to-
// centre distance <= POCKET_CAPTURE_RADIUS (the sum of the pocket's visible
// radius and the ball's radius).
export function isPocketed(ball: Ball): boolean {
  return POCKETS.some(
    (pocket) => Math.hypot(ball.x - pocket.x, ball.y - pocket.y) <= POCKET_CAPTURE_RADIUS,
  );
}
