---
title: "Bench Physics"
subtitle: "A lab workbook for ages 16 to 18"
---

# The period of a pendulum {kicker="Unit 4 · Oscillations · Lab sheet 4.2" lead="Two pendulums of the same length, released from 10° and from 80°. Time both on video and find out whether the period depends on the size of the swing."}

:::callout{type="aim" title="Aim"}
To measure the period of a pendulum 1.00 m long from two video clips, and to find out how far the small-angle formula can be trusted.

**You need** the two clips, a phone or a screen to play them, and a calculator.
:::

## The two clips

:ref{id="small"} and :ref{id="large"} were rendered from a numerical solution of the pendulum’s equation of motion, θ″ = −(*g*/*L*) sin θ, worked out in steps of one millisecond for a pendulum 1.00 m long. Each clip lasts 8.00 s at 25 frames per second, so one frame is 0.04 s. There is no air resistance in the model, so the swings never die away.

The still printed for each clip is its first frame, and the code in its corner opens the clip itself. Scan it with a phone, or play the clips in the screen edition of this workbook. Both clips loop, start with the sound off and have a speed menu: slow them to half speed when you count.

## Background

A simple pendulum is a small heavy bob on a light string that does not stretch. Pulled aside and let go, it swings to and fro through its lowest point. The **period**, *T*, is the time it takes to go out and come back to where it started.

Galileo noticed that a pendulum keeps the same period as its swings die away, and clockmakers relied on that for three hundred years. For small swings the period depends only on the length *L* and on the gravitational field strength *g*:

:::paragraphs{style="formula"}
*T*~0~ = 2π (*L*/*g*)^1/2^
:::

With *L* = 1.00 m and *g* = 9.81 m s^−2^, the formula gives *T*~0~ = 2.006 s. Its derivation replaces sin θ by θ in radians, which is within 1 % of the truth only up to about 14°. Past that, the pull back towards the middle grows more slowly than the angle, the bob lingers near the turning points and every swing takes a little longer. With the amplitude θ~0~, the angle the bob is released from, and *K*, the complete elliptic integral of the first kind, the exact period is

:::paragraphs{style="formula"}
*T* = 4 (*L*/*g*)^1/2^ *K*(sin ½θ~0~)
:::

## Method

:::callout{type="method"}
1. Play the first clip from the start. The bob is let go from rest in the first frame.
2. Count the complete swings, out and back to the release point, until the clip ends at 8.00 s. Estimate the last one to a quarter of a swing.
3. Divide 8.00 s by the number of swings to find the period.
4. Repeat for the second clip and fill in the table below.
:::

## Results

::resource{id="data"}

The values in :ref{id="periods"} come from the exact formula, worked out to three decimals. Compare your periods with the rows for 10° and 80°.

::resource{id="periods"}

## Questions

:::callout{type="sheet"}
1. Which clip has the longer period, and by what percentage?

:::callout{type="answer"}
Answer
:::space{lines=3}
:::

2. The bob in the second clip travels a much longer arc. Why does its period not grow in the same proportion?

:::callout{type="answer"}
Answer
:::space{lines=4}
:::

3. The first correction to the small-angle formula gives *T* = *T*~0~ (1 + θ~0~^2^/16), with θ~0~ in radians. Work it out at 80° and compare it with the table. Is one term enough?

:::callout{type="answer"}
Answer
:::space{lines=4}
:::

4. A long-case clock swings 4° either side of the vertical. Would its maker need the exact formula?

:::callout{type="answer"}
Answer
:::space{lines=3}
:::
:::

:::paragraphs{style="colophon"}
Bench Physics, lab sheet 4.2 · Set in Source Serif 4, Red Hat Display and Red Hat Mono (SIL Open Font License) · Text and clips: Postext Cookbook, CC BY 4.0.
:::
