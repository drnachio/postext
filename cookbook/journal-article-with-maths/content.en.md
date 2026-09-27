---
title: "The period of a pendulum at large amplitudes"
author: "Marta Oyelaran, Tomás Heikkinen and Priya Anand"
publishDate: "18 September 2026"
---

# The period of a pendulum \\ at large amplitudes {style="article" kicker="Research article · Classical mechanics" authors="Marta Oyelaran¹, Tomás Heikkinen² and Priya Anand¹" affiliations="¹ Department of Physics, Northgate College, Dunmore · ² Horology Workshop, Harrow Hill Institute" received="12 March 2026" accepted="30 June 2026"}

:::callout{type="abstract"}
Every textbook gives the period of a pendulum as $T_0 = 2\pi\sqrt{L/g}$ and adds that it holds for small swings. We ask how small. The exact period, written with a complete elliptic integral and computed in three lines with the arithmetic–geometric mean, is longer than the textbook value by 0.19% at 10°, 1.7% at 30° and 18% at 90°. A one-metre pendulum timed with a photogate at amplitudes from 5° to 90° follows the exact curve to within 0.08%, the limit set by reading the amplitude. We give the series a student can check by hand, and a rule of thumb for the teaching laboratory.

:::paragraphs{style="keywords"}
**Keywords** :chip[pendulum]{style="keyword"} :chip[elliptic integral]{style="keyword"} :chip[arithmetic–geometric mean]{style="keyword"} :chip[photogate]{style="keyword"}
:::
:::

## Introduction

Galileo is said to have noticed that a lamp swinging on a long chain seems to take the same time over every swing, wide or narrow, and in the *Two New Sciences* he stated the rule that textbooks still teach: the period of a pendulum depends on its length, not on how far it swings [1]. A generation later Huygens, who had invented the pendulum clock in 1656, showed that this is only nearly true [2]. A bob on a circular arc takes longer over a wide swing than over a narrow one, and he fitted his clocks with curved cheeks that made the bob follow a cycloid instead, the one curve on which the period does not depend on the amplitude at all. The cheeks brought errors of their own, however, and clockmakers soon settled for a simpler remedy of keeping the swing of the pendulum small and steady.

A pendulum timed in a teaching laboratory bears out both Galileo’s rule and Huygens’ correction. Every introductory course gives the period as

$$T_0 = 2\pi\sqrt{\frac{L}{g}} \, . \tag{1}$$

Here $L$ is the length from the pivot to the centre of the bob and $g$ the acceleration of free fall. For a one-metre pendulum the formula predicts 2.006 s, and a careful student will find a period close to that. Then someone pulls the bob far out to the side, well past the small angles of the textbook, and the measured period grows. By how much, and from what amplitude the growth matters, is the subject of this article.

In Section 2 we derive the exact period and show how to compute it on a pocket calculator. Section 3 describes a bench experiment with a photogate timer, Section 4 compares the two, and Section 5 turns to the teaching laboratory and to clocks. The geometry and the symbols are those of :ref{id="geometry" style="full"}.

## Theory

### The equation of motion

A bob of mass $m$ on a light rigid rod of length $L$, displaced by an angle $\theta$ from the vertical, feels a torque $-mgL\sin\theta$ about the pivot. We neglect the mass of the rod, the size of the bob and the drag of the air until Section 5. With the moment of inertia $mL^2$, the equation of motion is

$$\ddot\theta + \frac{g}{L}\,\sin\theta = 0 . \tag{2}$$

When the swing is small, $\sin\theta$ can be replaced by $\theta$. Equation (2) then becomes the equation of a harmonic oscillator, with an angular frequency $\omega_0 = \sqrt{g/L}$ and the period $T_0 = 2\pi/\omega_0$ of Eq. (1). Nothing in that solution depends on the amplitude $\theta_0$. This is Galileo’s isochronism, and it is exact only in the limit $\theta_0 \to 0$.

### The exact period

Equation (2) can be integrated once. Multiplying it by $\dot\theta$ and integrating from the turning point, where the bob is momentarily at rest at $\theta = \theta_0$, gives the conservation of energy:

$$\tfrac{1}{2}\,L\,\dot\theta^{2} = g\,(\cos\theta - \cos\theta_0) . \tag{3}$$

Separating the variables and integrating over a quarter of a swing, with the substitution $\sin(\theta/2) = k\sin\phi$ and the modulus $k = \sin(\theta_0/2)$, gives the exact period

$$T = 4\sqrt{\frac{L}{g}}\;K(k) . \tag{4}$$

Here $K$ is the complete elliptic integral of the first kind, as tabulated by Legendre [3] and treated in every course of analysis [4]:

$$K(k) = \int_0^{\pi/2}\frac{d\phi}{\sqrt{1-k^{2}\sin^{2}\phi}} . \tag{5}$$

Since $K(0) = \pi/2$, the small-amplitude limit gives back $T_0$. The ratio $T/T_0 = 2K(k)/\pi$ depends on the amplitude alone, so everything that follows holds for a pendulum of any length.

Elliptic integrals have a reputation for needing tables, but Gauss found that $K$ follows from the arithmetic–geometric mean. Start from $a_0 = 1$ and $b_0 = \cos(\theta_0/2)$, and repeat $a_{n+1} = (a_n + b_n)/2$ and $b_{n+1} = \sqrt{a_n b_n}$ until the two agree. Their common limit $M$ gives

$$T = \frac{T_0}{M\bigl(1,\,\cos(\theta_0/2)\bigr)} . \tag{6}$$

The iteration converges so fast that three steps, three rows of a spreadsheet, give ten correct digits even at 90° [5].

### The series in the amplitude

Expanding $K$ in powers of the amplitude gives the series of the classic texts [4,6], with $\theta_0$ in radians:

$$T = T_0\left(1 + \frac{\theta_0^{2}}{16} + \frac{11\,\theta_0^{4}}{3072} + \cdots\right) . \tag{7}$$

The next term is $173\,\theta_0^6/737\,280$, but the first correction alone is worth remembering. It says that the true period exceeds the textbook one by 1% when $\theta_0^2/16 = 0.01$, at 0.4 rad or 23°, and by 0.1% at 7°. For a one-metre pendulum, whose $T_0$ is 2.0059 s, a swing of 30° lasts 2.0408 s: the 35 ms difference adds up to a full second in just under a minute, well within reach of a stopwatch. Timing a pendulum was for two centuries the way to measure $g$ [7], and plotting $T_0^2$ against the length is still a classic exercise: a student who times the bob at an amplitude of 30° will find $g$ too small by 3.4%.

## Method

A brass bob 48 mm across, of mass 0.49 kg, hangs from a steel wire 0.3 mm in diameter, clamped between two hardened jaws so that the pivot is a sharp edge rather than a loop. The effective length, from the edge of the jaws to the centre of the bob, is $L = 1.000 \pm 0.001$ m, and a gravimetric survey of the building gives $g = 9.812$ m s^−2^. With these values the textbook formula predicts 2.0059 s.

A photogate at the bottom of the swing records each passage of the bob to 10 µs. For each amplitude we release the bob from a V-shaped holder set with a protractor, and time it over ten full periods. The amplitude is read again at the end of the run, and we report the mean of the two readings, which are known to ±0.5°. We stop at 90°, where the tension in the wire falls to zero at the turning points. Apart from the timer, the whole apparatus cost less than \$40, most of it for the bob.

## Results

:ref{id="runs" style="full"} lists the measured periods beside the exact prediction of Eq. (6), and :ref{id="period" style="full"} plots both, as the ratio to $T_0$, against the amplitude. The measurements follow the exact curve over the whole range. The residuals scatter on both sides of zero with no trend, and they grow with the amplitude as they should if their source is the reading of the angle: at 60°, an error of 0.5° in $\theta_0$ moves the prediction by 0.1%.

The textbook value, by contrast, falls further behind with every degree. It is only 0.05% short at 5°, but the true period exceeds it by 0.8% at 20°, 7% at 60° and 18% at 90°, where a pendulum that should swing to and fro in two seconds takes 2.37 s. The first two terms of Eq. (7) do far better: they stay within 0.1% up to 40°, and within 1% up to 70°. With its third term as well, Eq. (7) is within 0.01% of the exact period up to 45°, and within 0.4% even at 90°.

## Discussion

For the teaching laboratory the first term of Eq. (7) suggests a rule that needs no radians. Square the amplitude in degrees and divide by 50: the result is the excess of the true period over $T_0$ in parts per thousand. At 30° the rule gives 18 against an exact 17.4, and at 60° it gives 72 against 73.2. At 90° it gives 162 against 180, 10% low.

The period is not the only thing that changes. :ref{id="phase" style="full"} draws the motion in the phase plane, with one closed orbit for each amplitude: Eq. (3) solved for the angular velocity, in units of $\omega_0$. Small swings trace ellipses, round which the state of the pendulum turns at the steady rate $\omega_0$. Wide swings stretch into lemon shapes, flattened above and below, and most of the added period goes on the slow crawl round their ends, where the bob hangs near its turning points with little torque to bring it back. The motion is no longer a cosine either. At 90° a third harmonic of 1.5% of the fundamental flattens the swing at its extremes, against 0.02% at 10°. At 180° the orbit becomes the separatrix and the period grows without bound, since a pendulum balanced upside down never falls.

The same series explains why clockmakers kept their pendulums swinging through only a few degrees. At an amplitude of 2° the circular error is small, but it changes with the amplitude: a clock whose swing falls from 2.1° to 2° as its oil thickens gains 0.7 s a day. Huygens’ cheeks removed the error in principle [2], but it was the small, steady swing of the escapements of the next two centuries that removed it in practice.

Two effects we did not model deserve a word. The bob is not a point, and a sphere of radius $r$ on a wire of length $L$ swings like a simple pendulum of length $L\,(1 + \tfrac{2}{5}\,r^2/L^2)$, a correction of 0.023% in length and half that in period, below our scatter. Air drag lowers the amplitude by up to 4% over a run at large angles, as Newton measured and Stokes explained [8,9], which is why we report the mean amplitude of each run rather than the release angle.

## Conclusions

The period of a simple pendulum grows with the amplitude, slowly at first and then fast: by 0.19% at 10°, 1.7% at 30° and 18% at 90°. Three steps of the arithmetic–geometric mean give the exact value, and a one-metre pendulum on a bench confirms it to within the accuracy of a protractor. Below 23° the textbook formula is good to 1%; beyond that, a student can square the amplitude in degrees and divide by 50 to see how far off it is.

## Author contributions {style="back"}

M. O. and P. A. built the apparatus and timed the runs, T. H. wrote on clocks, and all three revised the article.

## Acknowledgements {style="back"}

We thank the Northgate College workshop, who made the pivot jaws, and two referees for their comments.

## Data availability {style="back"}

The photogate records of every run, and a spreadsheet that evaluates Eq. (6) in three rows, are published with this article as supplementary material.

## Competing interests {style="back"}

The authors declare no competing interests.

## References {style="back"}

:::paragraphs{style="references"}
[1] G. Galilei, *Discorsi e dimostrazioni matematiche intorno a due nuove scienze* (L. Elzevir, Leiden, 1638).

[2] C. Huygens, *Horologium oscillatorium* (F. Muguet, Paris, 1673).

[3] A.-M. Legendre, *Traité des fonctions elliptiques et des intégrales eulériennes*, vol. 2 (Huzard-Courcier, Paris, 1826).

[4] E. T. Whittaker and G. N. Watson, *A Course of Modern Analysis*, 4th ed. (Cambridge University Press, 1927).

[5] C. G. Carvalhaes and P. Suppes, Approximations for the period of the simple pendulum based on the arithmetic-geometric mean, *Am. J. Phys.* **76**, 1150–1154 (2008).

[6] R. A. Nelson and M. G. Olsson, The pendulum: rich physics from a simple system, *Am. J. Phys.* **54**, 112–121 (1986).

[7] H. Kater, An account of experiments for determining the length of the pendulum vibrating seconds in the latitude of London, *Phil. Trans. R. Soc. Lond.* **108**, 33–102 (1818).

[8] I. Newton, *Philosophiæ naturalis principia mathematica* (Royal Society, London, 1687), Book II.

[9] G. G. Stokes, On the effect of the internal friction of fluids on the motion of pendulums, *Trans. Camb. Phil. Soc.* **9**, 8–106 (1851).
:::

:::paragraphs{style="colophon"}
**Cite as** M. Oyelaran, T. Heikkinen and P. Anand, The period of a pendulum at large amplitudes, *Measure* **7**, 213–216 (2026), doi:10.5555/measure.7.3.213.

*Measure* is a fictional journal set for the Postext Cookbook: its authors, institutions and measurements are invented, while the physics and the references are real. Set in STIX Two Text, Schibsted Grotesk and Azeret Mono (SIL OFL). Text and figures: CC BY 4.0.
:::
