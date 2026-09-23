# Credits — Señales 2020 / Signals 2020

Showcase preset for the Postext sandbox, re-setting *EEA Signals 2020 — Towards
zero pollution in Europe* (European Environment Agency, 2020) in Spanish and English.

## Text

© EEA, Copenhagen, 2020. "Reproduction is authorised, provided the source is
acknowledged, save where otherwise stated." Texts extracted from the official PDFs:

- English: https://www.eea.europa.eu/en/analysis/publications/signals-2020/signals-2020/@@download/file
- Spanish: https://www.eea.europa.eu/en/analysis/publications/signals-2020/spanish-pdf-senales-de-la-aema-2020/@@download/file

The original photographs (EEA REDISCOVER Nature competition entries and
Unsplash pictures with rights reserved) are **not** included; the infographics
are transcribed as text panels.

## Photographs (CC0, Unsplash uploads archived on Wikimedia Commons)

- `cover` — Copenhagen, Denmark (Unsplash A3Hbc08ZdlU).jpg — Sandro Katalina — CC0 — https://commons.wikimedia.org/wiki/File:Copenhagen,_Denmark_(Unsplash_A3Hbc08ZdlU).jpg
- `editorial` — Bike on street Copenhagen (Unsplash).jpg — Johan Mouchet — CC0 — https://commons.wikimedia.org/wiki/File:Bike_on_street_Copenhagen_(Unsplash).jpg
- `air-1` — In the morning traffic (Unsplash).jpg — Dan Gold danielcgold — CC0 — https://commons.wikimedia.org/wiki/File:In_the_morning_traffic_(Unsplash).jpg
- `air-2` — Skyscrapers in fog (Unsplash).jpg — Nick Hawkins nhawkns — CC0 — https://commons.wikimedia.org/wiki/File:Skyscrapers_in_fog_(Unsplash).jpg
- `water-1` — Clouds mirrored in a mountain lake (Unsplash).jpg — Ales Krivec — CC0 — https://commons.wikimedia.org/wiki/File:Clouds_mirrored_in_a_mountain_lake_(Unsplash).jpg
- `water-2` — Breaking waves (Unsplash zIU96X1f4pM).jpg — Joseph Milla — CC0 — https://commons.wikimedia.org/wiki/File:Breaking_waves_(Unsplash_zIU96X1f4pM).jpg
- `soil-1` — Castellina In Chianti (Unsplash).jpg — Rowan Heuvel insolitus — CC0 — https://commons.wikimedia.org/wiki/File:Castellina_In_Chianti_(Unsplash).jpg
- `soil-2` — Harvesting the Wheat Crop (Unsplash).jpg — meriç tuna tuna59 — CC0 — https://commons.wikimedia.org/wiki/File:Harvesting_the_Wheat_Crop_(Unsplash).jpg
- `chemicals-1` — Plants in beakers (Unsplash).jpg — chuttersnap — CC0 — https://commons.wikimedia.org/wiki/File:Plants_in_beakers_(Unsplash).jpg
- `chemicals-2` — Pile of graduated cylinders.jpg — chuttersnap — CC0 — https://commons.wikimedia.org/wiki/File:Pile_of_graduated_cylinders.jpg
- `polluter-1` — Sunset above power plant (Unsplash).jpg — Viktor Kiryanov vki — CC0 — https://commons.wikimedia.org/wiki/File:Sunset_above_power_plant_(Unsplash).jpg
- `polluter-2` — Power Plant (Unsplash).jpg — Scott Webb — CC0 — https://commons.wikimedia.org/wiki/File:Power_Plant_(Unsplash).jpg
- `industry-1` — Powerhouse (Unsplash).jpg — Kartik Bhattacharjee — CC0 — https://commons.wikimedia.org/wiki/File:Powerhouse_(Unsplash).jpg
- `industry-2` — Wind Turbines (Unsplash).jpg — Jason Blackeye jeisblack — CC0 — https://commons.wikimedia.org/wiki/File:Wind_Turbines_(Unsplash).jpg
- `noise-1` — Car trails on the Highway, Delyan, Bulgaria (Unsplash).jpg — Viktor Kiryanov vki — CC0 — https://commons.wikimedia.org/wiki/File:Car_trails_on_the_Highway,_Delyan,_Bulgaria_(Unsplash).jpg
- `noise-2` — Airplane over white buildings (Unsplash).jpg — Luca Bravo — CC0 — https://commons.wikimedia.org/wiki/File:Airplane_over_white_buildings_(Unsplash).jpg
- `health-1` — Walk in a thawing forest (Unsplash).jpg — Hannah Donze — CC0 — https://commons.wikimedia.org/wiki/File:Walk_in_a_thawing_forest_(Unsplash).jpg
- `health-2` — Biking through Edinburgh (Unsplash).jpg — Clem Onojeghuo clemono2 — CC0 — https://commons.wikimedia.org/wiki/File:Biking_through_Edinburgh_(Unsplash).jpg

## Fonts (SIL Open Font License 1.1)

- Open Sans — Steve Matteson (`fonts/OpenSans-OFL.txt`)
- Outfit — Rodrigo Fuenzalida (`fonts/Outfit-OFL.txt`)

## Build

`scripts/presets/showcase/senales/` in the Postext repository: `fetch.py` downloads the
PDFs, photographs and fonts; `extract.py` reads the articles by type role; `build.py`
writes this bundle.
