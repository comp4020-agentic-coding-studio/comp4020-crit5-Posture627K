import { describe, expect, it } from "vitest";
import { completeShot, createInitialState } from "./game-state.ts";

describe("createInitialState", () => {
  it("starts in progress with 10 shots and 3 target balls", () => {
    expect(createInitialState()).toEqual({
      shotsRemaining: 10,
      targetBallsRemaining: 3,
      status: "in-progress",
    });
  });
});

describe("completeShot", () => {
  it("consumes one shot and stays in progress when no ball is pocketed", () => {
    const state = completeShot(createInitialState());
    expect(state).toEqual({
      shotsRemaining: 9,
      targetBallsRemaining: 3,
      status: "in-progress",
    });
  });

  it("wins once the last target ball is pocketed", () => {
    let state = createInitialState();
    state = completeShot(state, 1);
    state = completeShot(state, 1);
    state = completeShot(state, 1);
    expect(state).toEqual({
      shotsRemaining: 7,
      targetBallsRemaining: 0,
      status: "won",
    });
  });

  it("loses once shots run out with a target ball still remaining", () => {
    let state = createInitialState();
    for (let i = 0; i < 10; i++) {
      state = completeShot(state);
    }
    expect(state).toEqual({
      shotsRemaining: 0,
      targetBallsRemaining: 3,
      status: "lost",
    });
  });

  it("wins rather than loses when the final ball is pocketed on the final shot", () => {
    let state: ReturnType<typeof createInitialState> = {
      shotsRemaining: 1,
      targetBallsRemaining: 1,
      status: "in-progress",
    };
    state = completeShot(state, 1);
    expect(state).toEqual({
      shotsRemaining: 0,
      targetBallsRemaining: 0,
      status: "won",
    });
  });

  it("rejects a shot taken after the game is already over", () => {
    const won = { shotsRemaining: 5, targetBallsRemaining: 0, status: "won" as const };
    expect(() => completeShot(won)).toThrow("already over");
  });

  it("rejects pocketing more balls than remain", () => {
    expect(() => completeShot(createInitialState(), 4)).toThrow("must be between 0");
  });
});
