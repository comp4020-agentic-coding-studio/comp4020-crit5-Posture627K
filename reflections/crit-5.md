# Crit 5 reflection

The breakthrough was splitting the physics and game-state rules into small,
pure functions with no DOM in them at all, tested completely on their own
before I ever wired up a clickable table. That gave me a simulation I actually
trusted going in. But the real turning point came later, once the whole thing
was playable and I sat down and just played it: green tests and a game that
feels right are not the same claim. My friction tests were passing and correct
on their own terms, and still wrong to play against --- dragging the cue ball
myself, I could see it visibly sitting there "still moving" after it looked
stopped. No assertion caught that; only actually playing it did. The same
happened with a pocketed target ball, which just stayed frozen near the pocket
with no feedback that it was gone, and with not being sure where to click
first. The friction fix and the cue-ball respot logic were things I could turn
back into deterministic tests once I understood what was wrong; the pocket
animation and the first-move arrow weren't --- there's no assertion for "does
this look right," so those I could only judge by eye in the browser.

What this changed is how much weight I put on "it passes." I used to treat a
green check as basically done; now I treat it as the floor that lets me stop
worrying about regressions, not the ceiling that tells me the game is any
good. I also want to be straight about the history here: this was my own
manual testing, not a stranger sitting down cold, so I'm treating it as a
first pass rather than proof the game reads clearly to someone who's never
seen it.
