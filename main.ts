// Wires the static scaffold to the physics core and the game-state rule.
// One shot: idle -> pointer down on cue ball -> drag to aim/power -> release
// -> simulate -> pocket detection -> rest -> completeShot() exactly once ->
// idle (or game-over once GameState.status leaves "in-progress").

import { completeShot, createInitialState, type GameState } from "./game-state.ts";
import {
  allAtRest,
  INITIAL_CUE_BALL,
  INITIAL_TARGET_BALLS,
  isPocketed,
  resolveBallCollision,
  resolveRailCollision,
  step,
  type Ball,
} from "./physics.ts";
import {
  computeShotVelocity,
  MAX_DRAG_DISTANCE,
  normalizedToRenderPercent,
  pointerToNormalized,
  type Point,
} from "./aim.ts";
import { findSafeCuePosition } from "./respot.ts";

// Large frame gaps (tab switches, paused DevTools) are clamped to this many
// simulated seconds before stepping physics, so a resumed frame can't tunnel
// a ball through a rail or pocket in one giant jump.
const MAX_FRAME_DT_SECONDS = 1 / 20;

// isPocketed() (physics.ts) only reports whether a ball is captured, not by
// which pocket --- so the pocketing effect below animates in place (scale +
// fade at the ball's last simulated position) rather than moving toward a
// pocket centre the code doesn't have.
const POCKET_ANIMATION_DURATION_MS = 300;

type Phase = "idle" | "aiming" | "simulating" | "game-over";

interface TargetBallEntry {
  ball: Ball;
  readonly el: HTMLElement;
  active: boolean;
  pocketAnimation: Animation | null;
}

const tableEl = document.querySelector<HTMLElement>(".table")!;
const cueEl = document.querySelector<HTMLElement>(".ball--cue")!;
const aimLineEl = document.querySelector<HTMLElement>(".aim-line")!;
const hudStatusEl = document.querySelector<HTMLElement>(".hud-status")!;
const targetEls = [1, 2, 3].map(
  (n) => document.querySelector<HTMLElement>(`.ball--target-${n}`)!,
);
const resetCueBallButton = document.querySelector<HTMLButtonElement>(".reset-cue-ball-button")!;
const resetBoardButton = document.querySelector<HTMLButtonElement>(".reset-board-button")!;
const firstMoveCueEl = document.querySelector<HTMLElement>(".first-move-cue")!;

let gameState: GameState = createInitialState();
let phase: Phase = "idle";

let cueBall: Ball = INITIAL_CUE_BALL;
let cueActive = true;

const targetBalls: TargetBallEntry[] = INITIAL_TARGET_BALLS.map((ball, i) => ({
  ball,
  el: targetEls[i]!,
  active: true,
  pocketAnimation: null,
}));

let ballsPocketedThisShot = 0;

let currentPointerId: number | null = null;
let currentPointer: Point | null = null;

// Whether the decorative first-move arrow (pointing at the cue ball) should
// be shown. True after initial setup and after Reset Board; false once the
// player begins a valid cue-ball aiming gesture. Reset Cue Ball leaves this
// untouched --- only a full Reset Board restores it.
let showFirstMoveCue = true;
let firstMoveCueTimer: ReturnType<typeof setTimeout> | null = null;

// Auto-hides on its own if the player does nothing, so it never lingers
// indefinitely or has to be repeatedly re-shown during normal play.
const FIRST_MOVE_CUE_AUTO_HIDE_MS = 2500;

// Measures the table's content box (excludes the border, which sits outside
// the box that `left%`/`top%` are resolved against) in viewport pixels, and
// the pixels-per-normalized-unit scale (isotropic: the table's rendered 2/1
// aspect ratio matches TABLE_WIDTH/TABLE_HEIGHT, so one scale serves both axes).
function getTableMetrics(): { contentLeft: number; contentTop: number; pxPerUnit: number } {
  const rect = tableEl.getBoundingClientRect();
  const style = getComputedStyle(tableEl);
  const borderLeft = parseFloat(style.borderLeftWidth);
  const borderTop = parseFloat(style.borderTopWidth);
  return {
    contentLeft: rect.left + borderLeft,
    contentTop: rect.top + borderTop,
    pxPerUnit: tableEl.clientWidth,
  };
}

function pointerEventToNormalized(e: PointerEvent): Point {
  const { contentLeft, contentTop, pxPerUnit } = getTableMetrics();
  return pointerToNormalized(e.clientX - contentLeft, e.clientY - contentTop, pxPerUnit);
}

function applyBallPosition(el: HTMLElement, ball: Ball): void {
  const { leftPercent, topPercent } = normalizedToRenderPercent(ball);
  el.style.left = `${leftPercent}%`;
  el.style.top = `${topPercent}%`;
}

function updateAimLine(): void {
  if (phase !== "aiming" || currentPointer === null) {
    aimLineEl.style.display = "none";
    return;
  }

  const dx = currentPointer.x - cueBall.x;
  const dy = currentPointer.y - cueBall.y;
  const distance = Math.hypot(dx, dy);
  const clampedDistance = Math.min(distance, MAX_DRAG_DISTANCE);
  const angle = Math.atan2(dy, dx);
  const { pxPerUnit } = getTableMetrics();
  const { leftPercent, topPercent } = normalizedToRenderPercent(cueBall);

  aimLineEl.style.left = `${leftPercent}%`;
  aimLineEl.style.top = `${topPercent}%`;
  aimLineEl.style.width = `${clampedDistance * pxPerUnit}px`;
  aimLineEl.style.transform = `rotate(${angle}rad)`;
  aimLineEl.style.display = "block";
}

// Reset Cue Ball only makes sense once the cue ball is actually missing from
// the table: no shot is in flight, there's a game left to keep playing, and
// the cue ball is currently pocketed/inactive (cueActive false is the only
// representation this code has for "cue ball off the table").
function canResetCueBall(): boolean {
  return phase === "idle" && gameState.status === "in-progress" && !cueActive;
}

function render(): void {
  cueEl.style.display = cueActive ? "" : "none";
  if (cueActive) {
    applyBallPosition(cueEl, cueBall);
  }
  for (const target of targetBalls) {
    if (target.active) {
      applyBallPosition(target.el, target.ball);
    }
  }
  updateAimLine();
  resetCueBallButton.disabled = !canResetCueBall();
  firstMoveCueEl.hidden = !showFirstMoveCue;
  cueEl.classList.toggle("ball--cue--emphasis", showFirstMoveCue);
}

// Arms the first-move arrow and its bounded auto-hide timer. Called on
// initial setup and from resetBoard(); never from resetCueBall().
function showFirstMoveCueAffordance(): void {
  if (firstMoveCueTimer !== null) {
    clearTimeout(firstMoveCueTimer);
  }
  showFirstMoveCue = true;
  firstMoveCueTimer = setTimeout(() => {
    showFirstMoveCue = false;
    firstMoveCueTimer = null;
    render();
  }, FIRST_MOVE_CUE_AUTO_HIDE_MS);
}

// Dismisses the first-move arrow immediately, e.g. once the player begins a
// real aiming gesture, cancelling any pending auto-hide timer.
function hideFirstMoveCueAffordance(): void {
  if (firstMoveCueTimer !== null) {
    clearTimeout(firstMoveCueTimer);
    firstMoveCueTimer = null;
  }
  showFirstMoveCue = false;
}

// One-shot scale-down + fade-out at the ball's frozen on-screen position.
// `fill: "forwards"` holds the last keyframe (invisible, zero scale) once the
// animation ends, instead of reverting to the element's normal CSS style.
function playPocketAnimation(target: TargetBallEntry): void {
  target.pocketAnimation = target.el.animate(
    [
      { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
      { transform: "translate(-50%, -50%) scale(0)", opacity: 0 },
    ],
    { duration: POCKET_ANIMATION_DURATION_MS, easing: "ease-in", fill: "forwards" },
  );
}

function updateHud(): void {
  if (gameState.status === "won") {
    hudStatusEl.textContent = "You win!";
  } else if (gameState.status === "lost") {
    hudStatusEl.textContent = "Out of shots — you lose.";
  } else {
    hudStatusEl.textContent = `Shots left: ${gameState.shotsRemaining}`;
  }
}

// One completed shot is finalized exactly once, from the single call site
// where the "simulating" phase transitions away (see simulateFrame below) ---
// no other code path calls completeShot().
function finalizeShot(): void {
  gameState = completeShot(gameState, ballsPocketedThisShot);
  ballsPocketedThisShot = 0;
  phase = gameState.status === "in-progress" ? "idle" : "game-over";
  updateHud();
}

// Per-frame orchestration, in this exact order:
//   1. integrate position + apply friction (physics `step`)
//   2. rail collision resolution
//   3. ball-ball collision resolution
//   4. target-ball pocket detection
//   5. cue-ball pocket detection
//   6. rest detection --- finalizes the shot; a pocketed cue ball stays off
//      the table (cueActive false) until the player uses Reset Cue Ball,
//      which is the only path back (see canResetCueBall/resetCueBall)
// Rendering (7) happens once per animation frame regardless of phase, in tick().
function simulateFrame(dt: number): void {
  if (cueActive) cueBall = step(cueBall, dt);
  for (const target of targetBalls) {
    if (target.active) target.ball = step(target.ball, dt);
  }

  if (cueActive) cueBall = resolveRailCollision(cueBall);
  for (const target of targetBalls) {
    if (target.active) target.ball = resolveRailCollision(target.ball);
  }

  const activeRefs: { get: () => Ball; set: (b: Ball) => void }[] = [];
  if (cueActive) {
    activeRefs.push({ get: () => cueBall, set: (b) => (cueBall = b) });
  }
  for (const target of targetBalls) {
    if (target.active) {
      activeRefs.push({ get: () => target.ball, set: (b) => (target.ball = b) });
    }
  }
  for (let i = 0; i < activeRefs.length; i++) {
    for (let j = i + 1; j < activeRefs.length; j++) {
      const [a, b] = resolveBallCollision(activeRefs[i]!.get(), activeRefs[j]!.get());
      activeRefs[i]!.set(a);
      activeRefs[j]!.set(b);
    }
  }

  for (const target of targetBalls) {
    if (target.active && isPocketed(target.ball)) {
      target.active = false;
      ballsPocketedThisShot++;
      playPocketAnimation(target);
    }
  }

  if (cueActive && isPocketed(cueBall)) {
    cueActive = false;
  }

  const stillActiveBalls: Ball[] = [];
  if (cueActive) stillActiveBalls.push(cueBall);
  for (const target of targetBalls) {
    if (target.active) stillActiveBalls.push(target.ball);
  }

  if (allAtRest(stillActiveBalls)) {
    finalizeShot();
  }
}

function beginAim(e: PointerEvent): void {
  if (gameState.status !== "in-progress" || phase !== "idle") return;
  cueEl.setPointerCapture(e.pointerId);
  currentPointerId = e.pointerId;
  currentPointer = pointerEventToNormalized(e);
  phase = "aiming";
  hideFirstMoveCueAffordance();
}

function updateAim(e: PointerEvent): void {
  if (phase !== "aiming" || e.pointerId !== currentPointerId) return;
  currentPointer = pointerEventToNormalized(e);
}

function endAim(e: PointerEvent): void {
  if (phase !== "aiming" || e.pointerId !== currentPointerId) return;
  cueEl.releasePointerCapture(e.pointerId);
  const pointer = pointerEventToNormalized(e);
  currentPointerId = null;
  currentPointer = null;

  const shot = computeShotVelocity(cueBall, pointer);
  if (shot) {
    cueBall = { ...cueBall, vx: shot.vx, vy: shot.vy };
    ballsPocketedThisShot = 0;
    phase = "simulating";
  } else {
    phase = "idle";
  }
}

function cancelAim(e: PointerEvent): void {
  if (e.pointerId !== currentPointerId) return;
  currentPointerId = null;
  currentPointer = null;
  phase = "idle";
}

// Recovers only the cue ball: no shot is consumed or added, target-ball
// positions/active state, shots remaining, and game status are untouched.
// findSafeCuePosition (respot.ts) tries INITIAL_CUE_BALL first, then
// deterministically searches outward for a nearby spot clear of every active
// target ball and every pocket. If it finds no legal position at all, this
// does nothing --- cueActive stays false and the ball stays off the table
// --- rather than falling back to a position it just determined is unsafe.
function resetCueBall(): void {
  if (!canResetCueBall()) return;
  const activeTargetBalls = targetBalls.filter((target) => target.active).map((target) => target.ball);
  const safePosition = findSafeCuePosition(activeTargetBalls);
  if (safePosition === null) return;
  cueBall = { x: safePosition.x, y: safePosition.y, vx: 0, vy: 0 };
  cueActive = true;
  render();
}

// Cancels any in-flight gesture or simulation without ever calling
// completeShot() --- the interrupted shot is discarded, not counted --- then
// restores every piece of mutable state to the same values createInitialState()
// and the initial ball layouts produce on a fresh page load.
function resetBoard(): void {
  if (currentPointerId !== null) {
    try {
      cueEl.releasePointerCapture(currentPointerId);
    } catch {
      // Capture may already be released; nothing to clean up.
    }
  }

  // The rAF loop (see tick() below) stops rescheduling itself once phase
  // reaches "game-over", so a reset from that phase must explicitly restart
  // it --- otherwise the board would repaint once here and then never again.
  const loopStopped = phase === "game-over";

  gameState = createInitialState();
  cueBall = INITIAL_CUE_BALL;
  cueActive = true;
  targetBalls.forEach((target, i) => {
    // cancel() (rather than letting it finish or just clearing the
    // reference) immediately removes the fill-forwards effect, so a
    // mid-fade ball snaps straight back to its normal, fully visible style
    // instead of finishing its animation or staying invisible.
    target.pocketAnimation?.cancel();
    target.pocketAnimation = null;
    target.ball = INITIAL_TARGET_BALLS[i]!;
    target.active = true;
  });
  ballsPocketedThisShot = 0;
  currentPointerId = null;
  currentPointer = null;
  phase = "idle";
  showFirstMoveCueAffordance();

  updateHud();
  render();

  if (loopStopped) {
    lastTimestamp = null;
    requestAnimationFrame(tick);
  }
}

cueEl.addEventListener("pointerdown", beginAim);
cueEl.addEventListener("pointermove", updateAim);
cueEl.addEventListener("pointerup", endAim);
cueEl.addEventListener("pointercancel", cancelAim);
resetCueBallButton.addEventListener("click", resetCueBall);
resetBoardButton.addEventListener("click", resetBoard);

let lastTimestamp: number | null = null;

function tick(timestamp: number): void {
  if (lastTimestamp !== null) {
    const rawDt = (timestamp - lastTimestamp) / 1000;
    const dt = Math.min(rawDt, MAX_FRAME_DT_SECONDS);
    if (phase === "simulating") {
      simulateFrame(dt);
    }
    render();
  }
  lastTimestamp = timestamp;
  if (phase !== "game-over") {
    requestAnimationFrame(tick);
  }
}

updateHud();
showFirstMoveCueAffordance();
render();
requestAnimationFrame(tick);
