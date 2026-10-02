# The battery bank {#sec:battery lead="The battery carries the cabin through every night and through the grey days when the panels make almost nothing. Its size is a choice about how many such days in a row you will accept."}

The array of @sec:array-size works between ten and four, the cabin mostly after dark, and on an overcast December day the 2.8 peak sun hours of @fig:sun fall to half an hour or less. The battery bank bridges both gaps.

## Days of autonomy {#sec:autonomy}

Autonomy is the number of days the bank can run the cabin with no sun at all. Three days is usual for a cabin in a valley with fog, and it is what the example uses:

:::paragraphs{style="formula"}
3 days × 1,160 Wh = 3,480 Wh usable
:::

The daily load is the total of @tbl:loads, without the margin of @sec:winter-margin (:ref{id="sec:winter-margin" style=page}), which stays in reserve. How far a bank may be drawn down depends on its chemistry.

## Choosing a chemistry {#sec:chemistry}

@Tbl:chemistry compares the three chemistries sold for small off-grid systems. Lithium iron phosphate (LiFePO4) cells can be drawn down to 20% every night for thousands of cycles. Lead-acid batteries last longest when they are never taken below half their charge, so the same usable energy needs a bank about 60% larger, and five times the weight to carry up the track.

The round trip matters too. The overall factor of 0.79 in @tbl:losses assumes the lithium bank's 0.95. With an AGM bank at 0.85 the factor falls to 0.71, and the formula of @sec:array-size asks for 586 W instead of 524 W. The two 310 W panels still cover it, with a margin of 6% instead of 18%. Change the battery, and tables [-@tbl:losses] and [-@tbl:chemistry] must be read again together.

The example cabin uses a LiFePO4 bank of 200 Ah at 25.6 V: 5.1 kWh nominal, 4.1 kWh usable, a little more than three days.

## A week of cloud {#sec:cloud-week}

@Fig:soc follows the bank's state of charge through five December days: one clear, three overcast at about half a peak sun hour, and a clear day to finish. The bank starts at 80%, rises to 94% on the first afternoon and then loses about 17% a day, with a dip each evening from the peak of @fig:profile. At its lowest, on the last night of cloud, it holds 27%, above the 20% floor.

The figure also shows the weakness of sizing for the average December day. On a clear day the array makes about 1,370 Wh after losses, only 210 Wh more than the cabin uses, so a bank drawn down by three grey days takes some twelve clear days to fill again. A third panel, on a controller of its own, raises the surplus of a clear day from 210 Wh to about 900 Wh; a small petrol generator with a charger refills the bank in an afternoon.
