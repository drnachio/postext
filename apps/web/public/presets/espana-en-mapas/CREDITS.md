# Credits — España en mapas

Showcase preset for the Postext sandbox, built from the Atlas Nacional de
España (IGN / CNIG), chapter *Referencias históricas* (2023) and its English
edition *Historical overview* (2024):

- https://www.ign.es/web/resources/docs/IGNCnig/ANE/Capitulos/06_Referenciashistoricas_2023.pdf
- https://www.ign.es/web/resources/docs/IGNCnig/ANE/Capitulos/06_Historicaloverview_2024.pdf

Licence printed on the atlas's credits page: **CC BY 4.0 ign.es** (Creative
Commons Attribution 4.0 International; Orden FOM/2807/2015). Required
attribution: "Atlas Nacional de España (ANE) CC BY 4.0 ign.es".

## What the bundle contains

- Body text, section headings and photo captions extracted by role from the
  InDesign PDFs (`extract.py`); indices, bibliography and participants left out.
- Maps: 67 (Spanish) and 66 (English) vector maps rasterised
  as crops of the original pages at 165 dpi, each keeping its scientific
  compilation and source line. 7 photographs pulled from the pages.
- Wording written for the preset (introduction, credits, part numbers) is CC BY 4.0.

## Fonts (SIL Open Font License 1.1)

- Source Sans 3 — Paul D. Hunt, Adobe (`fonts/SourceSans3-OFL.txt`)
- Archivo — Omnibus-Type (`fonts/Archivo-OFL.txt`)

## Build

`scripts/presets/showcase/espana-en-mapas/` in the Postext repository:
`fetch.py` downloads the two PDFs and the fonts, `build.py` writes this bundle.
