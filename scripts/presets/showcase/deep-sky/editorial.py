"""Editorial content of the `deep-sky` showcase preset: magazine strings,
the four sections, and per-release kicker, fact file and figure roles, in
Spanish and English. The articles themselves are the ESO / NSF NOIRLab
press releases (CC BY 4.0), parsed from the saved pages by build.py.
"""
from __future__ import annotations

BOOK = {
    "es": {
        "title": "Cielo profundo",
        "subtitle": "Ocho miradas al universo desde Chile",
        "issue": "Número 1 · Otoño de 2026",
        "publisher": "Con textos e imágenes de ESO y NSF NOIRLab",
        "editorial": "Editorial",
        "contents": "Sumario",
        "credits": "Créditos",
        "chapter_label": "{partTitle}",
        "part_label": "Sección {numberRoman}",
        "figure": ("Imagen", "Imágenes", "imagen"),
        "table": ("Tabla", "Tablas", "tabla"),
        "ficha": "De un vistazo",
        "source_line": "Nota de prensa {id} de {org}, {date}. Texto e imágenes bajo licencia CC BY 4.0.",
        "table_caption": "Las ocho observaciones de este número. :swatch{color=\"solar\"} Sistema solar · :swatch{color=\"stars\"} Estrellas · :swatch{color=\"galaxies\"} Galaxias · :swatch{color=\"cosmos\"} Cosmos.",
        "table_head": ["Reportaje", "Observatorio", "Objeto", "Distancia"],
        "org": {"eso": "ESO", "noirlab": "NSF NOIRLab"},
        "editorial_text": [
            "Este número de muestra reúne ocho notas de prensa publicadas entre 2023 y 2026 por el Observatorio Europeo Austral y por NSF NOIRLab, los dos grandes consorcios que operan telescopios desde los cielos de Chile. Todas ellas existen en español y en inglés y todas se publican bajo una licencia Creative Commons que permite reproducir textos e imágenes citando la fuente.",
            "Hemos ordenado las historias de dentro afuera: primero el sistema solar, con una mancha en Neptuno y un cometa venido de otra estrella; después las estrellas, con una supernova que estalló dos veces y un nido de soles recién nacidos; luego las galaxias, la del Escultor y la del Sombrero; y por último el cosmos, desde el agujero negro del centro de la Vía Láctea hasta el campo profundo que el Observatorio Rubin acaba de abrir.",
            "El propósito de la revista es enseñar lo que una maqueta de Postext puede hacer con material real: aperturas a sangre, columnas justificadas con partición silábica, imágenes que cruzan la página o se recogen en una columna, recuadros flotantes, citas destacadas, una tabla con celdas de color y un sumario que se numera solo.",
        ],
    },
    "en": {
        "title": "Deep Sky",
        "subtitle": "Eight views of the universe from Chile",
        "issue": "Issue 1 · Autumn 2026",
        "publisher": "With texts and images by ESO and NSF NOIRLab",
        "editorial": "Editorial",
        "contents": "Contents",
        "credits": "Credits",
        "chapter_label": "{partTitle}",
        "part_label": "Section {numberRoman}",
        "figure": ("Image", "Images", "image"),
        "table": ("Table", "Tables", "table"),
        "ficha": "At a glance",
        "source_line": "Press release {id} by {org}, {date}. Text and images licensed CC BY 4.0.",
        "table_caption": "The eight observations in this issue. :swatch{color=\"solar\"} Solar System · :swatch{color=\"stars\"} Stars · :swatch{color=\"galaxies\"} Galaxies · :swatch{color=\"cosmos\"} Cosmos.",
        "table_head": ["Feature", "Observatory", "Object", "Distance"],
        "org": {"eso": "ESO", "noirlab": "NSF NOIRLab"},
        "editorial_text": [
            "This sample issue gathers eight press releases published between 2023 and 2026 by the European Southern Observatory and by NSF NOIRLab, the two great consortia that operate telescopes under the skies of Chile. All of them exist in Spanish and in English, and all are published under a Creative Commons licence that allows text and images to be reproduced with credit.",
            "The stories run from the inside out: first the Solar System, with a spot on Neptune and a comet from another star; then the stars, with a supernova that exploded twice and a nest of newborn suns; then the galaxies, the Sculptor and the Sombrero; and finally the cosmos, from the black hole at the centre of the Milky Way to the deep field the Rubin Observatory has just opened.",
            "The magazine exists to show what a Postext layout can do with real material: full-bleed openers, justified columns with hyphenation, images that cross the page or sit in one column, floating boxes, pull quotes, a table with coloured cells and a contents page that numbers itself.",
        ],
    },
}

# Sections, in order; the band colour recolours every palette-linked design.
PARTS = [
    {"id": "solar", "number": "I", "band": "#c9702a", "title": {"es": "Sistema solar", "en": "Solar System"}},
    {"id": "stars", "number": "II", "band": "#b8413d", "title": {"es": "Estrellas", "en": "Stars"}},
    {"id": "galaxies", "number": "III", "band": "#2a7f97", "title": {"es": "Galaxias", "en": "Galaxies"}},
    {"id": "cosmos", "number": "IV", "band": "#5b4a9c", "title": {"es": "Cosmos", "en": "Cosmos"}},
]

# Releases in magazine order. `roles` maps image id → "hero" (page-wide
# opener), "page" (page-wide float), "column" (column float); the hero is
# also the cover of its section in the contents. Fact files are written
# for the preset from the releases' own data.
RELEASES = [
    {
        "id": "eso2314", "org": "eso", "part": "solar",
        "roles": {"eso2314a": "hero", "eso2314b": "column"},
        "ficha": {
            "es": [("Observatorio", "VLT de ESO, Cerro Paranal"), ("Instrumento", "MUSE con óptica adaptativa"), ("Objeto", "Neptuno"), ("Distancia", "4500 millones de km")],
            "en": [("Observatory", "ESO’s VLT, Cerro Paranal"), ("Instrument", "MUSE with adaptive optics"), ("Object", "Neptune"), ("Distance", "4.5 billion km")],
        },
        "row": {"es": ("Neptuno", "VLT · MUSE", "Neptuno", "4500 millones de km"), "en": ("Neptune", "VLT · MUSE", "Neptune", "4.5 billion km")},
    },
    {
        "id": "noirlab2532", "org": "noirlab", "part": "solar",
        "roles": {"noirlab2532b": "hero", "noirlab2532a": "column"},
        "ficha": {
            "es": [("Observatorio", "Gemini Norte, Maunakea"), ("Instrumento", "GMOS-N"), ("Objeto", "Cometa interestelar 3I/ATLAS"), ("Origen", "Otro sistema estelar")],
            "en": [("Observatory", "Gemini North, Maunakea"), ("Instrument", "GMOS-N"), ("Object", "Interstellar comet 3I/ATLAS"), ("Origin", "Another star system")],
        },
        "row": {"es": ("Cometa 3I/ATLAS", "Gemini Norte · GMOS", "3I/ATLAS", "Interestelar"), "en": ("Comet 3I/ATLAS", "Gemini North · GMOS", "3I/ATLAS", "Interstellar")},
    },
    {
        "id": "eso2511", "org": "eso", "part": "stars",
        "roles": {"eso2511a": "hero", "eso2511b": "column"},
        "ficha": {
            "es": [("Observatorio", "VLT de ESO"), ("Instrumento", "MUSE"), ("Objeto", "Resto de supernova SNR 0509-67.5"), ("Distancia", "160 000 años luz, Gran Nube de Magallanes")],
            "en": [("Observatory", "ESO’s VLT"), ("Instrument", "MUSE"), ("Object", "Supernova remnant SNR 0509-67.5"), ("Distance", "160,000 light-years, Large Magellanic Cloud")],
        },
        "row": {"es": ("Doble detonación", "VLT · MUSE", "SNR 0509-67.5", "160 000 años luz"), "en": ("Double detonation", "VLT · MUSE", "SNR 0509-67.5", "160,000 light-years")},
    },
    {
        "id": "noirlab2515", "org": "noirlab", "part": "stars",
        "roles": {"noirlab2515a": "hero", "noirlab2515b": "page", "noirlab2515c": "column"},
        "ficha": {
            "es": [("Observatorio", "Telescopio Blanco de 4 m, Cerro Tololo"), ("Instrumento", "Cámara de Energía Oscura (DECam)"), ("Objeto", "Nube molecular Circinus Oeste"), ("Distancia", "Unos 2500 años luz")],
            "en": [("Observatory", "Blanco 4-m Telescope, Cerro Tololo"), ("Instrument", "Dark Energy Camera (DECam)"), ("Object", "Circinus West molecular cloud"), ("Distance", "About 2,500 light-years")],
        },
        "row": {"es": ("Circinus Oeste", "Blanco · DECam", "Nube molecular", "2500 años luz"), "en": ("Circinus West", "Blanco · DECam", "Molecular cloud", "2,500 light-years")},
    },
    {
        "id": "eso2510", "org": "eso", "part": "galaxies",
        "roles": {"eso2510a": "hero", "eso2510b": "page"},
        "ficha": {
            "es": [("Observatorio", "VLT de ESO"), ("Instrumento", "MUSE, más de cien horas"), ("Objeto", "NGC 253, galaxia del Escultor"), ("Distancia", "11 millones de años luz")],
            "en": [("Observatory", "ESO’s VLT"), ("Instrument", "MUSE, over a hundred hours"), ("Object", "NGC 253, the Sculptor Galaxy"), ("Distance", "11 million light-years")],
        },
        "row": {"es": ("Galaxia del Escultor", "VLT · MUSE", "NGC 253", "11 millones de años luz"), "en": ("Sculptor Galaxy", "VLT · MUSE", "NGC 253", "11 million light-years")},
    },
    {
        "id": "noirlab2612", "org": "noirlab", "part": "galaxies",
        "roles": {"noirlab2612a": "hero", "noirlab2612b": "column"},
        "ficha": {
            "es": [("Observatorio", "Telescopio Blanco de 4 m, Cerro Tololo"), ("Instrumento", "DECam"), ("Objeto", "Messier 104, galaxia del Sombrero"), ("Distancia", "30 millones de años luz")],
            "en": [("Observatory", "Blanco 4-m Telescope, Cerro Tololo"), ("Instrument", "DECam"), ("Object", "Messier 104, the Sombrero Galaxy"), ("Distance", "30 million light-years")],
        },
        "row": {"es": ("Galaxia del Sombrero", "Blanco · DECam", "Messier 104", "30 millones de años luz"), "en": ("Sombrero Galaxy", "Blanco · DECam", "Messier 104", "30 million light-years")},
    },
    {
        "id": "eso2406", "org": "eso", "part": "cosmos",
        "roles": {"eso2406a": "hero", "eso2406b": "page"},
        "ficha": {
            "es": [("Observatorio", "Telescopio del Horizonte de Sucesos"), ("Técnica", "Interferometría en luz polarizada"), ("Objeto", "Sagitario A*"), ("Distancia", "27 000 años luz")],
            "en": [("Observatory", "Event Horizon Telescope"), ("Technique", "Interferometry in polarised light"), ("Object", "Sagittarius A*"), ("Distance", "27,000 light-years")],
        },
        "row": {"es": ("Sagitario A*", "EHT", "Agujero negro", "27 000 años luz"), "en": ("Sagittarius A*", "EHT", "Black hole", "27,000 light-years")},
    },
    {
        "id": "noirlab2618", "org": "noirlab", "part": "cosmos",
        "roles": {"noirlab2618a": "hero", "noirlab2618b": "page", "noirlab2618c": "column"},
        "ficha": {
            "es": [("Observatorio", "Observatorio Vera C. Rubin, Cerro Pachón"), ("Instrumento", "LSSTCam, 3200 megapíxeles"), ("Objeto", "Campo COSMOS, en Sextans"), ("Alcance", "Miles de millones de años luz")],
            "en": [("Observatory", "Vera C. Rubin Observatory, Cerro Pachón"), ("Instrument", "LSSTCam, 3,200 megapixels"), ("Object", "The COSMOS field, in Sextans"), ("Reach", "Billions of light-years")],
        },
        "row": {"es": ("Campo COSMOS", "Rubin · LSSTCam", "Campo profundo", "Miles de millones de años luz"), "en": ("COSMOS field", "Rubin · LSSTCam", "Deep field", "Billions of light-years")},
    },
]

# Paragraphs to drop from the body (leftover embargo notices).
DROP_PARAGRAPH_PREFIXES = ("De acuerdo con la política", "In accordance with the EHT", "Per the EHT")

COVER_BLURB = {
    "es": "Revista de muestra compuesta con Postext. Los textos son las notas de prensa originales de ESO y NSF NOIRLab, sin más cambios que la supresión de las secciones de contacto; las imágenes se reproducen con su línea de crédito completa, como exige la licencia CC BY 4.0.",
    "en": "A sample magazine set with Postext. The texts are the original ESO and NSF NOIRLab press releases, unchanged but for the removal of the contact sections; the images are reproduced with their full credit line, as the CC BY 4.0 licence requires.",
}

CREDITS = {
    "es": [
        "**Textos e imágenes.** Notas de prensa del Observatorio Europeo Austral (ESO) y de NSF NOIRLab, publicadas bajo la licencia Creative Commons Atribución 4.0 Internacional. Cada reportaje indica al pie su número de nota y su fecha; cada imagen lleva la línea de crédito que figura en su página de origen.",
        "**Traducciones.** Las versiones en español de ESO las realiza la red ESON (ESO Science Outreach Network); las de NOIRLab, su oficina de comunicación en Chile.",
        "**Tipografía.** Archivo y Chivo, de Omnibus-Type; Newsreader, de Production Type. Las tres familias se distribuyen bajo la SIL Open Font License 1.1.",
        "**Composición.** Página de 225 × 297 mm a dos columnas; aperturas con banda de sección, imágenes a página y a columna, recuadros y citas flotantes, tabla con celdas de color y sumario generado por Postext.",
    ],
    "en": [
        "**Texts and images.** Press releases of the European Southern Observatory (ESO) and NSF NOIRLab, published under the Creative Commons Attribution 4.0 International licence. Each feature gives its release number and date at the foot; each image carries the credit line printed on its source page.",
        "**Translations.** The Spanish versions of ESO releases are made by the ESO Science Outreach Network (ESON); those of NOIRLab by its communications office in Chile.",
        "**Type.** Archivo and Chivo by Omnibus-Type; Newsreader by Production Type. All three families are distributed under the SIL Open Font License 1.1.",
        "**Setting.** A 225 × 297 mm two-column page; section-banded openers, page-wide and column images, floating boxes and pull quotes, a table with coloured cells and a contents page generated by Postext.",
    ],
}
