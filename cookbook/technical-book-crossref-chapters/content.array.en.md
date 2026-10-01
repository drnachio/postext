# The array {#sec:array lead="Panels are sized for December, when the days are short and the sun is low. In summer the same array makes twice what the cabin needs, and that is the price of a winter that works."}

@Sec:load ended with a daily load of 1,160 Wh, the total of @tbl:loads. This chapter finds the array that delivers that much on an average December day, after every loss between the panel and the socket.

## Sun hours by month {#sec:sun-hours}

The sunlight a site receives is given in peak sun hours: the number of hours at a standard intensity of 1,000 W/m² that would deliver the same energy as the whole day does. A panel rated at 300 W makes roughly 300 Wh for each peak sun hour, before losses. The figures come from a solar database for the site's coordinates and the panels' tilt; @fig:sun gives them for the example cabin, at 42° N with the panels tilted at 60°.

A steep tilt trades some summer yield for the low winter sun. Even so, December gets half the yield of July: 2.8 peak sun hours against 5.6. December is therefore the design month, and every calculation in this chapter uses its figure.

## Losses between panel and socket {#sec:losses}

Not all of the energy a panel makes reaches the sockets. Each stage between them takes a share, and the shares multiply. @Tbl:losses lists them for the example system.

The largest single loss is the inverter's, and it applies only to the loads that run on 230 V. In a cabin where the fridge, the pump and the lights all run on 24 V, the overall factor rises from 0.79 to about 0.85. The example keeps the inverter in the chain, because the laptop and the router need it and the calculation is safer that way. The battery's share is its round-trip loss, the energy that goes in and does not come out; it is small for lithium cells and larger for lead-acid, as @sec:chemistry explains on :ref{id="sec:chemistry" style=page}.

## Sizing the array {#sec:array-size}

The array must make the daily load, divided by the overall loss factor, in the peak sun hours of December:

:::paragraphs{style="formula"}
1,160 Wh ÷ (2.8 h × 0.79) = 524 W
:::

The example uses two panels of 310 W in series, 620 W in all, which leaves a margin of 18% for an old panel, a cloudy fortnight or a load that has grown.

The panels work between ten and four; the cabin, as @fig:profile shows, spends most of its energy after dark. How large the battery between them must be is the subject of @sec:battery.
