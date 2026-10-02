# The daily load {#sec:load lead="Every component of an off-grid system is sized from one number: the energy the cabin uses on a winter day. Get it wrong and nothing downstream can put it right."}

A solar system for a cabin is sized backwards. You start at the sockets, add up what the cabin draws in a day, and only then work out how many panels and batteries it takes to supply that much in the worst month of the year. This chapter arrives at that number: 1,159 watt-hours a day, which the rest of the book rounds to 1,160. @Sec:array turns it into panels, and @sec:battery into batteries.

The example is a stone cabin of 48 m² at 1,100 m in a valley that faces south-east, used every weekend and for three weeks in winter. Heating and cooking are wood and bottled gas; electricity runs the lights, a fridge, a water pump, a laptop and a router.

## Listing the loads {#sec:load-list}

Walk round the cabin with a notebook and write down everything that plugs in or is wired in, with its power in watts and the hours it runs on a winter day. The power is on the rating plate or in the manual; for anything with a motor or a compressor, a plug-in meter left for a day gives a truer figure than the plate. @Tbl:loads is the list for the example cabin.

Two lines in the table are easy to forget. The inverter, which turns the battery's 24 volts into 230 volts for the sockets, draws 8 W from the moment it is switched on, whether anything is plugged in or not: over a day that is more than the lights. The router runs all night as well. Both are worth a timer or a switch by the door, and the saving is worked out in @sec:winter-margin.

The fridge figure needs care. A chest fridge of 100 litres draws 55 W while its compressor runs, and in a cool cabin the compressor runs about five hours in twenty-four. In August it may run nine, but August is not the month that sizes the system, as @sec:sun-hours shows on :ref{id="sec:sun-hours" style=page}.

## When the energy is used {#sec:load-profile}

The total says how much energy the cabin needs; it does not say when. @Fig:profile spreads the same 1,160 Wh over the hours of a winter day. The fridge, the router and the inverter make a floor of about 27 W that never goes away. The laptop adds a block in the morning, and the evening brings the largest draw of the day, when lights, the stove fan and the pump run together after sunset.

That evening peak matters more than its size suggests. Almost all of it falls after the sun has gone, so none of it can come straight from the panels: it is drawn from the battery and paid back the next day. The battery bank in @sec:autonomy is sized for exactly this, and for the days when the sun does not pay it back at all.

## The winter margin {#sec:winter-margin}

A list made in October is a guess about January. Lights run longer in midwinter, guests come at New Year, and someone always brings a hair dryer. Rather than pad every line of @tbl:loads, keep the list honest and add the margin once, at the end, where it can be seen.

For a weekend cabin a margin of 15% is enough, and the example takes it from the loads themselves rather than adding it on top: switching the inverter and the router off at night saves 8 W and 8 W for ten hours, 160 Wh a day, close to 14% of the total. The system is sized for the full 1,160 Wh, and the habit of the switch by the door is the margin.

With the load fixed, the next question is how much of it the sun can supply in the darkest month. That is the work of @sec:array, which starts from the sun hours of the site on :ref{id="sec:sun-hours" style=page}.
