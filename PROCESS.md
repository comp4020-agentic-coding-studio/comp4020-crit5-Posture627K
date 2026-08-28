# Process overview

## What I built

Six Pockets is a tiny browser pool game: drag back from the cue ball to aim
and set power, release to take the shot, and sink three target balls before a
limited number of shots runs out. It's a static HTML/CSS/TypeScript site (no
framework) built on two pure, DOM-free modules --- a physics core (motion,
friction, rail and ball collisions, pocket capture) and a game-state rule
(shot count, win/loss) --- each with its own focused Vitest suite, then wired
to pointer input and rendering in `main.ts`.

## The moments that mattered

1. **Pure core before any interaction existed.** Rather than writing aiming,
   rendering and physics tangled together in `main.ts` from the start, I built
   the physics and game-state rules as plain functions with no DOM dependency
   at all, each with its own test file, and only wired them into `main.ts`
   afterwards. That meant collision, rail and pocket-capture math could be
   checked directly in Vitest, with nothing running in a browser yet.
   [`ce61d305...e7e0d9f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-Posture627K/compare/ce61d305...e7e0d9f)

2. **Green friction tests, wrong-feeling game.** Once the whole game was wired
   up and playable, I actually dragged the cue ball and watched shots roll ---
   and they visibly looked stopped well before the simulation agreed a ball
   was at rest; the old proportional-decay model only approached zero speed
   asymptotically, so it kept a long, barely-visible "still technically
   moving" tail. The existing tests were passing and correctly establishing
   properties like frame-rate-independent decay and bounded settling time ---
   they just weren't testing for the thing that mattered here: whether the
   tail was short enough to look stopped to a person watching it. Instead of
   loosening a threshold to hide the symptom, I replaced the model with a
   constant deceleration, so a ball's speed reaches exactly zero in finite
   time (`v0 / FRICTION_DECELERATION` seconds), and added tests asserting
   exactly that for representative shot speeds. I only trusted it once I'd
   re-played the actual table and the stops looked instant rather than
   trailing off.
   [`22b190d...af06836`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-Posture627K/compare/22b190d...af06836)

3. **Playing the finished artefact turned up problems no unit test could
   have.** Manually running the game surfaced three separate rough edges: play
   got awkward once the cue ball was pocketed, a pocketed target ball became
   inactive but stayed visibly frozen near the pocket with no feedback that it
   was gone (inactive target balls were simply skipped during render, so they
   never moved or disappeared), and it wasn't obvious the cue ball was the
   first thing to interact with. I added Reset Cue Ball / Reset Board with a
   deterministic safe-respot search (unit-tested directly, since the
   legality/search logic is a pure function --- including the case where no
   legal spot exists), a short scale/fade pocket animation so a sunk ball
   visibly leaves the table, and a purely decorative arrow plus a temporary
   emphasis ring pointing at the cue ball, deliberately with no instructional
   text, per the course's no-tutorial constraint. I judged the animation
   timing and the arrow's visibility by eye, in the browser, at both
   viewports --- that part isn't something a test can decide for me. All of it
   landed in one commit: `main.ts` was a four-line stub right up until this
   commit, so there's no earlier integration milestone to split it against ---
   one honest commit, not an invented sequence of smaller ones.
   [`af06836`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-Posture627K/commit/af06836)
