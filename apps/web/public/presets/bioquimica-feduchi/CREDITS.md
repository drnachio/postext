# Credits — Bioquímica Feduchi Capítulo 1

Showcase preset for the Postext sandbox: chapter 1 of a biochemistry textbook,
in its Spanish original and in an English translation made for this bundle.

## The book

- *Bioquímica. Conceptos esenciales*, 4.ª edición. E. Feduchi, C. Romero,
  E. Yáñez, I. Blasco, C. García-Hoz. Editorial Médica Panamericana.
- Chapter 1, «Las bases de la bioquímica» — section I, *Los materiales y
  funciones de la célula*.
- Text, figures, tables and page design © Editorial Médica Panamericana,
  reproduced here with the publisher's permission.

## The English edition

The chapter was translated for this bundle, along with everything the design
says in words: the captions and alt texts, the cell contents of the tables,
the callout titles ("KEY CONCEPTS", "LEARNING OBJECTIVES"…), the running
heads, the palette and resource-type names in the settings panel, and the
labels inside the figures.

Figure labels are translated in the artwork itself. The pictures are cut out
of the book PDF with their labels kept as live text, so an English label is a
real run of text in the document's own typefaces; where a label is drawn into
the picture instead of set as type — a word flattened into a placed image, or
converted to curves — it is taken out of the picture and set afresh (see
`translations/artwork.json`).

Two Spanish pictures the private bundle still carries (`recuadro-1-1-fig`,
`recuadro-1-2-fig`) are left out: nothing refers to them, a real table having
taken their place.

## Typefaces

Adobe Garamond Pro (body), Vectora LT Std (headings), DIN Pro (page furniture,
callouts, tables, figure labels), Optima (chapter and part titles) and Andale
Sans (figure labels), as the book sets them.

These are licensed typefaces, not open ones. The bundle carries them cut down
to the characters it can be edited in, as WOFF2, and declares them
`redistributable: false`: the sandbox sets the pages with them, and exporting
a project built from this bundle leaves the font files — and their `fonts[]`
entries — out. They remain the publisher's licensed faces; the flag is a
safeguard, not a licence.

## Build

`scripts/presets/showcase/bioquimica-feduchi/` in the Postext repository.
Unlike the other showcases this one downloads nothing: it reads the private
EMP bundle `emp/21x28-4c-colymedia` and the book PDF, whose locations
`fetch.py` reports. `figures.py` cuts the artwork; `build.py` assembles the
bundle; `translations/` holds the English wording.
