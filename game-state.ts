// Pure game-state rule for Six Pockets: shot count, win/loss transition.
// DOM-free and deterministic --- no rendering, no ball positions, no physics.

export type GameStatus = "in-progress" | "won" | "lost";

export interface GameState {
  readonly shotsRemaining: number;
  readonly targetBallsRemaining: number;
  readonly status: GameStatus;
}

export const STARTING_SHOTS = 10;
export const STARTING_TARGET_BALLS = 3;

export function createInitialState(): GameState {
  return {
    shotsRemaining: STARTING_SHOTS,
    targetBallsRemaining: STARTING_TARGET_BALLS,
    status: "in-progress",
  };
}

// Records one completed shot, consuming a shot and pocketing `ballsPocketed`
// target balls. Win is checked before loss: a shot that pockets the last
// target ball on the last available shot is a win, not a loss.
export function completeShot(state: GameState, ballsPocketed = 0): GameState {
  if (state.status !== "in-progress") {
    throw new Error("completeShot: the game is already over");
  }
  if (ballsPocketed < 0 || ballsPocketed > state.targetBallsRemaining) {
    throw new Error(
      "completeShot: ballsPocketed must be between 0 and the target balls remaining",
    );
  }

  const shotsRemaining = state.shotsRemaining - 1;
  const targetBallsRemaining = state.targetBallsRemaining - ballsPocketed;

  const status: GameStatus =
    targetBallsRemaining === 0 ? "won" : shotsRemaining === 0 ? "lost" : "in-progress";

  return { shotsRemaining, targetBallsRemaining, status };
}
